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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScheduleContentDto = exports.GetContentFeedDto = exports.BulkGenerateDto = exports.UpdateContentDto = exports.GenerateContentDto = exports.ContentAgentStatus = exports.ContentPriority = exports.GenerationSource = exports.ContentLanguage = exports.ContentCategory = exports.ContentType = exports.ContentStatus = void 0;
var ContentStatus;
(function (ContentStatus) {
    ContentStatus["DRAFT"] = "DRAFT";
    ContentStatus["IN_REVIEW"] = "IN_REVIEW";
    ContentStatus["APPROVED"] = "APPROVED";
    ContentStatus["PUBLISHED"] = "PUBLISHED";
    ContentStatus["SCHEDULED"] = "SCHEDULED";
    ContentStatus["ARCHIVED"] = "ARCHIVED";
    ContentStatus["REJECTED"] = "REJECTED";
})(ContentStatus || (exports.ContentStatus = ContentStatus = {}));
var ContentType;
(function (ContentType) {
    ContentType["ARTICLE"] = "ARTICLE";
    ContentType["ANALYSIS"] = "ANALYSIS";
    ContentType["NEWS_DIGEST"] = "NEWS_DIGEST";
    ContentType["MARKET_REPORT"] = "MARKET_REPORT";
    ContentType["EDUCATIONAL"] = "EDUCATIONAL";
    ContentType["OPINION"] = "OPINION";
    ContentType["BREAKING"] = "BREAKING";
    ContentType["HOURLY_UPDATE"] = "HOURLY_UPDATE";
    ContentType["WEEKLY_REVIEW"] = "WEEKLY_REVIEW";
    ContentType["PAIR_ANALYSIS"] = "PAIR_ANALYSIS";
})(ContentType || (exports.ContentType = ContentType = {}));
var ContentCategory;
(function (ContentCategory) {
    ContentCategory["CRYPTO"] = "CRYPTO";
    ContentCategory["FOREX"] = "FOREX";
    ContentCategory["STOCKS"] = "STOCKS";
    ContentCategory["COMMODITIES"] = "COMMODITIES";
    ContentCategory["ECONOMY"] = "ECONOMY";
    ContentCategory["REGULATION"] = "REGULATION";
    ContentCategory["TECHNOLOGY"] = "TECHNOLOGY";
    ContentCategory["EDUCATION"] = "EDUCATION";
    ContentCategory["GEOPOLITICS"] = "GEOPOLITICS";
    ContentCategory["DEFI"] = "DEFI";
    ContentCategory["NFT"] = "NFT";
})(ContentCategory || (exports.ContentCategory = ContentCategory = {}));
var ContentLanguage;
(function (ContentLanguage) {
    ContentLanguage["AR"] = "AR";
    ContentLanguage["EN"] = "EN";
    ContentLanguage["BILINGUAL"] = "BILINGUAL";
})(ContentLanguage || (exports.ContentLanguage = ContentLanguage = {}));
var GenerationSource;
(function (GenerationSource) {
    GenerationSource["AI_GENERATED"] = "AI_GENERATED";
    GenerationSource["AI_CURATED"] = "AI_CURATED";
    GenerationSource["HUMAN_WRITTEN"] = "HUMAN_WRITTEN";
    GenerationSource["AI_ASSISTED"] = "AI_ASSISTED";
    GenerationSource["RSS_FEED"] = "RSS_FEED";
    GenerationSource["API_FEED"] = "API_FEED";
})(GenerationSource || (exports.GenerationSource = GenerationSource = {}));
var ContentPriority;
(function (ContentPriority) {
    ContentPriority["URGENT"] = "URGENT";
    ContentPriority["HIGH"] = "HIGH";
    ContentPriority["NORMAL"] = "NORMAL";
    ContentPriority["LOW"] = "LOW";
})(ContentPriority || (exports.ContentPriority = ContentPriority = {}));
var ContentAgentStatus;
(function (ContentAgentStatus) {
    ContentAgentStatus["IDLE"] = "IDLE";
    ContentAgentStatus["GENERATING"] = "GENERATING";
    ContentAgentStatus["PUBLISHING"] = "PUBLISHING";
    ContentAgentStatus["CURATING"] = "CURATING";
    ContentAgentStatus["PAUSED"] = "PAUSED";
    ContentAgentStatus["ERROR"] = "ERROR";
})(ContentAgentStatus || (exports.ContentAgentStatus = ContentAgentStatus = {}));
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class GenerateContentDto {
}
exports.GenerateContentDto = GenerateContentDto;
__decorate([
    (0, class_validator_1.IsEnum)(ContentType),
    __metadata("design:type", String)
], GenerateContentDto.prototype, "type", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(ContentCategory),
    __metadata("design:type", String)
], GenerateContentDto.prototype, "category", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GenerateContentDto.prototype, "topic", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], GenerateContentDto.prototype, "symbols", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(ContentLanguage),
    __metadata("design:type", String)
], GenerateContentDto.prototype, "language", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(ContentPriority),
    __metadata("design:type", String)
], GenerateContentDto.prototype, "priority", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], GenerateContentDto.prototype, "aiConfig", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", Date)
], GenerateContentDto.prototype, "scheduledAt", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], GenerateContentDto.prototype, "tags", void 0);
class UpdateContentDto {
}
exports.UpdateContentDto = UpdateContentDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateContentDto.prototype, "titleAr", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateContentDto.prototype, "titleEn", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateContentDto.prototype, "contentAr", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateContentDto.prototype, "contentEn", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(ContentStatus),
    __metadata("design:type", String)
], UpdateContentDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], UpdateContentDto.prototype, "tags", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", Date)
], UpdateContentDto.prototype, "scheduledAt", void 0);
class BulkGenerateDto {
}
exports.BulkGenerateDto = BulkGenerateDto;
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => Object),
    __metadata("design:type", Array)
], BulkGenerateDto.prototype, "requests", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], BulkGenerateDto.prototype, "publishImmediately", void 0);
class GetContentFeedDto {
}
exports.GetContentFeedDto = GetContentFeedDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(ContentCategory),
    __metadata("design:type", String)
], GetContentFeedDto.prototype, "category", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(ContentType),
    __metadata("design:type", String)
], GetContentFeedDto.prototype, "type", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(ContentLanguage),
    __metadata("design:type", String)
], GetContentFeedDto.prototype, "language", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(ContentStatus),
    __metadata("design:type", String)
], GetContentFeedDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], GetContentFeedDto.prototype, "page", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], GetContentFeedDto.prototype, "limit", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GetContentFeedDto.prototype, "symbol", void 0);
class ScheduleContentDto {
}
exports.ScheduleContentDto = ScheduleContentDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ScheduleContentDto.prototype, "contentId", void 0);
__decorate([
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", Date)
], ScheduleContentDto.prototype, "scheduledAt", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ScheduleContentDto.prototype, "platform", void 0);
//# sourceMappingURL=content.types.js.map