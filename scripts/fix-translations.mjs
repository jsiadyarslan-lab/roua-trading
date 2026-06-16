#!/usr/bin/env node
/**
 * Translation Fixer Script
 * - Adds missing keys to all language files
 * - Translates untranslated keys (English text remaining) using LLM
 * - Handles extra keys
 * - Fixes Arabic untranslated keys
 */

import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';
import path from 'path';

const MESSAGES_DIR = path.resolve(import.meta.dirname, '../apps/web/messages');

// Language code to native language name mapping for better LLM context
const LANGUAGE_NAMES = {
  ar: 'Arabic (العربية)',
  bn: 'Bengali (বাংলা)',
  cs: 'Czech (čeština)',
  da: 'Danish (dansk)',
  de: 'German (Deutsch)',
  es: 'Spanish (español)',
  fa: 'Persian (فارسی)',
  fi: 'Finnish (suomi)',
  fil: 'Filipino',
  fr: 'French (français)',
  he: 'Hebrew (עברית)',
  hi: 'Hindi (हिन्दी)',
  hu: 'Hungarian (magyar)',
  id: 'Indonesian (Bahasa Indonesia)',
  it: 'Italian (italiano)',
  ja: 'Japanese (日本語)',
  ko: 'Korean (한국어)',
  ms: 'Malay (Bahasa Melayu)',
  nl: 'Dutch (Nederlands)',
  no: 'Norwegian (norsk)',
  pl: 'Polish (polski)',
  pt: 'Portuguese (português)',
  ro: 'Romanian (română)',
  ru: 'Russian (русский)',
  sv: 'Swedish (svenska)',
  th: 'Thai (ไทย)',
  tr: 'Turkish (Türkçe)',
  uk: 'Ukrainian (українська)',
  ur: 'Urdu (اردو)',
  vi: 'Vietnamese (Tiếng Việt)',
  zh: 'Chinese Simplified (简体中文)',
};

// Keys that should remain as-is (brand names, technical abbreviations, template vars)
const KEEP_AS_IS_PATTERNS = [
  'common.brandSub',      // "ROUA"
  'common.brandFull',     // Contains brand name
  'common.sourceBinanceWS', // "Binance Direct"
  'common.sourceBinance',   // "Binance"
  'common.sourceCoinGecko', // "CoinGecko"
  'common.sourceTwelveData', // "TwelveData"
  'common.sourceYahoo',     // "Yahoo Finance"
  'common.sourceMetalsDev', // "Metals.dev"
  'common.sourceFcsApi',   // "FCSAPI"
  'common.sourceGoldPrice', // "GoldPrice"
  'dashboard.profile.phonePlaceholder', // Phone format placeholder
  'dashboard.strategyBuilder.indMacdLabel', // MACD - technical abbreviation
  'dashboard.ai.ping',     // PING - technical
  'dashboard.autonomousTrader.tagTP15ATR', // Technical: TP: 1.5x ATR
  'dashboard.autonomousTrader.tagSL1ATR',  // Technical: SL: 1x ATR
  'dashboard.autonomousTrader.tagTP4ATR',  // Technical: TP: 4x ATR
  'dashboard.autonomousTrader.tagSL2ATR',  // Technical: SL: 2x ATR
  'dashboard.autonomousTrader.tagTP3ATR',  // Technical: TP: 3x ATR
  'dashboard.orderBook.live', // LIVE - technical
  'indicators.macd',       // MACD - technical abbreviation
  'indicators.trix',       // TRIX - technical abbreviation
  'neuralLab.neuralArchitectureLSTM', // LSTM - technical
  'scannerAdvanced.indicators.macd', // MACD
  'scannerAdvanced.indicators.vwap', // VWAP
  'notificationTypes.systemUpdate.body', // {message} template
  'notificationTypes.botSignal.body',    // {message} template
  'notificationTypes.aiAnalysis.body',   // {summary} template
];

// RTL languages
const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur'];

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

function get_nested(data, key_path) {
  const parts = key_path.split('.');
  let obj = data;
  for (const part of parts) {
    if (obj && typeof obj === 'object' && part in obj) {
      obj = obj[part];
    } else {
      return undefined;
    }
  }
  return obj;
}

function is_english_text(str) {
  if (!str || typeof str !== 'string') return false;
  return /[a-zA-Z]{2,}/.test(str);
}

async function translateBatch(zai, texts, targetLang, targetLangName) {
  if (!texts || texts.length === 0) return {};

  const isRTL = RTL_LANGUAGES.includes(targetLang);

  // Build the prompt
  const textEntries = texts.map((t, i) => `${i + 1}. ${t}`).join('\n');

  const prompt = `You are a professional translator for a trading/finance platform called "Roua" (رؤى).

Translate the following English UI strings into ${targetLangName}.
${isRTL ? 'This is a RIGHT-TO-LEFT language. Use proper RTL text.' : ''}

CRITICAL RULES:
1. Translate naturally and idiomatically for ${targetLangName} speakers
2. Keep technical trading terms that are universally used (e.g., "MACD", "RSI", "ATR", "TP", "SL") as abbreviations if that's the convention in ${targetLangName}
3. Keep template variables like {count}, {name}, {message}, {summary} EXACTLY as they are
4. Keep HTML tags like <b>, </b>, <br/> EXACTLY as they are
5. For brand/product names like "Roua", "Binance", "CoinGecko", keep them in English
6. Keep numbers and percentages as-is
7. Maintain the same tone (professional trading platform)
8. Return ONLY a JSON object mapping each original English string to its translation
9. Do NOT add explanations or notes

Strings to translate:
${textEntries}

Return a JSON object like: {"English string 1": "translation 1", "English string 2": "translation 2"}`;

  try {
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a professional translator. Return only valid JSON. No markdown, no code blocks, just raw JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 4000,
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) return {};

    // Try to parse JSON - handle possible markdown code blocks
    let jsonStr = content;
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    const translations = JSON.parse(jsonStr);
    return translations;
  } catch (error) {
    console.error(`Translation error for ${targetLang}:`, error.message);
    // Try to extract partial results
    return {};
  }
}

async function processLanguage(zai, langCode, enKeys, enData) {
  const langFile = path.join(MESSAGES_DIR, `${langCode}.json`);
  const langData = JSON.parse(fs.readFileSync(langFile, 'utf-8'));
  const langKeys = get_all_keys(langData);
  const langName = LANGUAGE_NAMES[langCode] || langCode;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Processing: ${langCode} (${langName})`);
  console.log(`${'='.repeat(60)}`);

  let addedMissing = 0;
  let translatedCount = 0;
  let skippedCount = 0;

  // Step 1: Add missing keys (from Arabic translations as reference, but we'll translate from English)
  const missingKeys = Object.keys(enKeys).filter(k => !(k in langKeys));
  if (missingKeys.length > 0) {
    console.log(`  Missing keys to add: ${missingKeys.length}`);
    // We'll translate these along with untranslated keys below
  }

  // Step 2: Find untranslated keys
  const untranslatedEntries = [];
  const allKeysToTranslate = new Set(missingKeys);

  for (const [key, enVal] of Object.entries(enKeys)) {
    if (KEEP_AS_IS_PATTERNS.includes(key)) {
      continue; // Skip brand names and technical abbreviations
    }

    const langVal = langKeys[key];
    if (langVal === undefined) {
      // Missing key - already tracked above
      continue;
    }

    // Check if the value is still in English
    if (enVal === langVal && is_english_text(enVal) && String(enVal).length > 2) {
      // This is untranslated (same as English and contains English text)
      allKeysToTranslate.add(key);
    }
  }

  console.log(`  Total keys to translate: ${allKeysToTranslate.size}`);

  if (allKeysToTranslate.size === 0) {
    console.log(`  ✓ No translations needed for ${langCode}`);
    return { addedMissing, translatedCount, skippedCount };
  }

  // Step 3: Batch translate - process in chunks of 40 keys
  const BATCH_SIZE = 40;
  const keysArray = Array.from(allKeysToTranslate);

  for (let i = 0; i < keysArray.length; i += BATCH_SIZE) {
    const batchKeys = keysArray.slice(i, i + BATCH_SIZE);
    const batchTexts = batchKeys.map(k => enKeys[k]);

    console.log(`  Translating batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(keysArray.length / BATCH_SIZE)} (${batchKeys.length} keys)...`);

    const translations = await translateBatch(zai, batchTexts, langCode, langName);

    // Apply translations
    for (const key of batchKeys) {
      const enVal = enKeys[key];
      const translated = translations[enVal];

      if (translated && translated !== enVal) {
        set_nested(langData, key, translated);
        translatedCount++;
      } else if (missingKeys.includes(key)) {
        // If we couldn't translate a missing key, use the English value as fallback
        set_nested(langData, key, enVal);
        addedMissing++;
      } else {
        skippedCount++;
      }
    }

    // Small delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < keysArray.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // Step 4: Remove extra keys that don't exist in English
  const enKeySet = new Set(Object.keys(enKeys));
  const langKeySet = new Set(Object.keys(langKeys));
  const extraKeys = [...langKeySet].filter(k => !enKeySet.has(k));

  if (extraKeys.length > 0) {
    console.log(`  Removing ${extraKeys.length} extra keys...`);
    for (const key of extraKeys) {
      // Remove from nested object
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

  // Step 5: Save the updated file
  fs.writeFileSync(langFile, JSON.stringify(langData, null, 2) + '\n', 'utf-8');
  console.log(`  ✓ Saved ${langCode}: ${translatedCount} translated, ${addedMissing} added, ${skippedCount} skipped, ${extraKeys.length} extra removed`);

  return { addedMissing, translatedCount, skippedCount, extraRemoved: extraKeys.length };
}

async function fixArabicUntranslated(zai, enKeys) {
  const langFile = path.join(MESSAGES_DIR, 'ar.json');
  const arData = JSON.parse(fs.readFileSync(langFile, 'utf-8'));
  const arKeys = get_all_keys(arData);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Processing: ar (Arabic - Default Language)`);
  console.log(`${'='.repeat(60)}`);

  // Arabic is the default and most complete, but check for untranslated keys
  // Most "untranslated" keys in Arabic are technical abbreviations (MACD, TRIX, VWAP, LSTM)
  // or brand names that should stay as-is

  // Only translate keys that genuinely need Arabic translation
  const keysToTranslate = [];
  for (const [key, enVal] of Object.entries(enKeys)) {
    if (KEEP_AS_IS_PATTERNS.includes(key)) continue;
    const arVal = arKeys[key];
    if (arVal === undefined) {
      // Missing key in Arabic
      keysToTranslate.push(key);
    } else if (enVal === arVal && is_english_text(enVal) && String(enVal).length > 2) {
      // Untranslated - but for Arabic, check if it's something that really needs translation
      // Skip very short technical terms
      if (String(enVal).length <= 5) continue;
      keysToTranslate.push(key);
    }
  }

  console.log(`  Keys needing Arabic translation: ${keysToTranslate.length}`);

  if (keysToTranslate.length === 0) {
    console.log(`  ✓ Arabic is already complete`);
    return;
  }

  let translatedCount = 0;
  const BATCH_SIZE = 40;

  for (let i = 0; i < keysToTranslate.length; i += BATCH_SIZE) {
    const batchKeys = keysToTranslate.slice(i, i + BATCH_SIZE);
    const batchTexts = batchKeys.map(k => enKeys[k]);

    console.log(`  Translating batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(keysToTranslate.length / BATCH_SIZE)}...`);

    const translations = await translateBatch(zai, batchTexts, 'ar', 'Arabic (العربية)');

    for (const key of batchKeys) {
      const enVal = enKeys[key];
      const translated = translations[enVal];
      if (translated && translated !== enVal) {
        set_nested(arData, key, translated);
        translatedCount++;
      }
    }

    if (i + BATCH_SIZE < keysToTranslate.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  fs.writeFileSync(langFile, JSON.stringify(arData, null, 2) + '\n', 'utf-8');
  console.log(`  ✓ Saved Arabic: ${translatedCount} translated`);
}

async function main() {
  console.log('🚀 Translation Fixer Starting...\n');

  const zai = await ZAI.create();

  // Load English as reference
  const enData = JSON.parse(fs.readFileSync(path.join(MESSAGES_DIR, 'en.json'), 'utf-8'));
  const enKeys = get_all_keys(enData);
  console.log(`English reference: ${Object.keys(enKeys).length} keys\n`);

  // Process Arabic first (default language)
  await fixArabicUntranslated(zai, enKeys);

  // Get all language files (excluding en and ar which we already handled)
  const langFiles = fs.readdirSync(MESSAGES_DIR)
    .filter(f => f.endsWith('.json') && !['en.json', 'ar.json'].includes(f))
    .sort();

  console.log(`\nProcessing ${langFiles.length} language files...`);

  const results = {};
  for (const langFile of langFiles) {
    const langCode = langFile.replace('.json', '');
    try {
      results[langCode] = await processLanguage(zai, langCode, enKeys, enData);
    } catch (error) {
      console.error(`❌ Error processing ${langCode}:`, error.message);
      results[langCode] = { error: error.message };
    }
  }

  // Print summary
  console.log('\n\n' + '='.repeat(60));
  console.log('TRANSLATION FIX SUMMARY');
  console.log('='.repeat(60));

  let totalTranslated = 0;
  let totalAdded = 0;
  let totalSkipped = 0;
  let totalExtra = 0;

  for (const [lang, result] of Object.entries(results)) {
    if (result.error) {
      console.log(`  ${lang}: ❌ ${result.error}`);
    } else {
      totalTranslated += result.translatedCount || 0;
      totalAdded += result.addedMissing || 0;
      totalSkipped += result.skippedCount || 0;
      totalExtra += result.extraRemoved || 0;
      console.log(`  ${lang}: ✅ ${result.translatedCount} translated, ${result.addedMissing} added, ${result.skippedCount} skipped, ${result.extraRemoved} extra removed`);
    }
  }

  console.log(`\n  TOTAL: ${totalTranslated} translated, ${totalAdded} added, ${totalSkipped} skipped, ${totalExtra} extra removed`);
  console.log('\n✅ Done!');
}

main().catch(console.error);
