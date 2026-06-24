// SVG Sparkline Chart Helpers for the Assistant Chat
// Lightweight - no external dependencies

export function renderSparkline(
  data: number[],
  options?: {
    width?: number;
    height?: number;
    color?: string;
    fillColor?: string;
    strokeWidth?: number;
  }
): string {
  const { width = 120, height = 40, color = '#3b82f6', fillColor = 'rgba(59,130,246,0.1)', strokeWidth = 1.5 } = options || {};
  
  if (!data || data.length < 2) return '';
  
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');
  
  const fillPoints = `0,${height} ${points} ${width},${height}`;
  
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <polygon points="${fillPoints}" fill="${fillColor}" />
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />
  </svg>`;
}

export function renderMiniCandlestick(
  candles: Array<{ open: number; close: number; high: number; low: number }>,
  options?: { width?: number; height?: number }
): string {
  const { width = 120, height = 50 } = options || {};
  
  if (!candles || candles.length === 0) return '';
  
  const allPrices = candles.flatMap(c => [c.high, c.low]);
  const min = Math.min(...allPrices);
  const max = Math.max(...allPrices);
  const range = max - min || 1;
  
  const candleWidth = Math.max(2, Math.floor((width / candles.length) * 0.6));
  const gap = width / candles.length;
  
  const candleSvgs = candles.map((c, i) => {
    const x = gap * i + gap / 2;
    const isUp = c.close >= c.open;
    const color = isUp ? '#22c55e' : '#ef4444';
    
    const highY = height - ((c.high - min) / range) * height;
    const lowY = height - ((c.low - min) / range) * height;
    const openY = height - ((c.open - min) / range) * height;
    const closeY = height - ((c.close - min) / range) * height;
    
    const bodyTop = Math.min(openY, closeY);
    const bodyHeight = Math.max(Math.abs(closeY - openY), 1);
    
    return `
      <line x1="${x}" y1="${highY}" x2="${x}" y2="${lowY}" stroke="${color}" stroke-width="1" />
      <rect x="${x - candleWidth/2}" y="${bodyTop}" width="${candleWidth}" height="${bodyHeight}" fill="${color}" rx="0.5" />
    `;
  }).join('');
  
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${candleSvgs}</svg>`;
}

export function renderPriceChange(change: number, changePercent: number, _locale: string = 'ar'): string {
  const isUp = change >= 0;
  const arrow = isUp ? '▲' : '▼';
  const color = isUp ? '#22c55e' : '#ef4444';
  const sign = isUp ? '+' : '';
  
  return `<span style="color:${color};font-weight:600;font-size:0.9em">${arrow} ${sign}${changePercent.toFixed(2)}%</span>`;
}

/**
 * Detect price data patterns in assistant response text and generate inline sparklines
 * Looks for patterns like: prices: [100, 101, 102, ...] or sparkline data
 */
export function extractPriceDataFromText(text: string): Array<{ prices: number[]; label?: string }> {
  const results: Array<{ prices: number[]; label?: string }> = [];
  
  // Match patterns like "prices: [100, 101, 102]" or "data:[1.5,2.3,1.8]"
  const priceArrayRegex = /(?:prices?|data|values?|sparkline)[:\s]*\[([\d.,\s]+)\]/gi;
  let match;
  while ((match = priceArrayRegex.exec(text)) !== null) {
    const nums = match[1].split(',').map(n => parseFloat(n.trim())).filter(n => !isNaN(n));
    if (nums.length >= 2) {
      results.push({ prices: nums });
    }
  }
  
  return results;
}

/**
 * Generate a color based on price trend (green for up, red for down)
 */
export function getTrendColor(prices: number[]): { stroke: string; fill: string } {
  if (!prices || prices.length < 2) return { stroke: '#3b82f6', fill: 'rgba(59,130,246,0.1)' };
  const isUp = prices[prices.length - 1] >= prices[0];
  return isUp
    ? { stroke: '#22c55e', fill: 'rgba(34,197,94,0.1)' }
    : { stroke: '#ef4444', fill: 'rgba(239,68,68,0.1)' };
}
