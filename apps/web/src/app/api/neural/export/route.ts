import { NextRequest, NextResponse } from 'next/server'
import T from '@/lib/unified-tokens';

/**
 * POST /api/neural/export
 * Export backtest/optimization results in multiple formats (PDF, XLSX, CSV, JSON)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { format, reportData, reportType } = body;
    const lang = body.language || 'ar';

    if (!format || !reportData) {
      return NextResponse.json(
        { success: false, error: lang === 'en' ? 'Format and report data are required' : 'الصيغة وبيانات التقرير مطلوبة' },
        { status: 400 },
      );
    }

    const validFormats = ['pdf', 'xlsx', 'csv', 'json'];
    if (!validFormats.includes(format)) {
      return NextResponse.json(
        { success: false, error: lang === 'en' ? `Unsupported format: ${format}` : `صيغة غير مدعومة: ${format}` },
        { status: 400 },
      );
    }

    // Try NestJS first
    const apiTarget = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001';
    const sessionToken = request.cookies.get('roua_session')?.value;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      cookie: request.headers.get('cookie') || '',
    };

    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
    }

    try {
      const res = await fetch(`${apiTarget}/api/neural/export`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok && res.headers.get('content-type')?.includes('application/octet-stream')) {
        const buffer = await res.arrayBuffer();
        const filename = res.headers.get('content-disposition')?.match(/filename="?(.+?)"?$/)?.[1] || `report.${format}`;
        return new NextResponse(buffer, {
          status: 200,
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${filename}"`,
          },
        });
      }
    } catch {
      // NestJS unavailable — generate locally
    }

    // Bilingual labels
    const L = {
      reportTitle: lang === 'en' ? 'AI Trading Lab Report — Roua' : 'تقرير مختبر التداول الذكي — رؤى',
      type: lang === 'en' ? 'Type' : 'النوع',
      asset: lang === 'en' ? 'Asset' : 'الأصل',
      strategy: lang === 'en' ? 'Strategy' : 'الاستراتيجية',
      metric: lang === 'en' ? 'Metric' : 'المقياس',
      value: lang === 'en' ? 'Value' : 'القيمة',
      totalReturn: lang === 'en' ? 'Total Return' : 'إجمالي العائد',
      winRate: lang === 'en' ? 'Win Rate' : 'نسبة الفوز',
      totalTrades: lang === 'en' ? 'Total Trades' : 'عدد الصفقات',
      maxDrawdown: lang === 'en' ? 'Max Drawdown' : 'أقصى انخفاض',
      sharpeRatio: lang === 'en' ? 'Sharpe Ratio' : 'معامل شارب',
      finalCapital: lang === 'en' ? 'Final Capital' : 'رأس المال النهائي',
      tradeLog: lang === 'en' ? 'Trade Log' : 'سجل الصفقات',
      direction: lang === 'en' ? 'Direction' : 'الاتجاه',
      entryPrice: lang === 'en' ? 'Entry Price' : 'سعر الدخول',
      exitPrice: lang === 'en' ? 'Exit Price' : 'سعر الخروج',
      pnl: lang === 'en' ? 'Profit/Loss' : 'الربح/الخسارة',
      percentage: lang === 'en' ? 'Percentage' : 'النسبة',
      duration: lang === 'en' ? 'Duration' : 'المدة',
      buy: lang === 'en' ? 'Buy' : 'شراء',
      sell: lang === 'en' ? 'Sell' : 'بيع',
      backtest: lang === 'en' ? 'Backtest' : 'باك تست',
    };

    // ── Local export generation ──

    if (format === 'json') {
      const jsonStr = JSON.stringify(reportData, null, 2);
      return new NextResponse(jsonStr, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="neural-report.json"`,
        },
      });
    }

    if (format === 'csv') {
      const { stringify } = await import('csv-stringify/sync');
      const rows: string[][] = [];

      rows.push([L.reportTitle]);
      rows.push([]);
      rows.push([L.type, reportType || L.backtest]);
      rows.push([L.asset, reportData.symbol || '']);
      rows.push([L.strategy, reportData.strategy || '']);
      rows.push([]);

      if (reportData.totalReturn !== undefined) {
        rows.push([L.metric, L.value]);
        rows.push([L.totalReturn, `${reportData.totalReturn}%`]);
        rows.push([L.winRate, `${reportData.winRate}%`]);
        rows.push([L.totalTrades, String(reportData.totalTrades || '')]);
        rows.push([L.maxDrawdown, `${reportData.maxDrawdown}%`]);
        rows.push([L.sharpeRatio, String(reportData.sharpeRatio || '')]);
        rows.push([L.finalCapital, `$${reportData.finalCapital || ''}`]);
        rows.push([]);
      }

      if (reportData.trades && reportData.trades.length > 0) {
        rows.push([L.tradeLog]);
        rows.push([L.direction, L.entryPrice, L.exitPrice, L.pnl, L.percentage, L.duration]);
        for (const t of reportData.trades) {
          rows.push([
            t.side === 'BUY' ? L.buy : L.sell,
            String(t.entryPrice),
            String(t.exitPrice),
            String(t.pnl),
            `${t.pnlPercent}%`,
            t.holdDuration || '',
          ]);
        }
      }

      const csvContent = stringify(rows);
      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="neural-report.csv"`,
        },
      });
    }

    if (format === 'xlsx') {
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Roua Trading - AI Lab';
      workbook.created = new Date();

      const sheet = workbook.addWorksheet(lang === 'en' ? 'Report' : 'التقرير', {
        properties: { tabColor: { argb: '8B5CF6' } },
      });

      // Title
      sheet.mergeCells('A1:F1');
      const titleCell = sheet.getCell('A1');
      titleCell.value = L.reportTitle;
      titleCell.font = { size: 16, bold: true, color: { argb: '8B5CF6' } };
      titleCell.alignment = { horizontal: 'center' };

      // Info rows
      sheet.addRow([]);
      sheet.addRow([L.type + ':', reportType || L.backtest]);
      sheet.addRow([L.asset + ':', reportData.symbol || '']);
      sheet.addRow([L.strategy + ':', reportData.strategy || '']);
      sheet.addRow([]);

      // Metrics
      if (reportData.totalReturn !== undefined) {
        const metricsSheet = sheet.addRow([L.metric, L.value]);
        metricsSheet.font = { bold: true, color: { argb: 'FFFFFF' } };
        metricsSheet.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '374151' } };
        });

        sheet.addRow([L.totalReturn, `${reportData.totalReturn}%`]);
        sheet.addRow([L.winRate, `${reportData.winRate}%`]);
        sheet.addRow([L.totalTrades, reportData.totalTrades]);
        sheet.addRow([L.maxDrawdown, `${reportData.maxDrawdown}%`]);
        sheet.addRow([L.sharpeRatio, reportData.sharpeRatio]);
        sheet.addRow([L.finalCapital, `$${reportData.finalCapital || ''}`]);
        sheet.addRow([]);
      }

      // Trades table
      if (reportData.trades && reportData.trades.length > 0) {
        const header = sheet.addRow([L.direction, L.entryPrice, L.exitPrice, L.pnl, L.percentage, L.duration]);
        header.font = { bold: true, color: { argb: 'FFFFFF' } };
        header.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '374151' } };
        });

        for (const t of reportData.trades) {
          const row = sheet.addRow([
            t.side === 'BUY' ? L.buy : L.sell,
            t.entryPrice,
            t.exitPrice,
            t.pnl,
            `${t.pnlPercent}%`,
            t.holdDuration || '',
          ]);
          const pnlCell = row.getCell(4);
          pnlCell.font = { color: { argb: t.pnl > 0 ? '22C55E' : t.pnl < 0 ? 'EF4444' : '8B92A8' } };
        }
      }

      sheet.columns.forEach((col) => {
        col.width = 18;
      });

      const buffer = await workbook.xlsx.writeBuffer();
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="neural-report.xlsx"`,
        },
      });
    }

    if (format === 'pdf') {
      const PDFDocument = (await import('pdfkit')).default;
      const chunks: Buffer[] = [];

      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        info: {
          Title: 'Neural Lab Report — Roua Trading',
          Author: 'Roua Trading',
        },
      });

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));

      // Title
      doc.fontSize(22).fillColor('#8B5CF6').text('Neural Lab Report', { align: 'center' });
      doc.fontSize(12).fillColor('#9CA3AF').text('Roua Trading - AI Trading Lab', { align: 'center' });
      doc.moveDown(1.5);

      doc.strokeColor(T.text3).lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(1);

      // Info
      doc.fontSize(11).fillColor('#FFFFFF');
      doc.text(`${L.type}: ${reportType || L.backtest}`);
      doc.text(`${L.asset}: ${reportData.symbol || 'N/A'}`);
      doc.text(`${L.strategy}: ${reportData.strategy || 'N/A'}`);
      doc.text(`Date: ${new Date().toLocaleDateString('en-US')}`);
      doc.moveDown(1.5);

      // Metrics
      if (reportData.totalReturn !== undefined) {
        doc.fontSize(14).fillColor('#8B5CF6').text(lang === 'en' ? 'Performance Metrics' : 'مقاييس الأداء', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(10).fillColor('#D1D5DB');

        const metrics = [
          [L.totalReturn, `${reportData.totalReturn}%`],
          [L.winRate, `${reportData.winRate}%`],
          [L.totalTrades, String(reportData.totalTrades || 'N/A')],
          [L.maxDrawdown, `${reportData.maxDrawdown}%`],
          [L.sharpeRatio, String(reportData.sharpeRatio || 'N/A')],
          [L.finalCapital, `$${reportData.finalCapital || 'N/A'}`],
        ];

        for (const [label, value] of metrics) {
          doc.text(`${label}: ${value}`, { indent: 20 });
        }
        doc.moveDown(1.5);
      }

      // Trades
      if (reportData.trades && reportData.trades.length > 0) {
        doc.fontSize(14).fillColor('#8B5CF6').text(lang === 'en' ? 'Trade History' : 'سجل الصفقات', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(8).fillColor('#9CA3AF');

        const tradesToShow = reportData.trades.slice(0, 30);
        for (let i = 0; i < tradesToShow.length; i++) {
          const t = tradesToShow[i];
          const side = t.side === 'BUY' ? 'BUY' : 'SELL';
          const pnl = t.pnl > 0 ? `+$${t.pnl.toFixed(2)}` : `-$${Math.abs(t.pnl).toFixed(2)}`;
          doc.text(
            `#${i + 1} ${side} Entry: $${t.entryPrice.toFixed(2)} Exit: $${t.exitPrice.toFixed(2)} PnL: ${pnl} (${t.pnlPercent.toFixed(2)}%)`,
            { indent: 10 },
          );
        }
      }

      doc.end();

      const pdfBuffer = await new Promise<Buffer>((resolve) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
      });

      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="neural-report.pdf"`,
        },
      });
    }

    return NextResponse.json({ success: false, error: lang === 'en' ? 'Unsupported format' : 'صيغة غير مدعومة' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: `خطأ في التصدير: ${error.message}` },
      { status: 502 },
    );
  }
}
