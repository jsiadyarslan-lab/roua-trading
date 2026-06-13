const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
  PageBreak,
  ShadingType,
  HeightRule,
  VerticalAlign,
  Footer,
  Header,
  PageNumber,
  NumberFormat,
  TabStopPosition,
  TabStopType,
  convertInchesToTwip,
  LevelFormat,
} = require("docx");
const fs = require("fs");
const path = require("path");

// ─── Palette GO-1 (Graphite Orange) ───
const P = {
  bg: "1A2330",
  primary: "FFFFFF",
  accent: "D4875A",
  cover: {
    titleColor: "FFFFFF",
    subtitleColor: "B0B8C0",
    metaColor: "90989F",
    footerColor: "687078",
  },
  table: {
    headerBg: "D4875A",
    headerText: "FFFFFF",
    accentLine: "D4875A",
    innerLine: "DDD0C8",
    surface: "F8F0EB",
  },
};

// ─── Font shortcuts ───
const headingFont = { ascii: "Calibri", eastAsia: "SimHei" };
const bodyFont = { ascii: "Calibri", eastAsia: "Microsoft YaHei" };

// ─── Helpers ───
const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const allNoBorders = {
  top: noBorder,
  bottom: noBorder,
  left: noBorder,
  right: noBorder,
};

function horizontalBorders(topColor, bottomColor) {
  return {
    top: { style: BorderStyle.SINGLE, size: 1, color: topColor || P.table.innerLine },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: bottomColor || P.table.innerLine },
    left: noBorder,
    right: noBorder,
  };
}

const accentBorderBottom = {
  top: noBorder,
  bottom: { style: BorderStyle.SINGLE, size: 6, color: P.table.accentLine },
  left: noBorder,
  right: noBorder,
};

function heading1(text) {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { before: 360, after: 200, line: 312 },
    heading: HeadingLevel.HEADING_1,
    bidirectional: true,
    children: [
      new TextRun({
        text,
        font: headingFont,
        size: 32,
        bold: true,
        color: P.bg,
      }),
    ],
  });
}

function heading2(text) {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { before: 280, after: 160, line: 312 },
    heading: HeadingLevel.HEADING_2,
    bidirectional: true,
    children: [
      new TextRun({
        text,
        font: headingFont,
        size: 26,
        bold: true,
        color: P.accent,
      }),
    ],
  });
}

function heading3(text) {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { before: 200, after: 120, line: 312 },
    heading: HeadingLevel.HEADING_3,
    bidirectional: true,
    children: [
      new TextRun({
        text,
        font: headingFont,
        size: 22,
        bold: true,
        color: P.bg,
      }),
    ],
  });
}

function bodyPara(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { after: 120, line: 312 },
    bidirectional: true,
    indent: opts.indent !== false ? { right: 420 } : undefined,
    children: [
      new TextRun({
        text,
        font: bodyFont,
        size: 21,
        color: opts.color || "333333",
        bold: opts.bold || false,
      }),
    ],
  });
}

function bulletItem(text, level = 0) {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { after: 80, line: 312 },
    bidirectional: true,
    indent: { right: 420 + level * 300 },
    bullet: { level },
    children: [
      new TextRun({
        text,
        font: bodyFont,
        size: 21,
        color: "333333",
      }),
    ],
  });
}

function taskItem(label, text, status) {
  const children = [
    new TextRun({
      text: label + " ",
      font: bodyFont,
      size: 21,
      bold: true,
      color: P.bg,
    }),
    new TextRun({
      text: text,
      font: bodyFont,
      size: 21,
      color: "333333",
    }),
  ];
  if (status) {
    children.push(
      new TextRun({
        text: "  [" + status + "]",
        font: bodyFont,
        size: 21,
        bold: true,
        color: status === "مكتمل" ? "2E7D32" : P.accent,
      })
    );
  }
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { after: 100, line: 312 },
    bidirectional: true,
    indent: { right: 720 },
    children,
  });
}

function accentLine() {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 3, color: P.table.accentLine, space: 1 },
    },
    children: [],
  });
}

// ─── Table builder ───
function makeHeaderCell(text, width) {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    shading: { fill: P.table.headerBg, type: ShadingType.CLEAR },
    borders: horizontalBorders(P.table.headerBg, P.table.headerBg),
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 60, after: 60 },
        bidirectional: true,
        children: [
          new TextRun({
            text,
            font: headingFont,
            size: 20,
            bold: true,
            color: P.table.headerText,
          }),
        ],
      }),
    ],
  });
}

function makeCell(text, width, opts = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    shading: opts.shading
      ? { fill: opts.shading, type: ShadingType.CLEAR }
      : undefined,
    borders: horizontalBorders(P.table.innerLine, P.table.innerLine),
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: opts.align || AlignmentType.CENTER,
        spacing: { before: 50, after: 50 },
        bidirectional: true,
        children: [
          new TextRun({
            text,
            font: bodyFont,
            size: 19,
            color: opts.color || "333333",
            bold: opts.bold || false,
          }),
        ],
      }),
    ],
  });
}

// ─── Cover Page (Recipe R4 — Top Color Block) ───
function buildCoverPage() {
  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          height: { value: 16838, rule: HeightRule.EXACT },
          children: [
            new TableCell({
              width: { size: 100, type: WidthType.PERCENTAGE },
              shading: { fill: P.bg, type: ShadingType.CLEAR },
              borders: allNoBorders,
              verticalAlign: VerticalAlign.CENTER,
              children: [
                new Paragraph({ spacing: { before: 1200 }, children: [] }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 200 },
                  bidirectional: true,
                  children: [
                    new TextRun({
                      text: "خطة التنفيذية لإصلاح نظام التداول الآلي",
                      font: headingFont,
                      size: 48,
                      bold: true,
                      color: P.cover.titleColor,
                    }),
                  ],
                }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 300 },
                  bidirectional: true,
                  children: [
                    new TextRun({
                      text: "رؤى — من التقييم 7.2 إلى 9.0",
                      font: headingFont,
                      size: 28,
                      color: P.cover.subtitleColor,
                    }),
                  ],
                }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 80 },
                  bidirectional: true,
                  children: [
                    new TextRun({
                      text: "تاريخ: 12 يونيو 2026",
                      font: bodyFont,
                      size: 20,
                      color: P.cover.metaColor,
                    }),
                  ],
                }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 80 },
                  bidirectional: true,
                  children: [
                    new TextRun({
                      text: "الإصدار: V217",
                      font: bodyFont,
                      size: 20,
                      color: P.cover.metaColor,
                    }),
                  ],
                }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 200 },
                  bidirectional: true,
                  children: [
                    new TextRun({
                      text: "الحالة: مقترح للتنفيذ",
                      font: bodyFont,
                      size: 20,
                      color: P.cover.metaColor,
                    }),
                  ],
                }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 600 },
                  bidirectional: true,
                  children: [
                    new TextRun({
                      text: "Roua Trading — Executive Action Plan",
                      font: bodyFont,
                      size: 18,
                      color: P.cover.footerColor,
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
    new Paragraph({
      children: [new PageBreak()],
    }),
  ];
}

// ─── TOC ───
function buildTOC() {
  return [
    heading1("جدول المحتويات"),
    accentLine(),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 200, after: 120, line: 312 },
      bidirectional: true,
      indent: { right: 200 },
      children: [
        new TextRun({ text: "1. الملخص التنفيذي", font: bodyFont, size: 22, color: P.bg, bold: true }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 100, line: 312 },
      bidirectional: true,
      indent: { right: 500 },
      children: [
        new TextRun({ text: "", font: bodyFont, size: 20, color: "555555" }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 100, after: 120, line: 312 },
      bidirectional: true,
      indent: { right: 200 },
      children: [
        new TextRun({ text: "2. الوضع الحالي وتحليل المشاكل", font: bodyFont, size: 22, color: P.bg, bold: true }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 80, line: 312 },
      bidirectional: true,
      indent: { right: 500 },
      children: [
        new TextRun({ text: "2.1 المشاكل الحرجة (تم إصلاحها جزئياً)", font: bodyFont, size: 20, color: "555555" }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 80, line: 312 },
      bidirectional: true,
      indent: { right: 500 },
      children: [
        new TextRun({ text: "2.2 المشاكل عالية الأولوية (لم تُصلح بعد)", font: bodyFont, size: 20, color: "555555" }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 80, line: 312 },
      bidirectional: true,
      indent: { right: 500 },
      children: [
        new TextRun({ text: "2.3 المشاكل متوسطة الأولوية", font: bodyFont, size: 20, color: "555555" }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 80, line: 312 },
      bidirectional: true,
      indent: { right: 500 },
      children: [
        new TextRun({ text: "2.4 مشاكل البنية التحتية", font: bodyFont, size: 20, color: "555555" }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 100, after: 120, line: 312 },
      bidirectional: true,
      indent: { right: 200 },
      children: [
        new TextRun({ text: "3. الأهداف والنتائج المتوقعة", font: bodyFont, size: 22, color: P.bg, bold: true }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 80, line: 312 },
      bidirectional: true,
      indent: { right: 500 },
      children: [
        new TextRun({ text: "3.1 أهداف كمية", font: bodyFont, size: 20, color: "555555" }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 80, line: 312 },
      bidirectional: true,
      indent: { right: 500 },
      children: [
        new TextRun({ text: "3.2 أهداف نوعية", font: bodyFont, size: 20, color: "555555" }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 100, after: 120, line: 312 },
      bidirectional: true,
      indent: { right: 200 },
      children: [
        new TextRun({ text: "4. تصميم الحلول", font: bodyFont, size: 22, color: P.bg, bold: true }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 80, line: 312 },
      bidirectional: true,
      indent: { right: 500 },
      children: [
        new TextRun({ text: "Phase 1 — الأسبوع 1: إصلاحات حرجة", font: bodyFont, size: 20, color: "555555" }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 80, line: 312 },
      bidirectional: true,
      indent: { right: 500 },
      children: [
        new TextRun({ text: "Phase 2 — الأسبوع 2: إدارة المخاطر", font: bodyFont, size: 20, color: "555555" }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 80, line: 312 },
      bidirectional: true,
      indent: { right: 500 },
      children: [
        new TextRun({ text: "Phase 3 — الأسبوع 3: متانة التنفيذ", font: bodyFont, size: 20, color: "555555" }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 80, line: 312 },
      bidirectional: true,
      indent: { right: 500 },
      children: [
        new TextRun({ text: "Phase 4 — الأسبوع 4: المراقبة والتحقق", font: bodyFont, size: 20, color: "555555" }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 100, after: 120, line: 312 },
      bidirectional: true,
      indent: { right: 200 },
      children: [
        new TextRun({ text: "5. خارطة الطريق والمعالم", font: bodyFont, size: 22, color: P.bg, bold: true }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 100, after: 120, line: 312 },
      bidirectional: true,
      indent: { right: 200 },
      children: [
        new TextRun({ text: "6. المتطلبات والموارد", font: bodyFont, size: 22, color: P.bg, bold: true }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 100, after: 120, line: 312 },
      bidirectional: true,
      indent: { right: 200 },
      children: [
        new TextRun({ text: "7. تحليل المخاطر وتخفيفها", font: bodyFont, size: 22, color: P.bg, bold: true }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 100, after: 120, line: 312 },
      bidirectional: true,
      indent: { right: 200 },
      children: [
        new TextRun({ text: "8. الفوائد المتوقعة والتقييم", font: bodyFont, size: 22, color: P.bg, bold: true }),
      ],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

// ─── Section 1 ───
function buildSection1() {
  return [
    heading1("1. الملخص التنفيذي"),
    accentLine(),
    bodyPara("يقدم هذا المستند خطة تنفيذية شاملة لإصلاح جميع المشاكل المكتشفة في نظام التداول الآلي Roua Trading. يبلغ التقييم الحالي للنظام 7.2 من 10، والهدف هو الوصول إلى تقييم 9.0 من 10 خلال 4 أسابيع."),
    bodyPara("تحتوي هذه الخطة على 5 مراحل مع 18 مهمة محددة. المرحلة الأولى (المشاكل الحرجة) مكتملة بنسبة 40% مع نشر الإصدار V216 على بيئة الإنتاج."),
    bodyPara("تتضمن المشاكل المكتشفة: مشكلتين حرجتين تم إصلاحهما جزئياً، مشكلتين عالي الأولوية لم تُصلح بعد، مشكلتين متوسطتي الأولوية، وثلاث مشاكل في البنية التحتية. كل مشكلة لها حل مفصل مع مهام واضحة قابلة للتنفيذ."),
  ];
}

// ─── Section 2 ───
function buildSection2() {
  return [
    heading1("2. الوضع الحالي وتحليل المشاكل"),
    accentLine(),

    heading2("2.1 المشاكل الحرجة (تم إصلاحها جزئياً)"),
    taskItem("Bug #1:", "إغلاق صفقات Agent عند 4 ساعات بدلاً من 48 — الحالة: مُصلح في V216 ومنشور على Railway — 5 طبقات حماية (V184, V213, V214, V215, V216)"),
    taskItem("Bug #2:", "ExchangeSync لا يرسل closeReason — الحالة: مُصلح في V215 (closeReason: 'EXCHANGE_SYNC:${reason}')"),

    heading2("2.2 المشاكل عالية الأولوية (لم تُصلح بعد)"),
    taskItem("Bug #3:", "عدم تطابق حساب قيمة المحفظة بين RiskCalculatorService و RiskManagerService. RiskCalculator يحسب بناءً على أسعار حية، RiskManager يستخدم paperBalance التي قد تكون 0 أو قديمة. هذا يسبب قرارات خاطئة في إدارة المخاطر مثل السماح بفتح صفقات كبيرة جداً أو رفض صفقات صغيرة."),
    taskItem("Bug #4:", "paperBalance = 0 في RiskManager. عندما لا يكون هناك رصيد حقيقي من البورصة (paper trading أو فشل API)، يستخدم RiskManager القيمة 0 كرصيد. هذا يعني جميع حسابات نسبة المخاطر تصبح نسبة مئوية من صفر، مما يسبب أخطاء فادحة في قرارات فتح وإغلاق الصفقات. الحل يجب أن يستخدم قيمة المحفظة من RiskCalculator كبديل."),

    heading2("2.3 المشاكل متوسطة الأولوية"),
    taskItem("Bug #5:", "عدم معالجة Partial Fill. عندما يتم تنفيذ أمر جزئياً على البورصة (مثلاً طلب 1 LOT ونفذ 0.7 LOT)، النظام لا يتعامل مع هذا السيناريو. يفترض دائماً تنفيذ كامل أو فشل كامل. هذا يسبب عدم تطابق بين الكمية الفعلية في البورصة والكمية المسجلة في قاعدة البيانات."),
    taskItem("Bug #6:", "عدم وجود آلية Circuit Breaker على مستوى النظام. كل خدمة تحمي نفسها بشكل مستقل (RiskGatekeeper، RiskManager) لكن لا يوجد مفتاح إيقاف شامل يعطل التداول بالكامل عند تجاوز خسارة يومية محددة. الـ Sanctuary الموجود يحظر المجلس فقط، لا يوقف التداول."),

    heading2("2.4 مشاكل البنية التحتية"),
    taskItem("Issue #7:", "Optimistic Locking يسبب فشل متكرر في closePosition. عندما تحاول خدمتان إغلاق نفس الصفقة (مثلاً PositionMonitor و Agent في نفس الوقت)، الأولى تنجح والثانية تحصل على OPTIMISTIC_LOCK_FAILURE. حالياً يعاد المحاولة 3 مرات فقط مع تأخير 100ms، وهذا غير كافٍ في أوقات الضغط العالي."),
    taskItem("Issue #8:", "Redis كمصدر وحيد للإعدادات. إذا أعيد تشغيل Redis أو انتهت صلاحية المفاتيح، يفقد النظام إعدادات مثل timeframe للصفقات. تم إصلاح هذا جزئياً في V204 بإضافة عمود timeframe في Position، لكن لا يزال هناك اعتماد كبير على Redis."),
    taskItem("Issue #9:", "عدم وجود آلية retry للاتصال بالبورصة. فشل طلب API واحد للبورصة يسبب فشل كامل للعملية بدون إعادة محاولة. هذا مهم خاصة مع Binance وغيرها من البورصات التي تحدد معدل الطلبات."),
  ];
}

// ─── Section 3 ───
function buildSection3() {
  return [
    heading1("3. الأهداف والنتائج المتوقعة"),
    accentLine(),

    heading2("3.1 أهداف كمية"),
    bulletItem("رفع التقييم من 7.2 إلى 9.0"),
    bulletItem("تقليل أخطاء إغلاق الصفقات من ~15% إلى أقل من 1%"),
    bulletItem("تقليل فشل closePosition بسبب Optimistic Lock من ~5% إلى أقل من 0.5%"),
    bulletItem("زيادة دقة حساب المخاطر من ~70% إلى 95%+"),
    bulletItem("إضافة معالجة Partial Fill لتغطية 100% من السيناريوهات"),

    heading2("3.2 أهداف نوعية"),
    bulletItem("بناء ثقة المستخدم في النظام (بعد أزمة الثقة من الإصلاحات المتكررة الفاشلة)"),
    bulletItem("ضمان شفافية كاملة في عمليات الإغلاق عبر forensic logging"),
    bulletItem("إنشاء بنية قابلة للمراقبة والتحقق (health endpoints، version tracking)"),
  ];
}

// ─── Section 4 ───
function buildSection4() {
  return [
    heading1("4. تصميم الحلول"),
    accentLine(),

    heading2("Phase 1 — الأسبوع 1: إصلاحات حرجة — الحالة: 40% مكتمل"),
    taskItem("Task 1.1:", "V216 حماية ExchangeSync fallback", "مكتمل"),
    taskItem("Task 1.2:", "V216 health endpoint مع version info", "مكتمل"),
    taskItem("Task 1.3:", "إضافة Circuit Breaker شامل — ملف جديد system-circuit-breaker.service.ts يراقب الخسارة اليومية الإجمالية ويوقف كل التداول عند تجاوز الحد"),
    taskItem("Task 1.4:", "تحسين retry لـ closePosition — زيادة المحاولات من 3 إلى 5 مع exponential backoff حقيقي (100ms, 500ms, 1s, 2s, 4s)"),

    heading2("Phase 2 — الأسبوع 2: إدارة المخاطر"),
    taskItem("Task 2.1:", "توحيد حساب قيمة المحفظة — إنشاء PortfolioValuationService موحد يستخدمه كل من RiskCalculator و RiskManager. المصدر الوحيد للحقيقة هو هذا الخدمة."),
    taskItem("Task 2.2:", "إصلاح paperBalance = 0 — RiskManager يستخدم PortfolioValuationService كبديل عند عدم توفر رصيد حقيقي. إذا كان paper trading، يحسب القيمة من إجمالي unrealizedPnl + initialBalance."),
    taskItem("Task 2.3:", "إضافة RiskEvent audit trail — كل قرار مخاطر (قبول/رفض/تحذير) يُسجل في جدول RiskEvent جديد مع السبب والبيانات والطابع الزمني."),

    heading2("Phase 3 — الأسبوع 3: متانة التنفيذ"),
    taskItem("Task 3.1:", "معالجة Partial Fill — تحديث closePosition و openPosition لمعالجة الكمية الجزئية. إضافة حقل filledQty في Position. عند Partial Fill، يتم تحديث الكمية بالفعل المنفذ وإعادة جدولة الباقي."),
    taskItem("Task 3.2:", "تحسين Optimistic Locking — بدلاً من فشل التحديث، استخدم SELECT FOR UPDATE في PostgreSQL للتأكد من عدم تعارض. أو استخدم FIFO queue لعمليات الإغلاق."),
    taskItem("Task 3.3:", "إضافة retry للاتصال بالبورصة — wrapper حول ccxt calls مع retry ذكي (3 محاولات، exponential backoff، fallback بين بورصات مختلفة إن أمكن)."),

    heading2("Phase 4 — الأسبوع 4: المراقبة والتحقق"),
    taskItem("Task 4.1:", "إضافة metrics endpoint — /api/metrics يعرض إحصائيات التداول (عدد الصفقات المفتوحة/المغلقة، معدل الفشل، زمن الاستجابة، عدد V214 BLOCKED)"),
    taskItem("Task 4.2:", "إضافة integration test suite — اختبارات تلقائية تتحقق من: إغلاق Agent قبل 48h يُحظر، partial fill يُعالج بشكل صحيح، paperBalance = 0 لا يسبب قرارات خاطئة"),
    taskItem("Task 4.3:", "إضافة deployment verification — بعد كل نشر، اختبار تلقائي يتحقق من health endpoint ويتأكد أن version.code هو الأحدث"),
  ];
}

// ─── Section 5 — Roadmap Table ───
function buildSection5() {
  const roadmapData = [
    ["Phase 1", "أسبوع 1", "4", "حرجة", "7.8"],
    ["Phase 2", "أسبوع 2", "3", "عالية", "8.4"],
    ["Phase 3", "أسبوع 3", "3", "متوسطة", "8.8"],
    ["Phase 4", "أسبوع 4", "3", "تحسينية", "9.0"],
  ];

  const roadmapHeaders = ["المرحلة", "المدة", "عدد المهام", "الأولوية", "التقييم المتوقع بعد الإنجاز"];
  const colWidths = [20, 15, 15, 20, 30];

  const headerRow = new TableRow({
    tableHeader: true,
    children: roadmapHeaders.map((h, i) => makeHeaderCell(h, colWidths[i])),
  });

  const dataRows = roadmapData.map((row, ri) =>
    new TableRow({
      children: row.map((cell, ci) =>
        makeCell(cell, colWidths[ci], {
          shading: ri % 2 === 0 ? P.table.surface : undefined,
          bold: ci === 0,
          align: AlignmentType.CENTER,
        })
      ),
    })
  );

  return [
    heading1("5. خارطة الطريق والمعالم"),
    accentLine(),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...dataRows],
    }),
  ];
}

// ─── Section 6 ───
function buildSection6() {
  return [
    heading1("6. المتطلبات والموارد"),
    accentLine(),
    bulletItem("مطور واحد (العمل على الكود مباشرة)"),
    bulletItem("بيئة اختبار (paper trading) للتحقق"),
    bulletItem("Railway للنشر مع إعداد health check"),
    bulletItem("قاعدة بيانات PostgreSQL للتخزين"),
    bulletItem("Redis للتخزين المؤقت"),
  ];
}

// ─── Section 7 — Risk Table ───
function buildSection7() {
  const riskData = [
    ["إصلاح يسبب خطأ جديد", "متوسط", "عالي", "اختبار على paper trading قبل النشر، health check بعد النشر"],
    ["فشل النشر على Railway", "منخفض", "حرج", "Clear build cache، التحقق من health endpoint بعد كل نشر"],
    ["تعارض مع إعدادات المستخدم", "منخفض", "متوسط", "حفظ نسخة احتياطية من الإعدادات قبل أي تغيير"],
  ];

  const riskHeaders = ["الخطر", "الاحتمال", "التأثير", "استراتيجية التخفيف"];
  const colWidths = [25, 15, 15, 45];

  const headerRow = new TableRow({
    tableHeader: true,
    children: riskHeaders.map((h, i) => makeHeaderCell(h, colWidths[i])),
  });

  const dataRows = riskData.map((row, ri) =>
    new TableRow({
      children: row.map((cell, ci) =>
        makeCell(cell, colWidths[ci], {
          shading: ri % 2 === 0 ? P.table.surface : undefined,
          align: ci === 3 ? AlignmentType.RIGHT : AlignmentType.CENTER,
        })
      ),
    })
  );

  return [
    heading1("7. تحليل المخاطر وتخفيفها"),
    accentLine(),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...dataRows],
    }),
  ];
}

// ─── Section 8 ───
function buildSection8() {
  return [
    heading1("8. الفوائد المتوقعة والتقييم"),
    accentLine(),
    bulletItem("ثقة المستخدم تتعافى بعد رؤية إصلاحات حقيقية ومنشورة"),
    bulletItem("النظام يصبح أكثر موثوقية مع 5 طبقات حماية + circuit breaker"),
    bulletItem("إدارة المخاطر تصبح دقيقة بنسبة 95%+ بدلاً من 70%"),
    bodyPara("التقييم النهائي المتوقع: 9.0/10", { bold: true }),
  ];
}

// ─── Build the Document ───
async function main() {
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: bodyFont,
            size: 21,
          },
          paragraph: {
            spacing: { line: 312 },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(0.8),
              bottom: convertInchesToTwip(0.8),
              left: convertInchesToTwip(1.0),
              right: convertInchesToTwip(1.0),
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                bidirectional: true,
                border: {
                  bottom: { style: BorderStyle.SINGLE, size: 2, color: P.table.accentLine, space: 4 },
                },
                children: [
                  new TextRun({
                    text: "خطة التنفيذية لإصلاح نظام التداول الآلي — V217",
                    font: bodyFont,
                    size: 16,
                    color: P.cover.footerColor,
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                border: {
                  top: { style: BorderStyle.SINGLE, size: 1, color: P.table.innerLine, space: 4 },
                },
                children: [
                  new TextRun({
                    text: "Roua Trading — صفحة ",
                    font: bodyFont,
                    size: 16,
                    color: P.cover.footerColor,
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: bodyFont,
                    size: 16,
                    color: P.cover.footerColor,
                  }),
                ],
              }),
            ],
          }),
        },
        children: [
          ...buildCoverPage(),
          ...buildTOC(),
          ...buildSection1(),
          new Paragraph({ children: [new PageBreak()] }),
          ...buildSection2(),
          new Paragraph({ children: [new PageBreak()] }),
          ...buildSection3(),
          new Paragraph({ children: [new PageBreak()] }),
          ...buildSection4(),
          new Paragraph({ children: [new PageBreak()] }),
          ...buildSection5(),
          ...buildSection6(),
          new Paragraph({ children: [new PageBreak()] }),
          ...buildSection7(),
          ...buildSection8(),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const outPath = path.join("/home/z/my-project/download", "action-plan-v217.docx");
  fs.writeFileSync(outPath, buffer);
  console.log("Document generated successfully:", outPath);
  const stats = fs.statSync(outPath);
  console.log("File size:", (stats.size / 1024).toFixed(1), "KB");
}

main().catch((err) => {
  console.error("Error generating document:", err);
  process.exit(1);
});
