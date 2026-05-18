// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Signal Fetching Service
// Fetches active signals & strategic council briefs for chart display
// ═══════════════════════════════════════════════════════════

export interface ChartSignal {
  id: string;
  pair: string;
  action: 'BUY' | 'SELL' | 'WAIT' | 'HOLD' | 'LONG' | 'SHORT';
  entryPrice?: number;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  confidence?: number;
  createdAt?: string;
  timestamp?: string;
  source?: string;
}

export interface StrategicBrief {
  id: string;
  symbol: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  summary: string;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  createdAt: string;
}

export interface ChartSignalMarker {
  time: number;
  position: 'aboveBar' | 'belowBar';
  color: string;
  shape: 'arrowUp' | 'arrowDown' | 'circle';
  text: string;
  _signalData?: ChartSignal | StrategicBrief;
  _source: 'signal' | 'council';
}

/**
 * Fetch active trading signals for a specific symbol
 */
export async function fetchSignalsForChart(symbol: string): Promise<ChartSignal[]> {
  try {
    const res = await fetch(`/api/signals/active?symbol=${encodeURIComponent(symbol)}`);
    if (!res.ok) return [];
    const data = await res.json();
    const signals = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
    return signals;
  } catch (err: any) {
    console.warn('[chart-signals] fetchSignalsForChart failed:', err?.message);
    return [];
  }
}

/**
 * Fetch active strategic council briefs for a symbol
 */
export async function fetchStrategicBriefs(symbol: string): Promise<StrategicBrief[]> {
  try {
    const res = await fetch(`/api/strategic-council/briefs/active?symbol=${encodeURIComponent(symbol)}`);
    if (!res.ok) return [];
    const data = await res.json();
    const briefs = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
    return briefs;
  } catch (err: any) {
    console.warn('[chart-signals] fetchStrategicBriefs failed:', err?.message);
    return [];
  }
}

/**
 * Convert signals and briefs to chart markers for lightweight-charts
 */
export function convertToChartMarkers(
  signals: ChartSignal[],
  briefs: StrategicBrief[],
  chartSymbol: string,
): ChartSignalMarker[] {
  const markers: ChartSignalMarker[] = [];
  const normalize = (s: string) => s.toUpperCase().replace(/[/\-_]/g, '');
  const normalizedChart = normalize(chartSymbol);

  // Process trading signals
  signals.forEach((signal) => {
    const sigSymbol = normalize(signal.pair || (signal as any).symbol || '');
    if (!sigSymbol.includes(normalizedChart) && !normalizedChart.includes(sigSymbol)) return;

    const action = (signal.action || '').toUpperCase();
    const isBuy = action === 'BUY' || action === 'LONG';
    const isSell = action === 'SELL' || action === 'SHORT';
    const isWait = action === 'WAIT' || action === 'HOLD';

    if (!isBuy && !isSell && !isWait) return;

    const signalTime = signal.createdAt
      ? Math.floor(new Date(signal.createdAt).getTime() / 1000)
      : signal.timestamp
        ? Math.floor(new Date(signal.timestamp).getTime() / 1000)
        : Math.floor(Date.now() / 1000);

    const confidence = signal.confidence ? ` (${signal.confidence}%)` : '';
    const label = isBuy ? `BUY${confidence}` : isSell ? `SELL${confidence}` : `WAIT${confidence}`;

    markers.push({
      time: signalTime,
      position: isBuy ? 'belowBar' : 'aboveBar',
      color: isBuy ? '#00FFA3' : isSell ? '#FF4757' : '#fbbf24',
      shape: isBuy ? 'arrowUp' : isSell ? 'arrowDown' : 'circle',
      text: label,
      _signalData: signal,
      _source: 'signal',
    });
  });

  // Process strategic council briefs
  briefs.forEach((brief) => {
    const briefSymbol = normalize(brief.symbol || '');
    if (!briefSymbol.includes(normalizedChart) && !normalizedChart.includes(briefSymbol)) return;

    const briefTime = brief.createdAt
      ? Math.floor(new Date(brief.createdAt).getTime() / 1000)
      : Math.floor(Date.now() / 1000);

    const dirEmoji = brief.direction === 'bullish' ? '▲' : brief.direction === 'bearish' ? '▼' : '◆';
    const confLabel = `(${Math.round(brief.confidence * 100)}%)`;

    markers.push({
      time: briefTime,
      position: brief.direction === 'bullish' ? 'belowBar' : 'aboveBar',
      color: brief.direction === 'bullish' ? '#00D4FF' : brief.direction === 'bearish' ? '#FF6B6B' : '#fbbf24',
      shape: brief.direction === 'bullish' ? 'arrowUp' : 'arrowDown',
      text: `${dirEmoji} Council ${confLabel}`,
      _signalData: brief,
      _source: 'council',
    });
  });

  // Sort by time (lightweight-charts requires ascending order)
  markers.sort((a, b) => a.time - b.time);

  return markers;
}
