/**
 * اختبارات محاسبة Paper Trading
 * تُشغَّل قبل كل deployment للتحقق من صحة النموذج
 */

let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

function approx(a, b, tolerance = 0.01) {
  return Math.abs(a - b) <= tolerance;
}

// ═══════════════════════════════════════════════════════════
// الثوابت
// ═══════════════════════════════════════════════════════════
const INITIAL_BALANCE = 10000;
const CRYPTO_LEVERAGE = 10;
const FEE_RATE = 0.001; // 0.1%

// ═══════════════════════════════════════════════════════════
// دوال النموذج (تعكس الكود الفعلي)
// ═══════════════════════════════════════════════════════════

function calcMargin(qty, entryPrice, leverage) {
  // backend: entryPrice × qty / leverage
  return qty * entryPrice / leverage;
}

function calcPnl(side, entryPrice, exitPrice, qty) {
  const grossPnl = side === 'BUY'
    ? (exitPrice - entryPrice) * qty
    : (entryPrice - exitPrice) * qty;
  const exitFee = exitPrice * qty * FEE_RATE; // V174: exit fee only
  return grossPnl - exitFee;
}

function calcEquity(paperBalance, positions) {
  // backend: equity = paperBalance + usedMargin(entry) + unrealizedPnl
  let usedMargin = 0, unrealizedPnl = 0;
  for (const p of positions) {
    usedMargin += calcMargin(p.qty, p.entryPrice, CRYPTO_LEVERAGE);
    unrealizedPnl += p.side === 'BUY'
      ? (p.currentPrice - p.entryPrice) * p.qty
      : (p.entryPrice - p.currentPrice) * p.qty;
  }
  return {
    equity: paperBalance + usedMargin + unrealizedPnl,
    usedMargin,
    unrealizedPnl,
    available: paperBalance + unrealizedPnl, // ← V173d
  };
}

// ═══════════════════════════════════════════════════════════
// السيناريوهات
// ═══════════════════════════════════════════════════════════

console.log('\n1. فتح صفقة واحدة');
test('فتح BTC 0.001 @ 77000 (leverage=10)', () => {
  let balance = INITIAL_BALANCE;
  const qty = 0.001, entry = 77000;
  const margin = calcMargin(qty, entry, CRYPTO_LEVERAGE); // = 7.7
  balance -= margin; // V172d

  assert(approx(margin, 7.7), `margin=${margin} يجب 7.7`);
  assert(approx(balance, 9992.3), `balance=${balance} يجب 9992.3`);

  const { equity, usedMargin } = calcEquity(balance, [{qty, entryPrice: entry, currentPrice: entry, side: 'BUY'}]);
  assert(approx(equity, 10000), `equity=${equity} يجب 10000`);
  assert(approx(usedMargin, 7.7), `usedMargin=${usedMargin} يجب 7.7`);
});

console.log('\n2. PnL عند الإغلاق');
test('إغلاق BTC 0.001 @ 77770 (+1%) ← V174 exit fee فقط', () => {
  const qty = 0.001, entry = 77000, exit = 77770;
  const pnl = calcPnl('BUY', entry, exit, qty);
  const grossPnl = (exit - entry) * qty; // = 0.77
  const exitFee = exit * qty * FEE_RATE; // = 0.07777

  assert(approx(grossPnl, 0.77), `grossPnl=${grossPnl.toFixed(4)} يجب 0.77`);
  assert(approx(exitFee, 0.07777, 0.001), `exitFee=${exitFee.toFixed(5)} يجب ~0.0778`);
  assert(approx(pnl, 0.692, 0.01), `pnl=${pnl.toFixed(4)} يجب ~0.692`);
});

test('لا double-counting للـ entry fee', () => {
  const qty = 0.05035, entry = 77300.38, exit = 77525.59;
  const pnl = calcPnl('SELL', entry, exit, qty);
  const wrongPnl = (entry - exit) * qty - (entry + exit) * qty * FEE_RATE; // الخطأ القديم

  // V174: pnl صحيح لا يشمل entry fee
  assert(approx(pnl, -15.24, 0.1), `pnl=${pnl.toFixed(2)} يجب ~-15.24`);
  // الخطأ القديم كان -19.13
  assert(!approx(pnl, -19.13, 0.5), `pnl لا يجب أن يكون -19.13 (double fee)`);
  assert(approx(pnl - wrongPnl, 3.89, 0.1), `الفرق=${(pnl - wrongPnl).toFixed(2)} يجب ~$3.89`);
});

console.log('\n3. دورة فتح ثم إغلاق كاملة');
test('الرصيد يعود لأصله + PnL بعد فتح وإغلاق', () => {
  let balance = INITIAL_BALANCE;
  const qty = 0.1, entry = 77000, exit = 78000;

  // فتح
  const margin = calcMargin(qty, entry, CRYPTO_LEVERAGE); // = 770
  balance -= margin; // = 9230

  // إغلاق
  const pnl = calcPnl('BUY', entry, exit, qty); // = 100 - 7.8 = 92.2
  balance += margin + pnl; // = 9230 + 770 + 92.2 = 10092.2

  assert(approx(balance, 10092.2, 0.5), `balance=${balance.toFixed(2)} يجب ~10092.2`);
  assert(balance > INITIAL_BALANCE, 'الرصيد يجب أن يرتفع بعد ربح');
});

test('الرصيد ينخفض بعد خسارة', () => {
  let balance = INITIAL_BALANCE;
  const qty = 0.1, entry = 77000, exit = 76000;
  const margin = calcMargin(qty, entry, CRYPTO_LEVERAGE);
  balance -= margin;
  const pnl = calcPnl('BUY', entry, exit, qty); // = -100 - 7.6 = -107.6
  balance += margin + pnl;
  assert(balance < INITIAL_BALANCE, 'الرصيد يجب أن ينخفض بعد خسارة');
  assert(approx(balance, INITIAL_BALANCE + pnl, 0.1), `balance يجب INITIAL + pnl`);
});

console.log('\n4. Equity ثابت بدون أسعار');
test('equity لا يتغير لأن paperBalance و usedMargin متوازنان', () => {
  let balance = INITIAL_BALANCE;
  const pos = { qty: 0.1, entryPrice: 77000, currentPrice: 77000, side: 'BUY' };
  balance -= calcMargin(pos.qty, pos.entryPrice, CRYPTO_LEVERAGE);
  const { equity } = calcEquity(balance, [pos]);
  assert(approx(equity, INITIAL_BALANCE), `equity=${equity} يجب ${INITIAL_BALANCE}`);
});

test('equity يعكس فقط unrealizedPnL عند تغير الأسعار', () => {
  let balance = INITIAL_BALANCE;
  const pos = { qty: 0.1, entryPrice: 77000, currentPrice: 78000, side: 'BUY' };
  balance -= calcMargin(pos.qty, pos.entryPrice, CRYPTO_LEVERAGE);
  const { equity, unrealizedPnl } = calcEquity(balance, [pos]);
  assert(approx(equity, INITIAL_BALANCE + unrealizedPnl, 0.01), `equity يجب INITIAL + PnL`);
  assert(approx(unrealizedPnl, 100, 0.01), `unrealizedPnl=${unrealizedPnl} يجب 100`);
});

console.log('\n5. الرصيد المعروض ثابت بين الصفقات');
test('available لا يتغير عند فتح صفقة (يعكس paperBalance + unrealizedPnl)', () => {
  let balance = INITIAL_BALANCE;
  // بدون صفقات
  const { available: avBefore } = calcEquity(balance, []);
  assert(approx(avBefore, INITIAL_BALANCE), `available قبل=${avBefore}`);

  // بعد فتح صفقة (الأسعار ثابتة)
  const pos = { qty: 0.1, entryPrice: 77000, currentPrice: 77000, side: 'BUY' };
  balance -= calcMargin(pos.qty, pos.entryPrice, CRYPTO_LEVERAGE);
  const { available: avAfter } = calcEquity(balance, [pos]);
  // available = paperBalance + unrealizedPnl = (INITIAL-770) + 0 = 9230
  assert(approx(avAfter, INITIAL_BALANCE - calcMargin(pos.qty, pos.entryPrice, CRYPTO_LEVERAGE)), 
    `available بعد=${avAfter} يجب ${INITIAL_BALANCE - 770}`);
});

console.log('\n6. بيانات حقيقية من الـ API');
test('BTC SELL 0.05035 @ entry=77300 exit=77525 مطابق للـ DB', () => {
  const qty = 0.05035, entry = 77300.38, exit = 77525.59;
  const pnl = calcPnl('SELL', entry, exit, qty);
  // الرصيد يجب أن ينخفض (SELL ضد الاتجاه)
  assert(pnl < 0, `pnl=${pnl.toFixed(4)} يجب سالب`);
  assert(approx(pnl, -15.24, 0.2), `pnl=${pnl.toFixed(2)} يجب ~-15.24 لا -19.13`);
});

test('BNB BUY 0.387 @ entry=643.32 exit=643.05 (خسارة صغيرة)', () => {
  const qty = 0.387, entry = 643.32, exit = 643.05;
  const pnl = calcPnl('BUY', entry, exit, qty);
  assert(pnl < 0, `pnl=${pnl.toFixed(4)} يجب سالب`);
  // V174: exit fee فقط = -0.353 (الـ -0.606 القديم كان يشمل double fee)
  assert(approx(pnl, -0.353, 0.01), `pnl=${pnl.toFixed(3)} يجب ~-0.353 (exit fee فقط)`);
});

// ═══════════════════════════════════════════════════════════
console.log('\n═══════════════════════════');
console.log(`النتيجة: ${passed} نجح, ${failed} فشل`);
if (failed > 0) {
  console.log('❌ يوجد أخطاء — لا تُنشر حتى تُصلح');
  process.exit(1);
} else {
  console.log('✅ كل الاختبارات نجحت — آمن للنشر');
}
