import { Module, forwardRef } from '@nestjs/common';
import { SignalController } from './signal.controller';
import { SignalService } from './signal.service';
import { ExchangeModule } from '../exchange/exchange.module';
import { AiModule } from '../ai/ai.module';
import { AuditModule } from '../../audit/audit.module';
import { PredictionMarketModule } from '../prediction-market/prediction-market.module';
import { TradingModule } from '../trading/trading.module';

/**
 * Signal Module — Trading Signal Generation with Prediction Market Integration
 *
 * Imports PredictionMarketModule (optional, via forwardRef) to enable:
 * - signalBoost: confidence adjustment based on prediction market gaps
 * - Prediction context appended to signal reasons
 * - Fallback: signals generated normally if prediction market is unavailable
 *
 * FIX: Also imports TradingModule (via forwardRef) to enable signal execution.
 * Previously, signals were generated but couldn't be directly executed.
 * Now, POST /api/signals/:id/execute bridges the Analysis → Trading pipeline.
 */
@Module({
  imports: [
    ExchangeModule,
    AiModule,
    AuditModule,
    forwardRef(() => PredictionMarketModule),
    forwardRef(() => TradingModule),
  ],
  controllers: [SignalController],
  providers: [SignalService],
  exports: [SignalService],
})
export class SignalModule {}
