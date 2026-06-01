"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var EngineController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EngineController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../../common/guards/auth.guard");
const throttler_1 = require("@nestjs/throttler");
const market_scanner_service_1 = require("./services/market-scanner.service");
const position_monitor_service_1 = require("./services/position-monitor.service");
const market_broadcaster_service_1 = require("./services/market-broadcaster.service");
let EngineController = EngineController_1 = class EngineController {
    constructor(scanner, monitor, broadcaster) {
        this.scanner = scanner;
        this.monitor = monitor;
        this.broadcaster = broadcaster;
        this.logger = new common_1.Logger(EngineController_1.name);
        this.logger.log('⚙️ Engine Controller initialized (infrastructure-only)');
    }
    async getEngineHealth() {
        try {
            const [lastScan, monitorStatus, trackedSymbols,] = await Promise.all([
                this.scanner.getLastScan(),
                this.monitor.getMonitorStatus(),
                this.broadcaster.getTrackedSymbols(),
            ]);
            return {
                success: true,
                data: {
                    engines: {
                        scanner: {
                            status: lastScan ? 'active' : 'idle',
                            lastScan,
                        },
                        monitor: {
                            status: monitorStatus.openPositions > 0 ? 'active' : 'idle',
                            ...monitorStatus,
                        },
                        broadcaster: {
                            status: trackedSymbols.length > 0 ? 'active' : 'idle',
                            trackedSymbols: trackedSymbols.length,
                        },
                    },
                    _migration: {
                        bot: 'Moved to /api/smart-executor/*',
                        council: 'Moved to /api/strategic-council/*',
                    },
                    timestamp: new Date().toISOString(),
                },
            };
        }
        catch (error) {
            this.logger.error(`Engine health check failed: ${error.message}`, error.stack);
            throw new common_1.InternalServerErrorException('فشل في فحص حالة المحرك');
        }
    }
    async runManualScan(req, body) {
        const result = await this.scanner.forceScan(req.user.id, body?.symbols);
        return { success: true, data: result };
    }
    async getLastScan() {
        const result = await this.scanner.getLastScan();
        return { success: true, data: result };
    }
    async getMonitorStatus() {
        const status = await this.monitor.getMonitorStatus();
        return { success: true, data: status };
    }
    async getCachedQuotes() {
        const quotes = await this.broadcaster.getAllCachedQuotes();
        return { success: true, data: quotes };
    }
    async trackSymbol(body) {
        if (!body.symbol) {
            return { success: false, message: 'Symbol is required' };
        }
        this.broadcaster.trackSymbol(body.symbol);
        return {
            success: true,
            message: `Now tracking: ${body.symbol}`,
            tracked: this.broadcaster.getTrackedSymbols(),
        };
    }
};
exports.EngineController = EngineController;
__decorate([
    (0, common_1.Get)('health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], EngineController.prototype, "getEngineHealth", null);
__decorate([
    (0, common_1.Post)('scanner/run'),
    (0, throttler_1.Throttle)({ default: { limit: 3, ttl: 60000 } }),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], EngineController.prototype, "runManualScan", null);
__decorate([
    (0, common_1.Get)('scanner/last'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], EngineController.prototype, "getLastScan", null);
__decorate([
    (0, common_1.Get)('monitor/status'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], EngineController.prototype, "getMonitorStatus", null);
__decorate([
    (0, common_1.Get)('broadcaster/quotes'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], EngineController.prototype, "getCachedQuotes", null);
__decorate([
    (0, common_1.Post)('broadcaster/track'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], EngineController.prototype, "trackSymbol", null);
exports.EngineController = EngineController = EngineController_1 = __decorate([
    (0, common_1.Controller)('engine'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [market_scanner_service_1.MarketScannerService,
        position_monitor_service_1.PositionMonitorService,
        market_broadcaster_service_1.MarketBroadcasterService])
], EngineController);
//# sourceMappingURL=engine.controller.js.map