"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiModule = void 0;
const common_1 = require("@nestjs/common");
const ai_controller_1 = require("./ai.controller");
const ai_orchestrator_service_1 = require("./services/ai-orchestrator.service");
const groq_service_1 = require("./services/groq.service");
const glm_service_1 = require("./services/glm.service");
const gemini_service_1 = require("./services/gemini.service");
const huggingface_service_1 = require("./services/huggingface.service");
const ollama_service_1 = require("./services/ollama.service");
const bedrock_service_1 = require("./services/bedrock.service");
const openrouter_service_1 = require("./services/openrouter.service");
const deepseek_service_1 = require("./services/deepseek.service");
const cerebras_service_1 = require("./services/cerebras.service");
const mistral_service_1 = require("./services/mistral.service");
const nvidia_service_1 = require("./services/nvidia.service");
const embedding_service_1 = require("./services/embedding.service");
const rag_service_1 = require("./services/rag.service");
const ai_usage_logger_service_1 = require("./services/ai-usage-logger.service");
const prisma_module_1 = require("../../common/prisma/prisma.module");
let AiModule = class AiModule {
};
exports.AiModule = AiModule;
exports.AiModule = AiModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule],
        controllers: [ai_controller_1.AiController],
        providers: [
            groq_service_1.GroqService,
            glm_service_1.GlmService,
            gemini_service_1.GeminiService,
            cerebras_service_1.CerebrasService,
            ollama_service_1.OllamaService,
            bedrock_service_1.BedrockService,
            nvidia_service_1.NvidiaService,
            mistral_service_1.MistralService,
            huggingface_service_1.HuggingFaceService,
            openrouter_service_1.OpenRouterService,
            deepseek_service_1.DeepSeekService,
            embedding_service_1.EmbeddingService,
            rag_service_1.RagService,
            ai_usage_logger_service_1.AiUsageLoggerService,
            ai_orchestrator_service_1.AIOrchestratorService,
        ],
        exports: [
            ai_orchestrator_service_1.AIOrchestratorService,
            groq_service_1.GroqService,
            glm_service_1.GlmService,
            gemini_service_1.GeminiService,
            cerebras_service_1.CerebrasService,
            mistral_service_1.MistralService,
            nvidia_service_1.NvidiaService,
            huggingface_service_1.HuggingFaceService,
            ollama_service_1.OllamaService,
            bedrock_service_1.BedrockService,
            openrouter_service_1.OpenRouterService,
            deepseek_service_1.DeepSeekService,
            rag_service_1.RagService,
            embedding_service_1.EmbeddingService,
            ai_usage_logger_service_1.AiUsageLoggerService,
        ],
    })
], AiModule);
//# sourceMappingURL=ai.module.js.map