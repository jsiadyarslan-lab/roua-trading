# ROUA TRADING — AGENT MANIFEST v1.0
> Managed by: Antigravity Agent Manager
> Last updated: 2026-04-30

---

## PROJECT TOPOLOGY

```
roua-trading/
├── apps/
│   ├── web/src/
│   │   ├── app/           — Next.js pages & layouts
│   │   ├── components/
│   │   │   ├── ai/        — AI panel components
│   │   │   ├── dashboard/ — Dashboard widgets (AICouncilPanel, BotEngine…)
│   │   │   ├── charts/    — TradingView / charting
│   │   │   ├── scanner/   — Market scanner UI
│   │   │   ├── portfolio/ — Portfolio views
│   │   │   ├── landing/   — Public landing page
│   │   │   └── ui/        — Shared primitives
│   │   ├── hooks/         — Custom React hooks
│   │   └── lib/           — Utilities / store (Zustand)
│   └── api/src/
│       ├── modules/
│       │   ├── ai/        — AI controller & service
│       │   ├── news/       — News module
│       │   ├── trading/    — Trading engine
│       │   ├── scanner/    — Signal scanner
│       │   ├── signal/     — Signal generation
│       │   ├── engine/     — Core engine
│       │   ├── neural/     — Neural-net models
│       │   ├── analytics/  — Analytics
│       │   ├── portfolio/  — Portfolio management
│       │   ├── exchange/   — Exchange connectors
│       │   ├── execution/  — Order execution
│       │   └── coach/      — AI coaching
│       ├── auth/           — Authentication
│       └── common/         — Shared guards, pipes, decorators
├── agents/                 — Background daemon agents
├── packages/               — Shared packages (types, config…)
├── prisma/                 — DB schema & migrations
└── .sixth/                 — Agent Manager config (this dir)
```

---

## THE SIX AGENTS

### AGENT-1 · Architecture & Planning (Gemini Pro / Huge)
- **Trigger**: New feature requests, complex refactors, ambiguous requirements
- **Scope**: Read entire project tree, decompose into sub-tasks for agents 2-6
- **Output**: Sub-task list written to `.sixth/tasks/`
- **Cost gate**: Only invoked when task complexity score ≥ HIGH

### AGENT-2 · Core Programmer (Claude Sonnet — Thinking)
- **Trigger**: Complex logic, new core components, multi-file architectural changes
- **Scope**: `apps/web/src/components/`, `apps/api/src/modules/`, complex hooks
- **Cost gate**: Never use for < 50-line changes or pure styling tasks

### AGENT-3 · Quick Fix (Gemini Flash — default)
- **Trigger**: Bug fixes, formatting, config tweaks, < 50-line changes, CSS/style edits
- **Scope**: Any file — routine edits only
- **Cost gate**: DEFAULT. Route here first, escalate only if logic is complex

### AGENT-4 · Backend & Database (Backend Agent)
- **Trigger**: Prisma schema, DB queries, NestJS module/service/controller work
- **Scope**: `apps/api/`, `prisma/`, environment variables
- **Rules**: NEVER hardcode secrets. All keys via `process.env.*` only
- **Cost gate**: Invoked for any API/DB change regardless of size

### AGENT-5 · File Manager (File Manager)
- **Trigger**: After code is produced by agents 1-4
- **Action**: Write / patch files directly to correct paths — NO chat output
- **Rules**: Batch all related file changes in one pass

### AGENT-6 · Debugger & Reviewer (Gemini Flash)
- **Trigger**: After every save batch from Agent-5
- **Scope**: Dependency errors, import mismatches, Vite/Next.js build warnings, type errors
- **Output**: Either ✅ CLEAR or ❌ ERROR LIST → re-routes to Agent-3 or Agent-2

---

## ROUTING DECISION TREE

```
New Task Received
      │
      ├─ Is it a major feature / architectural decision?
      │         YES → AGENT-1 (decompose) → sub-tasks to 2-4
      │         NO  ↓
      ├─ Is it backend / DB / ENV related?
      │         YES → AGENT-4
      │         NO  ↓
      ├─ Is it complex logic (>50 lines, multi-file, state machine)?
      │         YES → AGENT-2
      │         NO  ↓
      └─ Routine fix / style / config → AGENT-3

      After any code change:
            AGENT-5 (write files) → AGENT-6 (review)
            AGENT-6 fail → re-route to AGENT-3 or AGENT-2
```

---

## COST OPTIMIZATION RULES
1. **Flash-first**: Default to Agent-3 (Flash) for all incoming tasks
2. **No redundant reads**: Agents cache project context from Agent-1's scan
3. **Batch writes**: Agent-5 never writes files one-by-one; batches per feature
4. **No chat bloat**: Agents produce file diffs, not prose explanations
5. **Escalation only**: Sonnet/Pro invoked only on explicit complexity trigger

---

## ACTIVE TASK QUEUE
> See `.sixth/tasks/` for pending sub-tasks

---

## ENVIRONMENT KEYS REGISTRY
> All keys live in `.env` — never in source files
- `DATABASE_URL` — Prisma / PostgreSQL
- `NEXT_PUBLIC_API_URL` — Web → API base URL
- `JWT_SECRET` — Auth module
- `OPENAI_API_KEY` / `GEMINI_API_KEY` — AI modules
- `BINANCE_API_KEY` / `BINANCE_SECRET` — Exchange connector
