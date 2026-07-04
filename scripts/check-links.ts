#!/usr/bin/env tsx
/**
 * check-links.ts — آلية بسيطة لفحص الروابط
 * 
 * الاستخدام:
 *   npx tsx scripts/check-links.ts
 * 
 * كل ما عليك: أضف الرابط في LINKS.md وسيتم فحصه تلقائياً
 */

import * as fs from 'node:fs';
import * as https from 'node:https';
import * as http from 'node:http';

// ─── البيانات ──────────────────────────────────────────────────────

const LINKS_FILE = 'LINKS.md';

interface Link {
  name: string;
  url: string;
  status: 'OK' | 'FAILED' | 'TIMEOUT';
  code?: number;
  error?: string;
}

// ─── دالة فحص الرابط ────────────────────────────────────────────────

async function checkLink(url: string): Promise<{ code: number; error?: string }> {
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http;
    const timeout = setTimeout(() => {
      resolve({ code: 0, error: 'TIMEOUT' });
    }, 5000);

    protocol.head(url, { redirect: 'follow' }, (res) => {
      clearTimeout(timeout);
      resolve({ code: res.statusCode || 0 });
    }).on('error', (err) => {
      clearTimeout(timeout);
      resolve({ code: 0, error: err.message });
    });
  });
}

// ─── قراءة الروابط من الملف ────────────────────────────────────────

function readLinks(): Link[] {
  if (!fs.existsSync(LINKS_FILE)) {
    console.log(`❌ الملف ${LINKS_FILE} غير موجود`);
    process.exit(1);
  }

  const content = fs.readFileSync(LINKS_FILE, 'utf8');
  const links: Link[] = [];

  // صيغة بسيطة جداً:
  // - اسم: الرابط
  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(/^-\s+(.+?):\s+(.+)$/);
    if (match) {
      links.push({
        name: match[1].trim(),
        url: match[2].trim(),
        status: 'OK',
      });
    }
  }

  return links;
}

// ─── الفحص الرئيسي ──────────────────────────────────────────────────

async function main() {
  console.log('\n🔍 فحص الروابط...\n');

  const links = readLinks();
  console.log(`وجدت ${links.length} رابط\n`);

  let passed = 0;
  let failed = 0;

  for (const link of links) {
    process.stdout.write(`  ⏳ ${link.name}... `);

    const result = await checkLink(link.url);

    if (result.error === 'TIMEOUT') {
      console.log('❌ TIMEOUT');
      link.status = 'TIMEOUT';
      link.error = 'انتظرنا 5 ثوان ولم نحصل على رد';
      failed++;
    } else if (result.error) {
      console.log(`❌ خطأ: ${result.error}`);
      link.status = 'FAILED';
      link.error = result.error;
      failed++;
    } else if (result.code >= 200 && result.code < 300) {
      console.log(`✅ OK (${result.code})`);
      link.status = 'OK';
      passed++;
    } else {
      console.log(`⚠️  كود: ${result.code}`);
      link.status = 'FAILED';
      link.error = `HTTP ${result.code}`;
      failed++;
    }
  }

  // ─── النتيجة النهائية ──────────────────────────────────────────

  console.log('\n' + '═'.repeat(50));
  console.log(`✅ نجح: ${passed}`);
  console.log(`❌ فشل: ${failed}`);
  console.log('═'.repeat(50) + '\n');

  // اطبع الفشل فقط
  if (failed > 0) {
    console.log('📋 الروابط التي فشلت:\n');
    links
      .filter(l => l.status !== 'OK')
      .forEach(l => {
        console.log(`  ❌ ${l.name}`);
        console.log(`     الرابط: ${l.url}`);
        console.log(`     السبب: ${l.error}\n`);
      });
    process.exit(1);
  }

  console.log('✅ جميع الروابط تعمل بشكل صحيح!\n');
  process.exit(0);
}

main();
