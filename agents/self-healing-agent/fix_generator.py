"""
وكيل الإصلاح الذاتي — مولد الإصلاحات
يستخرج الكود المُصلح من رد GLM-5.1 ويُعدّه للتطبيق.
يتحقق من صلاحية الإصلاح ويولّد وصف PR.
"""

import json
import re
from typing import Optional

from config import ALLOWED_FIX_SCOPES, FORBIDDEN_SCOPES


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# نتيجة الإصلاح
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class FixResult:
    """نتيجة عملية توليد الإصلاح."""

    def __init__(
        self,
        success: bool = False,
        file_path: Optional[str] = None,
        search_code: Optional[str] = None,
        fix_code: Optional[str] = None,
        explanation: Optional[str] = None,
        fix_scope: Optional[str] = None,
        is_safe: bool = False,
        error: Optional[str] = None,
    ):
        self.success = success
        self.file_path = file_path
        self.search_code = search_code
        self.fix_code = fix_code
        self.explanation = explanation
        self.fix_scope = fix_scope
        self.is_safe = is_safe
        self.error = error

    def to_dict(self) -> dict:
        return {
            "success": self.success,
            "file_path": self.file_path,
            "search_code": self.search_code,
            "fix_code": self.fix_code,
            "explanation": self.explanation,
            "fix_scope": self.fix_scope,
            "is_safe": self.is_safe,
            "error": self.error,
        }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# توليد الإصلاح من تحليل GLM
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def generate_fix(analysis_result: dict) -> FixResult:
    """
    يولّد الإصلاح من نتيجة تحليل GLM-5.1.

    الخطوات:
    1. التحقق من نجاح التحليل
    2. التحقق من أمان الإصلاح
    3. التحقق من اكتمال الإصلاح (search_code + fix_code)
    4. التحقق من مسار الملف
    5. إعداد وصف الإصلاح
    """
    # 1. التحقق من نجاح التحليل
    if not analysis_result.get("success"):
        return FixResult(
            success=False,
            error=f"فشل التحليل: {analysis_result.get('analysis', 'غير معروف')}",
        )

    # 2. التحقق من أمان الإصلاح
    if not analysis_result.get("is_safe", False):
        return FixResult(
            success=False,
            is_safe=False,
            fix_scope=analysis_result.get("fix_scope"),
            error=f"الإصلاح غير آمن: {analysis_result.get('safety_reason', 'النطاق محظور')}",
        )

    # 3. التحقق من اكتمال الإصلاح
    fix_code = analysis_result.get("fix_code")
    search_code = analysis_result.get("search_code")

    if not fix_code:
        return FixResult(
            success=False,
            error="لم يُقدّم GLM كود إصلاح",
        )

    if not search_code:
        # محاولة استنتاج الكود القديم من الكود الجديد
        search_code = _infer_search_code(fix_code, analysis_result)
        if not search_code:
            # إذا لم نستطع الاستنتاج، نسمح بالإصلاح مع علامة append_only
            # هذا يعني أن الإصلاح سيُضاف بدلاً من استبدال كود موجود
            return FixResult(
                success=True,
                file_path=file_path,
                search_code=None,
                fix_code=fix_code,
                explanation=analysis_result.get("explanation", "") + " (إصلاح بدون كود بحث — يتطلب إضافة يدوية)",
                fix_scope=fix_scope,
                is_safe=True,
            )

    # 4. التحقق من مسار الملف
    file_path = analysis_result.get("file_path")
    if not file_path:
        return FixResult(
            success=False,
            error="لم يُحدد GLM مسار الملف",
        )

    # التحقق من أن المسار ضمن المشروع
    if not _is_valid_path(file_path):
        return FixResult(
            success=False,
            error=f"مسار الملف غير صالح أو خارج المشروع: {file_path}",
        )

    # 5. التحقق من نطاق الإصلاح
    fix_scope = analysis_result.get("fix_scope", "")
    if not _is_scope_allowed(fix_scope):
        return FixResult(
            success=False,
            is_safe=False,
            fix_scope=fix_scope,
            error=f"نطاق الإصلاح '{fix_scope}' غير مسموح به",
        )

    # 6. التحقق من أن الإصلاح لا يلمس منطق محظور
    if _contains_forbidden_code(fix_code, file_path):
        return FixResult(
            success=False,
            is_safe=False,
            error=f"الكود المُصلح يحتوي على منطق محظور في الملف: {file_path}",
        )

    # تنظيف الكود
    fix_code = _clean_code(fix_code)
    search_code = _clean_code(search_code)

    return FixResult(
        success=True,
        file_path=file_path,
        search_code=search_code,
        fix_code=fix_code,
        explanation=analysis_result.get("explanation", ""),
        fix_scope=fix_scope,
        is_safe=True,
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# توليد وصف PR
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def generate_pr_description(fix_result: FixResult, error_info: dict) -> str:
    """
    يولّد وصف Pull Request من نتيجة الإصلاح.

    يعيد نص وصف PR بتنسيق Markdown.
    """
    error_type = error_info.get("type", "unknown")
    error_message = error_info.get("message", "غير محدد")
    error_file = error_info.get("file", "غير محدد")

    description = f"""## إصلاح تلقائي بواسطة وكيل الإصلاح الذاتي

### الخطأ المُكتشف
- **النوع**: {error_type}
- **الرسالة**: {error_message}
- **الملف**: {error_file}

### الإصلاح المقترح
- **الملف المتأثر**: `{fix_result.file_path}`
- **نطاق الإصلاح**: {fix_result.fix_scope}
- **الشرح**: {fix_result.explanation}

### التغييرات
```diff
--- a/{fix_result.file_path}
+++ b/{fix_result.file_path}
@@ الكود القديم @@
- {fix_result.search_code}
@@ الكود الجديد @@
+ {fix_result.fix_code}
```

---
> **تحذير**: هذا الإصلاح تم توليده تلقائياً بواسطة GLM-5.1.
> يُرجى المراجعة البشرية الدقيقة قبل الدمج.
> **لا تدمج هذا PR بدون موافقة بشرية صريحة.**"""

    return description


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# توليد عنوان PR
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def generate_pr_title(fix_result: FixResult, error_info: dict) -> str:
    """يولّد عنوان PR مختصر."""
    error_type = error_info.get("type", "fix")
    file_name = fix_result.file_path or "unknown"
    if "/" in file_name:
        file_name = file_name.split("/")[-1]

    scope_label = fix_result.fix_scope or "general"
    return f"fix({scope_label}): {error_type} in {file_name}"


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# دوال مساعدة
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def _infer_search_code(fix_code: str, analysis: dict) -> Optional[str]:
    """
    يحاول استنتاج الكود القديم من الكود الجديد والتحليل.
    هذا احتياطي عندما لا يُقدّم GLM كود البحث.

    الاستراتيجية:
    1. إذا وُجد سطر واحد فقط في fix_code، نبحث عن السطر الأصلي عبر التعليقات
    2. إذا كان الإصلاح يتضمن استبدال نوع (مثل: string → number)، نستخرج النمط
    3. نعيد النتيجة فقط إذا كنا واثقين بنسبة ≥80%
    """
    if not fix_code or not fix_code.strip():
        return None

    lines = fix_code.strip().split("\n")

    # استراتيجية 1: إذا كان الإصلاح سطراً واحداً فيه استبدال واضح
    if len(lines) == 1:
        line = lines[0].strip()

        # نمط: إضافة قيمة افتراضية (مثل: variable → variable = defaultValue)
        import_match = re.search(r'import\s+\{?\s*(\w+)', line)
        if import_match:
            # الإصلاح يتضمن إضافة استيراد — نبحث عن الاستيراد المفقود
            return None  # لا يمكن الاستنتاج بأمان

        # نمط: تغيير في التعيين (مثل: const x = y → const x = y ?? defaultValue)
        assign_match = re.match(r'(\s*(?:const|let|var)\s+\w+\s*=\s*)(.+)', line)
        if assign_match:
            prefix = assign_match.group(1)
            new_value = assign_match.group(2)
            # إذا كان القيمة الجديدة تحتوي على ?? أو || ، القيمة القديمة هي الجزء الأول
            for op in [' ?? ', ' || ', ' ||=', ' ??= ']:
                if op in new_value:
                    old_value = new_value.split(op)[0].strip()
                    return f"{prefix}{old_value}"

        return None  # سطر واحد لكن بدون نمط واضح

    # استراتيجية 2: إصلاح متعدد الأسطر — لا يمكن الاستنتاج بأمان
    # لأن الاستبدال الخاطئ قد يُتلف الكود
    return None


def _is_valid_path(file_path: str) -> bool:
    """يتحقق من أن مسار الملف صالح وضمن المشروع."""
    if not file_path:
        return False

    # يجب أن يبدأ بـ apps/ أو packages/ أو prisma/
    valid_prefixes = ["apps/", "packages/", "prisma/"]
    if not any(file_path.startswith(prefix) for prefix in valid_prefixes):
        return False

    # لا يجب أن يحتوي على ..
    if ".." in file_path:
        return False

    # يجب أن ينتهي بامتداد صالح
    valid_extensions = [".ts", ".tsx", ".js", ".jsx", ".prisma", ".json", ".sql"]
    if not any(file_path.endswith(ext) for ext in valid_extensions):
        return False

    return True


def _is_scope_allowed(scope: str) -> bool:
    """يتحقق من أن نطاق الإصلاح مسموح به."""
    if not scope:
        return False

    for forbidden in FORBIDDEN_SCOPES:
        if forbidden in scope:
            return False

    for allowed in ALLOWED_FIX_SCOPES:
        if allowed in scope:
            return True

    # إذا لم يتطابق مع أي نطاق مسموح، نرفضه
    return False


def _contains_forbidden_code(code: str, file_path: str) -> bool:
    """يتحقق من أن الكود لا يلمس منطق محظور."""
    forbidden_patterns = [
        r"executeOrder",
        r"placeOrder",
        r"cancelOrder",
        r"closePosition",
        r"openPosition",
        r"riskManager",
        r"riskGatekeeper",
        r"RiskManager",
        r"RiskGatekeeper",
        r"checkRisk",
        r"validateRisk",
        r"twoFactor",
        r"2fa",
        r"verify2FA",
        r"tradingBot",
        r"TradingBot",
    ]

    for pattern in forbidden_patterns:
        if re.search(pattern, code, re.IGNORECASE):
            return True

    # التحقق من مسار الملف المحظور
    forbidden_paths = [
        "trading/trading.service",
        "trading/risk-manager",
        "trading/risk-gatekeeper",
        "trading/order-producer",
        "trading/order-consumer",
        "trading/position-manager",
        "auth/auth.service",
        "engine/services/trading-bot",
    ]
    for fp in forbidden_paths:
        if fp in file_path:
            return True

    return False


def _clean_code(code: str) -> str:
    """ينظف الكود من العلامات الزائدة."""
    if not code:
        return code

    # إزالة علامات الكود
    code = code.strip()
    if code.startswith("```") and code.endswith("```"):
        lines = code.split("\n")
        # إزالة السطر الأول (```typescript أو ```ts)
        if lines[0].startswith("```"):
            lines = lines[1:]
        # إزالة السطر الأخير (```)
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        code = "\n".join(lines)

    return code.strip()
