// ═══════════════════════════════════════════════════════════════════════
// ROUA AI Explanation Engine — Revolutionary Feature #3
//
// When a trader clicks "Why?" on any signal, this engine generates
// a detailed Arabic explanation of WHY that signal was triggered,
// WHAT data supports it, and HOW confident we should be.
//
// This transforms the "black box" feeling into transparent, educational
// analysis that helps traders learn and make better decisions.
// ═══════════════════════════════════════════════════════════════════════

// ── Types ───────────────────────────────────────────────────────────

export interface SignalExplanation {
  /** The signal being explained */
  signal: {
    source: string;
    direction: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
    price: number;
  };
  /** Main explanation in Arabic */
  explanationAr: string;
  /** Key factors that led to this signal */
  factors: ExplanationFactor[];
  /** What would invalidate this signal */
  invalidationAr: string;
  /** What confirms this signal */
  confirmationAr: string;
  /** Related signals that support/contradict */
  relatedSignals: Array<{
    source: string;
    direction: 'bullish' | 'bearish' | 'neutral';
    agrees: boolean;
    labelAr: string;
  }>;
  /** Historical accuracy of this signal type */
  historicalWinRate: number | null;
  /** Market regime when signal was generated */
  regime: string;
  /** Risk level of trading this signal */
  riskLevel: 'low' | 'medium' | 'high';
}

export interface ExplanationFactor {
  /** Factor name */
  name: string;
  /** Factor name in Arabic */
  nameAr: string;
  /** How this factor contributed */
  contributionAr: string;
  /** Weight of this factor (0-1) */
  weight: number;
  /** Is this factor supporting or contradicting? */
  supports: boolean;
}

// ── Explanation Templates ───────────────────────────────────────────

const EXPLANATIONS: Record<string, {
  bullish: { explanation: string; factors: Array<{ nameAr: string; contributionAr: string }>; invalidation: string; confirmation: string };
  bearish: { explanation: string; factors: Array<{ nameAr: string; contributionAr: string }>; invalidation: string; confirmation: string };
}> = {
  'smc:bos': {
    bullish: {
      explanation: 'تم كشف كسر هيكل صاعد (BOS) — وهو إشارة أن المشترين سيطروا على السعر وكسروا مستوى مقاومة سابق. هذا يدل على تحول في القوة لصالح الاتجاه الصاعد.',
      factors: [
        { nameAr: 'كسر مستوى مقاومة', contributionAr: 'السعر أغلق فوق مستوى القمة السابقة بتأكيد حجم تداول' },
        { nameAr: 'استمرار الزخم', contributionAr: 'الشمعات بعد الكسر أغلقت أعلى من مستوى الكسر' },
      ],
      invalidation: 'يُلغى هذا الكسر إذا عاد السعر وأغلق تحت مستوى الكسر (إعادة اختبار فاشلة)',
      confirmation: 'يتأكد الكسر إذا ارتد السعر من مستوى الكسر كدعم (retest) مع حجم تداول جيد',
    },
    bearish: {
      explanation: 'تم كشف كسر هيكل هابط (BOS) — البائعون سيطروا وكسروا مستوى دعم سابق. هذا يدل على ضعف في الاتجاه الصاعد واحتمال استمرار الهبوط.',
      factors: [
        { nameAr: 'كسر مستوى دعم', contributionAr: 'السعر أغلق تحت مستوى القاع السابق' },
        { nameAr: 'ضعف المشترين', contributionAr: 'حجم التداول يدعم الهبوط' },
      ],
      invalidation: 'يُلغى هذا الكسر إذا عاد السعر وأغلق فوق مستوى الكسر',
      confirmation: 'يتأكد الكسر إذا ارتد السعر من مستوى الكسر كمقاومة مع رفض واضح',
    },
  },
  'smc:choch': {
    bullish: {
      explanation: 'تم كشف تغير شخصية صاعد (CHoCH) — هذا تحول مبكر في اتجاه السوق من هبوط إلى صعود. CHoCH أسبق من BOS ويعطي إشارة أسرع لكن أقل تأكيداً.',
      factors: [
        { nameAr: 'تحول القوة', contributionAr: 'السعر كسر قمة Swing High سابقة بعد سلسلة قيعان هابطة' },
        { nameAr: 'بداية اتجاه جديد', contributionAr: 'هذا أول إشارة على تحول محتمل من هبوط إلى صعود' },
      ],
      invalidation: 'يُلغى إذا شكّل السعر قاع جديد أقل من القاع السابق (استمرار الهبوط)',
      confirmation: 'يتأكد بتشكيل قاع أعلى من القاع السابق (Higher Low) ثم كسر آخر',
    },
    bearish: {
      explanation: 'تم كشف تغير شخصية هابط (CHoCH) — تحول مبكر من صعود إلى هبوط. هذه إشارة إنذار مبكر أن الاتجاه الصاعد يفقد قوته.',
      factors: [
        { nameAr: 'فقدان الزخم الصاعد', contributionAr: 'السعر كسر قاع Swing Low سابق بعد سلسلة قمم صاعدة' },
        { nameAr: 'بداية ضعف', contributionAr: 'المشترون لم يتمكنوا من الحفاظ على القمم المرتفعة' },
      ],
      invalidation: 'يُلغى إذا شكّل السعر قمة جديدة أعلى من القمة السابقة',
      confirmation: 'يتأكد بتشكيل قمة أخفض ثم كسر آخر لقاع أدنى',
    },
  },
  'smc:orderblock': {
    bullish: {
      explanation: 'تم كشف بلوك أوامر صاعد — وهو آخر شمعة هابطة قبل حركة صعود قوية. المؤسسات تبيع عند هذا المستوى ثم تشتري، مما يخلق منطقة طلب قوية.',
      factors: [
        { nameAr: 'منطقة طلب مؤسسي', contributionAr: 'آخر نقطة بيع قبل الحركة الصاعدة القوية' },
        { nameAr: 'عدم الكسر', contributionAr: 'السعر لم يكسر هذا المستوى بعد، مما يدل على استمرار الطلب' },
      ],
      invalidation: 'يُلغى إذا أغلق السعر تحت البلوك — هذا يعني أن البائعين سيطروا',
      confirmation: 'يتأكد بارتداد السعر من البلوك مع شمعة صاعدة قوية وحجم تداول مرتفع',
    },
    bearish: {
      explanation: 'تم كشف بلوك أوامر هابط — وهو آخر شمعة صاعدة قبل حركة هبوط قوية. المؤسسات تشتري عند هذا المستوى ثم تبيع، مما يخلق منطقة عرض قوية.',
      factors: [
        { nameAr: 'منطقة عرض مؤسسي', contributionAr: 'آخر نقطة شراء قبل الحركة الهابطة القوية' },
        { nameAr: 'مقاومة قوية', contributionAr: 'السعر يرتد من هذا المستوى عادة' },
      ],
      invalidation: 'يُلغى إذا أغلق السعر فوق البلوك — المشترين سيطروا',
      confirmation: 'يتأكد برفض السعر من البلوك مع شمعة هابطة وحجم مرتفع',
    },
  },
  'harmonic': {
    bullish: {
      explanation: 'تم كشف نمط هارمونيك صاعد — أنماط هارمونيك تستخدم نسب فيبوناتشي محددة للتنبؤ بنقاط الانعكاس. اكتمال النمط عند النقطة D يعني أن السعر وصل لمنطقة انعكاس محتملة.',
      factors: [
        { nameAr: 'نسبة فيبوناتشي دقيقة', contributionAr: 'النمط أكمل عند نسب فيبوناتشي محددة تاريخياً' },
        { nameAr: 'منطقة PRZ', contributionAr: 'السعر في منطقة إكمال النمط (Potential Reversal Zone)' },
      ],
      invalidation: 'يُلغى إذا تجاوز السعر مستوى إبطال النمط (خارج PRZ)',
      confirmation: 'يتأكد بظهور شمعة انعكاس قوية عند النقطة D مع حجم مرتفع',
    },
    bearish: {
      explanation: 'تم كشف نمط هارمونيك هابط — النمط اكتمل عند النقطة D في منطقة PRZ، مما يعني احتمال انعكاس هبوطي.',
      factors: [
        { nameAr: 'اكتمال النمط', contributionAr: 'جميع النقاط (X, A, B, C, D) اكتملت بنسب صحيحة' },
        { nameAr: 'تاريخية النمط', contributionAr: 'هذا النمط له نسبة نجاح تاريخية جيدة' },
      ],
      invalidation: 'يُلغى إذا تجاوز السعر مستوى النقطة X (إبطال كامل)',
      confirmation: 'يتأكد بشمعة هابطة قوية بعد النقطة D مع ارتفاع حجم التداول',
    },
  },
  'wyckoff': {
    bullish: {
      explanation: 'إشارة ويكوف صاعدة — مر السوق بمرحلة تجميع حيث المؤسسات يشترون بهدوء. الربيع (Spring) أو الإشارة تشير لبداية مرحلة التوزيع الصاعدة.',
      factors: [
        { nameAr: 'مرحلة التجميع', contributionAr: 'المؤسسات يشترون من المستثمرين الضعفاء' },
        { nameAr: 'الربيع/الإشارة', contributionAr: 'حدث إنذار يؤكد نهاية التجميع وبداية الصعود' },
      ],
      invalidation: 'يُلغى إذا كسر السعر قاع التجميع بحجم مرتفع',
      confirmation: 'يتأكد بكسر مقاومة التجميع (Sign of Strength) مع حجم مرتفع',
    },
    bearish: {
      explanation: 'إشارة ويكوف هابطة — مر السوق بمرحلة توزيع حيث المؤسسات يبيعون بهدوء. UTAD (Upthrust After Distribution) يشير لبداية مرحلة الهبوط.',
      factors: [
        { nameAr: 'مرحلة التوزيع', contributionAr: 'المؤسسات يوزعون أسهمهم على المشترين المتحمسين' },
        { nameAr: 'UTAD/الإشارة', contributionAr: 'حدث إنذار يؤكد نهاية التوزيع وبداية الهبوط' },
      ],
      invalidation: 'يُلغى إذا كسر السعر قمة التوزيع بحجم مرتفع',
      confirmation: 'يتأكد بكسر دعم التوزيع مع حجم مرتفع (Sign of Weakness)',
    },
  },
  'elliott': {
    bullish: {
      explanation: 'إشارة موجية إليوت صاعدة — السعر في موجة دافعة صاعدة (1, 3, أو 5). هذه الموجات تمتد في اتجاه الاتجاه الرئيسي وعادة ما تكون أقوى الحركات.',
      factors: [
        { nameAr: 'موجة دافعة', contributionAr: 'السعر في مرحلة دفع ضمن الاتجاه الصاعد الرئيسي' },
        { nameAr: 'مستوى فيبوناتشي', contributionAr: 'الموجة تتوافق مع نسب فيبوناتشي للموجات السابقة' },
      ],
      invalidation: 'يُلغى إذا تجاوز التصحيح 100% من الموجة السابقة (قاعدة إليوت)',
      confirmation: 'يتأكد إذا اكتملت الموجة عند هدف فيبوناتشي ثم بدأ تصحيح بنسب صحيحة',
    },
    bearish: {
      explanation: 'إشارة موجية إليوت هابطة — السعر في موجة دافعة هابطة أو تصحيحية. الحركة الهابطة قد تكون بداية اتجاه جديد أو تصحيح ضمن اتجاه صاعد أكبر.',
      factors: [
        { nameAr: 'موجة دافعة/تصحيحية', contributionAr: 'السعر في مرحلة هبوط ضمن العد الموجي' },
        { nameAr: 'أهداف السعر', contributionAr: 'الهدف محسوب من نسب فيبوناتشي للموجات السابقة' },
      ],
      invalidation: 'يُلغى إذا كسر السعر بداية الموجة الحالية',
      confirmation: 'يتأكد إذا وصل السعر للهدف الموجي وظهرت إشارات انعكاس',
    },
  },
};

// ── Main Export ─────────────────────────────────────────────────────

/**
 * Generate a detailed explanation for a signal.
 * Uses template-based explanations with real data injected.
 */
export function explainSignal(opts: {
  source: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  price: number;
  currentPrice?: number;
  allSignals?: Array<{
    source: string;
    direction: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
  }>;
  regime?: string;
  historicalWinRate?: number;
}): SignalExplanation {
  const { source, direction, confidence, price, currentPrice, allSignals, regime, historicalWinRate } = opts;

  // Find the explanation template for this source
  const dir = direction === 'neutral' ? 'bullish' : direction;
  const template = EXPLANATIONS[source] || EXPLANATIONS[mapSourceToTemplate(source)];
  const explanation = template?.[dir] || generateGenericExplanation(source, direction, confidence);

  // Build factors
  const factors: ExplanationFactor[] = (explanation.factors || []).map((f, i) => ({
    name: `factor_${i}`,
    nameAr: f.nameAr,
    contributionAr: f.contributionAr,
    weight: Math.max(0.3, 1 - i * 0.2),
    supports: true,
  }));

  // Add contradicting factors if confidence is low
  if (confidence < 0.6) {
    factors.push({
      name: 'low_confidence',
      nameAr: 'ثقة منخفضة',
      contributionAr: 'ثقة الإشارة أقل من 60% — يجب الحذر وانتظار تأكيد إضافي',
      weight: 0.4,
      supports: false,
    });
  }

  // Find related signals
  const relatedSignals = (allSignals || [])
    .filter(s => s.source !== source)
    .slice(0, 5)
    .map(s => ({
      source: s.source,
      direction: s.direction,
      agrees: s.direction === direction || s.direction === 'neutral',
      labelAr: mapSourceToLabelAr(s.source),
    }));

  // Determine risk level
  let riskLevel: SignalExplanation['riskLevel'] = 'medium';
  if (confidence >= 0.8 && relatedSignals.filter(r => r.agrees).length >= 2) riskLevel = 'low';
  if (confidence < 0.5 || relatedSignals.filter(r => !r.agrees).length > relatedSignals.filter(r => r.agrees).length) riskLevel = 'high';

  return {
    signal: { source, direction, confidence, price },
    explanationAr: (typeof explanation === 'string' ? explanation : (explanation as any).explanation) || String(explanation),
    factors,
    invalidationAr: (typeof explanation === 'object' && explanation != null ? (explanation as any).invalidation : null) || 'أغلق السعر خارج منطقة الإشارة',
    confirmationAr: (typeof explanation === 'object' && explanation != null ? (explanation as any).confirmation : null) || 'ارتداد السعر من المنطقة مع حجم مرتفع',
    relatedSignals,
    historicalWinRate: historicalWinRate ?? null,
    regime: regime || 'غير محدد',
    riskLevel,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

function mapSourceToTemplate(source: string): string {
  if (source.startsWith('smc:')) {
    if (source.includes('bos') || source.includes('BOS')) return 'smc:bos';
    if (source.includes('choch') || source.includes('CHoCH')) return 'smc:choch';
    if (source.includes('orderblock') || source.includes('ob')) return 'smc:orderblock';
    return 'smc:bos';
  }
  if (source.startsWith('harmonic') || source.includes('gartley') || source.includes('bat') || source.includes('butterfly')) return 'harmonic';
  if (source.startsWith('wyckoff')) return 'wyckoff';
  if (source.startsWith('elliott')) return 'elliott';
  return 'smc:bos'; // default template
}

function mapSourceToLabelAr(source: string): string {
  const map: Record<string, string> = {
    'smc:bos': 'كسر هيكل',
    'smc:choch': 'تغير شخصية',
    'smc:orderblock': 'بلوك أوامر',
    'smc:fvg': 'فجوة قيمة',
    'harmonic': 'هارمونيك',
    'wyckoff': 'ويكوف',
    'elliott': 'إليوت',
    'sr': 'دعم/مقاومة',
    'volume': 'حجم التداول',
    'fibonacci': 'فيبوناتشي',
    'trendline': 'خط ترند',
    'pattern': 'نمط شموع',
  };
  for (const [key, val] of Object.entries(map)) {
    if (source.includes(key)) return val;
  }
  return source;
}

function generateGenericExplanation(source: string, direction: 'bullish' | 'bearish' | 'neutral', confidence: number): any {
  const dirAr = direction === 'bullish' ? 'صاعد' : direction === 'bearish' ? 'هابط' : 'محايد';
  return {
    explanation: `تم كشف إشارة ${dirAr} من محرك ${source} بثقة ${Math.round(confidence * 100)}%. هذه الإشارة تعتمد على تحليل خوارزمي للبيانات المتاحة.`,
    factors: [
      { nameAr: 'تحليل خوارزمي', contributionAr: 'الإشارة ناتجة عن تحليل آلي للبيانات' },
    ],
    invalidation: 'أغلق السعر خارج منطقة الإشارة',
    confirmation: 'تأكيد بإشارات إضافية من محركات أخرى',
  };
}
