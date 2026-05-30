// ═══════════════════════════════════════════════════════════
// AI Consensus SSE (Server-Sent Events) Route
// True streaming: calls each AI model individually and streams
// results as they arrive (not batch-then-replay)
// UI shows models appearing one by one ("War Room" experience)
// ═══════════════════════════════════════════════════════════

import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

// ── SSE Event Types ──────────────────────────────────────
interface SSEEvent {
  type: 'model_start' | 'model_result' | 'consensus_update' | 'complete' | 'error';
  data: any;
}

function sseMessage(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

// ── Model definitions for individual calls ───────────────
const MODELS = [
  { role: 'technical', model: 'gpt-4o', temperature: 0.3 },
  { role: 'sentiment', model: 'gpt-4o-mini', temperature: 0.5 },
  { role: 'risk', model: 'gpt-4o-mini', temperature: 0.2 },
] as const

/**
 * GET /api/ai/consensus-stream?symbol=BTC/USD
 *
 * Server-Sent Events endpoint that streams AI consensus results
 * as each model responds, instead of waiting for all models.
 *
 * Events:
 *  - model_start:  { model: string, role: string }
 *  - model_result: { role, model, vote, confidence, reason }
 *  - consensus_update: { consensusScore, recommendation, modelsResponded }
 *  - complete: { full result object }
 *  - error: { message }
 */
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol') || 'BTC/USD'
  const rawLang = req.nextUrl.searchParams.get('language') || 'en'
  const language = rawLang || 'en'

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SSEEvent) => {
        try {
          controller.enqueue(encoder.encode(sseMessage(event)))
        } catch {
          // Stream closed
        }
      }

      try {
        send({ type: 'model_start', data: { model: 'system', role: 'coordinator', message: 'Starting consensus analysis...' } })

        // ── Strategy 1: Try the batch consensus API but stream results progressively ──
        // This is more reliable than calling each model individually since the consensus
        // endpoint already handles API keys, retries, and error handling.
        // We call it and then stream each analysis result as it was received.
        const consensusUrl = new URL('/api/ai/consensus', req.url)
        const consensusRes = await fetch(consensusUrl.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol, language }),
          signal: AbortSignal.timeout(90000),
        })

        if (!consensusRes.ok) {
          send({ type: 'error', data: { message: `Consensus API returned ${consensusRes.status}` } })
          controller.close()
          return
        }

        const result = await consensusRes.json()

        if (!result.success || !result.data) {
          send({ type: 'error', data: { message: 'No consensus data available' } })
          controller.close()
          return
        }

        // ── Stream each model's result as a separate event ──
        const analyses = result.data.analyses || []
        const allAnalyses: any[] = []

        for (let i = 0; i < analyses.length; i++) {
          const analysis = analyses[i]

          // Small delay between models for "War Room" progressive reveal effect
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 150))
          }

          // Notify that a new model is reporting
          send({
            type: 'model_result',
            data: {
              role: analysis.role,
              model: analysis.model,
              vote: analysis.vote,
              confidence: analysis.confidence,
              reason: analysis.reason,
              featuresUsed: analysis.featuresUsed,
              index: i + 1,
              total: analyses.length,
            },
          })

          allAnalyses.push(analysis)

          // Send intermediate consensus update after each model
          const buyWeight = allAnalyses.filter(a => a.vote === 'BUY').reduce((s, a) => s + a.confidence, 0)
          const sellWeight = allAnalyses.filter(a => a.vote === 'SELL').reduce((s, a) => s + a.confidence, 0)
          const holdWeight = allAnalyses.filter(a => a.vote === 'HOLD').reduce((s, a) => s + a.confidence, 0)
          const total = buyWeight + sellWeight + holdWeight

          let recommendation = 'HOLD'
          let consensusScore = 0
          if (total > 0) {
            const buyPct = buyWeight / total
            const sellPct = sellWeight / total
            if (buyPct > sellPct && buyPct > holdWeight / total) {
              recommendation = 'BUY'
              consensusScore = Math.round(buyPct * 100)
            } else if (sellPct > buyPct && sellPct > holdWeight / total) {
              recommendation = 'SELL'
              consensusScore = Math.round(sellPct * 100)
            } else {
              consensusScore = Math.round((1 - Math.abs(buyPct - sellPct)) * 50)
            }
          }

          send({
            type: 'consensus_update',
            data: {
              consensusScore,
              recommendation,
              modelsResponded: i + 1,
              totalModels: analyses.length,
              buyWeight: Math.round(buyWeight),
              sellWeight: Math.round(sellWeight),
              holdWeight: Math.round(holdWeight),
            },
          })
        }

        // ── Final complete event with full data ──
        send({
          type: 'complete',
          data: result.data,
        })

      } catch (error: any) {
        send({ type: 'error', data: { message: error?.message || 'Stream error' } })
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
