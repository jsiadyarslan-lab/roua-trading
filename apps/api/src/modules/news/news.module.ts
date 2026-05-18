import { Module } from '@nestjs/common';
import { NewsController } from './news.controller';
import { NewsService } from './news.service';
import { NewsIntegrationService } from './news-integration.service';
import { AiModule } from '../ai/ai.module';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { RedisModule } from '../../common/redis/redis.module';

@Module({
  imports: [PrismaModule, AiModule, RedisModule],
  controllers: [NewsController],
  providers: [NewsService, NewsIntegrationService],
  exports: [NewsService, NewsIntegrationService],
})
export class NewsModule {}
