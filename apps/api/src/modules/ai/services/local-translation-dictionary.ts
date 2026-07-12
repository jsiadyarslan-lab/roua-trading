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
  
  // Additional words from real brief output
  ['يتضح أن', 'it is clear that'],
  ['يتضح', 'it is clear'],
  ['يظهر', 'shows'],
  ['يميل نحو', 'leans toward'],
  ['يميل', 'leans'],
  ['نحو', 'toward'],
  ['مدعومًا بـ', 'supported by'],
  ['مدعوماً بـ', 'supported by'],
  ['مدعوم بـ', 'supported by'],
  ['بـ', 'by'],
  ['تقلب', 'volatility'],
  ['ومشاعر', 'and sentiment'],
  ['سوق', 'market'],
  ['وكلاء', 'agents'],
  ['أن', 'that'],
  ['أيضاً', 'also'],
  
  // Punctuation
  ['،', ','],
  
  // Additional words from real brief output (round 2)
  ['التركيز على', 'focusing on'],
  ['التركيز', 'focus'],
  ['تقارير بوفا المتراجعة', 'retreating PMI reports'],
  ['تقارير', 'reports'],
  ['بوفا', 'PMI'],
  ['المتراجعة', 'retreating'],
  ['وتمديد', 'and extension of'],
  ['تمديد', 'extension'],
  ['العقوبات الاقتصادية', 'economic sanctions'],
  ['العقوبات', 'sanctions'],
  ['الاقتصادية', 'economic'],
  ['روسيا', 'Russia'],
  ['يواجه', 'faces'],
  ['تحديًا', 'challenge'],
  ['تحديا', 'challenge'],
  ['وكيل الأنماط', 'Pattern Agent'],
  ['وكيل', 'agent'],
  ['الأنماط', 'Patterns'],
  ['صوت لشراء', 'voted BUY'],
  ['صوت', 'voted'],
  ['لشراء', 'for BUY'],
  ['والذي', 'and which'],
  ['الذي', 'which'],
  ['يرى', 'sees'],
  ['إشارات معاكسة', 'opposite signals'],
  ['إشارات', 'signals'],
  ['معاكسة', 'opposite'],
  ['وتباينات', 'and divergences'],
  ['تباينات', 'divergences'],
  ['التحليل', 'analysis'],
  ['تشير', 'indicate'],
  ['الاتجاه السائد', 'prevailing trend'],
  ['الاتجاه', 'trend'],
  ['السائد', 'prevailing'],
  ['لا', 'not'],
  ['دقيقًا', 'accurate'],
  ['دقيقا', 'accurate'],
  ['وكيل السيناريوهات', 'Scenario Agent'],
  ['السيناريوهات', 'Scenarios'],
  ['سيناريوهات', 'scenarios'],
  ['يقترح', 'suggests'],
  ['متعددة', 'multiple'],
  ['احتمال', 'probability'],
  ['لسيناريو', 'for a scenario'],
  ['سيناريو', 'scenario'],
  ['صعودي', 'bullish'],
  ['مما', 'which'],
  ['indicates that', 'indicates that'],
  ['عدم يقين', 'uncertainty'],
  ['عدم', 'lack of'],
  ['يقين', 'certainty'],
  ['كبير', 'large'],
  ['تجاوز', 'exceeded'],
  ['لقرار', 'for decision'],
  ['عدم وجود', 'lack of'],
  ['وجود', 'presence'],
  ['اتجاه واضح', 'clear trend'],
  ['اتجاه', 'trend'],
  ['واضح', 'clear'],
  ['ووجود', 'and presence of'],
  ['هبوطية', 'bearish'],
  ['بينما', 'while'],
  ['محلل التباين', 'Divergence Analyst'],
  ['بيانات', 'data'],
  ['مقابل', 'against'],
  ['مؤشرات', 'indicators'],
  ['يدعم', 'supports'],
  ['بالنظر إلى', 'considering'],
  ['بالنظر', 'considering'],
  ['التناقضات', 'contradictions'],
  ['النطاق الضيق', 'narrow range'],
  ['النطاق', 'range'],
  ['الضيق', 'narrow'],
  ['فإن', 'then'],
  ['التوصية الأكثر تحفظًا', 'the most conservative recommendation'],
  ['التوصية', 'recommendation'],
  ['الأكثر', 'most'],
  ['تحفظًا', 'conservative'],
  ['تحفظا', 'conservative'],
  
  // Warning section + invalidation + additional (round 3)
  ['تنبيه', 'Warning'],
  ['شرط الإبطال', 'Invalidation condition'],
  ['شرط', 'condition'],
  ['الإبطال', 'invalidation'],
  ['ندرك', 'we realize'],
  ['يعتمد', 'relies'],
  ['تاريخية', 'historical'],
  ['وتقييمات', 'and assessments'],
  ['تقييمات', 'assessments'],
  ['الذكاء الاصطناعي', 'artificial intelligence'],
  ['الذكاء', 'intelligence'],
  ['الاصطناعي', 'artificial'],
  ['يضمن', 'guarantees'],
  ['نجاح', 'success'],
  ['التداول', 'trading'],
  ['ولا', 'and does not'],
  ['المفاجئة', 'sudden'],
  ['خاصة', 'especially'],
  ['الأحداث الجيوسياسية', 'geopolitical events'],
  ['الأحداث', 'events'],
  ['الجيوسياسية', 'geopolitical'],
  ['تؤدي', 'lead to'],
  ['خسائر', 'losses'],
  ['أعلى', 'above'],
  ['دولارًا أمريكيًا', 'US dollars'],
  ['دولارًا', 'dollars'],
  ['أمريكيًا', 'US'],
  ['عندما', 'when'],
  ['يتجاوز', 'exceeds'],
  ['زوج', 'pair'],
  ['المستوى', 'level'],
  ['تحول', 'shift'],
  ['واضح', 'clear'],
  
  // Round 4: words from GBP/USD and USD/JPY briefs
  ['التحوط', 'hedging'],
  ['بيع الجنيه الإسترليني', 'selling the British Pound'],
  ['الجنيه الإسترليني', 'British Pound'],
  ['الجنيه', 'Pound'],
  ['الإسترليني', 'Sterling'],
  ['الدولار الأمريكي', 'US Dollar'],
  ['الدولار', 'Dollar'],
  ['الأمريكي', 'American'],
  ['الأمام', 'forward'],
  ['الأخبار المحلية', 'local news'],
  ['الأخبار', 'news'],
  ['المحلية', 'local'],
  ['توقعات التدفقات الصافية', 'net flow expectations'],
  ['توقعات', 'expectations'],
  ['التدفقات الصافية', 'net flows'],
  ['التدفقات', 'flows'],
  ['الصافية', 'net'],
  ['القياسية', 'standard'],
  ['الربع الثاني', 'second quarter'],
  ['الربع', 'quarter'],
  ['الثاني', 'second'],
  ['وارتفاع الإنتاج الصناعي', 'and rising industrial production'],
  ['وارتفاع', 'and rising'],
  ['ارتفاع', 'rise'],
  ['الإنتاج الصناعي', 'industrial production'],
  ['الإنتاج', 'production'],
  ['الصناعي', 'industrial'],
  ['للسيارات', 'for cars'],
  ['وإعادة شراء السندات', 'and bond buybacks'],
  ['وإعادة', 'and redoing'],
  ['إعادة', 're-'],
  ['شراء', 'buying'],
  ['السندات', 'bonds'],
  ['المخاوف التكنولوجية المستمرة', 'ongoing tech concerns'],
  ['المخاوف', 'concerns'],
  ['التكنولوجية المستمرة', 'ongoing tech'],
  ['التكنولوجية', 'tech'],
  ['المستمرة', 'ongoing'],
  ['التكنولوجيا', 'technology'],
  ['تدفع', 'push'],
  ['يمثل', 'represents'],
  ['الإجماع الكمي', 'Quantitative consensus'],
  ['الإجماع', 'consensus'],
  ['الكمي', 'quantitative'],
  ['أهمية الحذر', 'importance of caution'],
  ['أهمية', 'importance'],
  ['الحذر', 'caution'],
  ['trading النشط', 'active trading'],
  ['النشط', 'active'],
  ['frsentiment Analyst', 'Sentiment Analyst'],
  ['فرصة للاستثمار', 'opportunity to invest'],
  ['فرصة للدخول', 'opportunity to enter'],
  ['فرصة', 'opportunity'],
  ['للاستثمار', 'to invest'],
  ['للدخول', 'to enter'],
  ['بناءً', 'based on'],
  ['حركة صغيرة', 'small movement'],
  ['حركة', 'movement'],
  ['صغيرة', 'small'],
  ['تتناقض توقعات', 'contradict expectations'],
  ['تتناقض', 'contradict'],
  ['signals متضاربة', 'conflicting signals'],
  ['متضاربة', 'conflicting'],
  ['يعزز حالة', 'reinforces the state'],
  ['يعزز', 'reinforces'],
  ['حالة', 'state'],
  ['حجم position', 'position size'],
  ['حجم', 'size'],
  ['صغيرًا للغاية', 'very small'],
  ['صغيرًا', 'small'],
  ['للغاية', 'very'],
  ['نظرًا لعدم', 'due to lack of'],
  ['نظرًا', 'given'],
  ['لعدم', 'due to'],
  ['لذلك،', 'therefore,'],
  ['لذلك', 'therefore'],
  ['نوصي ببيع', 'we recommend selling'],
  ['نوصي', 'we recommend'],
  ['ببيع', 'selling'],
  ['قوية مدعومة', 'strong supported'],
  ['قوية', 'strong'],
  ['مدعومة', 'supported'],
  ['نسبياً', 'relatively'],
  ['إشارة', 'signal'],
  ['خبراء آخرين', 'other experts'],
  ['خبراء', 'experts'],
  ['آخرين', 'others'],
  ['النهائية', 'final'],
  ['شراء', 'BUY'],
  ['بناءً on', 'based on'],
  ['والتأكيد', 'and confirming'],
  ['التأكيد', 'confirming'],
  ['الرأي', 'view'],
  ['يوافق', 'agrees'],
  ['الوضع', 'situation'],
  ['three probabilityات', 'three probabilities'],
  ['probabilityات', 'probabilities'],
  ['ثلاثة', 'three'],
  ['تفضيل', 'preference'],
  ['الظروف economic', 'economic conditions'],
  ['الظروف', 'conditions'],
  ['والسياسية المتغيرة', 'and changing political'],
  ['والسياسية', 'and political'],
  ['المتغيرة', 'changing'],
  ['تؤثر', 'affect'],
  ['حركة سعر صرف', 'exchange rate movement'],
  ['سعر صرف', 'exchange rate'],
  ['سعر', 'price'],
  ['صرف', 'exchange'],
  ['الولايات المتحدة', 'United States'],
  ['الولايات', 'States'],
  ['المتحدة', 'United'],
  ['واليابان', 'and Japan'],
  ['اليابان', 'Japan'],
  ['السياسة النقدية', 'monetary policy'],
  ['السياسة', 'policy'],
  ['النقدية', 'monetary'],
  ['المتعلقة', 'related'],
  ['بالسياسة', 'to policy'],
  ['الاعتبار', 'consideration'],
  ['نضع', 'we put'],
  ['المرتبطة', 'associated'],
  ['بالوضع', 'to the situation'],
  ['إدارة', 'management'],
  ['الصارمة', 'strict'],
  ['بما', 'including'],
  ['تحديد', 'determining'],
  ['أوامر وقف الخسارة', 'stop-loss orders'],
  ['أوامر', 'orders'],
  ['وقف', 'stop'],
  ['الخسارة', 'loss'],
  ['لتقليل', 'to reduce'],
  ['المحتملة', 'potential'],
  ['تطبيق', 'applying'],
  ['الdata', 'the data'],
  ['تحليلات', 'analyses'],
  ['تظهر', 'show'],
  ['يعني', 'means'],
  ['there فرصة', 'there is opportunity'],
  ['مستوى', 'level'],
  ['exceeded price', 'price exceeds'],
  
  // Round 5: more words from real briefs
  ['أسواق التنبؤ', 'Prediction markets'],
  ['أسواق', 'markets'],
  ['التنبؤ', 'prediction'],
  ['تسعّر', 'price'],
  ['احتمال صعود', 'upside probability'],
  ['صعود', 'upside'],
  ['تعارض', 'disagree'],
  ['تدعم', 'support'],
  ['news economic', 'economic news'],
  ['indicators the positive', 'positive indicators'],
  ['غلبة', 'dominance'],
  ['المخالف', 'opposing'],
  ['view المخالف', 'opposing view'],
  ['الأسباب المحددة', 'specific reasons'],
  ['الأسباب', 'reasons'],
  ['المحددة', 'specific'],
  ['قدمها', 'provided'],
  ['agents تشمل', 'agents include'],
  ['تشمل', 'include'],
  ['signals positive', 'positive signals'],
  ['news like expectations', 'news like expectations'],
  ['expectations', 'expectations'],
  ['لتدفقات صافية قياسية', 'for record net flows'],
  ['صافية قياسية', 'record net'],
  ['صافية', 'net'],
  ['قياسية', 'record'],
  ['second quarter', 'second quarter'],
  ['and rising industrial production', 'and rising industrial production'],
  ['for cars', 'for cars'],
  ['المملكة United', 'United Kingdom'],
  ['المملكة', 'Kingdom'],
  ['and redoing buying', 'and buyback of'],
  ['buying', 'buying'],
  ['سندات بقيمة', 'bonds worth'],
  ['سندات', 'bonds'],
  ['بقيمة', 'worth'],
  ['مليون', 'million'],
  ['جنيه إسترليني', 'British pounds'],
  ['جنيه', 'pound'],
  ['إسترليني', 'sterling'],
  ['from before', 'from'],
  ['مجموعة', 'group'],
  ['المصرفية', 'banking'],
  ['in addition to ذلك', 'in addition to that'],
  ['in addition', 'in addition'],
  ['ذلك،', 'that,'],
  ['ذلك', 'that'],
  ['indicates مؤشر RSI', 'RSI indicator indicates'],
  ['مؤشر', 'indicator'],
  ['RSI الحقيقي', 'actual RSI'],
  ['الحقيقي', 'actual'],
  ['at 37.46 to that', 'at 37.46 indicates that'],
  ['market may انخفض', 'market may drop'],
  ['انخفض', 'drop'],
  ['as large', 'significantly'],
  ['andcan that يعود', 'and may rebound'],
  ['يعود', 'rebound'],
  ['to above', 'upward'],
  ['was exceededه', 'was overridden'],
  ['due to', 'due to'],
  
  // EUR/USD brief
  ['العملة', 'currency'],
  ['اليورو', 'Euro'],
  ['الأوروبية', 'European'],
  ['الاستراتيجية', 'strategy'],
  ['للتداول', 'for trading'],
  ['تجاه', 'toward'],
  ['تخفيض', 'reducing'],
  ['توصي', 'recommends'],
  ['يوصي', 'recommends'],
  ['الخوف', 'fear'],
  ['والطمع', 'and greed'],
  ['ومدد', 'and extended'],
  ['لأن', 'because'],
  ['عن', 'about'],
  
  // Residue patterns
  ['يبرر تغيير', 'justifies changing'],
  ['يبرر', 'justifies'],
  ['تغيير', 'changing'],
  
  // Single letter residue
  ['ه', ''],  // Arabic pronoun suffix
  ['م', ''],  // Arabic preposition suffix
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
  
  // Sort ALL entries by length descending (longest first)
  // This ensures multi-word phrases are replaced before their constituent words
  const sorted = [...ARABIC_TO_ENGLISH_PHRASES].sort((a, b) => b[0].length - a[0].length);
  
  // Replace phrases - use word boundary aware replacement
  // For Arabic, word boundary = preceded/followed by: space, punctuation, start/end, or non-Arabic char
  for (const [ar, en] of sorted) {
    if (!result.includes(ar)) continue;
    
    // For short single-character words (و، في، من، إلى، مع، على، بـ، أن، أو، إن)
    // we MUST use word boundaries to avoid breaking longer words
    if (ar.length <= 3) {
      // Build regex with Arabic-aware boundaries
      // Preceded by: start, whitespace, or non-Arabic-letter char
      // Followed by: end, whitespace, or non-Arabic-letter char
      const escaped = ar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Boundary: chars that are NOT Arabic letters (so spaces, punctuation, Latin chars, numbers)
      const boundary = '[\\s\\u0000-\\u05FF\\u0780-\\uFFFF,.!?;:()\\[\\]{}"\'`/\\\\|<>=+\\-*_@#$%^&~]';
      const pattern = new RegExp(`(^|${boundary})${escaped}(${boundary}|$)`, 'gu');
      // Use function to preserve boundaries
      result = result.replace(pattern, (_m, before, after) => `${before}${en}${after}`);
    } else {
      // For longer phrases (4+ chars), safe to replace directly
      while (result.includes(ar)) {
        result = result.replace(ar, en);
      }
    }
  }
  
  // Clean up double spaces and trailing/leading whitespace
  result = result.replace(/\s+/g, ' ').trim();
  
  // Clean up common artifacts
  result = result.replace(/\s+,/g, ',');
  result = result.replace(/\s+\./g, '.');
  result = result.replace(/\s+\)/g, ')');
  result = result.replace(/\(\s+/g, '(');
  result = result.replace(/\s+،/g, '،');
  
  // V592: Post-processing for Arabic morphology attached to English words
  
  // Pattern 1: "ال" + English word → "the " + English word
  // e.g. "الrisk" → "the risk", "الdata" → "the data"
  result = result.replace(/\u0627\u0644([A-Za-z][A-Za-z]+)/g, 'the $1');
  
  // Pattern 2: "وال" + English word → "and the " + English word
  // e.g. "والvolatilityات" → "and the volatilities"
  result = result.replace(/\u0648\u0627\u0644([A-Za-z][A-Za-z]+)/g, 'and the $1');
  
  // Pattern 3: English word + "ات" (Arabic plural suffix) → English word + "s"
  // e.g. "volatilityات" → "volatilities", "probabilityات" → "probabilities"
  result = result.replace(/([A-Za-z][A-Za-z]+)\u0627\u062a/g, '$1s');
  
  // Pattern 4: English word + "ة" (Arabic feminine suffix) → English word
  // e.g. "largeة" → "large", "bearishة" → "bearish"
  result = result.replace(/([A-Za-z][A-Za-z]+)\u0629/g, '$1');
  
  // Pattern 5: "س" + English verb (future tense prefix) → "will " + verb
  // e.g. "سindicates" → "will indicate"
  result = result.replace(/\u0633([A-Za-z]{4,})/g, (match, verb) => {
    // Simple heuristic: just use "will " + verb
    return `will ${verb}`;
  });
  
  // Pattern 6: "ي" + English verb (present tense prefix) → "" + verb
  // e.g. "يبرر" already handled, but "يindicates" → "indicates"
  result = result.replace(/\u064a([A-Za-z]{4,})/g, '$1');
  
  // Pattern 7: "ب" + English word (preposition) → "by/with " + word
  // e.g. "بvolatility" → "with volatility"
  result = result.replace(/\u0628([A-Za-z]{4,})/g, 'with $1');
  
  // Pattern 8: "ل" + English word (preposition "for") → "for " + word
  // e.g. "لvolatility" → "for volatility"
  result = result.replace(/\u0644([A-Za-z]{4,})/g, 'for $1');
  
  // Pattern 9: "ا" standalone prefix on English → remove
  result = result.replace(/\u0627([A-Za-z]{4,})/g, '$1');
  
  // Pattern 10: English word + "،" (Arabic comma) → English word + ","
  result = result.replace(/([A-Za-z])\u060c/g, '$1,');
  
  // Pattern 11: Standalone single Arabic letters (residue) → remove
  // Only remove if surrounded by spaces or at boundaries
  result = result.replace(/\s+[\u0627\u0648\u0628\u0644\u0641\u0642\u0643\u0645\u0646\u0647\u064a\u0633\u0639\u062a\u062d\u0631\u0635\u0636\u0637\u0630\u0621\u0624\u0626\u0629]\s+/g, ' ');
  result = result.replace(/^[\u0627\u0648\u0628\u0644\u0641\u0642\u0643\u0645\u0646\u0647\u064a\u0633\u0639\u062a\u062d\u0631\u0635\u0636\u0637\u0630\u0621\u0624\u0626\u0629]\s+/g, '');
  result = result.replace(/\s+[\u0627\u0648\u0628\u0644\u0641\u0642\u0643\u0645\u0646\u0647\u064a\u0633\u0639\u062a\u062d\u0631\u0635\u0636\u0637\u0630\u0621\u0624\u0626\u0629]$/g, '');
  
  // Final cleanup: remove any remaining Arabic characters that couldn't be translated
  // (these are usually residue from partial matches)
  // result = result.replace(/[\u0600-\u06FF\u0750-\u077F]+/g, '');
  
  // Clean up double spaces again (from removals)
  result = result.replace(/\s+/g, ' ').trim();
  result = result.replace(/\s+,/g, ',');
  result = result.replace(/\s+\./g, '.');
  result = result.replace(/\s+\)/g, ')');
  result = result.replace(/\(\s+/g, '(');
  
  return result;
}

/**
 * Check if text contains Arabic characters.
 */
export function containsArabic(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}
