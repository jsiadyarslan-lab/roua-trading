import { Module } from '@nestjs/common';
import { TradingController } from './trading.controller';
import { TradingService } from './trading.service';
import { RiskManagerService } from './risk-manager.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { ExchangeModule } from '../exchange/exchange.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { AuditModule } from '../../audit/audit.module';

@Module({
  imports: [
    PrismaModule,
    ExchangeModule,
    PortfolioModule,
    AuditModule,
  ],
  controllers: [TradingController],
  providers: [TradingService, RiskManagerService],
  exports: [TradingService, RiskManagerService],
})
export class TradingModule {}
