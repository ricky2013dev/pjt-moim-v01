#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Restore exactly the committed dependencies and rebuild the PWA.
# Database schema changes are handled separately, not by this hook.
npm ci --no-audit --no-fund
npm run build
