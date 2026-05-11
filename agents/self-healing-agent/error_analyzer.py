"""
وكيل الإصلاح الذاتي — محلل الأخطاء
يرسل السجلات والأخطاء إلى GLM-5.1 لتحليلها وتحديد:
- الملف المتأثر
- السطر
- سبب الخطأ
- الكود المُصلح المقترح
"""

import json
import time
import requests
from typing import Optional

from config import GLM_API_KEY, GLM_API_URL, GLM_MODEL, ALLOWED_FIX_SCOPES, FORBIDDEN_SCOPES


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# تحليل الأخطاء عبر GLM-5.1
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def analyze_error(
    error_info: dict,
    logs: list[str],
    health_result: Optional[dict] = None,
) -> dict:
    """
    يرسل معلومات الخطأ والسجلات إلى GLM-5.1 للتحليل.

    المعاملات:
        error_info: معلومات الخطأ المستخرجة من logger_fetcher
        logs: سجلات Railway
        health_result: نتيجة فحص الصحة (اختياري)

    يعيد:
        قاموس يحتوي:
        - success: هل نجح التحليل؟
        - analysis: نص التحليل
        - fix_scope: نطاق الإصلاح (typescript_error, api_error, etc.)
        - is_safe: هل الإصلاح آمن (لا يلمس منطق التداول/الأمان)؟
        - file_path: مسار الملف المتأثر
        - line_number: رقم السطر
        - fix_code: الكود المُصلح
        - explanation: شرح الإصلاح
    """
    if not GLM_API_KEY:
        return {
            "success": False,
            "analysis": "GLM_API_KEY غير مضبوط — تخطي التحليل",
            "fix_scope": None,
            "is_safe": False,
            "file_path": None,
            "line_number": None,
            "fix_code": None,
            "explanation": None,
        }

    # بناء الموجه
    prompt = _build_analysis_prompt(error_info, logs, health_result)

    # استدعاء GLM-5.1
    response = _call_glm(prompt)

    if not response["success"]:
        return {
            "success": False,
            "analysis": response.get("error", "فشل استدعاء GLM"),
            "fix_scope": None,
            "is_safe": False,
            "file_path": None,
            "line_number": None,
            "fix_code": None,
            "explanation": None,
        }

    # تحليل الرد
    return _parse_glm_response(response["content"], error_info)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# بناء موجه التحليل
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def _build_analysis_prompt(
    error_info: dict,
    logs: list[str],
    health_result: Optional[dict],
) -> str:
    """يبني موجه التحليل المُفصّل لـ GLM-5.1."""

    logs_text = "\n".join(logs[-30:])  # آخر 30 سطر فقط
    error_type = error_info.get("type", "unknown")
    error_message = error_info.get("message", "غير محدد")
    error_file = error_info.get("file", "غير محدد")
    error_line = error_info.get("line", "غير محدد")

    health_text = ""
    if health_result:
        health_text = f"""
نتيجة فحص الصحة:
- نقطة النهاية: {health_result.get('name', 'غير محدد')}
- كود الحالة: {health_result.get('status_code', 'غير محدد')}
- الخطأ: {health_result.get('error', 'لا يوجد')}
"""

    prompt = f"""أنت مهندس برمجيات خبير في منصة Roua Trading.
المنصة مبنية بـ Next.js 16 (apps/web) + NestJS (apps/api) + Prisma + TypeScript.
مهمتك: تحليل الخطأ التالي وتقديم إصلاح دقيق.

━━━ معلومات الخطأ ━━━
نوع الخطأ: {error_type}
الرسالة: {error_message}
الملف المتأثر: {error_file}
السطر: {error_line}
{health_text}
━━━ آخر السجلات ━━━
{logs_text}

━━━ التعليمات ━━━
أجب بالتنسيق التالي بدقة (JSON صالح):

```json
{{
  "fix_scope": "typescript_error أو api_error أو missing_import أو type_mismatch أو undefined_reference",
  "is_safe": true أو false,
  "safety_reason": "سبب تصنيف الأمان",
  "file_path": "المسار الكامل للملف الذي يجب تعديله",
  "line_number": رقم_السطر_المتأثر_أو_null,
  "fix_code": "الكود المُصلح الكامل للسطر أو المقطع المتأثر",
  "search_code": "الكود القديم الذي سيتم استبداله (مهم للبحث والاستبدال)",
  "explanation": "شرح موجز للإصلاح بالعربية"
}}
```

قواعد الأمان:
- لا تلمس أبداً منطق التداول (trading_logic, order_execution, position_management)
- لا تلمس أبداً إعدادات الأمان (security, risk_management, 2fa)
- الإصلاح الآمن: أخطاء TypeScript، أخطاء API سطحية، استيرادات مفقودة، أنواع غير متطابقة
- الإصلاح غير الآمن: أي تعديل على منطق التداول أو إدارة المخاطر أو تنفيذ الأوامر

إذا كان الخطأ يتعلق بالبناء (build error)، قدم الكود المُصلح فقط.
إذا كان الخطأ في وقت التشغيل (runtime error)، قدم الكود المُصلح مع شرح السبب.
إذا لم تستطع تحديد الإصلاح بدقة، ضع is_safe = false واشرح السبب."""

    return prompt


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# استدعاء GLM-5.1 API
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def _call_glm(prompt: str, max_retries: int = 3) -> dict:
    """يرسل موجهًا إلى GLM ويعيد الرد مع إعادة المحاولة عند الفشل المؤقت."""
    headers = {
        "Authorization": f"Bearer {GLM_API_KEY}",
        "Content-Type": "application/json",
    }
    data = {
        "model": GLM_MODEL,
        "messages": [
            {
                "role": "system",
                "content": "أنت مهندس برمجيات خبير. أجب بتنسيق JSON فقط. لا تضف نصاً إضافياً خارج كتلة JSON.",
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,  # درجة حرارة منخفضة للدقة
        "max_tokens": 2048,
    }

    last_error = None
    for attempt in range(max_retries):
        try:
            resp = requests.post(GLM_API_URL, headers=headers, json=data, timeout=60)
            resp_json = resp.json()

            if resp.status_code == 429:
                # تجاوز الحد — انتظار أطول
                wait_time = min(2 ** attempt * 5, 30)  # تراجع أسي: 5، 10، 20 ثانية
                print(f"  ⏳ تجاوز حد GLM API (429) — انتظار {wait_time}ث (محاولة {attempt + 1}/{max_retries})")
                time.sleep(wait_time)
                last_error = f"GLM API أرجع HTTP 429: {resp_json}"
                continue

            if resp.status_code >= 500:
                # خطأ خادم — إعادة محاولة
                wait_time = 2 ** attempt  # تراجع أسي: 1، 2، 4 ثواني
                print(f"  ⚠️ خطأ خادم GLM ({resp.status_code}) — إعادة محاولة بعد {wait_time}ث")
                time.sleep(wait_time)
                last_error = f"GLM API أرجع HTTP {resp.status_code}: {resp_json}"
                continue

            if resp.status_code != 200:
                return {
                    "success": False,
                    "error": f"GLM API أرجع HTTP {resp.status_code}: {resp_json}",
                }

            content = resp_json.get("choices", [{}])[0].get("message", {}).get("content", "")

            if not content:
                return {"success": False, "error": "GLM أرجع رداً فارغاً"}

            return {"success": True, "content": content}

        except requests.exceptions.Timeout:
            last_error = "انتهت مهلة GLM API"
            wait_time = 2 ** attempt
            print(f"  ⚠️ انتهت مهلة GLM — إعادة محاولة بعد {wait_time}ث ({attempt + 1}/{max_retries})")
            time.sleep(wait_time)
        except requests.exceptions.ConnectionError:
            last_error = "فشل الاتصال بـ GLM API"
            wait_time = 2 ** attempt
            print(f"  ⚠️ فشل اتصال GLM — إعادة محاولة بعد {wait_time}ث ({attempt + 1}/{max_retries})")
            time.sleep(wait_time)
        except Exception as e:
            last_error = f"فشل استدعاء GLM: {e}"
            break  # خطأ غير متوقع — لا نعيد المحاولة

    return {"success": False, "error": last_error or "فشل استدعاء GLM بعد عدة محاولات"}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# تحليل رد GLM
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def _parse_glm_response(content: str, error_info: dict) -> dict:
    """يحلل رد GLM-5.1 ويستخرج معلومات الإصلاح."""

    # محاولة استخراج JSON من الرد
    json_str = _extract_json(content)

    if not json_str:
        return {
            "success": False,
            "analysis": f"لم يتم استخراج JSON من رد GLM: {content[:200]}",
            "fix_scope": error_info.get("type"),
            "is_safe": False,
            "file_path": error_info.get("file"),
            "line_number": error_info.get("line"),
            "fix_code": None,
            "explanation": None,
        }

    try:
        parsed = json.loads(json_str)
    except json.JSONDecodeError as e:
        return {
            "success": False,
            "analysis": f"JSON غير صالح من GLM: {e}",
            "fix_scope": error_info.get("type"),
            "is_safe": False,
            "file_path": error_info.get("file"),
            "line_number": error_info.get("line"),
            "fix_code": None,
            "explanation": None,
        }

    # التحقق من الأمان
    fix_scope = parsed.get("fix_scope", "")
    is_safe = parsed.get("is_safe", False)

    # تحقق مزدوج: حتى لو قال GLM أن الإصلاح آمن، نتحقق من النطاق المحظور
    safety_reason = parsed.get("safety_reason", "")
    for forbidden in FORBIDDEN_SCOPES:
        if forbidden in fix_scope or forbidden in safety_reason.lower():
            is_safe = False
            print(f"  🚫 الإصلاح محظور: النطاق '{forbidden}' في '{fix_scope}'")
            break

    # تحقق: هل النطاق ضمن المسموح؟
    scope_allowed = any(
        allowed in fix_scope for allowed in ALLOWED_FIX_SCOPES
    )
    if not scope_allowed and fix_scope:
        is_safe = False
        print(f"  🚫 النطاق '{fix_scope}' ليس ضمن المسموح: {ALLOWED_FIX_SCOPES}")

    return {
        "success": True,
        "analysis": parsed.get("explanation", "تحليل GLM"),
        "fix_scope": fix_scope,
        "is_safe": is_safe,
        "file_path": parsed.get("file_path") or error_info.get("file"),
        "line_number": parsed.get("line_number") or error_info.get("line"),
        "fix_code": parsed.get("fix_code"),
        "search_code": parsed.get("search_code"),
        "explanation": parsed.get("explanation"),
        "safety_reason": safety_reason,
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# استخراج JSON من النص
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def _extract_json(text: str) -> Optional[str]:
    """يستخرج كتلة JSON من النص (قد تكون داخل ```json ... ```)."""
    import re

    # محاولة 1: كتلة JSON محاطة بـ ```json ... ```
    match = re.search(r'```json\s*\n(.*?)\n```', text, re.DOTALL)
    if match:
        return match.group(1).strip()

    # محاولة 2: كتلة JSON محاطة بـ ``` ... ```
    match = re.search(r'```\s*\n(.*?)\n```', text, re.DOTALL)
    if match:
        candidate = match.group(1).strip()
        if candidate.startswith("{"):
            return candidate

    # محاولة 3: JSON مباشر في النص
    match = re.search(r'\{[^{}]*"fix_scope"[^{}]*\}', text, re.DOTALL)
    if match:
        return match.group(0)

    # محاولة 4: JSON مع تداخل
    brace_start = text.find("{")
    brace_end = text.rfind("}")
    if brace_start != -1 and brace_end > brace_start:
        candidate = text[brace_start:brace_end + 1]
        try:
            json.loads(candidate)
            return candidate
        except json.JSONDecodeError:
            pass

    return None
