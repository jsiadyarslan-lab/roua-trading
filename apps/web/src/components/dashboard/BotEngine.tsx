'use client';

import { useEffect, useRef, useState } from 'react';
import { useBotStore } from '@/hooks/useBotStore';
import { useSymbolStore } from '@/hooks/useSymbolStore';
import { useMarketStore } from '@/hooks/useMarketStore';

export function BotEngine() {
  const { isOn, addLog, settings } = useBotStore();
  const { selectedSymbol } = useSymbolStore();
  const globalQuotes = useMarketStore(state => state.quotes);
  const lastSignalRef = useRef<string | null>(null);
  const quotesRef = useRef(globalQuotes);
  const [hydrated, setHydrated] = useState(false);

  // Zustand persist hydration check
  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    quotesRef.current = globalQuotes;
  }, [globalQuotes]);

  useEffect(() => {
    if (!hydrated || !isOn) return;
    addLog(`تم تفعيل نظام التداول الآلي استراتيجية: ${settings.strategy}`, 'info');
  }, [isOn, hydrated]); // Only log when turning ON

  useEffect(() => {
    if (!hydrated || !isOn) return;

    const interval = setInterval(() => {
      const currentQuotes = quotesRef.current;
      const q = currentQuotes[selectedSymbol];
      if (!q) return;

      const change = q.changePercent || 0;
      let signal = null;

      // Use the confLimit from settings (mocking logic here)
      // If change is high enough, we consider it "confident"
      const confidence = Math.min(99, Math.abs(change) * 20);

      if (confidence >= settings.confLimit) {
        if (change > 0 && lastSignalRef.current !== 'BUY') {
          signal = 'BUY';
        } else if (change < 0 && lastSignalRef.current !== 'SELL') {
          signal = 'SELL';
        }
      }

      if (signal) {
        addLog(`[${settings.strategy}] جاري تجهيز أمر ${signal === 'BUY' ? 'شراء' : 'بيع'} على ${selectedSymbol}...`, 'info');
        lastSignalRef.current = signal;
        
        // Calculate trade size. We'll use notional (USD amount) for simplicity.
        // E.g., if riskPct is 2%, and we assume a fixed standard portfolio size (or just use riskPct * 10 dollars)
        // A safer default for paper trading is using $100 notional
        const tradeAmount = Math.max(10, settings.riskPct * 50);

        fetch('/api/alpaca/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: selectedSymbol,
            side: signal.toLowerCase(),
            notional: tradeAmount,
            type: 'market'
          })
        }).then(res => res.json()).then(data => {
          if (data.success) {
            addLog(`[تنفيذ ناجح] تم تنفيذ أمر ${signal === 'BUY' ? 'شراء' : 'بيع'} بقيمة $${tradeAmount}`, signal === 'BUY' ? 'buy' : 'sell');
            useBotStore.getState().setStats({
              ...useBotStore.getState().stats,
              trades: useBotStore.getState().stats.trades + 1
            });
          } else {
            addLog(`[فشل التنفيذ] ${data.error}`, 'warn');
            lastSignalRef.current = null; // reset so it tries again later
          }
        }).catch(err => {
          addLog(`[خطأ بالشبكة] فشل الاتصال بمحرك التنفيذ`, 'warn');
          lastSignalRef.current = null;
        });
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isOn, hydrated, selectedSymbol, settings.strategy, settings.confLimit, settings.riskPct, addLog]);

  return null;
}
