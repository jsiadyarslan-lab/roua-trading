# Chart Bug Prevention System

> **Never rediscover the same bug twice.**

This directory contains a permanent bug registry and verification system for chart-related code.

## The Problem This Solves

Before this system:
- Audits discovered ~300 bugs across 3 separate reviews
- Each audit started from scratch, "rediscovering" the same bugs
- No way to know if a fix was reverted in a future PR
- Bug reports lived in chat messages that disappeared

After this system:
- Every bug has a **stable ID** (`BUG-NNN`) in `BUGS.md`
- `verify-bugs.ts` checks each bug against the codebase in <2 seconds
- `run-regression-tests.ts` runs unit tests for every fixed bug
- GitHub Actions blocks any PR that regresses a fixed bug

## Files

| File | Purpose |
|------|---------|
| `BUGS.md` | The permanent bug registry. Each bug has an ID, severity, file location, OPEN/FIXED patterns, and status. **Edit this when you discover or fix a bug.** |
| `verify-bugs.ts` | Static checker. Reads `BUGS.md`, scans the codebase, reports which bugs are PRESENT / FIXED / REGRESSED / UNKNOWN. |
| `run-regression-tests.ts` | Test runner. Discovers and runs all `BUG-NNN.spec.ts` files. |
| `apps/web/src/lib/charts/__tests__/BUG-NNN.*.spec.ts` | One regression test per fixed bug. Uses `node:assert` (no test framework needed). |
| `.github/workflows/chart-bug-prevention.yml` | CI pipeline. Runs both checkers on every PR. |

## How to Use

### Before an audit
```bash
npx tsx scripts/verify-bugs.ts
```
Tells you which bugs are still present (so you don't "rediscover" them) and which have regressed (so you know your fixes are intact).

### When you discover a new bug
1. Add an entry to `BUGS.md` with the next available `BUG-NNN` ID
2. Fill in: severity, file location, OPEN pattern (regex), description, impact
3. Set status to `OPEN`
4. Run `npx tsx scripts/verify-bugs.ts` to confirm the OPEN pattern matches

### When you fix a bug
1. Change status from `OPEN` to `FIXED` in `BUGS.md`
2. Add the FIXED pattern (regex that matches the fixed code)
3. Add the commit hash
4. Create a regression test: `apps/web/src/lib/charts/__tests__/BUG-NNN.short-name.spec.ts`
5. Run `npx tsx scripts/run-regression-tests.ts` to confirm the test passes
6. Run `npx tsx scripts/verify-bugs.ts` to confirm the bug shows as FIXED

### In CI (automatic)
Every PR touching chart code triggers:
1. `verify-bugs.ts` — fails if any FIXED bug has REGRESSED
2. `run-regression-tests.ts` — fails if any regression test fails

OPEN bugs do NOT block CI (they're known issues being worked on).

## Status Meanings

| Status | Meaning | Action |
|--------|---------|--------|
| 🟢 FIXED | Fix is in place, FIXED pattern matches | None — monitored by CI |
| 🔴 PRESENT | Bug exists, OPEN pattern matches | Schedule a fix |
| 🚨 REGRESSED | Bug was FIXED but OPEN pattern matches again | **URGENT — fix immediately** |
| ⚪ UNKNOWN | Neither pattern matches | Update patterns in BUGS.md |

## Adding a New Bug — Template

```markdown
### BUG-NNN: Short title
- **Status:** OPEN
- **Severity:** CRITICAL | HIGH | MEDIUM | LOW
- **File:** `apps/web/src/path/to/file.ts:LINE`
- **Pattern (OPEN):** regex-that-matches-the-buggy-code
- **Description:** What's wrong
- **Impact:** What breaks for the user
- **Fix:** (filled in when fixed)
- **Commit:** (filled in when fixed)
- **Test:** `apps/web/src/lib/charts/__tests__/BUG-NNN.name.spec.ts` (filled in when test added)
```

## Why This Works

1. **Stable IDs** — `BUG-001` means the same thing forever, across audits, PRs, and time
2. **Patterns, not line numbers** — code moves; patterns survive refactoring
3. **Both OPEN and FIXED patterns** — verify-bugs can distinguish "fix is in place" from "neither pattern matches"
4. **CI enforcement** — humans forget; CI doesn't
5. **Tests, not just patterns** — regression tests catch semantic bugs that patterns can't
