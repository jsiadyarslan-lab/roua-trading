'use client';

import { useEffect, useState, useRef } from 'react';
import { createChart, CandlestickSeries } from 'lightweight-charts';

// قائمة الأصول التي سنعرضها
const WATCHLIST = [
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'MSFT', name: 'Microsoft' },
  { symbol: 'GOOGL', name: 'Google' },
  { symbol: 'TSLA', name: 'Tesla' },
  { symbol: 'BTC/USDT', name: 'Bitcoin' },
  { symbol: 'EUR/USD', name: 'Euro/Dollar' },
];

export default function DashboardPage() {
  const [selectedSymbol, setSelectedSymbol] = useState('AAPL');
  const [marketData, setMarketData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);

  // جلب بيانات السوق لجميع الأصول في قائمة المراقبة
  useEffect(() => {
    const fetchAllQuotes = async () => {
      try {
        const promises = WATCHLIST.map(item =>
          fetch(`/api/exchange/quote/${item.symbol}`).then(res => res.json())
        );
        const results = await Promise.all(promises);
        const validData = results
          .filter(r => r.success)
          .map(r => ({ ...r.data, name: WATCHLIST.find(w => w.symbol === r.data.symbol)?.name }));
        setMarketData(validData);
      } catch (error) {
        console.error('فشل جلب بيانات السوق:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchAllQuotes();
  }, []);

  // إنشاء الرسم البياني عند تحميل الصفحة
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // إنشاء الرسم البياني
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 500,
      layout: {
        background: { color: '#0B0E14' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: '#2A313C' },
        horzLines: { color: '#2A313C' },
      },
    });
    chartRef.current = chart;

    // إضافة سلسلة الشموع اليابانية
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });
    seriesRef.current = candlestickSeries;

    // تحميل البيانات الأولية
    loadHistoricalData(selectedSymbol, candlestickSeries);

    // تنظيف عند إلغاء التحميل
    return () => {
      chart.remove();
    };
  }, []);

  // تغيير الرسم البياني عند اختيار أصل جديد
  useEffect(() => {
    if (seriesRef.current) {
      loadHistoricalData(selectedSymbol, seriesRef.current);
    }
  }, [selectedSymbol]);

  const loadHistoricalData = async (symbol: string, series: any) => {
    try {
      const res = await fetch(`/api/exchange/history/${symbol}?interval=1d&limit=100`);
      const json = await res.json();
      if (json.success && json.data.length > 0) {
        const chartData = json.data.map((candle: any) => ({
          time: Math.floor(new Date(candle.timestamp).getTime() / 1000),
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        }));
        series.setData(chartData);
      }
    } catch (error) {
      console.error('فشل تحميل البيانات التاريخية:', error);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">لوحة التحكم</h1>

      {/* قائمة المراقبة */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {loading ? (
          <div className="text-gray-400">جاري التحميل...</div>
        ) : (
          marketData.map((item) => (
            <div
              key={item.symbol}
              onClick={() => setSelectedSymbol(item.symbol)}
              className={`p-4 rounded-lg border cursor-pointer transition-all ${
                selectedSymbol === item.symbol
                  ? 'border-teal-500 bg-teal-500/10'
                  : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
              }`}
            >
              <div className="text-sm text-gray-400">{item.name}</div>
              <div className="text-lg font-bold text-white">{item.price?.toFixed(2)}</div>
              <div className={`text-sm ${item.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {item.change >= 0 ? '+' : ''}{item.change?.toFixed(2)} ({item.changePercent?.toFixed(2)}%)
              </div>
            </div>
          ))
        )}
      </div>

      {/* الرسم البياني */}
      <div className="rounded-lg border border-gray-700 overflow-hidden">
        <div ref={chartContainerRef} className="w-full h-[500px]" />
      </div>
    </div>
  );
}
