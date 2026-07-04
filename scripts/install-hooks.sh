#!/usr/bin/env bash
#
# Roua Trading — Hook Installer
#
# Run this once after cloning the repo to set up pre-commit hooks.
# This makes the bug registry rules AUTOMATIC — you can't forget them.
#
# Usage:
#   bash scripts/install-hooks.sh
#
set -e

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -z "$REPO_ROOT" ]; then
  echo "❌ Not a git repository. Run this from the repo root."
  exit 1
fi

HOOK_DIR="$REPO_ROOT/.git/hooks"
PRE_COMMIT="$HOOK_DIR/pre-commit"

echo ""
echo "🔧 Installing Roua Trading pre-commit hook..."
echo "─────────────────────────────────────────────────"

# Create hook
cat > "$PRE_COMMIT" << 'HOOK_EOF'
#!/usr/bin/env bash
# Auto-installed by scripts/install-hooks.sh
# See CONTRIBUTING.md for the rules this enforces.
set -e

STAGED_CODE=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx)$' | grep -vE '(\.spec\.|\.test\.|/__tests__/|scripts/|node_modules/)' || true)
STAGED_BUGS=$(git diff --cached --name-only --diff-filter=ACM | grep -E '^BUGS\.md$' || true)

if [ -z "$STAGED_CODE" ]; then exit 0; fi
CODE_COUNT=$(echo "$STAGED_CODE" | wc -l | tr -d ' ')

if [ -n "$STAGED_BUGS" ]; then
  echo "✅ Pre-commit: $CODE_COUNT code file(s) + BUGS.md updated — OK"
  exit 0
fi

echo ""
echo "❌ BLOCKED: $CODE_COUNT code file(s) staged but BUGS.md NOT updated!"
echo ""
echo "  Rule (CONTRIBUTING.md): Any .ts/.tsx change must update BUGS.md."
echo ""
echo "  Quick fix:"
echo "    1. Open BUGS.md, update the relevant BUG-NNN entry"
echo "    2. git add BUGS.md"
echo "    3. git commit  (this hook will pass now)"
echo ""
echo "  Bypass (emergency): git commit --no-verify"
echo ""
echo "  Changed files:"
echo "$STAGED_CODE" | sed 's/^/    • /'
echo ""
exit 1
HOOK_EOF

chmod +x "$PRE_COMMIT"

echo "  ✅ Installed: $PRE_COMMIT"
echo ""
echo "  What this does:"
echo "    • Blocks any commit that changes .ts/.tsx without updating BUGS.md"
echo "    • Shows clear instructions on what to do"
echo "    • Can be bypassed with: git commit --no-verify (emergencies only)"
echo ""
echo "  Next steps:"
echo "    1. Read CONTRIBUTING.md for the full rules"
echo "    2. Run: npx tsx scripts/verify-bugs.ts  (see current bug status)"
echo "    3. Make changes, update BUGS.md, commit — hook will guide you"
echo ""
