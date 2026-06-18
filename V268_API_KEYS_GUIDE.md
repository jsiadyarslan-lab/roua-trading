# V268 — دليل إضافة مفاتيح API على Railway

## 🎯 الهدف

المنصة لديها 11 نموذج AI محتمل. حالياً فقط **2 يعملان** (Bedrock + NVIDIA). إضافة بقية المفاتيح سيُفعّل 9 نماذج إضافية = تنوع أكبر + redundancy أقوى + جودة إجماع أعلى.

## 📋 المفاتيح المطلوبة (مرتبة حسب الأولوية)

### 🥇 الأولوية القصوى (مجانية + سريعة)

| # | المزود | اسم الـ env var | رابط الحصول على المفتاح | الحد المجاني |
|---|--------|----------------|--------------------------|-------------|
| 1 | **Groq** | `GROQ_API_KEY` | https://console.groq.com/keys | 30 req/min, 14,400 req/day |
| 2 | **Cerebras** | `CEREBRAS_API_KEY` | https://cloud.cerebras.ai/ | 14,400 req/day FREE |
| 3 | **NVIDIA NIM** | `NVIDIA_API_KEY` | https://build.nvidia.com/ | 40 req/min FREE |
| 4 | **Mistral** | `MISTRAL_API_KEY` | https://console.mistral.ai/api-keys | 1B tokens/month FREE |
| 5 | **Google Gemini** | `GOOGLE_AI_STUDIO_API_KEY` | https://aistudio.google.com/app/apikey | 15 req/min FREE |
| 6 | **GLM (Zhipu)** | `GLM_API_KEY` | https://open.bigmodel.cn/usercenter/apikeys | 5M tokens FREE |

### 🥈 الأولوية المتوسطة (مدفوعة لكن رخيصة)

| # | المزود | اسم الـ env var | رابط الحصول على المفتاح | التكلفة التقريبية |
|---|--------|----------------|--------------------------|-------------------|
| 7 | **DeepSeek** | `DEEPSEEK_API_KEY` | https://platform.deepseek.com/api_keys | $0.14/1M tokens |
| 8 | **OpenRouter** | `OPENROUTER_API_KEY` | https://openrouter.ai/keys | $0.10-2/1M tokens |
| 9 | **HuggingFace** | `HUGGINGFACE_API_KEY` | https://huggingface.co/settings/tokens | FREE tier محدود |

### 🥉 الأولوية المنخفضة (تحتاج إعداد خاص)

| # | المزود | اسم الـ env var | ملاحظات |
|---|--------|----------------|---------|
| 10 | **Ollama** | `OLLAMA_BASE_URL` | يتطلب Ollama مثبت على VPS منفصل (localhost على Railway لا يعمل) |
| 11 | **AWS Bedrock** | `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` | ✅ **يعمل حالياً** — فقط تحقق من عدم تجاوز الـ budget الشهري |

## 🚀 خطوات الإضافة على Railway

### الخطوة 1: افتح Railway Dashboard

```
https://railway.app/dashboard
```

اختر مشروع Roua Trading → اختر الـ API service.

### الخطوة 2: اذهب إلى Variables

في الـ API service، اضغط على tab **Variables**.

### الخطوة 3: أضف المفاتيح

اضغط **New Variable** لكل مفتاح:

```
Variable Name:  GROQ_API_KEY
Value:          gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

كرّر لكل مزود:

| Variable Name | مثال للقيمة |
|---------------|------------|
| `GROQ_API_KEY` | `gsk_...` (من console.groq.com) |
| `CEREBRAS_API_KEY` | `csk-...` (من cloud.cerebras.ai) |
| `NVIDIA_API_KEY` | `nvapi-...` (من build.nvidia.com) |
| `MISTRAL_API_KEY` | `...` (من console.mistral.ai) |
| `GOOGLE_AI_STUDIO_API_KEY` | `AIza...` (من aistudio.google.com) |
| `GLM_API_KEY` | `...` (من open.bigmodel.cn) |
| `DEEPSEEK_API_KEY` | `sk-...` (من platform.deepseek.com) |
| `OPENROUTER_API_KEY` | `sk-or-v1-...` (من openrouter.ai) |

### الخطوة 4: تحقق من Bedrock (موجود بالفعل)

تأكد أن هذه متوفرة (كانت تعمل في الـ snapshot):

```
AWS_ACCESS_KEY_ID      = AKIA...
AWS_SECRET_ACCESS_KEY  = ...
AWS_REGION             = us-east-1
BEDROCK_MONTHLY_BUDGET_USD = 100
```

### الخطوة 5: Redeploy

بعد إضافة المفاتيح، Railway سيعيد النشر تلقائياً. أو يدوياً:

```bash
# في Railway Dashboard:
# Settings → Redeploy
```

### الخطوة 6: تحقق من النماذج

بعد النشر، افتح:

```
https://roua-trading-production.up.railway.app/api/ai/diagnose
```

يجب أن يُرجع JSON يُظهر أي المزودين يعملون:

```json
{
  "success": true,
  "data": {
    "groq": { "available": true, "model": "llama-3.3-70b-versatile" },
    "cerebras": { "available": true, "model": "llama3.1-8b" },
    "nvidia": { "available": true, "model": "llama-3.1-8b-instruct" },
    "mistral": { "available": true, "model": "mistral-small-latest" },
    "gemini": { "available": true, "model": "gemini-1.5-flash" },
    "glm": { "available": true, "model": "glm-4-flash" },
    "bedrock": { "available": true, "model": "nova-micro-v1:0" },
    "deepseek": { "available": false, "error": "402 Payment Required" },
    "openrouter": { "available": false, "error": "No key" }
  }
}
```

## 💡 توصيات

### ابدأ بـ 6 مزودين مجانيين (الأولوية القصوى)

هؤلاء يوفرون **8 نماذج AI مختلفة** مجاناً:

1. **Groq** — الأسرع (500 tokens/sec)
2. **Cerebras** — سريع جداً + مجاني تماماً
3. **NVIDIA NIM** — جودة عالية (Llama 3.1)
4. **Mistral** — 1B tokens شهرياً مجاناً
5. **Google Gemini** — متنوع (Flash + Pro)
6. **GLM** — أفضل نموذج صيني

### تجنب Ollama على Railway

Ollama يحتاج GPU/CPU محلي. على Railway سيكون معطّلاً دائماً. اتركه بدون مفتاح.

### راقب Bedrock budget

```env
BEDROCK_MONTHLY_BUDGET_USD=100
```

عند 95% من الـ budget، Bedrock يتوقف تلقائياً. لو توقف، الـ fallback chain ستنتقل للمزودين الآخرين.

## 📊 التأثير المتوقع

| الحالة | عدد النماذج العاملة | جودة الإجماع |
|--------|-------------------|------------|
| **الآن** | 2 (Bedrock + NVIDIA) | متوسطة (نفس النموذج يُجيب 7 أدوار) |
| **بعد 6 مزودين مجانيين** | 8 | **عالية** (تنوع حقيقي) |
| **بعد كل 9 مزودين** | 11 | **مثالية** (maximum redundancy) |

## ⚠️ ملاحظات أمنية

- **لا تضع المفاتيح في git** — أضفها فقط على Railway Variables
- **استخدم مفاتيح read-only** حيثما أمكن (للـ AI providers، هذا غير متاح عادة)
- **اربط المفاتيح بـ IP** لو أمكن (بعض المزودين يدعمون IP allowlist)
- **فعّل rate limiting alerts** على كل مزود لتجنب المفاجآت

## 🎯 بعد الإضافة

عندما تُضاف المفاتيح، الـ AI Council سيعمل بالكامل:
- 8 أدوار AI مختلفة × 9 نماذج = 72 perspective للإجماع
- fallback chain حقيقية (لو Bedrock فشل، Groq/Cerebras/NVIDIA يأخذون)
- جودة قرارات أعلى = win rate أعلى = ربح أكبر

**ابدأ بـ Groq + Cerebras** — الأسرع في الإعداد والأعلى في القيمة المجانية.
