#!/usr/bin/env python3
"""
Final translation fixer - focuses on the most important remaining untranslated strings.
Handles tooltips, descriptions, and long UI text that genuinely needs translation.
Short international terms (Forex, Demo, Pro, etc.) are kept in English.
"""

import json
import os
import re

MESSAGES_DIR = os.path.join(os.path.dirname(__file__), '..', 'apps', 'web', 'messages')
MESSAGES_DIR = os.path.abspath(MESSAGES_DIR)

# The 9 keys that were missing from all non-Arabic languages
# Already added with English values. Let me add proper translations now.
MISSING_KEY_TRANSLATIONS = {
    "dashboard.trading.balanceTooltipReal": {
        "en": "Total wallet balance — includes margin used in positions",
        "ar": "رصيد المحفظة الإجمالي — يشمل الهامش المستخدم في الصفقات",
        "bn": "মোট ওয়ালেট ব্যালেন্স — পজিশনে ব্যবহৃত মার্জিন অন্তর্ভুক্ত",
        "cs": "Celkový zůstatek peněženky — zahrnuje marži použitou v pozicích",
        "da": "Samlet tegnebogssaldo — inkluderer margin brugt i positioner",
        "de": "Gesamtes Guthaben — einschließlich der in Positionen verwendeten Margin",
        "es": "Saldo total de la cartera — incluye el margen utilizado en posiciones",
        "fa": "موجودی کل کیف پول — شامل حاشیه استفاده شده در پوزیشن‌ها",
        "fi": "Lompakon kokonaissaldo — sisältää positioissa käytetyn marginaalin",
        "fil": "Kabuuang balanse ng wallet — kasama ang margin na ginamit sa mga posisyon",
        "fr": "Solde total du portefeuille — inclut la marge utilisée dans les positions",
        "he": "יתרת הארנק הכוללת — כוללת מרג'ין שבשימוש בפוזיציות",
        "hi": "कुल वॉलेट बैलेंस — पोजीशन में उपयोग किया गया मार्जिन शामिल",
        "hu": "Teljes tárcaegyenleg — tartalmazza a pozíciókban felhasznált margót",
        "id": "Total saldo dompet — termasuk margin yang digunakan dalam posisi",
        "it": "Saldo totale del portafoglio — include il margine utilizzato nelle posizioni",
        "ja": "ウォレット残高合計 — ポジションで使用中の証拠金を含む",
        "ko": "총 지갑 잔액 — 포지션에 사용된 마진 포함",
        "ms": "Jumlah baki dompet — termasuk margin yang digunakan dalam kedudukan",
        "nl": "Totale portemonneesaldo — inclusief marge gebruikt in posities",
        "no": "Total lommeboksaldo — inkluderer margin brukt i posisjoner",
        "pl": "Całkowite saldo portfela — zawiera margines użyty w pozycjach",
        "pt": "Saldo total da carteira — inclui margem utilizada nas posições",
        "ro": "Soldul total al portofelului — include marja utilizată în poziții",
        "ru": "Общий баланс кошелька — включает маржу, используемую в позициях",
        "sv": "Total plånbokssaldo — inkluderar marginal använd i positioner",
        "th": "ยอดคงเหลือกระเป๋าเงินทั้งหมด — รวมมาร์จิ้นที่ใช้ในตำแหน่ง",
        "tr": "Toplam cüzdan bakiyesi — pozisyonlarda kullanılan teminatı içerir",
        "uk": "Загальний баланс гаманця — включає маржу, використану в позиціях",
        "ur": "کل والیٹ بیلنس — پوزیشنز میں استعمال شدہ مارجن شامل",
        "vi": "Tổng số dư ví — bao gồm ký quỹ đã sử dụng trong các vị thế",
        "zh": "钱包总余额 — 包含持仓中使用的保证金",
    },
    "dashboard.trading.freeMarginTooltip": {
        "en": "Amount available to open new positions = Balance - Used Margin + Unrealized P/L",
        "ar": "المبلغ المتاح لفتح صفقات جديدة = الرصيد - الهامش المستخدم + ر/خ غير محقق",
        "bn": "নতুন পজিশন খোলার জন্য উপলব্ধ পরিমাণ = ব্যালেন্স - ব্যবহৃত মার্জিন + অবাস্তবিত P/L",
        "cs": "Částka dostupná pro otevření nových pozic = Zůstatek - Použitá marž + Nerealizovaný P/L",
        "da": "Beløb til rådighed for nye positioner = Saldo - Brugt margin + Urealiseret P/L",
        "de": "Verfügbarer Betrag für neue Positionen = Guthaben - Verwendete Margin + Nicht realisierter P/L",
        "es": "Monto disponible para abrir nuevas posiciones = Saldo - Margen utilizado + P/L no realizado",
        "fa": "مبلغ موجود برای باز کردن پوزیشن‌های جدید = موجودی - حاشیه استفاده شده + س/ز محقق‌نشده",
        "fi": "Uusien positioiden avaamiseen saatavilla oleva määrä = Saldo - Käytetty marginaali + Toteutumaton P/L",
        "fil": "Halaga na magagamit para sa mga bagong posisyon = Balanse - Ginamit na Margin + Hindi na-realize na P/L",
        "fr": "Montant disponible pour ouvrir de nouvelles positions = Solde - Marge utilisée + P/L non réalisé",
        "he": "סכום זמין לפתיחת פוזיציות חדשות = יתרה - מרג'ין בשימוש + רווח/הפסד לא ממומש",
        "hi": "नई पोजीशन खोलने के लिए उपलब्ध राशि = बैलेंस - उपयोग किया गया मार्जिन + अवास्तविक P/L",
        "hu": "Új pozíciók nyitásához rendelkezésre álló összeg = Egyenleg - Felhasznált margó + Nem realizált P/L",
        "id": "Jumlah tersedia untuk membuka posisi baru = Saldo - Margin Terpakai + P/L Terealisasi",
        "it": "Importo disponibile per aprire nuove posizioni = Saldo - Margine utilizzato + P/L non realizzato",
        "ja": "新規ポジションに利用可能な額 = 残高 - 使用中証拠金 + 未実現損益",
        "ko": "신규 포지션 개시 가능 금액 = 잔액 - 사용 마진 + 미실현 손익",
        "ms": "Amaun tersedia untuk membuka kedudukan baru = Baki - Margin Digunakan + P/L Tidak Direalisasikan",
        "nl": "Bedrag beschikbaar voor nieuwe posities = Saldo - Gebruikte marge + Ongerealiseerde P/L",
        "no": "Beløp tilgjengelig for nye posisjoner = Saldo - Brukt margin + Urealisert P/L",
        "pl": "Kwota dostępna na otwarcie nowych pozycji = Saldo - Użyty margines + Nierealizowany P/L",
        "pt": "Valor disponível para abrir novas posições = Saldo - Margem utilizada + P/L não realizado",
        "ro": "Sumă disponibilă pentru deschiderea de poziții noi = Sold - Marjă utilizată + P/L nerealizat",
        "ru": "Доступная сумма для открытия новых позиций = Баланс - Использованная маржа + Нереализованный P/L",
        "sv": "Belopp tillgängligt för nya positioner = Saldo - Använd marginal + Orealiserad P/L",
        "th": "จำนวนที่ใช้เปิดตำแหน่งใหม่ได้ = ยอดคงเหลือ - มาร์จิ้นที่ใช้ + กำไร/ขาดทุนที่ยังไม่เกิดขึ้นจริง",
        "tr": "Yeni pozisyon açmak için kullanılabilir tutar = Bakiye - Kullanılan Teminat + Gerçekleşmemiş K/Z",
        "uk": "Доступна сума для відкриття нових позицій = Баланс - Використана маржа + Нереалізований P/L",
        "ur": "نئی پوزیشنز کھولنے کے لیے دستیاب رقم = بیلنس - استعمال شدہ مارجن + غیر محققہ P/L",
        "vi": "Số tiền khả dụng để mở vị thế mới = Số dư - Ký quỹ đã dùng + P/L chưa thực hiện",
        "zh": "可用于开立新仓的金额 = 余额 - 已用保证金 + 未实现盈亏",
    },
    "dashboard.trading.balanceTooltipPaper": {
        "en": "Your actual balance — includes margin locked in open positions",
        "ar": "رصيدك الفعلي — يشمل الهامش المحجوز في الصفقات المفتوحة",
        "bn": "আপনার প্রকৃত ব্যালেন্স — খোলা পজিশনে লক করা মার্জিন অন্তর্ভুক্ত",
        "cs": "Váš skutečný zůstatek — zahrnuje marži uzamčenou v otevřených pozicích",
        "da": "Din faktiske saldo — inkluderer margin låst i åbne positioner",
        "de": "Ihr tatsächliches Guthaben — einschließlich der in offenen Positionen gebundenen Margin",
        "es": "Su saldo real — incluye el margen bloqueado en posiciones abiertas",
        "fa": "موجودی واقعی شما — شامل حاشیه قفل‌شده در پوزیشن‌های باز",
        "fi": "Todellinen saldosi — sisältää avoimiin positioihin lukitun marginaalin",
        "fil": "Ang iyong aktwal na balanse — kasama ang margin na nakalock sa mga bukas na posisyon",
        "fr": "Votre solde réel — inclut la marge bloquée dans les positions ouvertes",
        "he": "היתרה בפועל שלך — כוללת מרג'ין נעול בפוזיציות פתוחות",
        "hi": "आपका वास्तविक बैलेंस — खुली पोजीशन में लॉक किया गया मार्जिन शामिल",
        "hu": "Tényleges egyenlege — tartalmazza a nyitott pozíciókban zárolt margót",
        "id": "Saldo aktual Anda — termasuk margin yang terkunci dalam posisi terbuka",
        "it": "Il tuo saldo effettivo — include il margine bloccato nelle posizioni aperte",
        "ja": "実際の残高 — 未決済ポジションにロック中の証拠金を含む",
        "ko": "실제 잔액 — 미결제 포지션에 묶인 마진 포함",
        "ms": "Baki sebenar anda — termasuk margin yang dikunci dalam kedudukan terbuka",
        "nl": "Uw werkelijke saldo — inclusief marge vastgezet in open posities",
        "no": "Din faktiske saldo — inkluderer margin låst i åpne posisjoner",
        "pl": "Twoje rzeczywiste saldo — zawiera margines zablokowany w otwartych pozycjach",
        "pt": "Seu saldo real — inclui margem bloqueada em posições abertas",
        "ro": "Soldul dvs. real — include marja blocată în pozițiile deschise",
        "ru": "Ваш фактический баланс — включает маржу, заблокированную в открытых позициях",
        "sv": "Ditt faktiska saldo — inkluderar marginal låst i öppna positioner",
        "th": "ยอดคงเหลือจริงของคุณ — รวมมาร์จิ้นที่ล็อคในตำแหน่งที่เปิดอยู่",
        "tr": "Gerçek bakiyeniz — açık pozisyonlarda kilitli teminatı içerir",
        "uk": "Ваш фактичний баланс — включає маржу, заблоковану у відкритих позиціях",
        "ur": "آپ کا اصل بیلنس — کھلی پوزیشنز میں لاک مارجن شامل",
        "vi": "Số dư thực tế của bạn — bao gồm ký quỹ bị khóa trong các vị thế mở",
        "zh": "您的实际余额 — 包含未平仓中锁定的保证金",
    },
    "dashboard.trading.usedMarginTooltip": {
        "en": "Amount locked as collateral for open positions — returned on close",
        "ar": "المبلغ المحجوز كضمان للصفقات المفتوحة — يُعاد عند الإغلاق",
        "bn": "খোলা পজিশনের জন্য জামানত হিসেবে লক করা পরিমাণ — বন্ধ করার সময় ফেরত দেওয়া হয়",
        "cs": "Částka uzamčená jako zástava pro otevřené pozice — vrácena při uzavření",
        "da": "Beløb låst som sikkerhed for åbne positioner — returneres ved lukning",
        "de": "Als Sicherheit für offene Positionen gebundener Betrag — wird bei Schließung zurückgegeben",
        "es": "Monto bloqueado como garantía de posiciones abiertas — se devuelve al cerrar",
        "fa": "مبلغ قفل‌شده به عنوان وثیقه برای پوزیشن‌های باز — هنگام بستن بازگردانده می‌شود",
        "fi": "Avoimien positioiden vakuudeksi lukittu määrä — palautetaan sulkemisen yhteydessä",
        "fil": "Halagang nakalock bilang collateral para sa mga bukas na posisyon — ibabalik sa pagsasara",
        "fr": "Montant bloqué en garantie pour les positions ouvertes — restitué à la clôture",
        "he": "סכום נעול כערובה לפוזיציות פתוחות — מוחזר בעת סגירה",
        "hi": "खुली पोजीशन के लिए संपार्श्विक के रूप में लॉक की गई राशि — बंद करने पर वापस की जाती है",
        "hu": "Nyitott pozíciók fedezeteként zárolt összeg — záráskor visszakapja",
        "id": "Jumlah terkunci sebagai jaminan untuk posisi terbuka — dikembalikan saat ditutup",
        "it": "Importo bloccato come garanzia per le posizioni aperte — reso alla chiusura",
        "ja": "未決済ポジションの担保としてロック中の額 — 決済時に返還",
        "ko": "미결제 포지션의 담보로 묶인 금액 — 청산 시 반환",
        "ms": "Amaun yang dikunci sebagai cagaran untuk kedudukan terbuka — dikembalikan semasa penutupan",
        "nl": "Bedrag vastgezet als onderpand voor open posities — wordt teruggegeven bij sluiting",
        "no": "Beløp låst som sikkerhet for åpne posisjoner — returneres ved stengetid",
        "pl": "Kwota zablokowana jako zabezpieczenie otwartych pozycji — zwracana przy zamknięciu",
        "pt": "Valor bloqueado como garantia para posições abertas — devolvido ao fechar",
        "ro": "Sumă blocată ca garanție pentru pozițiile deschise — returnată la închidere",
        "ru": "Сумма, заблокированная как обеспечение открытых позиций — возвращается при закрытии",
        "sv": "Belopp låst som säkerhet för öppna positioner — återbetalas vid stängning",
        "th": "จำนวนที่ล็อคเป็นหลักประกันสำหรับตำแหน่งที่เปิดอยู่ — คืนเมื่อปิด",
        "tr": "Açık pozisyonlar için teminat olarak kilitli tutar — kapatıldığında iade edilir",
        "uk": "Сума, заблокована як забезпечення відкритих позицій — повертається при закритті",
        "ur": "کھلی پوزیشنز کے لیے ضمانت کے طور پر لاک کردہ رقم — بند کرنے پر واپس",
        "vi": "Số tiền bị khóa làm tài sản đảm bảo cho các vị thế mở — được hoàn lại khi đóng",
        "zh": "作为未平仓担保被锁定的金额 — 平仓时返还",
    },
    "dashboard.trading.equityTooltip": {
        "en": "Balance + Unrealized P/L — changes as prices move",
        "ar": "الرصيد + الربح/الخسارة غير المحققة — يتغير مع تحرك الأسعار",
        "bn": "ব্যালেন্স + অবাস্তবিত P/L — দাম পরিবর্তনের সাথে পরিবর্তিত হয়",
        "cs": "Zůstatek + Nerealizovaný P/L — mění se s pohybem cen",
        "da": "Saldo + Urealiseret P/L — ændres når priserne bevæger sig",
        "de": "Guthaben + Nicht realisierter P/L — ändert sich mit den Preisbewegungen",
        "es": "Saldo + P/L no realizado — cambia con los movimientos de precio",
        "fa": "موجودی + س/ز محقق‌نشده — با حرکت قیمت‌ها تغییر می‌کند",
        "fi": "Saldo + Toteutumaton P/L — muuttuu hintojen liikkeen mukaan",
        "fil": "Balanse + Hindi na-realize na P/L — nagbabago habang gumagalaw ang presyo",
        "fr": "Solde + P/L non réalisé — évolue avec les mouvements de prix",
        "he": "יתרה + רווח/הפסד לא ממומש — משתנה ככל שהמחירים נעים",
        "hi": "बैलेंस + अवास्तविक P/L — कीमतें चलने पर बदलता है",
        "hu": "Egyenleg + Nem realizált P/L — az árak mozgásával változik",
        "id": "Saldo + P/L Tidak Terealisasi — berubah seiring pergerakan harga",
        "it": "Saldo + P/L non realizzato — cambia al variare dei prezzi",
        "ja": "残高 + 未実現損益 — 価格変動により変化",
        "ko": "잔액 + 미실현 손익 — 가격 변동에 따라 변함",
        "ms": "Baki + P/L Tidak Direalisasikan — berubah apabila harga bergerak",
        "nl": "Saldo + Ongerealiseerde P/L — verandert naarmate prijzen bewegen",
        "no": "Saldo + Urealisert P/L — endres etter hvert som prisene beveger seg",
        "pl": "Saldo + Nierealizowany P/L — zmienia się wraz z ruchami cen",
        "pt": "Saldo + P/L não realizado — muda com a movimentação dos preços",
        "ro": "Sold + P/L nerealizat — se modifică odată cu mișcarea prețurilor",
        "ru": "Баланс + Нереализованный P/L — меняется с движением цен",
        "sv": "Saldo + Orealiserad P/L — ändras i takt med prisrörelser",
        "th": "ยอดคงเหลือ + กำไร/ขาดทุนที่ยังไม่เกิดขึ้นจริง — เปลี่ยนแปลงตามราคา",
        "tr": "Bakiye + Gerçekleşmemiş K/Z — fiyatlar hareket ettikçe değişir",
        "uk": "Баланс + Нереалізований P/L — змінюється з рухом цін",
        "ur": "بیلنس + غیر محققہ P/L — قیمتوں کی حرکت کے ساتھ تبدیل ہوتا ہے",
        "vi": "Số dư + P/L chưa thực hiện — thay đổi khi giá biến động",
        "zh": "余额 + 未实现盈亏 — 随价格变动而变化",
    },
    "portfolio.balance": {
        "en": "Balance",
        "ar": "الرصيد", "bn": "ব্যালেন্স", "cs": "Zůstatek", "da": "Saldo", "de": "Guthaben",
        "es": "Saldo", "fa": "موجودی", "fi": "Saldo", "fil": "Balanse", "fr": "Solde",
        "he": "יתרה", "hi": "शेष", "hu": "Egyenleg", "id": "Saldo", "it": "Saldo",
        "ja": "残高", "ko": "잔액", "ms": "Baki", "nl": "Saldo", "no": "Saldo",
        "pl": "Saldo", "pt": "Saldo", "ro": "Sold", "ru": "Баланс", "sv": "Saldo",
        "th": "ยอดคงเหลือ", "tr": "Bakiye", "uk": "Баланс", "ur": "بیلنس", "vi": "Số dư",
        "zh": "余额",
    },
    "dashboard.settings.unknownDevice": {
        "en": "Unknown Device",
        "ar": "جهاز غير معروف", "bn": "অজানা ডিভাইস", "cs": "Neznámé zařízení", "da": "Ukendt enhed", "de": "Unbekanntes Gerät",
        "es": "Dispositivo desconocido", "fa": "دستگاه ناشناس", "fi": "Tuntematon laite", "fil": "Hindi kilalang device", "fr": "Appareil inconnu",
        "he": "מכשיר לא מזוהה", "hi": "अज्ञात डिवाइस", "hu": "Ismeretlen eszköz", "id": "Perangkat tidak dikenal", "it": "Dispositivo sconosciuto",
        "ja": "不明なデバイス", "ko": "알 수 없는 기기", "ms": "Peranti tidak diketahui", "nl": "Onbekend apparaat", "no": "Ukjent enhet",
        "pl": "Nieznane urządzenie", "pt": "Dispositivo desconhecido", "ro": "Dispozitiv necunoscut", "ru": "Неизвестное устройство", "sv": "Okänd enhet",
        "th": "อุปกรณ์ที่ไม่รู้จัก", "tr": "Bilinmeyen cihaz", "uk": "Невідомий пристрій", "ur": "نامعلوم ڈیوائس", "vi": "Thiết bị không xác định",
        "zh": "未知设备",
    },
    "portfolio.freeMargin": {
        "en": "Free Margin",
        "ar": "الهامش المتاح", "bn": "মুক্ত মার্জিন", "cs": "Volná marže", "da": "Ledig margin", "de": "Verfügbare Margin",
        "es": "Margen libre", "fa": "حاشیه آزاد", "fi": "Vapaa marginaali", "fil": "Free Margin", "fr": "Marge disponible",
        "he": "מרג'ין פנוי", "hi": "मुक्त मार्जिन", "hu": "Szabad margó", "id": "Margin bebas", "it": "Margine libero",
        "ja": "有効証拠金", "ko": "사용 가능 마진", "ms": "Margin bebas", "nl": "Beschikbare marge", "no": "Ledig margin",
        "pl": "Wolny margines", "pt": "Margem livre", "ro": "Marjă disponibilă", "ru": "Свободная маржа", "sv": "Fri marginal",
        "th": "มาร์จิ้นว่าง", "tr": "Kullanılabilir teminat", "uk": "Вільна маржа", "ur": "مفت مارجن", "vi": "Ký quỹ khả dụng",
        "zh": "可用保证金",
    },
    "dashboard.settings.noActiveSessions": {
        "en": "No active sessions",
        "ar": "لا توجد جلسات نشطة", "bn": "কোনো সক্রিয় সেশন নেই", "cs": "Žádné aktivní relace", "da": "Ingen aktive sessioner", "de": "Keine aktiven Sitzungen",
        "es": "Sin sesiones activas", "fa": "بدون نشست فعال", "fi": "Ei aktiivisia istuntoja", "fil": "Walang aktibong sesyon", "fr": "Aucune session active",
        "he": "אין התחברויות פעילות", "hi": "कोई सक्रिय सत्र नहीं", "hu": "Nincs aktív munkamenet", "id": "Tidak ada sesi aktif", "it": "Nessuna sessione attiva",
        "ja": "アクティブなセッションなし", "ko": "활성 세션 없음", "ms": "Tiada sesi aktif", "nl": "Geen actieve sessies", "no": "Ingen aktive økter",
        "pl": "Brak aktywnych sesji", "pt": "Sem sessões ativas", "ro": "Nicio sesiune activă", "ru": "Нет активных сессий", "sv": "Inga aktiva sessioner",
        "th": "ไม่มีเซสชันที่ใช้งานอยู่", "tr": "Aktif oturum yok", "uk": "Немає активних сесій", "ur": "کوئی فعال سیشن نہیں", "vi": "Không có phiên hoạt động",
        "zh": "无活动会话",
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


def main():
    print("🔧 Final Translation Fixer - Critical Keys")
    print("=" * 60)

    total_fixed = 0

    for lang_file in sorted(os.listdir(MESSAGES_DIR)):
        if not lang_file.endswith('.json') or lang_file == 'en.json':
            continue

        lang_code = lang_file.replace('.json', '')
        lang_path = os.path.join(MESSAGES_DIR, lang_file)

        with open(lang_path, 'r', encoding='utf-8') as f:
            lang_data = json.load(f)

        fixed = 0
        for key, translations in MISSING_KEY_TRANSLATIONS.items():
            if lang_code in translations:
                current = get_all_keys(lang_data).get(key)
                en_val = translations['en']
                # Only fix if current value is still English
                if current is not None and str(current) == str(en_val):
                    set_nested(lang_data, key, translations[lang_code])
                    fixed += 1
                elif current is None:
                    # Key is missing entirely
                    set_nested(lang_data, key, translations[lang_code])
                    fixed += 1

        if fixed > 0:
            with open(lang_path, 'w', encoding='utf-8') as f:
                json.dump(lang_data, f, ensure_ascii=False, indent=2)
                f.write('\n')
            total_fixed += fixed
            print(f"  {lang_code}: Fixed {fixed} critical keys")

    print(f"\n✅ Total critical keys fixed: {total_fixed}")


if __name__ == '__main__':
    main()
