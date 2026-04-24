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

    let isScanning = false;
    const scanAll = async () => {
      if (isScanning) return;
      isScanning = true;

      // Import GLOBAL_SYMBOLS dynamically or use a local list if needed
      // For now, let's use the core symbols to keep it responsive
      const symbolsToScan = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XAU/USD', 'EUR/USD', 'GBP/USD'];
      
      for (const sym of symbolsToScan) {
        if (!isOn) break;

        const q = quotesRef.current[sym];
        if (!q || !q.price) continue;

        // AI CONSENSUS MODE
        if (settings.useAIConsensus) {
          try {
            const res = await fetch('/api/ai/consensus', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ symbol: sym }),
            });
            const j = await res.json();
            
            if (j.success && j.data.consensusScore >= settings.confLimit) {
              const signal = j.data.recommendation;
              if ((signal === 'BUY' || signal === 'SELL') && lastSignalRef.current !== `${sym}-${signal}`) {
                _executeTrade(sym, q.price, j.data.consensusScore, signal);
                lastSignalRef.current = `${sym}-${signal}`;
              }
            }
          } catch (e) {
            console.error(`AI Consensus failed for ${sym}`, e);
          }
        } else {
          // MOMENTUM MODE
          const change = q.changePercent || 0;
          const confidence = Math.min(99, Math.abs(change) * 20);
          
          if (confidence >= settings.confLimit) {
            let signal: 'BUY' | 'SELL' | null = null;
            if (change > 0.5 && lastSignalRef.current !== `${sym}-BUY`) signal = 'BUY';
            else if (change < -0.5 && lastSignalRef.current !== `${sym}-SELL`) signal = 'SELL';
            
            if (signal) {
              _executeTrade(sym, q.price, confidence, signal);
              lastSignalRef.current = `${sym}-${signal}`;
            }
          }
        }

        // Delay between symbols to respect API limits
        await new Promise(r => setTimeout(r, 1000));
      }
      
      addLog(`[تحليل] اكتمل مسح السوق — لم يتم رصد إشارات قوية حالياً (${new Date().toLocaleTimeString('ar-SA')})`, 'info');
      isScanning = false;
    };

    scanAll();
    const interval = setInterval(scanAll, 30000); // Full market scan every 30s
    return () => clearInterval(interval);
  }, [isOn, hydrated, settings.confLimit, settings.useAIConsensus]); // eslint-disable-line

  // Helper to execute trades (refactored out of main loop)
  const _executeTrade = (symbol: string, price: number, confidence: number, signal: 'BUY' | 'SELL') => {
      const tradeAmount = Math.max(10, settings.riskPct * 50);
      const qty = parseFloat((tradeAmount / price).toFixed(6));
      const tp = signal === 'BUY' ? price * 1.02 : price * 0.98;
      const sl = signal === 'BUY' ? price * 0.99 : price * 1.01;

      if (PAPER_TRADING_MODE) {
        addLog(
          `[Paper] ${settings.strategy} → ${signal === 'BUY' ? '📈 شراء' : '📉 بيع'} ${symbol} | ${qty} @ $${price.toFixed(2)} | ثقة: ${confidence.toFixed(0)}%`,
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
