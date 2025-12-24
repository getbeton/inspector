#!/usr/bin/env bash
set -euo pipefail

# Sync `staging` to `main` after a production promotion.
#
# Why this exists:
# - When you merge `staging` -> `main` via PR, GitHub may create a merge commit on `main`.
# - That merge commit lives on `main`, but `staging` is still pointing at the pre-merge tip.
# - This script fast-forwards `staging` to the exact `main` commit so they match.
#
# Safety policy:
# - We only allow a fast-forward update of `staging`.
# - If `staging` has commits not in `main` (diverged), we abort with instructions.
#
# Usage:
#   ./scripts/sync_staging_to_main.sh
#
# Optional:
#   REMOTE=origin ./scripts/sync_staging_to_main.sh

REMOTE="${REMOTE:-origin}"

echo "[sync] Remote: ${REMOTE}"

# Ensure we're in a git repo.
git rev-parse --is-inside-work-tree >/dev/null

# Keep users from accidentally syncing with a dirty tree.
if [[ -n "$(git status --porcelain)" ]]; then
  echo "[sync] Refusing to run: working tree is not clean." >&2
  echo "[sync] Commit or stash your changes, then re-run." >&2
  exit 2
fi

echo "[sync] Fetching latest refs..."
git fetch "$REMOTE" --prune

MAIN_REF="${REMOTE}/main"
STAGING_REF="${REMOTE}/staging"

MAIN_SHA="$(git rev-parse "$MAIN_REF")"
STAGING_SHA="$(git rev-parse "$STAGING_REF")"

echo "[sync] ${MAIN_REF}:   ${MAIN_SHA}"
echo "[sync] ${STAGING_REF}: ${STAGING_SHA}"

if [[ "$MAIN_SHA" == "$STAGING_SHA" ]]; then
  echo "[sync] staging already equals main. Nothing to do."
  exit 0
fi

# We want to update staging -> main, but ONLY if staging is an ancestor of main.
if git merge-base --is-ancestor "$STAGING_REF" "$MAIN_REF"; then
  echo "[sync] Fast-forwarding staging -> main (safe)."
  git checkout staging >/dev/null
  git pull --ff-only "$REMOTE" staging
  git merge --ff-only "$MAIN_REF"
  git push "$REMOTE" staging
  echo "[sync] Done. staging now equals main."
  exit 0
fi

echo "[sync] ERROR: ${STAGING_REF} is NOT an ancestor of ${MAIN_REF}." >&2
echo "[sync] This means staging has commits that main does not (diverged)." >&2
echo "[sync] We will NOT reset staging automatically (would lose commits)." >&2
echo "" >&2
echo "[sync] Options:" >&2
echo "  1) If staging should include main (typical): open a PR main -> staging and merge it." >&2
echo "  2) If staging should be reset to main (rare): do it manually with explicit approval." >&2
exit 3


