#!/usr/bin/env node
/**
 * V464: Add "assistant" translations to all 32 locale files
 *
 * Adds the following keys to messages.<locale>.json:
 *   assistant.title
 *   assistant.subtitle
 *   assistant.welcome
 *   assistant.input_placeholder
 *   assistant.send
 *   assistant.clear
 *   assistant.open
 *   assistant.close
 *   assistant.suggestions_label
 *
 * Usage: node scripts/add-assistant-translations.js
 */

const fs = require('fs');
const path = require('path');

const MESSAGES_DIR = path.join(__dirname, '..', 'apps', 'web', 'messages');

// Translations for the 9 assistant UI keys in all 32 languages
const TRANSLATIONS = {
  ar: {
    title: 'رؤى — مساعد التداول',
    subtitle: 'مساعدك الذكي',
    welcome: 'مرحبًا! كيف يمكنني مساعدتك اليوم؟',
    input_placeholder: 'اكتب سؤالك...',
    send: 'إرسال',
    clear: 'مسح',
    open: 'فتح المساعد',
    close: 'إغلاق المساعد',
    suggestions_label: 'اقتراحات سريعة:',
  },
  en: {
    title: 'Roua — Trading Assistant',
    subtitle: 'Your smart assistant',
    welcome: 'Hello! How can I help you today?',
    input_placeholder: 'Type your question...',
    send: 'Send',
    clear: 'Clear',
    open: 'Open assistant',
    close: 'Close assistant',
    suggestions_label: 'Quick suggestions:',
  },
  fr: {
    title: 'Roua — Assistant de Trading',
    subtitle: 'Votre assistant intelligent',
    welcome: 'Bonjour ! Comment puis-je vous aider aujourd\'hui ?',
    input_placeholder: 'Tapez votre question...',
    send: 'Envoyer',
    clear: 'Effacer',
    open: 'Ouvrir l\'assistant',
    close: 'Fermer l\'assistant',
    suggestions_label: 'Suggestions rapides :',
  },
  es: {
    title: 'Roua — Asistente de Trading',
    subtitle: 'Tu asistente inteligente',
    welcome: '¡Hola! ¿Cómo puedo ayudarte hoy?',
    input_placeholder: 'Escribe tu pregunta...',
    send: 'Enviar',
    clear: 'Limpiar',
    open: 'Abrir asistente',
    close: 'Cerrar asistente',
    suggestions_label: 'Sugerencias rápidas:',
  },
  de: {
    title: 'Roua — Trading-Assistent',
    subtitle: 'Dein intelligenter Assistent',
    welcome: 'Hallo! Wie kann ich dir heute helfen?',
    input_placeholder: 'Tippe deine Frage...',
    send: 'Senden',
    clear: 'Löschen',
    open: 'Assistent öffnen',
    close: 'Assistent schließen',
    suggestions_label: 'Schnellvorschläge:',
  },
  ru: {
    title: 'Roua — Торговый помощник',
    subtitle: 'Ваш умный помощник',
    welcome: 'Здравствуйте! Чем я могу помочь сегодня?',
    input_placeholder: 'Введите ваш вопрос...',
    send: 'Отправить',
    clear: 'Очистить',
    open: 'Открыть помощник',
    close: 'Закрыть помощник',
    suggestions_label: 'Быстрые подсказки:',
  },
  tr: {
    title: 'Roua — İşlem Asistanı',
    subtitle: 'Akıllı asistanınız',
    welcome: 'Merhaba! Bugün size nasıl yardımcı olabilirim?',
    input_placeholder: 'Sorunuzu yazın...',
    send: 'Gönder',
    clear: 'Temizle',
    open: 'Asistanı aç',
    close: 'Asistanı kapat',
    suggestions_label: 'Hızlı öneriler:',
  },
  pt: {
    title: 'Roua — Assistente de Trading',
    subtitle: 'Seu assistente inteligente',
    welcome: 'Olá! Como posso ajudar você hoje?',
    input_placeholder: 'Digite sua pergunta...',
    send: 'Enviar',
    clear: 'Limpar',
    open: 'Abrir assistente',
    close: 'Fechar assistente',
    suggestions_label: 'Sugestões rápidas:',
  },
  it: {
    title: 'Roua — Assistente di Trading',
    subtitle: 'Il tuo assistente intelligente',
    welcome: 'Ciao! Come posso aiutarti oggi?',
    input_placeholder: 'Scrivi la tua domanda...',
    send: 'Invia',
    clear: 'Cancella',
    open: 'Apri assistente',
    close: 'Chiudi assistente',
    suggestions_label: 'Suggerimenti rapidi:',
  },
  nl: {
    title: 'Roua — Trading Assistent',
    subtitle: 'Jouw slimme assistent',
    welcome: 'Hallo! Hoe kan ik je vandaag helpen?',
    input_placeholder: 'Typ je vraag...',
    send: 'Verstuur',
    clear: 'Wissen',
    open: 'Assistent openen',
    close: 'Assistent sluiten',
    suggestions_label: 'Snelle suggesties:',
  },
  pl: {
    title: 'Roua — Asystent Trading',
    subtitle: 'Twój inteligentny asystent',
    welcome: 'Cześć! Jak mogę ci dziś pomóc?',
    input_placeholder: 'Wpisz swoje pytanie...',
    send: 'Wyślij',
    clear: 'Wyczyść',
    open: 'Otwórz asystenta',
    close: 'Zamknij asystenta',
    suggestions_label: 'Szybkie sugestie:',
  },
  zh: {
    title: 'Roua — 交易助手',
    subtitle: '您的智能助手',
    welcome: '你好！今天我能帮你什么？',
    input_placeholder: '输入你的问题...',
    send: '发送',
    clear: '清除',
    open: '打开助手',
    close: '关闭助手',
    suggestions_label: '快速建议：',
  },
  ja: {
    title: 'Roua — トレーディングアシスタント',
    subtitle: 'あなたのスマートアシスタント',
    welcome: 'こんにちは！今日はどうお手伝いしましょうか？',
    input_placeholder: '質問を入力...',
    send: '送信',
    clear: 'クリア',
    open: 'アシスタントを開く',
    close: 'アシスタントを閉じる',
    suggestions_label: 'クイック提案：',
  },
  ko: {
    title: 'Roua — 트레이딩 어시스턴트',
    subtitle: '스마트 어시스턴트',
    welcome: '안녕하세요! 오늘 어떻게 도와드릴까요?',
    input_placeholder: '질문을 입력하세요...',
    send: '보내기',
    clear: '지우기',
    open: '어시스턴트 열기',
    close: '어시스턴트 닫기',
    suggestions_label: '빠른 제안:',
  },
  hi: {
    title: 'Roua — ट्रेडिंग सहायक',
    subtitle: 'आपका स्मार्ट सहायक',
    welcome: 'नमस्ते! आज मैं आपकी कैसे मदद कर सकता हूँ?',
    input_placeholder: 'अपना प्रश्न लिखें...',
    send: 'भेजें',
    clear: 'साफ़ करें',
    open: 'सहायक खोलें',
    close: 'सहायक बंद करें',
    suggestions_label: 'त्वरित सुझाव:',
  },
  fa: {
    title: 'Roua — دستیار معاملات',
    subtitle: 'دستیار هوشمند شما',
    welcome: 'سلام! امروز چطور می‌توانم کمکتان کنم؟',
    input_placeholder: 'سوال خود را بنویسید...',
    send: 'ارسال',
    clear: 'پاک کردن',
    open: 'باز کردن دستیار',
    close: 'بستن دستیار',
    suggestions_label: 'پیشنهادهای سریع:',
  },
  ur: {
    title: 'Roua — ٹریڈنگ اسسٹنٹ',
    subtitle: 'آپ کا سمارٹ اسسٹنٹ',
    welcome: 'ہیلو! آج میں آپ کی کیسے مدد کر سکتا ہوں؟',
    input_placeholder: 'اپنا سوال لکھیں...',
    send: 'بھیجیں',
    clear: 'صاف کریں',
    open: 'اسسٹنٹ کھولیں',
    close: 'اسسٹنٹ بند کریں',
    suggestions_label: 'فوری تجاویز:',
  },
  vi: {
    title: 'Roua — Trợ lý Giao dịch',
    subtitle: 'Trợ lý thông minh của bạn',
    welcome: 'Xin chào! Hôm nay tôi có thể giúp gì cho bạn?',
    input_placeholder: 'Nhập câu hỏi của bạn...',
    send: 'Gửi',
    clear: 'Xóa',
    open: 'Mở trợ lý',
    close: 'Đóng trợ lý',
    suggestions_label: 'Gợi ý nhanh:',
  },
  th: {
    title: 'Roua — ผู้ช่วยเทรด',
    subtitle: 'ผู้ช่วยอัจฉริยะของคุณ',
    welcome: 'สวัสดี! วันนี้ฉันช่วยอะไรคุณได้บ้าง?',
    input_placeholder: 'พิมพ์คำถามของคุณ...',
    send: 'ส่ง',
    clear: 'ล้าง',
    open: 'เปิดผู้ช่วย',
    close: 'ปิดผู้ช่วย',
    suggestions_label: 'คำแนะนำรวดเร็ว:',
  },
  id: {
    title: 'Roua — Asisten Trading',
    subtitle: 'Asisten cerdas Anda',
    welcome: 'Halo! Bagaimana saya bisa membantu Anda hari ini?',
    input_placeholder: 'Ketik pertanyaan Anda...',
    send: 'Kirim',
    clear: 'Hapus',
    open: 'Buka asisten',
    close: 'Tutup asisten',
    suggestions_label: 'Saran cepat:',
  },
  ms: {
    title: 'Roua — Pembantu Perdagangan',
    subtitle: 'Pembantu pintar anda',
    welcome: 'Helo! Bagaimana saya boleh membantu anda hari ini?',
    input_placeholder: 'Taip soalan anda...',
    send: 'Hantar',
    clear: 'Padam',
    open: 'Buka pembantu',
    close: 'Tutup pembantu',
    suggestions_label: 'Cadangan pantas:',
  },
  sv: {
    title: 'Roua — Handelsassistent',
    subtitle: 'Din smarta assistent',
    welcome: 'Hej! Hur kan jag hjälpa dig idag?',
    input_placeholder: 'Skriv din fråga...',
    send: 'Skicka',
    clear: 'Rensa',
    open: 'Öppna assistent',
    close: 'Stäng assistent',
    suggestions_label: 'Snabba förslag:',
  },
  uk: {
    title: 'Roua — Торговий помічник',
    subtitle: 'Ваш розумний помічник',
    welcome: 'Привіт! Як я можу допомогти вам сьогодні?',
    input_placeholder: 'Введіть своє запитання...',
    send: 'Надіслати',
    clear: 'Очистити',
    open: 'Відкрити помічника',
    close: 'Закрити помічника',
    suggestions_label: 'Швидкі підказки:',
  },
  fil: {
    title: 'Roua — Trading Assistant',
    subtitle: 'Ang iyong matalinong assistant',
    welcome: 'Hello! Paano kita matutulungan ngayon?',
    input_placeholder: 'I-type ang iyong tanong...',
    send: 'Ipadala',
    clear: 'Burahin',
    open: 'Buksan ang assistant',
    close: 'Isara ang assistant',
    suggestions_label: 'Mga mabilis na suhestiyon:',
  },
  da: {
    title: 'Roua — Handelsassistent',
    subtitle: 'Din smarte assistent',
    welcome: 'Hej! Hvordan kan jeg hjælpe dig i dag?',
    input_placeholder: 'Skriv dit spørgsmål...',
    send: 'Send',
    clear: 'Ryd',
    open: 'Åbn assistent',
    close: 'Luk assistent',
    suggestions_label: 'Hurtige forslag:',
  },
  no: {
    title: 'Roua — Handelsassistent',
    subtitle: 'Din smarte assistent',
    welcome: 'Hei! Hvordan kan jeg hjelpe deg i dag?',
    input_placeholder: 'Skriv spørsmålet ditt...',
    send: 'Send',
    clear: 'Tøm',
    open: 'Åpne assistent',
    close: 'Lukk assistent',
    suggestions_label: 'Hurtige forslag:',
  },
  fi: {
    title: 'Roua — Kaupankäyntiavustaja',
    subtitle: 'Älykäs avustajasi',
    welcome: 'Hei! Kuinka voin auttaa sinua tänään?',
    input_placeholder: 'Kirjoita kysymyksesi...',
    send: 'Lähetä',
    clear: 'Tyhjennä',
    open: 'Avaa avustaja',
    close: 'Sulje avustaja',
    suggestions_label: 'Nopeat ehdotukset:',
  },
  cs: {
    title: 'Roua — Obchodní asistent',
    subtitle: 'Váš chytrý asistent',
    welcome: 'Ahoj! Jak vám dnes mohu pomoci?',
    input_placeholder: 'Napište svou otázku...',
    send: 'Odeslat',
    clear: 'Vymazat',
    open: 'Otevřít asistenta',
    close: 'Zavřít asistenta',
    suggestions_label: 'Rychlé návrhy:',
  },
  hu: {
    title: 'Roua — Kereskedési asszisztens',
    subtitle: 'Az intelligens asszisztense',
    welcome: 'Szia! Hogyan segíthetek ma?',
    input_placeholder: 'Írd be a kérdésed...',
    send: 'Küldés',
    clear: 'Törlés',
    open: 'Asszisztens megnyitása',
    close: 'Asszisztens bezárása',
    suggestions_label: 'Gyors javaslatok:',
  },
  ro: {
    title: 'Roua — Asistent de Tranzacționare',
    subtitle: 'Asistentul tău inteligent',
    welcome: 'Salut! Cum te pot ajuta astăzi?',
    input_placeholder: 'Scrie întrebarea ta...',
    send: 'Trimite',
    clear: 'Șterge',
    open: 'Deschide asistent',
    close: 'Închide asistent',
    suggestions_label: 'Sugestii rapide:',
  },
  bn: {
    title: 'Roua — ট্রেডিং সহকারী',
    subtitle: 'আপনার স্মার্ট সহকারী',
    welcome: 'হ্যালো! আজ আমি আপনাকে কীভাবে সাহায্য করতে পারি?',
    input_placeholder: 'আপনার প্রশ্ন লিখুন...',
    send: 'পাঠান',
    clear: 'মুছুন',
    open: 'সহকারী খুলুন',
    close: 'সহকারী বন্ধ করুন',
    suggestions_label: 'দ্রুত পরামর্শ:',
  },
  he: {
    title: 'Roua — עוזר מסחר',
    subtitle: 'העוזר החכם שלך',
    welcome: 'שלום! איך אוכל לעזור לך היום?',
    input_placeholder: 'הקלד את השאלה שלך...',
    send: 'שלח',
    clear: 'נקה',
    open: 'פתח עוזר',
    close: 'סגור עוזר',
    suggestions_label: 'הצעות מהירות:',
  },
};

// Fallback to English for any missing language
const FALLBACK = TRANSLATIONS.en;

function addTranslationsToFile(locale) {
  const filePath = path.join(MESSAGES_DIR, `${locale}.json`);
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️ File not found: ${filePath}`);
    return false;
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);

    // Get translations (fallback to English)
    const translations = TRANSLATIONS[locale] ?? FALLBACK;

    // Add assistant key (overwrite if exists)
    data.assistant = translations;

    // Write back with proper formatting (2-space indent, matching existing style)
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`✅ ${locale}: added assistant translations (${Object.keys(translations).length} keys)`);
    return true;
  } catch (e) {
    console.error(`❌ ${locale}: ${e.message}`);
    return false;
  }
}

// Process all 32 locales
const locales = Object.keys(TRANSLATIONS);
let success = 0;
let failed = 0;

console.log(`\n🌐 Adding assistant translations to ${locales.length} locales...\n`);

for (const locale of locales) {
  if (addTranslationsToFile(locale)) {
    success++;
  } else {
    failed++;
  }
}

console.log(`\n📊 Summary: ${success} succeeded, ${failed} failed (${locales.length} total)\n`);

if (failed > 0) {
  process.exit(1);
}
