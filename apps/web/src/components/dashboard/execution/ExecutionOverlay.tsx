'use client'

import { ShieldAlert, CheckCircle, XCircle, Loader2, AlertTriangle } from 'lucide-react'
import type { ExecutionStatus } from './hooks/useExecutionEngine'
import { useTranslations } from 'next-intl'

interface ExecutionOverlayProps {
  status: ExecutionStatus
  onConfirm: () => void
  onCancel: () => void
}

export function ExecutionOverlay({ status, onConfirm, onCancel }: ExecutionOverlayProps) {
  const tc = useTranslations('common')
  const te = useTranslations('dashboard.execution')

  if (!status.msg) return null

  const iconMap = {
    success: <CheckCircle size={20} className="text-[var(--success)]" />,
    error: <XCircle size={20} className="text-[var(--danger)]" />,
    loading: <Loader2 size={20} className="text-[var(--accent)] animate-spin" />,
    confirm: <AlertTriangle size={20} className="text-[var(--warning)]" />,
    '': null,
  }

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-lg bg-[rgba(15,17,19,0.92)] p-4 text-center backdrop-blur-sm"
      style={{ direction: 'inherit' }}
    >
      {iconMap[status.type]}
      <div className="whitespace-pre-line text-[11px] font-extrabold leading-relaxed"
        style={{
          color: status.type === 'success' ? 'var(--success)' : status.type === 'error' ? 'var(--danger)' : 'var(--foreground)',
          fontFamily: "'Cairo', sans-serif",
        }}
      >
        {status.msg}
      </div>

      {status.type === 'confirm' && (
        <div className="mt-1 flex gap-2">
          <button
            onClick={onConfirm}
            className="rounded bg-[var(--success)] border-none px-3 py-1 text-white font-extrabold cursor-pointer text-[10px] hover:opacity-90 transition-opacity"
            style={{ fontFamily: "'Cairo', sans-serif" }}
          >
            {tc('confirm')}
          </button>
          <button
            onClick={onCancel}
            className="rounded bg-transparent border border-[var(--border)] px-3 py-1 text-[var(--foreground)] font-extrabold cursor-pointer text-[10px] hover:bg-[rgba(255,255,255,0.05)] transition-colors"
            style={{ fontFamily: "'Cairo', sans-serif" }}
          >
            {tc('cancel')}
          </button>
        </div>
      )}

      {status.type === 'error' && status.msg.includes(te('riskGuard')) && (
        <div className="mt-1 flex items-center gap-1 rounded border border-[rgba(255,71,87,0.2)] bg-[rgba(255,71,87,0.06)] px-2 py-1">
          <ShieldAlert size={9} className="text-[var(--danger)]" />
          <span className="text-[7px] font-bold text-[var(--danger)]">{te('rejectedByRiskMgmt')}</span>
        </div>
      )}
    </div>
  )
}
