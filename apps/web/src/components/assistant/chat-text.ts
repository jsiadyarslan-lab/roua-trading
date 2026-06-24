// ─── Locale Text (Enhanced) ────────────────────────────────────

export type Locale = 'ar' | 'en' | 'fr' | 'tr' | 'es';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  toolsUsed?: string[];
  stockSymbol?: string | null;
  timestamp?: number;
  imageUrl?: string; // base64 preview for user images
  imageData?: string; // base64 data for API
  isDeepSearch?: boolean;
  deepSearchStep?: number;
  priceData?: number[]; // for sparkline rendering
  candleData?: Array<{ open: number; close: number; high: number; low: number }>;
}

export const CHAT_TEXT: Record<Locale, {
  ariaLabel: string;
  headerTitle: string;
  headerSubtitle: string;
  greeting: string;
  inputPlaceholder: string;
  sendButton: string;
  errorConnection: string;
  errorGeneric: string;
  summarize: string;
  stockAnalysis: string;
  referenceMemory: string;
  sources: string;
  toolsUsed: string;
  thinkingPhases: string[];
  quickActions: { label: string; icon: string; prompt: string }[];
  // ── Enhanced: Living Personality ──
  timeGreetingPrefix: string;
  welcomeBack: string;
  welcomeBackTopic: string;
  personalityExcited: string;
  personalityCautious: string;
  // ── Context-specific thinking ──
  thinkingNews: string;
  thinkingMarket: string;
  thinkingCrossRef: string;
  thinkingDeep1: string;
  thinkingDeep2: string;
  thinkingDeep3: string;
  thinkingDeep4: string;
  thinkingImage: string;
  // ── Proactive Intelligence ──
  proactiveUrgent: string;
  proactiveGoldMove: string;
  proactiveEconReport: string;
  contextDeepAnalysis: string;
  contextCurrencyImpact: string;
  contextActiveSignals: string;
  marketPulseBullish: string;
  marketPulseBearish: string;
  marketPulseNeutral: string;
  // ── Voice ──
  voiceListening: string;
  voiceNotSupported: string;
  voiceRead: string;
  // ── Deep Search ──
  deepSearch: string;
  deepSearchProgress: string;
  // ── Image ──
  imageUpload: string;
  imageAnalyzing: string;
  imageDrop: string;
  // ── Memory ──
  basedOnInterest: string;
  // ── Chat History ──
  chatHistory: string;
  newConversation: string;
  noConversations: string;
  deleteConversation: string;
  loadConversation: string;
  todayLabel: string;
  yesterdayLabel: string;
  earlierLabel: string;
  loginToSave: string;
  loadingHistory: string;
}> = {
  ar: {
    ariaLabel: 'مساعد رؤى الذكي',
    headerTitle: 'مساعد رؤى',
    headerSubtitle: 'اسأل عن الأسواق والأسهم والتقارير',
    greeting: 'كيف يمكنني مساعدتك؟',
    inputPlaceholder: 'اكتب سؤالك... (مثل: حلل سهم AAPL)',
    sendButton: 'إرسال',
    errorConnection: 'عذراً، حدث خطأ في الاتصال. حاول مرة أخرى.',
    errorGeneric: 'عذراً، لم أتمكن من معالجة طلبك.',
    summarize: 'لخص الصفحة',
    stockAnalysis: 'تحليل سهم',
    referenceMemory: 'الذاكرة المرجعية',
    sources: 'المصادر',
    toolsUsed: 'الأدوات المستخدمة',
    thinkingPhases: ['يفكر...', 'يحلل البيانات...', 'يجهز الرد...'],
    quickActions: [
      { label: 'لخص الصفحة', icon: '📋', prompt: 'لخص لي محتوى هذه الصفحة في نقاط رئيسية' },
      { label: 'ملخص السوق', icon: '📊', prompt: 'ما هي أهم أحداث السوق اليوم؟' },
      { label: 'شرح مصطلح', icon: '💡', prompt: 'ما هو الفرق بين مؤشر RSI و MACD؟' },
      { label: 'تحليل سهم', icon: '📈', prompt: 'حلل سهم NVDA من الناحية الأساسية والفنية' },
      { label: 'أخبار الذهب', icon: '🥇', prompt: 'ما هي آخر الأخبار عن الذهب وتأثيرها على السعر؟' },
      { label: 'قارن أسهم', icon: '⚖️', prompt: 'قارن بين أداء سهمي AAPL و MSFT' },
    ],
    timeGreetingPrefix: '',
    welcomeBack: 'مرحباً بعودتك!',
    welcomeBackTopic: 'كنا نتحدث عن',
    personalityExcited: 'سوق مثير اليوم! 🚀',
    personalityCautious: 'تداول بحذر اليوم ⚠️',
    thinkingNews: 'جاري البحث في الأخبار والتقارير...',
    thinkingMarket: 'جاري تحليل بيانات السوق...',
    thinkingCrossRef: 'جاري الإحالة المتقاطعة...',
    thinkingDeep1: '١/٤ جاري البحث في الأخبار...',
    thinkingDeep2: '٢/٤ جاري تحليل التقارير...',
    thinkingDeep3: '٣/٤ جاري فحص البيانات الفنية...',
    thinkingDeep4: '٤/٤ جاري تجميع التحليل النهائي...',
    thinkingImage: 'جاري تحليل الصورة...',
    proactiveUrgent: '🚨 أخبار عاجلة عن النفط',
    proactiveGoldMove: '📈 الذهب يتحرك بقوة',
    proactiveEconReport: '📊 تقرير اقتصادي جديد',
    contextDeepAnalysis: 'هل تريد تحليل أعمق؟',
    contextCurrencyImpact: 'ماذا عن تأثير هذا على العملات؟',
    contextActiveSignals: 'أرني الإشارات النشطة',
    marketPulseBullish: 'صاعد',
    marketPulseBearish: 'هابط',
    marketPulseNeutral: 'محايد',
    voiceListening: '🎤 جاري الاستماع...',
    voiceNotSupported: 'المتصفح لا يدعم التعرف على الصوت',
    voiceRead: '🔊',
    deepSearch: 'بحث عميق',
    deepSearchProgress: 'خطوة',
    imageUpload: '📷',
    imageAnalyzing: 'جاري تحليل الصورة...',
    imageDrop: 'اسحب صورة أو انقر للتحميل',
    basedOnInterest: 'بناءً على اهتمامك بـ',
    chatHistory: 'سجل المحادثات',
    newConversation: 'محادثة جديدة',
    noConversations: 'لا توجد محادثات سابقة',
    deleteConversation: 'حذف',
    loadConversation: 'تحميل',
    todayLabel: 'اليوم',
    yesterdayLabel: 'أمس',
    earlierLabel: 'أقدم',
    loginToSave: 'سجل دخولك لحفظ المحادثات',
    loadingHistory: 'جاري تحميل المحادثات...',
  },
  en: {
    ariaLabel: 'Rouaa AI Assistant',
    headerTitle: 'Rouaa Copilot',
    headerSubtitle: 'Ask about markets, stocks & reports',
    greeting: 'How can I help you?',
    inputPlaceholder: 'Type your question... (e.g. analyze AAPL stock)',
    sendButton: 'Send',
    errorConnection: 'Sorry, a connection error occurred. Please try again.',
    errorGeneric: 'Sorry, I could not process your request.',
    summarize: 'Summarize page',
    stockAnalysis: 'Stock Analysis',
    referenceMemory: 'Reference Memory',
    sources: 'Sources',
    toolsUsed: 'Tools Used',
    thinkingPhases: ['Thinking...', 'Analyzing data...', 'Preparing response...'],
    quickActions: [
      { label: 'Summarize', icon: '📋', prompt: 'Summarize this page in key points' },
      { label: 'Market Brief', icon: '📊', prompt: 'What are the most important market events today?' },
      { label: 'Explain Term', icon: '💡', prompt: 'What is the difference between RSI and MACD indicators?' },
      { label: 'Stock Analysis', icon: '📈', prompt: 'Analyze NVDA stock fundamentally and technically' },
      { label: 'Gold News', icon: '🥇', prompt: 'What are the latest news about gold and their impact on price?' },
      { label: 'Compare Stocks', icon: '⚖️', prompt: 'Compare the performance of AAPL and MSFT stocks' },
    ],
    timeGreetingPrefix: '',
    welcomeBack: 'Welcome back!',
    welcomeBackTopic: 'We were discussing',
    personalityExcited: 'Exciting market today! 🚀',
    personalityCautious: 'Trade cautiously today ⚠️',
    thinkingNews: 'Searching news & reports...',
    thinkingMarket: 'Analyzing market data...',
    thinkingCrossRef: 'Cross-referencing data...',
    thinkingDeep1: '1/4 Searching news...',
    thinkingDeep2: '2/4 Analyzing reports...',
    thinkingDeep3: '3/4 Checking technical data...',
    thinkingDeep4: '4/4 Compiling final analysis...',
    thinkingImage: 'Analyzing image...',
    proactiveUrgent: '🚨 Breaking oil news',
    proactiveGoldMove: '📈 Gold moving strongly',
    proactiveEconReport: '📊 New economic report',
    contextDeepAnalysis: 'Want a deeper analysis?',
    contextCurrencyImpact: 'What about the impact on currencies?',
    contextActiveSignals: 'Show active signals',
    marketPulseBullish: 'Bullish',
    marketPulseBearish: 'Bearish',
    marketPulseNeutral: 'Neutral',
    voiceListening: '🎤 Listening...',
    voiceNotSupported: 'Browser does not support speech recognition',
    voiceRead: '🔊',
    deepSearch: 'Deep Search',
    deepSearchProgress: 'Step',
    imageUpload: '📷',
    imageAnalyzing: 'Analyzing image...',
    imageDrop: 'Drop an image or click to upload',
    basedOnInterest: 'Based on your interest in',
    chatHistory: 'Chat History',
    newConversation: 'New Chat',
    noConversations: 'No previous conversations',
    deleteConversation: 'Delete',
    loadConversation: 'Load',
    todayLabel: 'Today',
    yesterdayLabel: 'Yesterday',
    earlierLabel: 'Earlier',
    loginToSave: 'Log in to save conversations',
    loadingHistory: 'Loading conversations...',
  },
  fr: {
    ariaLabel: 'Assistant IA Rouaa',
    headerTitle: 'Copilote Rouaa',
    headerSubtitle: 'Posez des questions sur les marchés et les actions',
    greeting: 'Comment puis-je vous aider ?',
    inputPlaceholder: 'Tapez votre question... (ex: analyse action AAPL)',
    sendButton: 'Envoyer',
    errorConnection: "Désolé, une erreur de connexion s'est produite.",
    errorGeneric: "Désolé, je n'ai pas pu traiter votre demande.",
    summarize: 'Résumer la page',
    stockAnalysis: "Analyse d'action",
    referenceMemory: 'Mémoire de référence',
    sources: 'Sources',
    toolsUsed: 'Outils utilisés',
    thinkingPhases: ['Réflexion...', 'Analyse des données...', 'Préparation de la réponse...'],
    quickActions: [
      { label: 'Résumer', icon: '📋', prompt: 'Résume cette page en points clés' },
      { label: 'Aperçu du marché', icon: '📊', prompt: "Quels sont les événements de marché les plus importants aujourd'hui ?" },
      { label: 'Expliquer', icon: '💡', prompt: 'Quelle est la différence entre les indicateurs RSI et MACD ?' },
      { label: 'Analyse action', icon: '📈', prompt: "Analyse l'action NVDA fondamentalement et techniquement" },
      { label: 'Or', icon: '🥇', prompt: "Quelles sont les dernières nouvelles sur l'or et leur impact sur le prix ?" },
    ],
    timeGreetingPrefix: '',
    welcomeBack: 'Bon retour !',
    welcomeBackTopic: 'Nous discutions de',
    personalityExcited: 'Marché excitant aujourd\'hui ! 🚀',
    personalityCautious: 'Prudence dans les échanges ⚠️',
    thinkingNews: 'Recherche dans les actualités...',
    thinkingMarket: 'Analyse des données de marché...',
    thinkingCrossRef: 'Recoupement des données...',
    thinkingDeep1: '1/4 Recherche d\'actualités...',
    thinkingDeep2: '2/4 Analyse des rapports...',
    thinkingDeep3: '3/4 Vérification des données techniques...',
    thinkingDeep4: '4/4 Compilation de l\'analyse finale...',
    thinkingImage: 'Analyse de l\'image...',
    proactiveUrgent: '🚨 Nouvelles urgentes sur le pétrole',
    proactiveGoldMove: '📈 L\'or en forte mouvance',
    proactiveEconReport: '📊 Nouveau rapport économique',
    contextDeepAnalysis: 'Analyse plus approfondie ?',
    contextCurrencyImpact: 'Impact sur les devises ?',
    contextActiveSignals: 'Signaux actifs',
    marketPulseBullish: 'Haussier',
    marketPulseBearish: 'Baissier',
    marketPulseNeutral: 'Neutre',
    voiceListening: '🎤 Écoute en cours...',
    voiceNotSupported: 'Le navigateur ne supporte pas la reconnaissance vocale',
    voiceRead: '🔊',
    deepSearch: 'Recherche approfondie',
    deepSearchProgress: 'Étape',
    imageUpload: '📷',
    imageAnalyzing: 'Analyse de l\'image...',
    imageDrop: 'Déposez une image ou cliquez',
    basedOnInterest: 'Basé sur votre intérêt pour',
    chatHistory: 'Historique',
    newConversation: 'Nouvelle conversation',
    noConversations: 'Aucune conversation précédente',
    deleteConversation: 'Supprimer',
    loadConversation: 'Charger',
    todayLabel: "Aujourd'hui",
    yesterdayLabel: 'Hier',
    earlierLabel: 'Plus ancien',
    loginToSave: 'Connectez-vous pour sauvegarder',
    loadingHistory: 'Chargement des conversations...',
  },
  tr: {
    ariaLabel: 'Rouaa AI Asistan',
    headerTitle: 'Rouaa Copilot',
    headerSubtitle: 'Piyasalar, hisseler ve raporlar hakkında sorular sorun',
    greeting: 'Size nasıl yardımcı olabilirim?',
    inputPlaceholder: 'Sorunuzu yazın... (örn: AAPL hissesini analiz et)',
    sendButton: 'Gönder',
    errorConnection: 'Üzgünüz, bir bağlantı hatası oluştu.',
    errorGeneric: 'Üzgünüm, talebinizi işleyemedim.',
    summarize: 'Sayfayı özetle',
    stockAnalysis: 'Hisse Analizi',
    referenceMemory: 'Referans Belleği',
    sources: 'Kaynaklar',
    toolsUsed: 'Kullanılan araçlar',
    thinkingPhases: ['Düşünüyor...', 'Verileri analiz ediyor...', 'Yanıt hazırlanıyor...'],
    quickActions: [
      { label: 'Özetle', icon: '📋', prompt: 'Bu sayfayı ana hatlarıyla özetle' },
      { label: 'Piyasa Özeti', icon: '📊', prompt: 'Bugünün en önemli piyasa olayları neler?' },
      { label: 'Açıkla', icon: '💡', prompt: 'RSI ve MACD göstergeleri arasındaki fark nedir?' },
      { label: 'Hisse Analizi', icon: '📈', prompt: 'NVDA hissesini temel ve teknik olarak analiz et' },
      { label: 'Altın', icon: '🥇', prompt: 'Altın hakkında son haberler ve fiyat üzerindeki etkileri neler?' },
    ],
    timeGreetingPrefix: '',
    welcomeBack: 'Tekrar hoş geldiniz!',
    welcomeBackTopic: 'Konuştuğumuz konu:',
    personalityExcited: 'Piyasa bugün heyecanlı! 🚀',
    personalityCautious: 'Bugün dikkatli işlem yapın ⚠️',
    thinkingNews: 'Haberler ve raporlar aranıyor...',
    thinkingMarket: 'Piyasa verileri analiz ediliyor...',
    thinkingCrossRef: 'Veriler çapraz referanslanıyor...',
    thinkingDeep1: '1/4 Haberler aranıyor...',
    thinkingDeep2: '2/4 Raporlar analiz ediliyor...',
    thinkingDeep3: '3/4 Teknik veriler kontrol ediliyor...',
    thinkingDeep4: '4/4 Final analizi derleniyor...',
    thinkingImage: 'Görüntü analiz ediliyor...',
    proactiveUrgent: '🚨 Petrol hakkında acil haber',
    proactiveGoldMove: '📈 Altın güçlü hareket ediyor',
    proactiveEconReport: '📊 Yeni ekonomik rapor',
    contextDeepAnalysis: 'Daha derin analiz ister misiniz?',
    contextCurrencyImpact: 'Parite üzerindeki etkisi ne?',
    contextActiveSignals: 'Aktif sinyalleri göster',
    marketPulseBullish: 'Yükseliş',
    marketPulseBearish: 'Düşüş',
    marketPulseNeutral: 'Nötr',
    voiceListening: '🎤 Dinliyor...',
    voiceNotSupported: 'Tarayıcı ses tanımayı desteklemiyor',
    voiceRead: '🔊',
    deepSearch: 'Derin Arama',
    deepSearchProgress: 'Adım',
    imageUpload: '📷',
    imageAnalyzing: 'Görüntü analiz ediliyor...',
    imageDrop: 'Görüntü sürükle veya tıkla',
    basedOnInterest: 'İlgi alanınıza dayalı:',
    chatHistory: 'Sohbet Geçmişi',
    newConversation: 'Yeni Sohbet',
    noConversations: 'Önceki sohbet yok',
    deleteConversation: 'Sil',
    loadConversation: 'Yükle',
    todayLabel: 'Bugün',
    yesterdayLabel: 'Dün',
    earlierLabel: 'Daha eski',
    loginToSave: 'Sohbetleri kaydetmek için giriş yapın',
    loadingHistory: 'Sohbetler yükleniyor...',
  },
  es: {
    ariaLabel: 'Asistente IA de Rouaa',
    headerTitle: 'Copiloto Rouaa',
    headerSubtitle: 'Pregunta sobre mercados, acciones e informes',
    greeting: '¿Cómo puedo ayudarte?',
    inputPlaceholder: 'Escribe tu pregunta... (ej: analiza acción AAPL)',
    sendButton: 'Enviar',
    errorConnection: 'Lo siento, ocurrió un error de conexión.',
    errorGeneric: 'Lo siento, no pude procesar tu solicitud.',
    summarize: 'Resumir página',
    stockAnalysis: 'Análisis de acción',
    referenceMemory: 'Memoria de referencia',
    sources: 'Fuentes',
    toolsUsed: 'Herramientas usadas',
    thinkingPhases: ['Pensando...', 'Analizando datos...', 'Preparando respuesta...'],
    quickActions: [
      { label: 'Resumir', icon: '📋', prompt: 'Resume esta página en puntos clave' },
      { label: 'Resumen de mercado', icon: '📊', prompt: '¿Cuáles son los eventos de mercado más importantes hoy?' },
      { label: 'Explicar', icon: '💡', prompt: '¿Cuál es la diferencia entre los indicadores RSI y MACD?' },
      { label: 'Análisis de acción', icon: '📈', prompt: 'Analiza la acción NVDA fundamental y técnicamente' },
      { label: 'Oro', icon: '🥇', prompt: '¿Cuáles son las últimas noticias sobre el oro y su impacto en el precio?' },
    ],
    timeGreetingPrefix: '',
    welcomeBack: '¡Bienvenido de nuevo!',
    welcomeBackTopic: 'Estábamos hablando de',
    personalityExcited: '¡Mercado emocionante hoy! 🚀',
    personalityCautious: 'Opere con precaución hoy ⚠️',
    thinkingNews: 'Buscando noticias e informes...',
    thinkingMarket: 'Analizando datos del mercado...',
    thinkingCrossRef: 'Referencia cruzada de datos...',
    thinkingDeep1: '1/4 Buscando noticias...',
    thinkingDeep2: '2/4 Analizando informes...',
    thinkingDeep3: '3/4 Verificando datos técnicos...',
    thinkingDeep4: '4/4 Compilando análisis final...',
    thinkingImage: 'Analizando imagen...',
    proactiveUrgent: '🚨 Noticias urgentes del petróleo',
    proactiveGoldMove: '📈 Oro en fuerte movimiento',
    proactiveEconReport: '📊 Nuevo informe económico',
    contextDeepAnalysis: '¿Análisis más profundo?',
    contextCurrencyImpact: '¿Impacto en las divisas?',
    contextActiveSignals: 'Mostrar señales activas',
    marketPulseBullish: 'Alcista',
    marketPulseBearish: 'Bajista',
    marketPulseNeutral: 'Neutral',
    voiceListening: '🎤 Escuchando...',
    voiceNotSupported: 'El navegador no soporta reconocimiento de voz',
    voiceRead: '🔊',
    deepSearch: 'Búsqueda profunda',
    deepSearchProgress: 'Paso',
    imageUpload: '📷',
    imageAnalyzing: 'Analizando imagen...',
    imageDrop: 'Suelta una imagen o haz clic',
    basedOnInterest: 'Basado en tu interés en',
    chatHistory: 'Historial',
    newConversation: 'Nueva conversación',
    noConversations: 'Sin conversaciones previas',
    deleteConversation: 'Eliminar',
    loadConversation: 'Cargar',
    todayLabel: 'Hoy',
    yesterdayLabel: 'Ayer',
    earlierLabel: 'Anterior',
    loginToSave: 'Inicia sesión para guardar',
    loadingHistory: 'Cargando conversaciones...',
  },
};
