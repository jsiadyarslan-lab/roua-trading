// ─── Intent Classifier ──────────────────────────────────────────
// RAG-Omega Architecture: Classifies user intent using PURE RULES.
// No AI needed — regex + keyword matching covers 95%+ of queries.
// This runs in <1ms and determines WHAT data to fetch from the DB
// BEFORE calling any AI model.

import type { Locale } from './tools';

// ─── Intent Types ────────────────────────────────────────────────

export type IntentType =
  | 'price_query'       // "سعر البيتكوين", "كم الذهب", "BTC price"
  | 'signal_query'      // "إشارات", "توصيات", "active signals"
  | 'analysis_query'    // "تحليل", "فني", "أساسي", "RSI", "MACD"
  | 'news_query'        // "أخبار", "خبر", "آخر الأخبار"
  | 'report_query'      // "تقارير", "تقرير"
  | 'recommendation'    // "رأيك", "هل أشتري", "ماذا تنصح"
  | 'market_overview'   // "كيف السوق", "وضع السوق", "overview"
  | 'education'         // "ما هو", "شرح", "كيف يعمل", "تعريف"
  // V1013 — new intent types for a "living" conversational assistant.
  // Previously the assistant forced the 5-section financial template on
  // every query. These new intents let us route non-financial questions
  // to appropriate response styles without losing the structured template
  // for genuine financial analysis requests.
  | 'chat'              // greetings, thanks, small talk: "مرحبًا", "شكرًا", "كيف حالك"
  | 'comparison'        // "قارن بين X و Y", "الفرق بين", "compare"
  | 'opinion'           // "ما رأيك في", "هل تعتقد", "what do you think"
  | 'follow_up'         // short follow-ups that depend on previous turn: "وماذا بعد؟", "لماذا؟", "كيف؟"
  | 'general';          // anything else — still search DB

// ─── Detected Asset ──────────────────────────────────────────────

export interface DetectedAsset {
  symbol: string;       // e.g., 'BTCUSD', 'XAUUSD', 'EURUSD'
  shortSymbol: string;  // e.g., 'BTC', 'XAU', 'EUR'
  nameAr: string;       // e.g., 'البتكوين'
  nameEn: string;       // e.g., 'Bitcoin'
  category: 'crypto' | 'forex' | 'commodity' | 'stock' | 'index';
}

// ─── Classification Result ───────────────────────────────────────

export interface IntentClassification {
  intent: IntentType;
  confidence: number;           // 0-1, how confident we are
  assets: DetectedAsset[];      // assets mentioned in the query
  dataNeeds: DataNeeds;         // what DB data to fetch
  requiresAI: boolean;          // whether AI processing is needed
  originalQuery: string;        // the original user message
}

export interface DataNeeds {
  prices: boolean;              // fetch MarketIndicator prices
  signals: boolean;             // fetch TradingSignal + Recommendations
  analysis: boolean;            // fetch TechnicalAnalysis + StockAnalysis
  news: boolean;                // fetch NewsItem
  reports: boolean;             // fetch EconomicReport + MarketAnalysis
  marketPulse: boolean;         // fetch market pulse overview
  crossReference: boolean;      // fetch cross-reference for detected assets
  knowledgeSearch: boolean;     // search the knowledge engine
  userProfile: boolean;         // fetch user profile context
}

// ─── Asset Detection Tables ──────────────────────────────────────

const ASSET_REGISTRY: Array<{
  keywords: string[];
  symbol: string;
  shortSymbol: string;
  nameAr: string;
  nameEn: string;
  category: DetectedAsset['category'];
}> = [
  // Crypto — major + mid-cap
  { keywords: ['بتكوين', 'البتكوين', 'بيتكوين', 'bitcoin', 'btc'], symbol: 'BTCUSD', shortSymbol: 'BTC', nameAr: 'البتكوين', nameEn: 'Bitcoin', category: 'crypto' },
  { keywords: ['إيثريوم', 'الإيثريوم', 'ايثريوم', 'ethereum', 'eth'], symbol: 'ETHUSD', shortSymbol: 'ETH', nameAr: 'الإيثريوم', nameEn: 'Ethereum', category: 'crypto' },
  { keywords: ['سولانا', 'solana', 'sol'], symbol: 'SOLUSD', shortSymbol: 'SOL', nameAr: 'سولانا', nameEn: 'Solana', category: 'crypto' },
  { keywords: ['دوج', 'دوجكوين', 'dogecoin', 'doge'], symbol: 'DOGEUSD', shortSymbol: 'DOGE', nameAr: 'دوجكوين', nameEn: 'Dogecoin', category: 'crypto' },
  { keywords: ['ريبيل', 'xrp', 'ripple'], symbol: 'XRPUSD', shortSymbol: 'XRP', nameAr: 'ريبيل', nameEn: 'Ripple', category: 'crypto' },
  { keywords: ['كاردانو', 'ada', 'cardano'], symbol: 'ADAUSD', shortSymbol: 'ADA', nameAr: 'كاردانو', nameEn: 'Cardano', category: 'crypto' },
  { keywords: ['بولكادوت', 'polkadot', 'dot'], symbol: 'DOTUSD', shortSymbol: 'DOT', nameAr: 'بولكادوت', nameEn: 'Polkadot', category: 'crypto' },
  { keywords: ['تشين لينك', 'chainlink', 'link'], symbol: 'LINKUSD', shortSymbol: 'LINK', nameAr: 'تشين لينك', nameEn: 'Chainlink', category: 'crypto' },
  { keywords: ['ماتيك', 'بوليجون', 'polygon', 'matic'], symbol: 'MATICUSD', shortSymbol: 'MATIC', nameAr: 'بوليجون', nameEn: 'Polygon', category: 'crypto' },
  { keywords: ['بيتكوين كاش', 'bitcoin cash', 'bch'], symbol: 'BCHUSD', shortSymbol: 'BCH', nameAr: 'بيتكوين كاش', nameEn: 'Bitcoin Cash', category: 'crypto' },
  { keywords: ['لايتكوين', 'litecoin', 'ltc'], symbol: 'LTCUSD', shortSymbol: 'LTC', nameAr: 'لايتكوين', nameEn: 'Litecoin', category: 'crypto' },
  { keywords: ['أفالانش', 'avalanche', 'avax'], symbol: 'AVAXUSD', shortSymbol: 'AVAX', nameAr: 'أفالانش', nameEn: 'Avalanche', category: 'crypto' },
  // Commodities
  { keywords: ['ذهب', 'الذهب', 'gold', 'oro', 'altın'], symbol: 'XAUUSD', shortSymbol: 'XAU', nameAr: 'الذهب', nameEn: 'Gold', category: 'commodity' },
  { keywords: ['فضة', 'الفضة', 'silver', 'plata', 'gümüş'], symbol: 'XAGUSD', shortSymbol: 'XAG', nameAr: 'الفضة', nameEn: 'Silver', category: 'commodity' },
  { keywords: ['نفط', 'النفط', 'خام', 'oil', 'crude', 'petrol', 'petróleo', 'wti'], symbol: 'CL', shortSymbol: 'WTI', nameAr: 'النفط', nameEn: 'Crude Oil', category: 'commodity' },
  { keywords: ['برنت', 'brent', 'bz'], symbol: 'BZ', shortSymbol: 'BZ', nameAr: 'خام برنت', nameEn: 'Brent Crude', category: 'commodity' },
  { keywords: ['غاز', 'الغاز الطبيعي', 'natural gas', 'natgas', 'ng'], symbol: 'NG', shortSymbol: 'NG', nameAr: 'الغاز الطبيعي', nameEn: 'Natural Gas', category: 'commodity' },
  { keywords: ['نحاس', 'copper', 'cobre'], symbol: 'HG', shortSymbol: 'HG', nameAr: 'النحاس', nameEn: 'Copper', category: 'commodity' },
  { keywords: ['بلاتين', 'platinum', 'platinum'], symbol: 'PL', shortSymbol: 'PL', nameAr: 'البلاتين', nameEn: 'Platinum', category: 'commodity' },
  { keywords: ['بالاديوم', 'palladium', 'palladium'], symbol: 'PA', shortSymbol: 'PA', nameAr: 'البالاديوم', nameEn: 'Palladium', category: 'commodity' },
  { keywords: ['قمح', 'wheat', 'trigo'], symbol: 'ZW', shortSymbol: 'ZW', nameAr: 'القمح', nameEn: 'Wheat', category: 'commodity' },
  { keywords: ['ذرة', 'corn', 'maíz'], symbol: 'ZC', shortSymbol: 'ZC', nameAr: 'الذرة', nameEn: 'Corn', category: 'commodity' },
  { keywords: ['قهوة', 'coffee', 'café'], symbol: 'KC', shortSymbol: 'KC', nameAr: 'القهوة', nameEn: 'Coffee', category: 'commodity' },
  // Forex — majors + crosses + EM
  { keywords: ['يورو', 'eur'], symbol: 'EURUSD', shortSymbol: 'EUR', nameAr: 'اليورو', nameEn: 'Euro', category: 'forex' },
  { keywords: ['جنيه', 'gbp', 'استرليني'], symbol: 'GBPUSD', shortSymbol: 'GBP', nameAr: 'الجنيه الإسترليني', nameEn: 'British Pound', category: 'forex' },
  { keywords: ['ين', 'jpy', 'الين'], symbol: 'USDJPY', shortSymbol: 'JPY', nameAr: 'الين الياباني', nameEn: 'Japanese Yen', category: 'forex' },
  { keywords: ['فرنك', 'chf'], symbol: 'USDCHF', shortSymbol: 'CHF', nameAr: 'الفرنك السويسري', nameEn: 'Swiss Franc', category: 'forex' },
  { keywords: ['دولار أسترالي', 'aud'], symbol: 'AUDUSD', shortSymbol: 'AUD', nameAr: 'الدولار الأسترالي', nameEn: 'Australian Dollar', category: 'forex' },
  { keywords: ['دولار نيوزيلندي', 'nzd'], symbol: 'NZDUSD', shortSymbol: 'NZD', nameAr: 'الدولار النيوزيلندي', nameEn: 'NZ Dollar', category: 'forex' },
  { keywords: ['دولار كندي', 'cad', 'usdcad'], symbol: 'USDCAD', shortSymbol: 'CAD', nameAr: 'الدولار الكندي', nameEn: 'Canadian Dollar', category: 'forex' },
  { keywords: ['ليرة تركية', 'ليرة', 'try', 'turkish lira'], symbol: 'USDTRY', shortSymbol: 'TRY', nameAr: 'الليرة التركية', nameEn: 'Turkish Lira', category: 'forex' },
  { keywords: ['يوان', 'cny', 'yuan', 'renminbi'], symbol: 'USDCNY', shortSymbol: 'CNY', nameAr: 'اليوان الصيني', nameEn: 'Chinese Yuan', category: 'forex' },
  { keywords: ['روبية هندية', 'inr', 'rupee'], symbol: 'USDINR', shortSymbol: 'INR', nameAr: 'الروبية الهندية', nameEn: 'Indian Rupee', category: 'forex' },
  { keywords: ['ريال برازيلي', 'brl', 'real'], symbol: 'USDBRL', shortSymbol: 'BRL', nameAr: 'الريال البرازيلي', nameEn: 'Brazilian Real', category: 'forex' },
  { keywords: ['بيزو مكسيكي', 'mxn', 'peso'], symbol: 'USDMXN', shortSymbol: 'MXN', nameAr: 'البيزو المكسيكي', nameEn: 'Mexican Peso', category: 'forex' },
  { keywords: ['روبل', 'rub', 'ruble'], symbol: 'USDRUB', shortSymbol: 'RUB', nameAr: 'الروبل الروسي', nameEn: 'Russian Ruble', category: 'forex' },
  { keywords: ['راند', 'zar', 'rand'], symbol: 'USDZAR', shortSymbol: 'ZAR', nameAr: 'الراند الجنوب أفريقي', nameEn: 'South African Rand', category: 'forex' },
  { keywords: ['فوركس', 'عملات', 'العملات', 'forex', 'currencies', 'devises', 'döviz', 'divisas'], symbol: 'FOREX_MOVERS', shortSymbol: 'FX', nameAr: 'الفوركس', nameEn: 'Forex', category: 'forex' },
  // Indices — global
  { keywords: ['spx', 's&p', 'اسب 500', 's&p 500'], symbol: 'SPX', shortSymbol: 'SPX', nameAr: 'مؤشر S&P 500', nameEn: 'S&P 500', category: 'index' },
  { keywords: ['nasdaq', 'ndx', 'ناسداك'], symbol: 'NDX', shortSymbol: 'NDX', nameAr: 'ناسداك', nameEn: 'Nasdaq 100', category: 'index' },
  { keywords: ['داو', 'داو جونز', 'dow jones', 'djia', 'dji'], symbol: 'DJI', shortSymbol: 'DJI', nameAr: 'داو جونز', nameEn: 'Dow Jones', category: 'index' },
  { keywords: ['دولار', 'dxy', 'مؤشر الدولار'], symbol: 'DXY', shortSymbol: 'DXY', nameAr: 'مؤشر الدولار', nameEn: 'Dollar Index', category: 'index' },
  { keywords: ['فوتسي', 'ftse', 'ftse 100', 'لندن'], symbol: '^FTSE', shortSymbol: 'FTSE', nameAr: 'مؤشر فوتسي 100', nameEn: 'FTSE 100', category: 'index' },
  { keywords: ['داكس', 'dax', 'ألمانيا'], symbol: '^GDAXI', shortSymbol: 'DAX', nameAr: 'مؤشر داكس', nameEn: 'DAX', category: 'index' },
  { keywords: ['كاك', 'cac', 'باريس'], symbol: '^FCHI', shortSymbol: 'CAC', nameAr: 'مؤشر كاك 40', nameEn: 'CAC 40', category: 'index' },
  { keywords: ['يورو ستوكس', 'euro stoxx', 'stoxx 50'], symbol: '^STOXX50E', shortSymbol: 'STOXX', nameAr: 'يورو ستوكس 50', nameEn: 'Euro Stoxx 50', category: 'index' },
  { keywords: ['نيكي', 'nikkei', 'اليابان'], symbol: '^N225', shortSymbol: 'N225', nameAr: 'مؤشر نيكي 225', nameEn: 'Nikkei 225', category: 'index' },
  { keywords: ['هانغ سنغ', 'hang seng', 'هونغ كونغ'], symbol: '^HSI', shortSymbol: 'HSI', nameAr: 'مؤشر هانغ سنغ', nameEn: 'Hang Seng', category: 'index' },
  { keywords: ['شنغهاي', 'shanghai', 'الصين'], symbol: '000001.SS', shortSymbol: 'SSEC', nameAr: 'مؤشر شنغهاي المركب', nameEn: 'Shanghai Composite', category: 'index' },
  { keywords: ['بومباي', 'bse', 'sensex', 'الهند'], symbol: '^BSESN', shortSymbol: 'SENSEX', nameAr: 'مؤشر سينسيكس', nameEn: 'BSE Sensex', category: 'index' },
  { keywords: ['بوفيبا', 'bovespa', 'البرازيل'], symbol: '^BVSP', shortSymbol: 'BVSP', nameAr: 'مؤشر بوفيبا', nameEn: 'Bovespa', category: 'index' },
  // Popular US stocks — mega cap
  { keywords: ['apple', 'aapl', 'أبل'], symbol: 'AAPL', shortSymbol: 'AAPL', nameAr: 'أبل', nameEn: 'Apple', category: 'stock' },
  { keywords: ['tesla', 'tsla', 'تسلا'], symbol: 'TSLA', shortSymbol: 'TSLA', nameAr: 'تسلا', nameEn: 'Tesla', category: 'stock' },
  { keywords: ['nvidia', 'nvda', 'إنفيديا'], symbol: 'NVDA', shortSymbol: 'NVDA', nameAr: 'إنفيديا', nameEn: 'Nvidia', category: 'stock' },
  { keywords: ['microsoft', 'msft', 'مايكروسوفت'], symbol: 'MSFT', shortSymbol: 'MSFT', nameAr: 'مايكروسوفت', nameEn: 'Microsoft', category: 'stock' },
  { keywords: ['google', 'alphabet', 'googl', 'جوجل'], symbol: 'GOOGL', shortSymbol: 'GOOGL', nameAr: 'جوجل', nameEn: 'Alphabet', category: 'stock' },
  { keywords: ['amazon', 'amzn', 'أمازون'], symbol: 'AMZN', shortSymbol: 'AMZN', nameAr: 'أمازون', nameEn: 'Amazon', category: 'stock' },
  { keywords: ['meta', 'facebook', 'فيسبوك'], symbol: 'META', shortSymbol: 'META', nameAr: 'ميتا', nameEn: 'Meta', category: 'stock' },
  { keywords: ['netflix', 'nflx', 'نتفليكس'], symbol: 'NFLX', shortSymbol: 'NFLX', nameAr: 'نتفليكس', nameEn: 'Netflix', category: 'stock' },
  { keywords: ['amd', 'advanced micro'], symbol: 'AMD', shortSymbol: 'AMD', nameAr: 'AMD', nameEn: 'AMD', category: 'stock' },
  { keywords: ['intel', 'intc', 'إنتل'], symbol: 'INTC', shortSymbol: 'INTC', nameAr: 'إنتل', nameEn: 'Intel', category: 'stock' },
  { keywords: ['jpmorgan', 'jpm', 'جي بي مورجان'], symbol: 'JPM', shortSymbol: 'JPM', nameAr: 'جي بي مورجان', nameEn: 'JPMorgan', category: 'stock' },
  { keywords: ['visa', 'v', 'فيزا'], symbol: 'V', shortSymbol: 'V', nameAr: 'فيزا', nameEn: 'Visa', category: 'stock' },
  { keywords: [' berkshire', 'buffett', 'بركشاير'], symbol: 'BRK.B', shortSymbol: 'BRK', nameAr: 'بركشاير هاثاواي', nameEn: 'Berkshire Hathaway', category: 'stock' },
  { keywords: ['exxon', 'xom', 'إكسون'], symbol: 'XOM', shortSymbol: 'XOM', nameAr: 'إكسون موبيل', nameEn: 'Exxon Mobil', category: 'stock' },
  { keywords: ['johnson', 'jnj', 'جونسون'], symbol: 'JNJ', shortSymbol: 'JNJ', nameAr: 'جونسون آند جونسون', nameEn: 'Johnson & Johnson', category: 'stock' },
  { keywords: ['walmart', 'wmt', 'وول مارت'], symbol: 'WMT', shortSymbol: 'WMT', nameAr: 'وول مارت', nameEn: 'Walmart', category: 'stock' },
  { keywords: ['disney', 'dis', 'ديزني'], symbol: 'DIS', shortSymbol: 'DIS', nameAr: 'ديزني', nameEn: 'Disney', category: 'stock' },
  { keywords: ['coca cola', 'coke', 'كوكا'], symbol: 'KO', shortSymbol: 'KO', nameAr: 'كوكا كولا', nameEn: 'Coca-Cola', category: 'stock' },
  { keywords: ['pepsi', 'pep', 'بيبسي'], symbol: 'PEP', shortSymbol: 'PEP', nameAr: 'بيبسي', nameEn: 'PepsiCo', category: 'stock' },
  { keywords: ['pfizer', 'pfe', 'فايزر'], symbol: 'PFE', shortSymbol: 'PFE', nameAr: 'فايزر', nameEn: 'Pfizer', category: 'stock' },
  { keywords: ['moderna', 'mrna', 'موديرنا'], symbol: 'MRNA', shortSymbol: 'MRNA', nameAr: 'موديرنا', nameEn: 'Moderna', category: 'stock' },
  // ─── Saudi / Tadawul stocks (expanded) ───
  { keywords: ['أرامكو', 'ارامكو', 'aramco', '2222', 'saudi aramco'], symbol: '2222.SR', shortSymbol: '2222.SR', nameAr: 'أرامكو السعودية', nameEn: 'Saudi Aramco', category: 'stock' },
  { keywords: ['الراجحي', 'راجحي', 'al rajhi', '1120'], symbol: '1120.SR', shortSymbol: '1120.SR', nameAr: 'مصرف الراجحي', nameEn: 'Al Rajhi Bank', category: 'stock' },
  { keywords: ['مصرف الإنماء', 'الإنماء', 'inma', '1142'], symbol: '1142.SR', shortSymbol: '1142.SR', nameAr: 'مصرف الإنماء', nameEn: 'Alinma Bank', category: 'stock' },
  { keywords: ['بنك الرياض', 'الرياض', 'riyad bank', '1030'], symbol: '1030.SR', shortSymbol: '1030.SR', nameAr: 'بنك الرياض', nameEn: 'Riyad Bank', category: 'stock' },
  { keywords: ['بنك الأهلي', 'الأهلي', 'ncb', '1180'], symbol: '1180.SR', shortSymbol: '1180.SR', nameAr: 'البنك الأهلي السعودي', nameEn: 'NCB', category: 'stock' },
  { keywords: ['ساب', 'sabb', 'ساب الأهلي', '1210'], symbol: '1210.SR', shortSymbol: '1210.SR', nameAr: 'بنك ساب الأهلي', nameEn: 'SAB First', category: 'stock' },
  { keywords: ['بنك الجزيرة', 'الجزيرة', 'jazira', '1020'], symbol: '1020.SR', shortSymbol: '1020.SR', nameAr: 'بنك الجزيرة', nameEn: 'Aljazira Bank', category: 'stock' },
  { keywords: ['البلاد', 'بنك البلاد', 'bank albilad', '1140'], symbol: '1140.SR', shortSymbol: '1140.SR', nameAr: 'بنك البلاد', nameEn: 'Bank Albilad', category: 'stock' },
  { keywords: ['أسمنت', 'الأسمنت', 'cement', '4005'], symbol: '4005.SR', shortSymbol: '4005.SR', nameAr: 'أسمنت ينبع', nameEn: 'Yanbu Cement', category: 'stock' },
  { keywords: ['سابك', 'sabic', '2010'], symbol: '2010.SR', shortSymbol: '2010.SR', nameAr: 'سابك', nameEn: 'SABIC', category: 'stock' },
  { keywords: ['التصنيع', 'تصنيع', '1300'], symbol: '1300.SR', shortSymbol: '1300.SR', nameAr: 'التصنيع الوطنية', nameEn: 'National Petrochemical', category: 'stock' },
  { keywords: ['المراعي', 'مراعي', 'almarai', '2282'], symbol: '2282.SR', shortSymbol: '2282.SR', nameAr: 'المراعي', nameEn: 'Almarai', category: 'stock' },
  { keywords: ['الاتصالات', 'stc', 'الاتصالات السعودية', '7010'], symbol: '7010.SR', shortSymbol: '7010.SR', nameAr: 'شركة الاتصالات السعودية', nameEn: 'STC', category: 'stock' },
  { keywords: ['كهرباء', 'الكهرباء', 'sec', '5110'], symbol: '5110.SR', shortSymbol: '5110.SR', nameAr: 'الشركة السعودية للكهرباء', nameEn: 'Saudi Electricity', category: 'stock' },
  { keywords: ['معادن', 'maaden', '1211'], symbol: '1211.SR', shortSymbol: '1211.SR', nameAr: 'معادن', nameEn: 'Maaden', category: 'stock' },
  { keywords: ['الراجحي للتأمين', 'tawuniya', 'التعاونية', '8010'], symbol: '8010.SR', shortSymbol: '8010.SR', nameAr: 'شركة التعاونية للتأمين', nameEn: 'Tawuniya', category: 'stock' },
  { keywords: ['الدوائية', 'دواء', 'spimaco', '4260'], symbol: '4260.SR', shortSymbol: '4260.SR', nameAr: 'الشركة السعودية للصناعات الدوائية', nameEn: 'SPIMACO', category: 'stock' },
  // ─── UAE stocks ───
  { keywords: ['fab', 'البنك الأول', 'first abu dhabi', 'أبوظبي الأول'], symbol: 'FAB.AD', shortSymbol: 'FAB', nameAr: 'البنك الأول أبوظبي', nameEn: 'First Abu Dhabi Bank', category: 'stock' },
  { keywords: ['emaar', 'إعمار', 'إعمار العقارية'], symbol: 'EMAAR.AD', shortSymbol: 'EMAAR', nameAr: 'إعمار العقارية', nameEn: 'Emaar Properties', category: 'stock' },
  { keywords: ['dp world', 'موانئ دبي', 'dpw'], symbol: 'DPWORLD.AD', shortSymbol: 'DPW', nameAr: 'موانئ دبي العالمية', nameEn: 'DP World', category: 'stock' },
  { keywords: ['etisalat', 'اتصالات', 'اتصالات الإمارات'], symbol: 'ETISALAT.AD', shortSymbol: 'ETI', nameAr: 'اتصالات الإمارات', nameEn: 'Etisalat', category: 'stock' },
  { keywords: ['adnoc', 'أدنوك', 'adnoc distribution'], symbol: 'ADNOC.AD', shortSymbol: 'ADNOC', nameAr: 'أدنوك للتوزيع', nameEn: 'ADNOC Distribution', category: 'stock' },
  { keywords: ['emaar malls', 'إعمار مولز'], symbol: 'EMAARMALLS.AD', shortSymbol: 'EMALLS', nameAr: 'إعمار مولز', nameEn: 'Emaar Malls', category: 'stock' },
  { keywords: ['aldar', 'ألدار', 'الدار'], symbol: 'ALDAR.AD', shortSymbol: 'ALDAR', nameAr: 'ألدار العقارية', nameEn: 'Aldar Properties', category: 'stock' },
  // ─── Egypt stocks (EGX) ───
  { keywords: ['cib', 'البنك التجاري الدولي', 'commercial international'], symbol: 'COMI.CA', shortSymbol: 'COMI', nameAr: 'البنك التجاري الدولي', nameEn: 'Commercial International Bank', category: 'stock' },
  { keywords: ['nbe', 'البنك الأهلي المصري', 'national bank egypt'], symbol: 'NBE.CA', shortSymbol: 'NBE', nameAr: 'البنك الأهلي المصري', nameEn: 'National Bank of Egypt', category: 'stock' },
  { keywords: ['orascem', 'أوراسكوم', 'oracom cement'], symbol: 'ORCE.CA', shortSymbol: 'ORCE', nameAr: 'أوراسكوم للأسمنت', nameEn: 'Orascom Cement', category: 'stock' },
  { keywords: ['east deli', 'الشرق للدخان', 'eastern company'], symbol: 'EAST.CA', shortSymbol: 'EAST', nameAr: 'الشرق للدخان', nameEn: 'Eastern Company', category: 'stock' },
  { keywords: ['tmgholding', 'tmg', 'طلعت مصطفى'], symbol: 'TMGH.CA', shortSymbol: 'TMG', nameAr: 'طلعت مصطفى', nameEn: 'TMG Holding', category: 'stock' },
  { keywords: ['qalaa', 'القاععة', 'qalaa holdings'], symbol: 'CCAP.CA', shortSymbol: 'CCAP', nameAr: 'القاعئة القابضة', nameEn: 'Qalaa Holdings', category: 'stock' },
  // ─── Turkey stocks (BIST) ───
  { keywords: ['garanti', 'garanti bbva', 'garanti bank'], symbol: 'GARAN.IS', shortSymbol: 'GARAN', nameAr: 'بنك غارانتي', nameEn: 'Garanti BBVA', category: 'stock' },
  { keywords: ['thy', 'turkish airlines', 'الخطوط التركية', 'هاف يول'], symbol: 'THYAO.IS', shortSymbol: 'THYAO', nameAr: 'الخطوط الجوية التركية', nameEn: 'Turkish Airlines', category: 'stock' },
  { keywords: ['bim', 'bim stores', 'بي إم'], symbol: 'BIMAS.IS', shortSymbol: 'BIMAS', nameAr: 'BIM للمتاجر', nameEn: 'BIM Stores', category: 'stock' },
  { keywords: ['erdo', 'erdoğan', 'erdemir'], symbol: 'ERDEM.IS', shortSymbol: 'ERDEM', nameAr: 'أردمير', nameEn: 'Erdemir', category: 'stock' },
  { keywords: ['akbank', 'akbank', 'بنك أك'], symbol: 'AKBNK.IS', shortSymbol: 'AKBNK', nameAr: 'أكبنك', nameEn: 'Akbank', category: 'stock' },
  { keywords: ['koc', 'koç holding', 'قوج'], symbol: 'KCHOL.IS', shortSymbol: 'KCHOL', nameAr: 'قوج القابضة', nameEn: 'Koç Holding', category: 'stock' },
  { keywords: ['sabanci', 'sabancı', 'صبانجي'], symbol: 'SAHOL.IS', shortSymbol: 'SAHOL', nameAr: 'صبانجي القابضة', nameEn: 'Sabanci Holding', category: 'stock' },
  { keywords: ['aselsan', 'أسلسان', 'aselsan'], symbol: 'ASELS.IS', shortSymbol: 'ASELS', nameAr: 'أسلسان', nameEn: 'Aselsan', category: 'stock' },
  // ─── China stocks (HK + ADRs) ───
  { keywords: ['alibaba', 'بابا', 'baba', 'علي بابا'], symbol: 'BABA', shortSymbol: 'BABA', nameAr: 'أليبابا', nameEn: 'Alibaba', category: 'stock' },
  { keywords: ['tencent', 'تينسنت', '0700.hk'], symbol: '0700.HK', shortSymbol: '0700', nameAr: 'تينسنت', nameEn: 'Tencent', category: 'stock' },
  { keywords: ['jd.com', 'jd', 'جي دي'], symbol: 'JD', shortSymbol: 'JD', nameAr: 'JD.com', nameEn: 'JD.com', category: 'stock' },
  { keywords: ['baidu', 'بايدو', 'bidu'], symbol: 'BIDU', shortSymbol: 'BIDU', nameAr: 'بايدو', nameEn: 'Baidu', category: 'stock' },
  { keywords: ['byd', 'بي واي دي', 'byd company'], symbol: '1211.HK', shortSymbol: 'BYD', nameAr: 'BYD', nameEn: 'BYD Company', category: 'stock' },
  { keywords: ['nio', 'نيو', 'nio inc'], symbol: 'NIO', shortSymbol: 'NIO', nameAr: 'NIO', nameEn: 'NIO Inc', category: 'stock' },
  { keywords: ['xpev', 'xpeng', 'شياو بنغ'], symbol: 'XPEV', shortSymbol: 'XPEV', nameAr: 'XPeng', nameEn: 'XPeng', category: 'stock' },
  { keywords: ['li auto', 'lixiang', 'لي أوتو'], symbol: 'LI', shortSymbol: 'LI', nameAr: 'لي أوتو', nameEn: 'Li Auto', category: 'stock' },
  { keywords: ['pdd', 'pinduoduo', 'بيندودو'], symbol: 'PDD', shortSymbol: 'PDD', nameAr: 'بيندودو', nameEn: 'Pinduoduo', category: 'stock' },
  { keywords: ['netease', 'نتي إيزي', 'ntes'], symbol: 'NTES', shortSymbol: 'NTES', nameAr: 'نتي إيزي', nameEn: 'NetEase', category: 'stock' },
  { keywords: ['weibo', 'ويبو', 'wb'], symbol: 'WB', shortSymbol: 'WB', nameAr: 'ويبو', nameEn: 'Weibo', category: 'stock' },
  // ─── Japan stocks (TSE) ───
  { keywords: ['toyota', 'تويوتا', '7203.t'], symbol: '7203.T', shortSymbol: '7203', nameAr: 'تويوتا', nameEn: 'Toyota', category: 'stock' },
  { keywords: ['sony', 'سوني', '6758.t'], symbol: '6758.T', shortSymbol: '6758', nameAr: 'سوني', nameEn: 'Sony', category: 'stock' },
  { keywords: ['nintendo', 'نينتندو', '7974.t'], symbol: '7974.T', shortSymbol: '7974', nameAr: 'نينتندو', nameEn: 'Nintendo', category: 'stock' },
  { keywords: ['honda', 'هوندا', '7267.t'], symbol: '7267.T', shortSymbol: '7267', nameAr: 'هوندا', nameEn: 'Honda', category: 'stock' },
  { keywords: ['softbank', 'softbank group', 'سوفت بنك'], symbol: '9984.T', shortSymbol: '9984', nameAr: 'سوفت بنك', nameEn: 'SoftBank Group', category: 'stock' },
  { keywords: ['panasonic', 'باناسونيك', '6752.t'], symbol: '6752.T', shortSymbol: '6752', nameAr: 'باناسونيك', nameEn: 'Panasonic', category: 'stock' },
  { keywords: ['mitsubishi', 'ميتسوبيشي', '8058.t'], symbol: '8058.T', shortSymbol: '8058', nameAr: 'ميتسوبيشي', nameEn: 'Mitsubishi', category: 'stock' },
  { keywords: ['keyence', 'كينس', '6861.t'], symbol: '6861.T', shortSymbol: '6861', nameAr: 'كينس', nameEn: 'Keyence', category: 'stock' },
  // ─── Europe stocks ───
  { keywords: ['sap', 'ساب', 'sap se'], symbol: 'SAP.DE', shortSymbol: 'SAP', nameAr: 'SAP', nameEn: 'SAP SE', category: 'stock' },
  { keywords: ['lvmh', 'لوي فيتون', 'مويت هينيسي'], symbol: 'MC.PA', shortSymbol: 'MC', nameAr: 'LVMH', nameEn: 'LVMH', category: 'stock' },
  { keywords: ['nestle', 'نيستلي', 'nesn'], symbol: 'NESN.SW', shortSymbol: 'NESN', nameAr: 'نيستلي', nameEn: 'Nestlé', category: 'stock' },
  { keywords: ['asml', 'أزم ', 'asml holding'], symbol: 'ASML.AS', shortSymbol: 'ASML', nameAr: 'ASML', nameEn: 'ASML Holding', category: 'stock' },
  { keywords: ['shell', 'شل', 'royal dutch shell'], symbol: 'SHEL.L', shortSymbol: 'SHEL', nameAr: 'شل', nameEn: 'Shell', category: 'stock' },
  { keywords: ['bp', 'بي بي', 'british petroleum'], symbol: 'BP.L', shortSymbol: 'BP', nameAr: 'BP', nameEn: 'BP', category: 'stock' },
  { keywords: ['unilever', 'يونيليفر', 'ul'], symbol: 'ULVR.L', shortSymbol: 'ULVR', nameAr: 'يونيليفر', nameEn: 'Unilever', category: 'stock' },
  { keywords: ['siemens', 'سيمنز', 'sie'], symbol: 'SIE.DE', shortSymbol: 'SIE', nameAr: 'سيمنز', nameEn: 'Siemens', category: 'stock' },
  { keywords: ['total', 'توتال', 'totalenergies'], symbol: 'TTE.PA', shortSymbol: 'TTE', nameAr: 'توتال', nameEn: 'TotalEnergies', category: 'stock' },
  { keywords: ['novo nordisk', 'نوفو نورديسك', 'nvo'], symbol: 'NVO', shortSymbol: 'NVO', nameAr: 'نوفو نورديسك', nameEn: 'Novo Nordisk', category: 'stock' },
  { keywords: ['roche', 'روش', 'rog'], symbol: 'ROG.SW', shortSymbol: 'ROG', nameAr: 'روش', nameEn: 'Roche', category: 'stock' },
  { keywords: ['novartis', 'نوفارتس', 'novn'], symbol: 'NOVN.SW', shortSymbol: 'NOVN', nameAr: 'نوفارتس', nameEn: 'Novartis', category: 'stock' },
  { keywords: ['airbus', 'إيرباص', 'air'], symbol: 'AIR.PA', shortSymbol: 'AIR', nameAr: 'إيرباص', nameEn: 'Airbus', category: 'stock' },
  // ─── India stocks (NSE) ───
  { keywords: ['reliance', 'ريلاينس', 'ريلانس'], symbol: 'RELIANCE.NS', shortSymbol: 'RELIANCE', nameAr: 'ريلاينس', nameEn: 'Reliance Industries', category: 'stock' },
  { keywords: ['tata', 'تاتا', 'tata motors'], symbol: 'TATAMOTORS.NS', shortSymbol: 'TATAM', nameAr: 'تاتا موتورز', nameEn: 'Tata Motors', category: 'stock' },
  { keywords: ['infosys', 'إنفوسيس', 'info'], symbol: 'INFY.NS', shortSymbol: 'INFY', nameAr: 'إنفوسيس', nameEn: 'Infosys', category: 'stock' },
  { keywords: ['tcs', 'tata consultancy', 'تاتا للخدمات'], symbol: 'TCS.NS', shortSymbol: 'TCS', nameAr: 'TCS', nameEn: 'Tata Consultancy', category: 'stock' },
  { keywords: ['hdfc', 'hdfc bank', 'إتش دي إف سي'], symbol: 'HDFCBANK.NS', shortSymbol: 'HDFC', nameAr: 'HDFC بنك', nameEn: 'HDFC Bank', category: 'stock' },
  // ─── Russia / Brazil (ADR & local) ───
  { keywords: ['gazprom', 'غازبروم'], symbol: 'GAZP.ME', shortSymbol: 'GAZP', nameAr: 'غازبروم', nameEn: 'Gazprom', category: 'stock' },
  { keywords: ['sberbank russia', 'سبربنك', 'sber'], symbol: 'SBER.ME', shortSymbol: 'SBER', nameAr: 'سبربنك', nameEn: 'Sberbank', category: 'stock' },
  { keywords: ['petrobras', 'بتروبراس', 'petr'], symbol: 'PBR', shortSymbol: 'PBR', nameAr: 'بتروبراس', nameEn: 'Petrobras', category: 'stock' },
  { keywords: ['vale', 'فالي', 'miner'], symbol: 'VALE', shortSymbol: 'VALE', nameAr: 'فالي', nameEn: 'Vale', category: 'stock' },
  // ─── Other global / mining / ETFs ───
  { keywords: ['newmont', 'نيومونت', 'nem'], symbol: 'NEM', shortSymbol: 'NEM', nameAr: 'نيومونت', nameEn: 'Newmont', category: 'stock' },
  { keywords: ['barrick', 'باريك', 'gold'], symbol: 'GOLD', shortSymbol: 'GOLD', nameAr: 'باريك جولد', nameEn: 'Barrick Gold', category: 'stock' },
  { keywords: ['spdr gold', 'gld', 'gold etf'], symbol: 'GLD', shortSymbol: 'GLD', nameAr: 'GLD ETF', nameEn: 'SPDR Gold', category: 'stock' },
  // ─── Saudi market index ───
  { keywords: ['تاسي', 'تداول', 'tadawul', 'tasi', 'السوق السعودي', 'السوق السعوديه', 'مؤشر تداول'], symbol: 'TASI', shortSymbol: 'TASI', nameAr: 'مؤشر تاسي', nameEn: 'Tadawul All Share Index', category: 'index' },
];

// Regex patterns for direct symbol detection (catches BTC, ETH, EURUSD, etc.)
// V800: Added Saudi stock .SR symbols and TASI
// V1014: Expanded to cover global markets — UAE (.AD), Turkey (.IS), Japan (.T),
// China (.HK), Europe (.DE/.PA/.AS/.L/.SW), India (.NS), Egypt (.CA), Russia (.ME),
// plus major ADRs and ETFs. This enables the assistant to detect assets from
// 10+ global markets by their ticker symbols alone, without relying on keyword
// matching alone.
const SYMBOL_REGEX = /\b(BTC|BTCUSD|ETH|ETHUSD|XAU|XAUUSD|XAG|XAGUSD|SOL|DOGE|XRP|ADA|DOT|LINK|MATIC|BCH|LTC|AVAX|EURUSD|GBPUSD|USDJPY|USDCHF|AUDUSD|NZDUSD|USDCAD|USDTRY|USDCNY|USDINR|USDBRL|USDMXN|USDRUB|USDZAR|EURGBP|EURJPY|GBPJPY|WTI|CL|BRENT|BZ|NG|HG|PL|PA|ZW|ZC|KC|AAPL|MSFT|GOOGL|AMZN|TSLA|NVDA|META|NFLX|AMD|INTC|JPM|BRK\.B|XOM|JNJ|WMT|DIS|KO|PEP|PFE|MRNA|BABA|JD|BIDU|NIO|XPEV|LI|PDD|NTES|WB|NVO|NEM|GOLD|GLD|PBR|VALE|SPX|NDX|DJI|DXY|TASI|\d{4}\.SR|\d{4}\.HK|FAB\.AD|EMAAR\.AD|DPWORLD\.AD|ETISALAT\.AD|ADNOC\.AD|ALDAR\.AD|COMI\.CA|GARAN\.IS|THYAO\.IS|BIMAS\.IS|AKBNK\.IS|KCHOL\.IS|SAHOL\.IS|ASELS\.IS|RELIANCE\.NS|TATAMOTORS\.NS|INFY\.NS|TCS\.NS|HDFCBANK\.NS|GAZP\.ME|SBER\.ME|7203\.T|6758\.T|7974\.T|7267\.T|9984\.T|6752\.T|8058\.T|6861\.T|SAP\.DE|SIE\.DE|MC\.PA|TTE\.PA|AIR\.PA|ASML\.AS|SHEL\.L|BP\.L|ULVR\.L|NESN\.SW|ROG\.SW|NOVN\.SW)\b/i;

// Forex pair patterns like EUR/USD, GBP/USD
const FOREX_PAIR_REGEX = /\b(EUR|GBP|USD|JPY|CHF|AUD|NZD|CAD)\s*[\/]\s*(EUR|GBP|USD|JPY|CHF|AUD|NZD|CAD)\b/i;

const FOREX_PAIR_COMBINED: Record<string, string> = {
  'EURUSD': 'EURUSD', 'GBPUSD': 'GBPUSD', 'USDJPY': 'USDJPY',
  'USDCHF': 'USDCHF', 'AUDUSD': 'AUDUSD', 'NZDUSD': 'NZDUSD',
  'USDCAD': 'USDCAD', 'EURGBP': 'EURGBP', 'EURJPY': 'EURJPY',
  'GBPJPY': 'GBPJPY', 'EURAUD': 'EURAUD', 'GBPAUD': 'GBPAUD',
  'EURCHF': 'EURCHF', 'GBPCHF': 'GBPCHF',
};

// ─── Intent Rule Definitions ─────────────────────────────────────

const INTENT_RULES: Array<{
  intent: IntentType;
  keywords: string[];
  regexes: RegExp[];
  dataNeeds: Partial<DataNeeds>;
  requiresAI: boolean;
}> = [
  {
    intent: 'price_query',
    keywords: ['سعر', 'أسعار', 'كم', 'بكم', 'كم سعر', 'تحرك', 'صعد', 'نزل', 'ارتفع', 'انخفض', 'price', 'how much', 'quote', 'كم يساوي', 'قيمة', 'شو سعر', 'قد ايش', 'كثير', 'كم وصل', 'شو صار مع', 'وصل كم'],
    regexes: [
      /\b(price|quote|سعر|أسعار|كم\s+(سعر)?|بكم)\b/i,
      /(صعد|نزل|ارتفع|انخفض|تحرك).*(ب|ال)?(بتكوين|ذهب|نفط|إيثريوم|يورو|دولار)/i,
    ],
    dataNeeds: { prices: true, signals: false, analysis: false, news: true, reports: false, marketPulse: false, crossReference: true, knowledgeSearch: true, userProfile: false },
    requiresAI: false, // We can format price data directly
  },
  {
    intent: 'signal_query',
    // V800: Removed 'توصية' and 'توصيات' — these now go to 'recommendation' intent
    // Signal query is ONLY for trading signal lists (إشارة/إشارات), not advice
    keywords: ['إشارة', 'إشارات', 'شراء', 'بيع', 'هدف', 'وقف', 'signal', 'signals', 'buy', 'sell', 'صفقة'],
    regexes: [
      /\b(إشارة|إشارات|signal|signals)\b/i,
      /(هل|ما|أعطني|أريد).*(إشارة|صفقة)/i,
    ],
    dataNeeds: { prices: true, signals: true, analysis: true, news: false, reports: false, marketPulse: true, crossReference: false, knowledgeSearch: false, userProfile: true },
    requiresAI: true, // V800: Signal queries need AI to filter/synthesize relevant signals
  },
  {
    intent: 'analysis_query',
    keywords: ['تحليل', 'فني', 'أساسي', 'مؤشرات', 'RSI', 'MACD', 'فيبوناتشي', 'دعم', 'مقاومة', 'اتجاه', 'analysis', 'technical', 'fundamental', 'support', 'resistance', 'trend', 'حلل', 'تحليلي'],
    regexes: [
      /\b(تحليل|فني|أساسي|RSI|MACD|فيبوناتشي|دعم|مقاومة|اتجاه|analysis|technical|fundamental)\b/i,
      /(حلل|تحليلي|analyze).*/i,
    ],
    dataNeeds: { prices: true, signals: true, analysis: true, news: true, reports: false, marketPulse: false, crossReference: true, knowledgeSearch: true, userProfile: false },
    requiresAI: true, // Analysis needs AI to synthesize findings
  },
  {
    intent: 'news_query',
    keywords: ['أخبار', 'خبر', 'حدث', 'news', 'latest', 'آخر', 'اليوم', 'عاجل', 'breaking', 'شو صار', 'شو الجديد', 'في شي جديد', 'آخر أخبار'],
    regexes: [
      /\b(أخبار|خبر|حدث|news|عاجل|breaking)\b/i,
      /(آخر|اليوم).*(أخبار|خبر|حدث)/i,
    ],
    dataNeeds: { prices: true, signals: false, analysis: false, news: true, reports: false, marketPulse: true, crossReference: true, knowledgeSearch: true, userProfile: false },
    requiresAI: true, // V700: News ALWAYS needs AI to synthesize in user's language and filter relevance
  },
  {
    intent: 'report_query',
    keywords: ['تقارير', 'تقرير', 'reports', 'report', 'استراتيجي', 'اقتصادي'],
    regexes: [
      /\b(تقارير|تقرير|reports?|استراتيجي|اقتصادي)\b/i,
    ],
    dataNeeds: { prices: false, signals: false, analysis: false, news: false, reports: true, marketPulse: false, crossReference: false, knowledgeSearch: true, userProfile: false },
    requiresAI: false, // Reports can be formatted directly from DB
  },
  {
    intent: 'recommendation',
    // V800: Added 'توصية', 'توصيات', 'أعطني توصية', 'سهم' — these are recommendation/advice requests
    keywords: ['رأيك', 'شو تعتقد', 'هل أشتري', 'ماذا تنصح', 'نصيحة', 'أقترح', 'advise', 'should i', 'recommend', 'opinion', 'اشتري ولا أبيع', 'أبيع ولا أنتظر', 'شو تنصحني', 'خلي ولا أبيع', 'أشتري بس', 'توصية', 'توصيات', 'سهم', 'أسهم', 'أعطني توصية', 'اقترح سهم', 'أفضل سهم', 'وش تنصحني', 'وش أفضل سهم'],
    regexes: [
      /(رأيك|شو تعتقد|هل أشتري|ماذا تنصح|نصيحة|should i|recommend|opinion)/i,
      /(توصية|توصيات|أعطني توصية|اقترح سهم|أفضل سهم)/i,
      /(سهم|أسهم).*(سعودي|تداول|تاسي|السعودية)/i,
      /(أعطني|أريد|عطني|وش|ايش).*(توصية|توصيات|سهم|أسهم|نصيحة)/i,
    ],
    dataNeeds: { prices: true, signals: true, analysis: true, news: true, reports: false, marketPulse: true, crossReference: true, knowledgeSearch: true, userProfile: true },
    requiresAI: true, // Recommendations ALWAYS need AI synthesis
  },
  {
    intent: 'market_overview',
    keywords: ['السوق', 'كيف السوق', 'وضع السوق', 'ملخص', 'overview', 'market', 'حالة السوق', 'نبض', 'pulse', 'كيف شكل', 'شو وضع', 'كيف الأوضاع', 'شو الأخبار', 'كيف الوضع'],
    regexes: [
      /(السوق|كيف السوق|وضع السوق|ملخص|overview|market|حالة|نبض|pulse)/i,
    ],
    dataNeeds: { prices: true, signals: true, analysis: false, news: true, reports: false, marketPulse: true, crossReference: false, knowledgeSearch: false, userProfile: false },
    requiresAI: true, // Overview needs AI to synthesize
  },
  {
    intent: 'education',
    keywords: ['ما هو', 'ما هي', 'شرح', 'كيف يعمل', 'تعريف', 'what is', 'explain', 'how does', 'define', 'مفهوم', 'معنى'],
    regexes: [
      /(ما هو|ما هي|شرح|كيف يعمل|تعريف|what is|explain|how does|define|مفهوم|معنى)/i,
    ],
    dataNeeds: { prices: false, signals: false, analysis: false, news: false, reports: false, marketPulse: false, crossReference: false, knowledgeSearch: true, userProfile: false },
    requiresAI: true, // Education needs AI, but with DB context
  },
  // V1013 — new intent rules for the "living assistant" rewrite.
  // These MUST come AFTER 'education' (which has stronger "ما هو" matching)
  // and AFTER 'recommendation' (which has "رأيك" matching) so the more
  // specific financial intents win when applicable.
  {
    intent: 'chat',
    // Greetings, thanks, small-talk. Keep keywords broad — we want to catch
    // "مرحبًا", "أهلًا", "شكرًا", "كيف حالك", "hi", "hello", "thanks", etc.
    // These should NOT trigger DB data fetches (no prices/news/signals).
    keywords: [
      'مرحبًا', 'مرحبا', 'أهلًا', 'أهلا', 'اهلا', 'السلام', 'سلام', 'هلا',
      'شكرًا', 'شكرا', 'مشكور', 'ممتاز', 'رائع', 'جيد', 'جيد جدًا',
      'كيف حالك', 'كيفك', 'كيف الحال', 'اخبارك', 'كيفك اليوم',
      'hi', 'hello', 'hey', 'thanks', 'thank you', 'great', 'good', 'ok', 'okay',
      'bonjour', 'salut', 'merci', 'hola', 'gracias', 'merhaba', 'selam',
    ],
    regexes: [
      /^(مرحبًا|مرحبا|أهلًا|أهلا|اهلا|السلام\s+عليكم|سلام\s+عليكم|سلام|هلا|hi|hello|hey|bonjour|salut|hola|merhaba|selam)\b/i,
      /^(شكرًا|شكرا|مشكور|thanks|thank you|merci|gracias)\b/i,
      /^(كيف حالك|كيفك|كيف الحال|اخبارك|how are you|comment allez-vous|cómo estás|nasılsın)\b/i,
      /^(ممتاز|رائع|جيد|great|good|excellent|perfect)\s*$/i,
    ],
    dataNeeds: { prices: false, signals: false, analysis: false, news: false, reports: false, marketPulse: false, crossReference: false, knowledgeSearch: false, userProfile: false },
    requiresAI: true, // Still need AI for a warm conversational reply
  },
  {
    intent: 'comparison',
    // "قارن بين X و Y", "الفرق بين", "compare X vs Y", "أيهما أفضل"
    // Note: must NOT trigger when only one asset is mentioned — comparison
    // requires TWO entities. The regex enforces a separator (و، or، vs، —).
    keywords: ['قارن', 'قارن بين', 'الفرق بين', 'مقارنة', 'أيهما', 'أفضل', 'compare', 'difference', 'vs', 'versus', 'par rapport'],
    regexes: [
      /(قارن|مقارنة|الفرق بين|أيهما أفضل|compare|comparison|difference between)\b/i,
      /\b(vs|versus|أو|او|أم)\b/i, // X vs Y, X أو Y
    ],
    dataNeeds: { prices: true, signals: true, analysis: true, news: true, reports: false, marketPulse: false, crossReference: true, knowledgeSearch: true, userProfile: false },
    requiresAI: true, // Comparison needs AI to synthesize the differences
  },
  {
    intent: 'opinion',
    // "ما رأيك في", "هل تعتقد", "what do you think about"
    // Note: 'recommendation' (already defined above) catches "رأيك" + buy/sell
    // phrases. This 'opinion' intent catches the BROADER "ما رأيك في X" where
    // X is a concept/news/idea, not necessarily a buy/sell decision.
    keywords: ['ما رأيك في', 'ما رأيك', 'هل تعتقد', 'هل تظن', 'هل ترى', 'what do you think', 'do you think', 'your opinion on', 'que penses-tu'],
    regexes: [
      /(ما رأيك|هل تعتقد|هل تظن|هل ترى|what do you think|do you think|your opinion|que penses-tu|qu'en penses-tu)\b/i,
    ],
    dataNeeds: { prices: true, signals: false, analysis: false, news: true, reports: false, marketPulse: true, crossReference: false, knowledgeSearch: true, userProfile: false },
    requiresAI: true, // Opinion needs AI to weigh the context
  },
  {
    intent: 'follow_up',
    // Very short follow-up questions that depend on the previous turn.
    // Examples: "وماذا بعد؟", "لماذا؟", "كيف؟", "مثلاً؟", "and then?", "why?"
    // These should NOT trigger DB fetches — they reuse previous context.
    keywords: ['وماذا', 'وماذا بعد', 'لماذا', 'كيف ذلك', 'كيف', 'مثلا', 'مثال', 'أكثر', 'تفصيل', 'توضيح', 'and then', 'why', 'how', 'example', 'more'],
    regexes: [
      /^(وماذا|وماذا بعد|لماذا|كيف ذلك|كيف|مثلا|مثال|أكثر|تفصيل|توضيح|عرفني أكثر|and then|why|how so|example|more detail|tell me more)\s*\??$/i,
    ],
    dataNeeds: { prices: false, signals: false, analysis: false, news: false, reports: false, marketPulse: false, crossReference: false, knowledgeSearch: false, userProfile: false },
    requiresAI: true, // Follow-ups need AI + conversation history (no fresh DB fetch)
  },
];

// ─── Main Classification Function ────────────────────────────────

export function classifyIntent(message: string, locale: Locale = 'ar'): IntentClassification {
  const msgLower = message.toLowerCase().trim();
  
  // Step 1: Detect assets mentioned in the query
  const assets = detectAssets(message, msgLower);
  
  // Step 2: Match intent rules
  let bestMatch: { intent: IntentType; score: number; dataNeeds: DataNeeds; requiresAI: boolean } | null = null;
  
  for (const rule of INTENT_RULES) {
    let score = 0;
    
    // Keyword matching
    for (const keyword of rule.keywords) {
      if (msgLower.includes(keyword.toLowerCase())) {
        score += 2; // Direct keyword match = strong signal
      }
    }
    
    // Regex matching
    for (const regex of rule.regexes) {
      if (regex.test(msgLower)) {
        score += 3; // Regex match = very strong signal
      }
    }
    
    // Boost score if assets are detected and the intent typically involves assets
    if (assets.length > 0 && ['price_query', 'analysis_query', 'signal_query', 'recommendation'].includes(rule.intent)) {
      score += 1;
    }
    
    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      // Build full DataNeeds from partial
      const fullDataNeeds: DataNeeds = {
        prices: rule.dataNeeds.prices ?? false,
        signals: rule.dataNeeds.signals ?? false,
        analysis: rule.dataNeeds.analysis ?? false,
        news: rule.dataNeeds.news ?? false,
        reports: rule.dataNeeds.reports ?? false,
        marketPulse: rule.dataNeeds.marketPulse ?? false,
        crossReference: rule.dataNeeds.crossReference ?? false,
        knowledgeSearch: rule.dataNeeds.knowledgeSearch ?? false,
        userProfile: rule.dataNeeds.userProfile ?? false,
      };
      
      bestMatch = {
        intent: rule.intent,
        score,
        dataNeeds: fullDataNeeds,
        requiresAI: rule.requiresAI,
      };
    }
  }
  
  // Step 3: If no intent matched, use 'general' with broad data needs
  if (!bestMatch) {
    // If we detected assets, it's likely a price/analysis query
    if (assets.length > 0) {
      bestMatch = {
        intent: 'price_query',
        score: 1,
        dataNeeds: {
          prices: true,
          signals: true,
          analysis: true,
          news: true,
          reports: false,
          marketPulse: false,
          crossReference: true,
          knowledgeSearch: true,
          userProfile: false,
        },
        requiresAI: true, // Unknown query + assets = needs AI to understand what user wants
      };
    } else {
      bestMatch = {
        intent: 'general',
        score: 0,
        dataNeeds: {
          prices: true,  // Always fetch prices — cheap and useful
          signals: false,
          analysis: false,
          news: true,
          reports: false,
          marketPulse: true,
          crossReference: false,
          knowledgeSearch: true,
          userProfile: false,
        },
        requiresAI: true, // General queries always need AI
      };
    }
  }
  
  // Step 3.5: V700 — Detect analysis modifiers that override the base intent
  // Keywords like "تأثير" (impact), "على السعر" (on price), "تحليل" (analysis)
  // should force requiresAI=true and upgrade the intent to analysis-like
  const ANALYSIS_MODIFIERS = /(?:تأثير|تأثيرها|impact|effect|على السعر|on price|تحليل|analyze|what does this mean|ماذا يعني|كيف يؤثر)/i;
  const hasAnalysisModifier = ANALYSIS_MODIFIERS.test(msgLower);
  if (hasAnalysisModifier && bestMatch.intent === 'news_query') {
    // User asked about news BUT wants analysis of impact → upgrade to analysis_query
    bestMatch.intent = 'analysis_query';
    bestMatch.requiresAI = true;
    bestMatch.dataNeeds.prices = true;
    bestMatch.dataNeeds.analysis = true;
    bestMatch.dataNeeds.crossReference = true;
  }
  
  // V700: If the query mentions "تأثير" or "impact" with any asset, always require AI
  if (hasAnalysisModifier) {
    bestMatch.requiresAI = true;
  }
  
  // Step 4: If assets were detected, ensure prices and crossReference are enabled
  if (assets.length > 0) {
    bestMatch.dataNeeds.prices = true;
    bestMatch.dataNeeds.crossReference = true;
  }
  
  return {
    intent: bestMatch.intent,
    confidence: Math.min(bestMatch.score / 5, 1), // Normalize to 0-1
    assets,
    dataNeeds: bestMatch.dataNeeds,
    requiresAI: bestMatch.requiresAI,
    originalQuery: message,
  };
}

// ─── Asset Detection ─────────────────────────────────────────────

function detectAssets(message: string, msgLower: string): DetectedAsset[] {
  const assets: DetectedAsset[] = [];
  const seen = new Set<string>();
  
  // 1. Check forex pair patterns (EUR/USD, GBPUSD, etc.)
  const forexPairMatch = message.match(FOREX_PAIR_REGEX);
  if (forexPairMatch) {
    const base = forexPairMatch[1].toUpperCase();
    const quote = forexPairMatch[2].toUpperCase();
    const pair = `${base}${quote}`;
    if (FOREX_PAIR_COMBINED[pair] && !seen.has(pair)) {
      seen.add(pair);
      assets.push({
        symbol: pair,
        shortSymbol: base,
        nameAr: getForexPairNameAr(pair),
        nameEn: pair,
        category: 'forex',
      });
    }
  }
  
  // 2. Check combined forex pair patterns in message (e.g., "EURUSD")
  const combinedForexMatch = message.match(/\b(EURUSD|GBPUSD|USDJPY|USDCHF|AUDUSD|NZDUSD|USDCAD|EURGBP|EURJPY|GBPJPY)\b/i);
  if (combinedForexMatch && !seen.has(combinedForexMatch[1].toUpperCase())) {
    const pair = combinedForexMatch[1].toUpperCase();
    seen.add(pair);
    assets.push({
      symbol: pair,
      shortSymbol: pair.slice(0, 3),
      nameAr: getForexPairNameAr(pair),
      nameEn: pair,
      category: 'forex',
    });
  }
  
  // 3. Check keyword-based asset detection
  for (const assetDef of ASSET_REGISTRY) {
    for (const keyword of assetDef.keywords) {
      if (msgLower.includes(keyword.toLowerCase()) && !seen.has(assetDef.symbol)) {
        seen.add(assetDef.symbol);
        assets.push({
          symbol: assetDef.symbol,
          shortSymbol: assetDef.shortSymbol,
          nameAr: assetDef.nameAr,
          nameEn: assetDef.nameEn,
          category: assetDef.category,
        });
        break; // Found this asset, move to next definition
      }
    }
  }
  
  // 4. Check regex-based symbol detection (catches BTC, ETH, etc.)
  const symbolMatch = message.match(SYMBOL_REGEX);
  if (symbolMatch) {
    const sym = symbolMatch[1].toUpperCase();
    if (!seen.has(sym)) {
      seen.add(sym);
      // Map short symbols to full symbols
      const SHORT_TO_FULL: Record<string, { symbol: string; nameAr: string; nameEn: string; category: DetectedAsset['category'] }> = {
        'BTC': { symbol: 'BTCUSD', nameAr: 'البتكوين', nameEn: 'Bitcoin', category: 'crypto' },
        'ETH': { symbol: 'ETHUSD', nameAr: 'الإيثريوم', nameEn: 'Ethereum', category: 'crypto' },
        'XAU': { symbol: 'XAUUSD', nameAr: 'الذهب', nameEn: 'Gold', category: 'commodity' },
        'XAG': { symbol: 'XAGUSD', nameAr: 'الفضة', nameEn: 'Silver', category: 'commodity' },
        'WTI': { symbol: 'CL', nameAr: 'النفط', nameEn: 'Crude Oil', category: 'commodity' },
        'BRENT': { symbol: 'BZ', nameAr: 'خام برنت', nameEn: 'Brent', category: 'commodity' },
        'SOL': { symbol: 'SOLUSD', nameAr: 'سولانا', nameEn: 'Solana', category: 'crypto' },
        'DOGE': { symbol: 'DOGEUSD', nameAr: 'دوجكوين', nameEn: 'Dogecoin', category: 'crypto' },
        'XRP': { symbol: 'XRPUSD', nameAr: 'ريبيل', nameEn: 'Ripple', category: 'crypto' },
        'ADA': { symbol: 'ADAUSD', nameAr: 'كاردانو', nameEn: 'Cardano', category: 'crypto' },
        'DOT': { symbol: 'DOTUSD', nameAr: 'بولكادوت', nameEn: 'Polkadot', category: 'crypto' },
      };
      const full = SHORT_TO_FULL[sym];
      if (full) {
        assets.push({
          symbol: full.symbol,
          shortSymbol: sym,
          nameAr: full.nameAr,
          nameEn: full.nameEn,
          category: full.category,
        });
      } else {
        // Unknown symbol — add as-is
        assets.push({
          symbol: sym,
          shortSymbol: sym,
          nameAr: sym,
          nameEn: sym,
          category: 'stock', // Default to stock
        });
      }
    }
  }
  
  return assets;
}

function getForexPairNameAr(pair: string): string {
  const NAMES: Record<string, string> = {
    'EURUSD': 'يورو/دولار',
    'GBPUSD': 'جنيه/دولار',
    'USDJPY': 'دولار/ين',
    'USDCHF': 'دولار/فرنك',
    'AUDUSD': 'أسترالي/دولار',
    'NZDUSD': 'نيوزلندي/دولار',
    'USDCAD': 'دولار/كندي',
    'EURGBP': 'يورو/جنيه',
    'EURJPY': 'يورو/ين',
    'GBPJPY': 'جنيه/ين',
  };
  return NAMES[pair] || pair;
}

// ─── AI-Powered Intent Classification (Fallback) ─────────────────
// When rules give low confidence, use AI to classify intent.
// This adds ~300-500ms but only fires for unclear queries.

import { fastChatCompletion } from '@/lib/ai-provider';

const AI_INTENT_PROMPT = `You are a financial intent classifier for the Rouaa platform. 
Classify the user's message into exactly ONE intent and extract any mentioned financial assets.

Possible intents:
- price_query: User asks about prices, rates, or how much something costs
- signal_query: User asks for trading signals, recommendations, buy/sell tips
- analysis_query: User asks for technical or fundamental analysis
- news_query: User asks about news, events, or latest happenings
- report_query: User asks about reports or economic data
- recommendation: User asks for personal advice ("should I buy?", "what do you think?")
- market_overview: User asks about general market conditions
- education: User asks "what is", "explain", "how does it work"
- general: None of the above

Respond with ONLY this JSON format, no other text:
{"intent":"price_query","assets":["BTCUSD","XAUUSD"],"confidence":0.9}

Rules:
- Detect colloquial Arabic: "شو صار" = news_query, "اشتري ولا أبيع" = recommendation, "كيف شكل" = market_overview
- Mixed language queries: "BTC شو صار مع" = price_query with BTC
- Ambiguous: "الذهب" alone = price_query; "الذهب أخبار" = news_query
- Asset symbols: map to full symbols (BTC→BTCUSD, XAU→XAUUSD, EUR→EURUSD)`;

export async function classifyIntentWithAI(
  message: string,
  locale: Locale = 'ar',
  rulesResult?: IntentClassification,
): Promise<IntentClassification> {
  // Step 1: Run rules-based classifier (fast, <1ms)
  const rules = rulesResult ?? classifyIntent(message, locale);
  
  // Step 2: If rules are confident enough, return immediately
  if (rules.confidence >= 0.4 && rules.intent !== 'general') {
    return rules;
  }
  
  // Step 3: AI fallback for low-confidence queries
  try {
    const aiResult = await fastChatCompletion(
      [
        { role: 'system', content: AI_INTENT_PROMPT },
        { role: 'user', content: message },
      ],
      {
        temperature: 0.1,
        maxTokens: 100,
        timeout: 2_000,
        locale,
      }
    );
    
    const jsonMatch = aiResult.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return rules;
    
    const parsed = JSON.parse(jsonMatch[0]);
    const validIntents: IntentType[] = [
      'price_query', 'signal_query', 'analysis_query', 'news_query',
      'report_query', 'recommendation', 'market_overview', 'education', 'general'
    ];
    
    if (!validIntents.includes(parsed.intent)) return rules;
    
    const assets = parsed.assets?.length > 0
      ? mapSymbolsToAssets(parsed.assets)
      : rules.assets;
    
    const aiIntent = parsed.intent as IntentType;
    const aiConfidence = Math.min(parsed.confidence ?? 0.5, 1);
    
    const finalIntent = aiConfidence > rules.confidence ? aiIntent : rules.intent;
    
    const intentRule = INTENT_RULES.find(r => r.intent === finalIntent);
    const dataNeeds: DataNeeds = intentRule
      ? {
          prices: intentRule.dataNeeds.prices ?? false,
          signals: intentRule.dataNeeds.signals ?? false,
          analysis: intentRule.dataNeeds.analysis ?? false,
          news: intentRule.dataNeeds.news ?? false,
          reports: intentRule.dataNeeds.reports ?? false,
          marketPulse: intentRule.dataNeeds.marketPulse ?? false,
          crossReference: intentRule.dataNeeds.crossReference ?? false,
          knowledgeSearch: intentRule.dataNeeds.knowledgeSearch ?? false,
          userProfile: intentRule.dataNeeds.userProfile ?? false,
        }
      : rules.dataNeeds;
    
    if (assets.length > 0) {
      dataNeeds.prices = true;
      dataNeeds.crossReference = true;
    }
    
    return {
      intent: finalIntent,
      confidence: Math.max(aiConfidence, rules.confidence),
      assets,
      dataNeeds,
      requiresAI: intentRule?.requiresAI ?? rules.requiresAI,
      originalQuery: message,
    };
  } catch (err: any) {
    console.warn(`[Intent-AI] AI classification failed, using rules: ${err.message?.slice(0, 80)}`);
    return rules;
  }
}

function mapSymbolsToAssets(symbols: string[]): DetectedAsset[] {
  const assets: DetectedAsset[] = [];
  const seen = new Set<string>();
  
  for (const sym of symbols) {
    const upper = sym.toUpperCase();
    const found = ASSET_REGISTRY.find(a => 
      a.symbol === upper || a.shortSymbol === upper || 
      a.keywords.some(k => k.toLowerCase() === sym.toLowerCase())
    );
    if (found && !seen.has(found.symbol)) {
      seen.add(found.symbol);
      assets.push({
        symbol: found.symbol,
        shortSymbol: found.shortSymbol,
        nameAr: found.nameAr,
        nameEn: found.nameEn,
        category: found.category,
      });
    }
  }
  
  return assets;
}
