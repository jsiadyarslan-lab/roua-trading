import { PrismaClient } from '@prisma/client'

// Limit connection pool for standalone scripts to avoid "too many clients" on Railway
try {
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set('connection_limit', '1');
  url.searchParams.set('pool_timeout', '5');
  url.searchParams.set('connect_timeout', '5');
  process.env.DATABASE_URL = url.toString();
} catch {
  process.env.DATABASE_URL += '&connection_limit=1&pool_timeout=5&connect_timeout=5';
}

const prisma = new PrismaClient()

async function main() {
  console.log('🗑 Clearing all signals from database...')
  const deleted = await prisma.signal.deleteMany({})
  console.log(`✅ Deleted ${deleted.count} signals.`)
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
