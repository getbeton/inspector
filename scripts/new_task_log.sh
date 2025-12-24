#!/usr/bin/env bash
set -euo pipefail

# Creates a new local-only task log file in .task_logs/.
# This directory is gitignored so process logs never get committed.
#
# Usage:
#   ./scripts/new_task_log.sh "short-description"
#
# Example:
#   ./scripts/new_task_log.sh "railway-branch-mapping"

slug="${1:-}"
if [[ -z "$slug" ]]; then
  echo "Usage: $0 \"short-description\""
  exit 2
fi

mkdir -p .task_logs

ts="$(date +%Y%m%d-%H%M%S)"
file=".task_logs/${ts}-${slug}.md"

cat > "$file" <<EOF
# Task Log: ${slug}

Date: ${ts}

## Goal
- 

## Notes
- 

## Decisions
- 

## Commands run
\`\`\`
\`\`\`

## Outcome
- 
EOF

echo "Created: $file"

