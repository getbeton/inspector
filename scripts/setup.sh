#!/usr/bin/env bash
set -euo pipefail

# Install Python dependencies for both backend and frontend into the selected interpreter.
# Uses scripts/python.sh to consistently pick the repo-local venv when present.

./scripts/python.sh -m pip install --upgrade pip
./scripts/python.sh -m pip install -r backend/requirements.txt
./scripts/python.sh -m pip install -r frontend/requirements.txt

echo "Dependency install complete."







