import { Module } from '@nestjs/common';
import { ExchangeController } from './exchange.controller';
import { ExchangeService } from './exchange.service';
import { ExchangeGateway } from './gateway/exchange.gateway';
import { TwelveDataAdapter } from './adapters/twelve-data.adapter';
import { BinanceAdapter } from './adapters/binance.adapter';
import { IExchangeAdapter } from './exchange.types';

@Module({
  controllers: [ExchangeController],
  providers: [
    ExchangeService,
    ExchangeGateway,
    // Register all adapters — ExchangeService uses them by source
    TwelveDataAdapter,
    BinanceAdapter,
    {
      provide: 'EXCHANGE_ADAPTERS',
      useFactory: (twelveData: TwelveDataAdapter, binance: BinanceAdapter) => {
        const adapters: Record<string, IExchangeAdapter> = {};
        adapters[twelveData.name] = twelveData;
        adapters[binance.name] = binance;
        return adapters;
      },
      inject: [TwelveDataAdapter, BinanceAdapter],
    },
  ],
  exports: [ExchangeService],
})
export class ExchangeModule {}
