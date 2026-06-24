/**
 * V464: SSE Streaming route for /api/assistant/chat/stream
 *
 * This route handler does NOT use createNestJSProxyHandlers because that
 * buffers the entire response (breaks SSE streaming).
 *
 * Instead, it manually proxies to NestJS using fetch() with proper auth
 * token injection, and streams the response body back to the client.
 *
 * Flow:
 *   1. Extract session token from cookie/Authorization header
 *   2. Proxy POST to NestJS /api/assistant/chat/stream
 *   3. Stream the response body (SSE events) back to the client
 */

import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const rawTarget = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001'
const API_TARGET = rawTarget.includes('http://api:') ? 'http://127.0.0.1:3001' : rawTarget

/**
 * Extract session token from request (same logic as nestjs-proxy.ts)
 */
function extractSessionToken(request: NextRequest): string | null {
  const cookieToken = request.cookies.get('roua_session')?.value
  if (cookieToken) return cookieToken

  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim()
    if (token) return token
  }

  const customHeader = request.headers.get('x-roua-session')
  if (customHeader?.trim()) return customHeader.trim()

  return null
}

export async function POST(request: NextRequest) {
  try {
    const token = extractSessionToken(request)

    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: 'No session token found' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Parse the request body
    const body = await request.json().catch(() => ({}))

    // Proxy to NestJS
    const upstreamUrl = `${API_TARGET}/api/assistant/chat/stream`
    const upstreamRes = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'x-roua-session': token,
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(body),
    })

    if (!upstreamRes.ok) {
      const errorText = await upstreamRes.text().catch(() => 'Upstream error')
      return new Response(
        JSON.stringify({
          success: false,
          error: `Upstream returned ${upstreamRes.status}`,
          details: errorText.slice(0, 200),
        }),
        {
          status: upstreamRes.status,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    // Verify it's actually an SSE response
    const contentType = upstreamRes.headers.get('content-type') || ''
    if (!contentType.includes('text/event-stream')) {
      // Not SSE — return as JSON (might be an error from NestJS)
      const text = await upstreamRes.text()
      return new Response(text, {
        status: 200,
        headers: { 'Content-Type': contentType || 'application/json' },
      })
    }

    // Stream the SSE response back to the client
    // V464: Use TransformStream to pipe the response body
    const stream = new ReadableStream({
      async start(controller) {
        const reader = upstreamRes.body?.getReader()
        if (!reader) {
          controller.close()
          return
        }

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) {
              break
            }
            controller.enqueue(value)
          }
        } catch (e) {
          // Client disconnected or stream error — close gracefully
          console.warn('[assistant/stream] Stream error:', e instanceof Error ? e.message : 'unknown')
        } finally {
          controller.close()
          try {
            reader.releaseLock()
          } catch {
            // ignore
          }
        }
      },
      cancel() {
        // Client cancelled — abort the upstream fetch if possible
        console.log('[assistant/stream] Client cancelled stream')
      },
    })

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error) {
    console.error('[assistant/stream] Route error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}

// Also support GET for EventSource clients (no body — uses query params)
export async function GET(request: NextRequest) {
  const token = extractSessionToken(request)

  if (!token) {
    return new Response(
      JSON.stringify({ success: false, error: 'No session token found' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // Convert query params to body
  const url = new URL(request.url)
  const message = url.searchParams.get('message')
  const language = url.searchParams.get('language') || 'ar'
  const symbol = url.searchParams.get('symbol') || undefined

  if (!message) {
    return new Response(
      JSON.stringify({ success: false, error: 'message query param is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const body = { message, language, symbol }

  const upstreamUrl = `${API_TARGET}/api/assistant/chat/stream`
  const upstreamRes = await fetch(upstreamUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'x-roua-session': token,
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify(body),
  })

  if (!upstreamRes.ok || !upstreamRes.body) {
    return new Response(
      JSON.stringify({ success: false, error: `Upstream ${upstreamRes.status}` }),
      { status: upstreamRes.status, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstreamRes.body!.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          controller.enqueue(value)
        }
      } catch {
        // ignore
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
