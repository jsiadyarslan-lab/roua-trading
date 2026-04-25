'use client';

import { useState } from 'react';
import BacktestPanel from './BacktestPanel';
import NeuralPanel from './NeuralPanel';
import SwarmPanel from './SwarmPanel';

const TABS = [
  { id: 'backtest', label: 'الباك تست', icon: '📊', desc: 'اختبار الاستراتيجيات على البيانات التاريخية' },
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
              مختبر التداول الذكي — مدعوم بـ AI Council (Gemini + Groq + GLM)
            </p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-white/5 px-6">
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all border-b-2 ${
                activeTab === tab.id
                  ? 'border-violet-500 text-white bg-white/5'
                  : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-white/[0.02]'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {activeTab === 'backtest' && <BacktestPanel />}
        {activeTab === 'neural' && <NeuralPanel />}
        {activeTab === 'swarm' && <SwarmPanel />}
      </div>
    </div>
  );
}
