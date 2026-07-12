/**
 * نظام ترجمة بسيط لـ NestJS API
 * يستخدم Accept-Language header لتحديد اللغة
 * يدعم الترجمات من apps/api/src/i18n/messages/<locale>.json
 */

import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_LOCALE = 'ar';
const SUPPORTED_LOCALES = ['ar', 'en', 'fr', 'de', 'es', 'tr', 'ru', 'zh', 'ja', 'ko', 'hi', 'pt', 'it', 'nl', 'pl', 'sv', 'da', 'no', 'fi', 'cs', 'hu', 'ro', 'uk', 'vi', 'th', 'id', 'ms', 'fil', 'fa', 'ur', 'he', 'bn'];

const translationsCache: Record<string, any> = {};

function loadMessages(locale: string): any {
  if (translationsCache[locale]) return translationsCache[locale];
  
  const messagesDir = path.join(__dirname, 'messages');
  const filePath = path.join(messagesDir, `${locale}.json`);
  
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      translationsCache[locale] = JSON.parse(content);
    } else {
      const defaultPath = path.join(messagesDir, `${DEFAULT_LOCALE}.json`);
      if (fs.existsSync(defaultPath)) {
        translationsCache[locale] = JSON.parse(fs.readFileSync(defaultPath, 'utf-8'));
      } else {
        translationsCache[locale] = {};
      }
    }
  } catch (e) {
    translationsCache[locale] = {};
  }
  
  return translationsCache[locale];
}

export function extractLocale(acceptLanguage?: string): string {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  
  const languages = acceptLanguage.split(',').map(lang => {
    const [code, qStr] = lang.trim().split(';');
    const q = qStr ? parseFloat(qStr.split('=')[1]) : 1;
    return { code: code.trim().toLowerCase(), q };
  });
  languages.sort((a, b) => b.q - a.q);
  
  for (const { code } of languages) {
    const baseLang = code.split('-')[0];
    if (SUPPORTED_LOCALES.includes(code)) return code;
    if (SUPPORTED_LOCALES.includes(baseLang)) return baseLang;
  }
  
  return DEFAULT_LOCALE;
}

export function translate(key: string, locale: string = DEFAULT_LOCALE, vars?: Record<string, any>): string {
  const messages = loadMessages(locale);
  
  const parts = key.split('.');
  let value: any = messages;
  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = value[part];
    } else {
      if (locale !== DEFAULT_LOCALE) {
        return translate(key, DEFAULT_LOCALE, vars);
      }
      return key;
    }
  }
  
  if (typeof value !== 'string') {
    if (locale !== DEFAULT_LOCALE) {
      return translate(key, DEFAULT_LOCALE, vars);
    }
    return key;
  }
  
  if (vars) {
    return value
      .replace(/\$\{(\w+)\}/g, (_, k) => vars[k] !== undefined ? String(vars[k]) : `\${${k}}`)
      .replace(/\{(\w+)\}/g, (_, k) => vars[k] !== undefined ? String(vars[k]) : `{${k}}`);
  }
  
  return value;
}

export function t(key: string, req?: any, vars?: Record<string, any>): string {
  let locale = DEFAULT_LOCALE;
  if (req) {
    const acceptLang = req.headers?.['accept-language'] || req.headers?.['Accept-Language'];
    locale = extractLocale(acceptLang);
  }
  return translate(key, locale, vars);
}

export function tFromAcceptLanguage(key: string, acceptLanguage?: string, vars?: Record<string, any>): string {
  const locale = extractLocale(acceptLanguage);
  return translate(key, locale, vars);
}
