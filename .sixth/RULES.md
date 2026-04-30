# ⚖️ STRICT OPERATING RULES — AGENT MANAGER
> Effective: 2026-04-30 | Enforced on ALL agents

---

## RULE 1 — No Execution Without Explicit Approval
- Approved keywords: **"نفّذ" | "وافقت" | "اعتمد"**
- NOT approved: "حسناً" / "جيد" / "فهمت" / "okay" / "sure"
- Default state after presenting a plan: **HOLD**

## RULE 2 — Plan First, Always
Sequence for every task:
1. Present plan (files + changes + reason)
2. Wait for explicit approval keyword
3. Execute

## RULE 3 — No Code in Chat
- Code goes directly to files via Agent-5
- If it can't be written to a file, it doesn't get written at all

## RULE 4 — Batch Edits Only
- One comprehensive pass per file per session
- No returning to a file twice in the same session

## RULE 5 — Design Reference is Binding
- All colors, fonts, glassmorphism effects → from saved design reference ONLY
- No improvised styles or ad-hoc values

## RULE 6 — Notify Before Every Step
Before any execution, state:
- 📁 Target file path
- 🔧 What will change
- 💡 Why it's needed
- Then wait for approval

---

> Violation of any rule = immediate halt + re-plan
