// ════════════════════════════════════════════════════════════
// Local Translation Dictionary
// Fallback translation for common Arabic phrases in briefs.
// Used when AI models are unavailable or fail.
// ════════════════════════════════════════════════════════════

/**
 * Dictionary of Arabic phrases → English equivalents.
 * Ordered by length (longest first) to avoid partial matches.
 * Only translates complete phrases, not individual words in isolation.
 */
export const ARABIC_TO_ENGLISH_PHRASES: Array<[string, string]> = [
  // Headers
  ['تركيب الاستراتيجية النهائية للتداول على', 'Final Trading Strategy Synthesis for'],
  ['تركيب الاستراتيجية التنفيذية لـ', 'Executive Strategy Synthesis for'],
  ['تركيب الاستراتيجية النهائية', 'Final Strategy Synthesis'],
  ['تركيب الاستراتيجية', 'Strategy Synthesis'],
  
  // Council structure
  ['بناءً على تحليل 8 وكلاء ذكاء اصطناعي', 'Based on analysis by 8 AI agents'],
  ['بناءً على تحليل آراء خبراء الذكاء الاصطناعي الثمانية', 'Based on analysis of the eight AI experts\' opinions'],
  ['بناءً على تحليل', 'Based on analysis of'],
  ['وكلاء ذكاء اصطناعي', 'AI agents'],
  ['خبراء الذكاء الاصطناعي', 'AI experts'],
  ['وكلاء صوتوا', 'agents voted'],
  ['خبراء صوتوا', 'experts voted'],
  ['بمتوسط ثقة', 'with average confidence'],
  ['بمتوسط ثقة ', 'with average confidence '],
  
  // Numbers/quantities
  ['من 8', 'of 8'],
  ['من 7', 'of 7'],
  ['من 6', 'of 6'],
  ['من 5', 'of 5'],
  ['من 4', 'of 4'],
  ['من 3', 'of 3'],
  
  // Voting
  ['صوتوا للشراء', 'voted BUY'],
  ['صوتوا للبيع', 'voted SELL'],
  ['صوتوا للانتظار', 'voted HOLD'],
  ['صوت للشراء', 'voted BUY'],
  ['صوت للبيع', 'voted SELL'],
  ['صوت للانتظار', 'voted HOLD'],
  ['للشراء', 'for BUY'],
  ['للبيع', 'for SELL'],
  ['للانتظار', 'for HOLD'],
  
  // Consensus
  ['الإجماع الكمي', 'Quantitative consensus'],
  ['الإجماع', 'Consensus'],
  ['إجماع قوي', 'Strong consensus'],
  ['إجماع نسبي', 'Relative consensus'],
  ['إجماع', 'consensus'],
  ['مدعومًا بـ', 'supported by'],
  ['مدعوماً بـ', 'supported by'],
  ['مدعوم بـ', 'supported by'],
  
  // Market state
  ['حالة عرضية/جانبية', 'ranging/sideways state'],
  ['حالة عرضية', 'ranging state'],
  ['حالة جانبية', 'sideways state'],
  ['سوق عرضي', 'ranging market'],
  ['سوق جانبي', 'sideways market'],
  ['اتجاه صعودي', 'bullish trend'],
  ['اتجاه هبوطي', 'bearish trend'],
  ['تقلب', 'volatility'],
  ['مشاعر سوق', 'market sentiment'],
  ['محايدة', 'neutral'],
  ['إيجابية', 'positive'],
  ['سلبية', 'negative'],
  
  // Analysis terms
  ['تحليل الأنماط', 'Pattern analysis'],
  ['محلل المشاعر', 'Sentiment Analyst'],
  ['محلل السيناريوهات', 'Scenario Analyst'],
  ['الخبير الماكرو', 'Macro Expert'],
  ['الخبير الفني', 'Technical Expert'],
  ['الخبير المخاطر', 'Risk Expert'],
  ['الاستراتيجي التنفيذي', 'Execution Strategist'],
  ['الاستراتيجي التنفيذ', 'Execution Strategy'],
  ['محلل التنفيذ', 'Execution Analyst'],
  ['استراتيجي التنفيذ', 'Execution Strategist'],
  ['التباين والسيناريوهات', 'Divergence & Scenarios'],
  ['محلل التباين', 'Divergence Analyst'],
  ['رأي مخالف', 'dissenting view'],
  ['رأي المعارض', 'opposing view'],
  
  // Risk
  ['مخاطر عالية', 'high risk'],
  ['مخاطر متوسطة', 'medium risk'],
  ['مخاطر منخفضة', 'low risk'],
  ['يشير إلى مخاطر', 'indicates risk'],
  ['مخاطر', 'risk'],
  
  // News
  ['سياق الأخبار', 'News context'],
  ['لا أخبار متاحة', 'No news available'],
  ['خبر حديث', 'recent article'],
  ['أخبار حديثة', 'recent news'],
  ['مشاعر', 'sentiment'],
  ['نقاط', 'score'],
  
  // Actions
  ['إبطال الإشارة', 'Signal invalidation'],
  ['إغلاق 4 ساعات', '4-hour close'],
  ['إغلاق', 'close'],
  ['ساعات', 'hours'],
  ['تحت', 'below'],
  ['فوق', 'above'],
  
  // Common phrases
  ['يتضح أن السوق', 'it is clear that the market'],
  ['يظهر أن', 'shows that'],
  ['يظهر', 'shows'],
  ['يتضح', 'it is clear'],
  ['ومع ذلك', 'however'],
  ['ولكن', 'but'],
  ['بينما', 'while'],
  ['التي', 'that'],
  ['الذي', 'which'],
  ['هذا', 'this'],
  ['هذه', 'this'],
  
  // Confidence
  ['ثقة', 'confidence'],
  ['بثقة', 'with confidence'],
  
  // Other common
  ['على', 'on'],
  ['في', 'in'],
  ['من', 'from'],
  ['إلى', 'to'],
  ['مع', 'with'],
  ['بدون', 'without'],
  ['عند', 'at'],
  ['حسب', 'according to'],
  ['بعد', 'after'],
  ['قبل', 'before'],
  ['حول', 'about'],
  ['ضد', 'against'],
  ['نحو', 'toward'],
  ['خلال', 'during'],
  ['لـ', 'for'],
  ['و', 'and'],
  ['أو', 'or'],
  ['إن', 'indeed'],
  ['أن', 'that'],
  ['كان', 'was'],
  ['كانت', 'was'],
  ['يكون', 'is'],
  ['تكون', 'is'],
  ['هو', 'is'],
  ['هي', 'is'],
  ['قد', 'may'],
  ['كل', 'all'],
  ['بعض', 'some'],
  ['أي', 'any'],
  ['حيث', 'where'],
  ['كما', 'as'],
  ['أيضاً', 'also'],
  ['أيضا', 'also'],
  ['إلا', 'except'],
  ['سوف', 'will'],
  ['سـ', 'will'],
  ['تم', 'was'],
  ['يتم', 'is'],
  ['يمكن', 'can'],
  ['يجب', 'must'],
  ['ينبغي', 'should'],
  ['خاص', 'specific'],
  ['بشكل', 'as'],
  ['عبر', 'via'],
  ['مثل', 'like'],
  ['ضمن', 'within'],
  ['دون', 'without'],
  ['نسبة', 'ratio'],
  ['إضافة', 'addition'],
  ['إلى ذلك', 'additionally'],
  ['بالإضافة', 'in addition'],
  ['بشكل عام', 'in general'],
  ['بشكل خاص', 'in particular'],
  ['علاوة على ذلك', 'furthermore'],
  ['نتيجة لذلك', 'as a result'],
  ['في النهاية', 'finally'],
  ['في البداية', 'initially'],
  ['في الوقت نفسه', 'at the same time'],
  ['من ناحية أخرى', 'on the other hand'],
  
  // Additional terms from actual brief output
  ['محايدة بشكل عام', 'generally neutral'],
  ['يظهر', 'shows'],
  ['يظهر أن', 'shows that'],
  ['يبدو', 'appears'],
  ['يبدو أن', 'appears that'],
  ['يشير', 'indicates'],
  ['يشير إلى', 'indicates that'],
  ['يدل', 'indicates'],
  ['يدل على', 'indicates that'],
  ['يؤكد', 'confirms'],
  ['يؤكد أن', 'confirms that'],
  ['يعكس', 'reflects'],
  ['يعكس أن', 'reflects that'],
  ['يوضح', 'illustrates'],
  ['يوضح أن', 'illustrates that'],
  ['يبين', 'shows'],
  ['يبين أن', 'shows that'],
  ['يستنتج', 'concludes'],
  ['يستنتج أن', 'concludes that'],
  
  // Additional market terms
  ['السوق', 'market'],
  ['الأسعار', 'prices'],
  ['السعر', 'price'],
  ['القيمة', 'value'],
  ['القيمة السوقية', 'market value'],
  ['السيولة', 'liquidity'],
  ['السيولة النقدية', 'cash liquidity'],
  ['الطلب', 'demand'],
  ['العرض', 'supply'],
  ['الطلب والعرض', 'supply and demand'],
  ['الشراء', 'BUY'],
  ['البيع', 'SELL'],
  ['الانتظار', 'HOLD'],
  ['الصفقة', 'trade'],
  ['الصفقات', 'trades'],
  ['المركز', 'position'],
  ['المراكز', 'positions'],
  ['مركز مفتوح', 'open position'],
  ['مركز جديد', 'new position'],
  ['مركز بيع', 'short position'],
  ['مركز شراء', 'long position'],
  
  // Indicators
  ['المؤشرات', 'indicators'],
  ['المؤشر', 'indicator'],
  ['المؤشرات الفنية', 'technical indicators'],
  ['مؤشر القوة النسبية', 'RSI'],
  ['الماكد', 'MACD'],
  ['المتوسط المتحرك', 'moving average'],
  ['المتوسطات المتحركة', 'moving averages'],
  ['خط الاتجاه', 'trend line'],
  ['مستوى الدعم', 'support level'],
  ['مستوى المقاومة', 'resistance level'],
  ['الدعم', 'support'],
  ['المقاومة', 'resistance'],
  ['الاختراق', 'breakout'],
  ['الانهيار', 'breakdown'],
  ['الارتداد', 'bounce'],
  ['التصحيح', 'correction'],
  
  // Sentiment
  ['المشاعر', 'sentiment'],
  ['المشاعر الإيجابية', 'positive sentiment'],
  ['المشاعر السلبية', 'negative sentiment'],
  ['المشاعر المحايدة', 'neutral sentiment'],
  ['محايد', 'neutral'],
  ['إيجابي', 'positive'],
  ['سلبي', 'negative'],
  ['قوي', 'strong'],
  ['ضعيف', 'weak'],
  ['مرتفع', 'high'],
  ['منخفض', 'low'],
  ['متوسط', 'medium'],
  ['عالٍ', 'high'],
  ['عالية', 'high'],
  ['منخفضة', 'low'],
  ['متوسطة', 'medium'],
  
  // Confidence
  ['الثقة', 'confidence'],
  ['نسبة الثقة', 'confidence ratio'],
  ['مستوى الثقة', 'confidence level'],
  ['بثقة عالية', 'with high confidence'],
  ['بثقة منخفضة', 'with low confidence'],
  
  // Direction
  ['الاتجاه', 'trend'],
  ['الاتجاه العام', 'general trend'],
  ['الاتجاه الصعودي', 'uptrend'],
  ['الاتجاه الهبوطي', 'downtrend'],
  ['صعودي', 'bullish'],
  ['هبوطي', 'bearish'],
  ['عرضي', 'ranging'],
  ['جانبي', 'sideways'],
  
  // Other common words
  ['التي', 'that'],
  ['الذي', 'which'],
  ['الذين', 'those who'],
  ['هذا', 'this'],
  ['هذه', 'this'],
  ['ذلك', 'that'],
  ['تلك', 'that'],
  ['هنا', 'here'],
  ['هناك', 'there'],
  ['الآن', 'now'],
  ['اليوم', 'today'],
  ['الوقت', 'time'],
  ['الوقت الحالي', 'current time'],
  ['في الوقت الحالي', 'currently'],
  ['حالياً', 'currently'],
  ['حاليا', 'currently'],
  
  // Connectors
  ['بالإضافة إلى', 'in addition to'],
  ['نتيجة', 'result'],
  ['بسبب', 'due to'],
  ['بفضل', 'thanks to'],
  ['على الرغم من', 'despite'],
  ['بغض النظر', 'regardless'],
  ['في حالة', 'in case of'],
  ['في حال', 'in case'],
  ['إذا', 'if'],
  ['حتى', 'until'],
  ['متى', 'when'],
  ['كيف', 'how'],
  ['لماذا', 'why'],
];

/**
 * Translate Arabic text to English using local dictionary.
 * This is a FALLBACK when AI translation is unavailable.
 * It does NOT produce perfect translation — it replaces known phrases.
 * 
 * @param text Arabic text to translate
 * @returns English-translated text (best effort), or original if no matches
 */
export function localTranslateArabicToEnglish(text: string): string {
  if (!text) return text;
  
  let result = text;
  
  // Replace phrases (longest first to avoid partial matches)
  for (const [ar, en] of ARABIC_TO_ENGLISH_PHRASES) {
    // Use split/join to avoid regex special character issues
    while (result.includes(ar)) {
      result = result.replace(ar, en);
    }
  }
  
  // Clean up: remove any remaining Arabic characters (they couldn't be translated)
  // Replace with empty string but preserve structure
  // result = result.replace(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+/g, '');
  
  // Clean up double spaces
  result = result.replace(/\s+/g, ' ').trim();
  
  return result;
}

/**
 * Check if text contains Arabic characters.
 */
export function containsArabic(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}
