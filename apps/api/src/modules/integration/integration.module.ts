// ─── Integration Module V1 ────────────────────────────────
// NestJS module for cross-platform integration with Roua News.
// Provides authenticated endpoints for chart data, signals, and market data.

import { Module } from '@nestjs/common';
import { IntegrationController } from './integration.controller';
import { IntegrationGuard } from '../../common/guards/integration.guard';
import { ExchangeModule } from '../exchange/exchange.module';
import { SignalModule } from '../signal/signal.module';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { ContentAgentModule } from '../../agents/content/content-agent.module';

@Module({
  imports: [
    ExchangeModule,
    SignalModule,
    PrismaModule,
    ContentAgentModule,
  ],
  controllers: [IntegrationController],
  providers: [IntegrationGuard],
  exports: [IntegrationGuard],
})
export class IntegrationModule {}
