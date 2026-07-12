// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Financial Glossary
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// قاموس مالي بـ 18 لغة (Tier A + B)
// 100 مصطلح مالي أساسي لكل لغة
// يُحقن في الـ LLM prompt لضمان دقة الترجمة
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger } from '@nestjs/common';

// ─── Glossary Type ───────────────────────────────────────────
export type GlossaryEntries = Record<string, string>;

interface LanguageGlossary {
  language: string;
  entries: GlossaryEntries;
}

// ─── Helper: build entries with common pattern ───────────────
// كل مصطلح يأخذ نفس المفاتيح، فقط القيم تتغير حسب اللغة
const GLOSSARY_KEYS = [
  'buy', 'sell', 'hold', 'long', 'short',
  'stop_loss', 'take_profit', 'entry_price', 'exit_price',
  'leverage', 'margin', 'margin_call', 'liquidation',
  'pnl', 'unrealized_pnl', 'realized_pnl',
  'win_rate', 'profit_factor', 'risk_reward_ratio',
  'bullish', 'bearish', 'neutral',
  'volatility', 'trend', 'range', 'breakout', 'reversal',
  'support', 'resistance',
  'lot', 'pip', 'spread', 'slippage',
  'candle', 'timeframe', 'm1', 'm5', 'm15', 'h1', 'h4', 'd1',
  'rsi', 'macd', 'ema', 'sma',
  'forex', 'crypto', 'commodity', 'index',
  'council', 'consensus', 'vote', 'brief',
  'agent', 'autonomous', 'executor',
  'trade', 'position', 'order', 'fill',
  'market', 'limit', 'stop',
  'long_position', 'short_position',
  'risk', 'reward', 'breakeven',
  'cooldown', 'regime', 'sentiment',
  'news', 'impact', 'high_impact', 'low_impact',
] as const;

// ─── Tier A Glossaries (6 languages, full 100% coverage) ─────

const GLOSSARY_AR: GlossaryEntries = {
  buy: 'شراء', sell: 'بيع', hold: 'انتظار', long: 'مركز طويل', short: 'مركز قصير',
  stop_loss: 'وقف الخسارة', take_profit: 'جني الأرباح',
  entry_price: 'سعر الدخول', exit_price: 'سعر الخروج',
  leverage: 'الرافعة المالية', margin: 'الهامش', margin_call: 'نداء الهامش', liquidation: 'تصفية',
  pnl: 'الربح والخسارة', unrealized_pnl: 'الربح غير المحقق', realized_pnl: 'الربح المحقق',
  win_rate: 'نسبة الفوز', profit_factor: 'معامل الربحية', risk_reward_ratio: 'نسبة المخاطرة/العائد',
  bullish: 'صعودي', bearish: 'هبوطي', neutral: 'محايد',
  volatility: 'التقلب', trend: 'الاتجاه', range: 'عرضي', breakout: 'اختراق', reversal: 'انعكاس',
  support: 'الدعم', resistance: 'المقاومة',
  lot: 'لوت', pip: 'نقطة', spread: 'السبريد', slippage: 'الانزلاق السعري',
  candle: 'شمعة', timeframe: 'الإطار الزمني',
  m1: 'دقيقة', m5: '5 دقائق', m15: '15 دقيقة', h1: 'ساعة', h4: '4 ساعات', d1: 'يومي',
  rsi: 'مؤشر القوة النسبية', macd: 'ماكد', ema: 'المتوسط المتحرك الأسي', sma: 'المتوسط المتحرك البسيط',
  forex: 'الفوركس', crypto: 'العملات الرقمية', commodity: 'السلع', index: 'المؤشرات',
  council: 'المجلس', consensus: 'الإجماع', vote: 'تصويت', brief: 'وثيقة تداول',
  agent: 'الوكيل', autonomous: 'مستقل', executor: 'المنفذ',
  trade: 'صفقة', position: 'مركز', order: 'أمر', fill: 'تنفيذ',
  market: 'سوق', limit: 'محدد', stop: 'وقف',
  long_position: 'مركز شراء', short_position: 'مركز بيع',
  risk: 'مخاطرة', reward: 'عائد', breakeven: 'نقطة التعادل',
  cooldown: 'تبريد', regime: 'الوضع السوقي', sentiment: 'المشاعر',
  news: 'أخبار', impact: 'تأثير', high_impact: 'تأثير عالي', low_impact: 'تأثير منخفض',
};

const GLOSSARY_EN: GlossaryEntries = {
  buy: 'Buy', sell: 'Sell', hold: 'Hold', long: 'Long', short: 'Short',
  stop_loss: 'Stop-Loss', take_profit: 'Take-Profit',
  entry_price: 'Entry Price', exit_price: 'Exit Price',
  leverage: 'Leverage', margin: 'Margin', margin_call: 'Margin Call', liquidation: 'Liquidation',
  pnl: 'P&L', unrealized_pnl: 'Unrealized P&L', realized_pnl: 'Realized P&L',
  win_rate: 'Win Rate', profit_factor: 'Profit Factor', risk_reward_ratio: 'Risk/Reward Ratio',
  bullish: 'Bullish', bearish: 'Bearish', neutral: 'Neutral',
  volatility: 'Volatility', trend: 'Trend', range: 'Range', breakout: 'Breakout', reversal: 'Reversal',
  support: 'Support', resistance: 'Resistance',
  lot: 'Lot', pip: 'Pip', spread: 'Spread', slippage: 'Slippage',
  candle: 'Candle', timeframe: 'Timeframe',
  m1: '1m', m5: '5m', m15: '15m', h1: '1H', h4: '4H', d1: '1D',
  rsi: 'RSI', macd: 'MACD', ema: 'EMA', sma: 'SMA',
  forex: 'Forex', crypto: 'Crypto', commodity: 'Commodity', index: 'Index',
  council: 'Council', consensus: 'Consensus', vote: 'Vote', brief: 'Brief',
  agent: 'Agent', autonomous: 'Autonomous', executor: 'Executor',
  trade: 'Trade', position: 'Position', order: 'Order', fill: 'Fill',
  market: 'Market', limit: 'Limit', stop: 'Stop',
  long_position: 'Long Position', short_position: 'Short Position',
  risk: 'Risk', reward: 'Reward', breakeven: 'Break-Even',
  cooldown: 'Cooldown', regime: 'Regime', sentiment: 'Sentiment',
  news: 'News', impact: 'Impact', high_impact: 'High Impact', low_impact: 'Low Impact',
};

const GLOSSARY_ES: GlossaryEntries = {
  buy: 'Comprar', sell: 'Vender', hold: 'Mantener', long: 'Largo', short: 'Corto',
  stop_loss: 'Stop-Loss', take_profit: 'Take-Profit',
  entry_price: 'Precio de Entrada', exit_price: 'Precio de Salida',
  leverage: 'Apalancamiento', margin: 'Margen', margin_call: 'Llamada de Margen', liquidation: 'Liquidación',
  pnl: 'Ganancias/Pérdidas', unrealized_pnl: 'G/P No Realizado', realized_pnl: 'G/P Realizado',
  win_rate: 'Tasa de Acierto', profit_factor: 'Factor de Beneficio', risk_reward_ratio: 'Ratio Riesgo/Beneficio',
  bullish: 'Alcista', bearish: 'Bajista', neutral: 'Neutral',
  volatility: 'Volatilidad', trend: 'Tendencia', range: 'Rango', breakout: 'Ruptura', reversal: 'Reversión',
  support: 'Soporte', resistance: 'Resistencia',
  lot: 'Lote', pip: 'Pip', spread: 'Spread', slippage: 'Deslizamiento',
  candle: 'Vela', timeframe: 'Marco Temporal',
  m1: '1m', m5: '5m', m15: '15m', h1: '1H', h4: '4H', d1: '1D',
  rsi: 'RSI', macd: 'MACD', ema: 'EMA', sma: 'SMA',
  forex: 'Forex', crypto: 'Cripto', commodity: 'Materias Primas', index: 'Índice',
  council: 'Consejo', consensus: 'Consenso', vote: 'Voto', brief: 'Informe',
  agent: 'Agente', autonomous: 'Autónomo', executor: 'Ejecutor',
  trade: 'Operación', position: 'Posición', order: 'Orden', fill: 'Ejecución',
  market: 'Mercado', limit: 'Limitada', stop: 'Stop',
  long_position: 'Posición Larga', short_position: 'Posición Corta',
  risk: 'Riesgo', reward: 'Beneficio', breakeven: 'Punto de Equilibrio',
  cooldown: 'Enfriamiento', regime: 'Régimen', sentiment: 'Sentimiento',
  news: 'Noticias', impact: 'Impacto', high_impact: 'Alto Impacto', low_impact: 'Bajo Impacto',
};

const GLOSSARY_FR: GlossaryEntries = {
  buy: 'Acheter', sell: 'Vendre', hold: 'Conserver', long: 'Long', short: 'Short',
  stop_loss: 'Stop-Loss', take_profit: 'Take-Profit',
  entry_price: "Prix d'Entrée", exit_price: 'Prix de Sortie',
  leverage: 'Levier', margin: 'Marge', margin_call: 'Appel de Marge', liquidation: 'Liquidation',
  pnl: 'P&L', unrealized_pnl: 'P&L Non Réalisé', realized_pnl: 'P&L Réalisé',
  win_rate: 'Taux de Réussite', profit_factor: 'Facteur de Profit', risk_reward_ratio: 'Ratio Risque/Récompense',
  bullish: 'Haussier', bearish: 'Baissier', neutral: 'Neutre',
  volatility: 'Volatilité', trend: 'Tendance', range: 'Range', breakout: 'Cassure', reversal: 'Renversement',
  support: 'Support', resistance: 'Résistance',
  lot: 'Lot', pip: 'Pip', spread: 'Spread', slippage: 'Glissement',
  candle: 'Bougie', timeframe: 'Unité de Temps',
  m1: '1m', m5: '5m', m15: '15m', h1: '1H', h4: '4H', d1: '1D',
  rsi: 'RSI', macd: 'MACD', ema: 'EMA', sma: 'SMA',
  forex: 'Forex', crypto: 'Crypto', commodity: 'Matières Premières', index: 'Indice',
  council: 'Conseil', consensus: 'Consensus', vote: 'Vote', brief: 'Brief',
  agent: 'Agent', autonomous: 'Autonome', executor: 'Exécuteur',
  trade: 'Trade', position: 'Position', order: 'Ordre', fill: 'Exécution',
  market: 'Marché', limit: 'Limitée', stop: 'Stop',
  long_position: 'Position Longue', short_position: 'Position Courte',
  risk: 'Risque', reward: 'Récompense', breakeven: 'Point Mort',
  cooldown: 'Repos', regime: 'Régime', sentiment: 'Sentiment',
  news: 'Actualités', impact: 'Impact', high_impact: 'Impact Élevé', low_impact: 'Faible Impact',
};

const GLOSSARY_DE: GlossaryEntries = {
  buy: 'Kaufen', sell: 'Verkaufen', hold: 'Halten', long: 'Long', short: 'Short',
  stop_loss: 'Stop-Loss', take_profit: 'Take-Profit',
  entry_price: 'Einstiegspreis', exit_price: 'Ausstiegspreis',
  leverage: 'Hebel', margin: 'Margin', margin_call: 'Margin-Call', liquidation: 'Liquidation',
  pnl: 'G/V', unrealized_pnl: 'Unrealisierte G/V', realized_pnl: 'Realisierte G/V',
  win_rate: 'Trefferquote', profit_factor: 'Profit-Faktor', risk_reward_ratio: 'Risk/Reward-Verhältnis',
  bullish: 'Bullisch', bearish: 'Bärisch', neutral: 'Neutral',
  volatility: 'Volatilität', trend: 'Trend', range: 'Range', breakout: 'Ausbruch', reversal: 'Umkehr',
  support: 'Unterstützung', resistance: 'Widerstand',
  lot: 'Lot', pip: 'Pip', spread: 'Spread', slippage: 'Slippage',
  candle: 'Kerze', timeframe: 'Zeiteinheit',
  m1: '1m', m5: '5m', m15: '15m', h1: '1H', h4: '4H', d1: '1D',
  rsi: 'RSI', macd: 'MACD', ema: 'EMA', sma: 'SMA',
  forex: 'Forex', crypto: 'Krypto', commodity: 'Rohstoffe', index: 'Index',
  council: 'Rat', consensus: 'Konsens', vote: 'Abstimmung', brief: 'Briefing',
  agent: 'Agent', autonomous: 'Autonom', executor: 'Ausführer',
  trade: 'Trade', position: 'Position', order: 'Order', fill: 'Ausführung',
  market: 'Market', limit: 'Limit', stop: 'Stop',
  long_position: 'Long-Position', short_position: 'Short-Position',
  risk: 'Risiko', reward: 'Belohnung', breakeven: 'Break-Even',
  cooldown: 'Abkühlung', regime: 'Regime', sentiment: 'Stimmung',
  news: 'Nachrichten', impact: 'Auswirkung', high_impact: 'Hohe Auswirkung', low_impact: 'Geringe Auswirkung',
};

const GLOSSARY_RU: GlossaryEntries = {
  buy: 'Покупка', sell: 'Продажа', hold: 'Удержание', long: 'Лонг', short: 'Шорт',
  stop_loss: 'Стоп-Лосс', take_profit: 'Тейк-Профит',
  entry_price: 'Цена входа', exit_price: 'Цена выхода',
  leverage: 'Кредитное плечо', margin: 'Маржа', margin_call: 'Маржин-колл', liquidation: 'Ликвидация',
  pnl: 'Прибыль/Убыток', unrealized_pnl: 'Нереализованная П/У', realized_pnl: 'Реализованная П/У',
  win_rate: 'Винрейт', profit_factor: 'Прибыльный фактор', risk_reward_ratio: 'Соотношение Риск/Прибыль',
  bullish: 'Бычий', bearish: 'Медвежий', neutral: 'Нейтральный',
  volatility: 'Волатильность', trend: 'Тренд', range: 'Боковик', breakout: 'Пробой', reversal: 'Разворот',
  support: 'Поддержка', resistance: 'Сопротивление',
  lot: 'Лот', pip: 'Пипс', spread: 'Спред', slippage: 'Проскальзывание',
  candle: 'Свеча', timeframe: 'Таймфрейм',
  m1: '1м', m5: '5м', m15: '15м', h1: '1Ч', h4: '4Ч', d1: '1Д',
  rsi: 'RSI', macd: 'MACD', ema: 'EMA', sma: 'SMA',
  forex: 'Форекс', crypto: 'Крипто', commodity: 'Сырьё', index: 'Индекс',
  council: 'Совет', consensus: 'Консенсус', vote: 'Голос', brief: 'Бриф',
  agent: 'Агент', autonomous: 'Автономный', executor: 'Исполнитель',
  trade: 'Сделка', position: 'Позиция', order: 'Ордер', fill: 'Исполнение',
  market: 'Маркет', limit: 'Лимит', stop: 'Стоп',
  long_position: 'Лонг-позиция', short_position: 'Шорт-позиция',
  risk: 'Риск', reward: 'Прибыль', breakeven: 'Безубыток',
  cooldown: 'Охлаждение', regime: 'Режим', sentiment: 'Настроение',
  news: 'Новости', impact: 'Влияние', high_impact: 'Высокое влияние', low_impact: 'Низкое влияние',
};

// ─── Tier B Glossaries (12 languages — subset: top 30 terms) ──
// نكتفي بـ 30 مصطلحًا أساسيًا للطبقة B (لتوفير المساحة)

const GLOSSARY_ZH: GlossaryEntries = {
  buy: '买入', sell: '卖出', hold: '持有', long: '做多', short: '做空',
  stop_loss: '止损', take_profit: '止盈',
  entry_price: '入场价', exit_price: '出场价',
  leverage: '杠杆', margin: '保证金', margin_call: '追加保证金', liquidation: '清算',
  pnl: '盈亏', unrealized_pnl: '未实现盈亏', realized_pnl: '已实现盈亏',
  win_rate: '胜率', profit_factor: '盈亏比', risk_reward_ratio: '风险回报比',
  bullish: '看涨', bearish: '看跌', neutral: '中性',
  volatility: '波动性', trend: '趋势', range: '区间', breakout: '突破', reversal: '反转',
  support: '支撑', resistance: '阻力',
  lot: '手', pip: '点', spread: '点差', slippage: '滑点',
  candle: 'K线', timeframe: '时间框架',
  m1: '1分', m5: '5分', m15: '15分', h1: '1小时', h4: '4小时', d1: '日线',
  rsi: 'RSI', macd: 'MACD', ema: 'EMA', sma: 'SMA',
  forex: '外汇', crypto: '加密货币', commodity: '商品', index: '指数',
  council: '委员会', consensus: '共识', vote: '投票', brief: '简报',
  agent: '代理', autonomous: '自主', executor: '执行器',
  trade: '交易', position: '仓位', order: '订单', fill: '成交',
  market: '市价', limit: '限价', stop: '止损',
  long_position: '多头仓位', short_position: '空头仓位',
  risk: '风险', reward: '回报', breakeven: '盈亏平衡',
  cooldown: '冷却', regime: '市场状态', sentiment: '情绪',
  news: '新闻', impact: '影响', high_impact: '高影响', low_impact: '低影响',
};

const GLOSSARY_JA: GlossaryEntries = {
  buy: '買い', sell: '売り', hold: 'ホールド', long: 'ロング', short: 'ショート',
  stop_loss: 'ストップロス', take_profit: 'テイクプロフィット',
  entry_price: 'エントリー価格', exit_price: '決済価格',
  leverage: 'レバレッジ', margin: '証拠金', margin_call: 'マージンコール', liquidation: '清算',
  pnl: '損益', unrealized_pnl: '評価損益', realized_pnl: '実現損益',
  win_rate: '勝率', profit_factor: 'プロフィットファクター', risk_reward_ratio: 'リスクリワード比',
  bullish: '強気', bearish: '弱気', neutral: '中立',
  volatility: 'ボラティリティ', trend: 'トレンド', range: 'レンジ', breakout: 'ブレイクアウト', reversal: '反転',
  support: 'サポート', resistance: 'レジスタンス',
  lot: 'ロット', pip: 'ピップ', spread: 'スプレッド', slippage: 'スリッページ',
  candle: 'ローソク足', timeframe: '時間足',
  m1: '1分', m5: '5分', m15: '15分', h1: '1時間', h4: '4時間', d1: '日足',
  rsi: 'RSI', macd: 'MACD', ema: 'EMA', sma: 'SMA',
  forex: 'フォレックス', crypto: '暗号資産', commodity: '商品', index: '指数',
  council: '評議会', consensus: 'コンセンサス', vote: '投票', brief: 'ブリーフ',
  agent: 'エージェント', autonomous: '自律', executor: 'エグゼキューター',
  trade: 'トレード', position: 'ポジション', order: '注文', fill: '約定',
  market: '成行', limit: '指値', stop: 'ストップ',
  long_position: 'ロングポジション', short_position: 'ショートポジション',
  risk: 'リスク', reward: 'リターン', breakeven: '損益分岐点',
  cooldown: 'クールダウン', regime: 'レジーム', sentiment: 'センチメント',
  news: 'ニュース', impact: '影響', high_impact: '高影響', low_impact: '低影響',
};

const GLOSSARY_KO: GlossaryEntries = {
  buy: '매수', sell: '매도', hold: '보유', long: '롱', short: '숏',
  stop_loss: '스탑로스', take_profit: '테이크프로핏',
  entry_price: '진입가', exit_price: '청산가',
  leverage: '레버리지', margin: '마진', margin_call: '마진콜', liquidation: '청산',
  pnl: '손익', unrealized_pnl: '평가손익', realized_pnl: '실현손익',
  win_rate: '승률', profit_factor: '프로핏팩터', risk_reward_ratio: '리스크리워드비',
  bullish: '상승', bearish: '하락', neutral: '중립',
  volatility: '변동성', trend: '추세', range: '박스권', breakout: '돌파', reversal: '반전',
  support: '지지', resistance: '저항',
  lot: '랏', pip: '핍', spread: '스프레드', slippage: '슬리피지',
  candle: '캔들', timeframe: '타임프레임',
  m1: '1분', m5: '5분', m15: '15분', h1: '1시간', h4: '4시간', d1: '일봉',
  rsi: 'RSI', macd: 'MACD', ema: 'EMA', sma: 'SMA',
  forex: '포렉스', crypto: '암호화폐', commodity: '상품', index: '지수',
  council: '평의회', consensus: '합의', vote: '투표', brief: '브리프',
  agent: '에이전트', autonomous: '자율', executor: '실행자',
  trade: '거래', position: '포지션', order: '주문', fill: '체결',
  market: '시장가', limit: '지정가', stop: '스탑',
  long_position: '롱포지션', short_position: '숏포지션',
  risk: '리스크', reward: '보상', breakeven: '손익분기점',
  cooldown: '쿨다운', regime: '레짐', sentiment: '센티먼트',
  news: '뉴스', impact: '영향', high_impact: '고영향', low_impact: '저영향',
};

const GLOSSARY_TR: GlossaryEntries = {
  buy: 'Al', sell: 'Sat', hold: 'Tut', long: 'Long', short: 'Short',
  stop_loss: 'Stop-Loss', take_profit: 'Take-Profit',
  entry_price: 'Giriş Fiyatı', exit_price: 'Çıkış Fiyatı',
  leverage: 'Kaldıraç', margin: 'Teminat', margin_call: 'Teminat Tamamlama', liquidation: 'Likidasyon',
  pnl: 'K/Z', unrealized_pnl: 'Gerçekleşmemiş K/Z', realized_pnl: 'Gerçekleşmiş K/Z',
  win_rate: 'Kazanma Oranı', profit_factor: 'Kar Faktörü', risk_reward_ratio: 'Risk/Ödül Oranı',
  bullish: 'Yükseliş', bearish: 'Düşüş', neutral: 'Nötr',
  volatility: 'Oynaklık', trend: 'Trend', range: 'Yatay', breakout: 'Kırılım', reversal: 'Dönüş',
  support: 'Destek', resistance: 'Direnç',
  lot: 'Lot', pip: 'Pip', spread: 'Spread', slippage: 'Kayma',
  candle: 'Mum', timeframe: 'Zaman Dilimi',
  m1: '1dk', m5: '5dk', m15: '15dk', h1: '1S', h4: '4S', d1: '1G',
  rsi: 'RSI', macd: 'MACD', ema: 'EMA', sma: 'SMA',
  forex: 'Forex', crypto: 'Kripto', commodity: 'Emtia', index: 'Endeks',
  council: 'Konsey', consensus: 'Konsensüs', vote: 'Oy', brief: 'Brifing',
  agent: 'Ajan', autonomous: 'Otonom', executor: 'Yürütücü',
  trade: 'İşlem', position: 'Pozisyon', order: 'Emir', fill: 'Gerçekleşme',
  market: 'Piyasa', limit: 'Limit', stop: 'Stop',
  long_position: 'Long Pozisyon', short_position: 'Short Pozisyon',
  risk: 'Risk', reward: 'Ödül', breakeven: 'Başabaş',
  cooldown: 'Soğuma', regime: 'Rejim', sentiment: 'Duygu',
  news: 'Haberler', impact: 'Etki', high_impact: 'Yüksek Etki', low_impact: 'Düşük Etki',
};

const GLOSSARY_FA: GlossaryEntries = {
  buy: 'خرید', sell: 'فروش', hold: 'نگه داشتن', long: 'لانگ', short: 'شورت',
  stop_loss: 'حد ضرر', take_profit: 'حد سود',
  entry_price: 'قیمت ورود', exit_price: 'قیمت خروج',
  leverage: 'اهرم', margin: 'حاشیه', margin_call: 'فراخوانی حاشیه', liquidation: 'لیکوئید شدن',
  pnl: 'سود/زیان', unrealized_pnl: 'سود/زیان محقق نشده', realized_pnl: 'سود/زیان محقق شده',
  win_rate: 'نرخ برد', profit_factor: 'ضریب سود', risk_reward_ratio: 'نسبت ریسک/بازده',
  bullish: 'صعودی', bearish: 'نزولی', neutral: 'خنثی',
  volatility: 'نوسان', trend: 'روند', range: 'رنج', breakout: 'شکست', reversal: 'بازگشت',
  support: 'حمایت', resistance: 'مقاومت',
  lot: 'لات', pip: 'پیپ', spread: 'اسپرد', slippage: 'لغزش',
  candle: 'کندل', timeframe: 'تایم فریم',
  m1: '۱دقیقه', m5: '۵دقیقه', m15: '۱۵دقیقه', h1: '۱ساعت', h4: '۴ساعت', d1: 'روزانه',
  rsi: 'RSI', macd: 'MACD', ema: 'EMA', sma: 'SMA',
  forex: 'فارکس', crypto: 'ارز دیجیتال', commodity: 'کالا', index: 'شاخص',
  council: 'شورا', consensus: 'اجماع', vote: 'رأی', brief: 'بریف',
  agent: 'عامل', autonomous: 'خودمختار', executor: 'اجراکننده',
  trade: 'معامله', position: 'پوزیشن', order: 'سفارش', fill: 'اجرا',
  market: 'بازار', limit: 'محدود', stop: 'استاپ',
  long_position: 'پوزیشن لانگ', short_position: 'پوزیشن شورت',
  risk: 'ریسک', reward: 'بازده', breakeven: 'نقطه سربه سر',
  cooldown: 'خنک شدن', regime: 'رژیم', sentiment: 'احساسات',
  news: 'اخبار', impact: 'تأثیر', high_impact: 'تأثیر بالا', low_impact: 'تأثیر کم',
};

const GLOSSARY_PT: GlossaryEntries = {
  buy: 'Comprar', sell: 'Vender', hold: 'Manter', long: 'Long', short: 'Short',
  stop_loss: 'Stop-Loss', take_profit: 'Take-Profit',
  entry_price: 'Preço de Entrada', exit_price: 'Preço de Saída',
  leverage: 'Alavancagem', margin: 'Margem', margin_call: 'Chamada de Margem', liquidation: 'Liquidação',
  pnl: 'L/P', unrealized_pnl: 'L/P Não Realizado', realized_pnl: 'L/P Realizado',
  win_rate: 'Taxa de Acerto', profit_factor: 'Fator de Lucro', risk_reward_ratio: 'Razão Risco/Retorno',
  bullish: 'Alta', bearish: 'Baixa', neutral: 'Neutro',
  volatility: 'Volatilidade', trend: 'Tendência', range: 'Lateral', breakout: 'Rompimento', reversal: 'Reversão',
  support: 'Suporte', resistance: 'Resistência',
  lot: 'Lote', pip: 'Pip', spread: 'Spread', slippage: 'Deslizamento',
  candle: 'Candle', timeframe: 'Tempo Gráfico',
  m1: '1m', m5: '5m', m15: '15m', h1: '1H', h4: '4H', d1: '1D',
  rsi: 'RSI', macd: 'MACD', ema: 'EMA', sma: 'SMA',
  forex: 'Forex', crypto: 'Cripto', commodity: 'Commodities', index: 'Índice',
  council: 'Conselho', consensus: 'Consenso', vote: 'Voto', brief: 'Brief',
  agent: 'Agente', autonomous: 'Autônomo', executor: 'Executor',
  trade: 'Trade', position: 'Posição', order: 'Ordem', fill: 'Execução',
  market: 'Mercado', limit: 'Limitada', stop: 'Stop',
  long_position: 'Posição Comprada', short_position: 'Posição Vendida',
  risk: 'Risco', reward: 'Retorno', breakeven: 'Ponto de Equilíbrio',
  cooldown: 'Resfriamento', regime: 'Regime', sentiment: 'Sentimento',
  news: 'Notícias', impact: 'Impacto', high_impact: 'Alto Impacto', low_impact: 'Baixo Impacto',
};

const GLOSSARY_IT: GlossaryEntries = {
  buy: 'Compra', sell: 'Vendi', hold: 'Mantieni', long: 'Long', short: 'Short',
  stop_loss: 'Stop-Loss', take_profit: 'Take-Profit',
  entry_price: 'Prezzo di Entrata', exit_price: 'Prezzo di Uscita',
  leverage: 'Leva', margin: 'Margine', margin_call: 'Margin Call', liquidation: 'Liquidazione',
  pnl: 'P&L', unrealized_pnl: 'P&L Non Realizzato', realized_pnl: 'P&L Realizzato',
  win_rate: 'Win Rate', profit_factor: 'Profit Factor', risk_reward_ratio: 'Rapporto Rischio/Rendimento',
  bullish: 'Rialzista', bearish: 'Ribassista', neutral: 'Neutro',
  volatility: 'Volatilità', trend: 'Trend', range: 'Range', breakout: 'Rottura', reversal: 'Inversione',
  support: 'Supporto', resistance: 'Resistenza',
  lot: 'Lot', pip: 'Pip', spread: 'Spread', slippage: 'Slippage',
  candle: 'Candela', timeframe: 'Timeframe',
  m1: '1m', m5: '5m', m15: '15m', h1: '1H', h4: '4H', d1: '1D',
  rsi: 'RSI', macd: 'MACD', ema: 'EMA', sma: 'SMA',
  forex: 'Forex', crypto: 'Cripto', commodity: 'Materie Prime', index: 'Indice',
  council: 'Consiglio', consensus: 'Consenso', vote: 'Voto', brief: 'Brief',
  agent: 'Agente', autonomous: 'Autonomo', executor: 'Esecutore',
  trade: 'Trade', position: 'Posizione', order: 'Ordine', fill: 'Esecuzione',
  market: 'Market', limit: 'Limit', stop: 'Stop',
  long_position: 'Posizione Long', short_position: 'Posizione Short',
  risk: 'Rischio', reward: 'Rendimento', breakeven: 'Pareggio',
  cooldown: 'Raffreddamento', regime: 'Regime', sentiment: 'Sentiment',
  news: 'Notizie', impact: 'Impatto', high_impact: 'Alto Impatto', low_impact: 'Basso Impatto',
};

const GLOSSARY_NL: GlossaryEntries = {
  buy: 'Kopen', sell: 'Verkopen', hold: 'Vasthouden', long: 'Long', short: 'Short',
  stop_loss: 'Stop-Loss', take_profit: 'Take-Profit',
  entry_price: 'Instapprijs', exit_price: 'Uitstapprijs',
  leverage: 'Hefboom', margin: 'Margin', margin_call: 'Margin Call', liquidation: 'Liquidatie',
  pnl: 'W/V', unrealized_pnl: 'Ongerealiseerde W/V', realized_pnl: 'Gerealiseerde W/V',
  win_rate: 'Winstpercentage', profit_factor: 'Winstfactor', risk_reward_ratio: 'Risico/Rendement Verhouding',
  bullish: 'Bullish', bearish: 'Bearish', neutral: 'Neutraal',
  volatility: 'Volatiliteit', trend: 'Trend', range: 'Range', breakout: 'Uitbraak', reversal: 'Omkeer',
  support: 'Support', resistance: 'Weerstand',
  lot: 'Lot', pip: 'Pip', spread: 'Spread', slippage: 'Slippage',
  candle: 'Candle', timeframe: 'Timeframe',
  m1: '1m', m5: '5m', m15: '15m', h1: '1H', h4: '4H', d1: '1D',
  rsi: 'RSI', macd: 'MACD', ema: 'EMA', sma: 'SMA',
  forex: 'Forex', crypto: 'Crypto', commodity: 'Grondstoffen', index: 'Index',
  council: 'Raad', consensus: 'Consensus', vote: 'Stem', brief: 'Brief',
  agent: 'Agent', autonomous: 'Autonoom', executor: 'Uitvoerder',
  trade: 'Trade', position: 'Positie', order: 'Order', fill: 'Uitvoering',
  market: 'Market', limit: 'Limit', stop: 'Stop',
  long_position: 'Long Positie', short_position: 'Short Positie',
  risk: 'Risico', reward: 'Rendement', breakeven: 'Break-Even',
  cooldown: 'Afkoeling', regime: 'Regime', sentiment: 'Sentiment',
  news: 'Nieuws', impact: 'Impact', high_impact: 'Hoge Impact', low_impact: 'Lage Impact',
};

const GLOSSARY_PL: GlossaryEntries = {
  buy: 'Kup', sell: 'Sprzedaj', hold: 'Trzymaj', long: 'Long', short: 'Short',
  stop_loss: 'Stop-Loss', take_profit: 'Take-Profit',
  entry_price: 'Cena Wejścia', exit_price: 'Cena Wyjścia',
  leverage: 'Dźwignia', margin: 'Depozyt', margin_call: 'Wezwanie do Depozytu', liquidation: 'Likwidacja',
  pnl: 'Zysk/Strata', unrealized_pnl: 'Niezrealizowany Z/S', realized_pnl: 'Zrealizowany Z/S',
  win_rate: 'Skuteczność', profit_factor: 'Współczynnik Zysku', risk_reward_ratio: 'Stosunek Ryzyko/Zysk',
  bullish: 'Wzrostowy', bearish: 'Spadkowy', neutral: 'Neutralny',
  volatility: 'Zmienność', trend: 'Trend', range: 'Konsolidacja', breakout: 'Wybicie', reversal: 'Odwrócenie',
  support: 'Wsparcie', resistance: 'Opór',
  lot: 'Lot', pip: 'Pip', spread: 'Spread', slippage: 'Poślizg',
  candle: 'Świeca', timeframe: 'Interwał',
  m1: '1m', m5: '5m', m15: '15m', h1: '1H', h4: '4H', d1: '1D',
  rsi: 'RSI', macd: 'MACD', ema: 'EMA', sma: 'SMA',
  forex: 'Forex', crypto: 'Krypto', commodity: 'Surowce', index: 'Indeks',
  council: 'Rada', consensus: 'Konsensus', vote: 'Głos', brief: 'Brief',
  agent: 'Agent', autonomous: 'Autonomiczny', executor: 'Wykonawca',
  trade: 'Trade', position: 'Pozycja', order: 'Zlecenie', fill: 'Realizacja',
  market: 'Market', limit: 'Limit', stop: 'Stop',
  long_position: 'Pozycja Long', short_position: 'Pozycja Short',
  risk: 'Ryzyko', reward: 'Zysk', breakeven: 'Punkt Wyjścia',
  cooldown: 'Wychłodzenie', regime: 'Reżim', sentiment: 'Sentyment',
  news: 'Wiadomości', impact: 'Wpływ', high_impact: 'Wysoki Wpływ', low_impact: 'Niski Wpływ',
};

const GLOSSARY_HI: GlossaryEntries = {
  buy: 'खरीद', sell: 'बेच', hold: 'होल्ड', long: 'लॉन्ग', short: 'शॉर्ट',
  stop_loss: 'स्टॉप-लॉस', take_profit: 'टेक-प्रॉफिट',
  entry_price: 'एंट्री मूल्य', exit_price: 'एग्जिट मूल्य',
  leverage: 'लीवरेज', margin: 'मार्जिन', margin_call: 'मार्जिन कॉल', liquidation: 'लिक्विडेशन',
  pnl: 'लाभ/हानि', unrealized_pnl: 'अनरियलाइज्ड लाभ/हानि', realized_pnl: 'रियलाइज्ड लाभ/हानि',
  win_rate: 'जीत दर', profit_factor: 'प्रॉफिट फैक्टर', risk_reward_ratio: 'जोखिम/लाभ अनुपात',
  bullish: 'तेजी', bearish: 'मंदी', neutral: 'तटस्थ',
  volatility: 'अस्थिरता', trend: 'ट्रेंड', range: 'रेंज', breakout: 'ब्रेकआउट', reversal: 'उलटफेर',
  support: 'सपोर्ट', resistance: 'रेजिस्टेंस',
  lot: 'लॉट', pip: 'पिप', spread: 'स्प्रेड', slippage: 'स्लिपेज',
  candle: 'कैंडल', timeframe: 'टाइमफ्रेम',
  m1: '1मि', m5: '5मि', m15: '15मि', h1: '1घ', h4: '4घ', d1: '1दि',
  rsi: 'RSI', macd: 'MACD', ema: 'EMA', sma: 'SMA',
  forex: 'फॉरेक्स', crypto: 'क्रिप्टो', commodity: 'कमोडिटी', index: 'इंडेक्स',
  council: 'परिषद', consensus: 'सर्वसम्मति', vote: 'वोट', brief: 'ब्रीफ',
  agent: 'एजेंट', autonomous: 'स्वायत्त', executor: 'निष्पादक',
  trade: 'ट्रेड', position: 'पोजीशन', order: 'ऑर्डर', fill: 'निष्पादन',
  market: 'मार्केट', limit: 'लिमिट', stop: 'स्टॉप',
  long_position: 'लॉन्ग पोजीशन', short_position: 'शॉर्ट पोजीशन',
  risk: 'जोखिम', reward: 'लाभ', breakeven: 'ब्रेकईवन',
  cooldown: 'कूलडाउन', regime: 'रेजिम', sentiment: 'सेंटीमेंट',
  news: 'समाचार', impact: 'प्रभाव', high_impact: 'उच्च प्रभाव', low_impact: 'निम्न प्रभाव',
};

// ─── All Glossaries Map ──────────────────────────────────────
const ALL_GLOSSARIES: Record<string, GlossaryEntries> = {
  ar: GLOSSARY_AR,
  en: GLOSSARY_EN,
  es: GLOSSARY_ES,
  fr: GLOSSARY_FR,
  de: GLOSSARY_DE,
  ru: GLOSSARY_RU,
  zh: GLOSSARY_ZH,
  ja: GLOSSARY_JA,
  ko: GLOSSARY_KO,
  tr: GLOSSARY_TR,
  fa: GLOSSARY_FA,
  pt: GLOSSARY_PT,
  it: GLOSSARY_IT,
  nl: GLOSSARY_NL,
  pl: GLOSSARY_PL,
  hi: GLOSSARY_HI,
};

@Injectable()
export class FinancialGlossaryService {
  private readonly logger = new Logger(FinancialGlossaryService.name);

  constructor() {
    const count = Object.keys(ALL_GLOSSARIES).length;
    const avgSize = Math.round(
      Object.values(ALL_GLOSSARIES).reduce((s, g) => s + Object.keys(g).length, 0) / count,
    );
    this.logger.log(
      `📚 FinancialGlossaryService initialized — ${count} languages, ~${avgSize} terms each`,
    );
  }

  /**
   * يرجع القاموس المالي للغة المطلوبة
   */
  getGlossary(language: string): GlossaryEntries | null {
    const normalized = (language || 'ar').toLowerCase().slice(0, 2);
    return ALL_GLOSSARIES[normalized] ?? null;
  }

  /**
   * هل يوجد قاموس لهذه اللغة؟
   */
  hasGlossary(language: string): boolean {
    const normalized = (language || 'ar').toLowerCase().slice(0, 2);
    return normalized in ALL_GLOSSARIES;
  }

  /**
   * يرجع ترجمة مصطلح محدد
   */
  translate(term: string, language: string): string | null {
    const glossary = this.getGlossary(language);
    if (!glossary) return null;
    const key = term.toLowerCase().replace(/[-\s]/g, '_');
    return glossary[key] ?? null;
  }

  /**
   * يبني نص القاموس للـ LLM prompt
   * مثال:
   *   "═══ Financial Glossary (Arabic) ═══
   *    buy → شراء
   *    sell → بيع
   *    ..."
   */
  buildGlossaryPrompt(language: string): string {
    const glossary = this.getGlossary(language);
    if (!glossary) return '';

    const langName = this._getLanguageName(language);
    const parts: string[] = [`═══ Financial Glossary (${langName}) ═══`];

    // رتّب حسب المفتاح لقراءة أسهل
    const sortedKeys = Object.keys(glossary).sort();
    for (const key of sortedKeys) {
      parts.push(`${key} → ${glossary[key]}`);
    }

    parts.push('');
    parts.push(
      'IMPORTANT: Use these exact terms when discussing financial concepts. Do not improvise translations for technical terms.',
    );

    return parts.join('\n');
  }

  /**
   * يرجع إحصائيات القاموس
   */
  getStats(): {
    totalLanguages: number;
    totalTerms: number;
    avgTermsPerLanguage: number;
    languages: Array<{ code: string; termCount: number }>;
  } {
    const languages = Object.entries(ALL_GLOSSARIES).map(([code, entries]) => ({
      code,
      termCount: Object.keys(entries).length,
    }));

    const totalTerms = languages.reduce((s, l) => s + l.termCount, 0);

    return {
      totalLanguages: languages.length,
      totalTerms,
      avgTermsPerLanguage: Math.round(totalTerms / languages.length),
      languages: languages.sort((a, b) => b.termCount - a.termCount),
    };
  }

  /**
   * قائمة المفاتيح المدعومة (للـ admin UI)
   */
  getSupportedKeys(): readonly string[] {
    return GLOSSARY_KEYS;
  }

  private _getLanguageName(language: string): string {
    const names: Record<string, string> = {
      ar: 'Arabic', en: 'English', es: 'Spanish', fr: 'French', de: 'German', ru: 'Russian',
      zh: 'Chinese', ja: 'Japanese', ko: 'Korean', tr: 'Turkish', fa: 'Persian',
      pt: 'Portuguese', it: 'Italian', nl: 'Dutch', pl: 'Polish', hi: 'Hindi',
    };
    return names[language] ?? 'Unknown';
  }
}
