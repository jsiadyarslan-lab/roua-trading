'use client';

import { create } from 'zustand';

interface SymbolStore {
  selectedSymbol: string;
  timeframe: string;
  setSymbol: (symbol: string) => void;
  setTimeframe: (tf: string) => void;
}

export const useSymbolStore = create<SymbolStore>((set) => ({
  selectedSymbol: 'BTC/USDT',
  timeframe: '15min',
  setSymbol: (symbol) => set({ selectedSymbol: symbol }),
  setTimeframe: (tf) => set({ timeframe: tf }),
}));
