// ─── Assistant Tool Definitions ────────────────────────────────
// Defines all tools available to the Rouaa Universal Copilot.
// Each tool has: name, descriptions (5 locales), parameter schema, and handler reference.
// The AI model is instructed to output [TOOL_CALL]{...}[/TOOL_CALL] when it needs a tool.

export type Locale = 'ar' | 'en' | 'fr' | 'tr' | 'es';

export interface ToolDefinition {
  name: string;
  descriptions: Record<Locale, string>;
  parameters: {
    name: string;
    type: 'string' | 'number' | 'boolean';
    required: boolean;
    descriptions: Record<Locale, string>;
  }[];
  // Handler is referenced by name — executed by tool-executor.ts
  handler: string;
}

// ─── Tool Registry ─────────────────────────────────────────────

export const TOOLS: ToolDefinition[] = [
  {
    name: 'search_by_asset',
    descriptions: {
      ar: 'يبحث في المقالات المرتبطة برمز أصل مالي محدد (مثل EURUSD, XAUUSD) عبر حقل الأصول المتأثرة — أكثر دقة للفوركس والسلع',
      en: 'Searches articles linked to a specific asset symbol (e.g. EURUSD, XAUUSD) via the affected assets field — more precise for forex and commodities',
      fr: 'Recherche les articles liés à un symbole d\'actif spécifique (ex: EURUSD, XAUUSD) via le champ actifs affectés — plus précis pour le forex et les matières premières',
      tr: 'Belirli bir varlık sembolü (örn: EURUSD, XAUUSD) için etkilenen varlıklar alanı üzerinden makale arar — forex ve emtia için daha hassas',
      es: 'Busca artículos vinculados a un símbolo de activo específico (ej: EURUSD, XAUUSD) a través del campo de activos afectados — más preciso para forex y materias primas',
    },
    parameters: [
      {
        name: 'symbol',
        type: 'string',
        required: true,
        descriptions: { ar: 'رمز الأصل (مثل EURUSD, XAUUSD, BTC)', en: 'Asset symbol (e.g. EURUSD, XAUUSD, BTC)', fr: 'Symbole d\'actif (ex: EURUSD, XAUUSD, BTC)', tr: 'Varlık sembolü (örn: EURUSD, XAUUSD, BTC)', es: 'Símbolo de activo (ej: EURUSD, XAUUSD, BTC)' },
      },
      {
        name: 'limit',
        type: 'number',
        required: false,
        descriptions: { ar: 'عدد النتائج (افتراضي 8)', en: 'Number of results (default 8)', fr: 'Nombre de résultats (défaut 8)', tr: 'Sonuç sayısı (varsayılan 8)', es: 'Número de resultados (por defecto 8)' },
      },
    ],
    handler: 'searchByAsset',
  },
  {
    name: 'get_forex_movers',
    descriptions: {
      ar: 'يجلب أزواج العملات الأكثر نشاطاً بناءً على أخبار السوق ومشاعر المستثمرين',
      en: 'Fetches the most active forex pairs based on market news and investor sentiment',
      fr: 'Récupère les paires de devises les plus actives basées sur les actualités du marché et le sentiment des investisseurs',
      tr: 'Piyasa haberleri ve yatırımcı duyarlılığına göre en aktif döviz çiftlerini getirir',
      es: 'Obtiene los pares de divisas más activos basados en noticias del mercado y sentimiento de inversores',
    },
    parameters: [
      {
        name: 'period',
        type: 'string',
        required: false,
        descriptions: { ar: 'الفترة: week أو month أو today (افتراضي week)', en: 'Period: week, month, or today (default week)', fr: 'Période : week, month, ou today (défaut week)', tr: 'Dönem: week, month, veya today (varsayılan week)', es: 'Período: week, month, o today (por defecto week)' },
      },
    ],
    handler: 'getForexMovers',
  },
  {
    name: 'get_stock_fundamentals',
    descriptions: {
      ar: 'يجلب البيانات المالية الأساسية لسهم معين (الإيرادات، الأرباح، مكرر الربحية، الهوامش، النمو)',
      en: 'Fetches fundamental financial data for a stock (revenue, earnings, P/E ratio, margins, growth)',
      fr: "Récupère les données financières fondamentales d'une action (revenus, bénéfices, ratio P/E, marges, croissance)",
      tr: 'Bir hisse senedi için temel finansal verileri getirir (gelir, kazanç, F/K oranı, marjlar, büyüme)',
      es: 'Obtiene datos financieros fundamentales de una acción (ingresos, ganancias, ratio P/E, márgenes, crecimiento)',
    },
    parameters: [
      {
        name: 'symbol',
        type: 'string',
        required: true,
        descriptions: { ar: 'رمز السهم (مثل AAPL)', en: 'Stock symbol (e.g. AAPL)', fr: 'Symbole boursier (ex: AAPL)', tr: 'Hisse sembolü (örn: AAPL)', es: 'Símbolo bursátil (ej: AAPL)' },
      },
    ],
    handler: 'getStockFundamentals',
  },
  {
    name: 'get_stock_technical',
    descriptions: {
      ar: 'يجلب التحليل الفني لسهم معين (RSI, MACD, الدعم/المقاومة، الاتجاه، إعداد التداول)',
      en: 'Fetches technical analysis for a stock (RSI, MACD, support/resistance, trend, trade setup)',
      fr: "Récupère l'analyse technique d'une action (RSI, MACD, support/résistance, tendance, configuration de trading)",
      tr: 'Bir hisse senedi için teknik analiz getirir (RSI, MACD, destek/direnç, trend, işlem kurulumu)',
      es: 'Obtiene el análisis técnico de una acción (RSI, MACD, soporte/resistencia, tendencia, configuración de trading)',
    },
    parameters: [
      {
        name: 'symbol',
        type: 'string',
        required: true,
        descriptions: { ar: 'رمز السهم (مثل MSFT)', en: 'Stock symbol (e.g. MSFT)', fr: 'Symbole boursier (ex: MSFT)', tr: 'Hisse sembolü (örn: MSFT)', es: 'Símbolo bursátil (ej: MSFT)' },
      },
    ],
    handler: 'getStockTechnical',
  },
  {
    name: 'get_stock_news',
    descriptions: {
      ar: 'يجلب آخر الأخبار المؤثرة على سهم معين مع تحليل المشاعر',
      en: 'Fetches latest news affecting a specific stock with sentiment analysis',
      fr: "Récupère les dernières actualités affectant une action spécifique avec analyse de sentiment",
      tr: 'Belirli bir hisseyi etkileyen son haberleri duygu analizi ile getirir',
      es: 'Obtiene las últimas noticias que afectan a una acción específica con análisis de sentimiento',
    },
    parameters: [
      {
        name: 'symbol',
        type: 'string',
        required: true,
        descriptions: { ar: 'رمز السهم', en: 'Stock symbol', fr: 'Symbole boursier', tr: 'Hisse sembolü', es: 'Símbolo bursátil' },
      },
      {
        name: 'limit',
        type: 'number',
        required: false,
        descriptions: { ar: 'عدد الأخبار (افتراضي 5)', en: 'Number of news (default 5)', fr: "Nombre d'actualités (défaut 5)", tr: 'Haber sayısı (varsayılan 5)', es: 'Número de noticias (por defecto 5)' },
      },
    ],
    handler: 'getStockNews',
  },
  {
    name: 'get_stock_quote',
    descriptions: {
      ar: 'يجلب السعر اللحظي وبيانات السهم (السعر، التغيير، الحجم، القيمة السوقية)',
      en: 'Fetches real-time stock price and quote data (price, change, volume, market cap)',
      fr: "Récupère le prix en temps réel et les cotations d'une action (prix, changement, volume, capitalisation)",
      tr: 'Gerçek zamanlı hisse fiyatı ve kotasyon verilerini getirir (fiyat, değişim, hacim, piyasa değeri)',
      es: 'Obtiene el precio en tiempo real y datos de cotización (precio, cambio, volumen, capitalización)',
    },
    parameters: [
      {
        name: 'symbol',
        type: 'string',
        required: true,
        descriptions: { ar: 'رمز السهم', en: 'Stock symbol', fr: 'Symbole boursier', tr: 'Hisse sembolü', es: 'Símbolo bursátil' },
      },
    ],
    handler: 'getStockQuote',
  },
  {
    name: 'compare_stocks',
    descriptions: {
      ar: 'يقارن بين أداء سهمين في آخر 6 أشهر مع تحليل الفروقات',
      en: 'Compares performance of two stocks over the last 6 months with differential analysis',
      fr: "Compare la performance de deux actions sur les 6 derniers mois avec analyse différentielle",
      tr: 'İki hisse senedinin son 6 aydaki performansını fark analizi ile karşılaştırır',
      es: 'Compara el rendimiento de dos acciones en los últimos 6 meses con análisis diferencial',
    },
    parameters: [
      {
        name: 'symbol1',
        type: 'string',
        required: true,
        descriptions: { ar: 'رمز السهم الأول', en: 'First stock symbol', fr: 'Premier symbole boursier', tr: 'İlk hisse sembolü', es: 'Primer símbolo bursátil' },
      },
      {
        name: 'symbol2',
        type: 'string',
        required: true,
        descriptions: { ar: 'رمز السهم الثاني', en: 'Second stock symbol', fr: 'Deuxième symbole boursier', tr: 'İkinci hisse sembolü', es: 'Segundo símbolo bursátil' },
      },
    ],
    handler: 'compareStocks',
  },
  {
    name: 'get_stock_recommendations',
    descriptions: {
      ar: 'يجلب توصيات مخصصة لسهم معين بناءً على ملف المستخدم',
      en: 'Fetches personalized recommendations for a stock based on user profile',
      fr: "Récupère des recommandations personnalisées pour une action basées sur le profil utilisateur",
      tr: 'Kullanıcı profiline dayalı bir hisse için kişiselleştirilmiş tavsiyeler getirir',
      es: 'Obtiene recomendaciones personalizadas para una acción basadas en el perfil del usuario',
    },
    parameters: [
      {
        name: 'symbol',
        type: 'string',
        required: true,
        descriptions: { ar: 'رمز السهم', en: 'Stock symbol', fr: 'Symbole boursier', tr: 'Hisse sembolü', es: 'Símbolo bursátil' },
      },
    ],
    handler: 'getStockRecommendations',
  },
  {
    name: 'search_articles',
    descriptions: {
      ar: 'يبحث في المقالات والتقارير السابقة عن موضوع معين عبر كل اللغات',
      en: 'Searches previous articles and reports about a topic across all languages',
      fr: 'Recherche des articles et rapports précédents sur un sujet dans toutes les langues',
      tr: 'Tüm dillerde bir konu hakkında önceki makaleleri ve raporları arar',
      es: 'Busca artículos e informes anteriores sobre un tema en todos los idiomas',
    },
    parameters: [
      {
        name: 'query',
        type: 'string',
        required: true,
        descriptions: { ar: 'مصطلح البحث', en: 'Search query', fr: 'Requête de recherche', tr: 'Arama sorgusu', es: 'Consulta de búsqueda' },
      },
      {
        name: 'locale',
        type: 'string',
        required: false,
        descriptions: { ar: 'اللغة (ar/en/fr/tr/es)', en: 'Locale (ar/en/fr/tr/es)', fr: 'Locale (ar/en/fr/tr/es)', tr: 'Dil (ar/en/fr/tr/es)', es: 'Idioma (ar/en/fr/tr/es)' },
      },
    ],
    handler: 'searchArticles',
  },
  {
    name: 'summarize_page',
    descriptions: {
      ar: 'يلخص محتوى الصفحة الحالية في نقاط رئيسية',
      en: 'Summarizes the current page content in key points',
      fr: 'Résume le contenu de la page actuelle en points clés',
      tr: 'Mevcut sayfa içeriğini ana hatlarıyla özetler',
      es: 'Resume el contenido de la página actual en puntos clave',
    },
    parameters: [
      {
        name: 'pageUrl',
        type: 'string',
        required: true,
        descriptions: { ar: 'رابط الصفحة', en: 'Page URL', fr: 'URL de la page', tr: 'Sayfa URL', es: 'URL de la página' },
      },
    ],
    handler: 'summarizePage',
  },
  {
    name: 'get_market_events',
    descriptions: {
      ar: 'يجلب أهم الأحداث الاقتصادية القادمة من التقويم الاقتصادي (معدل البطالة، قرارات الفائدة، الناتج المحلي، التصريحات، الاجتماعات)',
      en: 'Fetches upcoming major economic events from the calendar (unemployment rate, rate decisions, GDP, speeches, meetings)',
      fr: "Récupère les événements économiques majeurs à venir du calendrier (taux de chômage, décisions de taux, PIB, discours, réunions)",
      tr: 'Takvimden yaklaşan büyük ekonomik olayları getirir (işsizlik oranı, faiz kararları, GSYH, konuşmalar, toplantılar)',
      es: 'Obtiene los próximos eventos económicos importantes del calendario (tasa de desempleo, decisiones de tasas, PIB, discursos, reuniones)',
    },
    parameters: [
      {
        name: 'days',
        type: 'number',
        required: false,
        descriptions: { ar: 'عدد الأيام القادمة (افتراضي 3)', en: 'Number of upcoming days (default 3)', fr: "Nombre de jours à venir (défaut 3)", tr: 'Yaklaşan gün sayısı (varsayılan 3)', es: 'Número de días próximos (por defecto 3)' },
      },
      {
        name: 'importance',
        type: 'string',
        required: false,
        descriptions: { ar: 'مستوى الأهمية: high أو critical فقط (اختياري)', en: 'Importance filter: high or critical only (optional)', fr: "Filtre d'importance : high ou critical uniquement (optionnel)", tr: 'Önem filtresi: sadece high veya critical (isteğe bağlı)', es: 'Filtro de importancia: solo high o critical (opcional)' },
      },
    ],
    handler: 'getMarketEvents',
  },
  // ─── NEW: Deep Database Knowledge Tools ─────────────────────
  {
    name: 'db_search',
    descriptions: {
      ar: 'يبحث في قاعدة البيانات بالكامل (9 مصادر: الأخبار، التقارير، التحليلات، الإشارات، التوصيات، الإنفوجرافيك، الفيديو، الأحداث، المجتمع) — الأداة الأقوى للبحث الشامل',
      en: 'Searches the ENTIRE database (9 sources: news, reports, analyses, signals, recommendations, infographics, videos, events, community) — the most powerful search tool',
      fr: 'Recherche dans TOUTE la base de données (9 sources : actualités, rapports, analyses, signaux, recommandations, infographies, vidéos, événements, communauté) — l\'outil de recherche le plus puissant',
      tr: 'TÜM veritabanında arar (9 kaynak: haberler, raporlar, analizler, sinyaller, öneriler, infografikler, videolar, etkinlikler, topluluk) — en güçlü arama aracı',
      es: 'Busca en TODA la base de datos (9 fuentes: noticias, informes, análisis, señales, recomendaciones, infografías, videos, eventos, comunidad) — la herramienta de búsqueda más potente',
    },
    parameters: [
      {
        name: 'query',
        type: 'string',
        required: true,
        descriptions: { ar: 'مصطلح البحث', en: 'Search query', fr: 'Requête de recherche', tr: 'Arama sorgusu', es: 'Consulta de búsqueda' },
      },
      {
        name: 'types',
        type: 'string',
        required: false,
        descriptions: {
          ar: 'أنواع المصادر مفصولة بفاصلة (news,report,analysis,signal,recommendation,infographic,video,event,discussion)',
          en: 'Source types comma-separated (news,report,analysis,signal,recommendation,infographic,video,event,discussion)',
          fr: 'Types de sources séparés par des virgules (news,report,analysis,signal,recommendation,infographic,video,event,discussion)',
          tr: 'Kaynak türleri virgülle ayrılmış (news,report,analysis,signal,recommendation,infographic,video,event,discussion)',
          es: 'Tipos de fuentes separados por comas (news,report,analysis,signal,recommendation,infographic,video,event,discussion)',
        },
      },
      {
        name: 'limit',
        type: 'number',
        required: false,
        descriptions: { ar: 'عدد النتائج (افتراضي 15)', en: 'Number of results (default 15)', fr: 'Nombre de résultats (défaut 15)', tr: 'Sonuç sayısı (varsayılan 15)', es: 'Número de resultados (por defecto 15)' },
      },
    ],
    handler: 'dbSearch',
  },
  {
    name: 'cross_reference',
    descriptions: {
      ar: 'يجلب كل البيانات المتعلقة برمز معين من جميع المصادر (أخبار + تحليلات + إشارات + تقارير + توصيات + إنفوجرافيك + فيديو + أحداث + مجتمع) — الإحالة المتقاطعة الشاملة',
      en: 'Fetches ALL data related to a symbol from ALL sources (news + analyses + signals + reports + recommendations + infographics + video + events + community) — comprehensive cross-reference',
      fr: 'Récupère TOUTES les données liées à un symbole de TOUTES les sources — référence croisée complète',
      tr: 'Bir sembolle ilgili TÜM kaynaklardan TÜM verileri getirir — kapsamlı çapraz referans',
      es: 'Obtiene TODOS los datos relacionados con un símbolo de TODAS las fuentes — referencia cruzada completa',
    },
    parameters: [
      {
        name: 'symbol',
        type: 'string',
        required: true,
        descriptions: { ar: 'رمز الأصل (مثل EURUSD, AAPL, XAUUSD)', en: 'Asset symbol (e.g. EURUSD, AAPL, XAUUSD)', fr: 'Symbole d\'actif (ex: EURUSD, AAPL, XAUUSD)', tr: 'Varlık sembolü (örn: EURUSD, AAPL, XAUUSD)', es: 'Símbolo de activo (ej: EURUSD, AAPL, XAUUSD)' },
      },
    ],
    handler: 'crossReference',
  },
  {
    name: 'market_pulse',
    descriptions: {
      ar: 'يجلب نبض السوق الحالي: أكبر المحركات، الإشارات النشطة، الأخبار العاجلة، الأحداث القادمة، والاتجاه العام — لمعرفة ماذا يحدث الآن',
      en: 'Fetches current market pulse: top movers, active signals, breaking news, upcoming events, and overall direction — to know what\'s happening NOW',
      fr: 'Récupère le pouls actuel du marché : principaux movers, signaux actifs, dernières nouvelles, événements à venir — pour savoir ce qui se passe MAINTENANT',
      tr: 'Mevcut piyasa nabzını getirir: en büyük hareketler, aktif sinyaller, son dakika haberleri, yaklaşan etkinlikler — ŞİMDİ ne olduğunu bilmek için',
      es: 'Obtiene el pulso actual del mercado: principales movimientos, señales activas, noticias de última hora, eventos próximos — para saber qué pasa AHORA',
    },
    parameters: [
      {
        name: 'detail',
        type: 'string',
        required: false,
        descriptions: { ar: 'مستوى التفصيل: summary أو full (افتراضي summary)', en: 'Detail level: summary or full (default summary)', fr: 'Niveau de détail : summary ou full (défaut summary)', tr: 'Detay seviyesi: summary veya full (varsayılan summary)', es: 'Nivel de detalle: summary o full (por defecto summary)' },
      },
    ],
    handler: 'marketPulse',
  },
  {
    name: 'get_my_recommendations',
    descriptions: {
      ar: 'يجلب التوصيات المخصصة للمستخدم بناءً على ملفه الاستثماري وتفضيلاته — توصيات حية وفعّالة',
      en: 'Fetches personalized recommendations for the user based on their investment profile and preferences — live and active recommendations',
      fr: 'Récupère les recommandations personnalisées pour l\'utilisateur basées sur son profil d\'investissement — recommandations actives',
      tr: 'Kullanıcının yatırım profiline dayalı kişiselleştirilmiş önerileri getirir — canlı ve aktif öneriler',
      es: 'Obtiene recomendaciones personalizadas para el usuario basadas en su perfil de inversión — recomendaciones activas',
    },
    parameters: [
      {
        name: 'urgency',
        type: 'string',
        required: false,
        descriptions: { ar: 'فلتر الإلحاح: high أو critical فقط (اختياري)', en: 'Urgency filter: high or critical only (optional)', fr: 'Filtre d\'urgence : high ou critical uniquement (optionnel)', tr: 'Aciliyet filtresi: sadece high veya critical (isteğe bağlı)', es: 'Filtro de urgencia: solo high o critical (opcional)' },
      },
    ],
    handler: 'getMyRecommendations',
  },
  {
    name: 'get_active_signals',
    descriptions: {
      ar: 'يجلب جميع إشارات التداول النشطة حالياً مع التفاصيل (الزوج، الاتجاه، سعر الدخول، وقف الخسارة، جني الأرباح، مستوى الثقة، الإطار الزمني) — من قاعدة البيانات المباشرة',
      en: 'Fetches all currently active trading signals with details (pair, direction, entry, stop loss, take profit, confidence, timeframe) — from the live database',
      fr: "Récupère tous les signaux de trading actifs avec détails (paire, direction, entrée, stop loss, take profit, confiance, timeframe) — depuis la base de données en direct",
      tr: 'Tüm aktif işlem sinyallerini detaylarıyla getirir (çift, yön, giriş, stop loss, take profit, güven, zaman dilimi) — canlı veritabanından',
      es: 'Obtiene todas las señales de trading activas con detalles (par, dirección, entrada, stop loss, take profit, confianza, temporalidad) — desde la base de datos en vivo',
    },
    parameters: [
      {
        name: 'category',
        type: 'string',
        required: false,
        descriptions: { ar: 'الفئة: forex أو crypto أو commodities أو stocks (اختياري)', en: 'Category: forex, crypto, commodities, or stocks (optional)', fr: 'Catégorie : forex, crypto, commodities, ou stocks (optionnel)', tr: 'Kategori: forex, crypto, commodities, veya stocks (isteğe bağlı)', es: 'Categoría: forex, crypto, commodities, o stocks (opcional)' },
      },
    ],
    handler: 'getActiveSignals',
  },
  {
    name: 'get_latest_reports',
    descriptions: {
      ar: 'يجلب أحدث التقارير الاقتصادية والاستراتيجية المنشورة — ملخصات تنفيذية مع مستوى التأثير والثقة',
      en: 'Fetches the latest published economic and strategic reports — executive summaries with impact level and confidence',
      fr: "Récupère les derniers rapports économiques et stratégiques publiés — résumés exécutifs avec niveau d'impact et confiance",
      tr: 'En son yayınlanan ekonomik ve stratejik raporları getirir — etki seviyesi ve güven ile yönetici özetleri',
      es: 'Obtiene los últimos informes económicos y estratégicos publicados — resúmenes ejecutivos con nivel de impacto y confianza',
    },
    parameters: [
      {
        name: 'reportType',
        type: 'string',
        required: false,
        descriptions: { ar: 'نوع التقرير: weekly أو monthly أو quarterly أو special (اختياري)', en: 'Report type: weekly, monthly, quarterly, or special (optional)', fr: 'Type de rapport : weekly, monthly, quarterly, ou special (optionnel)', tr: 'Rapor türü: weekly, monthly, quarterly, veya special (isteğe bağlı)', es: 'Tipo de informe: weekly, monthly, quarterly, o special (opcional)' },
      },
      {
        name: 'limit',
        type: 'number',
        required: false,
        descriptions: { ar: 'عدد التقارير (افتراضي 5)', en: 'Number of reports (default 5)', fr: 'Nombre de rapports (défaut 5)', tr: 'Rapor sayısı (varsayılan 5)', es: 'Número de informes (por defecto 5)' },
      },
    ],
    handler: 'getLatestReports',
  },
  {
    name: 'get_council_briefs',
    descriptions: {
      ar: 'يجلب موجزات مجلس الذكاء الاصطناعي — إجماع نماذج الذكاء الاصطناعي المتعددة حول أزواج التداول مع مستوى الثقة',
      en: 'Fetches AI Council briefs — consensus from multiple AI models on trading pairs with confidence levels',
      fr: 'Récupère les briefs du Conseil IA — consensus de plusieurs modèles d\'IA sur les paires de trading',
      tr: 'AI Konsey brifinglerini getirir — işlem çiftlerinde birden fazla AI modelinin konsensüsü',
      es: 'Obtiene los briefs del Consejo de IA — consenso de múltiples modelos de IA en pares de trading',
    },
    parameters: [
      {
        name: 'pair',
        type: 'string',
        required: false,
        descriptions: { ar: 'زوج تداول محدد (اختياري)', en: 'Specific trading pair (optional)', fr: 'Paire de trading spécifique (optionnel)', tr: 'Belirli bir işlem çifti (isteğe bağlı)', es: 'Par de trading específico (opcional)' },
      },
    ],
    handler: 'getCouncilBriefs',
  },
];

// ─── Helpers ───────────────────────────────────────────────────

/**
 * Build tool descriptions string for the AI system prompt.
 * Tells the AI what tools are available and how to call them.
 */
export function buildToolPrompt(locale: Locale): string {
  const TOOL_CALL_FORMAT = `When you need real-time data, call a tool by outputting EXACTLY this format (no other text around it):
[TOOL_CALL]{"tool":"tool_name","params":{"param1":"value1"}}[/TOOL_CALL]

Available tools:`;

  const toolLines = TOOLS.map(tool => {
    const desc = tool.descriptions[locale] || tool.descriptions.en;
    const params = tool.parameters.map(p => {
      const pDesc = p.descriptions[locale] || p.descriptions.en;
      return `    - ${p.name} (${p.type}${p.required ? ', required' : ', optional'}): ${pDesc}`;
    }).join('\n');
    return `- ${tool.name}: ${desc}\n${params}`;
  }).join('\n\n');

  return `${TOOL_CALL_FORMAT}\n\n${toolLines}`;
}

/**
 * Parse a [TOOL_CALL]...[/TOOL_CALL] block from AI response.
 * Returns null if no tool call found.
 */
export function parseToolCall(response: string): { tool: string; params: Record<string, any> } | null {
  const match = response.match(/\[TOOL_CALL\]\s*(\{[\s\S]*?\})\s*\[\/TOOL_CALL\]/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[1]);
    if (parsed.tool && typeof parsed.tool === 'string') {
      return { tool: parsed.tool, params: parsed.params || {} };
    }
  } catch {
    // Invalid JSON — not a tool call
  }
  return null;
}

/**
 * Check if response contains a tool call (quick check without parsing)
 */
export function hasToolCall(response: string): boolean {
  return response.includes('[TOOL_CALL]') && response.includes('[/TOOL_CALL]');
}

/**
 * Strip tool call markup from response text
 */
export function stripToolCallMarkup(response: string): string {
  return response.replace(/\[TOOL_CALL\]\s*\{[\s\S]*?\}\s*\[\/TOOL_CALL\]/g, '').trim();
}

/**
 * Get tool definition by name
 */
export function getToolByName(name: string): ToolDefinition | undefined {
  return TOOLS.find(t => t.name === name);
}

/**
 * Detect if user message contains a stock symbol
 * Matches patterns like $AAPL, $TSLA, or standalone uppercase 2-5 letter symbols
 */
export function detectStockSymbol(message: string): string | null {
  // Pattern 1: $SYMBOL (explicit)
  const dollarMatch = message.match(/\$([A-Z]{1,5})\b/);
  if (dollarMatch) return dollarMatch[1];

  // Pattern 2: Common stock symbols in context (standalone uppercase after keywords)
  const contextPatterns = /(?:stock|share|سهم|action|hisse|acción|analyze|analyse|analiz|تحليل)\s+([A-Z]{2,5})\b/i;
  const contextMatch = message.match(contextPatterns);
  if (contextMatch) return contextMatch[1];

  return null;
}
