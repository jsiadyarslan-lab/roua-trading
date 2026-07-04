#!/usr/bin/env tsx
/**
 * verify-bugs.ts — Permanent bug regression checker
 *
 * Reads BUGS.md, parses each bug's OPEN and FIXED patterns, scans the codebase,
 * and reports:
 *   - PRESENT:  Bug's OPEN pattern still matches → bug exists in code
 *   - FIXED:    Bug's FIXED pattern matches (and OPEN doesn't) → fix is in place
 *   - REGRESSED: Bug was marked FIXED in BUGS.md but OPEN pattern matches again
 *   - UNKNOWN:  Neither pattern matches (bug was refactored away or pattern needs update)
 *
 * Exit codes:
 *   0 — All bugs are FIXED (no OPEN, no REGRESSED)
 *   1 — At least one bug is PRESENT or REGRESSED
 *   2 — Script error (couldn't read BUGS.md or scan files)
 *
 * Usage:
 *   npx tsx scripts/verify-bugs.ts
 *   npx tsx scripts/verify-bugs.ts --verbose   # show all files scanned
 *   npx tsx scripts/verify-bugs.ts --bug BUG-001  # check only one bug
 *
 * CI integration (GitHub Actions):
 *   - Run on every PR touching apps/web/src/lib/charts/ or apps/web/src/components/charts/
 *   - Fail the build if any bug marked FIXED has REGRESSED
 *   - (OPEN bugs don't fail CI — they're known issues being worked on)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── Config ──────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');
const BUGS_MD = path.join(ROOT, 'BUGS.md');
const SCAN_DIRS = [
  path.join(ROOT, 'apps/web/src'),
  path.join(ROOT, 'apps/api/src'),
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface Bug {
  id: string;
  title: string;
  status: 'OPEN' | 'FIXED' | 'REGRESSED' | 'UNKNOWN';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  file: string;
  openPattern?: RegExp;
  fixedPattern?: RegExp;
  description: string;
}

interface CheckResult {
  bug: Bug;
  actualStatus: 'PRESENT' | 'FIXED' | 'REGRESSED' | 'UNKNOWN';
  matchedFiles: string[];
  detail: string;
}

// ─── BUGS.md Parser ──────────────────────────────────────────────────────────

function parseBugsMd(content: string): Bug[] {
  const bugs: Bug[] = [];
  const bugBlocks = content.split(/^### (BUG-\d+)/m);

  // bugBlocks[0] is the preamble; then pairs of [id, body, id, body, ...]
  for (let i = 1; i < bugBlocks.length; i += 2) {
    const id = bugBlocks[i].trim();
    const body = bugBlocks[i + 1] || '';

    const titleMatch = body.match(/^([^\n]+)/);
    const title = titleMatch ? titleMatch[1].trim() : '(no title)';

    const statusMatch = body.match(/\*\*Status:\*\*\s*(OPEN|FIXED|REGRESSED)/);
    const status = (statusMatch?.[1] as Bug['status']) || 'OPEN';

    const severityMatch = body.match(/\*\*Severity:\*\*\s*(CRITICAL|HIGH|MEDIUM|LOW)/);
    const severity = (severityMatch?.[1] as Bug['severity']) || 'MEDIUM';

    const fileMatch = body.match(/\*\*File:\*\*\s*`([^`]+)`/);
    const file = fileMatch?.[1] || '';

    const openPatternMatch = body.match(/\*\*Pattern \(OPEN\):\*\*\s*(.+?)(?:\n|$)/);
    const fixedPatternMatch = body.match(/\*\*Pattern \(FIXED\):\*\*\s*(.+?)(?:\n|$)/);

    const descMatch = body.match(/\*\*Description:\*\*\s*([^\n]+)/);
    const description = descMatch?.[1]?.trim() || '';

    // Build regex safely — the pattern in BUGS.md is a regex SOURCE string,
    // not a /literal/ regex. We use 'm' flag for multiline so ^ and $ work per-line.
    function safeRegex(src: string | undefined): RegExp | undefined {
      if (!src) return undefined;
      try {
        return new RegExp(src, 'm');
      } catch {
        return undefined;
      }
    }

    bugs.push({
      id,
      title,
      status,
      severity,
      file,
      openPattern: safeRegex(openPatternMatch?.[1]),
      fixedPattern: safeRegex(fixedPatternMatch?.[1]),
      description,
    });
  }

  return bugs;
}

// ─── File Scanner ────────────────────────────────────────────────────────────

function listTsFiles(dirs: string[]): string[] {
  const files: string[] = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    walk(dir, files);
  }
  return files;
}

function walk(dir: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next' || e.name === '.git') continue;
      walk(full, out);
    } else if (e.isFile() && (e.name.endsWith('.ts') || e.name.endsWith('.tsx'))) {
      out.push(full);
    }
  }
}

function scanFile(filePath: string, pattern: RegExp): { match: boolean; lines: number[] } {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return { match: false, lines: [] };
  }
  const lines: number[] = [];
  let m: RegExpExecArray | null;
  const globalPattern = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  while ((m = globalPattern.exec(content)) !== null) {
    const lineNum = content.slice(0, m.index).split('\n').length;
    lines.push(lineNum);
    if (m.index === globalPattern.lastIndex) globalPattern.lastIndex++; // avoid zero-length loop
  }
  return { match: lines.length > 0, lines };
}

// ─── Bug Checker ─────────────────────────────────────────────────────────────

function checkBug(bug: Bug, allFiles: string[]): CheckResult {
  const matchedFiles: string[] = [];
  let openMatches = 0;
  let fixedMatches = 0;
  let detail = '';

  // Determine which files to scan for this bug
  let targetFiles: string[];
  if (bug.file) {
    // bug.file may have line numbers like "path:123" — strip them
    const cleanPath = bug.file.replace(/:\d+.*$/, '').replace(/^`|`$/g, '');
    const absolute = path.isAbsolute(cleanPath) ? cleanPath : path.join(ROOT, cleanPath);
    if (fs.existsSync(absolute)) {
      targetFiles = [absolute];
    } else {
      // Try to find by basename
      const basename = path.basename(cleanPath);
      targetFiles = allFiles.filter(f => path.basename(f) === basename);
    }
  } else {
    targetFiles = allFiles;
  }

  for (const file of targetFiles) {
    if (bug.openPattern) {
      const r = scanFile(file, bug.openPattern);
      if (r.match) {
        openMatches++;
        matchedFiles.push(`${path.relative(ROOT, file)}:${r.lines.join(',')}`);
      }
    }
    if (bug.fixedPattern) {
      const r = scanFile(file, bug.fixedPattern);
      if (r.match && !matchedFiles.some(mf => mf.startsWith(path.relative(ROOT, file)))) {
        fixedMatches++;
        // Don't add to matchedFiles for fixed — we want to highlight OPEN matches
      }
    }
  }

  let actualStatus: CheckResult['actualStatus'];
  if (openMatches > 0 && fixedMatches === 0) {
    actualStatus = bug.status === 'FIXED' ? 'REGRESSED' : 'PRESENT';
    detail = `OPEN pattern matched in ${openMatches} file(s)`;
  } else if (openMatches === 0 && fixedMatches > 0) {
    actualStatus = 'FIXED';
    detail = `FIXED pattern matched`;
  } else if (openMatches > 0 && fixedMatches > 0) {
    // Both patterns match — ambiguous, but OPEN match means bug is present
    actualStatus = bug.status === 'FIXED' ? 'REGRESSED' : 'PRESENT';
    detail = `Both patterns matched (OPEN in ${openMatches}, FIXED in ${fixedMatches}) — treat as present`;
  } else {
    actualStatus = 'UNKNOWN';
    detail = `Neither pattern matched in ${targetFiles.length} file(s)`;
  }

  return { bug: { ...bug, status: actualStatus as any }, actualStatus, matchedFiles, detail };
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const bugFilter = args.includes('--bug') ? args[args.indexOf('--bug') + 1] : null;

  if (!fs.existsSync(BUGS_MD)) {
    console.error(`ERROR: BUGS.md not found at ${BUGS_MD}`);
    process.exit(2);
  }

  const bugsMdContent = fs.readFileSync(BUGS_MD, 'utf8');
  let bugs = parseBugsMd(bugsMdContent);

  if (bugFilter) {
    bugs = bugs.filter(b => b.id === bugFilter);
    if (bugs.length === 0) {
      console.error(`ERROR: Bug ${bugFilter} not found in BUGS.md`);
      process.exit(2);
    }
  }

  console.log(`\n📋 Roua Trading — Bug Registry Verification\n`);
  console.log(`   Scanning ${SCAN_DIRS.length} directories under: ${path.relative(ROOT, SCAN_DIRS[0])}...\n`);

  const allFiles = listTsFiles(SCAN_DIRS);
  console.log(`   Found ${allFiles.length} TypeScript files to scan.\n`);

  const results: CheckResult[] = bugs.map(b => checkBug(b, allFiles));

  // ─── Report ────────────────────────────────────────────────────────────────

  const byStatus = {
    PRESENT: [] as CheckResult[],
    FIXED: [] as CheckResult[],
    REGRESSED: [] as CheckResult[],
    UNKNOWN: [] as CheckResult[],
  };
  for (const r of results) byStatus[r.actualStatus].push(r);

  const emoji = { PRESENT: '🔴', FIXED: '🟢', REGRESSED: '🚨', UNKNOWN: '⚪' };

  // Print by status, most severe first
  const order: (keyof typeof byStatus)[] = ['REGRESSED', 'PRESENT', 'UNKNOWN', 'FIXED'];
  for (const status of order) {
    if (byStatus[status].length === 0) continue;
    console.log(`\n── ${emoji[status]} ${status} (${byStatus[status].length}) ` + '─'.repeat(Math.max(0, 60 - status.length)));
    for (const r of byStatus[status]) {
      const sev = r.bug.severity.padEnd(8);
      console.log(`  ${emoji[status]} ${r.bug.id}  [${sev}]  ${r.bug.title}`);
      console.log(`     ${r.detail}`);
      if (r.matchedFiles.length > 0) {
        console.log(`     Files: ${r.matchedFiles.slice(0, 3).join(', ')}${r.matchedFiles.length > 3 ? `, +${r.matchedFiles.length - 3} more` : ''}`);
      }
      if (verbose && r.bug.file) {
        console.log(`     Source: ${r.bug.file}`);
      }
    }
  }

  // ─── Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(70));
  console.log('  SUMMARY');
  console.log('═'.repeat(70));
  console.log(`  Total bugs in registry:     ${bugs.length}`);
  console.log(`  ${emoji.FIXED} FIXED (fix in place):      ${byStatus.FIXED.length}`);
  console.log(`  ${emoji.PRESENT} PRESENT (still in code):   ${byStatus.PRESENT.length}`);
  console.log(`  ${emoji.REGRESSED} REGRESSED (fix reverted):  ${byStatus.REGRESSED.length}`);
  console.log(`  ${emoji.UNKNOWN} UNKNOWN (pattern stale):   ${byStatus.UNKNOWN.length}`);
  console.log('═'.repeat(70));

  // ─── Exit code ─────────────────────────────────────────────────────────────
  // Exit 1 if any PRESENT or REGRESSED (but PRESENT alone is okay for known-issues workflow).
  // For CI: fail on REGRESSED only. PRESENT bugs are tracked but don't block.
  if (byStatus.REGRESSED.length > 0) {
    console.log('\n🚨 FAIL: Regression detected! A previously-fixed bug is back.');
    process.exit(1);
  }
  if (byStatus.PRESENT.length > 0) {
    console.log(`\n⚠️  NOTE: ${byStatus.PRESENT.length} known bug(s) still present (not blocking CI).`);
  }
  if (byStatus.UNKNOWN.length > 0) {
    console.log(`\n⚠️  NOTE: ${byStatus.UNKNOWN.length} bug(s) have stale patterns — update BUGS.md.`);
  }
  if (byStatus.FIXED.length === bugs.length) {
    console.log('\n✅ All registered bugs are FIXED. Great work!');
  }
  process.exit(0);
}

main();
