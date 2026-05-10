import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/cleanup-localstorage
 *
 * This endpoint returns JavaScript code to clean up localStorage.
 * User should copy this code and run it in browser console.
 */
export async function POST() {
  const cleanupCode = `
// ═══════════════════════════════════════════════════════════════
// CLEANUP SCRIPT: Clear Phantom Trades from localStorage
// ═══════════════════════════════════════════════════════════════

console.log('🔧 Starting localStorage cleanup...');

// Step 1: Clean up paper-trades stores
const paperTradeKeys = Object.keys(localStorage)
  .filter(key => key.startsWith('roua-paper-trades'));

console.log(\`🗑️ Found \${paperTradeKeys.length} paper-trades key(s)\`);
paperTradeKeys.forEach(key => {
  console.log(\`  Removing: \${key}\`);
  localStorage.removeItem(key);
});

// Step 2: Clean up positions stores
const positionKeys = Object.keys(localStorage)
  .filter(key => key.startsWith('roua-positions-store'));

console.log(\`🗑️ Found \${positionKeys.length} positions-store key(s)\`);
positionKeys.forEach(key => {
  console.log(\`  Removing: \${key}\`);
  localStorage.removeItem(key);
});

// Step 3: Clean up any other roua-* keys (optional)
const otherKeys = Object.keys(localStorage)
  .filter(key => key.startsWith('roua-') && 
                !key.startsWith('roua-paper-trades') && 
                !key.startsWith('roua-positions-store'));

if (otherKeys.length > 0) {
  console.log(\`🗑️ Found \${otherKeys.length} other roua key(s)\`);
  otherKeys.forEach(key => {
    console.log(\`  Removing: \${key}\`);
    localStorage.removeItem(key);
  });
}

console.log('✅ localStorage cleanup completed');
console.log('🔄 Reloading page to apply changes...');

// Reload page after 1 second
setTimeout(() => {
  location.reload();
}, 1000);
  `.trim();

  return NextResponse.json({
    success: true,
    message: 'Copy the code below and run it in browser console',
    code: cleanupCode,
  });
}
