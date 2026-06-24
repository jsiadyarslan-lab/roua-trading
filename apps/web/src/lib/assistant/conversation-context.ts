// ─── Conversation Context Extractor ────────────────────────────────
// Extracts structured context from conversation history so the AI
// understands what was discussed before without sending raw text.

export type ConvLocale = 'ar' | 'en' | 'fr' | 'tr' | 'es';

export interface ConversationContext {
  mentionedAssets: string[];        // Assets discussed: ['BTCUSD', 'XAUUSD']
  discussedTopics: string[];        // Topics: ['price', 'analysis', 'news']
  userStance?: string;              // 'bullish' | 'bearish' | 'neutral' | 'curious'
  keyNumbers: string[];             // Important numbers mentioned: ['67500', '+2.3%']
  summary: string;                  // 1-2 sentence summary of conversation
}

/**
 * Extract structured conversation context from message history.
 * Uses fast rule-based extraction (no AI needed).
 * Runs in <1ms.
 */
export function extractConversationContext(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  locale: ConvLocale = 'ar',
): ConversationContext {
  if (!history || history.length === 0) {
    return { mentionedAssets: [], discussedTopics: [], keyNumbers: [], summary: '' };
  }

  const isAr = locale === 'ar';
  const allText = history.map(m => m.content).join(' ');
  const mentionedAssets: string[] = [];
  const discussedTopics: string[] = [];
  const keyNumbers: string[] = [];
  
  // Extract assets from conversation
  const ASSET_PATTERNS: Array<{ pattern: RegExp; symbol: string }> = [
    { pattern: /\b(BTC|Bitcoin|بتكوين|البتكوين)\b/i, symbol: 'BTCUSD' },
    { pattern: /\b(ETH|Ethereum|إيثريوم|الإيثريوم)\b/i, symbol: 'ETHUSD' },
    { pattern: /\b(XAU|Gold|ذهب|الذهب)\b/i, symbol: 'XAUUSD' },
    { pattern: /\b(XAG|Silver|فضة|الفضة)\b/i, symbol: 'XAGUSD' },
    { pattern: /\b(SOL|Solana|سولانا)\b/i, symbol: 'SOLUSD' },
    { pattern: /\b(EURUSD|يورو)\b/i, symbol: 'EURUSD' },
    { pattern: /\b(GBPUSD|جنيه|استرليني)\b/i, symbol: 'GBPUSD' },
    { pattern: /\b(USDJPY|الين)\b/i, symbol: 'USDJPY' },
    { pattern: /\b(WTI|نفط|النفط)\b/i, symbol: 'CL' },
    { pattern: /\b(SPX|S&P)\b/i, symbol: 'SPX' },
    { pattern: /\b(NDX|Nasdaq|ناسداك)\b/i, symbol: 'NDX' },
  ];
  
  const seen = new Set<string>();
  for (const { pattern, symbol } of ASSET_PATTERNS) {
    if (pattern.test(allText) && !seen.has(symbol)) {
      seen.add(symbol);
      mentionedAssets.push(symbol);
    }
  }
  
  // Extract topics
  const TOPIC_PATTERNS: Array<{ pattern: RegExp; topic: string }> = [
    { pattern: /(?:سعر|price|كم|بكم|quote)/i, topic: 'price' },
    { pattern: /(?:إشارة|signal|توصية|توصيات|شراء|بيع)/i, topic: 'signals' },
    { pattern: /(?:تحليل|analysis|فني|أساسي|RSI|MACD)/i, topic: 'analysis' },
    { pattern: /(?:أخبار|news|خبر|حدث)/i, topic: 'news' },
    { pattern: /(?:رأيك|recommend|نصيحة|هل أشتري)/i, topic: 'recommendation' },
    { pattern: /(?:السوق|market|overview|وضع)/i, topic: 'market_overview' },
  ];
  
  const seenTopics = new Set<string>();
  for (const { pattern, topic } of TOPIC_PATTERNS) {
    if (pattern.test(allText) && !seenTopics.has(topic)) {
      seenTopics.add(topic);
      discussedTopics.push(topic);
    }
  }
  
  // Extract key numbers (prices, percentages)
  const numMatches = allText.match(/(?:\$?\d[\d,.]+%?)/g) ?? [];
  for (const num of numMatches.slice(0, 5)) {
    keyNumbers.push(num);
  }
  
  // Detect user stance
  let userStance: string | undefined;
  if (/(?:أشتري|شراء|buy|long|صاعد|bullish)/i.test(allText)) userStance = 'bullish';
  else if (/(?:أبيع|بيع|sell|short|نزل|bearish)/i.test(allText)) userStance = 'bearish';
  else userStance = 'curious';
  
  // Build summary
  const lastUserMsg = [...history].reverse().find(m => m.role === 'user')?.content ?? '';
  const summary = isAr
    ? `المستخدم سأل عن ${mentionedAssets.length > 0 ? mentionedAssets.join(' و') : 'السوق'}${discussedTopics.length > 0 ? ` (مواضيع: ${discussedTopics.join('، ')})` : ''}. آخر سؤال: "${lastUserMsg.slice(0, 100)}"`
    : `User asked about ${mentionedAssets.length > 0 ? mentionedAssets.join(' and ') : 'the market'}${discussedTopics.length > 0 ? ` (topics: ${discussedTopics.join(', ')})` : ''}. Last question: "${lastUserMsg.slice(0, 100)}"`;
  
  return { mentionedAssets, discussedTopics, userStance, keyNumbers, summary };
}

/**
 * Format conversation context for inclusion in AI prompt.
 */
export function formatConversationContext(ctx: ConversationContext, locale: ConvLocale = 'ar'): string {
  const isAr = locale === 'ar';
  if (!ctx.summary) return '';
  
  const parts: string[] = [];
  parts.push(isAr ? `📋 سياق المحادثة السابقة:` : `📋 Previous Conversation Context:`);
  parts.push(ctx.summary);
  
  if (ctx.mentionedAssets.length > 0) {
    parts.push(isAr ? `الأصول المذكورة: ${ctx.mentionedAssets.join('، ')}` : `Mentioned assets: ${ctx.mentionedAssets.join(', ')}`);
  }
  if (ctx.userStance) {
    const stanceMap = isAr 
      ? { bullish: 'صاعد', bearish: 'هابط', neutral: 'محايد', curious: 'مستطلع' }
      : { bullish: 'bullish', bearish: 'bearish', neutral: 'neutral', curious: 'curious' };
    parts.push(isAr ? `ميول المستخدم: ${stanceMap[ctx.userStance as keyof typeof stanceMap] || ctx.userStance}` : `User stance: ${stanceMap[ctx.userStance as keyof typeof stanceMap] || ctx.userStance}`);
  }
  if (ctx.keyNumbers.length > 0) {
    parts.push(isAr ? `أرقام مذكورة: ${ctx.keyNumbers.join('، ')}` : `Mentioned numbers: ${ctx.keyNumbers.join(', ')}`);
  }
  
  parts.push(isAr 
    ? `إذا كان سؤال المستخدم الحالي متابعة لمحادثة سابقة، استخدم هذا السياق للإجابة.`
    : `If the user's current question is a follow-up, use this context to answer.`);
  
  return parts.join('\n');
}
