#!/usr/bin/env bash
set -euo pipefail

# Select a usable Python interpreter in a predictable way.
#
# Priority:
# 1) Repo-local venv (./venv/bin/python) if present
# 2) python3 on PATH
# 3) python on PATH
#
# This makes local commands consistent even on systems where `python` is Python 2.

if [[ -x "./venv/bin/python" ]]; then
  PY="./venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
  PY="python3"
elif command -v python >/dev/null 2>&1; then
  PY="python"
else
  echo "No Python interpreter found (expected one of: ./venv/bin/python, python3, python)" >&2
  exit 127
fi

exec "$PY" "$@"


