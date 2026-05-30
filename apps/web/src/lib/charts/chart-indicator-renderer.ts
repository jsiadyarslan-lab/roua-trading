// ═══════════════════════════════════════════════════════════
// Chart Indicator Renderer — Series creation for indicators
// Extracted from useChart.ts to reduce the God Hook size.
// All pure rendering logic lives here; useChart just delegates.
// ═══════════════════════════════════════════════════════════

import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts';
import type { CandleData, ActiveIndicator } from './types';
import { sanitizeTime, isValidNumber } from './chart-utils';

// ── Types ──────────────────────────────────────────────
interface SeriesRefs {
  overlaySeries: Map<string, ISeriesApi<SeriesType>>;
  oscillatorSeries: Map<string, ISeriesApi<SeriesType>>;
}

// ── Helper: Filter NaN/Infinity and sanitize time ──
function cleanData(data: { time: Time; value: number }[]): { time: Time; value: number }[] {
  return data
    .map(d => ({ ...d, time: sanitizeTime(d.time) as Time }))
    .filter(d => isValidNumber(d.time) && isValidNumber(d.value));
}

// ── Helper: Add overlay line series ──
function addOverlayLine(
  chart: IChartApi,
  refs: SeriesRefs,
  LineSeries: any,
  key: string,
  data: { time: Time; value: number }[],
  color: string,
  lineWidth: number = 1,
  priceLineVisible = false,
): void {
  const filtered = cleanData(data);
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

// ── Helper: Add oscillator sub-panel series ──
function addOscillatorLine(
  chart: IChartApi,
  refs: SeriesRefs,
  LineSeries: any,
  key: string,
  rawData: { time: Time; value: number }[],
  color: string,
  scaleId: string,
  lineWidth: number = 1,
): void {
  const data = cleanData(rawData);
  if (data.length === 0) return;

  const existingScaleIds = new Set<string>();
  refs.oscillatorSeries.forEach(s => {
    try {
      const opts = s.options() as any;
      if (opts.priceScaleId) existingScaleIds.add(opts.priceScaleId);
    } catch {}
  });

  const totalScales = existingScaleIds.size + 1;
  const panelHeight = Math.min(0.15, Math.max(0.10, 0.60 / totalScales));

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
  });
  series.priceScale().applyOptions({
    scaleMargins: { top: Math.max(0.1, topMargin), bottom: bottomMargin },
    borderVisible: false,
  });
  series.setData(data as any);
  refs.oscillatorSeries.set(key, series);
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
export function renderIndicatorSeries(
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
    addOverlayLine(chart, refs, LineSeries, indicator.key, data, indicator.color);
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
    addOverlayLine(chart, refs, LineSeries, 'supertrend-up', upData, '#3fb950', 2);
    addOverlayLine(chart, refs, LineSeries, 'supertrend-down', downData, '#f85149', 2);
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
    addOverlayLine(chart, refs, LineSeries, 'bb-upper', upperData, 'rgba(88,166,255,0.5)');
    addOverlayLine(chart, refs, LineSeries, 'bb-middle', middleData, 'rgba(88,166,255,0.3)');
    addOverlayLine(chart, refs, LineSeries, 'bb-lower', lowerData, 'rgba(88,166,255,0.5)');

    const filteredUpper = cleanData(upperData);
    if (filteredUpper.length > 0) {
      const upperFill = chart.addSeries(AreaSeries, {
        topColor: 'rgba(88,166,255,0.08)', bottomColor: 'rgba(88,166,255,0.02)',
        lineColor: 'transparent', lineWidth: 0 as any,
        priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
      });
      upperFill.setData(filteredUpper as any);
      refs.overlaySeries.set('bb-fill-upper', upperFill);
    }

    const filteredLower = cleanData(lowerData);
    if (filteredLower.length > 0) {
      const lowerFill = chart.addSeries(AreaSeries, {
        topColor: 'rgba(88,166,255,0.02)', bottomColor: 'rgba(88,166,255,0.06)',
        lineColor: 'transparent', lineWidth: 0 as any,
        priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
      });
      lowerFill.setData(filteredLower as any);
      refs.overlaySeries.set('bb-fill-lower', lowerFill);
    }
  }

  else if (indicator.key === 'psar') {
    const psarData: { time: Time; value: number; color?: string }[] = [];
    results.forEach((r: any) => {
      const val = r.values?.psar;
      if (isValidNumber(val) && isValidNumber(r.time)) {
        const candleIdx = candles.findIndex(c => c.time === r.time);
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

    addOverlayLine(chart, refs, LineSeries, 'ichimoku-tenkan', tenkanData, '#2dd4bf', 1);
    addOverlayLine(chart, refs, LineSeries, 'ichimoku-kijun', kijunData, '#f87171', 1);
    addOverlayLine(chart, refs, LineSeries, 'ichimoku-senkouA', senkouAData, 'rgba(45,212,191,0.4)', 1);
    addOverlayLine(chart, refs, LineSeries, 'ichimoku-senkouB', senkouBData, 'rgba(248,113,113,0.4)', 1);
    addOverlayLine(chart, refs, LineSeries, 'ichimoku-chikou', chikouData, 'rgba(255,255,255,0.3)', 1);

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

    const filteredCloudTop = cleanData(cloudTopData);
    if (filteredCloudTop.length > 0) {
      const cloudTopFill = chart.addSeries(AreaSeries, {
        topColor: 'rgba(45,212,191,0.08)', bottomColor: 'rgba(45,212,191,0.03)',
        lineColor: 'transparent', lineWidth: 0 as any,
        priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
      });
      cloudTopFill.setData(filteredCloudTop as any);
      refs.overlaySeries.set('ichimoku-cloud-top', cloudTopFill);
    }

    const filteredCloudBottom = cleanData(cloudBottomData);
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
      addOverlayLine(chart, refs, LineSeries, `pivot-${pl.key}`, data, pl.color, pl.key === 'pp' ? 2 : 1, pl.key === 'pp');
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
    addOverlayLine(chart, refs, LineSeries, 'donchian-upper', upperData, 'rgba(249,115,22,0.6)');
    addOverlayLine(chart, refs, LineSeries, 'donchian-middle', middleData, 'rgba(249,115,22,0.3)', 1);
    addOverlayLine(chart, refs, LineSeries, 'donchian-lower', lowerData, 'rgba(249,115,22,0.6)');

    const filteredDonchianUpper = cleanData(upperData);
    if (filteredDonchianUpper.length > 0) {
      const upperFill = chart.addSeries(AreaSeries, {
        topColor: 'rgba(249,115,22,0.08)', bottomColor: 'rgba(249,115,22,0.02)',
        lineColor: 'transparent', lineWidth: 0 as any,
        priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
      });
      upperFill.setData(filteredDonchianUpper as any);
      refs.overlaySeries.set('donchian-fill-upper', upperFill);
    }

    const filteredDonchianLower = cleanData(lowerData);
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
    addOscillatorLine(chart, refs, LineSeries, 'rsi', data, indicator.color, 'rsi-scale');
  }

  else if (indicator.key === 'macd') {
    const macdData: { time: Time; value: number }[] = [];
    const signalData: { time: Time; value: number }[] = [];
    const histData: { time: Time; value: number; color: string }[] = [];

    results.forEach((r: any) => {
      if (isValidNumber(r.macd) && isValidNumber(r.time)) macdData.push({ time: r.time as Time, value: r.macd });
      if (isValidNumber(r.signal) && isValidNumber(r.time)) signalData.push({ time: r.time as Time, value: r.signal });
      if (isValidNumber(r.histogram) && isValidNumber(r.time)) histData.push({
        time: r.time as Time, value: r.histogram,
        color: r.histogram >= 0 ? 'rgba(63,185,80,0.5)' : 'rgba(248,81,73,0.5)',
      });
    });

    addOscillatorLine(chart, refs, LineSeries, 'macd-line', macdData, '#58a6ff', 'macd-scale');

    const filteredSignal = cleanData(signalData);
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
  }

  else if (indicator.key === 'stochastic') {
    const kData: { time: Time; value: number }[] = [];
    const dData: { time: Time; value: number }[] = [];
    results.forEach((r: any) => {
      if (isValidNumber(r.values?.k) && isValidNumber(r.time)) kData.push({ time: r.time as Time, value: r.values.k });
      if (isValidNumber(r.values?.d) && isValidNumber(r.time)) dData.push({ time: r.time as Time, value: r.values.d });
    });

    addOscillatorLine(chart, refs, LineSeries, 'stoch-k', kData, '#a855f7', 'stoch-scale');

    const filteredD = cleanData(dData);
    if (filteredD.length > 0) {
      const dSeries = chart.addSeries(LineSeries, {
        color: '#fbbf24', lineWidth: 1 as any,
        priceLineVisible: false, lastValueVisible: false,
        crosshairMarkerVisible: false, priceScaleId: 'stoch-scale',
      });
      dSeries.setData(filteredD as any);
      refs.oscillatorSeries.set('stoch-d', dSeries);
    }
  }

  else if (indicator.key === 'atr') {
    const data = results.map((r: any) => {
      const val = r.values?.atr;
      return isValidNumber(val) && isValidNumber(r.time) ? { time: r.time as Time, value: val } : null;
    }).filter((d): d is { time: Time; value: number } => d !== null);
    addOscillatorLine(chart, refs, LineSeries, 'atr', data, indicator.color, 'atr-scale');
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

    addOscillatorLine(chart, refs, LineSeries, 'adx-line', adxData, '#fbbf24', 'adx-scale', 2);

    const filteredPdi = cleanData(pdiData);
    if (filteredPdi.length > 0) {
      const pdiSeries = chart.addSeries(LineSeries, {
        color: '#3fb950', lineWidth: 1 as any,
        priceLineVisible: false, lastValueVisible: false,
        crosshairMarkerVisible: false, priceScaleId: 'adx-scale',
      });
      pdiSeries.setData(filteredPdi as any);
      refs.oscillatorSeries.set('adx-pdi', pdiSeries);
    }

    const filteredMdi = cleanData(mdiData);
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
    addOscillatorLine(chart, refs, LineSeries, 'cci', data, indicator.color, 'cci-scale');
  }
}
