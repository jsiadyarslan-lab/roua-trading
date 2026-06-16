#!/usr/bin/env node
/**
 * Per-language translator using LLM - Smart version
 * Skips international terms that are legitimately used in English
 * Usage: node translate-lang.mjs <lang-code>
 */

import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';
import path from 'path';

const MESSAGES_DIR = path.resolve(import.meta.dirname, '../apps/web/messages');
const langCode = process.argv[2];

if (!langCode) {
  console.error('Usage: node translate-lang.mjs <lang-code>');
  process.exit(1);
}

const LANGUAGE_NAMES = {
  ar: 'Arabic (العربية)', bn: 'Bengali (বাংলা)', cs: 'Czech (čeština)',
  da: 'Danish (dansk)', de: 'German (Deutsch)', es: 'Spanish (español)',
  fa: 'Persian (فارسی)', fi: 'Finnish (suomi)', fil: 'Filipino',
  fr: 'French (français)', he: 'Hebrew (עברית)', hi: 'Hindi (हिन्दी)',
  hu: 'Hungarian (magyar)', id: 'Indonesian (Bahasa Indonesia)',
  it: 'Italian (italiano)', ja: 'Japanese (日本語)', ko: 'Korean (한국어)',
  ms: 'Malay (Bahasa Melayu)', nl: 'Dutch (Nederlands)', no: 'Norwegian (norsk)',
  pl: 'Polish (polski)', pt: 'Portuguese (português)', ro: 'Romanian (română)',
  ru: 'Russian (русский)', sv: 'Swedish (svenska)', th: 'Thai (ไทย)',
  tr: 'Turkish (Türkçe)', uk: 'Ukrainian (українська)', ur: 'Urdu (اردو)',
  vi: 'Vietnamese (Tiếng Việt)', zh: 'Chinese Simplified (简体中文)',
};

const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur'];

// Keys that must remain in English (brand, technical abbreviations, template vars)
const KEEP_AS_IS = new Set([
  'common.brandSub', 'common.brandFull', 'common.sourceBinanceWS',
  'common.sourceBinance', 'common.sourceCoinGecko', 'common.sourceTwelveData',
  'common.sourceYahoo', 'common.sourceMetalsDev', 'common.sourceFcsApi',
  'common.sourceGoldPrice', 'dashboard.profile.phonePlaceholder',
  'dashboard.strategyBuilder.indMacdLabel', 'dashboard.ai.ping',
  'dashboard.autonomousTrader.tagTP15ATR', 'dashboard.autonomousTrader.tagSL1ATR',
  'dashboard.autonomousTrader.tagTP4ATR', 'dashboard.autonomousTrader.tagSL2ATR',
  'dashboard.autonomousTrader.tagTP3ATR', 'dashboard.orderBook.live',
  'indicators.macd', 'indicators.trix', 'neuralLab.neuralArchitectureLSTM',
  'scannerAdvanced.indicators.macd', 'scannerAdvanced.indicators.vwap',
  'notificationTypes.systemUpdate.body', 'notificationTypes.botSignal.body',
  'notificationTypes.aiAnalysis.body',
  'dashboard.strategyBuilder.indRsiLabel', 'dashboard.strategyBuilder.indEmaLabel',
  'mobile.trade.strategyDCA', 'aiSmartPanel.tabLevels', 'aiSmartPanel.tabSmc',
  'neuralLab.neuralArchitectureGRU', 'scannerAdvanced.indicators.rsi',
  'scannerAdvanced.indicators.adx', 'scannerAdvanced.indicators.atr',
  'scannerAdvanced.indicators.cci', 'scannerAdvanced.indicators.obv',
  'scannerAdvanced.indicators.sar', 'scannerAdvanced.indicators.poc',
]);

// International terms that are legitimately used in English across most languages
// These are trading/finance terms that are universal loanwords
const INTERNATIONAL_VALUES = new Set([
  'Roua', 'Offline', 'Online', 'Demo', 'Pro', 'Forex', 'Beta', 'Premium',
  'Enterprise', 'Binance', 'Ethereum', 'Solana', 'Cardano', 'Bitcoin',
  'Webhooks', 'Portfolio', 'Position', 'Margin', 'Equity', 'Signal',
  'DCA', 'DeFi', 'P&L', 'PnL', 'PnL%', 'Backtest', 'Dashboard',
  'Admin', 'Agent', 'Auto', 'Alert', 'Backup', 'Balance', 'Status',
  'Social', 'Risk', 'Live', 'SIM', 'IMB', 'LIVE', 'PING',
  'Alpaca', 'MACD', 'RSI', 'EMA', 'VWAP', 'ATR', 'ADX', 'CCI', 'OBV',
  'SAR', 'POC', 'TRIX', 'LSTM', 'GRU', 'AI', 'API',
  'ECB', 'FCSAPI', 'CoinGecko', 'TwelveData', 'Binance Direct',
  'Binance Coin', 'Binance Live', 'STOCK', 'FOREX', 'CRYPTO',
  'Roua AI', 'AI LIVE', 'Premium+', 'Fetch.ai', 'VeChain', 'NEAR Protocol',
  'Amazon.com Inc.', 'Algorand', 'Aptos', 'Arbitrum', 'Avalanche',
  'Bollinger', 'Butterfly', 'Bayesian', 'Candlestick', 'Cancelled',
  'Ascending', 'Bearish', 'Bullish', 'Breakout', 'Breaking',
  'Authentication', 'Animations', 'Acceptable', 'Action', 'Advanced',
]);

function is_international_value(val) {
  const str = String(val).trim();
  // Check exact match
  if (INTERNATIONAL_VALUES.has(str)) return true;
  // Short uppercase abbreviations (2-5 chars) are usually international
  if (str.length <= 5 && str === str.toUpperCase() && /^[A-Z]+$/.test(str)) return true;
  // Very short strings (≤ 3 chars) 
  if (str.length <= 3) return true;
  // Crypto asset names (e.g., "BTC/USDT")
  if (/^[A-Z]{2,10}\/[A-Z]{2,10}$/.test(str)) return true;
  // Patterns like "RSI (14)", "EMA (20/50)", "VWAP + RSI", "SL: 1.5x ATR"
  if (/^[A-Z]{2,5}\s*[\(\[+]/.test(str)) return true;
  if (/^[A-Z]{2,3}:\s*\d/.test(str)) return true;
  // Short proper noun phrases (2-3 words, ≤ 15 chars total)
  if (/^[A-Z][a-z]+(?:\s[A-Z][a-z]+)?$/.test(str) && str.length <= 15) return true;
  // Contains mainly technical abbreviations
  if (/^[\w\s+/()%.:,-]+$/.test(str) && str.length <= 12 && /[A-Z]{2,}/.test(str)) return true;
  return false;
}

function get_all_keys(d, prefix = '') {
  const keys = {};
  for (const [k, v] of Object.entries(d)) {
    const full_key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(keys, get_all_keys(v, full_key));
    } else {
      keys[full_key] = v;
    }
  }
  return keys;
}

function set_nested(data, key_path, value) {
  const parts = key_path.split('.');
  let obj = data;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in obj) || typeof obj[parts[i]] !== 'object') {
      obj[parts[i]] = {};
    }
    obj = obj[parts[i]];
  }
  obj[parts[parts.length - 1]] = value;
}

function is_english_text(str) {
  return /[a-zA-Z]{2,}/.test(str);
}

async function translateBatch(zai, items, targetLangName, isRTL) {
  if (!items || items.length === 0) return {};

  const textEntries = items.map((item, i) => `${i + 1}. ${item.enVal}`).join('\n');

  const prompt = `You are a professional translator for a financial trading platform. Translate these English UI strings to ${targetLangName}.
${isRTL ? 'This is a RIGHT-TO-LEFT language. Use proper RTL text direction.' : ''}
Rules:
- Keep template variables like {count}, {name}, {message}, {price}, {summary} EXACTLY as they are
- Keep HTML tags like <b>, </b>, <br/> EXACTLY as they are
- Keep brand names (Roua, Binance, CoinGecko, Alpaca, TwelveData) in English
- Keep numbers, percentages, and currency symbols as-is
- Keep technical trading abbreviations (RSI, EMA, MACD, VWAP, ATR, PnL, DeFi, DCA, SL, TP) as-is
- Translate naturally for ${targetLangName} speakers in a professional trading context
- Each string is independent - translate them individually

Strings:
${textEntries}

Return ONLY a valid JSON: {"1": "translation1", "2": "translation2", ...}`;

  const maxRetries = 3;
  for (let retry = 0; retry < maxRetries; retry++) {
    try {
      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are a professional translator. Return ONLY a valid JSON object with numeric string keys mapping to translations. No markdown fences, no explanations, just raw JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.15,
        max_tokens: 4000,
      });

      let content = completion.choices[0]?.message?.content?.trim() || '';
      // Robust markdown fence removal
      content = content.replace(/^```(?:json|javascript)?\s*\n?/i, '').replace(/\n?```\s*$/s, '');
      // Try to extract JSON from the content
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('  No JSON found in response');
        return {};
      }
      
      const result = JSON.parse(jsonMatch[0]);
      const mapped = {};
      for (const [numKey, translation] of Object.entries(result)) {
        const idx = parseInt(numKey) - 1;
        if (idx >= 0 && idx < items.length && translation) {
          // Accept translation even if it equals English for short/international terms
          if (translation !== items[idx].enVal || items[idx].enVal.length <= 20) {
            mapped[items[idx].key] = translation;
          }
        }
      }
      return mapped;
    } catch (error) {
      if (error.message?.includes('429') && retry < maxRetries - 1) {
        const waitTime = (retry + 1) * 15000;
        console.error(`  Rate limited, waiting ${waitTime/1000}s... (retry ${retry + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, waitTime));
        continue;
      }
      console.error('  Translation batch error:', error.message?.substring(0, 150));
      return {};
    }
  }
  return {};
}

async function main() {
  const langName = LANGUAGE_NAMES[langCode];
  if (!langName) {
    console.error(`Unknown language: ${langCode}`);
    process.exit(1);
  }

  const isRTL = RTL_LANGUAGES.includes(langCode);
  console.log(`Translating: ${langCode} (${langName})`);

  const zai = await ZAI.create();

  const enData = JSON.parse(fs.readFileSync(path.join(MESSAGES_DIR, 'en.json'), 'utf-8'));
  const langFile = path.join(MESSAGES_DIR, `${langCode}.json`);
  const langData = JSON.parse(fs.readFileSync(langFile, 'utf-8'));

  const enKeys = get_all_keys(enData);
  const langKeys = get_all_keys(langData);

  // Remove extra keys not in English
  const enKeySet = new Set(Object.keys(enKeys));
  const extraKeys = Object.keys(langKeys).filter(k => !enKeySet.has(k));
  if (extraKeys.length > 0) {
    console.log(`  Removing ${extraKeys.length} extra keys...`);
    for (const key of extraKeys) {
      const parts = key.split('.');
      let obj = langData;
      for (let i = 0; i < parts.length - 1; i++) {
        if (obj[parts[i]] && typeof obj[parts[i]] === 'object') {
          obj = obj[parts[i]];
        }
      }
      delete obj[parts[parts.length - 1]];
    }
  }

  // Find untranslated keys that genuinely need translation
  const toTranslate = [];
  let skippedInternational = 0;

  for (const [key, enVal] of Object.entries(enKeys)) {
    if (KEEP_AS_IS.has(key)) continue;
    const langVal = langKeys[key];
    if (langVal === undefined) {
      // Missing key
      if (is_international_value(enVal)) {
        // Set it to English value since it's an international term
        set_nested(langData, key, enVal);
        skippedInternational++;
        continue;
      }
      toTranslate.push({ key, enVal: String(enVal) });
    } else if (String(enVal) === String(langVal) && is_english_text(String(enVal)) && String(enVal).length > 2) {
      // Same as English - check if it should be translated
      if (is_international_value(enVal)) {
        skippedInternational++;
        continue;
      }
      toTranslate.push({ key, enVal: String(enVal) });
    }
  }

  console.log(`  Found ${toTranslate.length} keys needing translation (${skippedInternational} international/skip)`);

  if (toTranslate.length === 0) {
    if (extraKeys.length > 0 || skippedInternational > 0) {
      fs.writeFileSync(langFile, JSON.stringify(langData, null, 2) + '\n', 'utf-8');
    }
    console.log(`  ✓ No translations needed`);
    return;
  }

  let translated = 0;
  let failed = 0;
  const BATCH_SIZE = 15;

  for (let i = 0; i < toTranslate.length; i += BATCH_SIZE) {
    const batch = toTranslate.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(toTranslate.length / BATCH_SIZE);
    console.log(`  Batch ${batchNum}/${totalBatches} (${batch.length} keys)...`);

    const translations = await translateBatch(zai, batch, langName, isRTL);

    for (const item of batch) {
      const translated_text = translations[item.key];
      if (translated_text && translated_text !== item.enVal) {
        set_nested(langData, item.key, translated_text);
        translated++;
      } else {
        failed++;
      }
    }

    fs.writeFileSync(langFile, JSON.stringify(langData, null, 2) + '\n', 'utf-8');
    console.log(`    Progress: ${translated} translated, ${failed} failed`);

    if (i + BATCH_SIZE < toTranslate.length) {
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  console.log(`  ✓ Done: ${translated} translated, ${failed} failed`);
}

main().catch(console.error);
