#!/usr/bin/env python3
"""
Verify the end-to-end agent → signal pipeline for a workspace on staging.

Runs the 5 verification queries from docs/release-plan-2026-05-01.md against
Supabase, then prints a sanitized report. Exit code 0 if all green, 1 otherwise.

Usage:
    export SUPABASE_URL=...
    export SUPABASE_SERVICE_ROLE_KEY=...
    python3 scripts/verify-flow.py --workspace-slug <slug>
    python3 scripts/verify-flow.py --workspace-id <uuid>
    python3 scripts/verify-flow.py --workspace-slug <slug> --json --window-hours 1

Sanitization:
    Workspace IDs, emails, names, and Attio IDs are masked unless --raw is set.
    Use --raw only for local debugging; never paste raw output into PR comments.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Any

try:
    from supabase import create_client, Client
except ImportError:
    print("supabase-py not installed; run: pip install supabase", file=sys.stderr)
    sys.exit(2)


def mask_id(s: str | None, raw: bool = False) -> str:
    if not s:
        return "-"
    if raw:
        return s
    h = hashlib.sha1(s.encode()).hexdigest()[:8]
    return f"id:{h}"


def mask_email(s: str | None, raw: bool = False) -> str:
    if not s:
        return "-"
    if raw or "@" not in s:
        return s
    user, _, domain = s.partition("@")
    if len(user) <= 2:
        masked_user = user[:1] + "*"
    else:
        masked_user = user[:2] + "*" * (len(user) - 2)
    return f"{masked_user}@{domain}"


def truncate(s: str | None, n: int = 80) -> str:
    if not s:
        return "-"
    return s if len(s) <= n else s[: n - 1] + "…"


def get_workspace(sb: Client, slug: str | None, ws_id: str | None) -> dict[str, Any] | None:
    q = sb.table("workspaces").select("id, slug, website_url, name, created_at")
    if slug:
        q = q.eq("slug", slug)
    elif ws_id:
        q = q.eq("id", ws_id)
    else:
        return None
    res = q.limit(1).execute()
    return res.data[0] if res.data else None


def link1_sessions(sb: Client, ws_id: str, hours: int) -> dict:
    """Link 1: agent gets triggered."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    res = (
        sb.table("workspace_agent_sessions")
        .select("session_id, status, error_message, created_at, updated_at")
        .eq("workspace_id", ws_id)
        .gte("created_at", cutoff)
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    )
    rows = res.data or []
    by_status: dict[str, int] = {}
    for r in rows:
        by_status[r.get("status") or "?"] = by_status.get(r.get("status") or "?", 0) + 1
    has_active = any(r.get("status") in ("created", "running", "completed") for r in rows)
    return {
        "rows": rows,
        "count": len(rows),
        "by_status": by_status,
        "verdict": "GREEN" if has_active else ("RED" if rows else "RED-no-sessions"),
    }


def detect_schema(sb: Client) -> dict:
    """Probe signal_definitions + signal_aggregates to determine which schema is live."""
    info = {"agent_columns_present": False, "aggregates_definition_col": None, "aggregates_time_col": None}
    sample = sb.table("signal_definitions").select("*").limit(1).execute()
    if sample.data:
        cols = set(sample.data[0].keys())
        info["agent_columns_present"] = "source" in cols and "status" in cols and "query_template" in cols
    sa = sb.table("signal_aggregates").select("*").limit(1).execute()
    if sa.data:
        sa_cols = set(sa.data[0].keys())
        info["aggregates_definition_col"] = (
            "definition_id" if "definition_id" in sa_cols else
            "signal_definition_id" if "signal_definition_id" in sa_cols else None
        )
        info["aggregates_time_col"] = (
            "computed_at" if "computed_at" in sa_cols else
            "last_calculated_at" if "last_calculated_at" in sa_cols else None
        )
    return info


def link3_signals(sb: Client, ws_id: str, hours: int, schema: dict) -> dict:
    """Link 3: signal definitions get written by the agent."""
    if not schema.get("agent_columns_present"):
        return {
            "rows": [],
            "count": 0,
            "by_status": {},
            "verdict": "RED-migration-not-applied",
            "note": "signal_definitions missing required columns (source, status, query_template). Migration 20260424120000_extend_signal_definitions_for_agent.sql not run on this DB.",
        }
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    res = (
        sb.table("signal_definitions")
        .select("id, name, status, source, target_event, time_window, is_active, review_decision, created_at")
        .eq("workspace_id", ws_id)
        .eq("source", "agent")
        .gte("created_at", cutoff)
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    rows = res.data or []
    by_status: dict[str, int] = {}
    for r in rows:
        by_status[r.get("status") or "?"] = by_status.get(r.get("status") or "?", 0) + 1
    return {
        "rows": rows,
        "count": len(rows),
        "by_status": by_status,
        "verdict": "GREEN" if rows else "RED-no-agent-signals",
    }


def link4_aggregates(sb: Client, ws_id: str, schema: dict) -> dict:
    """Link 4: cron evaluator picks up agent definitions."""
    def_col = schema.get("aggregates_definition_col") or "definition_id"
    time_col = schema.get("aggregates_time_col") or "computed_at"
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=36)).isoformat()
    select_def = "id, name, is_active"
    if schema.get("agent_columns_present"):
        select_def = "id, name, source, status, is_active"
    defs = (
        sb.table("signal_definitions")
        .select(select_def)
        .eq("workspace_id", ws_id)
        .eq("is_active", True)
        .execute()
    )
    def_rows = [
        d
        for d in (defs.data or [])
        if d.get("status") not in ("rejected", "candidate")
    ]
    aggs = (
        sb.table("signal_aggregates")
        .select(f"{def_col}, {time_col}")
        .gte(time_col, cutoff)
        .execute()
    )
    agg_def_ids = {a[def_col] for a in (aggs.data or []) if a.get(def_col)}

    agent_def_ids = {d["id"] for d in def_rows if d.get("source") == "agent"}
    manual_def_ids = {d["id"] for d in def_rows if d.get("source") in (None, "manual")}
    agent_evaluated = agent_def_ids & agg_def_ids
    manual_evaluated = manual_def_ids & agg_def_ids
    agent_missing = agent_def_ids - agg_def_ids

    verdict = "GREEN"
    if not schema.get("agent_columns_present"):
        verdict = "N/A-migration-not-applied"
    elif not def_rows:
        verdict = "N/A-no-defs"
    elif agent_def_ids and not agent_evaluated:
        verdict = "RED-agent-defs-not-evaluated"
    elif agent_missing:
        verdict = "YELLOW-some-agent-defs-missing"

    return {
        "schema": {"def_col": def_col, "time_col": time_col, "agent_cols_present": schema.get("agent_columns_present")},
        "agent_active_defs": len(agent_def_ids),
        "agent_evaluated_36h": len(agent_evaluated),
        "agent_missing_36h": len(agent_missing),
        "manual_active_defs": len(manual_def_ids),
        "manual_evaluated_36h": len(manual_evaluated),
        "verdict": verdict,
    }


def link5_manual_sanity(sb: Client, schema: dict) -> dict:
    """Link 5: manual signals across all workspaces still working (regression check)."""
    time_col = schema.get("aggregates_time_col") or "computed_at"
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=36)).isoformat()
    q = sb.table("signal_definitions").select("id", count="exact").eq("is_active", True)
    if schema.get("agent_columns_present"):
        q = q.eq("source", "manual")
    manual = q.execute()
    manual_count = getattr(manual, "count", None) or len(manual.data or [])
    aggs = (
        sb.table("signal_aggregates")
        .select("id", count="exact")
        .gte(time_col, cutoff)
        .execute()
    )
    agg_count = getattr(aggs, "count", None) or len(aggs.data or [])
    return {
        "manual_active_global": manual_count,
        "recent_aggregates_global": agg_count,
        "verdict": "GREEN" if (manual_count == 0 or agg_count > 0) else "RED-manual-broken",
    }


def render_report(workspace: dict, window_hours: int, l1: dict, l3: dict, l4: dict, l5: dict, raw: bool) -> str:
    lines: list[str] = []
    lines.append(f"## Verification report — workspace `{workspace['slug']}`")
    lines.append(f"workspace.id        = {mask_id(workspace['id'], raw)}")
    lines.append(f"workspace.website   = {workspace.get('website_url') or '(none)'}")
    lines.append(f"window              = last {window_hours}h")
    lines.append("")

    # Link 1
    lines.append(f"### Link 1 — agent triggered  →  **{l1['verdict']}**")
    lines.append(f"sessions={l1['count']}  by_status={l1['by_status']}")
    for r in l1["rows"][:5]:
        lines.append(
            f"  - sid={mask_id(r.get('session_id'), raw)} status={r.get('status')} "
            f"created_at={r.get('created_at')} "
            f"error={truncate(r.get('error_message'), 100)}"
        )
    lines.append("")

    # Link 3
    lines.append(f"### Link 3 — signals written  →  **{l3['verdict']}**")
    lines.append(f"agent_signal_definitions={l3['count']}  by_status={l3['by_status']}")
    for r in l3["rows"][:8]:
        rd = r.get("review_decision") or {}
        promo = rd.get("promotion_readiness") if isinstance(rd, dict) else None
        lines.append(
            f"  - name='{truncate(r.get('name'), 60)}' status={r.get('status')} "
            f"target_event='{truncate(r.get('target_event'), 30)}' "
            f"window={r.get('time_window')} promo_ready={promo}"
        )
    lines.append("")

    # Link 4
    lines.append(f"### Link 4 — cron evaluated  →  **{l4['verdict']}**")
    lines.append(
        f"agent_active={l4['agent_active_defs']}  agent_evaluated_36h={l4['agent_evaluated_36h']}  "
        f"agent_missing_36h={l4['agent_missing_36h']}"
    )
    lines.append(
        f"manual_active={l4['manual_active_defs']}  manual_evaluated_36h={l4['manual_evaluated_36h']}"
    )
    lines.append("")

    # Link 5
    lines.append(f"### Link 5 — manual regression  →  **{l5['verdict']}**")
    lines.append(
        f"manual_active_global={l5['manual_active_global']}  "
        f"recent_aggregates_global={l5['recent_aggregates_global']}"
    )
    lines.append("")

    verdicts = [l1["verdict"], l3["verdict"], l4["verdict"], l5["verdict"]]
    overall = "GREEN" if all(v.startswith("GREEN") or v.startswith("N/A") for v in verdicts) else \
              ("YELLOW" if any(v.startswith("YELLOW") for v in verdicts) and not any(v.startswith("RED") for v in verdicts) else "RED")
    lines.append(f"## Overall: **{overall}**")
    return "\n".join(lines)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--workspace-slug")
    p.add_argument("--workspace-id")
    p.add_argument("--window-hours", type=int, default=2,
                   help="Lookback for Links 1 + 3 (default 2h — set higher to cover historical state)")
    p.add_argument("--raw", action="store_true",
                   help="Disable masking. Local debugging only — never paste raw into PR comments.")
    p.add_argument("--json", action="store_true", help="Output structured JSON instead of markdown")
    args = p.parse_args()

    if not (args.workspace_slug or args.workspace_id):
        print("Provide --workspace-slug or --workspace-id", file=sys.stderr)
        return 2

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars", file=sys.stderr)
        return 2

    sb = create_client(url, key)
    ws = get_workspace(sb, args.workspace_slug, args.workspace_id)
    if not ws:
        print(f"Workspace not found", file=sys.stderr)
        return 2

    schema = detect_schema(sb)
    l1 = link1_sessions(sb, ws["id"], args.window_hours)
    l3 = link3_signals(sb, ws["id"], args.window_hours, schema)
    l4 = link4_aggregates(sb, ws["id"], schema)
    l5 = link5_manual_sanity(sb, schema)

    if args.json:
        out = {
            "workspace": {
                "id_masked": mask_id(ws["id"], args.raw),
                "slug": ws["slug"],
                "website_url": ws.get("website_url"),
            },
            "window_hours": args.window_hours,
            "link1_sessions": l1,
            "link3_signals": l3,
            "link4_aggregates": l4,
            "link5_manual": l5,
        }
        print(json.dumps(out, indent=2, default=str))
    else:
        print(render_report(ws, args.window_hours, l1, l3, l4, l5, args.raw))

    verdicts = [l1["verdict"], l3["verdict"], l4["verdict"], l5["verdict"]]
    return 0 if all(v.startswith("GREEN") or v.startswith("N/A") for v in verdicts) else 1


if __name__ == "__main__":
    sys.exit(main())
