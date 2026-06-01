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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentAgentController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../../common/guards/auth.guard");
const content_agent_service_1 = require("./content-agent.service");
const content_types_1 = require("./types/content.types");
let ContentAgentController = class ContentAgentController {
    constructor(contentAgent) {
        this.contentAgent = contentAgent;
    }
    async generateContent(req, dto) {
        const result = await this.contentAgent.generateContent(req.user.id, dto);
        return {
            success: true,
            data: {
                article: result.article,
                qualityScore: result.content.qualityScore,
                optimization: result.optimization,
            },
            message: `تم توليد المحتوى بنجاح — الجودة: ${result.content.qualityScore}%`,
        };
    }
    async bulkGenerate(req, dto) {
        const result = await this.contentAgent.bulkGenerate(req.user.id, dto);
        const successCount = result.results.filter(r => r.success).length;
        return {
            success: true,
            data: result.results,
            message: `تم توليد ${successCount}/${result.results.length} محتوى بنجاح`,
        };
    }
    async generateBreakingAlert(req, body) {
        const result = await this.contentAgent.generateBreakingAlert(req.user.id, body.topic, body.symbols || [], body.context || '');
        return {
            success: true,
            data: result.article,
            message: 'تم نشر التنبيه العاجل',
        };
    }
    async getFeed(query) {
        const result = await this.contentAgent.getContentFeed(query);
        return {
            success: true,
            data: result,
        };
    }
    async getStats() {
        const stats = await this.contentAgent.getStats();
        return {
            success: true,
            data: stats,
        };
    }
    async getTrending() {
        const topics = await this.contentAgent.curator.getTrendingTopics();
        return {
            success: true,
            data: topics,
        };
    }
    async getGaps() {
        const gaps = await this.contentAgent.curator.getContentGaps();
        return {
            success: true,
            data: gaps,
        };
    }
    async getState() {
        const state = await this.contentAgent.getState();
        return {
            success: true,
            data: state,
        };
    }
    async cleanupErrors() {
        const result = await this.contentAgent.publisher.cleanupErrorArticles();
        return {
            success: true,
            data: result,
            message: result.archived > 0
                ? `تم أرشفة ${result.archived} مقالة تحتوي على أخطاء`
                : 'لا توجد مقالات خاطئة للأرشفة',
        };
    }
    async getById(id) {
        const article = await this.contentAgent.getContentById(id);
        return {
            success: true,
            data: article,
        };
    }
    async publish(req, id) {
        const result = await this.contentAgent.publishContent(req.user.id, id);
        return {
            success: true,
            data: result,
            message: 'تم نشر المحتوى بنجاح',
        };
    }
    async schedule(req, id, dto) {
        dto.contentId = id;
        const result = await this.contentAgent.scheduleContent(req.user.id, dto);
        return {
            success: true,
            data: result,
            message: `تم جدولة المحتوى للنشر في ${dto.scheduledAt}`,
        };
    }
    async update(req, id, dto) {
        const result = await this.contentAgent.updateContent(req.user.id, id, dto);
        return {
            success: true,
            data: result,
            message: 'تم تحديث المحتوى',
        };
    }
    async archive(req, id) {
        const result = await this.contentAgent.unpublishContent(req.user.id, id, true);
        return {
            success: true,
            data: result,
            message: 'تم أرشفة المحتوى',
        };
    }
};
exports.ContentAgentController = ContentAgentController;
__decorate([
    (0, common_1.Post)('generate'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, content_types_1.GenerateContentDto]),
    __metadata("design:returntype", Promise)
], ContentAgentController.prototype, "generateContent", null);
__decorate([
    (0, common_1.Post)('bulk-generate'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, content_types_1.BulkGenerateDto]),
    __metadata("design:returntype", Promise)
], ContentAgentController.prototype, "bulkGenerate", null);
__decorate([
    (0, common_1.Post)('breaking'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ContentAgentController.prototype, "generateBreakingAlert", null);
__decorate([
    (0, common_1.Get)('feed'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [content_types_1.GetContentFeedDto]),
    __metadata("design:returntype", Promise)
], ContentAgentController.prototype, "getFeed", null);
__decorate([
    (0, common_1.Get)('stats'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ContentAgentController.prototype, "getStats", null);
__decorate([
    (0, common_1.Get)('trending'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ContentAgentController.prototype, "getTrending", null);
__decorate([
    (0, common_1.Get)('gaps'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ContentAgentController.prototype, "getGaps", null);
__decorate([
    (0, common_1.Get)('state'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ContentAgentController.prototype, "getState", null);
__decorate([
    (0, common_1.Post)('cleanup-errors'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ContentAgentController.prototype, "cleanupErrors", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ContentAgentController.prototype, "getById", null);
__decorate([
    (0, common_1.Post)(':id/publish'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ContentAgentController.prototype, "publish", null);
__decorate([
    (0, common_1.Post)(':id/schedule'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, content_types_1.ScheduleContentDto]),
    __metadata("design:returntype", Promise)
], ContentAgentController.prototype, "schedule", null);
__decorate([
    (0, common_1.Put)(':id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, content_types_1.UpdateContentDto]),
    __metadata("design:returntype", Promise)
], ContentAgentController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], ContentAgentController.prototype, "archive", null);
exports.ContentAgentController = ContentAgentController = __decorate([
    (0, common_1.Controller)('agent/content'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [content_agent_service_1.ContentAgentService])
], ContentAgentController);
//# sourceMappingURL=content-agent.controller.js.map