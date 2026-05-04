'use client';

import { useState } from 'react';

const SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'ADA/USDT', 'DOGE/USDT', 'AVAX/USDT', 'DOT/USDT', 'MATIC/USDT'];

interface SwarmAgent {
  id: string;
  symbol: string;
  status: string;
  signal: 'BUY' | 'SELL' | 'WAIT' | null;
  confidence: number;
  pnl: number;
  trades: number;
}

interface SwarmResult {
  swarmId: string;
  status: 'ACTIVE' | 'STOPPED';
  agents: SwarmAgent[];
  consensus: {
    action: 'BUY' | 'SELL' | 'WAIT';
    confidence: number;
    agreement: number;
  };
  performance: {
    totalPnl: number;
    winRate: number;
    activeAgents: number;
  };
  startedAt: string;
}

export default function SwarmPanel() {
  const [agentCount, setAgentCount] = useState(3);
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(['BTC/USDT', 'ETH/USDT', 'SOL/USDT']);
  const [riskTolerance, setRiskTolerance] = useState(50);
  const [loading, setLoading] = useState(false);
  const [swarm, setSwarm] = useState<SwarmResult | null>(null);
  const [error, setError] = useState('');

  const toggleSymbol = (sym: string) => {
    setSelectedSymbols((prev) =>
      prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym]
    );
  };

  const startSwarm = async () => {
    setLoading(true);
    setError('');
    setSwarm(null);

    try {
      const res = await fetch('/api/neural/swarm/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          agents: agentCount,
          symbols: selectedSymbols,
          strategy: 'AI_COUNCIL',
          riskTolerance,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSwarm(data.data);
      } else {
        setError(data.error || 'فشل في إطلاق السرب');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const stopSwarm = async () => {
    if (!swarm) return;
    try {
      const res = await fetch(`/api/neural/swarm/${swarm.swarmId}/stop`, { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (data.success) setSwarm(data.data);
    } catch {}
  };

  const getSignalColor = (signal: string | null) => {
    switch (signal) {
      case 'BUY': return 'text-green-400 bg-green-400/10';
      case 'SELL': return 'text-red-400 bg-red-400/10';
      default: return 'text-yellow-400 bg-yellow-400/10';
    }
  };

  const getSignalEmoji = (signal: string | null) => {
    switch (signal) {
      case 'BUY': return '🟢';
      case 'SELL': return '🔴';
      default: return '🟡';
    }
  };

  return (
    <div className="space-y-6">
      {/* Configuration */}
      <div className="rounded-xl border border-white/5 bg-[#111827] p-5">
        <h2 className="mb-4 text-lg font-semibold text-white flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 text-sm">
            🐝
          </span>
          سرب الوكلاء — Swarm Intelligence
        </h2>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {/* Agent Count */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">عدد الوكلاء (1-10)</label>
            <input
              type="range"
              min={1}
              max={10}
              value={agentCount}
              onChange={(e) => setAgentCount(Number(e.target.value))}
              className="w-full accent-amber-500"
            />
            <div className="mt-1 flex justify-between text-xs text-gray-500">
              <span>1</span>
              <span className="text-amber-400 font-medium">{agentCount} وكلاء</span>
              <span>10</span>
            </div>
          </div>

          {/* Risk Tolerance */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">تحمل المخاطر</label>
            <input
              type="range"
              min={0}
              max={100}
              value={riskTolerance}
              onChange={(e) => setRiskTolerance(Number(e.target.value))}
              className="w-full accent-amber-500"
            />
            <div className="mt-1 flex justify-between text-xs text-gray-500">
              <span>🛡️ محافظ</span>
              <span className="text-amber-400 font-medium">{riskTolerance}%</span>
              <span>⚡ مخاطر عالية</span>
            </div>
          </div>
        </div>

        {/* Symbol Selection */}
        <div className="mt-4">
          <label className="mb-2 block text-xs font-medium text-gray-400">الأصول المراقبة (اختر واحدًا أو أكثر)</label>
          <div className="flex flex-wrap gap-2">
            {SYMBOLS.map((sym) => (
              <button
                key={sym}
                onClick={() => toggleSymbol(sym)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                  selectedSymbols.includes(sym)
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                    : 'border-white/10 bg-[#0a0e17] text-gray-400 hover:border-white/20'
                }`}
              >
                {sym}
              </button>
            ))}
          </div>
        </div>

        {/* Start/Stop */}
        <div className="mt-4 flex gap-3">
          <button
            onClick={startSwarm}
            disabled={loading || selectedSymbols.length === 0}
            className="rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 px-5 py-2 text-sm font-semibold text-white transition-all hover:from-amber-500 hover:to-orange-500 disabled:opacity-50"
          >
            {loading ? '⏳ جاري الإطلاق...' : '🚀 إطلاق السرب'}
          </button>
          {swarm?.status === 'ACTIVE' && (
            <button
              onClick={stopSwarm}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-5 py-2 text-sm font-medium text-red-300 transition-all hover:bg-red-500/20"
            >
              ⏹ إيقاف السرب
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
          ❌ {error}
        </div>
      )}

      {/* Swarm Results */}
      {swarm && (
        <>
          {/* Consensus */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-amber-300">🏅 توافق السرب</h3>
                <p className="mt-1 text-2xl font-bold text-white">
                  {getSignalEmoji(swarm.consensus.action)}{' '}
                  {swarm.consensus.action === 'BUY' ? 'شراء' : swarm.consensus.action === 'SELL' ? 'بيع' : 'انتظار'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">اتفاق الوكلاء</p>
                <p className="text-lg font-bold text-amber-400">{swarm.consensus.agreement}%</p>
                <p className="text-xs text-gray-500">ثقة: {swarm.consensus.confidence}%</p>
              </div>
            </div>

            {/* Agreement Bar */}
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all"
                style={{ width: `${swarm.consensus.agreement}%` }}
              />
            </div>
          </div>

          {/* Agents Grid */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {swarm.agents.map((agent) => (
              <div
                key={agent.id}
                className={`rounded-xl border p-4 ${
                  agent.status === 'RUNNING'
                    ? 'border-green-500/20 bg-green-500/5'
                    : agent.status === 'FAILED'
                    ? 'border-red-500/20 bg-red-500/5'
                    : 'border-white/5 bg-[#111827]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-400">{agent.id}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getSignalColor(agent.signal)}`}>
                    {getSignalEmoji(agent.signal)} {agent.signal === 'BUY' ? 'شراء' : agent.signal === 'SELL' ? 'بيع' : 'انتظار'}
                  </span>
                </div>

                <p className="mt-2 text-sm font-medium text-white">{agent.symbol}</p>

                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-gray-400">الثقة</span>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-violet-500"
                        style={{ width: `${agent.confidence}%` }}
                      />
                    </div>
                    <span className="text-gray-300">{agent.confidence}%</span>
                  </div>
                </div>

                <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                  <span>{agent.status === 'RUNNING' ? '🟢 نشط' : agent.status === 'FAILED' ? '🔴 فشل' : '⚪ متوقف'}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Swarm ID */}
          <div className="text-center text-xs text-gray-600">
            معرف السرب: {swarm.swarmId} • بدأ في: {new Date(swarm.startedAt).toLocaleString('ar')}
          </div>
        </>
      )}
    </div>
  );
}
