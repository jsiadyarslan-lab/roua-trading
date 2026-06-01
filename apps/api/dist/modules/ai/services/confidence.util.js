"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateConfidence = calculateConfidence;
const MODEL_RELIABILITY = {
    groq: 0.02,
    gemini: 0.05,
    glm: 0.03,
    cerebras: 0.03,
    ollama: 0.00,
    bedrock: 0.05,
    nvidia: 0.02,
    mistral: 0.04,
    huggingface: -0.02,
    openrouter: 0.00,
    deepseek: 0.03,
};
function calculateConfidence(content, model) {
    let confidence = 0.3;
    if (content.length > 100)
        confidence += 0.05;
    if (content.length > 300)
        confidence += 0.05;
    if (content.length > 600)
        confidence += 0.05;
    if (content.length > 1000)
        confidence += 0.05;
    if (content.includes('DECISION:') || content.includes('القرار:'))
        confidence += 0.04;
    if (content.includes('{') && content.includes('}'))
        confidence += 0.03;
    if (content.includes('```') || content.includes('1.') || content.includes('-'))
        confidence += 0.03;
    if (/(\$?\d+[\.,]?\d*|\d+\s*%)/.test(content))
        confidence += 0.02;
    const hasBuy = /شراء|BUY|صعود|long/i.test(content);
    const hasSell = /بيع|SELL|هبوط|short/i.test(content);
    const hasHold = /انتظار|HOLD|WAIT|محايد/i.test(content);
    const hasNegation = /لا أنصح|لا أنصح بال|غير مستحسن|لا يُنصح|I don't recommend|not recommended|avoid/i.test(content);
    if ((hasBuy || hasSell || hasHold) && !hasNegation) {
        confidence += 0.10;
    }
    else if ((hasBuy || hasSell || hasHold) && hasNegation) {
        confidence += 0.03;
    }
    const hasRisk = /مخاطر|risk|تحذير|warning|حذر|caution|قد يخسر|may lose/i.test(content);
    const hasDisclaimer = /إخلاء مسؤولية|disclaimer|تعليمي|educational|ليس نصيحة/i.test(content);
    if (hasRisk)
        confidence += 0.04;
    if (hasDisclaimer)
        confidence += 0.04;
    const arabicPattern = /[\u0600-\u06FF]/;
    if (arabicPattern.test(content))
        confidence += 0.03;
    if (arabicPattern.test(content) && /[a-zA-Z]{3,}/.test(content))
        confidence += 0.02;
    confidence += MODEL_RELIABILITY[model] || 0.00;
    if (content.includes('⚠️') || content.includes('غير متاح') || content.includes('unavailable'))
        confidence -= 0.15;
    if (content.length < 50)
        confidence -= 0.10;
    if (/لم أتمكن|لا أستطيع|I cannot|I'm unable/i.test(content))
        confidence -= 0.10;
    return Math.min(Math.max(confidence, 0.05), 0.95);
}
//# sourceMappingURL=confidence.util.js.map