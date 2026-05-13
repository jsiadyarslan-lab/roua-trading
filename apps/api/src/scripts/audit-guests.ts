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

async function main() {
  const prisma = new PrismaClient()
  
  try {
    const totalUsers = await prisma.user.count()
    const guestUsers = await prisma.user.count({
      where: {
        email: {
          contains: 'guest'
        }
      }
    })
    
    const recentGuests = await prisma.user.findMany({
      where: {
        email: {
          contains: 'guest'
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 20
    })
    
    const creationStats = await prisma.$queryRaw`
      SELECT 
        DATE_TRUNC('hour', "createdAt") as hour, 
        COUNT(*) as count 
      FROM "User" 
      WHERE email LIKE '%guest%' 
      GROUP BY hour 
      ORDER BY hour DESC 
      LIMIT 24
    `

    console.log(JSON.stringify({
      totalUsers,
      guestUsers,
      recentGuests,
      creationStats
    }, null, 2))
  } catch (error) {
    console.error(error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
