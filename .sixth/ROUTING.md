# ROUTING QUICK REFERENCE

| Task Type                              | Agent          | Cost |
|---------------------------------------|----------------|------|
| New feature decomposition              | AGENT-1 (Pro)  | HIGH |
| Complex component / multi-file logic   | AGENT-2 (Sonnet)| MED |
| Bug fix, style, config, <50 lines      | AGENT-3 (Flash)| LOW  |
| Prisma / NestJS / ENV / DB             | AGENT-4        | MED  |
| Write/patch files to disk              | AGENT-5        | —    |
| Review & validate after save           | AGENT-6 (Flash)| LOW  |

## ESCALATION TRIGGERS (Flash → Sonnet)
- File > 200 lines being significantly rewritten
- Cross-module state management change
- New Zustand store or context addition
- Algorithm / trading logic modification
- Auth / security boundary change

## SECURITY GATES (AGENT-4)
- Any `.env` read/write → Agent-4 owns it
- No `process.env.VARIABLE` inline in components
- All secrets via NestJS `ConfigService` on backend
- All public vars via `NEXT_PUBLIC_` prefix only on frontend
