import { Module, forwardRef } from '@nestjs/common';
import { SignalController } from './signal.controller';
import { SignalService } from './signal.service';
import { ExchangeModule } from '../exchange/exchange.module';
import { AiModule } from '../ai/ai.module';
import { AuditModule } from '../../audit/audit.module';
import { PredictionMarketModule } from '../prediction-market/prediction-market.module';
import { TradingModule } from '../trading/trading.module';
import { NotificationModule } from '../notification/notification.module';

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
 *
 * UX: Imports NotificationModule for real-time signal notifications.
 * When a new signal is generated, users receive an instant push notification
 * via Socket.IO with signal details, and can auto-execute if enabled.
 */
@Module({
  imports: [
    ExchangeModule,
    AiModule,
    AuditModule,
    forwardRef(() => PredictionMarketModule),
    forwardRef(() => TradingModule),
    forwardRef(() => NotificationModule),
  ],
  controllers: [SignalController],
  providers: [SignalService],
  exports: [SignalService],
})
export class SignalModule {}
