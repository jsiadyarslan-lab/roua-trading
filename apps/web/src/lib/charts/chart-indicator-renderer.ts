// ═══════════════════════════════════════════════════════════
// Chart Indicator Renderer — Series creation for indicators
// Extracted from useChart.ts to reduce the God Hook size.
// All pure rendering logic lives here; useChart just delegates.
// ═══════════════════════════════════════════════════════════

import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts';
import type { CandleData, ActiveIndicator } from './types';
import { sanitizeTime, isValidNumber } from './chart-utils';

// FIX (4.6): Convert module-level singleton `activeOscillatorScales` to
// per-instance factory. Previously, all chart instances shared the same Set,
// so adding an RSI oscillator on one chart would affect the scale tracking
// of all other charts in a multi-chart grid. Now each ChartIndicatorRenderer
// instance owns its own Set.

// ── Types ──────────────────────────────────────────────
export interface SeriesRefs {
  overlaySeries: Map<string, ISeriesApi<SeriesType>>;
  oscillatorSeries: Map<string, ISeriesApi<SeriesType>>;
  // M6 REAL FIX: Pass volume series separately — it's NOT in overlaySeries.
  // Previously, recalcOscillatorMargins tried to find the volume series by
  // iterating refs.overlaySeries, but the volume series is stored in its own
  // volumeSeriesRef in useChart.ts, never added to overlaySeriesRef.
  // This meant the M6 volume margin adjustment NEVER executed at runtime.
  volumeSeries?: ISeriesApi<SeriesType> | null;
}

// ═══════════════════════════════════════════════════════════
// FIX (4.6): ChartIndicatorRenderer — per-instance factory
//
// Each chart instance (useChart hook) should create its own
// ChartIndicatorRenderer via createIndicatorRenderer(). This
// ensures that oscillator scale tracking is isolated per-chart,
// preventing one chart's RSI/MACD/ATR from interfering with
// another chart's scale margins in a multi-chart grid.
// ═══════════════════════════════════════════════════════════
export class ChartIndicatorRenderer {
  // FIX (4.6): Per-instance oscillator scale tracking — no longer shared
  private activeOscillatorScales: Set<string> = new Set();

  // ── Helper: Filter NaN/Infinity and sanitize time ──
  private cleanData(data: { time: Time; value: number }[]): { time: Time; value: number }[] {
    return data
      .map(d => ({ ...d, time: sanitizeTime(d.time) as Time }))
      .filter(d => isValidNumber(d.time) && isValidNumber(d.value));
  }

  // ── Helper: Add overlay line series ──
  private addOverlayLine(
    chart: IChartApi,
    refs: SeriesRefs,
    LineSeries: any,
    key: string,
    data: { time: Time; value: number }[],
    color: string,
    lineWidth: number = 1,
    priceLineVisible = false,
  ): void {
    const filtered = this.cleanData(data);
    if (filtered.length === 0) return;
    const series = chart.addSeries(LineSeries, {
      color,
      lineWidth: lineWidth as any,
      priceLineVisible,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
    });
    series.setData(filtered as any);
    refs.overlaySeries.set(key, series);
  }

  // ── H7: Dynamically recalculate ALL oscillator panel margins ──
  // When an oscillator is added/removed, all panels must be recalculated
  // so they don't overlap and the price chart area is properly sized.
  private recalcOscillatorMargins(chart: IChartApi, refs: SeriesRefs): void {
    const scales = new Map<string, ISeriesApi<SeriesType>>();
    refs.oscillatorSeries.forEach(s => {
      try {
        const opts = s.options() as any;
        if (opts.priceScaleId) scales.set(opts.priceScaleId, s);
      } catch {}
    });
    if (scales.size === 0) return;

    const panelHeight = Math.min(0.18, Math.max(0.10, 0.65 / scales.size));
    const scaleIds = Array.from(scales.keys()).sort();

    scaleIds.forEach((scaleId, idx) => {
      const bottomMargin = idx * panelHeight;
      const topMargin = 1 - bottomMargin - panelHeight;
      const series = scales.get(scaleId)!;
      try {
        series.priceScale().applyOptions({
          scaleMargins: { top: Math.max(0.02, topMargin), bottom: bottomMargin },
          borderVisible: false,
        });
      } catch {}
    });

    // Shrink the main price chart's bottom margin to make room for oscillators
    const totalOscHeight = scales.size * panelHeight;
    try {
      // Access the default (right) price scale which the candle series uses
      chart.priceScale('right').applyOptions({
        scaleMargins: { top: 0.1, bottom: Math.min(0.15, totalOscHeight + 0.02) },
      });
    } catch {}

    // M6 REAL FIX: Adjust volume series margins to avoid overlapping with oscillator panels.
    // When oscillators take up the bottom portion of the chart, volume must be
    // compressed to the top area only. Without this, volume bars extend behind
    // oscillator panels, making them hard to read.
    // Previously, this code tried to find the volume series by iterating
    // refs.overlaySeries — but the volume series is NEVER stored there.
    // It lives in its own volumeSeriesRef in useChart.ts. Now we access it
    // directly via refs.volumeSeries.
    const volSeries = refs.volumeSeries;
    if (volSeries) {
      try {
        volSeries.priceScale().applyOptions({
          scaleMargins: { top: Math.max(0.70, 1 - totalOscHeight - 0.15), bottom: totalOscHeight },
        });
      } catch {}
    }
  }

  private addOscillatorLine(
    chart: IChartApi,
    refs: SeriesRefs,
    LineSeries: any,
    key: string,
    rawData: { time: Time; value: number }[],
    color: string,
    scaleId: string,
    lineWidth: number = 1,
    title?: string, // H5/M5: Oscillator panel title label
  ): void {
    const data = this.cleanData(rawData);
    if (data.length === 0) return;

    // FIX (4.6): Use per-instance Set instead of module-level singleton
    this.activeOscillatorScales.add(scaleId);

    const existingScaleIds = new Set<string>();
    refs.oscillatorSeries.forEach(s => {
      try {
        const opts = s.options() as any;
        if (opts.priceScaleId) existingScaleIds.add(opts.priceScaleId);
      } catch {}
    });

    const totalScales = existingScaleIds.size + 1;
    const panelHeight = Math.min(0.18, Math.max(0.10, 0.65 / totalScales));

    const scaleSlots = Array.from(existingScaleIds);
    scaleSlots.push(scaleId);
    scaleSlots.sort();
    const slotIndex = scaleSlots.indexOf(scaleId);

    const bottomMargin = slotIndex * panelHeight;
    const topMargin = 1 - bottomMargin - panelHeight;

    const series = chart.addSeries(LineSeries, {
      color,
      lineWidth: lineWidth as any,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
      priceScaleId: scaleId,
      title: title || '', // H5/M5: Show indicator name in panel
    });
    series.priceScale().applyOptions({
      scaleMargins: { top: Math.max(0.02, topMargin), bottom: bottomMargin },
      borderVisible: true, // H1/M1: Show border to visually separate panels
      borderColor: 'rgba(42,49,60,0.5)',
    });
    series.setData(data as any);
    refs.oscillatorSeries.set(key, series);

    // H7: Recalculate ALL oscillator panel margins after adding
    this.recalcOscillatorMargins(chart, refs);
  }

  /**
   * Render indicator series on chart.
   * Called from useChart's addIndicator() after calculation results are ready.
   *
   * @param chart - The lightweight-charts IChartApi instance
   * @param refs - Series refs (overlaySeries, oscillatorSeries)
   * @param indicator - The indicator configuration
   * @param results - Calculated results from calculateIndicator()
   * @param candles - Current candle data (needed for some indicators like PSAR, Pivot)
   * @param lcModule - The lightweight-charts module with LineSeries, AreaSeries, HistogramSeries
   */
  renderIndicatorSeries(
    chart: IChartApi,
    refs: SeriesRefs,
    indicator: ActiveIndicator,
    results: any[],
    candles: CandleData[],
    lcModule: { LineSeries: any; AreaSeries: any; HistogramSeries: any },
  ): void {
    const { LineSeries, AreaSeries, HistogramSeries: LCHistogram } = lcModule;

    // ════════════════════════════════════════════════════════
    // OVERLAY INDICATORS
    // ════════════════════════════════════════════════════════

    if (indicator.key === 'sma' || indicator.key === 'ema' || indicator.key === 'vwap') {
      const data = results.map((r: any) => {
        const val = r.values?.[indicator.key] ?? r.value;
        return isValidNumber(val) && isValidNumber(r.time) ? { time: r.time as Time, value: val } : null;
      }).filter((d): d is { time: Time; value: number } => d !== null);
      this.addOverlayLine(chart, refs, LineSeries, indicator.key, data, indicator.color);
    }

    else if (indicator.key === 'supertrend') {
      const upData: { time: Time; value: number }[] = [];
      const downData: { time: Time; value: number }[] = [];
      results.forEach((r: any) => {
        const val = r.value;
        const dir = r.direction;
        if (!isValidNumber(val) || !isValidNumber(r.time)) return;
        if (dir === 'up') {
          upData.push({ time: r.time as Time, value: val });
        } else {
          downData.push({ time: r.time as Time, value: val });
        }
      });
      this.addOverlayLine(chart, refs, LineSeries, 'supertrend-up', upData, '#3fb950', 2);
      this.addOverlayLine(chart, refs, LineSeries, 'supertrend-down', downData, '#f85149', 2);
    }

    else if (indicator.key === 'bb') {
      const upperData: { time: Time; value: number }[] = [];
      const middleData: { time: Time; value: number }[] = [];
      const lowerData: { time: Time; value: number }[] = [];
      results.forEach((r: any) => {
        if (isValidNumber(r.upper) && isValidNumber(r.time)) upperData.push({ time: r.time as Time, value: r.upper });
        if (isValidNumber(r.middle) && isValidNumber(r.time)) middleData.push({ time: r.time as Time, value: r.middle });
        if (isValidNumber(r.lower) && isValidNumber(r.time)) lowerData.push({ time: r.time as Time, value: r.lower });
      });
      this.addOverlayLine(chart, refs, LineSeries, 'bb-upper', upperData, 'rgba(88,166,255,0.5)');
      this.addOverlayLine(chart, refs, LineSeries, 'bb-middle', middleData, 'rgba(88,166,255,0.3)');
      this.addOverlayLine(chart, refs, LineSeries, 'bb-lower', lowerData, 'rgba(88,166,255,0.5)');

      // H9 FIX: Fill ONLY between the upper and lower bands.
      const filteredUpper = this.cleanData(upperData);
      if (filteredUpper.length > 0) {
        const upperFill = chart.addSeries(AreaSeries, {
          topColor: 'rgba(88,166,255,0.10)', bottomColor: 'rgba(88,166,255,0.06)',
          lineColor: 'transparent', lineWidth: 0 as any,
          priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        });
        upperFill.setData(filteredUpper as any);
        refs.overlaySeries.set('bb-fill-upper', upperFill);
      }

      const filteredLower = this.cleanData(lowerData);
      if (filteredLower.length > 0) {
        const lowerFill = chart.addSeries(AreaSeries, {
          topColor: 'rgba(88,166,255,0.06)', bottomColor: 'transparent',
          lineColor: 'transparent', lineWidth: 0 as any,
          priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        });
        lowerFill.setData(filteredLower as any);
        refs.overlaySeries.set('bb-fill-lower', lowerFill);
      }
    }

    else if (indicator.key === 'psar') {
      // PERF (3.3): Build Map<time,index> once for O(1) PSAR candle lookup
      const candleTimeMap = new Map<number, number>();
      for (let i = 0; i < candles.length; i++) candleTimeMap.set(candles[i].time, i);
      const psarData: { time: Time; value: number; color?: string }[] = [];
      results.forEach((r: any) => {
        const val = r.values?.psar;
        if (isValidNumber(val) && isValidNumber(r.time)) {
          const candleIdx = candleTimeMap.get(r.time as number) ?? -1;
          const candle = candleIdx >= 0 ? candles[candleIdx] : null;
          const isBullish = candle ? val < candle.close : true;
          psarData.push({ time: r.time as Time, value: val, color: isBullish ? '#3fb950' : '#f85149' });
        }
      });

      const bullData = psarData.filter(d => d.color === '#3fb950').map(d => ({ time: d.time, value: d.value }));
      const bearData = psarData.filter(d => d.color === '#f85149').map(d => ({ time: d.time, value: d.value }));

      const bullSeries = chart.addSeries(LineSeries, {
        color: '#3fb950', lineWidth: 1 as any, lineStyle: 2,
        priceLineVisible: false, lastValueVisible: false,
        crosshairMarkerVisible: false, crosshairMarkerRadius: 2,
      });
      bullSeries.setData(bullData as any);
      refs.overlaySeries.set('psar-bull', bullSeries);

      const bearSeries = chart.addSeries(LineSeries, {
        color: '#f85149', lineWidth: 1 as any, lineStyle: 2,
        priceLineVisible: false, lastValueVisible: false,
        crosshairMarkerVisible: false, crosshairMarkerRadius: 2,
      });
      bearSeries.setData(bearData as any);
      refs.overlaySeries.set('psar-bear', bearSeries);
    }

    else if (indicator.key === 'ichimoku') {
      const tenkanData: { time: Time; value: number }[] = [];
      const kijunData: { time: Time; value: number }[] = [];
      const senkouAData: { time: Time; value: number }[] = [];
      const senkouBData: { time: Time; value: number }[] = [];
      const chikouData: { time: Time; value: number }[] = [];

      results.forEach((r: any) => {
        if (isValidNumber(r.tenkan) && isValidNumber(r.time)) tenkanData.push({ time: r.time as Time, value: r.tenkan });
        if (isValidNumber(r.kijun) && isValidNumber(r.time)) kijunData.push({ time: r.time as Time, value: r.kijun });
        if (isValidNumber(r.senkouA) && isValidNumber(r.time)) senkouAData.push({ time: r.time as Time, value: r.senkouA });
        if (isValidNumber(r.senkouB) && isValidNumber(r.time)) senkouBData.push({ time: r.time as Time, value: r.senkouB });
        if (isValidNumber(r.chikou) && isValidNumber(r.time)) chikouData.push({ time: r.time as Time, value: r.chikou });
      });

      this.addOverlayLine(chart, refs, LineSeries, 'ichimoku-tenkan', tenkanData, '#2dd4bf', 1);
      this.addOverlayLine(chart, refs, LineSeries, 'ichimoku-kijun', kijunData, '#f87171', 1);
      this.addOverlayLine(chart, refs, LineSeries, 'ichimoku-senkouA', senkouAData, 'rgba(45,212,191,0.4)', 1);
      this.addOverlayLine(chart, refs, LineSeries, 'ichimoku-senkouB', senkouBData, 'rgba(248,113,113,0.4)', 1);
      this.addOverlayLine(chart, refs, LineSeries, 'ichimoku-chikou', chikouData, 'rgba(255,255,255,0.3)', 1);

      // Cloud fill
      const cloudTopData: { time: Time; value: number }[] = [];
      const cloudBottomData: { time: Time; value: number }[] = [];
      const minLen = Math.min(senkouAData.length, senkouBData.length);
      for (let i = 0; i < minLen; i++) {
        const a = senkouAData[i];
        const b = senkouBData[i];
        if (a.time === b.time && isValidNumber(a.value) && isValidNumber(b.value)) {
          cloudTopData.push({ time: a.time, value: Math.max(a.value, b.value) });
          cloudBottomData.push({ time: a.time, value: Math.min(a.value, b.value) });
        }
      }

      const filteredCloudTop = this.cleanData(cloudTopData);
      if (filteredCloudTop.length > 0) {
        const cloudTopFill = chart.addSeries(AreaSeries, {
          topColor: 'rgba(45,212,191,0.08)', bottomColor: 'rgba(45,212,191,0.03)',
          lineColor: 'transparent', lineWidth: 0 as any,
          priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        });
        cloudTopFill.setData(filteredCloudTop as any);
        refs.overlaySeries.set('ichimoku-cloud-top', cloudTopFill);
      }

      const filteredCloudBottom = this.cleanData(cloudBottomData);
      if (filteredCloudBottom.length > 0) {
        const cloudBottomFill = chart.addSeries(AreaSeries, {
          topColor: 'rgba(248,113,113,0.03)', bottomColor: 'rgba(248,113,113,0.08)',
          lineColor: 'transparent', lineWidth: 0 as any,
          priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        });
        cloudBottomFill.setData(filteredCloudBottom as any);
        refs.overlaySeries.set('ichimoku-cloud-bottom', cloudBottomFill);
      }
    }

    else if (indicator.key === 'pivot') {
      const lastCandle = candles[candles.length - 1];
      if (!lastCandle) return;
      const pivotResult = results[results.length - 1] as any;
      if (!pivotResult || pivotResult.pp === null) return;

      const pivotLines: { key: string; price: number; color: string }[] = [
        { key: 'pp', price: pivotResult.pp, color: '#a78bfa' },
        { key: 'r1', price: pivotResult.r1, color: 'rgba(63,185,80,0.6)' },
        { key: 'r2', price: pivotResult.r2, color: 'rgba(63,185,80,0.4)' },
        { key: 'r3', price: pivotResult.r3, color: 'rgba(63,185,80,0.25)' },
        { key: 's1', price: pivotResult.s1, color: 'rgba(248,81,73,0.6)' },
        { key: 's2', price: pivotResult.s2, color: 'rgba(248,81,73,0.4)' },
        { key: 's3', price: pivotResult.s3, color: 'rgba(248,81,73,0.25)' },
      ];

      pivotLines.forEach(pl => {
        if (pl.price === null || pl.price === undefined) return;
        const data = candles.map(c => ({ time: c.time as Time, value: pl.price }));
        this.addOverlayLine(chart, refs, LineSeries, `pivot-${pl.key}`, data, pl.color, pl.key === 'pp' ? 2 : 1, pl.key === 'pp');
      });
    }

    else if (indicator.key === 'donchian') {
      const upperData: { time: Time; value: number }[] = [];
      const middleData: { time: Time; value: number }[] = [];
      const lowerData: { time: Time; value: number }[] = [];
      results.forEach((r: any) => {
        if (isValidNumber(r.upper) && isValidNumber(r.time)) upperData.push({ time: r.time as Time, value: r.upper });
        if (isValidNumber(r.middle) && isValidNumber(r.time)) middleData.push({ time: r.time as Time, value: r.middle });
        if (isValidNumber(r.lower) && isValidNumber(r.time)) lowerData.push({ time: r.time as Time, value: r.lower });
      });
      this.addOverlayLine(chart, refs, LineSeries, 'donchian-upper', upperData, 'rgba(249,115,22,0.6)');
      this.addOverlayLine(chart, refs, LineSeries, 'donchian-middle', middleData, 'rgba(249,115,22,0.3)', 1);
      this.addOverlayLine(chart, refs, LineSeries, 'donchian-lower', lowerData, 'rgba(249,115,22,0.6)');

      const filteredDonchianUpper = this.cleanData(upperData);
      if (filteredDonchianUpper.length > 0) {
        const upperFill = chart.addSeries(AreaSeries, {
          topColor: 'rgba(249,115,22,0.08)', bottomColor: 'rgba(249,115,22,0.02)',
          lineColor: 'transparent', lineWidth: 0 as any,
          priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        });
        upperFill.setData(filteredDonchianUpper as any);
        refs.overlaySeries.set('donchian-fill-upper', upperFill);
      }

      const filteredDonchianLower = this.cleanData(lowerData);
      if (filteredDonchianLower.length > 0) {
        const lowerFill = chart.addSeries(AreaSeries, {
          topColor: 'rgba(249,115,22,0.02)', bottomColor: 'rgba(249,115,22,0.06)',
          lineColor: 'transparent', lineWidth: 0 as any,
          priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        });
        lowerFill.setData(filteredDonchianLower as any);
        refs.overlaySeries.set('donchian-fill-lower', lowerFill);
      }
    }

    // ════════════════════════════════════════════════════════
    // OSCILLATOR INDICATORS (sub-panels)
    // ════════════════════════════════════════════════════════

    else if (indicator.key === 'rsi') {
      const data = results.map((r: any) => {
        const val = r.values?.rsi;
        return isValidNumber(val) && isValidNumber(r.time) ? { time: r.time as Time, value: val } : null;
      }).filter((d): d is { time: Time; value: number } => d !== null);
      const rsiPeriod = indicator.params?.period || 14;
      this.addOscillatorLine(chart, refs, LineSeries, 'rsi', data, indicator.color, 'rsi-scale', 1, `RSI(${rsiPeriod})`);

      // H4 FIX: Add 70/30 reference lines for RSI overbought/oversold zones.
      const rsiSeries = refs.oscillatorSeries.get('rsi');
      if (rsiSeries) {
        try {
          rsiSeries.createPriceLine({ price: 70, color: 'rgba(248,81,73,0.4)', lineWidth: 1 as any, lineStyle: 2, axisLabelVisible: true, title: '70' });
          rsiSeries.createPriceLine({ price: 30, color: 'rgba(63,185,80,0.4)', lineWidth: 1 as any, lineStyle: 2, axisLabelVisible: true, title: '30' });
          rsiSeries.createPriceLine({ price: 50, color: 'rgba(139,146,168,0.2)', lineWidth: 1 as any, lineStyle: 1, axisLabelVisible: false, title: '' });
        } catch {}
      }
    }

    else if (indicator.key === 'macd') {
      const macdData: { time: Time; value: number }[] = [];
      const signalData: { time: Time; value: number }[] = [];
      const histData: { time: Time; value: number; color: string }[] = [];
      let prevHist = 0;

      results.forEach((r: any) => {
        if (isValidNumber(r.macd) && isValidNumber(r.time)) macdData.push({ time: r.time as Time, value: r.macd });
        if (isValidNumber(r.signal) && isValidNumber(r.time)) signalData.push({ time: r.time as Time, value: r.signal });
        if (isValidNumber(r.histogram) && isValidNumber(r.time)) {
          let color: string;
          const h = r.histogram;
          if (h >= 0) {
            color = h >= prevHist ? 'rgba(63,185,80,0.7)' : 'rgba(63,185,80,0.35)';
          } else {
            color = h <= prevHist ? 'rgba(248,81,73,0.7)' : 'rgba(248,81,73,0.35)';
          }
          histData.push({ time: r.time as Time, value: h, color });
          prevHist = h;
        }
      });

      const macdFast = indicator.params?.fast || 12;
      const macdSlow = indicator.params?.slow || 26;
      const macdSignal = indicator.params?.signal || 9;
      this.addOscillatorLine(chart, refs, LineSeries, 'macd-line', macdData, '#58a6ff', 'macd-scale', 1, `MACD(${macdFast},${macdSlow},${macdSignal})`);

      const filteredSignal = this.cleanData(signalData);
      if (filteredSignal.length > 0) {
        const sigSeries = chart.addSeries(LineSeries, {
          color: '#f97316', lineWidth: 1 as any,
          priceLineVisible: false, lastValueVisible: false,
          crosshairMarkerVisible: false, priceScaleId: 'macd-scale',
        });
        sigSeries.setData(filteredSignal as any);
        refs.oscillatorSeries.set('macd-signal', sigSeries);
      }

      const filteredHist = histData.filter(d => isValidNumber(d.time) && isValidNumber(d.value));
      if (filteredHist.length > 0) {
        const histSeries = chart.addSeries(LCHistogram, {
          priceScaleId: 'macd-scale', priceLineVisible: false, lastValueVisible: false,
        });
        histSeries.setData(filteredHist as any);
        refs.oscillatorSeries.set('macd-hist', histSeries);
      }

      // H5 FIX: Add zero line to MACD panel
      const macdLineSeries = refs.oscillatorSeries.get('macd-line');
      if (macdLineSeries) {
        try {
          macdLineSeries.createPriceLine({ price: 0, color: 'rgba(139,146,168,0.4)', lineWidth: 1 as any, lineStyle: 2, axisLabelVisible: false, title: '' });
        } catch {}
      }
    }

    else if (indicator.key === 'stochastic') {
      const kData: { time: Time; value: number }[] = [];
      const dData: { time: Time; value: number }[] = [];
      results.forEach((r: any) => {
        if (isValidNumber(r.values?.k) && isValidNumber(r.time)) kData.push({ time: r.time as Time, value: r.values.k });
        if (isValidNumber(r.values?.d) && isValidNumber(r.time)) dData.push({ time: r.time as Time, value: r.values.d });
      });

      const stochK = indicator.params?.kPeriod || 14;
      const stochD = indicator.params?.dPeriod || 3;
      this.addOscillatorLine(chart, refs, LineSeries, 'stoch-k', kData, '#a855f7', 'stoch-scale', 1, `Stoch(${stochK},${stochD})`);

      const filteredD = this.cleanData(dData);
      if (filteredD.length > 0) {
        const dSeries = chart.addSeries(LineSeries, {
          color: '#fbbf24', lineWidth: 1 as any,
          priceLineVisible: false, lastValueVisible: false,
          crosshairMarkerVisible: false, priceScaleId: 'stoch-scale',
        });
        dSeries.setData(filteredD as any);
        refs.oscillatorSeries.set('stoch-d', dSeries);
      }

      // H6 FIX: Add 80/20 reference lines for Stochastic overbought/oversold zones.
      const stochSeries = refs.oscillatorSeries.get('stoch-k');
      if (stochSeries) {
        try {
          stochSeries.createPriceLine({ price: 80, color: 'rgba(248,81,73,0.4)', lineWidth: 1 as any, lineStyle: 2, axisLabelVisible: true, title: '80' });
          stochSeries.createPriceLine({ price: 20, color: 'rgba(63,185,80,0.4)', lineWidth: 1 as any, lineStyle: 2, axisLabelVisible: true, title: '20' });
          stochSeries.createPriceLine({ price: 50, color: 'rgba(139,146,168,0.2)', lineWidth: 1 as any, lineStyle: 1, axisLabelVisible: false, title: '' });
        } catch {}
      }
    }

    else if (indicator.key === 'atr') {
      const data = results.map((r: any) => {
        const val = r.values?.atr;
        return isValidNumber(val) && isValidNumber(r.time) ? { time: r.time as Time, value: val } : null;
      }).filter((d): d is { time: Time; value: number } => d !== null);
      const atrPeriod = indicator.params?.period || 14;
      this.addOscillatorLine(chart, refs, LineSeries, 'atr', data, indicator.color, 'atr-scale', 1, `ATR(${atrPeriod})`);
    }

    else if (indicator.key === 'adx') {
      const adxData: { time: Time; value: number }[] = [];
      const pdiData: { time: Time; value: number }[] = [];
      const mdiData: { time: Time; value: number }[] = [];
      results.forEach((r: any) => {
        if (isValidNumber(r.values?.adx) && isValidNumber(r.time)) adxData.push({ time: r.time as Time, value: r.values.adx });
        if (isValidNumber(r.values?.pdi) && isValidNumber(r.time)) pdiData.push({ time: r.time as Time, value: r.values.pdi });
        if (isValidNumber(r.values?.mdi) && isValidNumber(r.time)) mdiData.push({ time: r.time as Time, value: r.values.mdi });
      });

      this.addOscillatorLine(chart, refs, LineSeries, 'adx-line', adxData, '#fbbf24', 'adx-scale', 2, `ADX(${indicator.params?.period || 14})`);

      const filteredPdi = this.cleanData(pdiData);
      if (filteredPdi.length > 0) {
        const pdiSeries = chart.addSeries(LineSeries, {
          color: '#3fb950', lineWidth: 1 as any,
          priceLineVisible: false, lastValueVisible: false,
          crosshairMarkerVisible: false, priceScaleId: 'adx-scale',
        });
        pdiSeries.setData(filteredPdi as any);
        refs.oscillatorSeries.set('adx-pdi', pdiSeries);
      }

      const filteredMdi = this.cleanData(mdiData);
      if (filteredMdi.length > 0) {
        const mdiSeries = chart.addSeries(LineSeries, {
          color: '#f85149', lineWidth: 1 as any,
          priceLineVisible: false, lastValueVisible: false,
          crosshairMarkerVisible: false, priceScaleId: 'adx-scale',
        });
        mdiSeries.setData(filteredMdi as any);
        refs.oscillatorSeries.set('adx-mdi', mdiSeries);
      }
    }

    else if (indicator.key === 'cci') {
      const data = results.map((r: any) => {
        const val = r.values?.cci;
        return isValidNumber(val) && isValidNumber(r.time) ? { time: r.time as Time, value: val } : null;
      }).filter((d): d is { time: Time; value: number } => d !== null);
      const cciPeriod = indicator.params?.period || 20;
      this.addOscillatorLine(chart, refs, LineSeries, 'cci', data, indicator.color, 'cci-scale', 1, `CCI(${cciPeriod})`);
    }
  }

  /**
   * H8 FIX: Remove orphaned price scales after oscillator removal.
   * FIX (4.6): Uses per-instance activeOscillatorScales instead of module-level singleton.
   */
  cleanupOrphanedScales(chart: IChartApi, refs: SeriesRefs): void {
    // Find all scale IDs that still have active series
    const activeScales = new Set<string>();
    refs.oscillatorSeries.forEach(s => {
      try {
        const opts = s.options() as any;
        if (opts.priceScaleId) activeScales.add(opts.priceScaleId);
      } catch {}
    });

    // Remove any scale IDs from the tracking set that no longer have series
    // FIX (4.6): Use per-instance Set
    for (const scaleId of this.activeOscillatorScales) {
      if (!activeScales.has(scaleId)) {
        this.activeOscillatorScales.delete(scaleId);
      }
    }

    // If no oscillators remain, reset the price chart's bottom margin
    if (activeScales.size === 0) {
      try {
        chart.priceScale('right').applyOptions({
          scaleMargins: { top: 0.1, bottom: 0.2 },
        });
      } catch {}
      // BUG #4 FIX: Also reset volume series margins back to default.
      const volSeries = refs.volumeSeries;
      if (volSeries) {
        try {
          volSeries.priceScale().applyOptions({
            scaleMargins: { top: 0.85, bottom: 0 },
          });
        } catch {}
      }
    } else {
      // Recalculate margins for remaining oscillators
      this.recalcOscillatorMargins(chart, refs);
    }
  }

  /**
   * Update existing indicator series data in-place.
   * Instead of removing and re-creating series, this function finds
   * existing series by key prefix and calls setData() with new results.
   * Falls back to renderIndicatorSeries() if a series doesn't exist yet.
   */
  updateIndicatorSeriesData(
    refs: SeriesRefs,
    indicator: ActiveIndicator,
    results: any[],
    candles: CandleData[],
  ): { updated: boolean; missingKeys: string[] } {
    const missingKeys: string[] = [];
    let updated = false;

    const tryUpdate = (key: string, data: { time: any; value: number }[]) => {
      const series = refs.overlaySeries.get(key) || refs.oscillatorSeries.get(key);
      if (series) {
        const filtered = this.cleanData(data as { time: Time; value: number }[]);
        if (filtered.length > 0) {
          try {
            series.setData(filtered as any);
            updated = true;
          } catch { /* series may be destroyed */ }
        }
      } else {
        missingKeys.push(key);
      }
    };

    if (indicator.key === 'sma' || indicator.key === 'ema' || indicator.key === 'vwap') {
      const data = results.map((r: any) => {
        const val = r.values?.[indicator.key] ?? r.value;
        return isValidNumber(val) && isValidNumber(r.time) ? { time: r.time, value: val } : null;
      }).filter((d): d is { time: any; value: number } => d !== null);
      tryUpdate(indicator.key, data);
    }
    else if (indicator.key === 'bb') {
      const upperData: { time: any; value: number }[] = [];
      const middleData: { time: any; value: number }[] = [];
      const lowerData: { time: any; value: number }[] = [];
      results.forEach((r: any) => {
        if (isValidNumber(r.upper) && isValidNumber(r.time)) upperData.push({ time: r.time, value: r.upper });
        if (isValidNumber(r.middle) && isValidNumber(r.time)) middleData.push({ time: r.time, value: r.middle });
        if (isValidNumber(r.lower) && isValidNumber(r.time)) lowerData.push({ time: r.time, value: r.lower });
      });
      tryUpdate('bb-upper', upperData);
      tryUpdate('bb-middle', middleData);
      tryUpdate('bb-lower', lowerData);
      tryUpdate('bb-fill-upper', upperData);
      tryUpdate('bb-fill-lower', lowerData);
    }
    else if (indicator.key === 'ichimoku') {
      const tenkanData: { time: any; value: number }[] = [];
      const kijunData: { time: any; value: number }[] = [];
      const senkouAData: { time: any; value: number }[] = [];
      const senkouBData: { time: any; value: number }[] = [];
      const chikouData: { time: any; value: number }[] = [];
      results.forEach((r: any) => {
        if (isValidNumber(r.tenkan) && isValidNumber(r.time)) tenkanData.push({ time: r.time, value: r.tenkan });
        if (isValidNumber(r.kijun) && isValidNumber(r.time)) kijunData.push({ time: r.time, value: r.kijun });
        if (isValidNumber(r.senkouA) && isValidNumber(r.time)) senkouAData.push({ time: r.time, value: r.senkouA });
        if (isValidNumber(r.senkouB) && isValidNumber(r.time)) senkouBData.push({ time: r.time, value: r.senkouB });
        if (isValidNumber(r.chikou) && isValidNumber(r.time)) chikouData.push({ time: r.time, value: r.chikou });
      });
      tryUpdate('ichimoku-tenkan', tenkanData);
      tryUpdate('ichimoku-kijun', kijunData);
      tryUpdate('ichimoku-senkouA', senkouAData);
      tryUpdate('ichimoku-senkouB', senkouBData);
      tryUpdate('ichimoku-chikou', chikouData);

      const cloudTopData: { time: any; value: number }[] = [];
      const cloudBottomData: { time: any; value: number }[] = [];
      const minLen = Math.min(senkouAData.length, senkouBData.length);
      for (let i = 0; i < minLen; i++) {
        const a = senkouAData[i];
        const b = senkouBData[i];
        if (a.time === b.time && isValidNumber(a.value) && isValidNumber(b.value)) {
          cloudTopData.push({ time: a.time, value: Math.max(a.value, b.value) });
          cloudBottomData.push({ time: a.time, value: Math.min(a.value, b.value) });
        }
      }
      tryUpdate('ichimoku-cloud-top', cloudTopData);
      tryUpdate('ichimoku-cloud-bottom', cloudBottomData);
    }
    else if (indicator.key === 'rsi') {
      const data = results.map((r: any) => {
        const val = r.values?.rsi;
        return isValidNumber(val) && isValidNumber(r.time) ? { time: r.time, value: val } : null;
      }).filter((d): d is { time: any; value: number } => d !== null);
      tryUpdate('rsi', data);
    }
    else if (indicator.key === 'macd') {
      const macdData: { time: any; value: number }[] = [];
      const signalData: { time: any; value: number }[] = [];
      const histData: { time: any; value: number; color: string }[] = [];
      results.forEach((r: any) => {
        if (isValidNumber(r.macd) && isValidNumber(r.time)) macdData.push({ time: r.time, value: r.macd });
        if (isValidNumber(r.signal) && isValidNumber(r.time)) signalData.push({ time: r.time, value: r.signal });
        if (isValidNumber(r.histogram) && isValidNumber(r.time)) histData.push({
          time: r.time, value: r.histogram,
          color: r.histogram >= 0 ? 'rgba(63,185,80,0.5)' : 'rgba(248,81,73,0.5)',
        });
      });
      tryUpdate('macd-line', macdData);
      tryUpdate('macd-signal', signalData);
      const histSeries = refs.oscillatorSeries.get('macd-hist');
      if (histSeries) {
        const filtered = histData.filter(d => isValidNumber(d.time) && isValidNumber(d.value));
        if (filtered.length > 0) {
          try { histSeries.setData(filtered as any); updated = true; } catch {}
        }
      } else {
        missingKeys.push('macd-hist');
      }
    }
    else if (indicator.key === 'stochastic') {
      const kData: { time: any; value: number }[] = [];
      const dData: { time: any; value: number }[] = [];
      results.forEach((r: any) => {
        if (isValidNumber(r.values?.k) && isValidNumber(r.time)) kData.push({ time: r.time, value: r.values.k });
        if (isValidNumber(r.values?.d) && isValidNumber(r.time)) dData.push({ time: r.time, value: r.values.d });
      });
      tryUpdate('stoch-k', kData);
      tryUpdate('stoch-d', dData);
    }
    else if (indicator.key === 'atr') {
      const data = results.map((r: any) => {
        const val = r.values?.atr;
        return isValidNumber(val) && isValidNumber(r.time) ? { time: r.time, value: val } : null;
      }).filter((d): d is { time: any; value: number } => d !== null);
      tryUpdate('atr', data);
    }
    else if (indicator.key === 'adx') {
      const adxData: { time: any; value: number }[] = [];
      const pdiData: { time: any; value: number }[] = [];
      const mdiData: { time: any; value: number }[] = [];
      results.forEach((r: any) => {
        if (isValidNumber(r.values?.adx) && isValidNumber(r.time)) adxData.push({ time: r.time, value: r.values.adx });
        if (isValidNumber(r.values?.pdi) && isValidNumber(r.time)) pdiData.push({ time: r.time, value: r.values.pdi });
        if (isValidNumber(r.values?.mdi) && isValidNumber(r.time)) mdiData.push({ time: r.time, value: r.values.mdi });
      });
      tryUpdate('adx-line', adxData);
      tryUpdate('adx-pdi', pdiData);
      tryUpdate('adx-mdi', mdiData);
    }
    else if (indicator.key === 'cci') {
      const data = results.map((r: any) => {
        const val = r.values?.cci;
        return isValidNumber(val) && isValidNumber(r.time) ? { time: r.time, value: val } : null;
      }).filter((d): d is { time: any; value: number } => d !== null);
      tryUpdate('cci', data);
    }
    else if (indicator.key === 'supertrend') {
      const upData: { time: any; value: number }[] = [];
      const downData: { time: any; value: number }[] = [];
      results.forEach((r: any) => {
        const val = r.value;
        const dir = r.direction;
        if (!isValidNumber(val) || !isValidNumber(r.time)) return;
        if (dir === 'up') upData.push({ time: r.time, value: val });
        else downData.push({ time: r.time, value: val });
      });
      tryUpdate('supertrend-up', upData);
      tryUpdate('supertrend-down', downData);
    }
    else if (indicator.key === 'donchian') {
      const upperData: { time: any; value: number }[] = [];
      const middleData: { time: any; value: number }[] = [];
      const lowerData: { time: any; value: number }[] = [];
      results.forEach((r: any) => {
        if (isValidNumber(r.upper) && isValidNumber(r.time)) upperData.push({ time: r.time, value: r.upper });
        if (isValidNumber(r.middle) && isValidNumber(r.time)) middleData.push({ time: r.time, value: r.middle });
        if (isValidNumber(r.lower) && isValidNumber(r.time)) lowerData.push({ time: r.time, value: r.lower });
      });
      tryUpdate('donchian-upper', upperData);
      tryUpdate('donchian-middle', middleData);
      tryUpdate('donchian-lower', lowerData);
      tryUpdate('donchian-fill-upper', upperData);
      tryUpdate('donchian-fill-lower', lowerData);
    }
    else if (indicator.key === 'psar') {
      const candleTimeMap = new Map<number, number>();
      for (let i = 0; i < candles.length; i++) candleTimeMap.set(candles[i].time, i);
      const bullData: { time: any; value: number }[] = [];
      const bearData: { time: any; value: number }[] = [];
      results.forEach((r: any) => {
        const val = r.values?.psar;
        if (isValidNumber(val) && isValidNumber(r.time)) {
          const candleIdx = candleTimeMap.get(r.time as number) ?? -1;
          const candle = candleIdx >= 0 ? candles[candleIdx] : null;
          const isBullish = candle ? val < candle.close : true;
          if (isBullish) bullData.push({ time: r.time, value: val });
          else bearData.push({ time: r.time, value: val });
        }
      });
      tryUpdate('psar-bull', bullData);
      tryUpdate('psar-bear', bearData);
    }
    else if (indicator.key === 'pivot') {
      const lastCandle = candles[candles.length - 1];
      if (!lastCandle) return { updated: false, missingKeys: [] };
      const pivotResult = results[results.length - 1] as any;
      if (!pivotResult || pivotResult.pp === null) return { updated: false, missingKeys: [] };

      const pivotLines: { key: string; price: number }[] = [
        { key: 'pp', price: pivotResult.pp },
        { key: 'r1', price: pivotResult.r1 },
        { key: 'r2', price: pivotResult.r2 },
        { key: 'r3', price: pivotResult.r3 },
        { key: 's1', price: pivotResult.s1 },
        { key: 's2', price: pivotResult.s2 },
        { key: 's3', price: pivotResult.s3 },
      ];
      pivotLines.forEach(pl => {
        if (pl.price === null || pl.price === undefined) return;
        const data = candles.map(c => ({ time: c.time, value: pl.price }));
        tryUpdate(`pivot-${pl.key}`, data);
      });
    }

    return { updated, missingKeys };
  }

  /** Reset per-instance state (e.g., when chart is destroyed or symbol changes) */
  reset(): void {
    this.activeOscillatorScales.clear();
  }
}

// ═══════════════════════════════════════════════════════════
// FIX (4.6): Factory function — creates a new per-instance renderer.
// Each chart instance should call this once and store the result.
// ═══════════════════════════════════════════════════════════
export function createIndicatorRenderer(): ChartIndicatorRenderer {
  return new ChartIndicatorRenderer();
}

// ═══════════════════════════════════════════════════════════
// FIX (4.6): Legacy module-level singleton for backward compatibility.
// Deprecated — new code should use createIndicatorRenderer() to get
// a per-instance ChartIndicatorRenderer. These wrappers exist so that
// existing code that imports renderIndicatorSeries /
// cleanupOrphanedScales / updateIndicatorSeriesData as standalone
// functions continues to work (single-chart mode).
// ═══════════════════════════════════════════════════════════
const _defaultRenderer = new ChartIndicatorRenderer();

/** @deprecated Use `createIndicatorRenderer()` for per-instance state */
export function renderIndicatorSeries(
  chart: IChartApi,
  refs: SeriesRefs,
  indicator: ActiveIndicator,
  results: any[],
  candles: CandleData[],
  lcModule: { LineSeries: any; AreaSeries: any; HistogramSeries: any },
): void {
  _defaultRenderer.renderIndicatorSeries(chart, refs, indicator, results, candles, lcModule);
}

/** @deprecated Use `createIndicatorRenderer()` for per-instance state */
export function cleanupOrphanedScales(chart: IChartApi, refs: SeriesRefs): void {
  _defaultRenderer.cleanupOrphanedScales(chart, refs);
}

/** @deprecated Use `createIndicatorRenderer()` for per-instance state */
export function updateIndicatorSeriesData(
  refs: SeriesRefs,
  indicator: ActiveIndicator,
  results: any[],
  candles: CandleData[],
): { updated: boolean; missingKeys: string[] } {
  return _defaultRenderer.updateIndicatorSeriesData(refs, indicator, results, candles);
}
