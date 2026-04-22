'use client';

import { useEffect, useRef } from 'react';
import { useBotStore } from '@/hooks/useBotStore';
import { useSymbolStore } from '@/hooks/useSymbolStore';

export function BotEngine({ quotes = new Map() }: { quotes?: Map<string, any> }) {
  const { isOn, addLog } = useBotStore();
  const { selectedSymbol } = useSymbolStore();
  const lastSignalRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOn) return;

    addLog('بدء جلسة مراقبة جديدة...', 'info');
    
    const interval = setInterval(() => {
      const q = quotes.get(selectedSymbol);
      if (!q) return;

      const change = q.changePercent || 0;
      let signal = null;

      if (change > 2.5 && lastSignalRef.current !== 'BUY') {
        signal = 'BUY';
      } else if (change < -2.5 && lastSignalRef.current !== 'SELL') {
        signal = 'SELL';
      }

      if (signal) {
        addLog(`[إشارة آليّة] تم رصد فرصة ${signal === 'BUY' ? 'شراء' : 'بيع'} على ${selectedSymbol} (تغير ${change}%)`, signal === 'BUY' ? 'buy' : 'sell');
        lastSignalRef.current = signal;
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isOn, selectedSymbol, quotes, addLog]);

  return null; // This component has no UI
}
