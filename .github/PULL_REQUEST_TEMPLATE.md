<!--
  📋 Roua Trading — Pull Request Template
  Please fill in all sections. The CI will check these automatically.
-->

## 📝 Description

<!-- What does this PR do? One paragraph. -->

## 🐛 Bug Registry Update

<!-- REQUIRED if you changed any .ts/.tsx file -->

- [ ] **I updated `BUGS.md`** for every code change in this PR
- [ ] I ran `npx tsx scripts/verify-bugs.ts` — 0 REGRESSED
- [ ] I ran `npx tsx scripts/run-regression-tests.ts` — all pass

### Bugs touched in this PR

<!-- List each BUG-NNN you touched. Use one of: FIXED, OPEN (new), UPDATED -->

| Bug ID | Action | Notes |
|--------|--------|-------|
| BUG-NNN | FIXED / OPEN / UPDATED | Brief description |

<!-- If you added a NEW bug, use this template:
### BUG-NNN: Short title
- **Status:** OPEN
- **Severity:** CRITICAL / HIGH / MEDIUM / LOW
- **File:** path/to/file.ts:LINE
- **Pattern (OPEN):** regex-matching-buggy-code
- **Description:** What's wrong
- **Impact:** What breaks
-->

<!-- If this PR is a FEATURE (not a bug fix), explain why no BUGS.md entry is needed:
This PR adds a feature, not a bug fix. No BUG-NNN entry required.
-->

## ✅ Checklist

- [ ] Code changes are accompanied by `BUGS.md` updates
- [ ] `npx tsx scripts/verify-bugs.ts` shows 0 REGRESSED
- [ ] `npx tsx scripts/run-regression-tests.ts` — all tests pass
- [ ] If fixing a bug: added a `BUG-NNN.*.spec.ts` regression test
- [ ] No `console.log` left in production code (except `console.error`/`console.warn`)
- [ ] Commit message references the BUG-NNN ID(s)

## 🔗 References

<!-- Link to related issues, commits, or discussions -->

---

> ⚠️ **Reminder**: The CI pipeline will automatically:
> 1. **Block** this PR if code changed but `BUGS.md` wasn't updated
> 2. **Block** if any FIXED bug has REGRESSED
> 3. **Block** if any regression test fails
>
> If CI fails on #1, see `CONTRIBUTING.md` for how to update `BUGS.md`.
