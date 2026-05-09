import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanup() {
  console.log('🛡️ Starting Guest User Cleanup...');

  const now = new Date();

  // 1. Find all guest users (emails starting with guest- or equal to guest@roua.auto)
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
    // Check if user has any ACTIVE and NOT EXPIRED sessions
    const hasActiveSession = guest.sessions.some(s => s.isActive && s.expiresAt > now);

    if (!hasActiveSession) {
      // User has no active sessions — safe to delete
      try {
        // Delete sessions first (due to FK constraints if not cascade)
        await prisma.session.deleteMany({ where: { userId: guest.id } });
        // Delete user
        await prisma.user.delete({ where: { id: guest.id } });
        deletedCount++;
      } catch (err: any) {
        console.error(`❌ Failed to delete guest ${guest.id}: ${err.message}`);
      }
    } else {
      skippedCount++;
    }
  }

  console.log(`✅ Cleanup Complete:`);
  console.log(`🗑️ Deleted: ${deletedCount} orphaned guests`);
  console.log(`⏳ Skipped: ${skippedCount} guests with active sessions`);
}

cleanup()
  .catch(e => {
    console.error('💥 Cleanup crashed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
