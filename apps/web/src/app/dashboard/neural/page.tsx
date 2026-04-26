'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';

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

const TABS = [
  { id: 'backtest', label: 'الباك تست', icon: '📊', desc: 'اختبار الاستراتيجيات على البيانات التاريخية' },
  { id: 'optimizer', label: 'المُحسِّن', icon: '🔧', desc: 'تحسين بارامترات الاستراتيجية تلقائياً' },
  { id: 'comparison', label: 'المقارنة', icon: '⚖️', desc: 'مقارنة أداء استراتيجيتين على نفس الأصل' },
  { id: 'neural', label: 'الشبكة العصبية', icon: '🧠', desc: 'تنبؤات الأسعار عبر AI Council' },
  { id: 'swarm', label: 'سرب الوكلاء', icon: '🐝', desc: 'تنسيق وكلاء التداول المتعددين' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function NeuralLabPage() {
  const [activeTab, setActiveTab] = useState<TabId>('backtest');

  return (
    <div className="min-h-screen bg-[#0a0e17] text-white">
      {/* Header */}
      <div className="border-b border-white/5 px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-lg">
            🧪
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">AI Trading Lab</h1>
            <p className="text-sm text-gray-400">
              مختبر التداول الذكي — مدعوم بـ AI Council (6 نماذج: Gemini, Groq, GLM-4, HuggingFace, Ollama, Bedrock)
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
