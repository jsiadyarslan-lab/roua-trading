'use client';

import { useEffect, useRef, useState } from 'react';
import { useBotStore } from '@/hooks/useBotStore';
import { useSymbolStore } from '@/hooks/useSymbolStore';
import { useMarketStore } from '@/hooks/useMarketStore';
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore';

// ⚠️ PAPER TRADING MODE: Set to true to prevent real orders
const PAPER_TRADING_MODE = true;

export function BotEngine() {
  const { isOn, addLog, settings } = useBotStore();
  const { selectedSymbol } = useSymbolStore();
  const globalQuotes = useMarketStore(state => state.quotes);
  const addPaperTrade = usePaperTradesStore(state => state.addTrade);
  const lastSignalRef = useRef<string | null>(null);
  const quotesRef = useRef(globalQuotes);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => { setHydrated(true); }, []);
  useEffect(() => { quotesRef.current = globalQuotes; }, [globalQuotes]);

  useEffect(() => {
    if (!hydrated || !isOn) return;
    const mode = PAPER_TRADING_MODE ? '[Paper Trading 📄]' : '[Live Trading ⚡]';
    addLog(`${mode} تم تفعيل نظام التداول الآلي — استراتيجية: ${settings.strategy}`, 'info');
  }, [isOn, hydrated]); // eslint-disable-line

  useEffect(() => {
    if (!hydrated || !isOn) return;

    const interval = setInterval(() => {
      const q = quotesRef.current[selectedSymbol];
      if (!q || !q.price) return;

      const change = q.changePercent || 0;

      // AI CONSENSUS MODE
      if (settings.useAIConsensus) {
        fetch('/api/ai/consensus', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: selectedSymbol }),
        })
          .then(r => r.json())
          .then(j => {
            if (j.success && j.data.consensusScore >= 85) {
              const signal = j.data.recommendation;
              if (signal === 'BUY' || signal === 'SELL') {
                this._executeTrade(signal, q.price, j.data.consensusScore);
              }
            }
          })
          .catch(e => console.error('AI Consensus failed', e));
        return;
      }

      // MOMENTUM MODE (Fallback)
      const confidence = Math.min(99, Math.abs(change) * 20);
      if (confidence < settings.confLimit) return;

      let signal: 'BUY' | 'SELL' | null = null;
      if (change > 0 && lastSignalRef.current !== 'BUY')  signal = 'BUY';
      else if (change < 0 && lastSignalRef.current !== 'SELL') signal = 'SELL';
      
      if (signal) {
        this._executeTrade(signal, q.price, confidence);
      }
    }, 10000); // Slower interval for AI calls

    return () => clearInterval(interval);
  }, [isOn, hydrated, selectedSymbol, settings.strategy, settings.confLimit, settings.riskPct, settings.useAIConsensus, addLog, addPaperTrade]); // eslint-disable-line

  // Helper to execute trades (refactored out of main loop)
  const _executeTrade = (signal: 'BUY' | 'SELL', price: number, confidence: number) => {
      const tradeAmount = Math.max(10, settings.riskPct * 50);
      const qty = parseFloat((tradeAmount / price).toFixed(6));
      const tp = signal === 'BUY' ? price * 1.02 : price * 0.98;
      const sl = signal === 'BUY' ? price * 0.99 : price * 1.01;

      if (PAPER_TRADING_MODE) {
        addLog(
          `[Paper] ${settings.strategy} → ${signal === 'BUY' ? '📈 شراء' : '📉 بيع'} ${selectedSymbol} | ${qty} @ $${price.toFixed(2)} | ثقة: ${confidence.toFixed(0)}%`,
          signal === 'BUY' ? 'buy' : 'sell'
        );

        addPaperTrade({
          symbol:       selectedSymbol,
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

        lastSignalRef.current = signal;
        useBotStore.getState().setStats({
          ...useBotStore.getState().stats,
          trades: useBotStore.getState().stats.trades + 1,
        });

      } else {
        addLog(`[Live] تنفيذ أمر ${signal === 'BUY' ? 'شراء' : 'بيع'} ذكاء اصطناعي على ${selectedSymbol}...`, 'info');
        lastSignalRef.current = signal;

        fetch('/api/alpaca/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: selectedSymbol, side: signal.toLowerCase(), notional: tradeAmount, type: 'market' }),
        })
          .then(r => r.json())
          .then(data => {
            if (data.success) {
              addLog(`[تنفيذ ناجح] ${signal === 'BUY' ? 'شراء' : 'بيع'} $${tradeAmount}`, signal === 'BUY' ? 'buy' : 'sell');
              useBotStore.getState().setStats({ ...useBotStore.getState().stats, trades: useBotStore.getState().stats.trades + 1 });
            } else {
              addLog(`[فشل] ${data.error}`, 'warn');
              lastSignalRef.current = null;
            }
          })
          .catch(() => { addLog(`[خطأ] فشل الاتصال`, 'warn'); lastSignalRef.current = null; });
      }
  };

  return null;
}
