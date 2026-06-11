import { Module } from '@nestjs/common';
import { MT5StreamingService } from './mt5-streaming.service';
import { MT5Gateway } from './mt5.gateway';
import { PrismaModule } from '../../../common/prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';

/**
 * V196: MT5 Streaming Module
 *
 * Provides real-time MetaAPI Cloud WebSocket streaming for MT5 accounts.
 *
 * This module is ADDITIVE — it does NOT replace the existing RPC/REST
 * approach in CredentialsService. If streaming is unavailable (e.g.,
 * METAAPI_TOKEN not set, connection failure), the system falls back
 * to the existing polling mechanism automatically.
 *
 * Components:
 *   - MT5StreamingService: Maintains persistent WebSocket connections to MetaAPI
 *   - MT5Gateway: Pushes real-time updates to frontend via Socket.IO /mt5 namespace
 */
@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [
    MT5StreamingService,
    MT5Gateway,
    {
      provide: 'MT5StreamingService',
      useExisting: MT5StreamingService,
    },
  ],
  exports: [MT5StreamingService, 'MT5StreamingService'],
})
export class MT5StreamingModule {}
