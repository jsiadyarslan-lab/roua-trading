const fs = require('fs');
const path = require('path');

// Manually load .env from root
try {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        process.env[key] = value;
      }
    });
    console.log('✅ Loaded .env file');
  }
} catch (err) {
  console.warn('⚠️ Could not load .env file:', err.message);
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanup() {
  console.log('🛡️ Starting Guest User Cleanup (JS version)...');

  const now = new Date();

  try {
    // 1. Find all guest users
    const guests = await prisma.user.findMany({
      where: {
        OR: [
          { email: { startsWith: 'guest-' } },
          { email: 'guest@roua.auto' },
          { id: { startsWith: 'guest-' } }
        ]
      },
      include: {
        sessions: true
      }
    });

    console.log(`🔍 Found ${guests.length} total guest users.`);

    let deletedCount = 0;
    let skippedCount = 0;

    for (const guest of guests) {
      const hasActiveSession = guest.sessions.some(s => s.isActive && s.expiresAt > now);

      if (!hasActiveSession) {
        try {
          // Delete dependent records first if they aren't cascade deleted
          await prisma.session.deleteMany({ where: { userId: guest.id } });
          await prisma.position.deleteMany({ where: { userId: guest.id } });
          await prisma.trade.deleteMany({ where: { userId: guest.id } });
          await prisma.auditLog.deleteMany({ where: { userId: guest.id } });
          
          await prisma.user.delete({ where: { id: guest.id } });
          deletedCount++;
          if (deletedCount % 100 === 0) console.log(`...deleted ${deletedCount} users`);
        } catch (err) {
          console.error(`❌ Failed to delete guest ${guest.id}: ${err.message}`);
        }
      } else {
        skippedCount++;
      }
    }

    console.log(`✅ Cleanup Complete:`);
    console.log(`🗑️ Deleted: ${deletedCount} orphaned guests`);
    console.log(`⏳ Skipped: ${skippedCount} guests with active sessions`);
  } catch (globalErr) {
    console.error('💥 Global error during cleanup:', globalErr);
  }
}

cleanup()
  .catch(e => {
    console.error('💥 Cleanup crashed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
