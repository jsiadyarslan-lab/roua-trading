'use client'

import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { usePortfolioSummary } from '@/components/portfolio/PortfolioMini'
import { TrendingUp, TrendingDown, Award, Target, BarChart2, X } from 'lucide-react'

const T = {
  bg:      '#04050C',
  bg2:     '#0D1117',
  card:    '#08090F',
  blue:    '#0A84FF',
  cyan:    '#00C8FF',
  green:   '#00FFC6',
  red:     '#FF4D4D',
  amber:   '#FFB800',
  purple:  '#B388FF',
  text:    '#E6EBF5',
  text2:   '#8090A8',
  text3:   '#A0AFC3',
  border:  'rgba(10,132,255,0.12)',
  border2: 'rgba(10,132,255,0.20)',
}

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

/* ── Demo data ── */
const EQUITY_CURVE = [
  { month: 'Jan', value: 23000 },
  { month: 'Feb', value: 23800 },
  { month: 'Mar', value: 24600 },
  { month: 'Apr', value: 24100 },
  { month: 'May', value: 25200 },
  { month: 'Jun', value: 26500 },
  { month: 'Jul', value: 27800 },
  { month: 'Aug', value: 27200 },
  { month: 'Sep', value: 28100 },
  { month: 'Oct', value: 28900 },
  { month: 'Nov', value: 29400 },
  { month: 'Dec', value: 30200 },
]

const DISTRIBUTION = [
  { name: 'EUR/USD', value: 38, color: '#0A84FF' },
  { name: 'XAU/USD', value: 25, color: '#FFB800' },
  { name: 'BTC/USD', value: 20, color: '#F7931A' },
  { name: 'GBP/USD', value: 12, color: '#00FFC6' },
  { name: 'Other',   value: 5,  color: '#8090A8' },
]

const DEMO_POSITIONS = [
  { id: 1, symbol: 'EUR/USD', dir: 'BUY',  lot: 0.50, entry: 1.09210, current: 1.08437, sl: 1.07710, tp: 1.10100, pnl: 109.72,  pnlUp: false },
  { id: 2, symbol: 'XAU/USD', dir: 'BUY',  lot: 0.20, entry: 2930.50, current: 2944.35, sl: 2910.00, tp: 2980.00, pnl: 2769.60, pnlUp: true  },
  { id: 3, symbol: 'GBP/USD', dir: 'SELL', lot: 0.30, entry: 1.27940, current: 1.27149, sl: 1.28500, tp: 1.26500, pnl: 87.22,   pnlUp: true  },
  { id: 4, symbol: 'BTC/USD', dir: 'BUY',  lot: 0.01, entry: 82000,   current: 84112,   sl: 79000,   tp: 90000,   pnl: 211.20,  pnlUp: true  },
  { id: 5, symbol: 'USD/JPY', dir: 'SELL', lot: 0.40, entry: 149.20,  current: 149.88,  sl: 150.50,  tp: 147.00,  pnl: -152.40, pnlUp: false },
]

/* ── Stat Card ── */
function StatCard({
  label, value, sub, color, icon: Icon, note,
}: {
  label: string; value: string; sub?: string; color: string
  icon: any; note?: string
}) {
  return (
    <div style={{
      flex: 1, padding: '12px 14px',
      background: T.card,
      border: `0.5px solid ${color}22`,
      borderRadius: 10,
      display: 'flex', flexDirection: 'column', gap: 4,
      position: 'relative', overflow: 'hidden',
    }}>
      {/* glow */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, transparent, ${color}66, transparent)`,
      }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, color: T.text2 }}>{label}</span>
        <Icon size={13} color={color} strokeWidth={2} />
      </div>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 22, fontWeight: 800, color,
        letterSpacing: '-0.02em',
      }}>{value}</div>
      {sub && (
        <div style={{ fontFamily: "'Cairo', sans-serif", fontSize: 10, color: T.text3 }}>{sub}</div>
      )}
      {note && (
        <div style={{
          display: 'inline-flex', alignItems: 'center',
          padding: '1px 7px', borderRadius: 8,
          background: `${color}14`,
          fontFamily: "'Cairo', sans-serif", fontSize: 9.5, color,
          alignSelf: 'flex-start', marginTop: 2,
        }}>{note}</div>
      )}
    </div>
  )
}

/* ── Custom tooltip for equity chart ── */
function EquityTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#0D1520', border: `0.5px solid ${T.blue}44`,
      borderRadius: 8, padding: '6px 12px',
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      <div style={{ fontSize: 9, color: T.text2, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.cyan }}>
        ${payload[0].value.toLocaleString()}
      </div>
    </div>
  )
}

/* ── Main page ── */
export default function PortfolioPage() {
  const { data: s } = usePortfolioSummary()
  const [positions, setPositions] = useState(DEMO_POSITIONS)
  const totalPnl = positions.reduce((sum, p) => sum + p.pnl, 0)

  return (
    <div style={{
      width: '100%', height: 'calc(100vh - 100px)',
      background: T.bg, overflow: 'auto',
      padding: '12px 14px', boxSizing: 'border-box',
      direction: 'rtl',
      fontFamily: "'Cairo', sans-serif",
      /* custom scrollbar */
    }}>
      <style>{`
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: #04050C; }
        ::-webkit-scrollbar-thumb { background: #0A84FF44; border-radius: 4px; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{ width: 3, height: 20, borderRadius: 2, background: T.blue }} />
        <h1 style={{
          fontFamily: "'Cairo', sans-serif", fontWeight: 900,
          fontSize: 18, color: T.text, margin: 0,
        }}>المحفظة</h1>
        <div style={{
          padding: '2px 10px', borderRadius: 20,
          background: `${T.green}14`, border: `0.5px solid ${T.green}33`,
          fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: T.green,
        }}>LIVE</div>
        <div style={{ flex: 1 }} />
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11, color: T.text2,
        }}>آخر تحديث: الآن</div>
      </div>

      {/* ── Stats cards ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <StatCard
          label="الرصيد الكلي" value={`$${fmt(s.balance, 0)}`}
          sub={`اليوم: +${s.pnlPercent}% ↑`}
          color={T.cyan} icon={BarChart2} note="متنامٍ"
        />
        <StatCard
          label="إجمالي الأرباح" value={`$${fmt(s.totalProfit, 0)}+`}
          sub={`${s.winCount} صفقة فائزة`}
          color={T.green} icon={TrendingUp} note="ممتاز"
        />
        <StatCard
          label="إجمالي الخسائر" value={`$${fmt(s.totalLoss, 0)}-`}
          sub={`${s.lossCount} صفقة خاسرة`}
          color={T.red} icon={TrendingDown}
        />
        <StatCard
          label="نسبة الفوز" value={`${s.winRate}%`}
          sub={`من ${s.totalTrades} صفقة`}
          color={T.amber} icon={Target} note="جيد جداً"
        />
        <StatCard
          label="Sharpe Ratio" value={s.sharpe.toFixed(2)}
          color={T.purple} icon={Award} note="ممتاز"
        />
      </div>

      {/* ── Charts row ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>

        {/* Distribution donut */}
        <div style={{
          flex: '0 0 320px',
          background: T.card, border: `0.5px solid ${T.border}`,
          borderRadius: 10, padding: '12px 14px',
        }}>
          <div style={{
            fontFamily: "'Cairo', sans-serif", fontWeight: 700,
            fontSize: 12, color: T.text, marginBottom: 8,
          }}>توزيع المراكز حسب الزوج</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={DISTRIBUTION}
                innerRadius={55} outerRadius={85}
                dataKey="value" nameKey="name"
                stroke="none"
              >
                {DISTRIBUTION.map((entry, i) => (
                  <Cell key={i} fill={entry.color} opacity={0.85} />
                ))}
              </Pie>
              <Legend
                iconType="circle" iconSize={8}
                wrapperStyle={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10, color: T.text2,
                }}
              />
              <Tooltip
                formatter={(val: any) => [`${val}%`, '']}
                contentStyle={{
                  background: '#0D1520', border: `0.5px solid ${T.border2}`,
                  borderRadius: 8, fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Equity curve */}
        <div style={{
          flex: 1,
          background: T.card, border: `0.5px solid ${T.border}`,
          borderRadius: 10, padding: '12px 14px',
        }}>
          <div style={{
            fontFamily: "'Cairo', sans-serif", fontWeight: 700,
            fontSize: 12, color: T.text, marginBottom: 8,
          }}>أداء المحفظة — 12 شهر</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={EQUITY_CURVE}>
              <XAxis
                dataKey="month" tick={{ fontSize: 9, fill: T.text2 }}
                axisLine={false} tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 9, fill: T.text2 }}
                axisLine={false} tickLine={false}
                tickFormatter={v => `$${(v/1000).toFixed(0)}k`}
                width={40}
              />
              <Tooltip content={<EquityTooltip />} />
              <Line
                type="monotone" dataKey="value"
                stroke={T.cyan} strokeWidth={2}
                dot={{ fill: T.cyan, r: 3, strokeWidth: 0 }}
                activeDot={{ fill: T.blue, r: 5, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Open Positions table ── */}
      <div style={{
        background: T.card, border: `0.5px solid ${T.border}`,
        borderRadius: 10, overflow: 'hidden',
      }}>
        {/* Table header */}
        <div style={{
          display: 'flex', alignItems: 'center',
          padding: '8px 14px', gap: 8,
          borderBottom: `0.5px solid ${T.border}`,
          background: `linear-gradient(90deg, ${T.green}0a, transparent)`,
        }}>
          <div style={{ width: 3, height: 14, borderRadius: 2, background: T.green }} />
          <span style={{
            fontFamily: "'Cairo', sans-serif", fontWeight: 700,
            fontSize: 12, color: T.text, flex: 1,
          }}>الصفقات المفتوحة</span>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
            color: totalPnl >= 0 ? T.green : T.red, fontWeight: 700,
          }}>
            P&L: {totalPnl >= 0 ? '+' : ''}${fmt(totalPnl, 2)}
          </span>
        </div>

        {/* Table head */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '110px 60px 60px 90px 90px 80px 80px 80px 90px',
          padding: '5px 14px', gap: 0,
          borderBottom: `0.5px solid ${T.border}`,
        }}>
          {['الزوج','اتجاه','حجم','سعر الدخول','السعر الحالي','SL','TP','P&L','إجراء'].map((h, i) => (
            <div key={i} style={{
              fontFamily: "'Cairo', sans-serif", fontSize: 9.5,
              color: T.text3, textAlign: 'center',
            }}>{h}</div>
          ))}
        </div>

        {/* Rows */}
        {positions.map((pos, i) => (
          <div key={pos.id} style={{
            display: 'grid',
            gridTemplateColumns: '110px 60px 60px 90px 90px 80px 80px 80px 90px',
            padding: '7px 14px', gap: 0,
            borderBottom: i < positions.length - 1 ? `0.5px solid ${T.border}` : 'none',
            alignItems: 'center',
            background: i % 2 === 0 ? 'rgba(255,255,255,0.005)' : 'transparent',
          }}>
            {/* Symbol */}
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11, fontWeight: 700, color: T.text,
            }}>{pos.symbol}</div>

            {/* Direction */}
            <div style={{
              display: 'flex', justifyContent: 'center',
            }}>
              <span style={{
                padding: '2px 8px', borderRadius: 4,
                fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, fontWeight: 700,
                background: pos.dir === 'BUY' ? `${T.green}18` : `${T.red}18`,
                color: pos.dir === 'BUY' ? T.green : T.red,
                border: `0.5px solid ${pos.dir === 'BUY' ? T.green : T.red}44`,
              }}>{pos.dir === 'BUY' ? 'شراء ↑' : 'بيع ↓'}</span>
            </div>

            {/* Lot */}
            <div style={{
              textAlign: 'center',
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: T.text2,
            }}>{pos.lot}</div>

            {/* Entry */}
            <div style={{
              textAlign: 'center',
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: T.text2,
            }}>{pos.entry}</div>

            {/* Current */}
            <div style={{
              textAlign: 'center',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11, fontWeight: 700, color: T.text,
            }}>{pos.current}</div>

            {/* SL */}
            <div style={{
              textAlign: 'center',
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: T.red,
            }}>{pos.sl}</div>

            {/* TP */}
            <div style={{
              textAlign: 'center',
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: T.green,
            }}>{pos.tp}</div>

            {/* P&L */}
            <div style={{
              textAlign: 'center',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11, fontWeight: 700,
              color: pos.pnlUp ? T.green : T.red,
            }}>
              {pos.pnlUp ? '+' : ''}${fmt(Math.abs(pos.pnl))}
            </div>

            {/* Action */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                onClick={() => setPositions(prev => prev.filter(p => p.id !== pos.id))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 3,
                  padding: '3px 10px', borderRadius: 5,
                  background: `${T.red}18`, color: T.red,
                  border: `0.5px solid ${T.red}44`,
                  cursor: 'pointer', fontFamily: "'Cairo', sans-serif",
                  fontSize: 9.5,
                }}
              >
                <X size={9} />
                إغلاق
              </button>
            </div>
          </div>
        ))}

        {positions.length === 0 && (
          <div style={{
            padding: '24px', textAlign: 'center',
            fontFamily: "'Cairo', sans-serif", fontSize: 12, color: T.text3,
          }}>لا توجد صفقات مفتوحة</div>
        )}
      </div>
    </div>
  )
}
