import { Module } from '@nestjs/common';
import { ExchangeController } from './exchange.controller';
import { ExchangeService } from './exchange.service';
import { TwelveDataAdapter } from './adapters/twelve-data.adapter';

@Module({
  controllers: [ExchangeController],
  providers: [
    ExchangeService,
    {
      provide: 'IExchangeAdapter',
      useClass: TwelveDataAdapter,
    },
  ],
  exports: [ExchangeService],
})
export class ExchangeModule {}
