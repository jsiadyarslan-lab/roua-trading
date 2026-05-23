'use client'

import { Info, DollarSign, Percent, BarChart3 } from 'lucide-react'
import type { OrderType, OrderSide } from './hooks/useExecutionEngine'

interface PreTradeSummaryProps {
  symbol: string
  side: OrderSide | null
  orderType: OrderType
  quantity: string
  currentPrice: number
  limitPrice: string
  stopLoss: string
  takeProfit: string
  estimatedCost: number
  potentialGain: number | null
  potentialLoss: number | null
  rrRatio: string | null
  account: { cash: number; buyingPower: number } | null
}

export function PreTradeSummary({
  symbol, side, orderType, quantity, currentPrice, limitPrice,
  stopLoss, takeProfit, estimatedCost, potentialGain, potentialLoss,
  rrRatio, account,
}: PreTradeSummaryProps) {
  const qty = parseFloat(quantity) || 0
  if (!symbol || qty <= 0 || currentPrice <= 0) return null

  const isBuy = side === 'buy'
  const effectivePrice = orderType === 'limit' && limitPrice ? parseFloat(limitPrice) : currentPrice
  const margin = estimatedCost * 0.5 // Estimate 50% margin
  const buyingPower = account?.buyingPower ?? 0
  const canAfford = buyingPower > 0 ? estimatedCost <= buyingPower : true

  return (
    <div className="rounded-lg border border-[rgba(0,212,255,0.15)] bg-[rgba(0,212,255,0.03)] p-2.5" style={{ direction: 'inherit' }}>
      <div className="flex items-center gap-1.5 mb-2">
        <Info size={10} className="text-[var(--accent)]" />
        <span className="text-[9px] font-extrabold text-[var(--accent)]">ملخص ما قبل التنفيذ</span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <Row icon={<DollarSign size={9} />} label="التكلفة التقديرية" value={`$${estimatedCost.toFixed(2)}`} />
        <Row icon={<DollarSign size={9} />} label="الهامش المطلوب" value={`~$${margin.toFixed(2)}`} />
        {stopLoss && <Row icon={<Percent size={9} />} label="المخاطرة" value={`$${(potentialLoss ?? 0).toFixed(2)}`} valueColor="var(--danger)" />}
        {takeProfit && <Row icon={<Percent size={9} />} label="الهدف" value={`$${(potentialGain ?? 0).toFixed(2)}`} valueColor="var(--success)" />}
        {rrRatio && <Row icon={<BarChart3 size={9} />} label="R:R" value={`${rrRatio}:1`} valueColor={parseFloat(rrRatio) >= 2 ? 'var(--success)' : 'var(--warning)'} />}
        {orderType === 'limit' && limitPrice && (
          <Row icon={<DollarSign size={9} />} label="فرق السعر"
            value={`$${Math.abs(effectivePrice - currentPrice).toFixed(2)} (${((Math.abs(effectivePrice - currentPrice) / currentPrice) * 100).toFixed(2)}%)`}
          />
        )}
      </div>

      {!canAfford && (
        <div className="mt-2 rounded border border-[rgba(255,71,87,0.2)] bg-[rgba(255,71,87,0.06)] px-2 py-1 text-[8px] font-bold text-[var(--danger)]">
          القوة الشرائية غير كافية لهذه الصفقة
        </div>
      )}
    </div>
  )
}

function Row({ icon, label, value, valueColor }: { icon: React.ReactNode; label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1">
        <span className="text-[var(--muted)]">{icon}</span>
        <span className="text-[8px] text-[var(--muted)]">{label}</span>
      </div>
      <span className="font-mono text-[9px] font-bold" style={{ color: valueColor || 'var(--foreground)' }}>
        {value}
      </span>
    </div>
  )
}
