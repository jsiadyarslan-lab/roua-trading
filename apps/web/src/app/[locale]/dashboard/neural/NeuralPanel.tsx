'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';

const ARCHITECTURE_KEYS: Record<string, string> = {
  'LSTM': 'neuralArchitectureLSTM',
  'GRU': 'neuralArchitectureGRU',
  'TRANSFORMER': 'neuralArchitectureTransformer',
  'ENSEMBLE': 'neuralArchitectureEnsemble',
};

const ARCHITECTURE_DESC_KEYS: Record<string, string> = {
  'LSTM': 'neuralArchitectureLSTMDesc',
  'GRU': 'neuralArchitectureGRUDesc',
  'TRANSFORMER': 'neuralArchitectureTransformerDesc',
  'ENSEMBLE': 'neuralArchitectureEnsembleDesc',
};

const HORIZON_KEYS: Record<string, string> = {
  '1h': 'neuralHorizon1h',
  '4h': 'neuralHorizon4h',
  '1d': 'neuralHorizon1d',
  '7d': 'neuralHorizon7d',
};

const ARCHITECTURES = [
  { value: 'LSTM' },
  { value: 'GRU' },
  { value: 'TRANSFORMER' },
  { value: 'ENSEMBLE' },
];

const HORIZONS = [
  { value: '1h' },
  { value: '4h' },
  { value: '1d' },
  { value: '7d' },
];

const SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT'];

interface PricePrediction {
  timestamp: string;
  predictedPrice: number;
  lowerBound: number;
  upperBound: number;
  confidence: number;
}

interface NeuralPredictResult {
  symbol: string;
  currentPrice: number;
  predictions: PricePrediction[];
  consensusScore: number;
  aiAnalysis: string;
  modelInfo: {
    architecture: string;
    horizon: string;
    accuracy: number;
  };
}

export default function NeuralPanel() {
  const t = useTranslations('neuralLab');
  const locale = useLocale();
  const [symbol, setSymbol] = useState('BTC/USDT');
  const [architecture, setArchitecture] = useState('ENSEMBLE');
  const [horizon, setHorizon] = useState('1d');
  const [steps, setSteps] = useState(7);
  const [loading, setLoading] = useState(false);
  const [training, setTraining] = useState(false);
  const [result, setResult] = useState<NeuralPredictResult | null>(null);
  const [modelTrained, setModelTrained] = useState(false);
  const [error, setError] = useState('');

  const trainModel = async () => {
    setTraining(true);
    setError('');
    try {
      const res = await fetch('/api/neural/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ symbol, architecture, horizon, lookbackDays: 90, language: locale === 'ar' ? 'ar' : 'en' }),
      });
      const data = await res.json();
      if (data.success) {
        setModelTrained(true);
      } else {
        setError(data.error || t('neuralTrainFailed'));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTraining(false);
    }
  };

  const predict = async () => {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/neural/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ symbol, steps, horizon, includeConfidence: true, language: locale === 'ar' ? 'ar' : 'en' }),
      });

      const data = await res.json();
      if (data.success) {
        setResult(data.data);
      } else {
        setError(data.error || t('neuralPredictFailed'));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Configuration */}
      <div className="rounded-xl border border-white/5 bg-[#111827] p-5">
        <h2 className="mb-4 text-lg font-semibold text-white flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 text-sm">
            🧠
          </span>
          {t('neuralTitle')}
        </h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Symbol */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">{t('asset')}</label>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              aria-label={t('neuralSelectAsset')}
              className="w-full rounded-lg border border-white/10 bg-[#0a0e17] px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
            >
              {SYMBOLS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Architecture */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">{t('neuralArchitecture')}</label>
            <select
              value={architecture}
              onChange={(e) => setArchitecture(e.target.value)}
              aria-label={t('neuralSelectArchitecture')}
              className="w-full rounded-lg border border-white/10 bg-[#0a0e17] px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
            >
              {ARCHITECTURES.map((a) => (
                <option key={a.value} value={a.value}>{t(ARCHITECTURE_KEYS[a.value])}</option>
              ))}
            </select>
          </div>

          {/* Horizon */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">{t('neuralHorizon')}</label>
            <select
              value={horizon}
              onChange={(e) => setHorizon(e.target.value)}
              aria-label={t('neuralSelectHorizon')}
              className="w-full rounded-lg border border-white/10 bg-[#0a0e17] px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
            >
              {HORIZONS.map((h) => (
                <option key={h.value} value={h.value}>{t(HORIZON_KEYS[h.value])}</option>
              ))}
            </select>
          </div>

          {/* Steps */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">{t('neuralSteps')}</label>
            <input
              type="number"
              min={1}
              max={30}
              value={steps}
              onChange={(e) => setSteps(Number(e.target.value))}
              className="w-full rounded-lg border border-white/10 bg-[#0a0e17] px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Buttons */}
        <div className="mt-4 flex gap-3">
          <button
            onClick={trainModel}
            disabled={training}
            className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-5 py-2 text-sm font-medium text-violet-300 transition-all hover:bg-violet-500/20 disabled:opacity-50"
          >
            {training ? `⏳ ${t('neuralTraining')}` : `🏋️ ${t('neuralTrainModel')}`}
          </button>
          <button
            onClick={predict}
            disabled={loading}
            className="rounded-lg bg-gradient-to-r from-violet-600 to-pink-600 px-5 py-2 text-sm font-semibold text-white transition-all hover:from-violet-500 hover:to-pink-500 disabled:opacity-50"
          >
            {loading ? `⏳ ${t('neuralPredicting')}` : `🔮 ${t('neuralPredict')}`}
          </button>
          {modelTrained && (
            <span className="flex items-center text-xs text-green-400">✅ {t('neuralModelTrained')}</span>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
          ❌ {error}
        </div>
      )}

      {/* Prediction Results */}
      {result && (
        <>
          {/* Metrics */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-white/5 bg-[#111827] p-4">
              <p className="text-xs text-gray-400">{t('neuralCurrentPrice')}</p>
              <p className="mt-1 text-xl font-bold text-white">${result.currentPrice.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-[#111827] p-4">
              <p className="text-xs text-gray-400">{t('neuralLastPredictedPrice')}</p>
              <p className={`mt-1 text-xl font-bold ${result.predictions[result.predictions.length - 1]?.predictedPrice >= result.currentPrice ? 'text-green-400' : 'text-red-400'}`}>
                ${result.predictions[result.predictions.length - 1]?.predictedPrice.toFixed(2)}
              </p>
            </div>
            <div className="rounded-xl border border-white/5 bg-[#111827] p-4">
              <p className="text-xs text-gray-400">{t('neuralCouncilConsensus')}</p>
              <p className="mt-1 text-xl font-bold text-violet-400">{result.consensusScore}%</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-[#111827] p-4">
              <p className="text-xs text-gray-400">{t('neuralModelAccuracy')}</p>
              <p className="mt-1 text-xl font-bold text-yellow-400">{result.modelInfo.accuracy.toFixed(1)}%</p>
            </div>
          </div>

          {/* Prediction Chart */}
          {result.predictions.length > 0 && (
            <div className="rounded-xl border border-white/5 bg-[#111827] p-5">
              <h3 className="mb-4 text-sm font-semibold text-gray-300">📈 {t('neuralPredictionChart')}</h3>
              <ResponsiveContainer width="100%" height={350}>
                <AreaChart data={result.predictions}>
                  <defs>
                    <linearGradient id="predGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={'#B388FF'} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={'#B388FF'} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="confGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={'#151A22'} />
                  <XAxis dataKey="timestamp" stroke={'#6B7280'} tick={{ fontSize: 11 }} />
                  <YAxis stroke={'#6B7280'} tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={{ background: '#151A22', border: '1px solid #374151', borderRadius: 'var(--radius-md)', fontSize: 13 }}
                    labelStyle={{ color: '#9CA3B5' }}
                    formatter={(value: number, name: string) => {
                      const labels: Record<string, string> = {
                        predictedPrice: t('neuralPredictedPrice'),
                        upperBound: t('neuralUpperBound'),
                        lowerBound: t('neuralLowerBound'),
                      };
                      return [`$${value.toFixed(2)}`, labels[name] || name];
                    }}
                  />
                  <Area type="monotone" dataKey="upperBound" stroke="none" fill="url(#confGrad)" />
                  <Area type="monotone" dataKey="lowerBound" stroke="none" fill="url(#confGrad)" />
                  <Line type="monotone" dataKey="predictedPrice" stroke={'#B388FF'} strokeWidth={2} dot={{ fill: '#B388FF', r: 3 }} />
                  <Line type="monotone" dataKey="upperBound" stroke="#4f46e5" strokeWidth={1} strokeDasharray="4 4" dot={false} />
                  <Line type="monotone" dataKey="lowerBound" stroke="#4f46e5" strokeWidth={1} strokeDasharray="4 4" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* AI Analysis */}
          {result.aiAnalysis && (
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-5">
              <h3 className="mb-3 text-sm font-semibold text-violet-300">🤖 {t('neuralAITitle')}</h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-300">{result.aiAnalysis}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
