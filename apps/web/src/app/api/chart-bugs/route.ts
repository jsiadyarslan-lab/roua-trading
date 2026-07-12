/**
 * GET /api/chart-bugs
 * POST /api/chart-bugs (run tests)
 *
 * Returns the status of all chart bugs in BUGS.md + runs regression tests.
 * No auth required — this is a developer tool, not user-facing.
 *
 * Query params:
 *   ?verbose=1     — include full test output
 *   ?bug=BUG-001   — check only one bug / run only one test
 *   ?skipTests=1   — only run verify-bugs, skip regression tests (faster)
 */

import { NextResponse } from 'next/server';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ROOT = process.cwd();
// BUGS.md is at the repository root, but process.cwd() in production (Railway)
// may return apps/web. Search multiple candidate locations.
function findRepoRoot(): string {
  // Try cwd, parent, grandparent — return the first that contains BUGS.md
  const candidates = [ROOT, path.join(ROOT, '..'), path.join(ROOT, '..', '..')];
  for (const c of candidates) {
    try { if (fs.existsSync(path.join(c, 'BUGS.md'))) return c; } catch {}
  }
  return ROOT; // fallback
}

const REPO_ROOT = findRepoRoot();
const BUGS_MD = path.join(REPO_ROOT, 'BUGS.md');
const SCAN_DIRS = [
  path.join(REPO_ROOT, 'apps/web/src'),
  path.join(REPO_ROOT, 'apps/api/src'),
].filter(p => { try { return fs.existsSync(p); } catch { return false; } });

// ─── Types ───────────────────────────────────────────────────────────────────

interface Bug {
  id: string;
  title: string;
  registeredStatus: string;
  severity: string;
  file: string;
  openPattern?: RegExp;
  fixedPattern?: RegExp;
  description: string;
  impact?: string;
  fix?: string;
  commit?: string;
  test?: string;
}

interface BugResult {
  id: string;
  title: string;
  severity: string;
  registeredStatus: string;
  actualStatus: 'PRESENT' | 'FIXED' | 'REGRESSED' | 'UNKNOWN';
  file: string;
  detail: string;
  matchedFiles: string[];
  description: string;
  impact?: string;
  fix?: string;
}

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'TIMEOUT' | 'ERROR';
  output: string;
  error?: string;
}

// ─── BUGS.md Parser ──────────────────────────────────────────────────────────

function parseBugsMd(content: string): Bug[] {
  const bugs: Bug[] = [];
  const bugBlocks = content.split(/^### (BUG-\d+)/m);

  for (let i = 1; i < bugBlocks.length; i += 2) {
    const id = bugBlocks[i].trim();
    const body = bugBlocks[i + 1] || '';

    const titleMatch = body.match(/^([^\n]+)/);
    const title = titleMatch ? titleMatch[1].trim() : '(no title)';

    const statusMatch = body.match(/\*\*Status:\*\*\s*(OPEN|FIXED|REGRESSED)/);
    const severityMatch = body.match(/\*\*Severity:\*\*\s*(CRITICAL|HIGH|MEDIUM|LOW)/);
    const fileMatch = body.match(/\*\*File:\*\*\s*`?([^`\n]+)`?/);
    const openPatternMatch = body.match(/\*\*Pattern \(OPEN\):\*\*\s*(.+?)(?:\n|$)/);
    const fixedPatternMatch = body.match(/\*\*Pattern \(FIXED\):\*\*\s*(.+?)(?:\n|$)/);
    const descMatch = body.match(/\*\*Description:\*\*\s*([^\n]+)/);
    const impactMatch = body.match(/\*\*Impact:\*\*\s*([^\n]+)/);
    const fixMatch = body.match(/\*\*Fix:\*\*\s*([^\n]+)/);
    const commitMatch = body.match(/\*\*Commit:\*\*\s*([^\n]+)/);
    const testMatch = body.match(/\*\*Test:\*\*\s*([^\n]+)/);

    function safeRegex(src: string | undefined): RegExp | undefined {
      if (!src) return undefined;
      try { return new RegExp(src.trim(), 'm'); } catch { return undefined; }
    }

    bugs.push({
      id,
      title,
      registeredStatus: statusMatch?.[1] || 'OPEN',
      severity: severityMatch?.[1] || 'MEDIUM',
      file: fileMatch?.[1]?.trim() || '',
      openPattern: safeRegex(openPatternMatch?.[1]),
      fixedPattern: safeRegex(fixedPatternMatch?.[1]),
      description: descMatch?.[1]?.trim() || '',
      impact: impactMatch?.[1]?.trim(),
      fix: fixMatch?.[1]?.trim(),
      commit: commitMatch?.[1]?.trim(),
      test: testMatch?.[1]?.trim(),
    });
  }
  return bugs;
}

// ─── File Scanner ────────────────────────────────────────────────────────────

const fileContentCache = new Map<string, string>();

function readFileCached(filePath: string): string | null {
  if (fileContentCache.has(filePath)) return fileContentCache.get(filePath)!;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    fileContentCache.set(filePath, content);
    return content;
  } catch { return null; }
}

function getMatchLines(content: string, pattern: RegExp): number[] {
  const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
  const globalPattern = new RegExp(pattern.source, flags);
  const lines: number[] = [];
  for (const m of content.matchAll(globalPattern)) {
    if (m.index === undefined) continue;
    const before = content.slice(0, m.index);
    const lineNum = 1 + (before.match(/\n/g) || []).length;
    lines.push(lineNum);
  }
  return lines;
}

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
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
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

// ─── Bug Checker ─────────────────────────────────────────────────────────────

function checkBug(bug: Bug, allFiles: string[]): BugResult {
  const matchedFiles: string[] = [];
  let openMatchCount = 0;
  let fixedMatchCount = 0;
  let detail = '';

  let targetFiles: string[];
  let pathNotFound = false;
  if (bug.file) {
    // bug.file paths in BUGS.md are relative to repo root (e.g., 'apps/web/src/...')
    // Strip line numbers and backticks
    const cleanPath = bug.file.replace(/:\d+.*$/, '').replace(/^`|`$/g, '');
    const absolute = path.isAbsolute(cleanPath) ? cleanPath : path.join(REPO_ROOT, cleanPath);
    if (fs.existsSync(absolute)) {
      targetFiles = [absolute];
    } else {
      // Try to find by basename (handles cases where the file moved directories)
      const basename = path.basename(cleanPath);
      targetFiles = allFiles.filter(f => path.basename(f) === basename);
      if (targetFiles.length === 0) pathNotFound = true;
    }
  } else {
    targetFiles = allFiles;
  }

  for (const file of targetFiles) {
    const content = readFileCached(file);
    if (content === null) continue;
    const relPath = path.relative(REPO_ROOT, file);

    if (bug.openPattern) {
      const lines = getMatchLines(content, bug.openPattern);
      if (lines.length > 0) {
        openMatchCount++;
        matchedFiles.push(`${relPath}:${lines.join(',')}`);
      }
    }
    if (bug.fixedPattern) {
      const lines = getMatchLines(content, bug.fixedPattern);
      if (lines.length > 0) fixedMatchCount++;
    }
  }

  let actualStatus: BugResult['actualStatus'];
  if (pathNotFound && openMatchCount === 0 && fixedMatchCount === 0) {
    actualStatus = 'UNKNOWN';
    detail = `File not found: ${bug.file}`;
  } else if (openMatchCount > 0 && fixedMatchCount === 0) {
    actualStatus = bug.registeredStatus === 'FIXED' ? 'REGRESSED' : 'PRESENT';
    detail = `OPEN pattern matched in ${openMatchCount} file(s)`;
  } else if (openMatchCount === 0 && fixedMatchCount > 0) {
    actualStatus = 'FIXED';
    detail = `FIXED pattern matched`;
  } else if (openMatchCount > 0 && fixedMatchCount > 0) {
    actualStatus = bug.registeredStatus === 'FIXED' ? 'REGRESSED' : 'PRESENT';
    detail = `Both patterns matched — treat as present`;
  } else {
    actualStatus = 'UNKNOWN';
    detail = `Neither pattern matched`;
  }

  return {
    id: bug.id,
    title: bug.title,
    severity: bug.severity,
    registeredStatus: bug.registeredStatus,
    actualStatus,
    file: bug.file,
    detail,
    matchedFiles,
    description: bug.description,
    impact: bug.impact,
    fix: bug.fix,
  };
}

// ─── Test Runner ─────────────────────────────────────────────────────────────

function runTests(bugFilter: string | null): TestResult[] {
  const testDir = path.join(ROOT, 'apps/web/src/lib/charts/__tests__');
  if (!fs.existsSync(testDir)) return [];

  let testFiles = fs.readdirSync(testDir)
    .filter(f => f.startsWith('BUG-') && f.endsWith('.spec.ts'))
    .sort();

  if (bugFilter) {
    testFiles = testFiles.filter(f => f.startsWith(bugFilter));
  }

  const results: TestResult[] = [];
  for (const testFile of testFiles) {
    const testPath = path.join(testDir, testFile);
    try {
      const output = execSync(`npx tsx "${testPath}"`, {
        cwd: ROOT,
        timeout: 15000,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      results.push({ name: testFile, status: 'PASS', output });
    } catch (err: any) {
      const output = (err.stdout || '') + (err.stderr || '');
      if (err.killed && err.signal === 'SIGTERM') {
        results.push({ name: testFile, status: 'TIMEOUT', output, error: 'Timed out after 15s' });
      } else {
        results.push({ name: testFile, status: 'FAIL', output, error: err.message });
      }
    }
  }
  return results;
}

// ─── GET Handler ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const url = new URL(request.url);
  const verbose = url.searchParams.get('verbose') === '1';
  const bugFilter = url.searchParams.get('bug');
  const skipTests = url.searchParams.get('skipTests') === '1';

  try {
    // 1. Parse BUGS.md
    if (!fs.existsSync(BUGS_MD)) {
      return NextResponse.json(
        {
          success: false,
          error: 'BUGS.md not found. Searched from cwd=' + ROOT + ' (repo root=' + REPO_ROOT + ')',
          cwd: ROOT,
          repoRoot: REPO_ROOT,
        },
        { status: 500 }
      );
    }
    const bugsMdContent = fs.readFileSync(BUGS_MD, 'utf8');
    let bugs = parseBugsMd(bugsMdContent);
    if (bugFilter) {
      bugs = bugs.filter(b => b.id === bugFilter);
    }

    // 2. Scan codebase
    const allFiles = listTsFiles(SCAN_DIRS);
    const bugResults = bugs.map(b => checkBug(b, allFiles));

    // 3. Run regression tests (unless skipped)
    let testResults: TestResult[] = [];
    if (!skipTests) {
      testResults = runTests(bugFilter);
    }

    // 4. Summary
    const summary = {
      total: bugResults.length,
      fixed: bugResults.filter(r => r.actualStatus === 'FIXED').length,
      present: bugResults.filter(r => r.actualStatus === 'PRESENT').length,
      regressed: bugResults.filter(r => r.actualStatus === 'REGRESSED').length,
      unknown: bugResults.filter(r => r.actualStatus === 'UNKNOWN').length,
      testsPassed: testResults.filter(r => r.status === 'PASS').length,
      testsFailed: testResults.filter(r => r.status !== 'PASS').length,
      testsTotal: testResults.length,
    };

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary,
      bugs: bugResults,
      tests: verbose ? testResults : testResults.map(t => ({
        name: t.name,
        status: t.status,
        error: t.error,
      })),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message, stack: err.stack },
      { status: 500 }
    );
  }
}
