import { PrismaClient } from '@prisma/client'

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
