import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIAnalysisRequest, AIAnalysisResponse } from './groq.service';

/**
 * AWS Bedrock Service — Enterprise AI Models via AWS
 * 
 * Uses existing AWS credentials:
 * - AWS_ACCESS_KEY_ID
 * - AWS_SECRET_ACCESS_KEY  
 * - AWS_REGION (default: us-east-1)
 * 
 * Available models (pay-per-use via AWS):
 * - Claude 3.5 Sonnet — Safety-focused risk analysis
 * - Llama 3.1 70B — Versatile analysis
 * - Mistral Large — European/multilingual optimization
 * - Amazon Titan — AWS native, cost-effective
 * - Cohere Command R+ — RAG-optimized retrieval
 * 
 * Best for: Enterprise-grade reliability, compliance, multi-model access through one API
 * Cost: Pay-per-token (varies by model)
 */
@Injectable()
export class BedrockService {
  private readonly logger = new Logger(BedrockService.name);
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly sessionToken: string;
  private readonly region: string;
  private readonly available: boolean;

  // Default to Claude 3.5 Sonnet for risk/compliance analysis
  private readonly defaultModel = 'anthropic.claude-3-5-sonnet-20241022-v2:0';

  constructor(private readonly configService: ConfigService) {
    this.accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID', '')?.trim() || '';
    this.secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY', '')?.trim() || '';
    this.sessionToken = this.configService.get<string>('AWS_SESSION_TOKEN', '')?.trim() || '';
    this.region = this.configService.get<string>('AWS_REGION', 'us-east-1')?.trim() || 'us-east-1';
    this.available = !!(this.accessKeyId && this.secretAccessKey);

    if (this.available) {
      const hasSessionToken = !!this.sessionToken;
      this.logger.log(`☁️ AWS Bedrock Service initialized (Claude 3.5 + Llama 3.1 + Mistral) — region: ${this.region}${hasSessionToken ? ' (with session token)' : ''}`);
    } else {
      this.logger.warn('⚠️ AWS credentials not configured — Bedrock unavailable');
    }
  }

  async analyze(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    if (!this.available) {
      return this._stubResponse(request);
    }

    const startTime = Date.now();

    try {
      // Use AWS SDK-style request via fetch (to avoid adding @aws-sdk dependency)
      // We implement AWS SigV4 signing manually for the Bedrock InvokeModel API
      const body = this._buildRequestBody(request);
      // URL-encode the model ID (colons must be %3A in the path)
      const encodedModelId = encodeURIComponent(this.defaultModel);
      const endpoint = `https://bedrock-runtime.${this.region}.amazonaws.com/model/${encodedModelId}/invoke`;
      
      const headers = await this._signRequest(endpoint, body);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        if (response.status === 403) {
          this.logger.error(`Bedrock 403 Forbidden — Possible causes: (1) Region ${this.region} doesn't have Bedrock enabled, (2) IAM user lacks bedrock:InvokeModel permission, (3) Model ${this.defaultModel} not enabled in Bedrock console. Body: ${errorBody.substring(0, 300)}`);
        } else if (response.status === 404) {
          this.logger.error(`Bedrock 404 Not Found — Model ${this.defaultModel} not found in region ${this.region}. Check model availability. Body: ${errorBody.substring(0, 300)}`);
        } else {
          this.logger.error(`Bedrock API error: ${response.status} ${response.statusText} — ${errorBody.substring(0, 300)}`);
        }
        throw new Error(`Bedrock API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const content = this._extractContent(data);

      if (content.length > 5) {
        return {
          model: `Bedrock/${this.defaultModel.split('.').pop()}`,
          content,
          confidence: this._calculateConfidence(content, 'bedrock'),
          processingTimeMs: Date.now() - startTime,
          language: request.language || 'ar',
        };
      }
    } catch (error: any) {
      this.logger.warn(`AWS Bedrock inference failed: ${error.message}`);
    }

    return this._stubResponse(request);
  }

  /**
   * Build request body based on model type
   */
  private _buildRequestBody(request: AIAnalysisRequest): any {
    const systemPrompt = this._buildSystemPrompt(request);

    // Claude-style request (Anthropic format)
    if (this.defaultModel.includes('anthropic')) {
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

    // Llama/Mistral-style request
    return {
      prompt: `${systemPrompt}\n\n[INST] ${request.prompt} [/INST]`,
      max_gen_len: 1024,
      temperature: 0.3,
    };
  }

  /**
   * Extract content from Bedrock response based on model type
   */
  private _extractContent(data: any): string {
    // Claude response format
    if (data.content && Array.isArray(data.content)) {
      return data.content[0]?.text || '';
    }
    // Llama/Mistral response format
    if (data.generation) {
      return data.generation;
    }
    // Fallback
    return data.completion || data.text || '';
  }

  private _buildSystemPrompt(request: AIAnalysisRequest): string {
    const lang = request.language === 'en' ? 'English' : 'Arabic';
    return `You are a safety-focused financial AI analyst specializing in ${request.type}. Respond in ${lang}. Provide thorough, cautious analysis with emphasis on risk factors and edge cases. Always highlight potential downsides and worst-case scenarios alongside opportunities. Include clear risk disclaimers.`;
  }

  /**
   * Sign request with AWS SigV4 for Bedrock InvokeModel API
   * 
   * FIX: Added required x-amz-content-sha256 header, accept header,
   * and proper URI encoding for the canonical request.
   */
  private async _signRequest(endpoint: string, body: any): Promise<Record<string, string>> {
    const crypto = await import('crypto');
    
    const service = 'bedrock';
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substring(0, 8);
    
    const bodyStr = JSON.stringify(body);
    const payloadHash = crypto.createHash('sha256').update(bodyStr).digest('hex');
    
    const host = new URL(endpoint).host;
    // FIX: URI-encode each path segment per AWS SigV4 spec (colons → %3A)
    const canonicalUri = new URL(endpoint).pathname.split('/').map(s => encodeURIComponent(decodeURIComponent(s))).join('/');
    
    // FIX: Include accept and x-amz-content-sha256 in signed headers (required by Bedrock)
    // If using STS temporary credentials, include x-amz-security-token
    let canonicalHeaders: string;
    let signedHeaders: string;
    
    if (this.sessionToken) {
      canonicalHeaders = `accept:application/json\ncontent-type:application/json\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\nx-amz-security-token:${this.sessionToken}\n`;
      signedHeaders = 'accept;content-type;host;x-amz-content-sha256;x-amz-date;x-amz-security-token';
    } else {
      canonicalHeaders = `accept:application/json\ncontent-type:application/json\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
      signedHeaders = 'accept;content-type;host;x-amz-content-sha256;x-amz-date';
    }
    
    const canonicalRequest = [
      'POST',
      canonicalUri,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');
    
    const credentialScope = `${dateStamp}/${this.region}/${service}/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');
    
    const sign = (key: Buffer, msg: string) =>
      crypto.createHmac('sha256', key).update(msg).digest();
    
    let signingKey = crypto.createHmac('sha256', `AWS4${this.secretAccessKey}`).update(dateStamp).digest();
    signingKey = sign(signingKey, this.region);
    signingKey = sign(signingKey, service);
    signingKey = sign(signingKey, 'aws4_request');
    
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Host': host,
      'X-Amz-Content-Sha256': payloadHash,
      'X-Amz-Date': amzDate,
      'Authorization': `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    };
    
    // Add session token header if using temporary credentials (STS)
    if (this.sessionToken) {
      headers['X-Amz-Security-Token'] = this.sessionToken;
    }
    
    return headers;
  }

  private _calculateConfidence(content: string, model: string): number {
    let confidence = 0.5; // base

    // Length bonus: longer analysis = more confident (capped)
    if (content.length > 200) confidence += 0.1;
    if (content.length > 500) confidence += 0.1;
    if (content.length > 1000) confidence += 0.05;

    // Clear recommendation bonus
    const hasRecommendation = /شراء|بيع|انتظار|BUY|SELL|HOLD|صعود|هبوط/i.test(content);
    if (hasRecommendation) confidence += 0.15;

    // Model base confidence
    const modelBase: Record<string, number> = {
      'gemini': 0.05,
      'groq': 0.0,
      'glm': 0.02,
      'huggingface': -0.05,
      'ollama': 0.0,
      'bedrock': 0.08,
    };
    confidence += modelBase[model] || 0;

    return Math.min(Math.max(confidence, 0.1), 0.95); // Clamp 0.1-0.95
  }

  private _stubResponse(request: AIAnalysisRequest): AIAnalysisResponse {
    return {
      model: 'Bedrock/Claude-3.5-Sonnet',
      content: `⚠️ بيانات AWS غير مكوّنة. نماذج Bedrock (Claude 3.5, Llama 3.1, Mistral Large, Titan) ستكون متاحة عند تفعيل AWS — المؤسسات والامتثال.`,
      confidence: 0,
      processingTimeMs: 0,
      language: request.language || 'ar',
    };
  }
}
