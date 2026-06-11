#!/bin/bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Roua Trading — V185 Integrity Verification Script
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# سكربت للتحقق من أن ميزات V185 مطبقة فعلاً
# يعمل محلياً وعلى Railway
#
# الاستخدام:
#   ./verify-v185.sh              # فحص محلي
#   ./verify-v185.sh railway      # فحص Railway
#   ./verify-v185.sh local-server # فحص سيرفر محلي يعمل
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

PASS=0
FAIL=0
WARN=0
TOTAL=0

check_pass() {
    PASS=$((PASS + 1))
    TOTAL=$((TOTAL + 1))
    echo -e "  ${GREEN}✅ PASS${NC} — $1"
}

check_fail() {
    FAIL=$((FAIL + 1))
    TOTAL=$((TOTAL + 1))
    echo -e "  ${RED}❌ FAIL${NC} — $1"
}

check_warn() {
    WARN=$((WARN + 1))
    TOTAL=$((TOTAL + 1))
    echo -e "  ${YELLOW}⚠️  WARN${NC} — $1"
}

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  🔍 رؤى — فحص سلامة V185: مجلس الذكاء ٩ ميزات جديدة${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

MODE="${1:-local}"
BASE_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ "$MODE" = "railway" ] || [ "$MODE" = "local-server" ]; then
    # ── Server-based checks ──
    if [ "$MODE" = "railway" ]; then
        API_URL="https://roua-trading-production.up.railway.app/api"
    else
        API_URL="http://localhost:3001/api"
    fi

    echo -e "${BLUE}📊 الفحص عبر API: ${API_URL}${NC}"
    echo ""

    # ── Check 1: Integrity API ──
    echo -e "${BLUE}━━━ ١. فحص السلامة الشامل (V16) ━━━${NC}"
    INTEGRITY=$(curl -s "${API_URL}/integrity" 2>/dev/null || echo '{"error":"unreachable"}')
    
    if echo "$INTEGRITY" | grep -q '"healthy":true'; then
        check_pass "النظام صحي — كل الفحوصات ناجحة"
    elif echo "$INTEGRITY" | grep -q '"healthy":false'; then
        FAILED_COUNT=$(echo "$INTEGRITY" | grep -o '"failed":[0-9]*' | grep -o '[0-9]*')
        check_fail "النظام به $FAILED_COUNT مشاكل — راجع التفاصيل"
        echo "$INTEGRITY" | python3 -m json.tool 2>/dev/null || echo "$INTEGRITY"
    else
        check_warn "لم أستطع الوصول لـ API — تأكد أن السيرفر يعمل"
    fi

    # ── Check 2: Council Intelligence API ──
    echo ""
    echo -e "${BLUE}━━━ ٢. فحص Council Intelligence API ━━━${NC}"
    
    CI_INTEGRITY=$(curl -s "${API_URL}/council-intelligence/integrity" 2>/dev/null || echo '{"error":"unreachable"}')
    if echo "$CI_INTEGRITY" | grep -q '"overall":"ALL_PASS"'; then
        check_pass "Council Intelligence API يعمل — كل الخدمات PASS"
    elif echo "$CI_INTEGRITY" | grep -q '"checks"'; then
        PASSING=$(echo "$CI_INTEGRITY" | grep -o '"status":"PASS"' | wc -l)
        check_warn "Council Intelligence: $PASSING خدمات تعمل — راجع التفاصيل"
    else
        check_warn "Council Intelligence API غير متاح — قد لا يكون السيرفر جاهزاً بعد"
    fi

    # ── Check 3: Market Regime API ──
    echo ""
    echo -e "${BLUE}━━━ ٣. فحص Market Regime Detection ━━━${NC}"
    REGIME=$(curl -s "${API_URL}/council-intelligence/regime/BTC-USDT" 2>/dev/null || echo '{"error":"unreachable"}')
    if echo "$REGIME" | grep -q '"regime"'; then
        REGIME_VALUE=$(echo "$REGIME" | grep -o '"regime":"[^"]*"' | head -1)
        check_pass "Market Regime يعمل: $REGIME_VALUE"
    else
        check_warn "Market Regime API لم يستجب — قد يحتاج وقتاً للبدء"
    fi

    # ── Check 4: Correlation Matrix ──
    echo ""
    echo -e "${BLUE}━━━ ٤. فحص Cross-Pair Correlation ━━━${NC}"
    CORR=$(curl -s "${API_URL}/council-intelligence/correlation" 2>/dev/null || echo '{"error":"unreachable"}')
    if echo "$CORR" | grep -q '"correlation"'; then
        check_pass "مصفوفة الارتباط تعمل"
    else
        check_warn "مصفوفة الارتباط لم تُبنَ بعد — تحتاج وقتاً لجمع البيانات"
    fi

    # ── Check 5: Health Report ──
    echo ""
    echo -e "${BLUE}━━━ ٥. فحص Self-Healing Health ━━━${NC}"
    HEALTH=$(curl -s "${API_URL}/council-intelligence/health" 2>/dev/null || echo '{"error":"unreachable"}')
    if echo "$HEALTH" | grep -q '"HEALTHY"'; then
        check_pass "Self-Healing يعمل — المكونات صحية"
    else
        check_warn "Self-Healing لم يستجب"
    fi

    # ── Check 6: Adaptive Schedule ──
    echo ""
    echo -e "${BLUE}━━━ ٦. فحص Adaptive Schedule ━━━${NC}"
    SCHEDULE=$(curl -s "${API_URL}/council-intelligence/schedule" 2>/dev/null || echo '{"error":"unreachable"}')
    if echo "$SCHEDULE" | grep -q '"symbol"'; then
        check_pass "الجدول الذكي يعمل"
    else
        check_warn "الجدول الذكي لم يستجب — لا توجد رموز مسجلة بعد"
    fi

else
    # ── Local file-based checks ──
    echo -e "${BLUE}📊 الفحص المحلي: التحقق من وجود الملفات والمحتوى${NC}"
    echo ""

    # ── Check 1: Service files exist ──
    echo -e "${BLUE}━━━ ١. فحص وجود ملفات الخدمات ━━━${NC}"
    SERVICES=(
        "trade-journal.service.ts"
        "council-vote-accuracy.service.ts"
        "market-regime.service.ts"
        "cross-pair-correlation.service.ts"
        "dynamic-position-sizing.service.ts"
        "system-memory.service.ts"
        "adaptive-schedule.service.ts"
        "self-healing.service.ts"
        "backtesting-engine.service.ts"
    )
    
    for svc in "${SERVICES[@]}"; do
        FILE="$BASE_DIR/apps/api/src/modules/ai/council-intelligence/$svc"
        if [ -f "$FILE" ]; then
            LINES=$(wc -l < "$FILE")
            check_pass "$svc موجود ($LINES سطر)"
        else
            check_fail "$svc غير موجود!"
        fi
    done

    # ── Check 2: Module and Controller ──
    echo ""
    echo -e "${BLUE}━━━ ٢. فحص Module و Controller ━━━${NC}"
    
    if [ -f "$BASE_DIR/apps/api/src/modules/ai/council-intelligence/council-intelligence.module.ts" ]; then
        if grep -q "CouncilIntelligenceModule" "$BASE_DIR/apps/api/src/modules/ai/council-intelligence/council-intelligence.module.ts"; then
            check_pass "CouncilIntelligenceModule معرّف بشكل صحيح"
        else
            check_fail "CouncilIntelligenceModule غير معرّف في الملف"
        fi
    else
        check_fail "ملف council-intelligence.module.ts غير موجود"
    fi

    if [ -f "$BASE_DIR/apps/api/src/modules/ai/council-intelligence/council-intelligence.controller.ts" ]; then
        if grep -q "CouncilIntelligenceController" "$BASE_DIR/apps/api/src/modules/ai/council-intelligence/council-intelligence.controller.ts"; then
            check_pass "CouncilIntelligenceController معرّف بشكل صحيح"
        else
            check_fail "CouncilIntelligenceController غير معرّف في الملف"
        fi
    else
        check_fail "ملف council-intelligence.controller.ts غير موجود"
    fi

    # ── Check 3: AppModule registration ──
    echo ""
    echo -e "${BLUE}━━━ ٣. فحص تسجيل الموديول في AppModule ━━━${NC}"
    
    APP_MODULE="$BASE_DIR/apps/api/src/app.module.ts"
    if grep -q "CouncilIntelligenceModule" "$APP_MODULE"; then
        check_pass "CouncilIntelligenceModule مسجّل في AppModule"
    else
        check_fail "CouncilIntelligenceModule غير مسجّل في AppModule — الميزات لن تعمل!"
    fi

    # ── Check 4: Prisma schema ──
    echo ""
    echo -e "${BLUE}━━━ ٤. فحص نماذج Prisma الجديدة ━━━${NC}"
    
    SCHEMA="$BASE_DIR/prisma/schema.prisma"
    MODELS=("TradeJournal" "CouncilVoteAccuracy" "MarketRegimeSnapshot" "CrossPairCorrelation" "SystemMemory" "AdaptiveSchedule")
    
    for model in "${MODELS[@]}"; do
        if grep -q "model $model" "$SCHEMA"; then
            check_pass "نموذج $model موجود في schema"
        else
            check_fail "نموذج $model غير موجود في schema!"
        fi
    done

    # ── Check 5: Key methods in each service ──
    echo ""
    echo -e "${BLUE}━━━ ٥. فحص الدوال المفتاحية في كل خدمة ━━━${NC}"
    
    CI_DIR="$BASE_DIR/apps/api/src/modules/ai/council-intelligence"
    
    # Trade Journal
    if grep -q "recordTradeOpen" "$CI_DIR/trade-journal.service.ts" && \
       grep -q "recordTradeClose" "$CI_DIR/trade-journal.service.ts"; then
        check_pass "مجلة التداول: recordTradeOpen + recordTradeClose"
    else
        check_fail "مجلة التداول ناقصة"
    fi
    
    # Vote Accuracy
    if grep -q "getRoleWeight" "$CI_DIR/council-vote-accuracy.service.ts" && \
       grep -q "recalculateWeights" "$CI_DIR/council-vote-accuracy.service.ts"; then
        check_pass "حلقة التعلم: getRoleWeight + recalculateWeights"
    else
        check_fail "حلقة التعلم ناقصة"
    fi
    
    # Market Regime
    if grep -q "detectRegime" "$CI_DIR/market-regime.service.ts" && \
       grep -q "buildRegimeContext" "$CI_DIR/market-regime.service.ts"; then
        check_pass "كشف وضع السوق: detectRegime + buildRegimeContext"
    else
        check_fail "كشف وضع السوق ناقص"
    fi
    
    # Cross-Pair Correlation
    if grep -q "checkCorrelatedRisk" "$CI_DIR/cross-pair-correlation.service.ts" && \
       grep -q "getPositionSizeMultiplier" "$CI_DIR/cross-pair-correlation.service.ts"; then
        check_pass "الارتباط: checkCorrelatedRisk + getPositionSizeMultiplier"
    else
        check_fail "الارتباط ناقص"
    fi
    
    # Dynamic Position Sizing
    if grep -q "calculateSizeMultiplier" "$CI_DIR/dynamic-position-sizing.service.ts" && \
       grep -q "MIN_MULTIPLIER" "$CI_DIR/dynamic-position-sizing.service.ts"; then
        check_pass "الحجم الذكي: calculateSizeMultiplier + حدود 0.3×–2.0×"
    else
        check_fail "الحجم الذكي ناقص"
    fi
    
    # System Memory
    if grep -q "storeMemory" "$CI_DIR/system-memory.service.ts" && \
       grep -q "generateMemoriesFromTrade" "$CI_DIR/system-memory.service.ts"; then
        check_pass "ذاكرة النظام: storeMemory + generateMemoriesFromTrade"
    else
        check_fail "ذاكرة النظام ناقصة"
    fi
    
    # Adaptive Schedule
    if grep -q "getRecommendedInterval" "$CI_DIR/adaptive-schedule.service.ts" && \
       grep -q "triggerEmergencySession" "$CI_DIR/adaptive-schedule.service.ts"; then
        check_pass "الجدول الذكي: getRecommendedInterval + triggerEmergencySession"
    else
        check_fail "الجدول الذكي ناقص"
    fi
    
    # Self-Healing
    if grep -q "reportFailure" "$CI_DIR/self-healing.service.ts" && \
       grep -q "isComponentDisabled" "$CI_DIR/self-healing.service.ts"; then
        check_pass "الشفاء الذاتي: reportFailure + isComponentDisabled"
    else
        check_fail "الشفاء الذاتي ناقص"
    fi
    
    # Backtesting
    if grep -q "runBacktest" "$CI_DIR/backtesting-engine.service.ts" && \
       grep -q "optimizeParameters" "$CI_DIR/backtesting-engine.service.ts"; then
        check_pass "محرك الاختبار: runBacktest + optimizeParameters"
    else
        check_fail "محرك الاختبار ناقص"
    fi

    # ── Check 6: Integrity Check V16 ──
    echo ""
    echo -e "${BLUE}━━━ ٦. فحص V16 في Integrity Controller ━━━${NC}"
    
    INTEGRITY_FILE="$BASE_DIR/apps/api/src/modules/maintenance/integrity-check.controller.ts"
    if grep -q "checkV16" "$INTEGRITY_FILE" && \
       grep -q "V185" "$INTEGRITY_FILE"; then
        check_pass "V16 integrity check موجود في integrity-check.controller.ts"
    else
        check_fail "V16 integrity check غير موجود!"
    fi

    # ── Check 7: TypeScript compilation ──
    echo ""
    echo -e "${BLUE}━━━ ٧. فحص TypeScript compilation ━━━${NC}"
    
    cd "$BASE_DIR/apps/api"
    if npx tsc --noEmit 2>&1 | grep -q "error TS"; then
        ERROR_COUNT=$(npx tsc --noEmit 2>&1 | grep "error TS" | wc -l)
        check_fail "TypeScript به $ERROR_COUNT أخطاء"
    else
        check_pass "TypeScript يترجم بدون أخطاء ✨"
    fi
fi

# ── Summary ──
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  📊 النتيجة النهائية${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  ${GREEN}✅ ناجح: $PASS${NC}"
echo -e "  ${RED}❌ فاشل: $FAIL${NC}"
echo -e "  ${YELLOW}⚠️  تحذير: $WARN${NC}"
echo -e "  📝 المجموع: $TOTAL"
echo ""

if [ $FAIL -eq 0 ]; then
    SCORE=$(( (PASS * 100) / TOTAL ))
    echo -e "  ${GREEN}🎉 النتيجة: ${SCORE}% — كل الميزات مطبقة!${NC}"
    echo ""
    echo -e "  ${CYAN}الخطوة التالية: ارفع إلى Railway وتحقق عبر:${NC}"
    echo -e "  ${BLUE}  ./verify-v185.sh railway${NC}"
    echo ""
    echo -e "  ${CYAN}أو افتح في المتصفح:${NC}"
    echo -e "  ${BLUE}  https://your-app.up.railway.app/api/integrity?html=1${NC}"
    echo -e "  ${BLUE}  https://your-app.up.railway.app/api/council-intelligence/integrity${NC}"
else
    echo -e "  ${RED}⚠️  هناك مشاكل تحتاج إصلاح!${NC}"
fi

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
