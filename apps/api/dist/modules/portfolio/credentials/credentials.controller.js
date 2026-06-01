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
var CredentialsController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CredentialsController = void 0;
const common_1 = require("@nestjs/common");
const credentials_service_1 = require("./credentials.service");
const auth_guard_1 = require("../../../common/guards/auth.guard");
const throttler_1 = require("@nestjs/throttler");
const class_validator_1 = require("class-validator");
class AddCredentialDto {
}
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], AddCredentialDto.prototype, "exchange", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], AddCredentialDto.prototype, "label", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], AddCredentialDto.prototype, "apiKey", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], AddCredentialDto.prototype, "apiSecret", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], AddCredentialDto.prototype, "passphrase", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], AddCredentialDto.prototype, "testnet", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], AddCredentialDto.prototype, "keyType", void 0);
let CredentialsController = CredentialsController_1 = class CredentialsController {
    constructor(credentialsService) {
        this.credentialsService = credentialsService;
        this.logger = new common_1.Logger(CredentialsController_1.name);
    }
    assertRealUser(req) {
        const user = req.user;
        const email = String(user?.email || '');
        const id = String(user?.id || '');
        const isGuest = !id ||
            id.startsWith('guest') ||
            email === 'guest@roua.auto' ||
            /^guest-[a-f0-9]+@roua\.auto$/.test(email);
        if (isGuest) {
            throw new common_1.ForbiddenException('يجب تسجيل الدخول بحساب حقيقي لربط مفاتيح البورصة أو عرض أرصدتها');
        }
    }
    async getCredentials(req) {
        this.assertRealUser(req);
        const credentials = await this.credentialsService.getUserCredentials(req.user.id);
        return { success: true, data: credentials };
    }
    async updateCredential(credentialId, req, body) {
        this.assertRealUser(req);
        try {
            const credential = await this.credentialsService.updateCredential(req.user.id, credentialId, body, req.ip, req.headers['user-agent']);
            return { success: true, data: credential };
        }
        catch (error) {
            if (error.constructor && error.constructor.name && error.constructor.name.endsWith('Exception')) {
                throw error;
            }
            this.logger.error(`Unexpected error in updateCredential: ${error.message}`, error.stack);
            throw new common_1.BadRequestException(`خطأ في تحديث المفتاح: ${error.message || 'خطأ غير معروف'}`);
        }
    }
    async addCredential(req, body) {
        this.assertRealUser(req);
        if (!body.exchange || !body.label || !body.apiKey || !body.apiSecret) {
            throw new common_1.BadRequestException('جميع الحقول مطلوبة');
        }
        try {
            const credential = await this.credentialsService.addCredential(req.user.id, body, req.ip, req.headers['user-agent']);
            return { success: true, data: credential };
        }
        catch (error) {
            if (error.constructor && error.constructor.name && error.constructor.name.endsWith('Exception')) {
                throw error;
            }
            this.logger.error(`Unexpected error in addCredential: ${error.message}`, error.stack);
            throw new common_1.BadRequestException(`خطأ في التحقق من المفتاح: ${error.message || 'خطأ غير معروف'}`);
        }
    }
    async getBalances(req) {
        this.assertRealUser(req);
        try {
            const balances = await this.credentialsService.fetchAllExchangeBalances(req.user.id);
            return { success: true, data: balances };
        }
        catch (error) {
            this.logger.error(`Failed to fetch balances for user ${req.user.id}: ${error.message}`, error.stack);
            throw new common_1.BadRequestException(`فشل في جلب الأرصدة: ${error.message || 'خطأ غير معروف'}`);
        }
    }
    async deleteCredential(req, id) {
        this.assertRealUser(req);
        await this.credentialsService.deleteCredential(req.user.id, id, req.ip, req.headers['user-agent']);
        return { success: true };
    }
    async getServerIp() {
        try {
            const ip = await this.credentialsService.getServerOutboundIp();
            return {
                success: true,
                data: {
                    serverIp: ip,
                    instructions: {
                        en: `Add ${ip} to your Binance API key IP whitelist: Binance → API Management → Edit Key → IP Access Restrictions → Add IP`,
                        ar: `أضف ${ip} إلى القائمة البيضاء لعنوان IP في مفتاح Binance API: Binance → إدارة API → تعديل المفتاح → قيود وصول IP → إضافة IP`,
                    },
                },
            };
        }
        catch (error) {
            return {
                success: false,
                data: { serverIp: 'unknown', error: error.message },
            };
        }
    }
    async testConnectivity(req) {
        this.assertRealUser(req);
        const userId = req.user?.id;
        const results = await Promise.allSettled([
            this.credentialsService.testExchangeConnectivity('binance', userId),
        ]);
        const connectivity = results.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason?.message || 'Unknown error' });
        let credentialsStatus = { count: 0, details: [] };
        if (userId) {
            try {
                const creds = await this.credentialsService.prisma.exchangeCredential.findMany({
                    where: { userId },
                    select: { id: true, exchange: true, label: true, isValid: true, testnet: true, createdAt: true },
                });
                credentialsStatus = {
                    count: creds.length,
                    details: creds.map(c => ({
                        exchange: c.exchange,
                        label: c.label,
                        isValid: c.isValid,
                        testnet: c.testnet,
                        createdAt: c.createdAt,
                    })),
                };
            }
            catch { }
        }
        return {
            success: true,
            data: {
                serverTime: new Date().toISOString(),
                serverUptime: Math.round(process.uptime()),
                connectivity,
                credentialsStatus,
            },
        };
    }
};
exports.CredentialsController = CredentialsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CredentialsController.prototype, "getCredentials", null);
__decorate([
    (0, common_1.Put)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Request)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], CredentialsController.prototype, "updateCredential", null);
__decorate([
    (0, common_1.Post)(),
    (0, throttler_1.Throttle)({ default: { limit: 5, ttl: 60000 } }),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, AddCredentialDto]),
    __metadata("design:returntype", Promise)
], CredentialsController.prototype, "addCredential", null);
__decorate([
    (0, common_1.Get)('balances'),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60000 } }),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CredentialsController.prototype, "getBalances", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], CredentialsController.prototype, "deleteCredential", null);
__decorate([
    (0, common_1.Get)('server-ip'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], CredentialsController.prototype, "getServerIp", null);
__decorate([
    (0, common_1.Get)('test-connectivity'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CredentialsController.prototype, "testConnectivity", null);
exports.CredentialsController = CredentialsController = CredentialsController_1 = __decorate([
    (0, common_1.Controller)('portfolio/credentials'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [credentials_service_1.CredentialsService])
], CredentialsController);
//# sourceMappingURL=credentials.controller.js.map