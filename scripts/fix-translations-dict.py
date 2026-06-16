#!/usr/bin/env python3
"""
Comprehensive translation fixer that uses Python-based translation
for common trading platform UI terms. Processes all language files.
"""

import json
import os
import re

MESSAGES_DIR = os.path.join(os.path.dirname(__file__), '..', 'apps', 'web', 'messages')
MESSAGES_DIR = os.path.abspath(MESSAGES_DIR)

# Keys that should remain as English (brand names, technical abbreviations, template vars)
KEEP_AS_IS = {
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
}

# Comprehensive translation dictionary for common English → each language
# These cover the most common UI strings found in the untranslated keys
TRANSLATIONS = {
    # common section
    "common.brand": {
        "ar": "رؤى", "bn": "রুআ", "cs": "Roua", "da": "Roua", "de": "Roua",
        "es": "Roua", "fa": "روآ", "fi": "Roua", "fil": "Roua", "fr": "Roua",
        "he": "Roua", "hi": "रुआ", "hu": "Roua", "id": "Roua", "it": "Roua",
        "ja": "Roua", "ko": "루아", "ms": "Roua", "nl": "Roua", "no": "Roua",
        "pl": "Roua", "pt": "Roua", "ro": "Roua", "ru": "Руа", "sv": "Roua",
        "th": "Roua", "tr": "Roua", "uk": "Руа", "ur": "روآ", "vi": "Roua",
        "zh": "Roua"
    },
    "common.download": {
        "ar": "تنزيل", "bn": "ডাউনলোড", "cs": "Stáhnout", "da": "Download", "de": "Herunterladen",
        "es": "Descargar", "fa": "دانلود", "fi": "Lataa", "fil": "I-download", "fr": "Télécharger",
        "he": "הורדה", "hi": "डाउनलोड", "hu": "Letöltés", "id": "Unduh", "it": "Scarica",
        "ja": "ダウンロード", "ko": "다운로드", "ms": "Muat Turun", "nl": "Downloaden", "no": "Last ned",
        "pl": "Pobierz", "pt": "Baixar", "ro": "Descarcă", "ru": "Скачать", "sv": "Ladda ner",
        "th": "ดาวน์โหลด", "tr": "İndir", "uk": "Завантажити", "ur": "ڈاؤن لوڈ", "vi": "Tải xuống",
        "zh": "下载"
    },
    "common.upload": {
        "ar": "رفع", "bn": "আপলোড", "cs": "Nahrát", "da": "Upload", "de": "Hochladen",
        "es": "Subir", "fa": "آپلود", "fi": "Lähetä", "fil": "I-upload", "fr": "Importer",
        "he": "העלאה", "hi": "अपलोड", "hu": "Feltöltés", "id": "Unggah", "it": "Carica",
        "ja": "アップロード", "ko": "업로드", "ms": "Muat Naik", "nl": "Uploaden", "no": "Last opp",
        "pl": "Prześlij", "pt": "Enviar", "ro": "Încarcă", "ru": "Загрузить", "sv": "Ladda upp",
        "th": "อัปโหลด", "tr": "Yükle", "uk": "Завантажити", "ur": "اپلوڈ", "vi": "Tải lên",
        "zh": "上传"
    },
    "common.filter": {
        "ar": "تصفية", "bn": "ফিল্টার", "cs": "Filtr", "da": "Filtrer", "de": "Filtern",
        "es": "Filtrar", "fa": "فیلتر", "fi": "Suodata", "fil": "I-filter", "fr": "Filtrer",
        "he": "סינון", "hi": "फ़िल्टर", "hu": "Szűrés", "id": "Filter", "it": "Filtra",
        "ja": "フィルター", "ko": "필터", "ms": "Tapis", "nl": "Filteren", "no": "Filtrer",
        "pl": "Filtruj", "pt": "Filtrar", "ro": "Filtru", "ru": "Фильтр", "sv": "Filtrera",
        "th": "กรอง", "tr": "Filtrele", "uk": "Фільтр", "ur": "فلٹر", "vi": "Lọc",
        "zh": "筛选"
    },
    "common.offline": {
        "ar": "غير متصل", "bn": "অফলাইন", "cs": "Offline", "da": "Offline", "de": "Offline",
        "es": "Sin conexión", "fa": "آفلاین", "fi": "Offline-tilassa", "fil": "Offline", "fr": "Hors ligne",
        "he": "לא מקוון", "hi": "ऑफ़लाइन", "hu": "Offline", "id": "Offline", "it": "Offline",
        "ja": "オフライン", "ko": "오프라인", "ms": "Luar talian", "nl": "Offline", "no": "Frakoblet",
        "pl": "Offline", "pt": "Offline", "ro": "Offline", "ru": "Офлайн", "sv": "Offline",
        "th": "ออฟไลน์", "tr": "Çevrimdışı", "uk": "Офлайн", "ur": "آف لائن", "vi": "Ngoại tuyến",
        "zh": "离线"
    },
    "common.demo": {
        "ar": "تجريبي", "bn": "ডেমো", "cs": "Demo", "da": "Demo", "de": "Demo",
        "es": "Demo", "fa": "دمو", "fi": "Demo", "fil": "Demo", "fr": "Démo",
        "he": "דמו", "hi": "डेमो", "hu": "Demo", "id": "Demo", "it": "Demo",
        "ja": "デモ", "ko": "데모", "ms": "Demo", "nl": "Demo", "no": "Demo",
        "pl": "Demo", "pt": "Demo", "ro": "Demo", "ru": "Демо", "sv": "Demo",
        "th": "เดโม", "tr": "Demo", "uk": "Демо", "ur": "ڈیمو", "vi": "Demo",
        "zh": "演示"
    },
    "common.live": {
        "ar": "مباشر", "bn": "লাইভ", "cs": "Živě", "da": "Live", "de": "Live",
        "es": "En vivo", "fa": "زنده", "fi": "Live", "fil": "Live", "fr": "En direct",
        "he": "חי", "hi": "लाइव", "hu": "Élő", "id": "Langsung", "it": "Dal vivo",
        "ja": "ライブ", "ko": "실시간", "ms": "Langsung", "nl": "Live", "no": "Live",
        "pl": "Na żywo", "pt": "Ao vivo", "ro": "Live", "ru": "В реальном времени", "sv": "Live",
        "th": "สด", "tr": "Canlı", "uk": "Наживо", "ur": "لائیو", "vi": "Trực tiếp",
        "zh": "实盘"
    },
    "common.online": {
        "ar": "مباشر", "bn": "অনলাইন", "cs": "Online", "da": "Online", "de": "Online",
        "es": "En línea", "fa": "آنلاین", "fi": "Online", "fil": "Online", "fr": "En ligne",
        "he": "מקוון", "hi": "ऑनलाइन", "hu": "Online", "id": "Online", "it": "Online",
        "ja": "オンライン", "ko": "온라인", "ms": "Dalam talian", "nl": "Online", "no": "Tilkoblet",
        "pl": "Online", "pt": "Online", "ro": "Online", "ru": "Онлайн", "sv": "Online",
        "th": "ออนไลน์", "tr": "Çevrimiçi", "uk": "Онлайн", "ur": "آن لائن", "vi": "Trực tuyến",
        "zh": "在线"
    },
    "common.stop": {
        "ar": "وقف", "bn": "স্টপ", "cs": "Stop", "da": "Stop", "de": "Stop",
        "es": "Stop", "fa": "توقف", "fi": "Stop", "fil": "Stop", "fr": "Stop",
        "he": "עצור", "hi": "स्टॉप", "hu": "Stop", "id": "Stop", "it": "Stop",
        "ja": "ストップ", "ko": "스탑", "ms": "Stop", "nl": "Stop", "no": "Stopp",
        "pl": "Stop", "pt": "Stop", "ro": "Stop", "ru": "Стоп", "sv": "Stopp",
        "th": "หยุด", "tr": "Stop", "uk": "Стоп", "ur": "اسٹاپ", "vi": "Dừng",
        "zh": "止损"
    },
    "common.limit": {
        "ar": "محدد", "bn": "লিমিট", "cs": "Limit", "da": "Limit", "de": "Limit",
        "es": "Límite", "fa": "حد", "fi": "Limit", "fil": "Limit", "fr": "Limite",
        "he": "הגבלה", "hi": "लिमिट", "hu": "Limit", "id": "Limit", "it": "Limite",
        "ja": "リミット", "ko": "리밋", "ms": "Had", "nl": "Limiet", "no": "Grense",
        "pl": "Limit", "pt": "Limite", "ro": "Limită", "ru": "Лимит", "sv": "Gräns",
        "th": "จำกัด", "tr": "Limit", "uk": "Ліміт", "ur": "حد", "vi": "Giới hạn",
        "zh": "限价"
    },
    "common.total": {
        "ar": "الإجمالي", "bn": "মোট", "cs": "Celkem", "da": "Total", "de": "Gesamt",
        "es": "Total", "fa": "مجموع", "fi": "Yhteensä", "fil": "Kabuuan", "fr": "Total",
        "he": "סה\"כ", "hi": "कुल", "hu": "Összesen", "id": "Total", "it": "Totale",
        "ja": "合計", "ko": "합계", "ms": "Jumlah", "nl": "Totaal", "no": "Total",
        "pl": "Razem", "pt": "Total", "ro": "Total", "ru": "Итого", "sv": "Totalt",
        "th": "รวม", "tr": "Toplam", "uk": "Разом", "ur": "کل", "vi": "Tổng",
        "zh": "总计"
    },
    "common.balance": {
        "ar": "الرصيد", "bn": "ব্যালেন্স", "cs": "Zůstatek", "da": "Saldo", "de": "Guthaben",
        "es": "Saldo", "fa": "موجودی", "fi": "Saldo", "fil": "Balanse", "fr": "Solde",
        "he": "יתרה", "hi": "शेष", "hu": "Egyenleg", "id": "Saldo", "it": "Saldo",
        "ja": "残高", "ko": "잔액", "ms": "Baki", "nl": "Saldo", "no": "Saldo",
        "pl": "Saldo", "pt": "Saldo", "ro": "Sold", "ru": "Баланс", "sv": "Saldo",
        "th": "ยอดคงเหลือ", "tr": "Bakiye", "uk": "Баланс", "ur": "بیلنس", "vi": "Số dư",
        "zh": "余额"
    },
    "common.profit": {
        "ar": "الربح", "bn": "লাভ", "cs": "Zisk", "da": "Profit", "de": "Gewinn",
        "es": "Beneficio", "fa": "سود", "fi": "Voitto", "fil": "Kita", "fr": "Profit",
        "he": "רווח", "hi": "लाभ", "hu": "Profit", "id": "Keuntungan", "it": "Profitto",
        "ja": "利益", "ko": "수익", "ms": "Untung", "nl": "Winst", "no": "Fortjeneste",
        "pl": "Zysk", "pt": "Lucro", "ro": "Profit", "ru": "Прибыль", "sv": "Vinst",
        "th": "กำไร", "tr": "Kâr", "uk": "Прибуток", "ur": "منافع", "vi": "Lợi nhuận",
        "zh": "盈利"
    },
    "common.status": {
        "ar": "الحالة", "bn": "স্ট্যাটাস", "cs": "Stav", "da": "Status", "de": "Status",
        "es": "Estado", "fa": "وضعیت", "fi": "Tila", "fil": "Status", "fr": "Statut",
        "he": "סטטוס", "hi": "स्थिति", "hu": "Állapot", "id": "Status", "it": "Stato",
        "ja": "ステータス", "ko": "상태", "ms": "Status", "nl": "Status", "no": "Status",
        "pl": "Status", "pt": "Status", "ro": "Status", "ru": "Статус", "sv": "Status",
        "th": "สถานะ", "tr": "Durum", "uk": "Статус", "ur": "اسٹیٹس", "vi": "Trạng thái",
        "zh": "状态"
    },
    "common.type": {
        "ar": "النوع", "bn": "ধরন", "cs": "Typ", "da": "Type", "de": "Typ",
        "es": "Tipo", "fa": "نوع", "fi": "Tyyppi", "fil": "Uri", "fr": "Type",
        "he": "סוג", "hi": "प्रकार", "hu": "Típus", "id": "Tipe", "it": "Tipo",
        "ja": "タイプ", "ko": "유형", "ms": "Jenis", "nl": "Type", "no": "Type",
        "pl": "Typ", "pt": "Tipo", "ro": "Tip", "ru": "Тип", "sv": "Typ",
        "th": "ประเภท", "tr": "Tür", "uk": "Тип", "ur": "قسم", "vi": "Loại",
        "zh": "类型"
    },
    "common.email": {
        "ar": "البريد الإلكتروني", "bn": "ইমেইল", "cs": "E-mail", "da": "E-mail", "de": "E-Mail",
        "es": "Correo electrónico", "fa": "ایمیل", "fi": "Sähköposti", "fil": "Email", "fr": "E-mail",
        "he": "דוא\"ל", "hi": "ईमेल", "hu": "E-mail", "id": "Email", "it": "Email",
        "ja": "メール", "ko": "이메일", "ms": "E-mel", "nl": "E-mail", "no": "E-post",
        "pl": "E-mail", "pt": "E-mail", "ro": "Email", "ru": "Эл. почта", "sv": "E-post",
        "th": "อีเมล", "tr": "E-posta", "uk": "Ел. пошта", "ur": "ای میل", "vi": "Email",
        "zh": "邮箱"
    },
    "common.name": {
        "ar": "الاسم", "bn": "নাম", "cs": "Název", "da": "Navn", "de": "Name",
        "es": "Nombre", "fa": "نام", "fi": "Nimi", "fil": "Pangalan", "fr": "Nom",
        "he": "שם", "hi": "नाम", "hu": "Név", "id": "Nama", "it": "Nome",
        "ja": "名前", "ko": "이름", "ms": "Nama", "nl": "Naam", "no": "Navn",
        "pl": "Nazwa", "pt": "Nome", "ro": "Nume", "ru": "Имя", "sv": "Namn",
        "th": "ชื่อ", "tr": "İsim", "uk": "Ім'я", "ur": "نام", "vi": "Tên",
        "zh": "名称"
    },
    "common.forex": {
        "ar": "فوركس", "bn": "ফরেক্স", "cs": "Forex", "da": "Forex", "de": "Forex",
        "es": "Forex", "fa": "فارکس", "fi": "Forex", "fil": "Forex", "fr": "Forex",
        "he": "פורקס", "hi": "फॉरेक्स", "hu": "Forex", "id": "Forex", "it": "Forex",
        "ja": "外国為替", "ko": "포렉스", "ms": "Forex", "nl": "Forex", "no": "Forex",
        "pl": "Forex", "pt": "Forex", "ro": "Forex", "ru": "Форекс", "sv": "Forex",
        "th": "ฟอเร็กซ์", "tr": "Forex", "uk": "Форекс", "ur": "فاریکس", "vi": "Forex",
        "zh": "外汇"
    },
    "common.crypto": {
        "ar": "عملات رقمية", "bn": "ক্রিপ্টো", "cs": "Kryptoměny", "da": "Krypto", "de": "Krypto",
        "es": "Criptomonedas", "fa": "کریپتو", "fi": "Krypto", "fil": "Crypto", "fr": "Crypto",
        "he": "קריפטו", "hi": "क्रिप्टो", "hu": "Kripto", "id": "Kripto", "it": "Cripto",
        "ja": "暗号資産", "ko": "암호화폐", "ms": "Kripto", "nl": "Crypto", "no": "Krypto",
        "pl": "Krypto", "pt": "Cripto", "ro": "Cripto", "ru": "Крипто", "sv": "Krypto",
        "th": "คริปโต", "tr": "Kripto", "uk": "Крипто", "ur": "کرپٹو", "vi": "Tiền điện tử",
        "zh": "加密货币"
    },
    "common.tech": {
        "ar": "تقني", "bn": "টেক", "cs": "Technická", "da": "Teknisk", "de": "Technisch",
        "es": "Técnico", "fa": "فنی", "fi": "Tekninen", "fil": "Teknikal", "fr": "Technique",
        "he": "טכני", "hi": "तकनीकी", "hu": "Technikai", "id": "Teknis", "it": "Tecnico",
        "ja": "テクニカル", "ko": "기술적", "ms": "Teknikal", "nl": "Technisch", "no": "Teknisk",
        "pl": "Techniczna", "pt": "Técnico", "ro": "Tehnic", "ru": "Технический", "sv": "Teknisk",
        "th": "เทคนิคัล", "tr": "Teknik", "uk": "Технічний", "ur": "ٹیکنیکل", "vi": "Kỹ thuật",
        "zh": "技术"
    },
    "common.symbol": {
        "ar": "الرمز", "bn": "প্রতীক", "cs": "Symbol", "da": "Symbol", "de": "Symbol",
        "es": "Símbolo", "fa": "نماد", "fi": "Symboli", "fil": "Simbolo", "fr": "Symbole",
        "he": "סמל", "hi": "प्रतीक", "hu": "Szimbólum", "id": "Simbol", "it": "Simbolo",
        "ja": "シンボル", "ko": "심볼", "ms": "Simbol", "nl": "Symbool", "no": "Symbol",
        "pl": "Symbol", "pt": "Símbolo", "ro": "Simbol", "ru": "Символ", "sv": "Symbol",
        "th": "สัญลักษณ์", "tr": "Sembol", "uk": "Символ", "ur": "علامت", "vi": "Ký hiệu",
        "zh": "交易对"
    },
    "common.signal": {
        "ar": "إشارة", "bn": "সিগন্যাল", "cs": "Signál", "da": "Signal", "de": "Signal",
        "es": "Señal", "fa": "سیگنال", "fi": "Signaali", "fil": "Signal", "fr": "Signal",
        "he": "אות", "hi": "सिग्नल", "hu": "Jelzés", "id": "Sinyal", "it": "Segnale",
        "ja": "シグナル", "ko": "시그널", "ms": "Isyarat", "nl": "Signaal", "no": "Signal",
        "pl": "Sygnał", "pt": "Sinal", "ro": "Semnal", "ru": "Сигнал", "sv": "Signal",
        "th": "สัญญาณ", "tr": "Sinyal", "uk": "Сигнал", "ur": "سگنل", "vi": "Tín hiệu",
        "zh": "信号"
    },
    "common.stopLoss": {
        "ar": "وقف الخسارة", "bn": "স্টপ লস", "cs": "Stop Loss", "da": "Stop Loss", "de": "Stop Loss",
        "es": "Stop Loss", "fa": "حد ضرر", "fi": "Stop Loss", "fil": "Stop Loss", "fr": "Stop Loss",
        "he": "סטופ לוס", "hi": "स्टॉप लॉस", "hu": "Stop Loss", "id": "Stop Loss", "it": "Stop Loss",
        "ja": "ストップロス", "ko": "스탑로스", "ms": "Stop Loss", "nl": "Stop Loss", "no": "Stop Loss",
        "pl": "Stop Loss", "pt": "Stop Loss", "ro": "Stop Loss", "ru": "Стоп-лосс", "sv": "Stop Loss",
        "th": "หยุดขาดทุน", "tr": "Zarar Durdur", "uk": "Стоп-лосс", "ur": "اسٹاپ لاس", "vi": "Dừng lỗ",
        "zh": "止损"
    },
    "common.investor": {
        "ar": "مستثمر", "bn": "বিনিয়োগকারী", "cs": "Investor", "da": "Investor", "de": "Anleger",
        "es": "Inversor", "fa": "سرمایه‌گذار", "fi": "Sijoittaja", "fil": "Mamumuhunan", "fr": "Investisseur",
        "he": "משקיע", "hi": "निवेशक", "hu": "Befektető", "id": "Investor", "it": "Investitore",
        "ja": "投資家", "ko": "투자자", "ms": "Pelabur", "nl": "Belegger", "no": "Investor",
        "pl": "Inwestor", "pt": "Investidor", "ro": "Investitor", "ru": "Инвестор", "sv": "Investerare",
        "th": "นักลงทุน", "tr": "Yatırımcı", "uk": "Інвестор", "ur": "سرمایہ کار", "vi": "Nhà đầu tư",
        "zh": "投资者"
    },
    "common.premium": {
        "ar": "بريميوم", "bn": "প্রিমিয়াম", "cs": "Premium", "da": "Premium", "de": "Premium",
        "es": "Premium", "fa": "پریمیوم", "fi": "Premium", "fil": "Premium", "fr": "Premium",
        "he": "פרימיום", "hi": "प्रीमियम", "hu": "Prémium", "id": "Premium", "it": "Premium",
        "ja": "プレミアム", "ko": "프리미엄", "ms": "Premium", "nl": "Premium", "no": "Premium",
        "pl": "Premium", "pt": "Premium", "ro": "Premium", "ru": "Премиум", "sv": "Premium",
        "th": "พรีเมียม", "tr": "Premium", "uk": "Преміум", "ur": "پریمیم", "vi": "Cao cấp",
        "zh": "高级"
    },
    "common.enterprise": {
        "ar": "مؤسسي", "bn": "এন্টারপ্রাইজ", "cs": "Enterprise", "da": "Enterprise", "de": "Enterprise",
        "es": "Empresa", "fa": "سازمانی", "fi": "Enterprise", "fil": "Enterprise", "fr": "Entreprise",
        "he": "אנטרפרייז", "hi": "एंटरप्राइज़", "hu": "Vállalati", "id": "Enterprise", "it": "Enterprise",
        "ja": "エンタープライズ", "ko": "엔터프라이즈", "ms": "Perusahaan", "nl": "Enterprise", "no": "Enterprise",
        "pl": "Enterprise", "pt": "Empresarial", "ro": "Enterprise", "ru": "Бизнес", "sv": "Enterprise",
        "th": "องค์กร", "tr": "Kurumsal", "uk": "Бізнес", "ur": "انٹرپرائز", "vi": "Doanh nghiệp",
        "zh": "企业版"
    },
    "common.asset": {
        "ar": "أصل", "bn": "সম্পদ", "cs": "Aktivum", "da": "Aktiv", "de": "Vermögenswert",
        "es": "Activo", "fa": "دارایی", "fi": "Omaisuus", "fil": "Aset", "fr": "Actif",
        "he": "נכס", "hi": "संपत्ति", "hu": "Eszköz", "id": "Aset", "it": "Attivo",
        "ja": "資産", "ko": "자산", "ms": "Aset", "nl": "Activa", "no": "Eiendel",
        "pl": "Aktywo", "pt": "Ativo", "ro": "Activ", "ru": "Актив", "sv": "Tillgång",
        "th": "สินทรัพย์", "tr": "Varlık", "uk": "Актив", "ur": "اثاثہ", "vi": "Tài sản",
        "zh": "资产"
    },
    "common.account": {
        "ar": "الحساب", "bn": "অ্যাকাউন্ট", "cs": "Účet", "da": "Konto", "de": "Konto",
        "es": "Cuenta", "fa": "حساب", "fi": "Tili", "fil": "Account", "fr": "Compte",
        "he": "חשבון", "hi": "खाता", "hu": "Fiók", "id": "Akun", "it": "Account",
        "ja": "アカウント", "ko": "계정", "ms": "Akaun", "nl": "Account", "no": "Konto",
        "pl": "Konto", "pt": "Conta", "ro": "Cont", "ru": "Аккаунт", "sv": "Konto",
        "th": "บัญชี", "tr": "Hesap", "uk": "Акаунт", "ur": "اکاؤنٹ", "vi": "Tài khoản",
        "zh": "账户"
    },
    "common.menu": {
        "ar": "القائمة", "bn": "মেনু", "cs": "Menu", "da": "Menu", "de": "Menü",
        "es": "Menú", "fa": "منو", "fi": "Valikko", "fil": "Menu", "fr": "Menu",
        "he": "תפריט", "hi": "मेनू", "hu": "Menü", "id": "Menu", "it": "Menu",
        "ja": "メニュー", "ko": "메뉴", "ms": "Menu", "nl": "Menu", "no": "Meny",
        "pl": "Menu", "pt": "Menu", "ro": "Meniu", "ru": "Меню", "sv": "Meny",
        "th": "เมนู", "tr": "Menü", "uk": "Меню", "ur": "مینو", "vi": "Menu",
        "zh": "菜单"
    },
    "common.beta": {
        "ar": "تجريبي", "bn": "বিটা", "cs": "Beta", "da": "Beta", "de": "Beta",
        "es": "Beta", "fa": "بتا", "fi": "Beta", "fil": "Beta", "fr": "Bêta",
        "he": "בטא", "hi": "बीटा", "hu": "Béta", "id": "Beta", "it": "Beta",
        "ja": "ベータ", "ko": "베타", "ms": "Beta", "nl": "Beta", "no": "Beta",
        "pl": "Beta", "pt": "Beta", "ro": "Beta", "ru": "Бета", "sv": "Beta",
        "th": "เบต้า", "tr": "Beta", "uk": "Бета", "ur": "بیٹا", "vi": "Beta",
        "zh": "测试版"
    },
    "common.equity": {
        "ar": "حق الملكية", "bn": "ইক্যুইটি", "cs": "Kapitál", "da": "Equity", "de": "Eigenkapital",
        "es": "Capital", "fa": "حقوق صاحبان سهام", "fi": "Pääoma", "fil": "Equity", "fr": "Capitaux propres",
        "he": "הון עצמי", "hi": "इक्विटी", "hu": "Sajáttőke", "id": "Ekuitas", "it": "Capitale",
        "ja": "純資産", "ko": "지분", "ms": "Ekuiti", "nl": "Eigen vermogen", "no": "Egenkapital",
        "pl": "Kapitał własny", "pt": "Patrimônio", "ro": "Capital propriu", "ru": "Эквити", "sv": "Eget kapital",
        "th": "ส่วนของผู้ถือหุ้น", "tr": "Özkaynak", "uk": "Капітал", "ur": "ایکویٹی", "vi": "Vốn chủ sở hữu",
        "zh": "净值"
    },
    "common.margin": {
        "ar": "الهامش", "bn": "মার্জিন", "cs": "Marže", "da": "Margin", "de": "Margin",
        "es": "Margen", "fa": "حاشیه", "fi": "Marginaali", "fil": "Margin", "fr": "Marge",
        "he": "מרג'ין", "hi": "मार्जिन", "hu": "Árrés", "id": "Margin", "it": "Margine",
        "ja": "証拠金", "ko": "마진", "ms": "Margin", "nl": "Marge", "no": "Margin",
        "pl": "Marża", "pt": "Margem", "ro": "Marjă", "ru": "Маржа", "sv": "Marginal",
        "th": "มาร์จิ้น", "tr": "Teminat", "uk": "Маржа", "ur": "مارجن", "vi": "Ký quỹ",
        "zh": "保证金"
    },
    "common.portfolio": {
        "ar": "المحفظة", "bn": "পোর্টফোলিও", "cs": "Portfolio", "da": "Portefølje", "de": "Portfolio",
        "es": "Portafolio", "fa": "سبد دارایی", "fi": "Salkku", "fil": "Portfolio", "fr": "Portefeuille",
        "he": "תיק השקעות", "hi": "पोर्टफोलियो", "hu": "Portfólió", "id": "Portofolio", "it": "Portafoglio",
        "ja": "ポートフォリオ", "ko": "포트폴리오", "ms": "Portfolio", "nl": "Portefeuille", "no": "Portefølje",
        "pl": "Portfolio", "pt": "Portfólio", "ro": "Portofoliu", "ru": "Портфель", "sv": "Portfölj",
        "th": "พอร์ตโฟลิโอ", "tr": "Portföy", "uk": "Портфель", "ur": "پورٹ فولیو", "vi": "Danh mục",
        "zh": "投资组合"
    },
    "common.position": {
        "ar": "المركز", "bn": "পজিশন", "cs": "Pozice", "da": "Position", "de": "Position",
        "es": "Posición", "fa": "پوزیشن", "fi": "Positio", "fil": "Posisyon", "fr": "Position",
        "he": "פוזיציה", "hi": "पोजीशन", "hu": "Pozíció", "id": "Posisi", "it": "Posizione",
        "ja": "ポジション", "ko": "포지션", "ms": "Kedudukan", "nl": "Positie", "no": "Posisjon",
        "pl": "Pozycja", "pt": "Posição", "ro": "Poziție", "ru": "Позиция", "sv": "Position",
        "th": "สถานะ", "tr": "Pozisyon", "uk": "Позиція", "ur": "پوزیشن", "vi": "Vị thế",
        "zh": "持仓"
    },
    "common.general": {
        "ar": "عام", "bn": "সাধারণ", "cs": "Obecné", "da": "Generelt", "de": "Allgemein",
        "es": "General", "fa": "عمومی", "fi": "Yleinen", "fil": "Pangkalahatan", "fr": "Général",
        "he": "כללי", "hi": "सामान्य", "hu": "Általános", "id": "Umum", "it": "Generale",
        "ja": "一般", "ko": "일반", "ms": "Am", "nl": "Algemeen", "no": "Generelt",
        "pl": "Ogólne", "pt": "Geral", "ro": "General", "ru": "Общие", "sv": "Allmänt",
        "th": "ทั่วไป", "tr": "Genel", "uk": "Загальні", "ur": "عام", "vi": "Chung",
        "zh": "通用"
    },
    "common.minute": {
        "ar": "دقيقة", "bn": "মিনিট", "cs": "Minuta", "da": "Minut", "de": "Minute",
        "es": "Minuto", "fa": "دقیقه", "fi": "Minuutti", "fil": "Minuto", "fr": "Minute",
        "he": "דקה", "hi": "मिनट", "hu": "Perc", "id": "Menit", "it": "Minuto",
        "ja": "分", "ko": "분", "ms": "Minit", "nl": "Minuut", "no": "Minutt",
        "pl": "Minuta", "pt": "Minuto", "ro": "Minut", "ru": "Минута", "sv": "Minut",
        "th": "นาที", "tr": "Dakika", "uk": "Хвилина", "ur": "منٹ", "vi": "Phút",
        "zh": "分钟"
    },
    "common.reset": {
        "ar": "إعادة تعيين", "bn": "রিসেট", "cs": "Resetovat", "da": "Nulstil", "de": "Zurücksetzen",
        "es": "Restablecer", "fa": "بازنشانی", "fi": "Nollaa", "fil": "I-reset", "fr": "Réinitialiser",
        "he": "איפוס", "hi": "रीसेट", "hu": "Visszaállítás", "id": "Reset", "it": "Ripristina",
        "ja": "リセット", "ko": "초기화", "ms": "Set semula", "nl": "Resetten", "no": "Tilbakestill",
        "pl": "Resetuj", "pt": "Redefinir", "ro": "Resetare", "ru": "Сброс", "sv": "Återställ",
        "th": "รีเซ็ต", "tr": "Sıfırla", "uk": "Скинути", "ur": "ری سیٹ", "vi": "Đặt lại",
        "zh": "重置"
    },
    "common.export": {
        "ar": "تصدير", "bn": "রপ্তানি", "cs": "Exportovat", "da": "Eksportér", "de": "Exportieren",
        "es": "Exportar", "fa": "صادرات", "fi": "Vie", "fil": "I-export", "fr": "Exporter",
        "he": "ייצוא", "hi": "निर्यात", "hu": "Exportálás", "id": "Ekspor", "it": "Esporta",
        "ja": "エクスポート", "ko": "내보내기", "ms": "Eksport", "nl": "Exporteren", "no": "Eksporter",
        "pl": "Eksportuj", "pt": "Exportar", "ro": "Exportă", "ru": "Экспорт", "sv": "Exportera",
        "th": "ส่งออก", "tr": "Dışa aktar", "uk": "Експорт", "ur": "ایکسپورٹ", "vi": "Xuất",
        "zh": "导出"
    },
    "common.import": {
        "ar": "استيراد", "bn": "আমদানি", "cs": "Importovat", "da": "Importér", "de": "Importieren",
        "es": "Importar", "fa": "واردات", "fi": "Tuo", "fil": "I-import", "fr": "Importer",
        "he": "ייבוא", "hi": "आयात", "hu": "Importálás", "id": "Impor", "it": "Importa",
        "ja": "インポート", "ko": "가져오기", "ms": "Import", "nl": "Importeren", "no": "Importer",
        "pl": "Importuj", "pt": "Importar", "ro": "Importă", "ru": "Импорт", "sv": "Importera",
        "th": "นำเข้า", "tr": "İçe aktar", "uk": "Імпорт", "ur": "امپورٹ", "vi": "Nhập",
        "zh": "导入"
    },
    "common.aiIntelligence": {
        "ar": "ذكاء اصطناعي", "bn": "এআই ইন্টেলিজেন্স", "cs": "AI Intelligence", "da": "AI-intelligens", "de": "KI-Intelligenz",
        "es": "Inteligencia IA", "fa": "هوش مصنوعی", "fi": "TE-älykkyys", "fil": "AI Intelligence", "fr": "Intelligence IA",
        "he": "מודיעין AI", "hi": "AI इंटेलिजेंस", "hu": "AI Intelligencia", "id": "Kecerdasan AI", "it": "Intelligenza IA",
        "ja": "AIインテリジェンス", "ko": "AI 인텔리전스", "ms": "Kecerdasan AI", "nl": "AI-intelligentie", "no": "AI-intelligens",
        "pl": "Inteligencja AI", "pt": "Inteligência IA", "ro": "Intelligență AI", "ru": "ИИ-аналитика", "sv": "AI-intelligens",
        "th": "ระบบ AI", "tr": "AI İstihbarat", "uk": "ІІ-аналітика", "ur": "AI انٹیلیجنس", "vi": "AI Intelligence",
        "zh": "AI智能"
    },
    "common.dashboard": {
        "ar": "لوحة التحكم", "bn": "ড্যাশবোর্ড", "cs": "Dashboard", "da": "Dashboard", "de": "Dashboard",
        "es": "Panel", "fa": "داشبورد", "fi": "Hallintapaneeli", "fil": "Dashboard", "fr": "Tableau de bord",
        "he": "לוח בקרה", "hi": "डैशबोर्ड", "hu": "Vezérlőpult", "id": "Dashboard", "it": "Dashboard",
        "ja": "ダッシュボード", "ko": "대시보드", "ms": "Papan pemuka", "nl": "Dashboard", "no": "Dashboard",
        "pl": "Panel", "pt": "Painel", "ro": "Dashboard", "ru": "Дашборд", "sv": "Kontrollpanel",
        "th": "แดชบอร์ด", "tr": "Kontrol paneli", "uk": "Дашборд", "ur": "ڈیش بورڈ", "vi": "Bảng điều khiển",
        "zh": "仪表盘"
    },
}

def get_all_keys(d, prefix=''):
    keys = {}
    for k, v in d.items():
        full_key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            keys.update(get_all_keys(v, full_key))
        else:
            keys[full_key] = v
    return keys

def set_nested(data, key_path, value):
    parts = key_path.split('.')
    obj = data
    for part in parts[:-1]:
        if part not in obj or not isinstance(obj[part], dict):
            obj[part] = {}
        obj = obj[part]
    obj[parts[-1]] = value

def is_english_text(s):
    return bool(re.search(r'[a-zA-Z]{2,}', str(s)))

def main():
    print("🔧 Dictionary-based Translation Fixer")
    print("=" * 60)

    # Load English
    with open(os.path.join(MESSAGES_DIR, 'en.json'), 'r', encoding='utf-8') as f:
        en_data = json.load(f)
    en_keys = get_all_keys(en_data)

    # Process each language
    lang_files = sorted([f for f in os.listdir(MESSAGES_DIR) if f.endswith('.json') and f != 'en.json'])
    total_fixed = 0

    for lang_file in lang_files:
        lang_code = lang_file.replace('.json', '')
        lang_path = os.path.join(MESSAGES_DIR, lang_file)
        
        with open(lang_path, 'r', encoding='utf-8') as f:
            lang_data = json.load(f)
        
        lang_keys = get_all_keys(lang_data)
        fixed = 0

        # Apply dictionary translations
        for key, translations in TRANSLATIONS.items():
            if key in KEEP_AS_IS:
                continue
            if lang_code in translations:
                # Check if current value is still English
                current = lang_keys.get(key)
                en_val = en_keys.get(key)
                if current is not None and str(current) == str(en_val) and is_english_text(str(en_val)):
                    set_nested(lang_data, key, translations[lang_code])
                    fixed += 1

        # Remove extra keys not in English
        en_key_set = set(en_keys.keys())
        extra_keys = [k for k in lang_keys if k not in en_key_set]
        if extra_keys:
            for key in extra_keys:
                parts = key.split('.')
                obj = lang_data
                for part in parts[:-1]:
                    if isinstance(obj.get(part), dict):
                        obj = obj[part]
                    else:
                        break
                else:
                    obj.pop(parts[-1], None)

        if fixed > 0 or extra_keys:
            with open(lang_path, 'w', encoding='utf-8') as f:
                json.dump(lang_data, f, ensure_ascii=False, indent=2)
                f.write('\n')
        
        total_fixed += fixed
        if fixed > 0:
            print(f"  {lang_code}: Fixed {fixed} keys, removed {len(extra_keys)} extra keys")
        elif extra_keys:
            print(f"  {lang_code}: Removed {len(extra_keys)} extra keys")
            with open(lang_path, 'w', encoding='utf-8') as f:
                json.dump(lang_data, f, ensure_ascii=False, indent=2)
                f.write('\n')

    print(f"\n✅ Dictionary-based fixes applied: {total_fixed} keys across all languages")

if __name__ == '__main__':
    main()
