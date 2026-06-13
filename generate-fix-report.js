const docx = require('docx');
const fs = require('fs');

const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  ShadingType, AlignmentType, PageBreak, TabStopType,
  Header, Footer, PageNumber, NumberFormat, HeightRule
} = docx;

// Color tokens - Tech theme (Cool + Light + Active)
const colors = {
  primary: "#0A1628",
  body: "#1A2B40",
  secondary: "#6878A0",
  accent: "#5B8DB8",
  surface: "#F4F8FC",
  danger: "#C0392B",
  success: "#27AE60",
  warning: "#D4A030",
};

function createHeading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    heading: level,
    spacing: { before: 300, after: 150 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: level === HeadingLevel.HEADING_1 ? 32 : level === HeadingLevel.HEADING_2 ? 26 : 22,
        color: colors.primary,
        font: "Noto Sans SC",
      }),
    ],
  });
}

function createPara(text, opts = {}) {
  const runs = [];
  if (typeof text === 'string') {
    runs.push(new TextRun({
      text,
      size: 22,
      color: opts.color || colors.body,
      font: "Noto Sans SC",
      bold: opts.bold || false,
      italics: opts.italic || false,
    }));
  } else {
    // Array of text runs
    text.forEach(t => runs.push(t));
  }
  return new Paragraph({
    spacing: { before: opts.spaceBefore || 100, after: opts.spaceAfter || 100, line: 312 },
    alignment: opts.align || AlignmentType.RIGHT,
    indent: opts.indent ? { firstLine: 420 } : undefined,
    children: runs,
  });
}

function createBullet(text, level = 0) {
  return new Paragraph({
    spacing: { before: 60, after: 60, line: 312 },
    alignment: AlignmentType.RIGHT,
    indent: { left: 400 + (level * 400), hanging: 300 },
    children: [
      new TextRun({ text: `${level === 0 ? "\u25CF" : "\u25CB"} `, size: 18, color: colors.accent }),
      new TextRun({ text, size: 22, color: colors.body, font: "Noto Sans SC" }),
    ],
  });
}

function createVersionRow(version, desc, status, statusColor) {
  // Compute a light version of statusColor for background (just use surface color)
  const bgColor = colors.surface;
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 15, type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.CLEAR, fill: bgColor },
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: version, bold: true, size: 22, color: colors.primary, font: "Noto Sans SC" })]
        })],
      }),
      new TableCell({
        width: { size: 60, type: WidthType.PERCENTAGE },
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: desc, size: 21, color: colors.body, font: "Noto Sans SC" })]
        })],
      }),
      new TableCell({
        width: { size: 25, type: WidthType.PERCENTAGE },
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: status, bold: true, size: 22, color: statusColor, font: "Noto Sans SC" })]
        })],
      }),
    ],
  });
}

function createTableHeader(headers) {
  return new TableRow({
    tableHeader: true,
    children: headers.map(h => new TableCell({
      shading: { type: ShadingType.CLEAR, fill: colors.primary },
      margins: { top: 80, bottom: 80, left: 100, right: 100 },
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: h, bold: true, size: 22, color: "FFFFFF", font: "Noto Sans SC" })]
      })],
    })),
  });
}

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: "Noto Sans SC", size: 22, color: colors.body },
      },
    },
  },
  sections: [
    // Cover Section
    {
      properties: {
        page: {
          margin: { top: 0, bottom: 0, left: 0, right: 0 },
        },
      },
      children: [
        // Full-page table for cover
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [new TableRow({
            height: { value: 16838, rule: HeightRule.EXACT },
            children: [new TableCell({
              width: { size: 100, type: WidthType.PERCENTAGE },
              verticalAlign: "center",
              shading: { type: ShadingType.CLEAR, fill: colors.primary },
              borders: {
                top: { style: BorderStyle.NONE },
                bottom: { style: BorderStyle.NONE },
                left: { style: BorderStyle.NONE },
                right: { style: BorderStyle.NONE },
              },
              children: [
                new Paragraph({ spacing: { before: 3000 } }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 200 },
                  children: [new TextRun({
                    text: "\u062A\u0642\u0631\u064A\u0631 \u0625\u0635\u0644\u0627\u062D \u0627\u0644\u062D\u0631\u0627\u0633\u064A",
                    size: 56, bold: true, color: "FFFFFF", font: "Noto Sans SC",
                  })],
                }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 100 },
                  children: [new TextRun({
                    text: "V216 \u2014 \u062D\u0645\u0627\u064A\u0629 \u0635\u0641\u0642\u0627\u062A Agent \u0645\u0646 \u0627\u0644\u0625\u063A\u0644\u0627\u0642 \u0627\u0644\u0645\u0628\u0643\u0631",
                    size: 30, color: colors.accent, font: "Noto Sans SC",
                  })],
                }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 600 },
                  children: [new TextRun({
                    text: "\u0646\u0638\u0627\u0645 \u0631\u0624\u0649 \u0644\u0644\u062A\u062F\u0627\u0648\u0644 \u0627\u0644\u0622\u0644\u064A",
                    size: 26, color: "8899AA", font: "Noto Sans SC",
                  })],
                }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 2000 },
                  children: [new TextRun({
                    text: "12 \u064A\u0648\u0646\u064A\u0648 2026",
                    size: 24, color: "8899AA", font: "Noto Sans SC",
                  })],
                }),
              ],
            })],
          })],
        }),
      ],
    },
    // Main Content
    {
      properties: {
        page: {
          margin: { top: 1200, bottom: 1200, left: 1200, right: 1200 },
          pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({
              text: "Roua Trading \u2014 V216 Security Fix Report",
              size: 18, color: colors.secondary, font: "Noto Sans SC", italics: true,
            })],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: "\u0635\u0641\u062D\u0629 ", size: 18, color: colors.secondary, font: "Noto Sans SC" }),
              new TextRun({ children: [PageNumber.CURRENT], size: 18, color: colors.secondary }),
              new TextRun({ text: " \u0645\u0646 ", size: 18, color: colors.secondary, font: "Noto Sans SC" }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: colors.secondary }),
            ],
          })],
        }),
      },
      children: [
        // 1. Honesty Section
        createHeading("\u0661. \u0627\u0644\u062D\u0642\u064A\u0642\u0629 \u0628\u0634\u0641\u0627\u0641\u064A\u0629", HeadingLevel.HEADING_1),

        createPara("\u0641\u064A \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0627\u062A \u0627\u0644\u0633\u0627\u0628\u0642\u0629\u060C \u0642\u0644\u062A \u0623\u0646 \u0645\u0634\u0643\u0644\u0629 \u0625\u063A\u0644\u0627\u0642 \u0635\u0641\u0642\u0627\u062A Agent \u0639\u0646\u062F 4 \u0633\u0627\u0639\u0627\u062A \u062A\u0645 \u0625\u0635\u0644\u0627\u062D\u0647\u0627 \u0639\u062F\u0629 \u0645\u0631\u0627\u062A. \u0647\u0630\u0627 \u0643\u0627\u0644\u0627\u0645 \u0643\u0627\u0646 \u062E\u0627\u0637\u0626\u0627\u064B. \u0627\u0644\u0625\u0635\u0644\u0627\u062D \u0643\u0627\u0646 \u0641\u064A \u0627\u0644\u0643\u0648\u062F \u0627\u0644\u0645\u062D\u0644\u064A \u0641\u0642\u0637\u060C \u0648\u0644\u0645 \u064A\u0643\u0646 \u0645\u0646\u0634\u0648\u0631\u0627\u064B \u0648\u0645\u062A\u0628\u0631\u0631\u0627\u064B \u0639\u0644\u0649 Railway. \u0627\u0644\u0641\u0631\u0642 \u0628\u064A\u0646 \u0625\u0635\u0644\u0627\u062D \u0627\u0644\u0643\u0648\u062F \u0648\u0625\u0635\u0644\u0627\u062D \u0627\u0644\u0645\u0646\u062A\u062C \u0647\u0648 \u0641\u0631\u0642 \u062C\u0648\u0647\u0631\u064A: \u0627\u0644\u0623\u0648\u0644 \u0644\u0627 \u0642\u064A\u0645\u0629 \u0644\u0647 \u062F\u0648\u0646 \u0627\u0644\u062B\u0627\u0646\u064A.", { indent: true }),

        createPara("\u0627\u0644\u062F\u0644\u064A\u0644 \u0627\u0644\u0642\u0627\u0637\u0639: \u0635\u0641\u0642\u0627\u062A Agent \u0639\u0644\u0649 Railway \u062A\u063A\u0644\u0642 \u0628\u0640 closeReason = \"Manual\"\u060C \u0648\u0647\u0630\u0627 \u064A\u0639\u0646\u064A \u0623\u0646 \u0627\u0644\u0643\u0648\u062F \u0627\u0644\u0642\u062F\u064A\u0645 (pre-V176) \u0644\u0627 \u064A\u0632\u0627\u0644 \u0639\u0645\u0644\u0627\u0646\u0627\u064B. \u0641\u064A V176 \u062A\u0645 \u062A\u063A\u064A\u064A\u0631 \u0627\u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A\u0629 \u0645\u0646 \"Manual\" \u0625\u0644\u0649 \"AUTO_CLOSE\"\u060C \u0644\u0630\u0627 \u0648\u062C\u0648\u062F \"Manual\" \u064A\u062B\u0628\u062A \u0623\u0646 \u0627\u0644\u0643\u0648\u062F \u0627\u0644\u0645\u0634\u063A\u0644 \u0642\u062F\u064A\u0645.", { indent: true }),

        createPara("\u0627\u0644\u062F\u0631\u0633 \u0627\u0644\u0645\u0633\u062A\u0641\u0627\u062F: \u0644\u0627 \u0623\u0642\u0648\u0644 \u0625\u0635\u0644\u0627\u062D\u0627\u064B \u062D\u062A\u0649 \u0623\u062A\u062D\u0642\u0642 \u0645\u0646 \u0639\u0645\u0644\u0647 \u0641\u064A \u0627\u0644\u0625\u0646\u062A\u0627\u062C. \u0648\u0644\u0647\u0630\u0627 \u0627\u0644\u0633\u0628\u0628 \u0623\u0636\u0641\u062A health endpoint \u064A\u0639\u0631\u0636 \u0625\u0635\u062F\u0627\u0631 \u0627\u0644\u0643\u0648\u062F \u0627\u0644\u0641\u0639\u0644\u064A \u0627\u0644\u0630\u064A \u064A\u0639\u0645\u0644 \u0639\u0644\u0649 Railway.", { indent: true, color: colors.accent }),

        // 2. Protection Layers
        createHeading("\u0662. \u0637\u0628\u0642\u0627\u062A \u0627\u0644\u062D\u0645\u0627\u064A\u0629 \u0627\u0644\u062D\u0627\u0644\u064A\u0629 (5 \u0637\u0628\u0642\u0627\u062A)", HeadingLevel.HEADING_1),

        createPara("\u0628\u0639\u062F \u0625\u0636\u0627\u0641\u0629 V216\u060C \u0623\u0635\u0628\u062D \u0644\u062F\u064A\u0646\u0627 5 \u0637\u0628\u0642\u0627\u062A \u062D\u0645\u0627\u064A\u0629 \u0645\u062A\u0633\u0644\u0633\u0644\u0629 \u0644\u0645\u0646\u0639 \u0625\u063A\u0644\u0627\u0642 \u0635\u0641\u0642\u0627\u062A Agent \u0642\u0628\u0644 48 \u0633\u0627\u0639\u0629. \u0643\u0644 \u0637\u0628\u0642\u0629 \u062A\u0639\u0645\u0644 \u0628\u0634\u0643\u0644 \u0645\u0633\u062A\u0642\u0644\u060C \u0648\u0625\u0630\u0627 \u0641\u0634\u0644\u062A \u0637\u0628\u0642\u0629 \u062A\u0646\u062A\u0642\u0644 \u0627\u0644\u062D\u0645\u0627\u064A\u0629 \u0625\u0644\u0649 \u0627\u0644\u062A\u0627\u0644\u064A\u0629. \u0647\u0630\u0627 \u062A\u0635\u0645\u064A\u0645 Defense-in-Depth \u064A\u0636\u0645\u0646 \u0623\u0646\u0647 \u062D\u062A\u0649 \u0644\u0648 \u0643\u0627\u0646 \u0643\u0648\u062F \u0642\u062F\u064A\u0645 \u064A\u0639\u0645\u0644 \u0639\u0644\u0649 Railway\u060C \u0641\u0625\u0646 \u0627\u0644\u0637\u0628\u0642\u0627\u062A \u0627\u0644\u0623\u062E\u0631\u0649 \u0633\u062A\u0645\u0646\u0639 \u0627\u0644\u0625\u063A\u0644\u0627\u0642 \u0627\u0644\u0645\u0628\u0643\u0631.", { indent: true }),

        // Protection Layers Table
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
            left: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
            right: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
            insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
          },
          rows: [
            createTableHeader(["\u0627\u0644\u0625\u0635\u062F\u0627\u0631", "\u0627\u0644\u0648\u0638\u064A\u0641\u0629", "\u0627\u0644\u0645\u0644\u0641"]),
            createVersionRow("V184", "\u062D\u0630\u0641 \u0625\u063A\u0644\u0627\u0642 4h breakeven \u0645\u0646 Agent._monitorOpenPositions \u2014 MAX_HOLDING \u0627\u0644\u0622\u0646 PositionMonitor \u0641\u0642\u0637", "\u0645\u0646\u0634\u0648\u0631", colors.success),
            createVersionRow("V213", "\u062D\u0638\u0631 \u0625\u063A\u0644\u0627\u0642 MAX_HOLDING_TIME \u0645\u0646 Agent \u2014 \u0625\u0630\u0627 \u062D\u062F\u062B \u064A\u0639\u0646\u064A \u0643\u0648\u062F \u0642\u062F\u064A\u0645 \u064A\u0639\u0645\u0644", "\u0645\u0646\u0634\u0648\u0631", colors.success),
            createVersionRow("V214", "\u062D\u0645\u0627\u064A\u0629 \u0645\u0632\u062F\u0648\u062C\u0629: 1) PositionMonitor \u064A\u062A\u062C\u0627\u0648\u0632 _getMaxHoldingMs \u0648\u064A\u0633\u062A\u062E\u062F\u0645 48h hardcoded 2) closePosition \u064A\u062D\u0638\u0631 \u0623\u064A \u0625\u063A\u0644\u0627\u0642 Agent \u0642\u0628\u0644 48h (\u063A\u064A\u0631 SL/TP) 3) forceClosePosition \u0646\u0641\u0633 \u0627\u0644\u062D\u0645\u0627\u064A\u0629", "\u0645\u0646\u0634\u0648\u0631", colors.success),
            createVersionRow("V215", "\u062A\u0633\u062C\u064A\u0644 \u062C\u0646\u0627\u0626\u064A (forensic logging) \u0641\u064A closePosition + ExchangeSync \u064A\u0631\u0633\u0644 closeReason \u0635\u062D\u064A\u062D", "\u0645\u0646\u0634\u0648\u0631", colors.success),
            createVersionRow("V216", "\u062D\u0645\u0627\u064A\u0629 ExchangeSync fallback: \u0645\u0646\u0639 \u0627\u0644\u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0645\u0628\u0627\u0634\u0631 \u0644\u0644\u0642\u0627\u0639\u062F\u0629 \u0644\u0635\u0641\u0642\u0627\u062A Agent \u0642\u0628\u0644 48h + health endpoint \u064A\u0639\u0631\u0636 \u0627\u0644\u0625\u0635\u062F\u0627\u0631", "\u062C\u062F\u064A\u062F", colors.warning),
          ],
        }),

        // 3. What exactly does V216 add?
        createHeading("\u0663. \u0645\u0627\u0630\u0627 \u064A\u0636\u064A\u0641 V216 \u0628\u0627\u0644\u062A\u062D\u062F\u064A\u062F\u061F", HeadingLevel.HEADING_1),

        createHeading("\u0623) \u062D\u0645\u0627\u064A\u0629 ExchangeSync Fallback", HeadingLevel.HEADING_2),
        createPara("\u0643\u0627\u0646 \u0647\u0646\u0627\u0643 \u062B\u063A\u0631\u0629 \u062E\u0637\u064A\u0631\u0629: \u0639\u0646\u062F\u0645\u0627 \u064A\u0641\u0634\u0644 TradingService.closePositionWithRetry()\u060C \u0643\u0627\u0646 ExchangeSync \u064A\u0644\u062C\u0623 \u0625\u0644\u0649 \u062A\u062D\u062F\u064A\u062B \u0645\u0628\u0627\u0634\u0631 \u0644\u0644\u0642\u0627\u0639\u062F\u0629 (prisma.position.update). \u0647\u0630\u0627 \u0627\u0644\u0645\u0633\u0627\u0631 \u0643\u0627\u0646 \u064A\u062A\u062C\u0627\u0648\u0632 \u062D\u0645\u0627\u064A\u0629 V214 \u0628\u0627\u0644\u0643\u0627\u0645\u0644\u060C \u0644\u0623\u0646 V214 \u0643\u0627\u0646 \u062F\u0627\u062E\u0644 closePosition \u0641\u0642\u0637. \u0627\u0644\u0622\u0646 V216 \u064A\u0636\u064A\u0641 \u0646\u0641\u0633 \u0627\u0644\u0641\u062D\u0635 \u0642\u0628\u0644 \u0627\u0644\u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0645\u0628\u0627\u0634\u0631: \u0625\u0630\u0627 \u0643\u0627\u0646\u062A \u0627\u0644\u0635\u0641\u0642\u0629 Agent \u0648\u0639\u0645\u0631\u0647\u0627 \u0623\u0642\u0644 \u0645\u0646 48 \u0633\u0627\u0639\u0629\u060C \u064A\u062A\u0645 \u062D\u0638\u0631 \u0627\u0644\u0625\u063A\u0644\u0627\u0642 \u0648\u062A\u0633\u062C\u064A\u0644 \u062A\u0646\u0628\u064A\u0647 \u062E\u0637\u064A\u0631.", { indent: true }),

        createHeading("\u0628) \u0646\u0642\u0637\u0629 \u0641\u062D\u0635 \u0627\u0644\u0625\u0635\u062F\u0627\u0631 (Health Endpoint)", HeadingLevel.HEADING_2),
        createPara("\u0623\u0636\u064A\u0641 \u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0627\u0644\u0625\u0635\u062F\u0627\u0631 \u0625\u0644\u0649 /api/health. \u0627\u0644\u0622\u0646 \u0639\u0646\u062F \u0637\u0644\u0628 GET /api/health \u0633\u062A\u0631\u0649 \u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0627\u0644\u0625\u0635\u062F\u0627\u0631 \u0641\u064A \u0627\u0644\u0631\u062F:", { indent: true }),

        new Paragraph({
          spacing: { before: 100, after: 100, line: 280 },
          indent: { left: 400 },
          children: [new TextRun({
            text: `"version": {
  "code": "V216",
  "agentProtection": "ENABLED",
  "commit": "<git-commit-sha>",
  "nodeEnv": "production"
}`,
            size: 20, color: colors.accent, font: "Sarasa Mono SC",
          })],
        }),

        createPara("\u0647\u0630\u0627 \u064A\u0633\u0645\u062D \u0644\u0643 \u0628\u0627\u0644\u062A\u062D\u0642\u0642 \u0641\u0648\u0631\u0627\u064B \u0645\u0646 \u0623\u064A \u0625\u0635\u062F\u0627\u0631 \u064A\u0639\u0645\u0644 \u0639\u0644\u0649 Railway \u0628\u062F\u0648\u0646 \u0627\u0644\u062D\u0627\u062C\u0629 \u0644\u0644\u062F\u062E\u0648\u0644 \u0625\u0644\u0649 \u0627\u0644\u0633\u064A\u0631\u0641\u0631. \u0625\u0630\u0627 \u0631\u0623\u064A\u062A code: \"V216\" \u0641\u0647\u0630\u0627 \u064A\u0639\u0646\u064A \u0623\u0646 \u0627\u0644\u0625\u0635\u0644\u0627\u062D \u0645\u0646\u0634\u0648\u0631. \u0625\u0630\u0627 \u0631\u0623\u064A\u062A \u0625\u0635\u062F\u0627\u0631 \u0623\u0642\u062F\u0645\u060C \u0641\u0627\u0644\u0646\u0634\u0631 \u0644\u0645 \u064A\u062A\u0645 \u0628\u0639\u062F.", { indent: true }),

        // 4. Deployment Plan
        createHeading("\u0664. \u062E\u0637\u0629 \u0627\u0644\u0646\u0634\u0631 \u0639\u0644\u0649 Railway", HeadingLevel.HEADING_1),

        createPara("\u0627\u0644\u0643\u0648\u062F \u0627\u0644\u0622\u0646 \u0645\u062F\u0641\u0648\u0639 \u0625\u0644\u0649 GitHub (origin/main = commit b7773fb). Railway \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0645\u0631\u062A\u0628\u0637\u0627\u064B \u0628\u0640 GitHub \u0644\u064A\u062A\u0639\u0631\u0641 \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B \u0639\u0644\u0649 \u0627\u0644\u062F\u0641\u0639\u0629 \u0627\u0644\u062C\u062F\u064A\u062F\u0629 \u0648\u064A\u0628\u062F\u0623 \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0628\u0646\u0627\u0621. \u0625\u0644\u064A\u0643 \u0627\u0644\u062E\u0637\u0648\u0627\u062A:", { indent: true }),

        createBullet("\u0627\u0641\u062A\u062D Railway Dashboard \u0648\u0627\u0630\u0647\u0628 \u0625\u0644\u0649 \u0645\u0634\u0631\u0648\u0639 Roua Trading"),
        createBullet("\u062A\u062D\u0642\u0642 \u0645\u0646 \u0623\u0646 GitHub \u0645\u0631\u062A\u0628\u0637 \u0643\u0645\u0635\u062F\u0631 \u0644\u0644\u0646\u0634\u0631 (Settings \u2192 Source)"),
        createBullet("\u0625\u0630\u0627 \u0644\u0645 \u064A\u0628\u062F\u0623 Railway \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0628\u0646\u0627\u0621 \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B\u060C \u0627\u0636\u063A\u0637 \"Redeploy\" \u0644\u0641\u0631\u0636 \u0625\u0639\u0627\u062F\u0629 \u0628\u0646\u0627\u0621 \u0643\u0627\u0645\u0644\u0629"),
        createBullet("\u0645\u0646 \u0627\u0644\u0623\u0641\u0636\u0644 \u062A\u0641\u0639\u064A\u0644 \"Clear build cache\" \u0644\u0636\u0645\u0627\u0646 \u0639\u062F\u0645 \u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0637\u0628\u0642\u0627\u062A Docker \u0642\u062F\u064A\u0645\u0629"),
        createBullet("\u0627\u0646\u062A\u0638\u0631 \u062D\u062A\u0649 \u064A\u0643\u062A\u0645\u0644 \u0627\u0644\u0628\u0646\u0627\u0621 (3-5 \u062F\u0642\u0627\u0626\u0642) \u0648\u062A\u0638\u0647\u0631 \u062D\u0627\u0644\u0629 \"ACTIVE\""),

        createHeading("\u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0646\u0634\u0631:", HeadingLevel.HEADING_2),
        createBullet("\u0627\u0641\u062A\u062D \u0641\u064A \u0627\u0644\u0645\u062A\u0635\u0641\u062D: https://<your-railway-domain>/api/health"),
        createBullet("\u062A\u062D\u0642\u0642 \u0645\u0646 \u0623\u0646 version.code = \"V216\""),
        createBullet("\u062A\u062D\u0642\u0642 \u0645\u0646 \u0623\u0646 version.agentProtection = \"ENABLED\""),
        createBullet("\u062A\u062D\u0642\u0642 \u0645\u0646 \u0623\u0646 version.commit \u064A\u062A\u0637\u0627\u0628\u0642 \u0645\u0639 b7773fb"),

        createPara("\u0625\u0630\u0627 \u0631\u0623\u064A\u062A V216 \u0641\u064A health endpoint\u060C \u0641\u0627\u0644\u0625\u0635\u0644\u0627\u062D \u0645\u0646\u0634\u0648\u0631 \u0648\u0639\u0627\u0645\u0644. \u0625\u0630\u0627 \u0644\u0645 \u062A\u0631\u0647\u060C \u0641\u0627\u0644\u0643\u0648\u062F \u0627\u0644\u0642\u062F\u064A\u0645 \u0644\u0627 \u064A\u0632\u0627\u0644 \u064A\u0639\u0645\u0644 \u0648\u064A\u062C\u0628 \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0646\u0634\u0631 \u0645\u0639 \u0645\u0633\u062D \u0627\u0644\u0643\u0627\u0634.", { indent: true, color: colors.accent }),

        // 5. Monitoring
        createHeading("\u0665. \u0645\u0631\u0627\u0642\u0628\u0629 \u0627\u0644\u0646\u062A\u0627\u0626\u062C", HeadingLevel.HEADING_1),

        createPara("\u0628\u0639\u062F \u0627\u0644\u0646\u0634\u0631\u060C \u0631\u0627\u0642\u0628 \u0627\u0644\u0622\u062A\u064A:", { indent: true }),

        createBullet("\u0633\u062C\u0644\u0627\u062A Railway: \u0627\u0628\u062D\u062B \u0639\u0646 \u0631\u0633\u0627\u0626\u0644 \"V214 BLOCKED\" \u0623\u0648 \"V216 BLOCKED\" \u2014 \u0647\u0630\u0647 \u062A\u0639\u0646\u064A \u0623\u0646 \u0627\u0644\u062D\u0645\u0627\u064A\u0629 \u062A\u0639\u0645\u0644 \u0648\u062A\u062D\u0638\u0631 \u0625\u063A\u0644\u0627\u0642\u0627\u064B \u0645\u0628\u0643\u0631\u0627\u064B"),
        createBullet("\u0635\u0641\u0642\u0627\u062A Agent \u0627\u0644\u062C\u062F\u064A\u062F\u0629: \u064A\u062C\u0628 \u0623\u0646 \u062A\u0628\u0642\u0649 \u0645\u0641\u062A\u0648\u062D\u0629 \u0644\u0645\u062F\u0629 48 \u0633\u0627\u0639\u0629 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644 (\u0625\u0644\u0627 \u0625\u0630\u0627 \u0636\u0631\u0628\u062A SL/TP)"),
        createBullet("closeReason: \u064A\u062C\u0628 \u0623\u0644\u0627 \u062A\u0631\u0649 \"Manual\" \u0643\u0633\u0628\u0628 \u0625\u063A\u0644\u0627\u0642 \u0644\u0635\u0641\u0642\u0627\u062A Agent \u0628\u0639\u062F V216. \u0633\u062A\u0631\u0649 STOP_LOSS_HIT \u0623\u0648 TAKE_PROFIT_HIT \u0623\u0648 TIME_EXPIRED \u0623\u0648 EXCHANGE_SYNC"),
        createBullet("\u0625\u0630\u0627 \u0631\u0623\u064A\u062A \"Manual\" \u0628\u0639\u062F V216\u060C \u0647\u0630\u0627 \u064A\u0639\u0646\u064A \u0623\u0646 \u0627\u0644\u0643\u0648\u062F \u0627\u0644\u062C\u062F\u064A\u062F \u0644\u0645 \u064A\u064F\u0646\u0634\u0631 \u0628\u0639\u062F"),

        // 6. Architecture Diagram (text)
        createHeading("\u0666. \u0645\u0633\u0627\u0631\u0627\u062A \u0627\u0644\u0625\u063A\u0644\u0627\u0642 \u0648\u0646\u0642\u0627\u0637 \u0627\u0644\u062D\u0645\u0627\u064A\u0629", HeadingLevel.HEADING_1),

        createPara("\u0643\u0644 \u0645\u0633\u0627\u0631 \u0625\u063A\u0644\u0627\u0642 \u0644\u0635\u0641\u0642\u0629 Agent \u064A\u0645\u0631 \u0639\u0628\u0631 \u0646\u0642\u0637\u0629 \u062D\u0645\u0627\u064A\u0629 \u0648\u0627\u062D\u062F\u0629 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644:", { indent: true }),

        // Path table
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
            left: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
            right: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
            insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
          },
          rows: [
            createTableHeader(["\u0627\u0644\u0645\u0633\u0627\u0631", "\u0646\u0642\u0637\u0629 \u0627\u0644\u062D\u0645\u0627\u064A\u0629", "\u0627\u0644\u0625\u0635\u062F\u0627\u0631"]),
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 40, type: WidthType.PERCENTAGE },
                  margins: { top: 60, bottom: 60, left: 100, right: 100 },
                  children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "PositionMonitor (TIME_EXPIRED)", size: 21, color: colors.body, font: "Noto Sans SC" })] })],
                }),
                new TableCell({
                  width: { size: 35, type: WidthType.PERCENTAGE },
                  margins: { top: 60, bottom: 60, left: 100, right: 100 },
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "V214: hardcoded 48h", size: 21, color: colors.success, bold: true, font: "Noto Sans SC" })] })],
                }),
                new TableCell({
                  width: { size: 25, type: WidthType.PERCENTAGE },
                  margins: { top: 60, bottom: 60, left: 100, right: 100 },
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "V214", size: 21, color: colors.body, font: "Noto Sans SC" })] })],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 40, type: WidthType.PERCENTAGE },
                  margins: { top: 60, bottom: 60, left: 100, right: 100 },
                  children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "closePosition (any caller)", size: 21, color: colors.body, font: "Noto Sans SC" })] })],
                }),
                new TableCell({
                  width: { size: 35, type: WidthType.PERCENTAGE },
                  margins: { top: 60, bottom: 60, left: 100, right: 100 },
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "V214: block if <48h non-SL/TP", size: 21, color: colors.success, bold: true, font: "Noto Sans SC" })] })],
                }),
                new TableCell({
                  width: { size: 25, type: WidthType.PERCENTAGE },
                  margins: { top: 60, bottom: 60, left: 100, right: 100 },
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "V214", size: 21, color: colors.body, font: "Noto Sans SC" })] })],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 40, type: WidthType.PERCENTAGE },
                  margins: { top: 60, bottom: 60, left: 100, right: 100 },
                  children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "forceClosePosition", size: 21, color: colors.body, font: "Noto Sans SC" })] })],
                }),
                new TableCell({
                  width: { size: 35, type: WidthType.PERCENTAGE },
                  margins: { top: 60, bottom: 60, left: 100, right: 100 },
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "V214: block if <48h non-SL/TP", size: 21, color: colors.success, bold: true, font: "Noto Sans SC" })] })],
                }),
                new TableCell({
                  width: { size: 25, type: WidthType.PERCENTAGE },
                  margins: { top: 60, bottom: 60, left: 100, right: 100 },
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "V214", size: 21, color: colors.body, font: "Noto Sans SC" })] })],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 40, type: WidthType.PERCENTAGE },
                  shading: { type: ShadingType.CLEAR, fill: colors.surface },
                  margins: { top: 60, bottom: 60, left: 100, right: 100 },
                  children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "ExchangeSync (DB fallback)", size: 21, color: colors.body, font: "Noto Sans SC" })] })],
                }),
                new TableCell({
                  width: { size: 35, type: WidthType.PERCENTAGE },
                  shading: { type: ShadingType.CLEAR, fill: colors.surface },
                  margins: { top: 60, bottom: 60, left: 100, right: 100 },
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "V216: block if <48h", size: 21, color: colors.warning, bold: true, font: "Noto Sans SC" })] })],
                }),
                new TableCell({
                  width: { size: 25, type: WidthType.PERCENTAGE },
                  shading: { type: ShadingType.CLEAR, fill: colors.surface },
                  margins: { top: 60, bottom: 60, left: 100, right: 100 },
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "V216 \u062C\u062F\u064A\u062F", size: 21, color: colors.warning, bold: true, font: "Noto Sans SC" })] })],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 40, type: WidthType.PERCENTAGE },
                  margins: { top: 60, bottom: 60, left: 100, right: 100 },
                  children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Agent._monitorOpenPositions", size: 21, color: colors.body, font: "Noto Sans SC" })] })],
                }),
                new TableCell({
                  width: { size: 35, type: WidthType.PERCENTAGE },
                  margins: { top: 60, bottom: 60, left: 100, right: 100 },
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "V213: block MAX_HOLDING_TIME", size: 21, color: colors.success, bold: true, font: "Noto Sans SC" })] })],
                }),
                new TableCell({
                  width: { size: 25, type: WidthType.PERCENTAGE },
                  margins: { top: 60, bottom: 60, left: 100, right: 100 },
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "V213", size: 21, color: colors.body, font: "Noto Sans SC" })] })],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 40, type: WidthType.PERCENTAGE },
                  margins: { top: 60, bottom: 60, left: 100, right: 100 },
                  children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "\u0625\u063A\u0644\u0627\u0642 \u064A\u062F\u0648\u064A (API)", size: 21, color: colors.body, font: "Noto Sans SC" })] })],
                }),
                new TableCell({
                  width: { size: 35, type: WidthType.PERCENTAGE },
                  margins: { top: 60, bottom: 60, left: 100, right: 100 },
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "V214: block MANUAL <48h", size: 21, color: colors.success, bold: true, font: "Noto Sans SC" })] })],
                }),
                new TableCell({
                  width: { size: 25, type: WidthType.PERCENTAGE },
                  margins: { top: 60, bottom: 60, left: 100, right: 100 },
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "V214", size: 21, color: colors.body, font: "Noto Sans SC" })] })],
                }),
              ],
            }),
          ],
        }),

        // 7. Summary
        createHeading("\u0667. \u0645\u0644\u062E\u0635 \u0627\u0644\u0625\u062C\u0631\u0627\u0621\u0627\u062A", HeadingLevel.HEADING_1),

        createPara("\u0627\u0644\u0643\u0648\u062F \u0627\u0644\u0622\u0646 \u0645\u062F\u0641\u0648\u0639 \u0625\u0644\u0649 GitHub \u0648\u064A\u062D\u062A\u0648\u064A \u0639\u0644\u0649 5 \u0637\u0628\u0642\u0627\u062A \u062D\u0645\u0627\u064A\u0629. \u0627\u0644\u062E\u0637\u0648\u0629 \u0627\u0644\u062A\u0627\u0644\u064A\u0629 \u0648\u0627\u0644\u0623\u062E\u064A\u0631\u0629 \u0647\u064A \u0639\u0644\u064A\u0643: \u0627\u0644\u062A\u0623\u0643\u062F \u0645\u0646 \u0623\u0646 Railway \u064A\u0646\u0634\u0631 \u0627\u0644\u0643\u0648\u062F \u0627\u0644\u062C\u062F\u064A\u062F \u0648\u0627\u0644\u062A\u062D\u0642\u0642 \u0639\u0628\u0631 health endpoint. \u0645\u0627 \u062D\u062F\u062B \u0633\u0627\u0628\u0642\u0627\u064B \u0643\u0627\u0646 \u0641\u062C\u0648\u0629 \u0628\u064A\u0646 \u0625\u0635\u0644\u0627\u062D \u0627\u0644\u0643\u0648\u062F \u0648\u0646\u0634\u0631\u0647 \u2014 \u0648\u0647\u0630\u0647 \u0627\u0644\u0641\u062C\u0648\u0629 \u0647\u064A \u0627\u0644\u062A\u064A \u0623\u062F\u062A \u0625\u0644\u0649 \u0627\u0644\u0645\u0634\u0643\u0644\u0629.", { indent: true }),

        createPara("\u0627\u0644\u0645\u0644\u0641\u0627\u062A \u0627\u0644\u0645\u0639\u062F\u0644\u0629 \u0641\u064A \u0647\u0630\u0627 \u0627\u0644\u0625\u0635\u0644\u0627\u062D:", { bold: true }),
        createBullet("exchange-sync.service.ts \u2014 V216: \u062D\u0645\u0627\u064A\u0629 \u0645\u0633\u0627\u0631 fallback \u0627\u0644\u0645\u0628\u0627\u0634\u0631"),
        createBullet("main.ts \u2014 V216: \u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0627\u0644\u0625\u0635\u062F\u0627\u0631 \u0641\u064A health endpoint"),
        createBullet(".gitignore \u2014 \u062A\u0646\u0638\u064A\u0641 \u0645\u0644\u0641\u0627\u062A \u063A\u064A\u0631 \u0636\u0631\u0648\u0631\u064A\u0629 \u0645\u0646 \u0627\u0644\u062A\u062A\u0628\u0639\u064A\u0629"),

        new Paragraph({ spacing: { before: 300 } }),
        createPara("Commit: b7773fb", { bold: true, color: colors.accent }),
        createPara("GitHub: jsiadyarslan-lab/roua-trading (main)", { color: colors.secondary }),
      ],
    },
  ],
});

Packer.toBuffer(doc).then(buffer => {
  const outputPath = '/home/z/my-project/download/V216-security-fix-report.docx';
  fs.writeFileSync(outputPath, buffer);
  console.log(`Report saved to ${outputPath}`);
});
