import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { AIAnalysisRequest, AIAnalysisResponse } from './groq.service';
import { calculateConfidence } from './confidence.util';

/**
 * AWS Bedrock Service — Enterprise AI Models via AWS
 *
 * Uses existing AWS credentials:
 * - AWS_ACCESS_KEY_ID
 * - AWS_SECRET_ACCESS_KEY
 * - AWS_REGION (default: us-east-1)
 *
 * FIX: Replaced manual SigV4 signing with official AWS SDK (@aws-sdk/client-bedrock-runtime).
 * The manual signing had a canonical URI encoding mismatch that caused 403 errors.
 * The AWS SDK handles all signing automatically and correctly.
 *
 * AWS Bedrock requires:
 * 1. IAM policy with bedrock:InvokeModel permission (user created "roua" policy)
 * 2. Model access enabled in AWS Console → Bedrock → Model Access
 *
 * Best for: Enterprise-grade reliability, compliance, multi-model access through one API
 * Cost: Pay-per-token (varies by model)
 */
@Injectable()
export class BedrockService {
  private readonly logger = new Logger(BedrockService.name);
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly region: string;
  private readonly available: boolean;
  private readonly client: BedrockRuntimeClient | null = null;

  // Model fallback chain — try most capable models first, then cheaper ones
  // FIX: Updated May 2025 — Added Claude 3.5 Haiku (faster, cheaper than Sonnet)
  // and Amazon Nova models which are available in more regions.
  private readonly modelCandidates = [
    // Cross-region inference IDs (work from any region, often more available)
    'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
    'us.anthropic.claude-3-haiku-20240307-v1:0',
    // Direct model IDs (region-specific)
    'anthropic.claude-3-5-sonnet-20241022-v2:0',
    'anthropic.claude-3-haiku-20240307-v1:0',
    // Amazon Nova — newer, more available than Titan
    'amazon.nova-micro-v1:0',
    'amazon.nova-lite-v1:0',
    // Amazon Titan — usually available in all regions with basic model access
    'amazon.titan-text-premier-v1:0',
    'amazon.titan-text-express-v1',
    // Meta Llama — commonly available
    'meta.llama3-1-8b-instruct-v1:0',
    'meta.llama3-8b-instruct-v1:0',
  ];
  private resolvedModel: string | null = null;
  private lastError: string = '';

  constructor(private readonly configService: ConfigService) {
    this.accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID', '')?.trim() || '';
    this.secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY', '')?.trim() || '';
    this.region = this.configService.get<string>('AWS_REGION', 'us-east-1')?.trim() || 'us-east-1';
    this.available = !!(this.accessKeyId && this.secretAccessKey);

    if (this.available) {
      // FIX: Use official AWS SDK client — handles SigV4 signing automatically
      this.client = new BedrockRuntimeClient({
        region: this.region,
        credentials: {
          accessKeyId: this.accessKeyId,
          secretAccessKey: this.secretAccessKey,
        },
      });
      this.logger.log(`☁️ AWS Bedrock Service initialized — region: ${this.region} (AWS SDK)`);
    } else {
      this.logger.warn('⚠️ AWS credentials not configured — Bedrock unavailable');
    }
  }

  async analyze(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    if (!this.available || !this.client) {
      return this._stubResponse(request);
    }

    const startTime = Date.now();
    const modelsToTry = this.resolvedModel ? [this.resolvedModel] : this.modelCandidates;

    for (const modelToUse of modelsToTry) {
      try {
        const body = this._buildRequestBody(request, modelToUse);

        // FIX: Use AWS SDK InvokeModelCommand — handles SigV4 signing automatically
        const command = new InvokeModelCommand({
          modelId: modelToUse,
          body: JSON.stringify(body),
          contentType: 'application/json',
          accept: 'application/json',
        });

        const response = await this.client.send(command);
        const responseBody = new TextDecoder().decode(response.body);
        const data = JSON.parse(responseBody);
        const content = this._extractContent(data, modelToUse);

        if (content.trim().length > 0) {
          // Success — cache this model for future calls
          if (!this.resolvedModel) {
            this.resolvedModel = modelToUse;
            this.logger.log(`☁️ Bedrock model resolved: ${modelToUse}`);
          }

          const modelShort = modelToUse.split('.').pop() || modelToUse;
          return {
            model: `Bedrock/${modelShort}`,
            content,
            confidence: calculateConfidence(content, 'bedrock'),
            processingTimeMs: Date.now() - startTime,
            language: request.language || 'ar',
          };
        }
      } catch (error: any) {
        const errorName = error.name || '';
        const errorMessage = error.message || String(error);
        this.lastError = `${modelToUse}: ${errorName} — ${errorMessage.substring(0, 150)}`;

        // Check for specific error types
        if (errorName === 'ThrottlingException' || errorMessage.includes('429')) {
          this.logger.warn(`☁️ Bedrock rate limited for model ${modelToUse} — throwing for circuit breaker`);
          throw error;
        }
        if (errorName === 'AccessDeniedException' || errorMessage.includes('403')) {
          // 403 = IAM lacks bedrock:InvokeModel for THIS model, or model not enabled
          this.logger.warn(`☁️ Bedrock 403 for model ${modelToUse} — IAM may lack bedrock:InvokeModel or model not enabled in Console. ${errorMessage.substring(0, 200)}`);
          continue;
        }
        if (errorName === 'ValidationException' || errorMessage.includes('404')) {
          this.logger.warn(`☁️ Bedrock model ${modelToUse} not found/invalid — trying next...`);
          continue;
        }

        this.logger.warn(`☁️ Bedrock model ${modelToUse} failed: ${errorMessage.substring(0, 200)}`);
        if (!this.resolvedModel) continue;
        return {
          ...this._stubResponse(request),
          content: `⚠️ Bedrock API error: ${errorMessage.substring(0, 200)}`,
        };
      }
    }

    // All models failed
    this.resolvedModel = null;
    this.logger.warn(`☁️ All Bedrock models failed — last error: ${this.lastError}`);
    return {
      ...this._stubResponse(request),
      content: `⚠️ Bedrock API error: ${this.lastError.substring(0, 250)}`,
    };
  }

  /**
   * Build request body based on model type
   */
  private _buildRequestBody(request: AIAnalysisRequest, model: string): any {
    const systemPrompt = this._buildSystemPrompt(request);

    // Claude-style request (Anthropic format)
    if (model.includes('anthropic')) {
      return {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          { role: 'user', content: request.prompt },
        ],
        temperature: 0.3,
      };
    }

    // Titan-style request
    if (model.includes('titan')) {
      return {
        inputText: `${systemPrompt}\n\n${request.prompt}`,
        textGenerationConfig: {
          maxTokenCount: 1024,
          temperature: 0.3,
          topP: 0.9,
        },
      };
    }

    // Llama-style request
    if (model.includes('llama')) {
      return {
        prompt: `${systemPrompt}\n\n[INST] ${request.prompt} [/INST]`,
        max_gen_len: 1024,
        temperature: 0.3,
      };
    }

    // Default: generic text prompt format
    return {
      prompt: `${systemPrompt}\n\n${request.prompt}`,
      max_gen_len: 1024,
      temperature: 0.3,
    };
  }

  /**
   * Extract content from Bedrock response based on model type
   */
  private _extractContent(data: any, model: string): string {
    // Claude response format
    if (data.content && Array.isArray(data.content)) {
      return data.content[0]?.text || '';
    }
    // Titan response format
    if (data.results && Array.isArray(data.results) && data.results.length > 0) {
      return data.results[0].outputText || '';
    }
    // Llama/Mistral response format
    if (data.generation) {
      return data.generation;
    }
    // Fallback
    return data.completion || data.text || data.outputText || '';
  }

  private _buildSystemPrompt(request: AIAnalysisRequest): string {
    // FIX: Force Arabic-only responses — previous English prompts caused English responses in Arabic council
    return `أنت محلل مالي. أجب بالعربية فقط. لا تستخدم الإنجليزية. أنت خبير مخاطر متخصص في ${request.type}. قدّم تحليلاً حذراً وشاملاً مع التركيز على عوامل المخاطر والحالات الاستثنائية. أبرز دائماً الجوانب السلبية وأسوأ السيناريوهات إلى جانب الفرص. أضف تنبيهات المخاطر بوضوح. IMPORTANT: Respond in Arabic only.`;
  }

  private _stubResponse(request: AIAnalysisRequest): AIAnalysisResponse {
    return {
      model: 'Bedrock/Claude-3.5-Sonnet',
      content: `⚠️ نماذج Bedrock غير متاحة حالياً. تأكد من: 1) تفعيل Model Access في AWS Console → Bedrock، 2) صلاحيات IAM bedrock:InvokeModel، 3) المنطقة صحيحة.`,
      confidence: 0,
      processingTimeMs: 0,
      language: request.language || 'ar',
    };
  }
}
