'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { useDashboardStore } from '@/lib/dashboard-store'

const mockPositions = [
  { pair: 'BTC/USD', type: 'BUY' as const, pnl: '+$234', pnlPct: '+0.23%' },
  { pair: 'EUR/USD', type: 'SELL' as const, pnl: '-$56', pnlPct: '-0.06%' },
  { pair: 'XAU/USD', type: 'BUY' as const, pnl: '+$89', pnlPct: '+0.09%' },
]

export default function OrderPanel() {
  const { selectedPair } = useDashboardStore()
  const [quantity, setQuantity] = useState('0.01')
  const [takeProfit, setTakeProfit] = useState('')
  const [stopLoss, setStopLoss] = useState('')

  const bidPrice = selectedPair === 'BTC/USD' ? '67,230.50' : '1.0845'
  const askPrice = selectedPair === 'BTC/USD' ? '67,237.80' : '1.0849'

  return (
    <div
      style={{ gridArea: 'order' }}
      className="glass flex flex-col overflow-hidden"
    >
      {/* Quick Trade Form */}
      <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-bold" style={{ color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>
            {selectedPair}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>
            تداول سريع
          </span>
        </div>

        {/* BID/ASK */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div
            className="rounded-lg px-3 py-2 text-center"
            style={{ background: 'var(--profit-bg)', border: '1px solid var(--border-profit)' }}
          >
            <div className="text-[9px] mb-0.5" style={{ color: 'var(--text-muted)' }}>BID</div>
            <div className="price text-sm font-bold" style={{ color: 'var(--profit)' }}>{bidPrice}</div>
          </div>
          <div
            className="rounded-lg px-3 py-2 text-center"
            style={{ background: 'var(--loss-bg)', border: '1px solid var(--border-loss)' }}
          >
            <div className="text-[9px] mb-0.5" style={{ color: 'var(--text-muted)' }}>ASK</div>
            <div className="price text-sm font-bold" style={{ color: 'var(--loss)' }}>{askPrice}</div>
          </div>
        </div>

        {/* Inputs */}
        <div className="space-y-2">
          <div>
            <label className="text-[10px] block mb-1" style={{ color: 'var(--text-muted)' }}>الكمية</label>
            <input
              type="text"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full rounded-md px-3 py-1.5 text-xs outline-none"
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-main)',
                fontFamily: 'var(--font-mono)',
              }}
            />
          </div>
          <div>
            <label className="text-[10px] block mb-1" style={{ color: 'var(--text-muted)' }}>جني الأرباح</label>
            <input
              type="text"
              value={takeProfit}
              onChange={(e) => setTakeProfit(e.target.value)}
              placeholder="اختياري"
              className="w-full rounded-md px-3 py-1.5 text-xs outline-none"
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-main)',
                fontFamily: 'var(--font-mono)',
              }}
            />
          </div>
          <div>
            <label className="text-[10px] block mb-1" style={{ color: 'var(--text-muted)' }}>
              وقف الخسارة <span style={{ color: 'var(--loss)' }}>*</span>
            </label>
            <input
              type="text"
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
              placeholder="إجباري"
              className="w-full rounded-md px-3 py-1.5 text-xs outline-none"
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-loss)',
                color: 'var(--text-main)',
                fontFamily: 'var(--font-mono)',
              }}
            />
          </div>
        </div>

        {/* Buy/Sell buttons */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <motion.button
            className="py-2 rounded-lg text-xs font-bold transition-all"
            style={{
              background: 'var(--profit)',
              color: '#fff',
              boxShadow: 'var(--glow-profit)',
            }}
            whileHover={{ scale: 1.02, boxShadow: '0 0 16px #10b9816d' }}
            whileTap={{ scale: 0.98 }}
          >
            شراء
          </motion.button>
          <motion.button
            className="py-2 rounded-lg text-xs font-bold transition-all"
            style={{
              background: 'var(--loss)',
              color: '#fff',
              boxShadow: 'var(--glow-loss)',
            }}
            whileHover={{ scale: 1.02, boxShadow: '0 0 16px #ef44446d' }}
            whileTap={{ scale: 0.98 }}
          >
            بيع
          </motion.button>
        </div>

        {/* Mandatory note */}
        <div className="flex items-center gap-1 mt-2">
          <AlertTriangle size={10} style={{ color: 'var(--warning)' }} />
          <span className="text-[9px]" style={{ color: 'var(--warning)' }}>
            وقف الخسارة إجباري
          </span>
        </div>
      </div>

      {/* Account Summary */}
      <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="text-[10px] font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
          ملخص الحساب
        </div>
        <div className="space-y-1.5">
          {[
            { label: 'حقوق الملكية', value: '$100,000' },
            { label: 'الرصيد', value: '$98,500' },
            { label: 'الهامش المتاح', value: '$85,000' },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between">
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{item.label}</span>
              <span className="price text-[11px] font-medium" style={{ color: 'var(--text-main)' }}>{item.value}</span>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>إجمالي P&L</span>
            <div className="flex items-center gap-1">
              <span className="price text-[11px] font-medium" style={{ color: 'var(--profit)' }}>+$1,500</span>
              <span
                className="text-[9px] px-1 py-0 rounded"
                style={{ background: 'var(--profit-bg)', color: 'var(--profit)' }}
              >
                +1.5%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Open Positions */}
      <div className="px-4 py-3 flex-1 overflow-y-auto custom-scrollbar">
        <div className="text-[10px] font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
          الصفقات المفتوحة
        </div>
        <div className="space-y-1.5">
          {mockPositions.map((pos) => (
            <div
              key={pos.pair}
              className="flex items-center justify-between py-1.5 px-2 rounded"
              style={{ background: 'var(--bg-input)' }}
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold" style={{ color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>
                  {pos.pair}
                </span>
                <span
                  className="text-[9px] px-1 py-0 rounded"
                  style={{
                    background: pos.type === 'BUY' ? 'var(--profit-bg)' : 'var(--loss-bg)',
                    color: pos.type === 'BUY' ? 'var(--profit)' : 'var(--loss)',
                  }}
                >
                  {pos.type === 'BUY' ? 'شراء' : 'بيع'}
                </span>
              </div>
              <span
                className="price text-[10px] font-medium"
                style={{ color: pos.pnl.startsWith('+') ? 'var(--profit)' : 'var(--loss)' }}
              >
                {pos.pnl}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
