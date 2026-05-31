const { PrismaClient } = require('@prisma/client');

// Limit connection pool for standalone scripts to avoid "too many clients" on Railway
try {
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set('connection_limit', '1');
  url.searchParams.set('pool_timeout', '5');
  url.searchParams.set('connect_timeout', '5');
  process.env.DATABASE_URL = url.toString();
} catch (_e) {
  process.env.DATABASE_URL += '&connection_limit=1&pool_timeout=5&connect_timeout=5';
}

const prisma = new PrismaClient();

async function main() {
  const logs = await prisma.auditLog.findMany({
    where: { action: 'CREDENTIAL_VALIDATE_FAILED' },
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log(JSON.stringify(logs, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
