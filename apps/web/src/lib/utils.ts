import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * safeStr — Convert any value to a React-safe string.
 * Prevents React Error #31 ("Objects are not valid as a React child")
 * when AI models return structured JSON objects instead of plain text.
 *
 * Example: AI returns {symbol, name, direction, impactDegree, reason, isTradable}
 * instead of a plain string — this function converts it to a readable string.
 */
export function safeStr(val: unknown): string {
  if (val == null) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  if (typeof val === 'object') {
    try {
      // If it's an object with a .reason field, prefer that (common AI pattern)
      const obj = val as Record<string, unknown>
      if (typeof obj.reason === 'string') return obj.reason
      // If it has a .summary or .narrative field, prefer that
      if (typeof obj.summary === 'string') return obj.summary
      if (typeof obj.narrative === 'string') return obj.narrative
      // Otherwise stringify the whole object
      return JSON.stringify(val)
    } catch {
      return String(val)
    }
  }
  return String(val)
}

/**
 * safeNum — Extract a number from any value (including objects with .compositeScore etc.)
 * Prevents NaN when AI returns objects instead of numbers.
 */
export function safeNum(val: unknown, fallback: number = 0): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val
  if (val == null) return fallback
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>
    // Check common AI score fields
    const scoreKey = ['compositeScore', 'confidence', 'score', 'value', 'strength'] as const
    for (const key of scoreKey) {
      if (typeof obj[key] === 'number' && Number.isFinite(obj[key] as number)) return obj[key] as number
    }
  }
  const n = Number(val)
  return Number.isFinite(n) ? n : fallback
}

/**
 * sanitizeScannerItems — Recursively sanitize scanner data to prevent React Error #31.
 * Ensures all fields that should be strings ARE strings, not objects.
 */
export function sanitizeScannerItems(items: any[]): any[] {
  if (!Array.isArray(items)) return []
  return items.map(item => {
    if (!item || typeof item !== 'object') return item
    const sanitized: Record<string, unknown> = { ...item }
    // Known string fields that AI might return as objects
    const stringFields = ['name', 'direction', 'signalClass', 'entryBias', 'source',
      'freshness', 'aiOpinion', 'bollingerPosition', 'macdSignal', 'atrVolatility', 'category']
    for (const field of stringFields) {
      if (field in sanitized && typeof sanitized[field] !== 'string' && sanitized[field] != null) {
        sanitized[field] = safeStr(sanitized[field])
      }
    }
    // Known number fields
    const numFields = ['price', 'change', 'changePercent', 'volume', 'high', 'low',
      'rsi', 'adx', 'atr', 'stochK', 'stochD', 'technicalScore', 'confidence',
      'macdHistogram', 'strength']
    for (const field of numFields) {
      if (field in sanitized && typeof sanitized[field] !== 'number' && sanitized[field] != null) {
        sanitized[field] = safeNum(sanitized[field], 0)
      }
    }
    // reasons array — ensure all items are strings
    if (Array.isArray(sanitized.reasons)) {
      sanitized.reasons = sanitized.reasons.map((r: unknown) => safeStr(r))
    }
    if (Array.isArray(sanitized.reasonsAr)) {
      sanitized.reasonsAr = sanitized.reasonsAr.map((r: unknown) => safeStr(r))
    }
    // smartScore — ensure it's an object with number fields, not an object in a string field
    if (sanitized.smartScore && typeof sanitized.smartScore === 'object') {
      const ss = sanitized.smartScore as Record<string, unknown>
      for (const key of Object.keys(ss)) {
        if (typeof ss[key] !== 'number') {
          ss[key] = safeNum(ss[key], 0)
        }
      }
    }
    // sparkline — ensure all items are numbers
    if (Array.isArray(sanitized.sparkline)) {
      sanitized.sparkline = sanitized.sparkline.map((v: unknown) => safeNum(v, 0))
    }
    return sanitized
  })
}

/**
 * sanitizeCouncilResult — Sanitize AI council result to prevent React Error #31.
 * AI models sometimes return structured objects instead of plain text for vote fields.
 */
export function sanitizeCouncilResult(data: any): any {
  if (!data || typeof data !== 'object') return data
  const result = { ...data }
  // Sanitize analyses array (individual votes)
  if (Array.isArray(result.analyses)) {
    result.analyses = result.analyses.map((vote: any) => {
      if (!vote || typeof vote !== 'object') return vote
      return {
        ...vote,
        role: safeStr(vote.role),
        model: safeStr(vote.model),
        vote: safeStr(vote.vote),
        reason: safeStr(vote.reason),
        confidence: safeNum(vote.confidence, 0),
      }
    })
  }
  // Sanitize masterStrategy
  result.masterStrategy = safeStr(result.masterStrategy)
  // Sanitize consensusScore
  result.consensusScore = safeNum(result.consensusScore, 0)
  // recommendation should be a string
  result.recommendation = safeStr(result.recommendation)
  return result
}

/**
 * sanitizeDeepAnalysis — Sanitize deep analysis data to prevent React Error #31.
 */
export function sanitizeDeepAnalysis(data: any): any {
  if (!data || typeof data !== 'object') return data
  const d = { ...data }
  // String fields that AI might return as objects
  d.name = safeStr(d.name)
  d.category = safeStr(d.category)
  d.direction = safeStr(d.direction)
  d.signalClass = safeStr(d.signalClass)
  // aiAnalysis — the whole thing or analysisAr might be an object
  if (d.aiAnalysis && typeof d.aiAnalysis === 'object') {
    d.aiAnalysis = {
      ...d.aiAnalysis,
      analysisAr: safeStr(d.aiAnalysis.analysisAr),
      model: safeStr(d.aiAnalysis.model),
      sentiment: safeStr(d.aiAnalysis.sentiment),
      riskLevel: safeStr(d.aiAnalysis.riskLevel),
    }
  }
  // signal reasons — ensure all are strings
  if (d.signal && typeof d.signal === 'object') {
    d.signal = {
      ...d.signal,
      direction: safeStr(d.signal.direction),
      timeframe: safeStr(d.signal.timeframe),
      reasons: Array.isArray(d.signal.reasons) ? d.signal.reasons.map((r: unknown) => safeStr(r)) : [],
      reasonsAr: Array.isArray(d.signal.reasonsAr) ? d.signal.reasonsAr.map((r: unknown) => safeStr(r)) : [],
    }
  }
  // patterns — ensure description fields are strings
  if (Array.isArray(d.patterns)) {
    d.patterns = d.patterns.map((p: any) => ({
      ...p,
      name: safeStr(p.name),
      nameAr: safeStr(p.nameAr),
      type: safeStr(p.type),
      description: safeStr(p.description),
      descriptionAr: safeStr(p.descriptionAr),
    }))
  }
  if (Array.isArray(d.candlePatterns)) {
    d.candlePatterns = d.candlePatterns.map((p: any) => ({
      ...p,
      name: safeStr(p.name),
      nameAr: safeStr(p.nameAr),
      type: safeStr(p.type),
      description: safeStr(p.description),
      descriptionAr: safeStr(p.descriptionAr),
    }))
  }
  // fibonacci — ensure labels are strings
  if (Array.isArray(d.fibonacci)) {
    d.fibonacci = d.fibonacci.map((f: any) => ({
      ...f,
      label: safeStr(f.label),
      labelAr: safeStr(f.labelAr),
    }))
  }
  return d
}
