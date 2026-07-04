#!/usr/bin/env bash
#
# Roua Trading — Pre-commit Hook
#
# This hook runs automatically BEFORE every `git commit`.
# It enforces the CONTRIBUTING.md rule:
#   "Any code change (.ts/.tsx) must be accompanied by a BUGS.md update"
#
# If you change code files but don't update BUGS.md, the commit is BLOCKED.
# You get a clear message telling you what to do.
#
# To install (run once after cloning):
#   bash scripts/install-hooks.sh
#
# To bypass (ONLY for emergencies — DON'T make this a habit):
#   git commit --no-verify
#

set -e

echo ""
echo "📋 Roua Trading — Pre-commit Bug Registry Check"
echo "─────────────────────────────────────────────────"

# Get staged files (only .ts/.tsx, excluding tests/scripts)
STAGED_CODE=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx)$' | grep -vE '(\.spec\.|\.test\.|/__tests__/|scripts/|node_modules/)' || true)
STAGED_BUGS=$(git diff --cached --name-only --diff-filter=ACM | grep -E '^BUGS\.md$' || true)

if [ -z "$STAGED_CODE" ]; then
  # No code files staged — nothing to check
  echo "  ℹ️  No code files staged — skipping registry check."
  echo ""
  exit 0
fi

CODE_COUNT=$(echo "$STAGED_CODE" | wc -l | tr -d ' ')

if [ -n "$STAGED_BUGS" ]; then
  echo "  ✅ $CODE_COUNT code file(s) staged + BUGS.md updated — all good!"
  echo ""
  exit 0
fi

# Code changed but BUGS.md not updated — BLOCK
echo "  ❌ BLOCKED: $CODE_COUNT code file(s) staged but BUGS.md was NOT updated!"
echo ""
echo "  ─────────────────────────────────────────────────────────────"
echo "  📜 RULE (from CONTRIBUTING.md):"
echo "  Any code change (.ts/.tsx) must be accompanied by a BUGS.md update."
echo ""
echo "  WHAT TO DO:"
echo ""
echo "  1. If you FIXED a bug:"
echo "     - Open BUGS.md"
echo "     - Find the bug (BUG-NNN)"
echo "     - Change Status from OPEN → FIXED"
echo "     - Add: - **Pattern (FIXED):** <regex matching your fix>"
echo "     - Add: - **Commit:** (will be filled after commit)"
echo ""
echo "  2. If you DISCOVERED a new bug:"
echo "     - Add a new entry in BUGS.md:"
echo "       ### BUG-NNN: Short title"
echo "       - **Status:** OPEN"
echo "       - **Severity:** CRITICAL | HIGH | MEDIUM | LOW"
echo "       - **File:** path/to/file.ts:LINE"
echo "       - **Pattern (OPEN):** <regex matching buggy code>"
echo "       - **Description:** What's wrong"
echo "       - **Impact:** What breaks"
echo ""
echo "  3. If you ADDED a feature (no bug):"
echo "     - Add a comment in BUGS.md under a new section:"
echo "       ### CHANGE-NNN: Feature name"
echo "       - **Type:** FEATURE"
echo "       - **Description:** What was added"
echo ""
echo "  4. After updating BUGS.md, stage it and retry:"
echo "     git add BUGS.md"
echo "     git commit  # this hook will pass now"
echo ""
echo "  5. Verify your fix is detected:"
echo "     npx tsx scripts/verify-bugs.ts"
echo ""
echo "  ─────────────────────────────────────────────────────────────"
echo ""
echo "  Files that need BUGS.md update:"
echo "$STAGED_CODE" | sed 's/^/    • /'
echo ""
echo "  To bypass (EMERGENCY ONLY): git commit --no-verify"
echo ""

exit 1
