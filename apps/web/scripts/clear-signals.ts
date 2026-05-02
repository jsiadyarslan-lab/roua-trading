import { PrismaClient } from '@prisma/client'
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
