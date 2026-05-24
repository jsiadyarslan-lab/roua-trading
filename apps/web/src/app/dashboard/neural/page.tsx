'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';

// Loading fallback spinner for dynamic imports
function PanelLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// Dynamic imports for all panels (they use browser-only features)
const BacktestPanel = dynamic(() => import('./BacktestPanel'), { ssr: false, loading: () => <PanelLoader /> });
const NeuralPanel = dynamic(() => import('./NeuralPanel'), { ssr: false, loading: () => <PanelLoader /> });
const SwarmPanel = dynamic(() => import('./SwarmPanel'), { ssr: false, loading: () => <PanelLoader /> });
const OptimizerPanel = dynamic(() => import('./OptimizerPanel'), { ssr: false, loading: () => <PanelLoader /> });
const ComparisonPanel = dynamic(() => import('./ComparisonPanel'), { ssr: false, loading: () => <PanelLoader /> });

type TabId = 'backtest' | 'optimizer' | 'comparison' | 'neural' | 'swarm';

export default function NeuralLabPage() {
  const t = useTranslations('neuralLab');
  const [activeTab, setActiveTab] = useState<TabId>('backtest');

  const TABS: { id: TabId; label: string; icon: string; desc: string }[] = [
    { id: 'backtest', label: t('tabBacktest'), icon: '📊', desc: t('tabBacktestDesc') },
    { id: 'optimizer', label: t('tabOptimizer'), icon: '🔧', desc: t('tabOptimizerDesc') },
    { id: 'comparison', label: t('tabComparison'), icon: '⚖️', desc: t('tabComparisonDesc') },
    { id: 'neural', label: t('tabNeural'), icon: '🧠', desc: t('tabNeuralDesc') },
    { id: 'swarm', label: t('tabSwarm'), icon: '🐝', desc: t('tabSwarmDesc') },
  ];

  return (
    <div className="min-h-screen bg-[#0a0e17] text-white">
      {/* Header */}
      <div className="border-b border-white/5 px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-lg">
            🧪
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{t('title')}</h1>
            <p className="text-sm text-gray-400">
              {t('subtitle')}
            </p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-white/5 px-6">
        <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="AI Trading Lab tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              id={`tab-${tab.id}`}
              className={`flex items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-medium transition-all border-b-2 ${
                activeTab === tab.id
                  ? 'border-violet-500 text-white bg-white/5'
                  : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-white/[0.02]'
              }`}
              title={tab.desc}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {activeTab === 'backtest' && <div role="tabpanel" aria-labelledby="tab-backtest" id="panel-backtest"><BacktestPanel /></div>}
        {activeTab === 'optimizer' && <div role="tabpanel" aria-labelledby="tab-optimizer" id="panel-optimizer"><OptimizerPanel /></div>}
        {activeTab === 'comparison' && <div role="tabpanel" aria-labelledby="tab-comparison" id="panel-comparison"><ComparisonPanel /></div>}
        {activeTab === 'neural' && <div role="tabpanel" aria-labelledby="tab-neural" id="panel-neural"><NeuralPanel /></div>}
        {activeTab === 'swarm' && <div role="tabpanel" aria-labelledby="tab-swarm" id="panel-swarm"><SwarmPanel /></div>}
      </div>
    </div>
  );
}
