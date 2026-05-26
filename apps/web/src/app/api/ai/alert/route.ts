// AI Alert Route — sends pattern alerts to Telegram
// Called automatically when high-confidence patterns detected
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { symbol, signal, patterns, smcBreaks, entry, sl, tp, confidence } = await req.json();

    const token = process.env.TELEGRAM_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      return NextResponse.json({ ok: false, reason: 'Telegram not configured' });
    }

    // Build message
    const dir = signal === 'BUY' ? '▲ شراء' : signal === 'SELL' ? '▼ بيع' : '◆ انتظار';
    const conf = Math.round(confidence * 100);
    const emoji = conf >= 70 ? '🔴🔴' : conf >= 50 ? '🟡' : '🟢';
    const fp = (n: number) => n > 999 ? n.toFixed(2) : n.toFixed(5);

    const lines = [
      `${emoji} <b>رؤى — إشارة جديدة</b>`,
      `<b>${symbol}</b>  ${dir}  <b>${conf}%</b>`,
      `━━━━━━━━━━━━━━━`,
    ];

    if (patterns?.length > 0) {
      lines.push(`🕯 ${patterns.slice(0, 3).join(' • ')}`);
    }
    if (smcBreaks?.length > 0) {
      lines.push(`📊 ${smcBreaks.join(' • ')}`);
    }
    if (entry && signal !== 'WAIT') {
      lines.push(`━━━━━━━━━━━━━━━`);
      lines.push(`دخول: <code>${fp(entry)}</code>`);
      lines.push(`وقف:  <code>${fp(sl)}</code>`);
      lines.push(`هدف:  <code>${fp(tp)}</code>`);
      const rr = Math.abs((tp - entry) / (sl - entry || 1)).toFixed(2);
      lines.push(`R:R = 1:${rr}`);
    }
    lines.push(`━━━━━━━━━━━━━━━`);
    lines.push(`⏰ ${new Date().toLocaleTimeString('ar')}`);

    const text = lines.join('\n');

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });

    const data = await res.json();
    return NextResponse.json({ ok: data.ok });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message });
  }
}
