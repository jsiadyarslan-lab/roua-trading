import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ExchangeController } from './exchange.controller';
import { ExchangeService } from './exchange.service';
import { ExchangeGateway } from './gateway/exchange.gateway';
import { TwelveDataAdapter } from './adapters/twelve-data.adapter';
import { BinanceAdapter } from './adapters/binance.adapter';
import { FreeFallbackAdapter } from './adapters/free-fallback.adapter';
import { IExchangeAdapter } from './exchange.types';

@Module({
  imports: [ConfigModule],
  controllers: [ExchangeController],
  providers: [
    ExchangeService,
    ExchangeGateway,
    // Register all adapters — ExchangeService uses them by source
    TwelveDataAdapter,
    BinanceAdapter,
    FreeFallbackAdapter,
    {
      provide: 'EXCHANGE_ADAPTERS',
      useFactory: (twelveData: TwelveDataAdapter, binance: BinanceAdapter, freeFallback: FreeFallbackAdapter) => {
        const adapters: Record<string, IExchangeAdapter> = {};
        adapters[twelveData.name] = twelveData;
        adapters[binance.name] = binance;
        adapters[freeFallback.name] = freeFallback;
        return adapters;
      },
      inject: [TwelveDataAdapter, BinanceAdapter, FreeFallbackAdapter],
    },
  ],
  exports: [ExchangeService, ExchangeGateway],
})
export class ExchangeModule {}
