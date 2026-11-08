# PRD — HubSpot Integration, PR3: "Make It Usable"

**Status:** Draft for design → implementation
**Author:** Vlad (via Claude Code)
**Date:** 2026-05-21
**Repo:** `getbeton/inspector`
**Depends on:** PR #90 (SourceAdapter framework) + PR #91 (HubSpot connector port) merged to `staging`
**Supersedes:** PR #69 (`feature/BETON-hubspot-foundation`) — close, do not merge

---

## 1. Background & problem

PRs #90 and #91 land the **backend foundation** for HubSpot but **no customer-facing path**. After they merge, a customer still cannot use HubSpot: there is no UI to connect it, the field-mapping screens render Attio data regardless of which integration you open, signals never get written to HubSpot, and no HubSpot data is ever pulled into the warehouse.

Both adapters are **already fully implemented and unit-tested** — this is the key constraint that makes PR3 small. PR3 is **wiring + UI**, not building connectors. Specifically:

- **Destination adapter** (`src/lib/field-mapping/hubspot-adapter.ts`) — `listObjects`, `listFields` (live property fetch), `fetchSampleSubjects`, `sendTest` (real upsert). ✅ Done.
- **Source adapter** (`src/lib/integrations/hubspot/source-adapter.ts`) — `testConnection`, `listObjects`, `listFields`, `listRecords` (cursor + `updatedAt` watermark). ✅ Done.
- **Connect endpoint** (`POST /api/integrations/hubspot/validate`) — validates token, encrypts, upserts to `integration_configs`. ✅ Done.
- **Field-mapping config endpoint** (`GET/PUT /api/integrations/[name]/field-mappings`) — already dispatches Attio **and** HubSpot. ✅ Done.

### What's missing (verified against the merged branch)

| Gap | Evidence | Workstream |
|---|---|---|
| No connect UI / wizard step | `git grep -i hubspot` over all `.tsx` → **0 hits**. `integration_definitions.setup_step_key='hubspot'` maps to a component that doesn't exist. | WS1 |
| Field-mapping page is Attio-hardcoded | `settings/integrations/[name]/field-mapping/page.tsx:33` → `createAttioAdapter(...)` regardless of `[name]`. | WS2 |
| 3 sibling routes Attio-hardcoded | `preview-impact/route.ts:66`, `sample-subjects/route.ts:39`, `send-test/route.ts:46` all `createAttioAdapter(...)`. | WS2 |
| Signals never written to HubSpot | `cron/sync-signals/route.ts:140` only handles `target_type === 'attio_list'`. New-signal UI (`signals/new/page.tsx:257`) hardcodes `type:'attio_list'`. `VALID_TARGET_TYPES` (`signals/custom/route.ts:46`) = `{posthog_cohort, attio_list}`. | WS3 |
| Read/sync-in never runs | HubSpot source adapter is never `registerSourceAdapter()`'d; nothing calls `listRecords`. No orchestrator lands records. | WS4 |

---

## 2. Goals & non-goals

### Goals
1. A customer connects HubSpot through the UI with a Private App token — no curl, no engineer.
2. A customer maps Beton signals to HubSpot objects (contacts / companies / deals) through the existing field-mapping UI.
3. Detected signals are written **out** to HubSpot (contacts/companies/deals + Beton properties).
4. HubSpot CRM records are pulled **in** to the warehouse on a schedule, incrementally.

### Non-goals (explicitly out of scope for PR3)
- OAuth connect flow. PR3 ships **Private App token** only; the validate endpoint already notes OAuth is a separate follow-up.
- New adapter capabilities — both adapters are complete; do not extend their interfaces.
- Migrating any code from PR #69. Its `polling.ts` / `hubspot_*` tables are the wrong architecture; rebuild the sync runner on the SourceAdapter instead.
- Self-hosted HubSpot (the integration is registered `supports_self_hosted=false`).

---

## 3. Users & primary use cases

- **RevOps admin (setup):** "Connect our HubSpot, map which signals push to which objects."
- **RevOps admin (steady state):** "When an account hits an M75 signal, create/update the company in HubSpot and stamp the Beton score."
- **Analyst (read):** "I want HubSpot deal + contact data alongside PostHog events in the warehouse so signal detection can use it."

---

## 4. Phasing

PR3 splits into two independently shippable products:

- **Phase A (write-back) = WS1 + WS2 + WS3.** Connect → map → push signals to HubSpot. This is a complete, usable v1 on its own.
- **Phase B (sync-in) = WS4.** Pull HubSpot records into the warehouse (the deferred "F1 runs" orchestrator).

Ship Phase A first. Phase B can be a separate PR.

---

## 5. Workstreams

### WS1 — Connect UI + wizard step  *(net-new; the main design surface)*

The setup wizard (`src/components/setup/SetupWizard.tsx`) is driven by `integration_definitions` from the DB and a `switch` on `setup_step_key` in `renderStep()` (line 410: existing cases `posthog`, `attio`, `attio_mapping`, `website`, `billing`, `firecrawl`, `postgres`). HubSpot is already registered in the DB (PR #91 migration, `setup_step_key='hubspot'`, `display_order=25`) but has no case and no component.

**Build:**
1. `src/components/setup/steps/HubSpotStep.tsx` — token-entry connect step. **Mirror `FirecrawlStep.tsx` / `PostHogStep.tsx`** in structure (the closest analogs — both take an API key and POST to a `/validate` endpoint).
2. `src/components/setup/previews/HubSpotPreview.tsx` — right-panel preview. **Mirror `previews/AttioConnectionPreview.tsx`** (connected-CRM look).
3. `src/components/setup/steps/HubSpotFieldMappingStep.tsx` *(optional, for in-wizard mapping)* — mirror `AttioFieldMappingStep.tsx`. If included, register a `hubspot_mapping` step key too.
4. Wire into `SetupWizard.tsx`: import the step, add `case "hubspot":` (and optionally `case "hubspot_mapping":`) to `renderStep()`, and add HubSpot to the definitions lookup block (around line 241–245, alongside `posthog`/`attio`/`firecrawl`).
5. Surface a "Connect HubSpot" entry point in the settings/integrations area for post-onboarding connection (there is currently **no** per-integration management page beyond field-mapping — see Open Question Q3).

**Design requirements for `HubSpotStep`:**
- Single secret input: **HubSpot Private App token** (`pat-...`), masked with show/hide toggle (reuse the `Eye`/`EyeOff` pattern from `FirecrawlStep`).
- Helper copy + link: how to create a Private App + the **required scopes** (engineer to confirm exact scope list; at minimum CRM read/write for contacts, companies, deals). Include a "where do I find this?" link to HubSpot docs.
- States (reuse `StepState = 'idle' | 'validating' | 'success' | 'error'`):
  - **idle** — input + Connect button (disabled until non-empty).
  - **validating** — spinner, "Connecting to HubSpot…".
  - **success** — green check; if `validate` returned `hub_id`, show "Connected to Hub <id>"; advance via `onSuccess()`.
  - **error** — `Alert` with the API's `error.message` (e.g. "Could not connect to HubSpot. Verify the token and its scopes."). Map `429` to a friendly "Too many attempts, wait a minute" (the endpoint rate-limits at 10/min **before** auth).
- **Skip** button (`onSkip`) — HubSpot is optional (`required=false`).
- Calls: `POST /api/integrations/hubspot/validate` with `{ "token": "<pat>" }`, `credentials: 'include'`. Response success `{success:true,message}`, error `{success:false,error:{code,message}}`.
- Fire the existing analytics events (`trackIntegrationConnected` / `trackIntegrationConnectionFailed`) like `FirecrawlStep` does.

**Acceptance:** A logged-in user opens the wizard (or settings), enters a valid Private App token, sees success, and the integration shows `status='connected'` in `integration_configs`. No curl.

---

### WS2 — Destination dispatch in the 4 Attio-hardcoded surfaces  *(small, mechanical)*

The new `field-mappings/route.ts` already has the correct pattern:

```ts
function adapterFor(destination: Destination, ctx): DestinationAdapter {
  if (destination === 'attio') return createAttioAdapter({ supabase: ctx.supabase })
  if (destination === 'hubspot') return createHubSpotDestinationAdapter({ supabase: ctx.supabase })
  throw new Error(`No adapter for destination "${destination}"`)
}
```

Apply the same dispatch (don't duplicate — extract a shared `adapterFor(name, ctx)` helper into `src/lib/field-mapping/index.ts` and reuse it) in:

1. `src/app/(dashboard)/settings/integrations/[name]/field-mapping/page.tsx:33` — currently `createAttioAdapter`. Use `[name]` to pick the adapter.
2. `src/app/api/integrations/[name]/preview-impact/route.ts:66`.
3. `src/app/api/integrations/[name]/sample-subjects/route.ts:39`.
4. `src/app/api/integrations/[name]/send-test/route.ts:46`.

No UI redesign — the field-mapping screen is destination-agnostic once the adapter is routed. The HubSpot destination adapter already implements every method these routes call (`listObjects`, `listFields`, `fetchSampleSubjects`, `sendTest`).

**Design note:** the field-mapping page must show HubSpot-native objects (contacts/companies/deals) and properties. No new design needed — verify the existing layout reads well with HubSpot labels. Confirm the "not connected" → redirect-to-setup behavior points HubSpot users to the new WS1 step.

**Acceptance:** `/settings/integrations/hubspot/field-mapping` loads HubSpot objects + properties; "preview impact", "sample subjects", and "send test" all execute against HubSpot. A test-send creates/updates a real HubSpot record (the adapter's `sendTest` already does the upsert).

---

### WS3 — `hubspot` signal target (write-out execution)  *(backend + small UI)*

Today a signal can target a `posthog_cohort` or `attio_list`. Add HubSpot as a third target type so detected signals write to HubSpot.

**Backend:**
1. `src/app/api/signals/custom/route.ts:46` — extend `VALID_TARGET_TYPES` to include the new type (proposed: `'hubspot'`; engineer to confirm naming vs. `'hubspot_object'`).
2. `src/app/api/cron/sync-signals/route.ts:134` — add an `else if (target.target_type === 'hubspot')` branch that loads HubSpot credentials (`getIntegrationCredentialsAdmin(..., 'hubspot')`) and writes via the destination adapter / `entities.ts` (`upsertContact` / `upsertCompany` / `createDeal`, `ensureBetonProperties`). Mirror the Attio branch directly above it (lines 140–156).
3. Persist target config (which object type, which mapping) consistent with how `attio_list` stores its target metadata.

**UI:**
4. `src/app/(dashboard)/signals/new/page.tsx:257` — the new-signal form hardcodes `type: 'attio_list'`. Add a **destination/target picker** so the user chooses PostHog / Attio / **HubSpot**, and for HubSpot picks the object type (contact/company/deal). Only show HubSpot when it's connected.

**Design requirements:** a destination selector on the new-signal screen — segmented control or dropdown listing connected destinations with their icons. For HubSpot, a secondary selector for object type. Mirror the existing Attio target affordance.

**Acceptance:** Create a signal with a HubSpot target → when it fires, `sync-signals` writes the mapped contact/company/deal to HubSpot with Beton properties stamped.

---

### WS4 — Register source adapter + read orchestrator (Phase B)  *(largest backend; no/little UI)*

This is the capability PR #69's `polling.ts` had, rebuilt on the SourceAdapter framework.

1. **Register** the HubSpot source adapter at module load: `registerSourceAdapter(hubspotSourceAdapter)` so `getSourceAdapter('hubspot')` resolves (currently throws `SourceAdapterNotFoundError`).
2. **Orchestrator** ("F1 runs"): per workspace + object, call `listRecords(workspaceId, object, { since: watermark, cursor })`, paginate via `nextCursor`, land records into the warehouse, persist `maxUpdatedAt` as the next watermark in `config_json`.
3. **Schedule** it via a cron route (mirror `cron/signal-detection` / `cron/sync-signals` auth via `CRON_SECRET`). Decide cadence + per-workspace concurrency.
4. **Warehouse landing target** — define where source records land (table/shape) and how signal detection consumes them. *(Engineering decision — see Open Question Q1.)*

**Design requirements:** mostly invisible. Optional: a "last synced" indicator + per-object sync toggle on the HubSpot settings panel (depends on Q3).

**Acceptance:** HubSpot contacts/companies/deals appear in the warehouse and update incrementally on the cron cadence.

---

## 6. API contracts (reference)

**Existing (built in #91 — do not change):**
- `POST /api/integrations/hubspot/validate` — body `{token}`; rate-limited 10/min (pre-auth); requires session + workspace; success `{success:true,message}`, error `{success:false,error:{code,message}}`.
- `GET /api/integrations/[name]/field-mappings` → `{objects, mappings}`; `PUT` ← `{mappings}` (server-side formula validation).

**To add:**
- WS3: extend signal-target create/list payloads with the `hubspot` target type + object selection.
- WS4: a cron route, e.g. `GET /api/cron/sync-hubspot` (Bearer `CRON_SECRET`).

---

## 7. Data model

- **No new tables** for Phase A. HubSpot uses `integration_configs` (creds in `api_key_encrypted`, metadata + per-object watermark in `config_json`). Field mappings reuse the v2 field-mapping tables.
- **WS3:** signal-target storage extended to express a `hubspot` target (object type + mapping ref). Confirm whether this needs a column/enum change or fits existing JSON target metadata.
- **WS4:** define the warehouse landing table/shape (Q1).
- ⚠️ **#91 migration cosmetic bug:** the HubSpot icon URLs in `20260521000000_hubspot_integration.sql` use `cdn.brandfetch.io/idAa1f1f1f/...` — a placeholder brand ID that 404s. Replace with a real Brandfetch ID (Bearer-auth API) or a bundled asset before the icon shows in the wizard. Fold into WS1.

---

## 8. Acceptance criteria (PR3 overall)

**Phase A (ship first):**
- [ ] User connects HubSpot via UI with a Private App token; bad token shows a clear error; rate-limit is friendly.
- [ ] `/settings/integrations/hubspot/field-mapping` shows HubSpot objects/properties; preview + test-send hit HubSpot.
- [ ] A signal with a HubSpot target writes the mapped record(s) to HubSpot on fire, with Beton properties.
- [ ] HubSpot icon renders (no 404).

**Phase B:**
- [ ] HubSpot records land in the warehouse and update incrementally on schedule.

**Both:**
- [ ] `npm run build` clean; unit tests for new dispatch/orchestrator; no regression to Attio paths.

---

## 9. Open questions (resolve before/with design)

- **Q1 (eng):** WS4 warehouse landing — what table/shape do source records land in, and how does signal detection read them? Blocks Phase B only.
- **Q2 (eng):** WS3 target-type naming — `'hubspot'` vs `'hubspot_object'`, and how object type (contact/company/deal) is stored on the target.
- **Q3 (design + eng):** Is there a per-integration **settings/management page** (connected state, disconnect, re-validate, last-synced) beyond the field-mapping page? Today there isn't one. Decide whether WS1 builds a minimal one or connection lives only in the wizard.
- **Q4 (product):** Required HubSpot Private App **scopes** — confirm the exact list for the helper copy in `HubSpotStep`.
- **Q5 (design):** WS3 new-signal destination picker — segmented control vs. dropdown; how to present "connect HubSpot first" when it's not connected.

---

## 10. Components to mirror (cheat-sheet for design)

| New | Mirror |
|---|---|
| `steps/HubSpotStep.tsx` (token connect) | `steps/FirecrawlStep.tsx`, `steps/PostHogStep.tsx` |
| `previews/HubSpotPreview.tsx` | `previews/AttioConnectionPreview.tsx` |
| `steps/HubSpotFieldMappingStep.tsx` (optional) | `steps/AttioFieldMappingStep.tsx` |
| New-signal destination picker (WS3) | existing Attio target affordance in `signals/new/page.tsx` |
| HubSpot field-mapping screen (WS2) | **no new design** — existing field-mapping page, adapter-routed |
