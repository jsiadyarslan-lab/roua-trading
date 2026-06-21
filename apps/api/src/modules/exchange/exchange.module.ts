import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ExchangeController } from './exchange.controller';
import { OandaStreamController } from './oanda-stream.controller';
import { ExchangeService } from './exchange.service';
import { ExchangeGateway } from './gateway/exchange.gateway';
import { TwelveDataAdapter } from './adapters/twelve-data.adapter';
import { BinanceAdapter } from './adapters/binance.adapter';
import { FreeFallbackAdapter } from './adapters/free-fallback.adapter';
import { OandaAdapter } from './adapters/oanda.adapter';
import { OandaStreamingService } from './adapters/oanda-streaming.service';
import { IExchangeAdapter } from './exchange.types';

@Module({
  imports: [ConfigModule],
  controllers: [ExchangeController, OandaStreamController],
  providers: [
    ExchangeService,
    ExchangeGateway,
    // Register all adapters — ExchangeService uses them by source
    TwelveDataAdapter,
    BinanceAdapter,
    FreeFallbackAdapter,
    OandaAdapter,
    OandaStreamingService, // V355: Real-time OANDA price stream
    {
      provide: 'EXCHANGE_ADAPTERS',
      useFactory: (
        twelveData: TwelveDataAdapter,
        binance: BinanceAdapter,
        freeFallback: FreeFallbackAdapter,
        oanda: OandaAdapter,
      ) => {
        const adapters: Record<string, IExchangeAdapter> = {};
        adapters[twelveData.name] = twelveData;
        adapters[binance.name] = binance;
        adapters[freeFallback.name] = freeFallback;
        adapters[oanda.name] = oanda;
        return adapters;
      },
      inject: [TwelveDataAdapter, BinanceAdapter, FreeFallbackAdapter, OandaAdapter],
    },
  ],
  exports: [ExchangeService, ExchangeGateway, OandaStreamingService],
})
export class ExchangeModule {}
