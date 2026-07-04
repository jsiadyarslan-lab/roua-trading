#!/usr/bin/env tsx
/**
 * check-registry.ts — Enforces the CONTRIBUTING.md rule:
 * "Any code change must be accompanied by a BUGS.md update"
 *
 * This script checks:
 * 1. If any .ts/.tsx file changed in the current commit/PR
 * 2. Whether BUGS.md was also updated in the same commit
 * 3. If not, FAILS with instructions to update BUGS.md
 *
 * Exceptions (files that don't require BUGS.md update):
 * - Test files (*.spec.ts, *.test.ts)
 * - Documentation (*.md, *.txt)
 * - Config files (*.json, *.yml, *.yaml, *.toml)
 * - Lock files (package-lock.json, yarn.lock)
 * - This script itself
 *
 * Usage (local, before commit):
 *   npx tsx scripts/check-registry.ts
 *
 * Usage (CI, on PR):
 *   npx tsx scripts/check-registry.ts --base main --head HEAD
 *
 * Exit codes:
 *   0 — OK (BUGS.md was updated, or only non-code files changed)
 *   1 — FAIL (code files changed but BUGS.md was not updated)
 *   2 — Script error
 */

import { execSync } from 'node:child_process';

const ROOT = process.cwd();

// Files that don't require a BUGS.md update when changed
const EXEMPT_PATTERNS = [
  /\.spec\.ts$/,
  /\.test\.ts$/,
  /\.spec\.tsx$/,
  /\.test\.tsx$/,
  /\.md$/,
  /\.txt$/,
  /\.json$/,
  /\.yml$/,
  /\.yaml$/,
  /\.toml$/,
  /\.lock$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /\.dockerignore$/,
  /\.gitignore$/,
  /Dockerfile$/,
  /scripts\/check-registry\.ts$/, // this script itself
  /scripts\/verify-bugs\.ts$/,
  /scripts\/run-regression-tests\.ts$/,
  /\/__tests__\//, // test directories
];

// Directories where code changes DON'T require BUGS.md (non-chart code)
// For now, ALL code changes require it. Remove this if you want to scope it.
const EXEMPT_DIRS: string[] = [
  // Add directories here if you want to exempt them, e.g.:
  // 'apps/mobile/',
];

function getChangedFiles(base?: string, head?: string): string[] {
  try {
    let cmd: string;
    if (base && head) {
      // CI mode: compare base...head
      cmd = `git diff --name-only ${base}...${head}`;
    } else {
      // Local mode: compare working tree to last commit
      // Check if there are staged changes first
      const staged = execSync('git diff --cached --name-only', { encoding: 'utf8' }).trim();
      if (staged) {
        return staged.split('\n').filter(Boolean);
      }
      // Otherwise compare to HEAD
      cmd = 'git diff --name-only HEAD';
    }
    const output = execSync(cmd, { encoding: 'utf8', cwd: ROOT }).trim();
    return output ? output.split('\n').filter(Boolean) : [];
  } catch {
    return [];
  }
}

function isExempt(file: string): boolean {
  for (const pattern of EXEMPT_PATTERNS) {
    if (pattern.test(file)) return true;
  }
  for (const dir of EXEMPT_DIRS) {
    if (file.startsWith(dir)) return true;
  }
  return false;
}

function isCodeFile(file: string): boolean {
  return file.endsWith('.ts') || file.endsWith('.tsx');
}

function main(): void {
  const args = process.argv.slice(2);
  let base: string | undefined;
  let head: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--base' && args[i + 1]) { base = args[i + 1]; i++; }
    if (args[i] === '--head' && args[i + 1]) { head = args[i + 1]; i++; }
  }

  const changedFiles = getChangedFiles(base, head);

  if (changedFiles.length === 0) {
    console.log('✅ No files changed — nothing to check.');
    process.exit(0);
  }

  console.log(`\n📋 Checking ${changedFiles.length} changed file(s)...\n`);

  const codeFiles = changedFiles.filter(f => isCodeFile(f) && !isExempt(f));
  const nonCodeFiles = changedFiles.filter(f => !isCodeFile(f));
  const exemptFiles = changedFiles.filter(f => isCodeFile(f) && isExempt(f));
  const bugsMdUpdated = changedFiles.includes('BUGS.md');

  // Show what changed
  if (nonCodeFiles.length > 0) {
    console.log(`  📄 Non-code files (no BUGS.md required): ${nonCodeFiles.length}`);
  }
  if (exemptFiles.length > 0) {
    console.log(`  🧪 Exempt code files (tests/scripts): ${exemptFiles.length}`);
  }
  if (codeFiles.length > 0) {
    console.log(`  💻 Code files changed: ${codeFiles.length}`);
    for (const f of codeFiles.slice(0, 10)) console.log(`     • ${f}`);
    if (codeFiles.length > 10) console.log(`     ... and ${codeFiles.length - 10} more`);
  }

  if (bugsMdUpdated) {
    console.log(`\n  ✅ BUGS.md was updated — all good!\n`);
    process.exit(0);
  }

  if (codeFiles.length === 0) {
    console.log(`\n  ✅ Only non-code/exempt files changed — BUGS.md not required.\n`);
    process.exit(0);
  }

  // Code files changed but BUGS.md was NOT updated — FAIL
  console.log(`\n  ❌ FAIL: ${codeFiles.length} code file(s) changed but BUGS.md was NOT updated!\n`);
  console.log('  ─────────────────────────────────────────────────────────────');
  console.log('  📜 RULE (from CONTRIBUTING.md):');
  console.log('  Any code change (.ts/.tsx) must be accompanied by a BUGS.md update.');
  console.log('');
  console.log('  WHAT TO DO:');
  console.log('  1. If you FIXED a bug: change its status to FIXED in BUGS.md');
  console.log('     and add a "Pattern (FIXED):" line.');
  console.log('  2. If you DISCOVERED a new bug: add a new BUG-NNN entry as OPEN.');
  console.log('  3. If you ADDED a feature: add a BUG-NNN entry describing');
  console.log('     any new risk, or add a comment in BUGS.md explaining the change.');
  console.log('  4. If this is a FALSE POSITIVE (e.g., CI config change):');
  console.log('     add the file pattern to EXEMPT_PATTERNS in scripts/check-registry.ts');
  console.log('');
  console.log('  Then run: npx tsx scripts/verify-bugs.ts');
  console.log('  ─────────────────────────────────────────────────────────────\n');

  process.exit(1);
}

main();
