import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { PrismaExtensionService } from './prisma-extension.service';

@Global()
@Module({
  providers: [PrismaService, PrismaExtensionService],
  exports: [PrismaService, PrismaExtensionService],
})
export class PrismaModule {}
