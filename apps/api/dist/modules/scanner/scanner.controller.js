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
var ScannerController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScannerController = void 0;
const common_1 = require("@nestjs/common");
const scanner_service_1 = require("./scanner.service");
const scanner_types_1 = require("./scanner.types");
const auth_guard_1 = require("../../common/guards/auth.guard");
let ScannerController = ScannerController_1 = class ScannerController {
    constructor(scannerService) {
        this.scannerService = scannerService;
        this.logger = new common_1.Logger(ScannerController_1.name);
    }
    async fullScan(timeframe, category) {
        const tf = ['15min', '1h', '4h', '1day'].includes(timeframe || '') ? timeframe : '1h';
        const cat = Object.values(scanner_types_1.MarketCategory).includes(category)
            ? category
            : undefined;
        try {
            return await this.scannerService.fullScan(tf, cat);
        }
        catch (error) {
            this.logger.error(`Full scan failed: ${error.message}`, error.stack);
            throw new common_1.InternalServerErrorException('فشل في إجراء المسح الكامل للسوق');
        }
    }
    async heatmap(category) {
        const cat = Object.values(scanner_types_1.MarketCategory).includes(category)
            ? category
            : undefined;
        try {
            return await this.scannerService.heatmapData(cat);
        }
        catch (error) {
            this.logger.error(`Heatmap failed: ${error.message}`, error.stack);
            throw new common_1.InternalServerErrorException('فشل في جلب بيانات خريطة الحرارة');
        }
    }
    async deepAnalysis(symbol) {
        try {
            return await this.scannerService.deepAnalysis(symbol);
        }
        catch (error) {
            this.logger.error(`Deep analysis failed for ${symbol}: ${error.message}`, error.stack);
            throw new common_1.InternalServerErrorException(`فشل في تحليل ${symbol}`);
        }
    }
    async multiTimeframeAnalysis(symbol) {
        try {
            return await this.scannerService.multiTimeframeAnalysis(symbol);
        }
        catch (error) {
            this.logger.error(`Multi-TF analysis failed for ${symbol}: ${error.message}`, error.stack);
            throw new common_1.InternalServerErrorException(`فشل في التحليل متعدد الأطر الزمنية لـ ${symbol}`);
        }
    }
    async marketOverview() {
        try {
            return await this.scannerService.marketOverview();
        }
        catch (error) {
            this.logger.error(`Market overview failed: ${error.message}`, error.stack);
            throw new common_1.InternalServerErrorException('فشل في جلب نظرة عامة على السوق');
        }
    }
    async forceScan(req, timeframe, category) {
        const tf = ['15min', '1h', '4h', '1day'].includes(timeframe || '') ? timeframe : '1h';
        const cat = Object.values(scanner_types_1.MarketCategory).includes(category)
            ? category
            : undefined;
        try {
            await this.scannerService.invalidateCache(tf, cat);
            return await this.scannerService.fullScan(tf, cat);
        }
        catch (error) {
            this.logger.error(`Force scan failed: ${error.message}`, error.stack);
            throw new common_1.InternalServerErrorException('فشل في إجراء المسح الإجباري');
        }
    }
};
exports.ScannerController = ScannerController;
__decorate([
    (0, auth_guard_1.Public)(),
    (0, common_1.Get)('scan'),
    __param(0, (0, common_1.Query)('timeframe')),
    __param(1, (0, common_1.Query)('category')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ScannerController.prototype, "fullScan", null);
__decorate([
    (0, auth_guard_1.Public)(),
    (0, common_1.Get)('heatmap'),
    __param(0, (0, common_1.Query)('category')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ScannerController.prototype, "heatmap", null);
__decorate([
    (0, auth_guard_1.Public)(),
    (0, common_1.Get)('analysis/:symbol'),
    __param(0, (0, common_1.Param)('symbol')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ScannerController.prototype, "deepAnalysis", null);
__decorate([
    (0, auth_guard_1.Public)(),
    (0, common_1.Get)('multi-tf/:symbol'),
    __param(0, (0, common_1.Param)('symbol')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ScannerController.prototype, "multiTimeframeAnalysis", null);
__decorate([
    (0, auth_guard_1.Public)(),
    (0, common_1.Get)('overview'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ScannerController.prototype, "marketOverview", null);
__decorate([
    (0, common_1.Post)('run'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('timeframe')),
    __param(2, (0, common_1.Query)('category')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], ScannerController.prototype, "forceScan", null);
exports.ScannerController = ScannerController = ScannerController_1 = __decorate([
    (0, common_1.Controller)('scanner'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [scanner_service_1.ScannerService])
], ScannerController);
//# sourceMappingURL=scanner.controller.js.map