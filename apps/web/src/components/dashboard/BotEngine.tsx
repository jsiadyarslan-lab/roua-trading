'use client';

import { useEffect, useRef, useState } from 'react';
import { useBotStore } from '@/hooks/useBotStore';
import { useSymbolStore } from '@/hooks/useSymbolStore';
import { useNotificationStore } from '@/hooks/useNotificationStore';

export function BotEngine({ quotes = new Map() }: { quotes?: Map<string, any> }) {
  const { isOn, addLog, settings } = useBotStore();
  const { addNotification } = useNotificationStore();
  const { selectedSymbol } = useSymbolStore();
  const lastSignalRef = useRef<string | null>(null);
  const quotesRef = useRef(quotes);
  const [hydrated, setHydrated] = useState(false);

  // Zustand persist hydration check
  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    quotesRef.current = quotes;
  }, [quotes]);

  useEffect(() => {
    if (!hydrated || !isOn) return;
    addLog(`تم تفعيل نظام التداول الآلي استراتيجية: ${settings.strategy}`, 'info');
  }, [isOn, hydrated]); // Only log when turning ON

  useEffect(() => {
    if (!hydrated || !isOn) return;

    const interval = setInterval(() => {
      const currentQuotes = quotesRef.current;
      const q = currentQuotes.get(selectedSymbol);
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
        const msg = `[${settings.strategy}] إشارة ${signal === 'BUY' ? 'شراء' : 'بيع'} بقوة ${confidence.toFixed(0)}% على ${selectedSymbol}`;
        addLog(msg, signal === 'BUY' ? 'buy' : 'sell');
        addNotification({
          title: signal === 'BUY' ? '⚡️ إشارة شراء بوت' : '🔻 إشارة بيع بوت',
          message: msg,
          type: 'trade'
        });
        lastSignalRef.current = signal;
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isOn, hydrated, selectedSymbol, settings.strategy, settings.confLimit, addLog]);

  return null;
}
