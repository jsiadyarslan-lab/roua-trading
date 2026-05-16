// Chart type definitions

export type ChartType = 'candle' | 'line' | 'area' | 'heikin-ashi';

export interface TimeframeOption {
  label: string;
  value: string;
  minutes: number;
  category: 'intraday' | 'daily' | 'weekly' | 'monthly';
}

export const TIMEFRAMES: TimeframeOption[] = [
  { label: '1m',  value: '1min',  minutes: 1,    category: 'intraday' },
  { label: '5m',  value: '5min',  minutes: 5,    category: 'intraday' },
  { label: '15m', value: '15min', minutes: 15,   category: 'intraday' },
  { label: '30m', value: '30min', minutes: 30,   category: 'intraday' },
  { label: '1H',  value: '1h',    minutes: 60,   category: 'intraday' },
  { label: '2H',  value: '2h',    minutes: 120,  category: 'intraday' },
  { label: '4H',  value: '4h',    minutes: 240,  category: 'intraday' },
  { label: '1D',  value: '1day',  minutes: 1440, category: 'daily' },
  { label: '1W',  value: '1week', minutes: 10080,category: 'weekly' },
  { label: '1M',  value: '1month',minutes: 43200,category: 'monthly' },
];

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CrosshairData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePercent: number;
  dateStr: string;
}

export interface ChartSettings {
  type: ChartType;
  showGrid: boolean;
  showVolume: boolean;
  showPriceLine: boolean;
}

export const CHART_COLORS = {
  bg: '#0B0E14',
  card: '#151A22',
  cardBorder: '#2A313C',
  primary: '#059669',
  gold: '#d4af37',
  upColor: '#3fb950',
  downColor: '#f85149',
  upWick: '#3fb950',
  downWick: '#f85149',
  grid: 'rgba(42,49,60,0.5)',
  crosshair: 'rgba(160,200,220,0.3)',
  text: '#E6EBF5',
  text2: '#8090A8',
};
