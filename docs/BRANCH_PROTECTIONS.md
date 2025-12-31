# GitHub branch protections (required)

This repo’s safety model depends on GitHub branch protections so that:
- `staging` always deploys to Railway staging via GitHub integration
- `main` always deploys to Railway production via GitHub integration
- Nobody can accidentally push directly to `staging`/`main` and bypass review/CI

## Required rules

Create **two** branch protection rules in GitHub:

### 1) Protect `main`

Repository → Settings → Branches → Branch protection rules → Add rule

- Branch name pattern: `main`
- ✅ Require a pull request before merging
  - (Recommended) ✅ Require approvals: 1
- ✅ Require status checks to pass before merging
  - Add required check: **CI / python-ci** (from `.github/workflows/ci.yml`)
- ✅ Require conversation resolution before merging (recommended)
- ✅ Require signed commits (optional)
- ✅ Do not allow bypassing the above settings (recommended)
- ✅ Restrict who can push to matching branches (recommended)
  - Only allow maintainers / release managers

### 2) Protect `staging`

Same screen → Add rule

- Branch name pattern: `staging`
- ✅ Require a pull request before merging
  - (Recommended) ✅ Require approvals: 1
- ✅ Require status checks to pass before merging
  - Add required check: **CI / python-ci**
- ✅ Require conversation resolution before merging (recommended)
- ✅ Do not allow bypassing the above settings (recommended)
- ✅ Restrict who can push to matching branches (recommended)
  - Only allow maintainers / release managers

## Why this matters (concrete consequence)

Without these settings, a developer (or an AI agent) can:
- merge locally and `git push origin staging` directly
- accidentally ship broken staging without review/CI
- (worse) push to `main` and ship broken production

With protections enabled:
- you can still develop quickly on `feature/*`
- deployments are automatic (Railway tracks branches)
- production requires an explicit PR promotion from `staging` → `main`

## Optional: CODEOWNERS (nice-to-have)

If you add a `.github/CODEOWNERS` file and enable “require review from Code Owners”
in the branch protection rule, GitHub will require the right people to approve changes.







