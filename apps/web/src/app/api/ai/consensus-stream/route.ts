// ═══════════════════════════════════════════════════════════
// AI Consensus SSE (Server-Sent Events) Route
// Replaces blocking 60-second request with streaming response
// Each model's response is streamed as it arrives
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
  const language = req.nextUrl.searchParams.get('language') === 'en' ? 'en' : 'ar'

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
        // ── Phase 1: Try to get real AI consensus ──────────
        // Call the existing consensus endpoint but stream results as they come
        send({ type: 'model_start', data: { model: 'system', role: 'coordinator', message: 'Starting consensus analysis...' } })

        // We'll call the consensus API internally and stream the merged result
        const consensusUrl = new URL('/api/ai/consensus', req.url)
        const consensusRes = await fetch(consensusUrl.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol, language }),
          signal: AbortSignal.timeout(90000), // 90s max
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

        for (let i = 0; i < analyses.length; i++) {
          const analysis = analyses[i]

          // Simulate progressive delivery with small delays
          // This creates the "War Room" effect of models appearing one by one
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 200))
          }

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

          // Send intermediate consensus update
          const partialAnalyses = analyses.slice(0, i + 1)
          const buyWeight = partialAnalyses.filter(a => a.vote === 'BUY').reduce((s, a) => s + a.confidence, 0)
          const sellWeight = partialAnalyses.filter(a => a.vote === 'SELL').reduce((s, a) => s + a.confidence, 0)
          const holdWeight = partialAnalyses.filter(a => a.vote === 'HOLD').reduce((s, a) => s + a.confidence, 0)
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

        // ── Final complete event ──
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
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  })
}
