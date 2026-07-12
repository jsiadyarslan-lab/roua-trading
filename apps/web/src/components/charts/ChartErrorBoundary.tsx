'use client';

import React from 'react'
import T from '@/lib/unified-tokens';

interface ChartErrorBoundaryProps {
  children: React.ReactNode;
  /** Optional fallback component to show on error */
  fallback?: React.ReactNode;
  /** Callback when an error is caught */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** Symbol being displayed (for error context) */
  symbol?: string;
}

interface ChartErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * Chart Error Boundary — prevents chart crashes from taking down the entire page.
 * FIX (4.5): Wraps the chart panel so that rendering errors in lightweight-charts,
 * indicator calculations, or overlay rendering are contained.
 * Shows a user-friendly retry button instead of a blank page.
 */
export class ChartErrorBoundary extends React.Component<ChartErrorBoundaryProps, ChartErrorBoundaryState> {
  constructor(props: ChartErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ChartErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    // Log to console for debugging
    console.error('[ChartErrorBoundary] Chart rendering error:', error, errorInfo);
    // Call optional error callback
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback if provided
      if (this.props.fallback) return this.props.fallback;

      // Default error UI
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          minHeight: 300,
          background: '#0d1117',
          color: T.text2,
          fontFamily: "var(--font-en)",
          gap: 12,
          padding: 24,
        }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'rgba(255,71,87,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 'var(--text-xl)',
          }}>
            ⚠
          </div>
          <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: T.text }}>
            Chart Rendering Error
          </div>
          <div style={{ fontSize: 'var(--text-xs)', textAlign: 'center', maxWidth: 300, lineHeight: 1.5 }}>
            {this.props.symbol ? `[${this.props.symbol}] ` : ''}
            {this.state.error?.message || 'An unexpected error occurred while rendering the chart.'}
          </div>
          <button
            onClick={this.handleRetry}
            aria-label="Retry chart rendering"
            style={{
              marginTop: 8,
              padding: '8px 20px',
              background: 'rgba(0,212,255,0.15)',
              color: T.info,
              border: '1px solid rgba(0,212,255,0.3)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              transition: 'all 0.15s',
            }}
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
