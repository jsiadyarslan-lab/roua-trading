// ════════════════════════════════════════════════════════════
// Multi-language Translation Dictionaries
// Fallback translations for common Arabic phrases in briefs.
// Used when AI models are unavailable or fail.
// ════════════════════════════════════════════════════════════

import { ARABIC_TO_ENGLISH_PHRASES, localTranslateArabicToEnglish } from './local-translation-dictionary';

/**
 * French translations for common brief phrases.
 * Maps Arabic phrases → French equivalents.
 */
export const ARABIC_TO_FRENCH_PHRASES: Array<[string, string]> = [
  // Headers
  ['تركيب الاستراتيجية النهائية للتداول على', 'Synthèse de la stratégie finale de trading pour'],
  ['تركيب الاستراتيجية التنفيذية لـ', 'Synthèse de la stratégie exécutive pour'],
  ['تركيب الاستراتيجية النهائية', 'Synthèse de la stratégie finale'],
  
  // Council structure
  ['بناءً على تحليل 8 وكلاء ذكاء اصطناعي', 'Basé sur l\'analyse de 8 agents IA'],
  ['بناءً على تحليل آراء خبراء الذكاء الاصطناعي الثمانية', 'Basé sur l\'analyse des opinions des huit experts IA'],
  ['بناءً على تحليل', 'Basé sur l\'analyse de'],
  ['وكلاء ذكاء اصطناعي', 'agents IA'],
  ['خبراء الذكاء الاصطناعي', 'experts IA'],
  ['وكلاء صوتوا', 'agents ont voté'],
  ['خبراء صوتوا', 'experts ont voté'],
  ['بمتوسط ثقة', 'avec une confiance moyenne de'],
  
  // Numbers/quantities
  ['من 8', 'sur 8'],
  ['من 7', 'sur 7'],
  ['من 6', 'sur 6'],
  ['من 5', 'sur 5'],
  
  // Voting
  ['صوتوا للشراء', 'ont voté ACHAT'],
  ['صوتوا للبيع', 'ont voté VENTE'],
  ['صوتوا للانتظار', 'ont voté CONSERVER'],
  ['صوت للشراء', 'a voté ACHAT'],
  ['صوت للبيع', 'a voté VENTE'],
  ['للشراء', 'pour ACHAT'],
  ['للبيع', 'pour VENTE'],
  ['للانتظار', 'pour CONSERVER'],
  
  // Consensus
  ['الإجماع الكمي', 'Consensus quantitatif'],
  ['الإجماع', 'Consensus'],
  ['إجماع قوي', 'Consensus fort'],
  ['مدعومًا بـ', 'soutenu par'],
  
  // Market state
  ['حالة عرضية/جانبية', 'état de range/latéral'],
  ['سوق عرضي', 'marché de range'],
  ['سوق جانبي', 'marché latéral'],
  ['اتجاه صعودي', 'tendance haussière'],
  ['اتجاه هبوطي', 'tendance baissière'],
  ['تقلب', 'volatilité'],
  ['مشاعر سوق', 'sentiment du marché'],
  ['محايدة', 'neutres'],
  
  // Analysis terms
  ['تحليل الأنماط', 'Analyse des patterns'],
  ['محلل المشاعر', 'Analyste de sentiment'],
  ['محلل السيناريوهات', 'Analyste de scénarios'],
  ['الخبير الماكرو', 'Expert macro'],
  ['الخبير الفني', 'Expert technique'],
  ['الخبير المخاطر', 'Expert des risques'],
  ['الاستراتيجي التنفيذي', 'Stratège d\'exécution'],
  ['محلل التباين', 'Analyste de divergence'],
  ['رأي مخالف', 'opinion dissidente'],
  
  // Risk
  ['مخاطر عالية', 'risque élevé'],
  ['مخاطر متوسطة', 'risque moyen'],
  ['مخاطر منخفضة', 'risque faible'],
  ['مخاطر', 'risque'],
  
  // News
  ['سياق الأخبار', 'Contexte des actualités'],
  ['لا أخبار متاحة', 'Aucune actualité disponible'],
  ['خبر حديث', 'article récent'],
  
  // Actions
  ['إبطال الإشارة', 'Invalidation du signal'],
  ['إغلاق 4 ساعات', 'clôture de 4 heures'],
  ['تحت', 'sous'],
  ['فوق', 'au-dessus de'],
  
  // Common phrases
  ['يتضح أن السوق', 'il est clair que le marché'],
  ['يظهر أن', 'montre que'],
  ['ومع ذلك', 'cependant'],
  ['ولكن', 'mais'],
  ['بينما', 'tandis que'],
  
  // Warning section
  ['تنبيه', 'Avertissement'],
  ['شرط الإبطال', 'Condition d\'invalidation'],
  ['الذكاء الاصطناعي', 'intelligence artificielle'],
  ['التداول', 'trading'],
  ['نجاح', 'succès'],
  ['خسائر', 'pertes'],
  ['أعلى', 'au-dessus de'],
  ['عندما', 'lorsque'],
  ['يتجاوز', 'dépasse'],
  ['زوج', 'paire'],
  ['المستوى', 'niveau'],
  
  // Common words
  ['على', 'sur'],
  ['في', 'dans'],
  ['من', 'de'],
  ['إلى', 'à'],
  ['مع', 'avec'],
  ['و', 'et'],
  ['أو', 'ou'],
  ['أن', 'que'],
  ['كان', 'était'],
  ['لا', 'ne'],
  ['كل', 'tous'],
  ['بعض', 'certains'],
  ['هذا', 'ce'],
  ['هذه', 'cette'],
  ['التي', 'qui'],
  ['الذي', 'qui'],
  ['ذلك', 'cela'],
  ['الآن', 'maintenant'],
  ['اليوم', 'aujourd\'hui'],
  
  // Sentiment labels
  ['إيجابي قوي', 'Fortement positif'],
  ['إيجابي خفيف', 'Légèrement positif'],
  ['سلبي قوي', 'Fortement négatif'],
  ['سلبي خفيف', 'Légèrement négatif'],
  ['محايد', 'Neutre'],
  
  // Market terms
  ['السوق', 'marché'],
  ['السعر', 'prix'],
  ['الأسعار', 'prix'],
  ['الصفقة', 'transaction'],
  ['المركز', 'position'],
  ['المراكز', 'positions'],
  
  // Indicators
  ['المؤشرات', 'indicateurs'],
  ['المؤشر', 'indicateur'],
  ['الدعم', 'support'],
  ['المقاومة', 'résistance'],
  
  // Direction
  ['الاتجاه', 'tendance'],
  ['صعودي', 'haussier'],
  ['هبوطي', 'baissier'],
  ['عرضي', 'de range'],
  ['جانبي', 'latéral'],
  
  // Punctuation
  ['،', ','],
];

/**
 * German translations for common brief phrases.
 */
export const ARABIC_TO_GERMAN_PHRASES: Array<[string, string]> = [
  // Headers
  ['تركيب الاستراتيجية النهائية للتداول على', 'Synthese der finalen Handelsstrategie für'],
  ['تركيب الاستراتيجية التنفيذية لـ', 'Synthese der operativen Strategie für'],
  
  // Council structure
  ['بناءً على تحليل 8 وكلاء ذكاء اصطناعي', 'Basierend auf der Analyse von 8 KI-Agenten'],
  ['وكلاء ذكاء اصطناعي', 'KI-Agenten'],
  ['خبراء الذكاء الاصطناعي', 'KI-Experten'],
  ['وكلاء صوتوا', 'Agenten stimmten'],
  ['بمتوسط ثقة', 'mit durchschnittlichem Vertrauen von'],
  
  // Numbers
  ['من 8', 'von 8'],
  ['من 7', 'von 7'],
  ['من 6', 'von 6'],
  ['من 5', 'von 5'],
  
  // Voting
  ['صوتوا للشراء', 'stimmten für KAUF'],
  ['صوتوا للبيع', 'stimmten für VERKAUF'],
  ['صوتوا للانتظار', 'stimmten für HALTEN'],
  ['للشراء', 'für KAUF'],
  ['للبيع', 'für VERKAUF'],
  ['للانتظار', 'für HALTEN'],
  
  // Consensus
  ['الإجماع الكمي', 'Quantitativer Konsens'],
  ['الإجماع', 'Konsens'],
  ['إجماع قوي', 'Starker Konsens'],
  ['مدعومًا بـ', 'unterstützt durch'],
  
  // Market state
  ['حالة عرضية/جانبية', 'Seitwärtszustand'],
  ['سوق عرضي', 'Seitwärtsmarkt'],
  ['اتجاه صعودي', 'Aufwärtstrend'],
  ['اتجاه هبوطي', 'Abwärtstrend'],
  ['تقلب', 'Volatilität'],
  ['مشاعر سوق', 'Marktstimmung'],
  ['محايدة', 'neutral'],
  
  // Analysis terms
  ['محلل المشاعر', 'Sentiment-Analyst'],
  ['محلل السيناريوهات', 'Szenario-Analyst'],
  ['الخبير الماكرو', 'Makro-Experte'],
  ['الخبير الفني', 'Technischer Experte'],
  ['الخبير المخاطر', 'Risiko-Experte'],
  ['الاستراتيجي التنفيذي', 'Ausführungsstratege'],
  ['محلل التباين', 'Divergenz-Analyst'],
  ['رأي مخالف', 'abweichende Meinung'],
  
  // Risk
  ['مخاطر عالية', 'hohes Risiko'],
  ['مخاطر متوسطة', 'mittleres Risiko'],
  ['مخاطر منخفضة', 'niedriges Risiko'],
  ['مخاطر', 'Risiko'],
  
  // News
  ['سياق الأخبار', 'Nachrichtenkontext'],
  ['لا أخبار متاحة', 'Keine Nachrichten verfügbar'],
  
  // Actions
  ['إبطال الإشارة', 'Signalinvalidierung'],
  ['إغلاق 4 ساعات', '4-Stunden-Schluss'],
  ['تحت', 'unter'],
  ['فوق', 'über'],
  
  // Warning
  ['تنبيه', 'Warnung'],
  ['شرط الإبطال', 'Invalidierungsbedingung'],
  ['الذكاء الاصطناعي', 'künstliche Intelligenz'],
  ['التداول', 'Handel'],
  ['نجاح', 'Erfolg'],
  ['خسائر', 'Verluste'],
  ['أعلى', 'über'],
  ['عندما', 'wenn'],
  ['يتجاوز', 'überschreitet'],
  ['زوج', 'Paar'],
  ['المستوى', 'Niveau'],
  
  // Common words
  ['على', 'auf'],
  ['في', 'in'],
  ['من', 'von'],
  ['إلى', 'bis'],
  ['مع', 'mit'],
  ['و', 'und'],
  ['أو', 'oder'],
  ['أن', 'dass'],
  ['لا', 'nicht'],
  ['كل', 'alle'],
  ['بعض', 'einige'],
  ['هذا', 'dies'],
  ['هذه', 'diese'],
  ['الآن', 'jetzt'],
  ['اليوم', 'heute'],
  
  // Sentiment
  ['إيجابي قوي', 'Stark positiv'],
  ['إيجابي خفيف', 'Leicht positiv'],
  ['سلبي قوي', 'Stark negativ'],
  ['سلبي خفيف', 'Leicht negativ'],
  ['محايد', 'Neutral'],
  
  // Market
  ['السوق', 'Markt'],
  ['السعر', 'Preis'],
  ['الصفقة', 'Trade'],
  ['المركز', 'Position'],
  
  // Direction
  ['الاتجاه', 'Trend'],
  ['صعودي', 'bullisch'],
  ['هبوطي', 'bärisch'],
  ['عرضي', 'seitwärts'],
  
  // Punctuation
  ['،', ','],
];

/**
 * Spanish translations for common brief phrases.
 */
export const ARABIC_TO_SPANISH_PHRASES: Array<[string, string]> = [
  // Headers
  ['تركيب الاستراتيجية النهائية للتداول على', 'Síntesis de la estrategia final de trading para'],
  ['تركيب الاستراتيجية التنفيذية لـ', 'Síntesis de la estrategia ejecutiva para'],
  
  // Council structure
  ['بناءً على تحليل 8 وكلاء ذكاء اصطناعي', 'Basado en el análisis de 8 agentes de IA'],
  ['وكلاء ذكاء اصطناعي', 'agentes de IA'],
  ['خبراء الذكاء الاصطناعي', 'expertos de IA'],
  ['وكلاء صوتوا', 'agentes votaron'],
  ['بمتوسط ثقة', 'con confianza promedio de'],
  
  // Numbers
  ['من 8', 'de 8'],
  ['من 7', 'de 7'],
  ['من 6', 'de 6'],
  ['من 5', 'de 5'],
  
  // Voting
  ['صوتوا للشراء', 'votaron COMPRAR'],
  ['صوتوا للبيع', 'votaron VENDER'],
  ['صوتوا للانتظار', 'votaron MANTENER'],
  ['للشراء', 'para COMPRAR'],
  ['للبيع', 'para VENDER'],
  ['للانتظار', 'para MANTENER'],
  
  // Consensus
  ['الإجماع الكمي', 'Consenso cuantitativo'],
  ['الإجماع', 'Consenso'],
  ['إجماع قوي', 'Consenso fuerte'],
  ['مدعومًا بـ', 'respaldado por'],
  
  // Market state
  ['حالة عرضية/جانبية', 'estado lateral/rango'],
  ['اتجاه صعودي', 'tendencia alcista'],
  ['اتجاه هبوطي', 'tendencia bajista'],
  ['تقلب', 'volatilidad'],
  ['مشاعر سوق', 'sentimiento del mercado'],
  ['محايدة', 'neutrales'],
  
  // Analysis terms
  ['محلل المشاعر', 'Analista de sentimiento'],
  ['محلل السيناريوهات', 'Analista de escenarios'],
  ['الخبير الماكرو', 'Experto macro'],
  ['الخبير الفني', 'Experto técnico'],
  ['الخبير المخاطر', 'Experto en riesgos'],
  ['الاستراتيجي التنفيذي', 'Estratega de ejecución'],
  ['محلل التباين', 'Analista de divergencia'],
  ['رأي مخالف', 'opinión disidente'],
  
  // Risk
  ['مخاطر عالية', 'riesgo alto'],
  ['مخاطر متوسطة', 'riesgo medio'],
  ['مخاطر منخفضة', 'riesgo bajo'],
  ['مخاطر', 'riesgo'],
  
  // News
  ['سياق الأخبار', 'Contexto de noticias'],
  ['لا أخبار متاحة', 'No hay noticias disponibles'],
  
  // Actions
  ['إبطال الإشارة', 'Invalidación de señal'],
  ['إغلاق 4 ساعات', 'cierre de 4 horas'],
  ['تحت', 'bajo'],
  ['فوق', 'sobre'],
  
  // Warning
  ['تنبيه', 'Advertencia'],
  ['شرط الإبطال', 'Condición de invalidación'],
  ['الذكاء الاصطناعي', 'inteligencia artificial'],
  ['التداول', 'trading'],
  ['نجاح', 'éxito'],
  ['خسائر', 'pérdidas'],
  ['أعلى', 'sobre'],
  ['عندما', 'cuando'],
  ['يتجاوز', 'excede'],
  ['زوج', 'par'],
  ['المستوى', 'nivel'],
  
  // Common words
  ['على', 'en'],
  ['في', 'en'],
  ['من', 'de'],
  ['إلى', 'a'],
  ['مع', 'con'],
  ['و', 'y'],
  ['أو', 'o'],
  ['أن', 'que'],
  ['لا', 'no'],
  ['كل', 'todo'],
  ['بعض', 'algunos'],
  ['هذا', 'esto'],
  ['هذه', 'esta'],
  ['الآن', 'ahora'],
  ['اليوم', 'hoy'],
  
  // Sentiment
  ['إيجابي قوي', 'Fuertemente positivo'],
  ['إيجابي خفيف', 'Ligeramente positivo'],
  ['سلبي قوي', 'Fuertemente negativo'],
  ['سلبي خفيف', 'Ligeramente negativo'],
  ['محايد', 'Neutral'],
  
  // Market
  ['السوق', 'mercado'],
  ['السعر', 'precio'],
  ['الصفقة', 'operación'],
  ['المركز', 'posición'],
  
  // Direction
  ['الاتجاه', 'tendencia'],
  ['صعودي', 'alcista'],
  ['هبوطي', 'bajista'],
  ['عرضي', 'lateral'],
  
  // Punctuation
  ['،', ','],
];

/**
 * Turkish translations for common brief phrases.
 */
export const ARABIC_TO_TURKISH_PHRASES: Array<[string, string]> = [
  // Headers
  ['تركيب الاستراتيجية النهائية للتداول على', 'Final ticaret stratejisi sentezi'],
  ['تركيب الاستراتيجية التنفيذية لـ', 'Yönetici strateji sentezi'],
  
  // Council structure
  ['بناءً على تحليل 8 وكلاء ذكاء اصطناعي', '8 yapay zeka ajanının analizine dayanarak'],
  ['وكلاء ذكاء اصطناعي', 'yapay zeka ajanları'],
  ['خبراء الذكاء الاصطناعي', 'yapay zeka uzmanları'],
  ['وكلاء صوتوا', 'ajanlar oy verdi'],
  ['بمتوسط ثقة', 'ortalama güven ile'],
  
  // Numbers
  ['من 8', '/ 8'],
  ['من 7', '/ 7'],
  ['من 6', '/ 6'],
  ['من 5', '/ 5'],
  
  // Voting
  ['صوتوا للشراء', 'AL oyu verdi'],
  ['صوتوا للبيع', 'SAT oyu verdi'],
  ['صوتوا للانتظار', 'TUT oyu verdi'],
  ['للشراء', 'AL için'],
  ['للبيع', 'SAT için'],
  ['للانتظار', 'TUT için'],
  
  // Consensus
  ['الإجماع الكمي', 'Nicel fikir birliği'],
  ['الإجماع', 'Fikir birliği'],
  ['إجماع قوي', 'Güçlü fikir birliği'],
  ['مدعومًا بـ', 'tarafından desteklenmektedir'],
  
  // Market state
  ['حالة عرضية/جانبية', 'yandan/ileri-geri durum'],
  ['اتجاه صعودي', 'yükseliş trendi'],
  ['اتجاه هبوطي', 'düşüş trendi'],
  ['تقلب', 'oynaklık'],
  ['مشاعر سوق', 'piyasa duyarlılığı'],
  ['محايدة', 'nötr'],
  
  // Analysis terms
  ['محلل المشاعر', 'Duyarlılık Analisti'],
  ['محلل السيناريوهات', 'Senaryo Analisti'],
  ['الخبير الماكرو', 'Makro Uzmanı'],
  ['الخبير الفني', 'Teknik Uzman'],
  ['الخبير المخاطر', 'Risk Uzmanı'],
  ['الاستراتيجي التنفيذي', 'Yürütme Stratejisti'],
  ['محلل التباين', 'Sapma Analisti'],
  ['رأي مخالف', 'muhalif görüş'],
  
  // Risk
  ['مخاطر عالية', 'yüksek risk'],
  ['مخاطر متوسطة', 'orta risk'],
  ['مخاطر منخفضة', 'düşük risk'],
  ['مخاطر', 'risk'],
  
  // News
  ['سياق الأخبار', 'Haber bağlamı'],
  ['لا أخبار متاحة', 'Haber bulunamadı'],
  
  // Actions
  ['إبطال الإشارة', 'Sinyal geçersiz kılma'],
  ['إغلاق 4 ساعات', '4 saatlik kapanış'],
  ['تحت', 'altında'],
  ['فوق', 'üzerinde'],
  
  // Warning
  ['تنبيه', 'Uyarı'],
  ['شرط الإبطال', 'Geçersiz kılma koşulu'],
  ['الذكاء الاصطناعي', 'yapay zeka'],
  ['التداول', 'ticaret'],
  ['نجاح', 'başarı'],
  ['خسائر', 'kayıplar'],
  ['أعلى', 'üzerinde'],
  ['عندما', 'olduğunda'],
  ['يتجاوز', 'aşıyor'],
  ['زوج', 'çift'],
  ['المستوى', 'seviye'],
  
  // Common words
  ['على', 'üzerinde'],
  ['في', 'içinde'],
  ['من', 'dan'],
  ['إلى', 'ya'],
  ['مع', 'ile'],
  ['و', 've'],
  ['أو', 'veya'],
  ['أن', 'ki'],
  ['لا', 'değil'],
  ['كل', 'tüm'],
  ['بعض', 'bazı'],
  ['هذا', 'bu'],
  ['هذه', 'bu'],
  ['الآن', 'şimdi'],
  ['اليوم', 'bugün'],
  
  // Sentiment
  ['إيجابي قوي', 'Güçlü pozitif'],
  ['إيجابي خفيف', 'Hafif pozitif'],
  ['سلبي قوي', 'Güçlü negatif'],
  ['سلبي خفيف', 'Hafif negatif'],
  ['محايد', 'Nötr'],
  
  // Market
  ['السوق', 'piyasa'],
  ['السعر', 'fiyat'],
  ['الصفقة', 'işlem'],
  ['المركز', 'pozisyon'],
  
  // Direction
  ['الاتجاه', 'trend'],
  ['صعودي', 'yükseliş'],
  ['هبوطي', 'düşüş'],
  ['عرضي', 'yatay'],
  
  // Punctuation
  ['،', ','],
];

/**
 * Get the appropriate dictionary for a target language.
 */
export function getDictionaryForLanguage(language: string): Array<[string, string]> {
  switch (language) {
    case 'fr': return ARABIC_TO_FRENCH_PHRASES;
    case 'de': return ARABIC_TO_GERMAN_PHRASES;
    case 'es': return ARABIC_TO_SPANISH_PHRASES;
    case 'tr': return ARABIC_TO_TURKISH_PHRASES;
    case 'en':
    default:
      return ARABIC_TO_ENGLISH_PHRASES;
  }
}

/**
 * Translate Arabic text to the target language using local dictionary.
 * Falls back to English dictionary for unsupported languages.
 */
export function localTranslateArabicToLanguage(text: string, targetLanguage: string): string {
  if (targetLanguage === 'ar') return text;
  if (targetLanguage === 'en') return localTranslateArabicToEnglish(text);
  
  // For other languages, use their dictionary if available
  const dict = getDictionaryForLanguage(targetLanguage);
  if (dict === ARABIC_TO_ENGLISH_PHRASES) {
    // No dictionary for this language, fall back to English
    return localTranslateArabicToEnglish(text);
  }
  
  // Use the language-specific dictionary
  let result = text;
  const sorted = [...dict].sort((a, b) => b[0].length - a[0].length);
  
  for (const [ar, translated] of sorted) {
    if (!result.includes(ar)) continue;
    
    if (ar.length <= 3) {
      const escaped = ar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const boundary = '[\\s\\u0000-\\u05FF\\u0780-\\uFFFF,.!?;:()\\[\\]{}"\'`/\\\\|<>=+\\-*_@#$%^&~]';
      const pattern = new RegExp(`(^|${boundary})${escaped}(${boundary}|$)`, 'gu');
      result = result.replace(pattern, (_m, before, after) => `${before}${translated}${after}`);
    } else {
      while (result.includes(ar)) {
        result = result.replace(ar, translated);
      }
    }
  }
  
  // Apply the same morphology post-processing (Arabic prefixes/suffixes on non-Arabic words)
  // This handles patterns like "ال" + word, "ات" suffix, etc.
  result = result.replace(/\u0627\u0644([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ]+)/g, 'the $1');
  result = result.replace(/\u0648\u0627\u0644([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ]+)/g, 'and the $1');
  result = result.replace(/([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ]+)\u0627\u062a/g, '$1s');
  result = result.replace(/([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ]+)\u0629/g, '$1');
  result = result.replace(/\u0633([A-Za-zÀ-ÿ]{4,})/g, 'will $1');
  result = result.replace(/\u064a([A-Za-zÀ-ÿ]{4,})/g, '$1');
  result = result.replace(/\u0628([A-Za-zÀ-ÿ]{4,})/g, 'with $1');
  result = result.replace(/\u0644([A-Za-zÀ-ÿ]{4,})/g, 'for $1');
  result = result.replace(/([A-Za-zÀ-ÿ])\u060c/g, '$1,');
  
  // Cleanup
  result = result.replace(/\s+/g, ' ').trim();
  result = result.replace(/\s+,/g, ',');
  result = result.replace(/\s+\./g, '.');
  
  return result;
}
