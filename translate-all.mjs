/**
 * Translation script — translates all missing/untranslated keys
 * across 30 language files using z-ai-web-dev-sdk.
 * 
 * Usage: node translate-all.mjs
 */
import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';
import path from 'path';

const MESSAGES_DIR = path.resolve('./apps/web/messages');
const BATCH_SIZE = 80; // keys per LLM call
const CONCURRENCY = 3; // parallel language workers

// Language code → native language name (for prompt)
const LANG_NAMES = {
  ar: 'Arabic (العربية)',
  bn: 'Bengali (বাংলা)',
  cs: 'Czech (Čeština)',
  da: 'Danish (Dansk)',
  de: 'German (Deutsch)',
  es: 'Spanish (Español)',
  fa: 'Persian (فارسی)',
  fi: 'Finnish (Suomi)',
  fil: 'Filipino',
  fr: 'French (Français)',
  he: 'Hebrew (עברית)',
  hi: 'Hindi (हिन्दी)',
  hu: 'Hungarian (Magyar)',
  id: 'Indonesian (Bahasa Indonesia)',
  it: 'Italian (Italiano)',
  ja: 'Japanese (日本語)',
  ko: 'Korean (한국어)',
  ms: 'Malay (Bahasa Melayu)',
  nl: 'Dutch (Nederlands)',
  no: 'Norwegian (Norsk)',
  pl: 'Polish (Polski)',
  pt: 'Portuguese (Português)',
  ro: 'Romanian (Română)',
  ru: 'Russian (Русский)',
  sv: 'Swedish (Svenska)',
  th: 'Thai (ไทย)',
  tr: 'Turkish (Türkçe)',
  uk: 'Ukrainian (Українська)',
  ur: 'Urdu (اردو)',
  vi: 'Vietnamese (Tiếng Việt)',
  zh: 'Chinese Simplified (简体中文)',
};

// Keys that should NOT be translated (brands, tickers, technical abbreviations)
const DO_NOT_TRANSLATE_PATTERNS = [
  'common.brand', 'common.brandSub', 'common.brandFull',
  'common.ai', 'common.beta', 'common.pro', 'common.env',
  'indicators.macd', 'indicators.rsi', 'indicators.ema',
  'indicators.bb', 'indicators.atr', 'indicators.sar',
  'scannerAdvanced.indicators.macd',
  'scannerAdvanced.indicators.rsi',
  'scannerAdvanced.indicators.ema',
  'scannerAdvanced.indicators.adx',
  'scannerAdvanced.indicators.sar',
  'scannerAdvanced.indicators.bb',
  'scannerAdvanced.indicators.atr',
  'leaderboardPage.colRank',
  'common.sourceBinance', 'common.sourceBinanceWS',
  'common.sourceCoinGecko', 'common.sourceEcb',
  'common.sourceFcsApi', 'common.sourceMetalsDev',
  'common.sourceTwelveData',
  'dashboard.alpacaPositions.undefined',
  'dashboard.alpacaPositions.pnl', 'dashboard.alpacaPositions.sl',
  'dashboard.alpacaPositions.tp',
  'dashboard.autonomousTrader.paperModeSuffix',
  'dashboard.ai.ping',
];

function loadJson(file) {
  return JSON.parse(fs.readFileSync(path.join(MESSAGES_DIR, file), 'utf-8'));
}
function saveJson(file, data) {
  fs.writeFileSync(path.join(MESSAGES_DIR, file), JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function getValue(obj, keyPath) {
  return keyPath.split('.').reduce((o, k) => o[k], obj);
}

function setValue(obj, keyPath, value) {
  const keys = keyPath.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!(keys[i] in cur)) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

function getProblemKeys(en, lang) {
  const problems = [];
  
  function walk(enObj, langObj, prefix) {
    for (const k of Object.keys(enObj)) {
      const fullKey = prefix ? `${prefix}.${k}` : k;
      const enVal = enObj[k];
      if (typeof enVal === 'object' && enVal !== null) {
        if (k in langObj && typeof langObj[k] === 'object') {
          walk(enVal, langObj[k], fullKey);
        } else {
          // Entire subtree missing — collect all leaf keys
          walk(enVal, {}, fullKey);
        }
      } else {
        if (!(k in langObj)) {
          problems.push({ key: fullKey, value: enVal, type: 'missing' });
        } else if (langObj[k] === enVal && enVal) {
          problems.push({ key: fullKey, value: enVal, type: 'untranslated' });
        }
      }
    }
  }
  walk(en, lang, '');
  return problems;
}

async function translateBatch(zai, langCode, langName, items) {
  const doNotTranslate = items.filter(it => DO_NOT_TRANSLATE_PATTERNS.includes(it.key));
  const toTranslate = items.filter(it => !DO_NOT_TRANSLATE_PATTERNS.includes(it.key));
  
  // For keys that shouldn't be translated, just keep as-is (they're brands/tickers)
  const result = {};
  for (const it of doNotTranslate) {
    result[it.key] = it.value;
  }
  
  if (toTranslate.length === 0) return result;
  
  const lines = toTranslate.map(it => `"${it.key}" = "${it.value.replace(/"/g, '\\"')}"`).join('\n');
  
  const prompt = `You are a professional translator for a financial trading platform called "Roua".

Translate the following UI strings from English to ${langName}.
Rules:
1. Keep all placeholder variables like {symbol}, {count}, {status}, {pair}, {time}, {price}, {amount}, {pips}, {signal}, {source}, {name}, {model}, {reason}, {entry}, {sl}, {tp} EXACTLY as-is (do not translate them).
2. Keep technical terms that are universally used (MACD, RSI, EMA, ATR, SAR, ADX, Bollinger, Fibonacci, Elliott, Wyckoff, VWAP, P&L, P/L, AI, API, SL, TP, OTC) as-is.
3. For brand names like "Roua" or "ROUA", keep them as-is.
4. Return ONLY a JSON object where each key is the dot-path key and each value is the translated string.
5. Do NOT add any explanation, markdown, or code fences. Return raw JSON only.

Strings to translate:
${lines}`;

  try {
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a professional UI translator. Return ONLY valid JSON. No markdown fences.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 4000,
    });
    
    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) throw new Error('Empty response');
    
    // Try to parse JSON — strip markdown fences if present
    let jsonStr = content;
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    
    const parsed = JSON.parse(jsonStr);
    return { ...result, ...parsed };
  } catch (err) {
    console.error(`  ❌ Translation batch failed for ${langCode}: ${err.message}`);
    // On failure, return English as fallback
    for (const it of toTranslate) {
      result[it.key] = it.value;
    }
    return result;
  }
}

async function processLanguage(zai, langCode, langName, en) {
  const fileName = `${langCode}.json`;
  const lang = loadJson(fileName);
  const problems = getProblemKeys(en, lang);
  
  if (problems.length === 0) {
    console.log(`✅ ${langCode} (${langName}): No issues`);
    return 0;
  }
  
  console.log(`🔄 ${langCode} (${langName}): ${problems.length} keys to translate`);
  
  let translated = 0;
  let failed = 0;
  
  // Process in batches
  for (let i = 0; i < problems.length; i += BATCH_SIZE) {
    const batch = problems.slice(i, i + BATCH_SIZE);
    console.log(`  Batch ${Math.floor(i/BATCH_SIZE)+1}/${Math.ceil(problems.length/BATCH_SIZE)}: ${batch.length} keys`);
    
    const translations = await translateBatch(zai, langCode, langName, batch);
    
    for (const item of batch) {
      const translatedValue = translations[item.key];
      if (translatedValue && translatedValue !== item.value) {
        setValue(lang, item.key, translatedValue);
        translated++;
      } else if (DO_NOT_TRANSLATE_PATTERNS.includes(item.key)) {
        // Keep as-is for brand/ticker keys
        setValue(lang, item.key, item.value);
        translated++;
      } else {
        failed++;
      }
    }
    
    // Small delay between batches
    if (i + BATCH_SIZE < problems.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  
  saveJson(fileName, lang);
  console.log(`  ✅ ${langCode}: ${translated} translated, ${failed} failed`);
  return failed;
}

async function main() {
  console.log('🚀 Starting translation process...\n');
  
  const zai = await ZAI.create();
  const en = loadJson('en.json');
  
  const langCodes = Object.keys(LANG_NAMES);
  let totalFailed = 0;
  
  // Process languages with limited concurrency
  for (let i = 0; i < langCodes.length; i += CONCURRENCY) {
    const chunk = langCodes.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(code => processLanguage(zai, code, LANG_NAMES[code], en))
    );
    totalFailed += results.reduce((a, b) => a + b, 0);
  }
  
  console.log(`\n🏁 Translation complete! Total failures: ${totalFailed}`);
  
  // Final verification
  console.log('\n📊 Verification:');
  const enKeys = new Set();
  function collectKeys(obj, prefix) {
    for (const [k, v] of Object.entries(obj)) {
      const full = prefix ? `${prefix}.${k}` : k;
      if (typeof v === 'object') collectKeys(v, full);
      else enKeys.add(full);
    }
  }
  collectKeys(en, '');
  
  for (const code of langCodes) {
    const lang = loadJson(`${code}.json`);
    const problems = getProblemKeys(en, lang);
    if (problems.length > 0) {
      console.log(`  ⚠️ ${code}: ${problems.length} remaining issues`);
    } else {
      console.log(`  ✅ ${code}: All translated`);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
