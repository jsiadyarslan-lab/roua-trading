'use client'

import React, { useState } from 'react'
import { Eye, Layers, Bell } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { DirectionTag } from '../shared/DirectionTag'
import { ScoreGauge } from '../shared/ScoreGauge'
import { IndicatorBadge } from '../shared/IndicatorBadge'
import { MiniHeatmap } from '../shared/MiniHeatmap'
import type { ScannerItem } from '../hooks/useScannerData'
import { safeStr, getLocalizedAssetName } from '@/lib/utils'

interface ScannerTableRowProps {
  item: ScannerItem
  index: number
  isSelected: boolean
  onSelect: (symbol: string) => void
  onBellClick: (symbol: string) => void
  hasActiveAlert: boolean
}

function getRsiStatus(v: number | null): 'bullish' | 'bearish' | 'oversold' | 'overbought' | 'neutral' {
  if (v === null) return 'neutral'
  if (v <= 30) return 'oversold'
  if (v >= 70) return 'overbought'
  if (v < 50) return 'bearish'
  return 'bullish'
}

function getMacdStatus(s: string | null): 'bullish' | 'bearish' | 'neutral' {
  if (!s) return 'neutral'
  const u = s.toUpperCase()
  if (u.includes('BUY') || u.includes('BULL')) return 'bullish'
  if (u.includes('SELL') || u.includes('BEAR')) return 'bearish'
  return 'neutral'
}

function TinyBar({ value, maxVal, color }: { value: number; maxVal: number; color: string }) {
  const pct = Math.min(Math.max(Math.abs(value) / maxVal * 100, 2), 100)
  return (
    <div style={{ width: 32, height: 3, borderRadius: 'var(--radius-xs)', background: '#151A22', overflow: 'hidden' }}>
      <div style={{
        width: `${pct}%`, height: '100%', borderRadius: 'var(--radius-xs)',
        background: color, transition: 'width 0.3s',
      }} />
    </div>
  )
}

function ActionBadge({ action }: { action: string }) {
  const t = useTranslations('scannerAdvanced')
  // Normalize action value: 'Strong Buy', 'strong_buy' → 'STRONG_BUY'
  const normAction = (action || '').toUpperCase().replace(/\s+/g, '_')
  const map: Record<string, { bg: string; color: string; key: string }> = {
    'STRONG_BUY': { bg: `${'#00FFA3'}15`, color: '#00FFA3', key: 'strongBuy' },
    'BUY': { bg: `${'#00FFA3'}10`, color: '#00CC82', key: 'buy' },
    'HOLD': { bg: `${'#FFB800'}10`, color: '#FFB800', key: 'hold' },
    'SELL': { bg: `${'#FF4757'}10`, color: '#CC3945', key: 'sell' },
    'STRONG_SELL': { bg: `${'#FF4757'}15`, color: '#FF4757', key: 'strongSell' },
  }
  const cfg = map[normAction] ?? map['HOLD']
  return (
    <span style={{
      fontSize: 'var(--text-xs)', fontWeight: 800, padding: '2px 6px', borderRadius: 'var(--radius-xs)',
      background: cfg.bg, color: cfg.color, fontFamily: "var(--font-ar)",
    }}>
      {t(cfg.key)}
    </span>
  )
}

function ScannerTableRowInner({ item, index, isSelected, onSelect, onBellClick, hasActiveAlert }: ScannerTableRowProps) {
  const t = useTranslations('scannerAdvanced')
  const locale = useLocale()
  const [hovered, setHovered] = useState(false)

  // Translate AI opinion based on locale — always use i18n, never raw API text
  const aiOpinionText = (() => {
    const action = item.smartScore?.action
    if (action) {
      const normAction = action.toUpperCase().replace(/\s+/g, '_')
      const actionLabelMap: Record<string, string> = {
        'STRONG_BUY': t('aiConsensus.strongBuy'),
        'BUY': t('aiConsensus.buy'),
        'HOLD': t('aiConsensus.hold'),
        'SELL': t('aiConsensus.sell'),
        'STRONG_SELL': t('aiConsensus.strongSell'),
      }
      return `${t('aiConsensus.label')} ${actionLabelMap[normAction] || t('aiConsensus.hold')}`
    }
    // Derive from direction if smartScore is not available
    if (item.direction) {
      const normDir = item.direction.toUpperCase().replace(/\s+/g, '_')
      const dirToAction: Record<string, string> = {
        'STRONG_BUY': t('aiConsensus.strongBuy'),
        'BUY': t('aiConsensus.buy'),
        'NEUTRAL': t('aiConsensus.hold'),
        'SELL': t('aiConsensus.sell'),
        'STRONG_SELL': t('aiConsensus.strongSell'),
      }
      return `${t('aiConsensus.label')} ${dirToAction[normDir] || t('aiConsensus.hold')}`
    }
    return null
  })()
  const dimmed = !item.marketOpen
  const chgColor = item.changePercent >= 0 ? '#00FFA3' : '#FF4757'
  const ss = item.smartScore

  const scores = [
    { v: ss?.trendScore ?? Math.abs(item.technicalScore), max: 100, c: (ss?.trendScore ?? Math.abs(item.technicalScore)) >= 50 ? '#00FFA3' : '#FFB800' },
    { v: ss?.momentumScore ?? item.confidence, max: 100, c: '#00D4FF' },
    { v: ss?.volumeScore ?? (item.rsi ?? 0), max: 100, c: '#0A84FF' },
    { v: ss?.volatilityScore ?? (item.adx ?? 0), max: 100, c: '#B388FF' },
  ]

  return (
    <tr
      onClick={() => onSelect(item.symbol)}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        background: isSelected ? `${'#00D4FF'}08` : hovered ? '#1F2335' : 'transparent',
        cursor: 'pointer', transition: 'background 0.2s',
        opacity: dimmed ? 0.45 : 1,
        animation: `fadeInRow 0.3s ease ${index * 30}ms both`,
      }}
    >
      {/* Symbol */}
      <td style={{ padding: '8px 10px', borderBottom: `1px solid ${'#2A313C'}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div>
            <div style={{
              fontSize: 'var(--text-sm)', fontWeight: 800, color: '#F0F2F5',
              fontFamily: "var(--font-mono)",
            }}>
              {item.symbol}
            </div>
            <div style={{
              fontSize: 'var(--text-xs)', color: '#6B7280', fontWeight: 600,
              fontFamily: "var(--font-ar)",
            }}>
              {getLocalizedAssetName(item.symbol, safeStr(item.name), t, locale)}
            </div>
          </div>
          <DirectionTag direction={item.direction} signalClass={item.signalClass} size="sm" />
        </div>
      </td>

      {/* Composite score */}
      <td style={{ padding: '8px 6px', borderBottom: `1px solid ${'#2A313C'}`, textAlign: 'center' }}>
        <ScoreGauge score={item.technicalScore} size={32} showValue label="" />
      </td>

      {/* Change% */}
      <td style={{ padding: '8px 8px', borderBottom: `1px solid ${'#2A313C'}` }}>
        <div style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: chgColor, fontFamily: "var(--font-mono)" }}>
          {item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed(2)}%
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: '#6B7280', fontFamily: "var(--font-mono)" }}>
          ${item.price > 0 ? item.price.toLocaleString() : '—'}
        </div>
      </td>

      {/* SmartScore mini bars */}
      <td style={{ padding: '8px 6px', borderBottom: `1px solid ${'#2A313C'}` }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {scores.map((s, i) => (
            <TinyBar key={i} value={s.v} maxVal={s.max} color={s.c} />
          ))}
        </div>
      </td>

      {/* RSI */}
      <td style={{ padding: '8px 6px', borderBottom: `1px solid ${'#2A313C'}` }}>
        <IndicatorBadge label={t('indicators.rsi')} value={item.rsi ?? '—'} status={getRsiStatus(item.rsi)} />
      </td>

      {/* MACD */}
      <td style={{ padding: '8px 6px', borderBottom: `1px solid ${'#2A313C'}` }}>
        <IndicatorBadge label={t('indicators.macd')} value={item.macdSignal === 'NONE' ? t('indicators.none') : (item.macdSignal ?? '—')} status={getMacdStatus(item.macdSignal)} />
      </td>

      {/* Stoch */}
      <td style={{ padding: '8px 6px', borderBottom: `1px solid ${'#2A313C'}`, textAlign: 'center' }}>
        <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: '#9CA3B5', fontFamily: "var(--font-mono)" }}>
          {item.stochK !== null ? `${item.stochK.toFixed(0)}/${item.stochD?.toFixed(0)}` : '—'}
        </div>
      </td>

      {/* ADX */}
      <td style={{ padding: '8px 6px', borderBottom: `1px solid ${'#2A313C'}`, textAlign: 'center' }}>
        <span style={{
          fontSize: 'var(--text-xs)', fontWeight: 800,
          color: (item.adx ?? 0) > 25 ? '#00FFA3' : '#6B7280',
          fontFamily: "var(--font-mono)",
        }}>
          {item.adx !== null ? item.adx.toFixed(1) : '—'}
        </span>
      </td>

      {/* MiniHeatmap */}
      <td style={{ padding: '8px 6px', borderBottom: `1px solid ${'#2A313C'}` }}>
        <MiniHeatmap
          data={item.sparkline} color={chgColor}
          width={72} height={24}
        />
      </td>

      {/* AI Opinion */}
      <td style={{ padding: '8px 6px', borderBottom: `1px solid ${'#2A313C'}`, textAlign: 'center' }}>
        {aiOpinionText ? (
          <div style={{
            fontSize: 'var(--text-xs)', fontWeight: 700, color: '#00D4FF',
            fontFamily: "var(--font-ar)",
            lineHeight: 1.4,
          }}>
            {safeStr(aiOpinionText)}
          </div>
        ) : (
          <span style={{ fontSize: 'var(--text-xs)', color: '#6B7280' }}>—</span>
        )}
      </td>

      {/* SmartScore Action + Actions */}
      <td style={{ padding: '8px 6px', borderBottom: `1px solid ${'#2A313C'}` }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
          {ss && <ActionBadge action={ss.action} />}
          <div style={{ display: 'flex', gap: 3 }}>
            <button
              onClick={e => { e.stopPropagation(); onSelect(item.symbol) }}
              title={t('actions.deepAnalysis')}
              style={{
                padding: 3, borderRadius: 'var(--radius-xs)', border: `0.5px solid ${'#2A313C'}`,
                background: '#151A22', color: '#6B7280', cursor: 'pointer', transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Eye size={11} />
            </button>
            <button
              onClick={e => { e.stopPropagation() }}
              title={t('actions.multiTimeframe')}
              style={{
                padding: 3, borderRadius: 'var(--radius-xs)', border: `0.5px solid ${'#2A313C'}`,
                background: '#151A22', color: '#6B7280', cursor: 'pointer', transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Layers size={11} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); onBellClick(item.symbol) }}
              title={t('actions.alerts')}
              style={{
                padding: 3, borderRadius: 'var(--radius-xs)', border: `0.5px solid ${'#2A313C'}`,
                background: '#151A22', color: hasActiveAlert ? '#FFB800' : '#6B7280',
                cursor: 'pointer', transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Bell size={11} />
            </button>
          </div>
        </div>
      </td>
    </tr>
  )
}

export const ScannerTableRow = React.memo(ScannerTableRowInner)
