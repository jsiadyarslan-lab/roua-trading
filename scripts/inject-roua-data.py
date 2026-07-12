#!/usr/bin/env python3
"""V469: Add roua-trading user data section before last 'return sections.join' in data-fetcher.ts"""

import sys

filepath = 'apps/web/src/lib/assistant/data-fetcher.ts'
content = open(filepath, 'r', encoding='utf-8').read()

# Find the LAST occurrence of 'return sections.join'
marker = "  return sections.join('\\n');"
last_idx = content.rfind(marker)
if last_idx == -1:
    print('ERROR: marker not found')
    sys.exit(1)

print(f'Found marker at index {last_idx}')

# Build the new section
new_section = """  // ═══ V469: roua-trading User Data (صفقات + مجلس + إحصائيات) ═══
  if (data.userPositions && data.userPositions.length > 0) {
    sections.push(isAr
      ? `\\n═══ 📊 صفقاتك المفتوحة (من NestJS — بيانات حقيقية) ═══`
      : `\\n═══ 📊 Your Open Positions (from NestJS — real data) ═══`);
    for (const p of data.userPositions) {
      const pnlStr = p.unrealizedPnl >= 0
        ? `+${p.unrealizedPnl.toFixed(2)}$ (+${p.unrealizedPnlPercent.toFixed(2)}%)`
        : `${p.unrealizedPnl.toFixed(2)}$ (${p.unrealizedPnlPercent.toFixed(2)}%)`;
      const sl = p.stopLoss ? `SL: ${p.stopLoss}` : 'SL: غير محدد';
      const tp = p.takeProfit ? `TP: ${p.takeProfit}` : 'TP: غير محدد';
      const duration = p.durationMinutes > 60
        ? `${(p.durationMinutes / 60).toFixed(1)} ساعة`
        : `${p.durationMinutes} دقيقة`;
      sections.push(
        `• ${p.symbol} ${p.side} | دخول: ${p.entryPrice} | حالي: ${p.currentPrice} | PnL: ${pnlStr} | ${sl} | ${tp} | المدة: ${duration} | المصدر: ${p.source ?? 'يدوي'}`,
      );
    }
    sections.push('');
  }

  if (data.userClosedTrades && data.userClosedTrades.length > 0) {
    sections.push(isAr
      ? `\\n═══ 📋 آخر صفقاتك المغلقة ═══`
      : `\\n═══ 📋 Your Recent Closed Trades ═══`);
    for (const t of data.userClosedTrades) {
      const resultIcon = t.result === 'WIN' ? '🟢' : t.result === 'LOSS' ? '🔴' : '🟡';
      sections.push(
        `${resultIcon} ${t.symbol} ${t.side} | دخول: ${t.entryPrice} | خروج: ${t.exitPrice} | PnL: ${t.realizedPnl.toFixed(2)}$ | النتيجة: ${t.result} | السبب: ${t.closeReason ?? 'غير محدد'}`,
      );
    }
    sections.push('');
  }

  if (data.councilBriefs && data.councilBriefs.length > 0) {
    sections.push(isAr
      ? `\\n═══ 🏛️ تصويتات المجلس الاستراتيجي (من NestJS) ═══`
      : `\\n═══ 🏛️ Strategic Council Votes (from NestJS) ═══`);
    for (const b of data.councilBriefs) {
      const dirIcon = b.direction === 'BUY' ? '🟢' : '🔴';
      sections.push(
        `${dirIcon} ${b.symbol} ${b.direction} | ثقة: ${b.confidence}% | فريم: ${b.timeframe} | دخول: ${b.entryPrice} | SL: ${b.stopLoss} | TP: ${b.takeProfit}`,
      );
      if (b.analysisSummary) {
        sections.push(`   الملخص: ${b.analysisSummary.slice(0, 200)}`);
      }
    }
    sections.push('');
  }

  if (data.userStats) {
    const s = data.userStats;
    sections.push(isAr
      ? `\\n═══ 📈 إحصائياتك (آخر 30 يوم) ═══`
      : `\\n═══ 📈 Your Stats (last 30 days) ═══`);
    sections.push(
      `• إجمالي الصفقات: ${s.totalTrades} | فوز: ${s.wins} | خسارة: ${s.losses} | Win Rate: ${s.winRate.toFixed(1)}%`,
    );
    sections.push(`• صافي PnL: ${s.totalPnl.toFixed(2)}$ | Profit Factor: ${s.profitFactor.toFixed(2)}`);
    sections.push(
      `• الرصيد المعروض: ${s.displayedBalance.toFixed(2)}$ | الهامش المستخدم: ${s.usedMargin.toFixed(2)}$ | المخاطرة: ${s.riskExposurePercent.toFixed(1)}%`,
    );
    sections.push('');
  }

"""

new_content = content[:last_idx] + new_section + content[last_idx:]
open(filepath, 'w', encoding='utf-8').write(new_content)
print(f'OK — added {len(new_section)} chars before last return at index {last_idx}')
