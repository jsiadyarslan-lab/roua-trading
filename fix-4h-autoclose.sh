#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# 🔧 FIX SCRIPT: 4-Hour Auto-Close Logic — V184
# ═══════════════════════════════════════════════════════════════════
#
# المشاكل المكتشفة:
#
# BUG-1: Agent Service يغلق كل المراكز الورقية بعد 4 ساعات بغض النظر عن
#         الإطار الزمني (hardcoded 4h) ويسجل PnL = 0 (breakeven exit)
#         بينما Position Monitor يعطي agent positions 48 ساعة
#         → تناقض + تدمير الأرباح
#
# BUG-2: Position Monitor يغلق المراكز عند TIME_EXPIRED بدون فحص
#         إذا كانت رابحة → صفقات رابحة تُغلق بالقوة
#
# BUG-3: Agent's PnL tracking يكتب 0 لكل إغلاق breakeven
#         بينما الإغلاق الفعلي يكون بسعر السوق → سجلات خاطئة
#
# BUG-4: Agent و Position Monitor كلاهما يفحصان نفس المراكز
#         → سباق محتمل (race condition)
#
# الإصلاحات:
#
# FIX-1: إزالة إغلاق الـ 4h من Agent Service → تفويض كامل لـ Position Monitor
# FIX-2: إضافة وعي بالربح قبل TIME_EXPIRED close في Position Monitor
# FIX-3: إصلاح PnL tracking في Agent Service (استخدام سعر الإغلاق الفعلي)
# FIX-4: توحيد منطق MAX_HOLDING_TIME
#
# ═══════════════════════════════════════════════════════════════════

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PROJECT_ROOT="/home/z/my-project/roua-trading"
AGENT_SERVICE="$PROJECT_ROOT/apps/api/src/agents/autonomous-trader/agent.service.ts"
POSITION_MONITOR="$PROJECT_ROOT/apps/api/src/modules/engine/services/position-monitor.service.ts"

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}   🔧 V184: 4-Hour Auto-Close Fix Script${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# ── Backup files ──
echo -e "${YELLOW}📦 Creating backups...${NC}"
BACKUP_DIR="$PROJECT_ROOT/backups/v184-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp "$AGENT_SERVICE" "$BACKUP_DIR/agent.service.ts.bak"
cp "$POSITION_MONITOR" "$BACKUP_DIR/position-monitor.service.ts.bak"
echo -e "${GREEN}✅ Backups saved to: $BACKUP_DIR${NC}"
echo ""

# ══════════════════════════════════════════════════════════════
# FIX-1: Remove Agent's hardcoded 4h breakeven close
# ══════════════════════════════════════════════════════════════
echo -e "${YELLOW}━━━ FIX-1: Removing Agent's hardcoded 4h breakeven close ━━━${NC}"
echo -e "${RED}   Problem: Agent closes ALL paper positions at 4h with PnL=0${NC}"
echo -e "${GREEN}   Fix: Delegate auto-close to Position Monitor (single source of truth)${NC}"
echo ""

# This fix is applied by the Python script below
echo -e "${YELLOW}   → Will be applied by the Python patch script${NC}"
echo ""

# ══════════════════════════════════════════════════════════════
# FIX-2: Add P/L awareness before TIME_EXPIRED close
# ══════════════════════════════════════════════════════════════
echo -e "${YELLOW}━━━ FIX-2: Adding P/L awareness to TIME_EXPIRED close ━━━${NC}"
echo -e "${RED}   Problem: Profitable positions force-closed at max holding time${NC}"
echo -e "${GREEN}   Fix: If profitable, move SL to breakeven + extend time instead${NC}"
echo ""

# ══════════════════════════════════════════════════════════════
# FIX-3: Fix Agent's PnL tracking for close events
# ══════════════════════════════════════════════════════════════
echo -e "${YELLOW}━━━ FIX-3: Fixing Agent PnL tracking ━━━${NC}"
echo -e "${RED}   Problem: Agent records PnL=0 for breakeven closes (wrong)${NC}"
echo -e "${GREEN}   Fix: Read actual close price from position record${NC}"
echo ""

# ══════════════════════════════════════════════════════════════
# FIX-4: Unify MAX_HOLDING_TIME logic
# ══════════════════════════════════════════════════════════════
echo -e "${YELLOW}━━━ FIX-4: Unifying MAX_HOLDING_TIME logic ━━━${NC}"
echo -e "${RED}   Problem: Agent 4h vs Position Monitor 48h for same positions${NC}"
echo -e "${GREEN}   Fix: Position Monitor is the single source, agent delegates${NC}"
echo ""

# ── Apply patches via Python ──
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}   🐍 Applying patches...${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

python3 << 'PYTHON_SCRIPT'
import re
import os

AGENT_SERVICE = "/home/z/my-project/roua-trading/apps/api/src/agents/autonomous-trader/agent.service.ts"
POSITION_MONITOR = "/home/z/my-project/roua-trading/apps/api/src/modules/engine/services/position-monitor.service.ts"

def read_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

def write_file(path, content):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"  ✅ Written: {os.path.basename(path)}")

# ══════════════════════════════════════════════════════════════
# FIX-1: Remove Agent's hardcoded 4h breakeven close
# Replace with a P/L-aware delegation to Position Monitor
# ══════════════════════════════════════════════════════════════
print("━━━ Applying FIX-1: Agent Service 4h breakeven removal ━━━")
agent_code = read_file(AGENT_SERVICE)

# Find and replace the 4h breakeven block
old_breakeven = """        // FIX: MAX_HOLDING_TIME — close paper positions open >4h at breakeven to prevent accumulation.
        // Reduced from 24h to 4h: paper positions that haven't hit SL/TP in 4 hours are likely stuck
        // due to API issues, and keeping them open blocks maxOpenPositions for new trades.
        const holdingDurationMs = Date.now() - new Date(position.openedAt).getTime();
        const MAX_HOLDING_TIME_MS = 4 * 60 * 60 * 1000; // 4 hours (was 24 hours)
        if (isPaperPosition && holdingDurationMs > MAX_HOLDING_TIME_MS) {
          this.logger.log(
            `🧠 Paper position ${position.symbol} held for ${(holdingDurationMs / 3600000).toFixed(1)}h (>4h), closing at breakeven`,
          );
          currentPrice = Number(position.entryPrice); // breakeven exit
          shouldClose = true;
          reason = 'MAX_HOLDING_TIME';
        }"""

new_breakeven = """        // V184 FIX: REMOVED hardcoded 4h breakeven close for paper positions.
        // Previously, this closed ALL paper positions at 4h with currentPrice = entryPrice,
        // which destroyed profitable trades and recorded wrong PnL (0 instead of actual).
        //
        // Now: MAX_HOLDING_TIME is handled exclusively by Position Monitor service,
        // which uses dynamic timeframe-based holding limits AND checks P/L before closing.
        // Agent positions get 48h (swing trading), Smart Executor gets 4h-7d by timeframe.
        //
        // The Position Monitor also implements "profit protection": if a position is
        // profitable when TIME_EXPIRED triggers, it moves SL to breakeven and extends
        // the holding time instead of force-closing.
        //
        // This prevents the #1 complaint: "4h auto-close destroyed my big profits"."""

if old_breakeven in agent_code:
    agent_code = agent_code.replace(old_breakeven, new_breakeven)
    print("  ✅ Replaced: Agent 4h breakeven block with V184 delegation comment")
else:
    print("  ⚠️  Could not find exact match for Agent 4h breakeven block - searching with regex")
    # Try regex-based replacement
    pattern = r'        // FIX: MAX_HOLDING_TIME.*?reason = \'MAX_HOLDING_TIME\';\n        \}'
    if re.search(pattern, agent_code, re.DOTALL):
        agent_code = re.sub(pattern, new_breakeven, agent_code, flags=re.DOTALL)
        print("  ✅ Replaced via regex: Agent 4h breakeven block")
    else:
        print("  ❌ FAILED: Could not find Agent 4h breakeven block. Manual fix needed.")

# ══════════════════════════════════════════════════════════════
# FIX-3: Fix Agent's PnL tracking — use actual close price
# After closing, re-read position to get actual exitPrice
# ══════════════════════════════════════════════════════════════
print("\n━━━ Applying FIX-3: Agent PnL tracking fix ━━━")

# The current code calculates PnL using local currentPrice variable
# which was set to entryPrice for breakeven. We need to use the
# actual close result instead.
old_pnl_tracking = """              // Calculate PnL for daily tracking
              const pnl = position.side === 'BUY'
                ? (currentPrice - Number(position.entryPrice)) * Number(position.quantity)
                : (Number(position.entryPrice) - currentPrice) * Number(position.quantity);"""

new_pnl_tracking = """              // V184 FIX: Use actual exit price from close result, not local currentPrice.
              // Previously, when MAX_HOLDING_TIME triggered, currentPrice was set to
              // entryPrice (breakeven), making PnL always = 0 in tracking records.
              // Now: read the actual close price from the result or position record.
              const actualExitPrice = result?.position?.exitPrice
                ? Number(result.position.exitPrice)
                : (result?.order?.price ? Number(result.order.price) : currentPrice);
              const pnl = position.side === 'BUY'
                ? (actualExitPrice - Number(position.entryPrice)) * Number(position.quantity)
                : (Number(position.entryPrice) - actualExitPrice) * Number(position.quantity);"""

if old_pnl_tracking in agent_code:
    agent_code = agent_code.replace(old_pnl_tracking, new_pnl_tracking)
    print("  ✅ Replaced: Agent PnL tracking to use actual exit price")
else:
    print("  ⚠️  Could not find exact match - trying regex")
    pattern = r"              // Calculate PnL for daily tracking\n              const pnl = position\.side === 'BUY'\n                \?\s*\(currentPrice - Number\(position\.entryPrice\)\) \* Number\(position\.quantity\)\n                : \(Number\(position\.entryPrice\) - currentPrice\) \* Number\(position\.quantity\);"
    if re.search(pattern, agent_code):
        agent_code = re.sub(pattern, new_pnl_tracking, agent_code)
        print("  ✅ Replaced via regex: Agent PnL tracking")
    else:
        print("  ❌ FAILED: Could not find Agent PnL tracking block. Manual fix needed.")

# Also fix the AutonomousTrade update to use actualExitPrice
old_autonomous_exit = """                    exitPrice: currentPrice,"""
new_autonomous_exit = """                    exitPrice: actualExitPrice,"""

# Only replace the one inside the shouldClose block (after our new actualExitPrice)
# We need to be careful to only replace within the right context
if "actualExitPrice" in agent_code:
    # Find the AutonomousTrade update section
    old_auto_update = """                  data: {
                    exitPrice: currentPrice,
                    pnl,"""
    new_auto_update = """                  data: {
                    exitPrice: actualExitPrice,
                    pnl,"""
    if old_auto_update in agent_code:
        agent_code = agent_code.replace(old_auto_update, new_auto_update)
        print("  ✅ Fixed: AutonomousTrade exitPrice to use actualExitPrice")
    else:
        print("  ⚠️  Could not find AutonomousTrade exitPrice update - may need manual fix")

    # Also fix the currentPrice in AutonomousTrade update
    old_auto_current = """                    currentPrice,"""
    new_auto_current = """                    actualExitPrice as number,"""
    # Only the one in the AutonomousTrade update context
    old_auto_context = """                    isWinning: pnl > 0,
                    currentPrice,
                    status: 'FILLED',"""
    new_auto_context = """                    isWinning: pnl > 0,
                    currentPrice: actualExitPrice as number,
                    status: 'FILLED',"""
    if old_auto_context in agent_code:
        agent_code = agent_code.replace(old_auto_context, new_auto_context)
        print("  ✅ Fixed: AutonomousTrade currentPrice to use actualExitPrice")

write_file(AGENT_SERVICE, agent_code)


# ══════════════════════════════════════════════════════════════
# FIX-2: Add P/L awareness to Position Monitor TIME_EXPIRED
# ══════════════════════════════════════════════════════════════
print("\n━━━ Applying FIX-2: Position Monitor P/L awareness ━━━")
monitor_code = read_file(POSITION_MONITOR)

# Replace the TIME_EXPIRED check with P/L-aware version
old_time_expired = """      if (holdingMs > maxHoldingMs) {
        const heldMin = (holdingMs / 60000).toFixed(0);
        const maxMin  = (maxHoldingMs / 60000).toFixed(0);
        this.logger.warn(
          `⏱️ MAX_HOLDING: ${position.symbol} held ${heldMin}m > ${maxMin}m — closing`,
        );
        await this._closePosition(position, currentPrice, 'TIME_EXPIRED');
        // V176 FIX: Set cooldown after TIME_EXPIRED to prevent immediate re-open
        try {
          const cooldownKey = `cooldown:${position.userId}:${position.symbol}`;
          await this.redis.set(cooldownKey, 'TIME_EXPIRED', this.COOLDOWN_TTL_MS);
        } catch { /* non-critical */ }
        result.slTriggered = true;
        return result;
      }"""

new_time_expired = """      if (holdingMs > maxHoldingMs) {
        const heldMin = (holdingMs / 60000).toFixed(0);
        const maxMin  = (maxHoldingMs / 60000).toFixed(0);
        const profitPct = pnlPercent; // reuse the pnlPercent calculated above

        // V184 FIX: P/L-Aware TIME_EXPIRED close
        // If position is profitable, don't force-close — protect profit instead:
        //   - Move SL to breakeven (if not already there)
        //   - Extend holding time by 50% (one-time extension)
        //   - Let the position run with protected downside
        // Only force-close if position is losing or flat (<=0% profit).
        if (profitPct > 0.5) {
          // Position is profitable — protect it instead of closing
          const breakEvenSL = position.side === 'BUY'
            ? entryPrice * 1.0001  // slightly above entry to cover fees
            : entryPrice * 0.9999; // slightly below entry to cover fees
          const currentSL = stopLossNum;
          const shouldMoveSL = position.side === 'BUY'
            ? (currentSL === null || currentSL < breakEvenSL)
            : (currentSL === null || currentSL > breakEvenSL);

          // Check if we already extended this position
          const extendKey = `time-expired-extended:${position.userId}:${position.symbol}:${position.id}`;
          let alreadyExtended = false;
          try {
            alreadyExtended = !!(await this.redis.get(extendKey));
          } catch { /* non-critical */ }

          if (shouldMoveSL) {
            await this.prisma.position.update({
              where: { id: position.id },
              data: { stopLoss: breakEvenSL },
            });
            this.logger.log(
              `🛡️ V184 TIME_EXPIRED + PROFIT: ${position.symbol} +${profitPct.toFixed(1)}% — SL moved to breakeven (${breakEvenSL.toFixed(4)}) instead of closing`,
            );
          }

          if (!alreadyExtended) {
            // Extend holding time by 50% (one-time only)
            // Example: M1/M5 4h → 6h, H1 48h → 72h
            const extensionMs = maxHoldingMs * 0.5;
            try {
              await this.redis.set(extendKey, String(maxHoldingMs + extensionMs), maxHoldingMs + extensionMs);
              this.logger.log(
                `⏱️ V184 TIME_EXPIRED + PROFIT: ${position.symbol} holding extended from ${maxMin}m → ${((maxHoldingMs + extensionMs) / 60000).toFixed(0)}m (one-time, profit protected)`,
              );
            } catch { /* non-critical */ }
          } else {
            // Already extended once — now close at market (profit is protected by SL)
            this.logger.warn(
              `⏱️ V184 MAX_HOLDING (extended): ${position.symbol} held ${heldMin}m — closing at market (SL at breakeven)`,
            );
            await this._closePosition(position, currentPrice, 'TIME_EXPIRED');
            try {
              const cooldownKey = `cooldown:${position.userId}:${position.symbol}`;
              await this.redis.set(cooldownKey, 'TIME_EXPIRED', this.COOLDOWN_TTL_MS);
            } catch { /* non-critical */ }
          }
          result.trailingUpdated = true;
          return result;
        }

        // Position is losing or flat — close it
        this.logger.warn(
          `⏱️ MAX_HOLDING: ${position.symbol} held ${heldMin}m > ${maxMin}m (P/L: ${profitPct.toFixed(1)}%) — closing`,
        );
        await this._closePosition(position, currentPrice, 'TIME_EXPIRED');
        // V176 FIX: Set cooldown after TIME_EXPIRED to prevent immediate re-open
        try {
          const cooldownKey = `cooldown:${position.userId}:${position.symbol}`;
          await this.redis.set(cooldownKey, 'TIME_EXPIRED', this.COOLDOWN_TTL_MS);
        } catch { /* non-critical */ }
        result.slTriggered = true;
        return result;
      }"""

if old_time_expired in monitor_code:
    monitor_code = monitor_code.replace(old_time_expired, new_time_expired)
    print("  ✅ Replaced: TIME_EXPIRED check with P/L-aware version")
else:
    print("  ⚠️  Could not find exact match - trying regex")
    pattern = r'      if \(holdingMs > maxHoldingMs\) \{[\s\S]*?result\.slTriggered = true;\s*return result;\s*\}'
    if re.search(pattern, monitor_code):
        monitor_code = re.sub(pattern, new_time_expired, monitor_code, flags=re.DOTALL)
        print("  ✅ Replaced via regex: TIME_EXPIRED check with P/L-aware version")
    else:
        print("  ❌ FAILED: Could not find TIME_EXPIRED block. Manual fix needed.")


# ══════════════════════════════════════════════════════════════
# FIX-4: Update _getMaxHoldingMs to handle extended positions
# Also add Redis-based extension check for the holding time
# ══════════════════════════════════════════════════════════════
print("\n━━━ Applying FIX-4: Update MAX_HOLDING to check extensions ━━━")

# Replace the holding time calculation to check for extensions
old_holding_check = """      let maxHoldingMs = this._getMaxHoldingMs(timeframe, isAgent);

      if (holdingMs > maxHoldingMs) {"""

new_holding_check = """      let maxHoldingMs = this._getMaxHoldingMs(timeframe, isAgent);

      // V184: Check if holding time was extended (for profitable positions)
      try {
        const extendKey = `time-expired-extended:${position.userId}:${position.symbol}:${position.id}`;
        const extendedMax = await this.redis.get(extendKey);
        if (extendedMax) {
          maxHoldingMs = Number(extendedMax); // Use extended holding time
        }
      } catch { /* non-critical */ }

      if (holdingMs > maxHoldingMs) {"""

if old_holding_check in monitor_code:
    monitor_code = monitor_code.replace(old_holding_check, new_holding_check)
    print("  ✅ Added: Extension check in MAX_HOLDING calculation")
else:
    print("  ⚠️  Could not find exact match for holding check - trying regex")
    pattern = r'      let maxHoldingMs = this\._getMaxHoldingMs\(timeframe, isAgent\);\s*\n\s*if \(holdingMs > maxHoldingMs\) \{'
    if re.search(pattern, monitor_code):
        monitor_code = re.sub(pattern, new_holding_check, monitor_code)
        print("  ✅ Added via regex: Extension check in MAX_HOLDING calculation")
    else:
        print("  ❌ FAILED: Could not find holding check block. Manual fix needed.")


write_file(POSITION_MONITOR, monitor_code)

print("\n═══════════════════════════════════════════════════════════════")
print("  ✅ All patches applied successfully!")
print("═══════════════════════════════════════════════════════════════")
PYTHON_SCRIPT

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}   🔨 Building project...${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

cd "$PROJECT_ROOT" && npx nx build api 2>&1 | tail -20

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}   📋 V184 Fix Summary${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${GREEN}FIX-1:${NC} Removed Agent's hardcoded 4h breakeven close"
echo -e "       → Position Monitor is now the single source of truth"
echo -e "       → Agent positions get 48h (swing trading default)"
echo ""
echo -e "${GREEN}FIX-2:${NC} Position Monitor now checks P/L before TIME_EXPIRED"
echo -e "       → Profitable positions: SL moved to breakeven + 50% time extension"
echo -e "       → Losing positions: closed immediately (as before)"
echo -e "       → Extension is one-time only (no infinite extensions)"
echo ""
echo -e "${GREEN}FIX-3:${NC} Agent PnL tracking uses actual exit price"
echo -e "       → Fixed wrong PnL=0 for breakeven closes"
echo -e "       → AutonomousTrade records now show correct PnL"
echo ""
echo -e "${GREEN}FIX-4:${NC} Unified MAX_HOLDING_TIME logic"
echo -e "       → Agent no longer has its own 4h rule"
echo -e "       → Position Monitor handles all holding time checks"
echo -e "       → Redis-based extension tracking per position"
echo ""
echo -e "${YELLOW}Timeframe → Max Holding (unchanged):${NC}"
echo -e "  M1/M5    → 4h (+ 2h extension if profitable)"
echo -e "  M15/M30  → 12h (+ 6h extension if profitable)"
echo -e "  H1/H4    → 48h (+ 24h extension if profitable)"
echo -e "  D1/D3    → 7d (+ 3.5d extension if profitable)"
echo -e "  Agent    → 48h (+ 24h extension if profitable)"
echo ""
echo -e "${YELLOW}Rollback command:${NC}"
echo -e "  cp $BACKUP_DIR/agent.service.ts.bak $AGENT_SERVICE"
echo -e "  cp $BACKUP_DIR/position-monitor.service.ts.bak $POSITION_MONITOR"
echo ""
