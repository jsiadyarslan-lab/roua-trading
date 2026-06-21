import { Controller, Get, Query, Res, UseGuards, Logger } from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard, Public } from '../../common/guards/auth.guard';
import { OandaStreamingService } from './adapters/oanda-streaming.service';
import { ConfigService } from '@nestjs/config';

/**
 * V360: OANDA Stream SSE Proxy
 *
 * GET /api/exchange/oanda-stream?symbols=EUR/USD,GBP/USD,XAU/USD
 *
 * This endpoint opens a Server-Sent Events (SSE) connection that forwards
 * real-time OANDA price updates to the browser. The browser reads this
 * stream directly (no polling, no Socket.IO) — same latency as Binance WS.
 *
 * Architecture:
 *   Browser → SSE (this endpoint) → OandaStreamingService → OANDA Stream API
 *                                     ↑ (EventEmitter)
 *
 * The OANDA token stays on the backend — the browser never sees it.
 */
@Controller('exchange')
@UseGuards(AuthGuard)
export class OandaStreamController {
  private readonly logger = new Logger(OandaStreamController.name);

  constructor(
    private readonly oandaStreaming: OandaStreamingService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * SSE endpoint — streams OANDA prices to the browser.
   *
   * The browser connects with:
   *   fetch('/api/exchange/oanda-stream?symbols=EUR/USD,GBP/USD', {
   *     headers: { 'Accept': 'text/event-stream' }
   *   })
   *
   * Each price update is sent as:
   *   data: {"symbol":"EUR/USD","price":1.14712,"bid":1.14710,"ask":1.14714,...}\n\n
   */
  @Public() // Market data is public (same as quote endpoint)
  @Get('oanda-stream')
  async streamPrices(
    @Query('symbols') symbols: string,
    @Res() res: Response,
  ) {
    // Parse symbols
    const symbolList = (symbols || '')
      .split(',')
      .map(s => s.trim().toUpperCase())
      .filter(s => s.length > 0);

    if (symbolList.length === 0) {
      res.status(400).json({ error: 'No symbols specified. Use ?symbols=EUR/USD,GBP/USD' });
      return;
    }

    if (!this.oandaStreaming.isAvailable()) {
      res.status(503).json({ error: 'OANDA streaming not configured' });
      return;
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders?.();

    this.logger.log(`🌊 [SSE] Client connected — streaming ${symbolList.length} OANDA pairs: ${symbolList.join(', ')}`);

    // Subscribe to all requested symbols
    for (const symbol of symbolList) {
      this.oandaStreaming.subscribe(symbol);
    }

    // Price handler — forward to SSE client
    const priceHandler = (update: any) => {
      if (!symbolList.includes(update.symbol)) return;

      const sseData = JSON.stringify({
        symbol: update.symbol,
        price: update.price,
        bid: update.bid,
        ask: update.ask,
        timestamp: update.time,
        change: 0,
        changePercent: 0,
        open: update.price,
        high: update.price,
        low: update.price,
        close: update.price,
        volume: 0,
      });

      try {
        res.write(`data: ${sseData}\n\n`);
      } catch {
        // Client disconnected — will be handled by close handler
      }
    };

    this.oandaStreaming.onPrice(priceHandler);

    // Send initial heartbeat
    try {
      res.write(`data: ${JSON.stringify({ type: 'connected', symbols: symbolList })}\n\n`);
    } catch {}

    // Heartbeat every 15s to keep connection alive
    const heartbeatInterval = setInterval(() => {
      try {
        res.write(`data: ${JSON.stringify({ type: 'heartbeat', time: new Date().toISOString() })}\n\n`);
      } catch {
        // Client disconnected
      }
    }, 15000);

    // Handle client disconnect
    const cleanup = () => {
      clearInterval(heartbeatInterval);
      this.oandaStreaming.offPrice(priceHandler);
      for (const symbol of symbolList) {
        this.oandaStreaming.unsubscribe(symbol);
      }
      this.logger.log(`🌊 [SSE] Client disconnected — unsubscribed from ${symbolList.length} pairs`);
      try { res.end(); } catch {}
    };

    res.on('close', cleanup);
    res.on('error', cleanup);
  }
}
