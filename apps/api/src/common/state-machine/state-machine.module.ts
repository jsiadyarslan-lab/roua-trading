import { Module, Global } from '@nestjs/common';
import { PositionStateMachine } from './position-state-machine.service';

/**
 * V341: Position State Machine module.
 * Global so any service can inject PositionStateMachine without importing this module.
 */
@Global()
@Module({
  providers: [PositionStateMachine],
  exports: [PositionStateMachine],
})
export class StateMachineModule {}
