/**
 * Translate a single language file at a time.
 * Usage: node translate-one.mjs <lang-code>
 * Example: node translate-one.mjs ar
 */
import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';
import path from 'path';

const MESSAGES_DIR = path.resolve('./apps/web/messages');
const BATCH_SIZE = 60;
const langCode = process.argv[2];
if (!langCode) { console.error('Usage: node translate-one.mjs <lang-code>'); process.exit(1); }

const LANG_NAMES = {
  ar: 'Arabic (العربية)', bn: 'Bengali (বাংলা)', cs: 'Czech (Čeština)',
  da: 'Danish (Dansk)', de: 'German (Deutsch)', es: 'Spanish (Español)',
  fa: 'Persian (فارسی)', fi: 'Finnish (Suomi)', fil: 'Filipino',
  fr: 'French (Français)', he: 'Hebrew (עברית)', hi: 'Hindi (हिन्दी)',
  hu: 'Hungarian (Magyar)', id: 'Indonesian (Bahasa Indonesia)',
  it: 'Italian (Italiano)', ja: 'Japanese (日本語)', ko: 'Korean (한국어)',
  ms: 'Malay (Bahasa Melayu)', nl: 'Dutch (Nederlands)',
  no: 'Norwegian (Norsk)', pl: 'Polish (Polski)', pt: 'Portuguese (Português)',
  ro: 'Romanian (Română)', ru: 'Russian (Русский)', sv: 'Swedish (Svenska)',
  th: 'Thai (ไทย)', tr: 'Turkish (Türkçe)', uk: 'Ukrainian (Українська)',
  ur: 'Urdu (اردو)', vi: 'Vietnamese (Tiếng Việt)', zh: 'Chinese Simplified (简体中文)',
};

const DO_NOT_TRANSLATE = new Set([
  'common.brand', 'common.brandSub', 'common.brandFull', 'common.ai', 'common.beta',
  'common.pro', 'common.env', 'indicators.macd', 'indicators.rsi', 'indicators.ema',
  'indicators.bb', 'indicators.atr', 'indicators.sar',
  'scannerAdvanced.indicators.macd', 'scannerAdvanced.indicators.rsi',
  'scannerAdvanced.indicators.ema', 'scannerAdvanced.indicators.adx',
  'scannerAdvanced.indicators.sar', 'scannerAdvanced.indicators.bb',
  'scannerAdvanced.indicators.atr', 'leaderboardPage.colRank',
  'common.sourceBinance', 'common.sourceBinanceWS', 'common.sourceCoinGecko',
  'common.sourceEcb', 'common.sourceFcsApi', 'common.sourceMetalsDev',
  'common.sourceTwelveData', 'dashboard.alpacaPositions.undefined',
  'dashboard.alpacaPositions.pnl', 'dashboard.alpacaPositions.sl',
  'dashboard.alpacaPositions.tp', 'dashboard.autonomousTrader.paperModeSuffix',
  'dashboard.ai.ping',
]);

function loadJson(file) {
  return JSON.parse(fs.readFileSync(path.join(MESSAGES_DIR, file), 'utf-8'));
}
function saveJson(file, data) {
  fs.writeFileSync(path.join(MESSAGES_DIR, file), JSON.stringify(data, null, 2) + '\n', 'utf-8');
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
          walk(enVal, {}, fullKey);
        }
      } else {
        if (!(k in langObj)) {
          problems.push({ key: fullKey, value: enVal });
        } else if (langObj[k] === enVal && enVal) {
          problems.push({ key: fullKey, value: enVal });
        }
      }
    }
  }
  walk(en, lang, '');
  return problems;
}

async function translateBatch(zai, langName, items) {
  const keepAsIs = items.filter(it => DO_NOT_TRANSLATE.has(it.key));
  const toTranslate = items.filter(it => !DO_NOT_TRANSLATE.has(it.key));
  
  const result = {};
  for (const it of keepAsIs) result[it.key] = it.value;
  if (toTranslate.length === 0) return result;
  
  const lines = toTranslate.map(it => `"${it.key}" = "${it.value.replace(/"/g, '\\"')}"`).join('\n');
  
  const prompt = `Translate these UI strings from English to ${langName} for a financial trading platform.

RULES:
- Keep {symbol}, {count}, {status}, {pair}, {time}, {price}, {amount}, {pips}, {signal}, {source}, {name}, {model}, {reason}, {entry}, {sl}, {tp} as-is.
- Keep MACD, RSI, EMA, ATR, SAR, ADX, Bollinger, Fibonacci, Elliott, Wyckoff, VWAP, OTC as-is.
- Keep "Roua" / "ROUA" as-is.
- Return ONLY raw JSON object (no markdown, no explanation).

${lines}`;

  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: 'Return ONLY valid JSON. No markdown fences. No explanation.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.3,
    max_tokens: 4000,
  });
  
  let content = completion.choices[0]?.message?.content?.trim();
  if (!content) throw new Error('Empty response');
  if (content.startsWith('```')) {
    content = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  return { ...result, ...JSON.parse(content) };
}

async function main() {
  const langName = LANG_NAMES[langCode];
  if (!langName) { console.error(`Unknown language: ${langCode}`); process.exit(1); }
  
  const zai = await ZAI.create();
  const en = loadJson('en.json');
  const lang = loadJson(`${langCode}.json`);
  const problems = getProblemKeys(en, lang);
  
  if (problems.length === 0) {
    console.log(`✅ ${langCode}: Already fully translated`);
    return;
  }
  
  console.log(`🔄 ${langCode} (${langName}): ${problems.length} keys to translate`);
  
  let translated = 0, failed = 0;
  const totalBatches = Math.ceil(problems.length / BATCH_SIZE);
  
  for (let i = 0; i < problems.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = problems.slice(i, i + BATCH_SIZE);
    console.log(`  Batch ${batchNum}/${totalBatches}: ${batch.length} keys`);
    
    let retries = 3;
    let success = false;
    while (retries > 0 && !success) {
      try {
        const translations = await translateBatch(zai, langName, batch);
        for (const item of batch) {
          const val = translations[item.key];
          if (val) {
            setValue(lang, item.key, val);
            translated++;
          } else if (DO_NOT_TRANSLATE.has(item.key)) {
            setValue(lang, item.key, item.value);
            translated++;
          } else {
            failed++;
          }
        }
        success = true;
      } catch (err) {
        retries--;
        if (err.message.includes('429') && retries > 0) {
          const wait = (4 - retries) * 5000;
          console.log(`  ⏳ Rate limited, waiting ${wait/1000}s... (${retries} retries left)`);
          await new Promise(r => setTimeout(r, wait));
        } else {
          console.error(`  ❌ Batch ${batchNum} failed: ${err.message}`);
          failed += batch.length;
          success = true; // Move on
        }
      }
    }
    
    // Save progress after each batch
    saveJson(`${langCode}.json`, lang);
    
    if (i + BATCH_SIZE < problems.length) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  
  console.log(`✅ ${langCode}: ${translated} translated, ${failed} failed`);
  
  // Verify
  const remaining = getProblemKeys(en, lang);
  console.log(`📊 Remaining issues: ${remaining.length}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
