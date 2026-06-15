/**
 * Slow but reliable translator — 30 keys per batch, 8s delay between batches.
 * Usage: node translate-slow.mjs <lang-code>
 */
import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';
import path from 'path';

const MESSAGES_DIR = path.resolve('./apps/web/messages');
const BATCH_SIZE = 30;
const DELAY_MS = 8000;
const langCode = process.argv[2];

const LANG_NAMES = {
  ar: 'Arabic', bn: 'Bengali', cs: 'Czech', da: 'Danish', de: 'German',
  es: 'Spanish', fa: 'Persian', fi: 'Finnish', fil: 'Filipino', fr: 'French',
  he: 'Hebrew', hi: 'Hindi', hu: 'Hungarian', id: 'Indonesian', it: 'Italian',
  ja: 'Japanese', ko: 'Korean', ms: 'Malay', nl: 'Dutch', no: 'Norwegian',
  pl: 'Polish', pt: 'Portuguese', ro: 'Romanian', ru: 'Russian', sv: 'Swedish',
  th: 'Thai', tr: 'Turkish', uk: 'Ukrainian', ur: 'Urdu', vi: 'Vietnamese',
  zh: 'Chinese Simplified',
};

const SKIP_KEYS = new Set([
  'common.brand','common.brandSub','common.brandFull','common.ai','common.beta',
  'common.pro','common.env','indicators.macd','indicators.rsi','indicators.ema',
  'indicators.bb','indicators.atr','indicators.sar','indicators.trix',
  'scannerAdvanced.indicators.macd','scannerAdvanced.indicators.rsi',
  'scannerAdvanced.indicators.ema','scannerAdvanced.indicators.adx',
  'scannerAdvanced.indicators.sar','scannerAdvanced.indicators.bb',
  'scannerAdvanced.indicators.atr','scannerAdvanced.indicators.cci',
  'scannerAdvanced.indicators.vwap','scannerAdvanced.indicators.obv',
  'scannerAdvanced.indicators.poc','leaderboardPage.colRank',
  'common.sourceBinance','common.sourceBinanceWS','common.sourceCoinGecko',
  'common.sourceEcb','common.sourceFcsApi','common.sourceMetalsDev',
  'common.sourceTwelveData','dashboard.alpacaPositions.undefined',
  'dashboard.alpacaPositions.pnl','dashboard.alpacaPositions.sl',
  'dashboard.alpacaPositions.tp','dashboard.autonomousTrader.paperModeSuffix',
  'dashboard.ai.ping','dashboard.profile.phonePlaceholder',
  'dashboard.strategyBuilder.indRsiLabel','dashboard.strategyBuilder.indMacdLabel',
  'dashboard.strategyBuilder.indEmaLabel','dashboard.portfolio.exitSLShort',
  'dashboard.portfolio.exitTPShort','dashboard.predictionMarket.aiLabel',
  'dashboard.autonomousTrader.tagTP15ATR','dashboard.autonomousTrader.tagSL1ATR',
  'dashboard.autonomousTrader.tagTP4ATR','dashboard.autonomousTrader.tagSL2ATR',
  'dashboard.autonomousTrader.tagTP3ATR','dashboard.strategicCouncil.stopLossShort',
  'dashboard.strategicCouncil.takeProfitShort','mobile.trade.strategyDCA',
  'aiSmartPanel.tabLevels','aiSmartPanel.tabSmc',
  'neuralLab.neuralArchitectureLSTM','neuralLab.neuralArchitectureGRU',
  'notificationTypes.systemUpdate.body','notificationTypes.botSignal.body',
  'notificationTypes.aiAnalysis.body',
]);

function loadJson(file) { return JSON.parse(fs.readFileSync(path.join(MESSAGES_DIR, file), 'utf-8')); }
function saveJson(file, data) { fs.writeFileSync(path.join(MESSAGES_DIR, file), JSON.stringify(data, null, 2) + '\n', 'utf-8'); }

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
        if (k in langObj && typeof langObj[k] === 'object') walk(enVal, langObj[k], fullKey);
        else walk(enVal, {}, fullKey);
      } else {
        if (!(k in langObj)) problems.push({ key: fullKey, value: enVal });
        else if (langObj[k] === enVal && enVal && !SKIP_KEYS.has(fullKey)) problems.push({ key: fullKey, value: enVal });
      }
    }
  }
  walk(en, lang, '');
  return problems;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function translateBatch(zai, langName, items) {
  const lines = items.map(it => `"${it.key}" = "${it.value.replace(/"/g, '\\"')}"`).join('\n');
  
  const prompt = `Translate these UI strings from English to ${langName} for a financial trading platform.
Rules:
- Keep placeholders like {symbol}, {count}, {status}, {pair}, {time}, {price}, {amount}, {pips}, {signal}, {source}, {name}, {model}, {reason}, {entry}, {sl}, {tp}, {message}, {summary} EXACTLY as-is.
- Keep MACD, RSI, EMA, ATR, SAR, ADX, CCI, VWAP, OBV, POC, TRIX, Bollinger, Fibonacci, Elliott, Wyckoff, OTC, DCA, LSTM, GRU, SMC, S/R as-is.
- Keep "Roua"/"ROUA" as-is.
- Return ONLY raw JSON. No markdown. No explanation.

${lines}`;

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: 'Return ONLY valid JSON object. No markdown fences. No explanation.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 4000,
      });
      
      let content = completion.choices[0]?.message?.content?.trim();
      if (!content) throw new Error('Empty response');
      if (content.startsWith('```')) content = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      return JSON.parse(content);
    } catch (err) {
      if (err.message?.includes('429')) {
        const wait = (attempt + 1) * 15000;
        console.log(`    ⏳ Rate limited, waiting ${wait/1000}s...`);
        await sleep(wait);
      } else {
        throw err;
      }
    }
  }
  throw new Error('Max retries exceeded');
}

async function main() {
  if (!langCode || !LANG_NAMES[langCode]) {
    console.error('Usage: node translate-slow.mjs <lang-code>');
    console.error('Available:', Object.keys(LANG_NAMES).join(', '));
    process.exit(1);
  }
  
  const langName = LANG_NAMES[langCode];
  console.log(`🚀 Translating ${langCode} (${langName})...`);
  
  const zai = await ZAI.create();
  const en = loadJson('en.json');
  const lang = loadJson(`${langCode}.json`);
  const problems = getProblemKeys(en, lang);
  
  if (problems.length === 0) {
    console.log(`✅ ${langCode}: Already fully translated!`);
    return;
  }
  
  console.log(`📋 ${problems.length} keys to translate`);
  
  let translated = 0, failed = 0;
  const totalBatches = Math.ceil(problems.length / BATCH_SIZE);
  
  for (let i = 0; i < problems.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = problems.slice(i, i + BATCH_SIZE);
    console.log(`  📦 Batch ${batchNum}/${totalBatches} (${batch.length} keys)`);
    
    try {
      const translations = await translateBatch(zai, langName, batch);
      for (const item of batch) {
        const val = translations[item.key];
        if (val && val !== item.value) {
          setValue(lang, item.key, val);
          translated++;
        } else if (SKIP_KEYS.has(item.key)) {
          // Keep as-is for technical abbreviations
          setValue(lang, item.key, item.value);
          translated++;
        } else {
          failed++;
        }
      }
    } catch (err) {
      console.error(`  ❌ Batch ${batchNum} failed: ${err.message}`);
      failed += batch.length;
    }
    
    // Save progress after each batch
    saveJson(`${langCode}.json`, lang);
    console.log(`    ✅ Progress: ${translated} translated, ${failed} failed`);
    
    // Delay between batches
    if (i + BATCH_SIZE < problems.length) {
      await sleep(DELAY_MS);
    }
  }
  
  console.log(`\n🏁 ${langCode} done: ${translated} translated, ${failed} failed`);
  
  // Final check
  const remaining = getProblemKeys(en, lang);
  console.log(`📊 Remaining: ${remaining.length} keys`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
