// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — News Markers
// Displays news events as vertical dashed lines on the chart
// ═══════════════════════════════════════════════════════════

'use client';

import { useState, useEffect, useCallback } from 'react';
import type { NewsMarker } from '@/lib/charts/types';

interface NewsMarkersProps {
  symbol: string;
  onMarkersUpdate?: (markers: NewsMarker[]) => void;
}

export function NewsMarkers({ symbol, onMarkersUpdate }: NewsMarkersProps) {
  const [markers, setMarkers] = useState<NewsMarker[]>([]);
  const [selectedMarker, setSelectedMarker] = useState<NewsMarker | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch news for the current symbol
  const fetchNews = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/news/feed?symbol=${encodeURIComponent(symbol)}&limit=20`, { cache: 'no-store' });
      if (!res.ok) return;

      const data = await res.json();
      const newsItems: NewsMarker[] = (data.data || data.news || []).map((n: any) => ({
        time: Math.floor(new Date(n.publishedAt || n.date || n.timestamp).getTime() / 1000),
        title: n.title || n.headline || '',
        summary: n.summary || n.description || '',
        source: n.source || '',
        url: n.url || n.link,
        sentiment: n.sentiment || 'neutral',
      })).filter((n: NewsMarker) => n.time > 0 && n.title);

      setMarkers(newsItems);
      onMarkersUpdate?.(newsItems);
    } catch {
      // Silently fail — news is non-critical
    } finally {
      setLoading(false);
    }
  }, [symbol, onMarkersUpdate]);

  useEffect(() => {
    fetchNews();
    // Refresh news every 5 minutes
    const interval = setInterval(fetchNews, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchNews]);

  // This component doesn't render directly on the chart;
  // Instead, it provides data that the parent can use to add markers
  // The parent should call chart API to add vertical lines
  // This is a data provider component

  return null; // Rendered via chart markers, not as a standalone UI element
}

// ── Utility: Create lightweight-charts markers from news ──
export function createNewsChartMarkers(newsMarkers: NewsMarker[]) {
  return newsMarkers.map(marker => ({
    time: marker.time as any,
    position: 'aboveBar' as const,
    color: marker.sentiment === 'positive' ? '#00FFA3' : marker.sentiment === 'negative' ? '#FF4757' : '#FFB800',
    shape: 'circle' as const,
    text: '🔔',
  }));
}
