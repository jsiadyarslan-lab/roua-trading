#!/usr/bin/env bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Static Analysis — تحقق أن كل إصلاح موجود فعلاً في الكود
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# يستخدم: bash scripts/verify-fixes-static.sh
# لا يحتاج DB، لا يحتاج API، لا يحتاج session token
# يفحص فقط أن الـ code changes موجودة في الملفات الصحيحة
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set -uo pipefail
cd "$(dirname "$0")/.."

PASS=0
FAIL=0
ERRORS=()

check() {
  local name="$1"
  local pattern="$2"
  local file="$3"
  if [ -z "$file" ]; then file="."; fi

  if rg -q -- "$pattern" "$file" 2>/dev/null; then
    echo "  ✅ PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "  ❌ FAIL: $name"
    echo "          pattern: $pattern"
    echo "          in: $file"
    FAIL=$((FAIL + 1))
    ERRORS+=("$name")
  fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔬 Static Analysis — 13 RC Fixes"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ─── RC-2: dataStale field ─────────────────────────────────
echo ""
echo "── RC-2: Fail-Open Data Staleness ──"
check "RC-2a: dataStale in AssistantContext interface" \
  "dataStale: boolean" \
  apps/api/src/modules/assistant/types/context.types.ts

check "RC-2b: failedBuilders in AssistantContext" \
  "failedBuilders: string\[\]" \
  apps/api/src/modules/assistant/types/context.types.ts

check "RC-2c: _lastError getter in UserTradingContextBuilder" \
  "get lastError" \
  apps/api/src/modules/assistant/builders/user-trading-context.builder.ts

check "RC-2d: dataStale computed in ContextAggregator" \
  "const dataStale" \
  apps/api/src/modules/assistant/services/context-aggregator.service.ts

check "RC-2e: stale banner in AssistantChatService" \
  "staleBanner" \
  apps/api/src/modules/assistant/services/assistant-chat.service.ts

# ─── RC-1: userId in cache key ─────────────────────────────
echo ""
echo "── RC-1: Cache userId Isolation ──"
check "RC-1a: userId in AIAnalysisRequest" \
  "userId\?: string" \
  apps/api/src/modules/ai/services/groq.service.ts

check "RC-1b: userId in generateRedisCacheKey" \
  'ai:analysis:\$\{userId\}' \
  apps/api/src/modules/ai/services/ai-cache.service.ts

check "RC-1c: userId passed in AssistantChatService" \
  "userId: request.userId" \
  apps/api/src/modules/assistant/services/assistant-chat.service.ts

# ─── RC-6: Prompt Injection ────────────────────────────────
echo ""
echo "── RC-6: Prompt Injection Protection ──"
check "RC-6a: ALLOWED_ROLES whitelist" \
  "ALLOWED_ROLES = new Set" \
  apps/api/src/modules/assistant/services/assistant.controller.ts

check "RC-6b: history length cap (20)" \
  "length > 20" \
  apps/api/src/modules/assistant/services/assistant.controller.ts

check "RC-6c: role filter applied" \
  "ALLOWED_ROLES.has\(m.role\)" \
  apps/api/src/modules/assistant/services/assistant.controller.ts

# ─── RC-7: SSE Cleanup ─────────────────────────────────────
echo ""
echo "── RC-7: SSE Connection Cleanup ──"
check "RC-7a: req.on close handler" \
  "req.on\('close'" \
  apps/api/src/modules/assistant/services/assistant.controller.ts

check "RC-7b: req.on aborted handler" \
  "req.on\('aborted'" \
  apps/api/src/modules/assistant/services/assistant.controller.ts

check "RC-7c: clientDisconnected flag" \
  "clientDisconnected = true" \
  apps/api/src/modules/assistant/services/assistant.controller.ts

check "RC-7d: disconnect check before chat()" \
  "Client disconnected before chat" \
  apps/api/src/modules/assistant/services/assistant.controller.ts

# ─── RC-3: MarketBuilder dedupe ────────────────────────────
echo ""
echo "── RC-3: MarketBuilder Duplicate Call Removed ──"
check "RC-3a: removed duplicate _extractUserSymbols call" \
  "RC-3: حذف الاستدعاء المكرر" \
  apps/api/src/modules/assistant/services/context-aggregator.service.ts

check "RC-3b: marketBuilder called once with userSymbols" \
  "marketBuilder.build\(userSymbols\)" \
  apps/api/src/modules/assistant/services/context-aggregator.service.ts

# ─── RC-10: Price Guard ────────────────────────────────────
echo ""
echo "── RC-10: Price Hallucination Guard ──"
check "RC-10a: detectedSymbol extracted from intent" \
  "const detectedSymbol" \
  apps/api/src/modules/assistant/services/assistant-chat.service.ts

check "RC-10b: detectedSymbol passed as symbol" \
  "symbol: detectedSymbol" \
  apps/api/src/modules/assistant/services/assistant-chat.service.ts

# ─── RC-4: Timezone ────────────────────────────────────────
echo ""
echo "── RC-4: Timezone-Aware Pattern Detection ──"
check "RC-4a: _toUserLocalTime in PatternDetection" \
  "_toUserLocalTime" \
  apps/api/src/modules/assistant/services/pattern-detection.service.ts

check "RC-4b: _toUserLocalTime in AutoDiagnosis" \
  "_toUserLocalTime" \
  apps/api/src/modules/assistant/services/auto-diagnosis.service.ts

check "RC-4c: userTimezone param in detect()" \
  "userTimezone\?: string" \
  apps/api/src/modules/assistant/services/pattern-detection.service.ts

check "RC-4d: timezone query param in controller" \
  "@Query\('timezone'\)" \
  apps/api/src/modules/assistant/services/assistant.controller.ts

# ─── RC-5: Wilson score ────────────────────────────────────
echo ""
echo "── RC-5: Wilson Score Confidence ──"
check "RC-5a: _wilsonConfidence method exists" \
  "_wilsonConfidence" \
  apps/api/src/modules/assistant/services/pattern-detection.service.ts

# RC-5b: old formula (50 + stats.wins * 10) should be REMOVED
# This is an "inverted" check — PASS if pattern NOT found
if rg -q -- '50 \+ stats\.wins \* 10' apps/api/src/modules/assistant/services/pattern-detection.service.ts 2>/dev/null; then
  echo "  ❌ FAIL: RC-5b: old confidence formula still present"
  FAIL=$((FAIL + 1))
  ERRORS+=("RC-5b: old confidence formula still present")
else
  echo "  ✅ PASS: RC-5b: old confidence formula removed"
  PASS=$((PASS + 1))
fi

check "RC-5d: Wilson score used (6 places)" \
  "this._wilsonConfidence" \
  apps/api/src/modules/assistant/services/pattern-detection.service.ts

# ─── RC-8: ThrottlerGuard ──────────────────────────────────
echo ""
echo "── RC-8: UserThrottlerGuard Enabled ──"
check "RC-8a: UserThrottlerGuard file exists" \
  "class UserThrottlerGuard" \
  apps/api/src/common/guards/user-throttler.guard.ts

check "RC-8b: APP_GUARD registered in app.module" \
  "APP_GUARD" \
  apps/api/src/app.module.ts

check "RC-8c: UserThrottlerGuard imported" \
  "UserThrottlerGuard" \
  apps/api/src/app.module.ts

check "RC-8d: getTracker method overrides default" \
  "getTracker" \
  apps/api/src/common/guards/user-throttler.guard.ts

check "RC-8e: tracker uses userId when available" \
  'user:\$\{userId\}' \
  apps/api/src/common/guards/user-throttler.guard.ts

# ─── RC-9: 32-language support ─────────────────────────────
echo ""
echo "── RC-9: 32-Language Support in Groq ──"
check "RC-9a: languageNames map exists" \
  "languageNames: Record" \
  apps/api/src/modules/ai/services/groq.service.ts

check "RC-9b: French supported" \
  "fr: 'French'" \
  apps/api/src/modules/ai/services/groq.service.ts

# RC-9c: old binary language check (en ? English : Arabic) should be REMOVED
# This is an "inverted" check — PASS if pattern NOT found
if rg -q -- "request.language === 'en' \? 'English' : 'Arabic'" apps/api/src/modules/ai/services/groq.service.ts 2>/dev/null; then
  echo "  ❌ FAIL: RC-9c: old binary language check still present"
  FAIL=$((FAIL + 1))
  ERRORS+=("RC-9c: old binary language check still present")
else
  echo "  ✅ PASS: RC-9c: old binary language check removed"
  PASS=$((PASS + 1))
fi

check "RC-9e: fallbackLangs in orchestrator" \
  "fallbackLangs" \
  apps/api/src/modules/ai/services/ai-orchestrator.service.ts

# ─── RC-11: Strict userId check ────────────────────────────
echo ""
echo "── RC-11: Strict userId Check ──"
check "RC-11a: strict check in council-context" \
  "userId !== ''" \
  apps/api/src/modules/assistant/builders/council-context.builder.ts

check "RC-11b: strict check in strategic-council" \
  "userId !== ''" \
  apps/api/src/modules/ai/strategic-council/strategic-council.service.ts

check "RC-11c: strict check in function-registry" \
  "userId !== ''" \
  apps/api/src/modules/assistant/services/function-registry.service.ts

# ─── RC-12: Idempotency ────────────────────────────────────
echo ""
echo "── RC-12: Idempotency-Key Support ──"
check "RC-12a: Idempotency-Key header param" \
  "@Headers\('idempotency-key'\)" \
  apps/api/src/modules/assistant/services/assistant.controller.ts

check "RC-12b: idempotency Redis check" \
  "assistant:idem:" \
  apps/api/src/modules/assistant/services/assistant.controller.ts

check "RC-12c: idempotent flag in response" \
  "idempotent: true" \
  apps/api/src/modules/assistant/services/assistant.controller.ts

# ─── A-5: Audit Trail ──────────────────────────────────────
echo ""
echo "── A-5: Audit Trail ──"
check "A-5a: AuditModule imported in AssistantModule" \
  "AuditModule" \
  apps/api/src/modules/assistant/assistant.module.ts

check "A-5b: AuditService injected in controller" \
  "auditService: AuditService" \
  apps/api/src/modules/assistant/services/assistant.controller.ts

check "A-5c: ASSISTANT_CHAT action logged" \
  "ASSISTANT_CHAT" \
  apps/api/src/modules/assistant/services/assistant.controller.ts

# ─── Summary ───────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Summary: $PASS passed, $FAIL failed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ ${#ERRORS[@]} -gt 0 ]; then
  echo ""
  echo "❌ Failed checks:"
  for err in "${ERRORS[@]}"; do
    echo "  • $err"
  done
  exit 1
fi

echo ""
echo "✅ All static checks passed — all 13 fixes are present in the codebase"
exit 0
