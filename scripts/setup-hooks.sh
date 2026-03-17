#!/usr/bin/env bash
# Run once after cloning to activate the project's git hooks.
# Usage: bash scripts/setup-hooks.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
git -C "$ROOT" config core.hooksPath .githooks
echo "✓ Git hooks activated (pre-commit secret scanner enabled)"
