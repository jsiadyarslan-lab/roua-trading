'use client'

import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import T from '@/lib/unified-tokens'

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * ErrorBoundary — Catches rendering errors in child components and displays
 * a fallback UI instead of crashing the entire dashboard.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 24px',
          textAlign: 'center',
          minHeight: '300px',
          direction: 'inherit',
          fontFamily: "var(--font-ar)",
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 'var(--radius-xl)',
            background: 'rgba(255,77,77,0.1)',
            border: '1px solid rgba(255,77,77,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 16,
          }}>
            <AlertTriangle size={28} color={T.redAlt} />
          </div>
          <h2 style={{
            fontSize: 'var(--text-lg)', fontWeight: 800, color: '#E6EBF5',
            margin: '0 0 8px',
          }}>
            حدث خطأ غير متوقع
          </h2>
          <p style={{
            fontSize: 'var(--text-sm)', color: '#8090A8',
            margin: '0 0 6px', maxWidth: 420, lineHeight: 1.7,
          }}>
            {this.state.error?.message || 'حدث خطأ أثناء عرض هذا القسم.'}
          </p>
          <p style={{
            fontSize: 'var(--text-xs)', color: T.text3,
            margin: '0 0 20px',
          }}>
            يمكنك المحاولة مرة أخرى أو العودة لاحقاً.
          </p>
          <button
            onClick={this.handleRetry}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 20px', borderRadius: 'var(--radius-md)',
              background: 'rgba(10,132,255,0.1)',
              border: '1px solid rgba(10,132,255,0.2)',
              color: T.info, fontSize: 'var(--text-sm)', fontWeight: 700,
              cursor: 'pointer', fontFamily: "var(--font-ar)",
              transition: 'all 0.2s',
            }}
          >
            <RefreshCw size={14} />
            إعادة المحاولة
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
