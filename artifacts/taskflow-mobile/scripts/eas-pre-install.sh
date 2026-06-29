#!/usr/bin/env bash
set -euo pipefail

echo "=== EAS pre-install: setting up pnpm for monorepo ==="

# ── 1. Activate pnpm@10.26.1 ─────────────────────────────────────────────────
if command -v corepack >/dev/null 2>&1; then
  corepack enable pnpm 2>/dev/null || true
  corepack prepare pnpm@10.26.1 --activate 2>/dev/null || true
else
  echo "corepack not found, installing pnpm via npm"
  npm install -g pnpm@10.26.1 --force --silent
fi

echo "pnpm version: $(pnpm --version)"

# ── 2. Resolve the workspace root ────────────────────────────────────────────
REPO_ROOT=""
if command -v git >/dev/null 2>&1; then
  REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
fi

# Fallback: traverse up from this script's location looking for pnpm-workspace.yaml
if [ -z "$REPO_ROOT" ]; then
  DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  while [ "$DIR" != "/" ]; do
    if [ -f "$DIR/pnpm-workspace.yaml" ]; then
      REPO_ROOT="$DIR"
      break
    fi
    DIR=$(dirname "$DIR")
  done
fi

# ── 3. Install from workspace root ───────────────────────────────────────────
if [ -n "$REPO_ROOT" ] && [ -f "$REPO_ROOT/pnpm-workspace.yaml" ]; then
  echo "Workspace root found at: $REPO_ROOT"
  cd "$REPO_ROOT"
  pnpm install --no-frozen-lockfile
  echo "Workspace install complete"
else
  echo "No workspace root found; installing from current directory"
  pnpm install --no-frozen-lockfile
fi

echo "=== EAS pre-install complete ==="
