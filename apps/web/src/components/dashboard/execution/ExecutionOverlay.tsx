'use client'

import { ShieldAlert, CheckCircle, XCircle, Loader2, AlertTriangle } from 'lucide-react'
import type { ExecutionStatus } from './hooks/useExecutionEngine'

interface ExecutionOverlayProps {
  status: ExecutionStatus
  onConfirm: () => void
  onCancel: () => void
}

export function ExecutionOverlay({ status, onConfirm, onCancel }: ExecutionOverlayProps) {
  if (!status.msg) return null

  const iconMap = {
    success: <CheckCircle size={28} className="text-[var(--success)]" />,
    error: <XCircle size={28} className="text-[var(--danger)]" />,
    loading: <Loader2 size={28} className="text-[var(--accent)] animate-spin" />,
    confirm: <AlertTriangle size={28} className="text-[var(--warning)]" />,
    '': null,
  }

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-xl bg-[rgba(15,17,19,0.94)] p-6 text-center backdrop-blur-sm"
      style={{ direction: 'rtl' }}
    >
      {iconMap[status.type]}
      <div className="whitespace-pre-line text-[13px] font-extrabold leading-relaxed"
        style={{
          color: status.type === 'success' ? 'var(--success)' : status.type === 'error' ? 'var(--danger)' : 'var(--foreground)',
          fontFamily: "'Cairo', sans-serif",
        }}
      >
        {status.msg}
      </div>

      {status.type === 'confirm' && (
        <div className="mt-3 flex gap-3">
          <button
            onClick={onConfirm}
            className="rounded-md bg-[var(--success)] border-none px-5 py-2 text-white font-extrabold cursor-pointer text-[12px] hover:opacity-90 transition-opacity"
            style={{ fontFamily: "'Cairo', sans-serif" }}
          >
            تأكيد
          </button>
          <button
            onClick={onCancel}
            className="rounded-md bg-transparent border border-[var(--border)] px-5 py-2 text-[var(--foreground)] font-extrabold cursor-pointer text-[12px] hover:bg-[rgba(255,255,255,0.05)] transition-colors"
            style={{ fontFamily: "'Cairo', sans-serif" }}
          >
            إلغاء
          </button>
        </div>
      )}

      {status.type === 'error' && status.msg.includes('حارس المخاطر') && (
        <div className="mt-2 flex items-center gap-1.5 rounded-md border border-[rgba(255,71,87,0.2)] bg-[rgba(255,71,87,0.06)] px-3 py-1.5">
          <ShieldAlert size={12} className="text-[var(--danger)]" />
          <span className="text-[8px] font-bold text-[var(--danger)]">تم الرفض من نظام إدارة المخاطر</span>
        </div>
      )}
    </div>
  )
}
