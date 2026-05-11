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
 * FIX: Re-resolves AWS keys on every call — ConfigService may not have loaded them at construction time.
 */
@Injectable()
export class BedrockService {
  private readonly logger = new Logger(BedrockService.name);
  private accessKeyId: string; // FIX: Not readonly — allows on-demand key resolution
  private secretAccessKey: string; // FIX: Not readonly — allows on-demand key resolution
  private readonly region: string;
  private available: boolean; // FIX: Not readonly — re-evaluated on each call
  private client: BedrockRuntimeClient | null = null;

  // Model fallback chain — ONLY use cheap Amazon models to control costs.
  // FIX: Removed ALL Claude models from fallback chain. Claude 3.5 Sonnet costs
  // $0.003/$0.015 per 1K tokens — 85x more expensive than Nova Micro ($0.000035/$0.00014).
  // Previously, when Nova Micro failed (e.g., model access not enabled in AWS Console),
  // the service silently fell back to Claude, causing the $100/month Bedrock budget to be
  // consumed at 97.7% — with actual AWS charges potentially much higher than logged costs
  // since calculateCost() uses Nova Micro rates for all 'bedrock' provider entries.
  //
  // Cost comparison per 1K tokens:
  //   Nova Micro:  $0.000035 input  / $0.00014 output  ← USE THIS
  //   Nova Lite:   $0.00006   input  / $0.00024  output
  //   Titan:       $0.0005    input  / $0.0015   output  (3-10x more)
  //   Llama3 8B:   $0.0003    input  / $0.0006   output
  //   Claude Haiku: $0.00025  input  / $0.00125  output  ← REMOVED
  //   Claude Sonnet: $0.003   input  / $0.015    output  ← REMOVED (85x Nova Micro!)
  private readonly modelCandidates = [
    // Amazon Nova — cheapest, fastest, good enough for most analysis tasks
    'amazon.nova-micro-v1:0',
    'amazon.nova-lite-v1:0',
    // Amazon Titan — usually available in all regions with basic model access
    'amazon.titan-text-premier-v1:0',
    'amazon.titan-text-express-v1',
    // Meta Llama — commonly available, mid-range cost
    'meta.llama3-1-8b-instruct-v1:0',
    'meta.llama3-8b-instruct-v1:0',
    // REMOVED: All Claude models — too expensive for a budget-constrained service.
    // If you need Claude, add it back with a SEPARATE cost tier in ai-usage-logger.
  ];
  private resolvedModel: string | null = null;
  private lastError: string = '';

  constructor(private readonly configService: ConfigService) {
    this.accessKeyId = this._resolveKey('AWS_ACCESS_KEY_ID');
    this.secretAccessKey = this._resolveKey('AWS_SECRET_ACCESS_KEY');
    this.region = this.configService.get<string>('AWS_REGION', 'us-east-1')?.trim() || 'us-east-1';
    this.available = !!(this.accessKeyId && this.secretAccessKey);

    this._initClient();
  }

  /**
   * FIX: Resolve an env key from multiple sources — ConfigService → process.env
   */
  private _resolveKey(keyName: string): string {
    const env = process.env as Record<string, string | undefined>;
    return (
      this.configService.get<string>(keyName, '')?.trim() ||
      env[keyName]?.trim() ||
      ''
    );
  }

  /**
   * FIX: Initialize or re-initialize the Bedrock client with current keys.
   * Called at construction and when keys are resolved on-demand.
   */
  private _initClient(): void {
    if (this.available) {
      this.client = new BedrockRuntimeClient({
        region: this.region,
        credentials: {
          accessKeyId: this.accessKeyId,
          secretAccessKey: this.secretAccessKey,
        },
      });
      this.logger.log(`☁️ AWS Bedrock Service initialized — region: ${this.region} (AWS SDK)`);
    } else {
      this.client = null;
      this.logger.warn('⚠️ AWS credentials not configured — Bedrock unavailable');
    }
  }

  async analyze(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    // FIX: Re-resolve keys on every call — ConfigService may load keys after construction
    if (!this.available) {
      this.accessKeyId = this._resolveKey('AWS_ACCESS_KEY_ID');
      this.secretAccessKey = this._resolveKey('AWS_SECRET_ACCESS_KEY');
      this.available = !!(this.accessKeyId && this.secretAccessKey);
      if (this.available) {
        this._initClient();
        this.logger.log('☁️ Bedrock keys resolved on-demand');
      }
    }

    if (!this.available || !this.client) {
      return this._stubResponse(request);
    }

    const startTime = Date.now();
    const modelsToTry = this.resolvedModel ? [this.resolvedModel] : this.modelCandidates;

    for (const modelToUse of modelsToTry) {
      try {
        const body = this._buildRequestBody(request, modelToUse);

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

        if (errorName === 'ThrottlingException' || errorMessage.includes('429')) {
          this.logger.warn(`☁️ Bedrock rate limited for model ${modelToUse} — throwing for circuit breaker`);
          throw error;
        }
        if (errorName === 'AccessDeniedException' || errorMessage.includes('403')) {
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

    this.resolvedModel = null;
    this.logger.warn(`☁️ All Bedrock models failed — last error: ${this.lastError}`);
    return {
      ...this._stubResponse(request),
      content: `⚠️ Bedrock API error: ${this.lastError.substring(0, 250)}`,
    };
  }

  private _buildRequestBody(request: AIAnalysisRequest, model: string): any {
    const systemPrompt = this._buildSystemPrompt(request);

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

    if (model.includes('nova')) {
      return {
        messages: [
          { role: 'user', content: [{ text: `${systemPrompt}\n\n${request.prompt}` }] },
        ],
        inferenceConfig: {
          maxTokens: 2048,
          temperature: 0.3,
          topP: 0.9,
        },
      };
    }

    if (model.includes('mistral')) {
      return {
        prompt: `${systemPrompt}\n\n[INST] ${request.prompt} [/INST]`,
        max_tokens: 1024,
        temperature: 0.3,
        top_p: 0.9,
      };
    }

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

    if (model.includes('llama')) {
      return {
        prompt: `${systemPrompt}\n\n[INST] ${request.prompt} [/INST]`,
        max_gen_len: 1024,
        temperature: 0.3,
      };
    }

    return {
      prompt: `${systemPrompt}\n\n${request.prompt}`,
      max_gen_len: 1024,
      temperature: 0.3,
    };
  }

  private _extractContent(data: any, model: string): string {
    if (data.content && Array.isArray(data.content)) {
      return data.content[0]?.text || '';
    }

    if (model.includes('nova') && data.output?.message?.content) {
      const novaContent = data.output.message.content;
      if (Array.isArray(novaContent) && novaContent.length > 0) {
        return novaContent[0].text || '';
      }
    }

    if (data.results && Array.isArray(data.results) && data.results.length > 0) {
      return data.results[0].outputText || '';
    }

    if (model.includes('mistral') && data.outputs && Array.isArray(data.outputs)) {
      return data.outputs[0]?.text || '';
    }

    if (data.generation) {
      return data.generation;
    }

    return data.completion || data.text || data.outputText || '';
  }

  private _buildSystemPrompt(request: AIAnalysisRequest): string {
    return `أنت محلل مالي. أجب بالعربية فقط. لا تستخدم الإنجليزية. أنت خبير مخاطر متخصص في ${request.type}. قدّم تحليلاً حذراً وشاملاً مع التركيز على عوامل المخاطر والحالات الاستثنائية. أبرز دائماً الجوانب السلبية وأسوأ السيناريوهات إلى جانب الفرص. أضف تنبيهات المخاطر بوضوح. IMPORTANT: Respond in Arabic only.`;
  }

  private _stubResponse(request: AIAnalysisRequest): AIAnalysisResponse {
    return {
      // FIX: Was 'Bedrock/Claude-3.5-Sonnet' — misleading since we now use Nova Micro
      model: 'Bedrock/Nova-Micro',
      content: `⚠️ نماذج Bedrock غير متاحة حالياً. تأكد من: 1) تفعيل Model Access في AWS Console → Bedrock (خاصة Amazon Nova)، 2) صلاحيات IAM bedrock:InvokeModel، 3) المنطقة صحيحة.`,
      confidence: 0,
      processingTimeMs: 0,
      language: request.language || 'ar',
    };
  }
}
