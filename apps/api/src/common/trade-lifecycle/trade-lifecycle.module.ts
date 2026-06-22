import { Module, Global } from '@nestjs/common';
import { TradeLifecycleLogger } from './trade-lifecycle.logger';

/**
 * V339: Trade Lifecycle Logger module.
 * Global so any service can inject TradeLifecycleLogger without importing this module.
 */
@Global()
@Module({
  providers: [TradeLifecycleLogger],
  exports: [TradeLifecycleLogger],
})
export class TradeLifecycleModule {}
