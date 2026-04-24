'use client';

import { useEffect, useRef, useState } from 'react';
import { useBotStore } from '@/hooks/useBotStore';
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore';
import { useNotificationStore } from '@/hooks/useNotificationStore';

// ⚠️ PAPER TRADING MODE: Set to true to prevent real orders
const PAPER_TRADING_MODE = true;

export function BotEngine() {
  const { isOn, addLog, settings } = useBotStore();
  const addPaperTrade = usePaperTradesStore(state => state.addTrade);
  const addNotification = useNotificationStore(state => state.addNotification);
  const tradesRef = useRef(usePaperTradesStore.getState().trades);
  const lastExecutionRef = useRef<Record<string, number>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => { setHydrated(true); }, []);
  useEffect(() => {
    const unsubscribe = usePaperTradesStore.subscribe(state => {
      tradesRef.current = state.trades;
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!hydrated || !isOn) return;
    const mode = PAPER_TRADING_MODE ? '[Paper Trading 📄]' : '[Live Trading ⚡]';
    addLog(`${mode} تم تفعيل نظام التداول الآلي — استراتيجية: ${settings.strategy}`, 'info');
  }, [isOn, hydrated]); // eslint-disable-line

  useEffect(() => {
    if (!hydrated || !isOn) return;

    let isScanning = false;
    const scanAll = async () => {
      if (isScanning) return;
      isScanning = true;
      let executedCount = 0;

      try {
        const res = await fetch('/api/market-scan', { cache: 'no-store' });
        const payload = await res.json();
        const signals = Array.isArray(payload?.data) ? payload.data : [];

        for (const signalData of signals) {
          if (!isOn) break;

          const sym = signalData.pair;
          const confidence = Number(signalData.strength || 0);
          const price = Number(signalData.price || 0);
          const signal = signalData.dir === 'buy' ? 'BUY' : signalData.dir === 'sell' ? 'SELL' : null;

          if (!signal || !price || confidence < settings.confLimit) continue;

          const executionKey = `${sym}:${signal}`;
          const existingBotTrade = tradesRef.current.some(trade =>
            trade.source === 'bot' &&
            trade.symbol === sym &&
            ((trade.side === 'long' && signal === 'BUY') || (trade.side === 'short' && signal === 'SELL'))
          );
          const lastExecutedAt = lastExecutionRef.current[executionKey] || 0;
          const cooldownMs = 5 * 60 * 1000;

          if (existingBotTrade || Date.now() - lastExecutedAt < cooldownMs) {
            continue;
          }

          _executeTrade(sym, price, confidence, signal, signalData.reasons || []);
          lastExecutionRef.current[executionKey] = Date.now();
          executedCount += 1;

          if (executedCount >= 2) break;
        }
      } catch (error) {
        console.error('[BotEngine] market-scan failed', error);
        addLog('[خطأ] فشل البوت في قراءة نتائج السكانر', 'warn');
      }

      if (executedCount === 0) {
        addLog(`[تحليل] اكتمل مسح السوق — لا توجد إشارات قابلة للتنفيذ الآن (${new Date().toLocaleTimeString('ar-SA')})`, 'info');
      } else {
        addLog(`[تنفيذ آلي] تم تنفيذ ${executedCount} صفقة من نتائج السكانر`, 'buy');
      }
      isScanning = false;
    };

    scanAll();
    const interval = setInterval(scanAll, 30000); // Full market scan every 30s
    return () => clearInterval(interval);
  }, [isOn, hydrated, settings.confLimit]); // eslint-disable-line

  // Helper to execute trades (refactored out of main loop)
  const _executeTrade = (symbol: string, price: number, confidence: number, signal: 'BUY' | 'SELL', reasons: string[]) => {
      const tradeAmount = Math.max(10, settings.riskPct * 50);
      const qty = parseFloat((tradeAmount / price).toFixed(6));
      const tp = signal === 'BUY' ? price * 1.02 : price * 0.98;
      const sl = signal === 'BUY' ? price * 0.99 : price * 1.01;

      if (PAPER_TRADING_MODE) {
        addLog(
          `[Paper] ${settings.strategy} → ${signal === 'BUY' ? '📈 شراء' : '📉 بيع'} ${symbol} | ${qty} @ $${price.toFixed(2)} | ثقة: ${confidence.toFixed(0)}% | ${reasons[0] || 'إشارة سكانر'}`,
          signal === 'BUY' ? 'buy' : 'sell'
        );

        addPaperTrade({
          symbol,
          side:         signal === 'BUY' ? 'long' : 'short',
          qty,
          entryPrice:   price,
          currentPrice: price,
          tp,
          sl,
          entryTime:    Date.now(),
          strategy:     settings.strategy,
          source:       'bot',
        });

        useBotStore.getState().setStats({
          ...useBotStore.getState().stats,
          trades: useBotStore.getState().stats.trades + 1,
        });
        addNotification({
          source: 'bot',
          priority: confidence >= 80 ? 'high' : 'medium',
          action: signal,
          title: `البوت نفذ ${signal === 'BUY' ? 'شراء' : 'بيع'} على ${symbol}`,
          body: `${reasons[0] || 'إشارة سكانر'} · ثقة ${confidence.toFixed(0)}%`,
          pair: symbol,
          price,
          confidence,
        });

      } else {
        addLog(`[Live] تنفيذ أمر ${signal === 'BUY' ? 'شراء' : 'بيع'} ذكاء اصطناعي على ${symbol}...`, 'info');

        fetch('/api/alpaca/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol, side: signal.toLowerCase(), notional: tradeAmount, type: 'market' }),
        })
          .then(r => r.json())
          .then(data => {
            if (data.success) {
              addLog(`[تنفيذ ناجح] ${signal === 'BUY' ? 'شراء' : 'بيع'} $${tradeAmount} على ${symbol}`, signal === 'BUY' ? 'buy' : 'sell');
              useBotStore.getState().setStats({ ...useBotStore.getState().stats, trades: useBotStore.getState().stats.trades + 1 });
            } else {
              addLog(`[فشل] ${data.error}`, 'warn');
            }
          })
          .catch(() => { addLog(`[خطأ] فشل الاتصال لـ ${symbol}`, 'warn'); });
      }
  };

  return null;
}
