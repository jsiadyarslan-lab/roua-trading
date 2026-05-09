const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const logs = await prisma.auditLog.findMany({
    where: { action: 'CREDENTIAL_VALIDATE_FAILED' },
    orderBy: { createdAt: 'desc' },
    take: 3
  });
  console.log(JSON.stringify(logs, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
