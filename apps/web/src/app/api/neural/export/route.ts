import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/neural/export
 * Export backtest/optimization results in multiple formats (PDF, XLSX, CSV, JSON)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { format, reportData, reportType } = body;

    if (!format || !reportData) {
      return NextResponse.json(
        { success: false, error: 'الصيغة وبيانات التقرير مطلوبة' },
        { status: 400 },
      );
    }

    const validFormats = ['pdf', 'xlsx', 'csv', 'json'];
    if (!validFormats.includes(format)) {
      return NextResponse.json(
        { success: false, error: `صيغة غير مدعومة: ${format}` },
        { status: 400 },
      );
    }

    // Try NestJS first
    const apiTarget = process.env.API_INTERNAL_URL || 'http://localhost:3001';
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
        // NestJS returned a file — forward it
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
      // Generate CSV from report data
      const { stringify } = await import('csv-stringify/sync');
      const rows: string[][] = [];

      // Header row
      rows.push(['تقرير مختبر التداول الذكي - رؤى']);
      rows.push([]);
      rows.push(['النوع', reportType || 'باك تست']);
      rows.push(['الأصل', reportData.symbol || '']);
      rows.push(['الاستراتيجية', reportData.strategy || '']);
      rows.push([]);

      // Metrics
      if (reportData.totalReturn !== undefined) {
        rows.push(['المقياس', 'القيمة']);
        rows.push(['إجمالي العائد', `${reportData.totalReturn}%`]);
        rows.push(['نسبة الفوز', `${reportData.winRate}%`]);
        rows.push(['عدد الصفقات', String(reportData.totalTrades || '')]);
        rows.push(['أقصى انخفاض', `${reportData.maxDrawdown}%`]);
        rows.push(['معامل شارب', String(reportData.sharpeRatio || '')]);
        rows.push(['رأس المال النهائي', `$${reportData.finalCapital || ''}`]);
        rows.push([]);
      }

      // Trades
      if (reportData.trades && reportData.trades.length > 0) {
        rows.push(['سجل الصفقات']);
        rows.push(['الاتجاه', 'سعر الدخول', 'سعر الخروج', 'الربح/الخسارة', 'النسبة', 'المدة']);
        for (const t of reportData.trades) {
          rows.push([
            t.side === 'BUY' ? 'شراء' : 'بيع',
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

      const sheet = workbook.addWorksheet('التقرير', {
        properties: { tabColor: { argb: '8B5CF6' } },
      });

      // Title
      sheet.mergeCells('A1:F1');
      const titleCell = sheet.getCell('A1');
      titleCell.value = 'تقرير مختبر التداول الذكي — رؤى';
      titleCell.font = { size: 16, bold: true, color: { argb: '8B5CF6' } };
      titleCell.alignment = { horizontal: 'center' };

      // Info rows
      sheet.addRow([]);
      sheet.addRow(['النوع:', reportType || 'باك تست']);
      sheet.addRow(['الأصل:', reportData.symbol || '']);
      sheet.addRow(['الاستراتيجية:', reportData.strategy || '']);
      sheet.addRow([]);

      // Metrics
      if (reportData.totalReturn !== undefined) {
        const metricsSheet = sheet.addRow(['المقياس', 'القيمة']);
        metricsSheet.font = { bold: true, color: { argb: 'FFFFFF' } };
        metricsSheet.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '374151' } };
        });

        sheet.addRow(['إجمالي العائد', `${reportData.totalReturn}%`]);
        sheet.addRow(['نسبة الفوز', `${reportData.winRate}%`]);
        sheet.addRow(['عدد الصفقات', reportData.totalTrades]);
        sheet.addRow(['أقصى انخفاض', `${reportData.maxDrawdown}%`]);
        sheet.addRow(['معامل شارب', reportData.sharpeRatio]);
        sheet.addRow(['رأس المال النهائي', `$${reportData.finalCapital || ''}`]);
        sheet.addRow([]);
      }

      // Trades table
      if (reportData.trades && reportData.trades.length > 0) {
        const header = sheet.addRow(['الاتجاه', 'سعر الدخول', 'سعر الخروج', 'الربح/الخسارة', 'النسبة', 'المدة']);
        header.font = { bold: true, color: { argb: 'FFFFFF' } };
        header.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '374151' } };
        });

        for (const t of reportData.trades) {
          const row = sheet.addRow([
            t.side === 'BUY' ? 'شراء' : 'بيع',
            t.entryPrice,
            t.exitPrice,
            t.pnl,
            `${t.pnlPercent}%`,
            t.holdDuration || '',
          ]);
          // Color PnL cells
          const pnlCell = row.getCell(4);
          pnlCell.font = { color: { argb: t.pnl >= 0 ? '22C55E' : 'EF4444' } };
        }
      }

      // Auto-fit columns
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
      // Generate PDF using pdfkit
      const PDFDocument = (await import('pdfkit')).default;
      const chunks: Buffer[] = [];

      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        info: {
          Title: 'تقرير مختبر التداول الذكي — رؤى',
          Author: 'Roua Trading',
        },
      });

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));

      // Title
      doc.fontSize(22).fillColor('#8B5CF6').text('Neural Lab Report', { align: 'center' });
      doc.fontSize(12).fillColor('#9CA3AF').text('Roua Trading - AI Trading Lab', { align: 'center' });
      doc.moveDown(1.5);

      // Separator line
      doc.strokeColor('#374151').lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(1);

      // Info
      doc.fontSize(11).fillColor('#FFFFFF');
      doc.text(`Report Type: ${reportType || 'Backtest'}`);
      doc.text(`Symbol: ${reportData.symbol || 'N/A'}`);
      doc.text(`Strategy: ${reportData.strategy || 'N/A'}`);
      doc.text(`Date: ${new Date().toLocaleDateString('en-US')}`);
      doc.moveDown(1.5);

      // Metrics
      if (reportData.totalReturn !== undefined) {
        doc.fontSize(14).fillColor('#8B5CF6').text('Performance Metrics', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(10).fillColor('#D1D5DB');

        const metrics = [
          ['Total Return', `${reportData.totalReturn}%`],
          ['Win Rate', `${reportData.winRate}%`],
          ['Total Trades', String(reportData.totalTrades || 'N/A')],
          ['Max Drawdown', `${reportData.maxDrawdown}%`],
          ['Sharpe Ratio', String(reportData.sharpeRatio || 'N/A')],
          ['Final Capital', `$${reportData.finalCapital || 'N/A'}`],
        ];

        for (const [label, value] of metrics) {
          doc.text(`${label}: ${value}`, { indent: 20 });
        }
        doc.moveDown(1.5);
      }

      // Trades
      if (reportData.trades && reportData.trades.length > 0) {
        doc.fontSize(14).fillColor('#8B5CF6').text('Trade History', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(8).fillColor('#9CA3AF');

        const tradesToShow = reportData.trades.slice(0, 30);
        for (let i = 0; i < tradesToShow.length; i++) {
          const t = tradesToShow[i];
          const side = t.side === 'BUY' ? 'BUY' : 'SELL';
          const pnl = t.pnl >= 0 ? `+$${t.pnl.toFixed(2)}` : `-$${Math.abs(t.pnl).toFixed(2)}`;
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

    return NextResponse.json({ success: false, error: 'صيغة غير مدعومة' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: `خطأ في التصدير: ${error.message}` },
      { status: 502 },
    );
  }
}
