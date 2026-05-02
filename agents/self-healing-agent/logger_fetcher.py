"""
وكيل الإصلاح الذاتي — جالب سجلات Railway
يتصل بـ Railway API لجلب آخر سطور السجلات من الخدمة المحددة.
يدعم Railway GraphQL API v2.
"""

import json
import requests
from datetime import datetime, timezone
from typing import Optional

from config import (
    RAILWAY_API_TOKEN, RAILWAY_PROJECT_ID,
    RAILWAY_ENVIRONMENT_ID, RAILWAY_SERVICE_ID,
)

# Railway GraphQL API endpoint
RAILWAY_GRAPHQL_URL = "https://backboard.railway.app/graphql/v2"


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# جلب السجلات عبر Railway GraphQL API
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def fetch_railway_logs(
    lines: int = 50,
    filter_error: bool = True,
) -> dict:
    """
    يجلب آخر سطور السجلات من Railway.

    المعاملات:
        lines: عدد السطور المطلوبة (افتراضياً 50)
        filter_error: هل يُصفّي سجلات الخطأ فقط؟

    يعيد:
        قاموس يحتوي:
        - success: هل نجح الجلب؟
        - logs: قائمة السطور
        - error: رسالة الخطأ إن وجدت
        - raw_response: الرد الخام (للتشخيص)
    """
    if not RAILWAY_API_TOKEN:
        return {
            "success": False,
            "logs": [],
            "error": "RAILWAY_API_TOKEN غير مضبوط",
            "raw_response": None,
        }

    if not RAILWAY_SERVICE_ID:
        return {
            "success": False,
            "logs": [],
            "error": "RAILWAY_SERVICE_ID غير مضبوط",
            "raw_response": None,
        }

    headers = {
        "Authorization": f"Bearer {RAILWAY_API_TOKEN}",
        "Content-Type": "application/json",
    }

    # استعلام GraphQL لجلب السجلات
    query = """
    query GetDeploymentLogs($serviceId: String!, $environmentId: String!, $limit: Int!) {
      deploymentLogs(
        serviceId: $serviceId
        environmentId: $environmentId
        limit: $limit
      )
    }
    """

    # محاولة جلب السجلات عبر GraphQL
    variables = {
        "serviceId": RAILWAY_SERVICE_ID,
        "environmentId": RAILWAY_ENVIRONMENT_ID or "",
        "limit": lines,
    }

    try:
        resp = requests.post(
            RAILWAY_GRAPHQL_URL,
            headers=headers,
            json={"query": query, "variables": variables},
            timeout=30,
        )

        if resp.status_code != 200:
            return {
                "success": False,
                "logs": [],
                "error": f"Railway API أرجع HTTP {resp.status_code}",
                "raw_response": resp.text[:500],
            }

        data = resp.json()

        if "errors" in data:
            error_msg = data["errors"][0].get("message", "خطأ GraphQL غير معروف")
            return {
                "success": False,
                "logs": [],
                "error": f"خطأ GraphQL: {error_msg}",
                "raw_response": data,
            }

        logs_data = data.get("data", {}).get("deploymentLogs", [])

        if isinstance(logs_data, str):
            logs_data = logs_data.split("\n")
        elif isinstance(logs_data, list):
            logs_data = [str(line) for line in logs_data]
        else:
            logs_data = [str(logs_data)]

        # تصفية سجلات الخطأ إن طُلب
        if filter_error:
            error_keywords = [
                "error", "Error", "ERROR",
                "exception", "Exception", "EXCEPTION",
                "failed", "Failed", "FAILED",
                "TypeError", "ReferenceError", "SyntaxError",
                "Cannot find module", "Module not found",
                "Type '", "is not assignable",
                "Argument of type",
                "Property does not exist",
                "ENOENT", "ECONNREFUSED", "ETIMEDOUT",
                "PrismaClient", "prisma",
                "Nest", "InternalServerError",
                "Unhandled",
            ]
            filtered = [
                line for line in logs_data
                if any(kw in line for kw in error_keywords)
            ]
            # إذا لم نجد أخطاء بعد التصفية، نُعيد كل السجلات
            if not filtered:
                filtered = logs_data
            logs_data = filtered

        return {
            "success": True,
            "logs": logs_data[:lines],
            "error": None,
            "raw_response": None,
        }

    except requests.exceptions.Timeout:
        return {
            "success": False,
            "logs": [],
            "error": "انتهت مهلة الاتصال بـ Railway API",
            "raw_response": None,
        }
    except requests.exceptions.ConnectionError:
        return {
            "success": False,
            "logs": [],
            "error": "فشل الاتصال بـ Railway API",
            "raw_response": None,
        }
    except Exception as e:
        return {
            "success": False,
            "logs": [],
            "error": f"خطأ غير متوقع: {e}",
            "raw_response": None,
        }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# جلب السجلات عبر REST API (بديل)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def fetch_railway_logs_rest(lines: int = 50) -> dict:
    """
    طريقة بديلة لجلب السجلات عبر Railway REST API.
    تُستخدم إذا فشل GraphQL.
    """
    if not RAILWAY_API_TOKEN or not RAILWAY_SERVICE_ID:
        return {
            "success": False,
            "logs": [],
            "error": "RAILWAY_API_TOKEN أو RAILWAY_SERVICE_ID غير مضبوط",
        }

    headers = {
        "Authorization": f"Bearer {RAILWAY_API_TOKEN}",
        "Content-Type": "application/json",
    }

    # محاولة جلب أحدث نشر
    try:
        url = f"https://backboard.railway.app/api/v1/service/{RAILWAY_SERVICE_ID}/deployments"
        resp = requests.get(url, headers=headers, timeout=15)

        if resp.status_code != 200:
            return {
                "success": False,
                "logs": [],
                "error": f"فشل جلب النشر: HTTP {resp.status_code}",
            }

        deployments = resp.json()
        if not deployments:
            return {
                "success": False,
                "logs": [],
                "error": "لا توجد عمليات نشر",
            }

        # جلب سجلات أحدث نشر
        latest_deployment = deployments[0] if isinstance(deployments, list) else deployments
        deployment_id = latest_deployment.get("id", "")

        if not deployment_id:
            return {
                "success": False,
                "logs": [],
                "error": "لم يتم العثور على معرف النشر",
            }

        log_url = f"https://backboard.railway.app/api/v1/deployment/{deployment_id}/logs?limit={lines}"
        log_resp = requests.get(log_url, headers=headers, timeout=15)

        if log_resp.status_code != 200:
            return {
                "success": False,
                "logs": [],
                "error": f"فشل جلب السجلات: HTTP {log_resp.status_code}",
            }

        logs = log_resp.json()
        if isinstance(logs, str):
            logs = logs.split("\n")

        return {
            "success": True,
            "logs": logs[:lines],
            "error": None,
        }

    except Exception as e:
        return {
            "success": False,
            "logs": [],
            "error": f"خطأ REST API: {e}",
        }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# جلب السجلات مع محاولة بديلة
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def fetch_logs(lines: int = 50, filter_error: bool = True) -> dict:
    """
    يجلب السجلات مع تجربة الطريقة البديلة إذا فشلت الأولى.
    """
    # المحاولة الأولى: GraphQL
    result = fetch_railway_logs(lines=lines, filter_error=filter_error)

    if result["success"]:
        return result

    print(f"  ⚠️ فشل GraphQL، جارٍ تجربة REST API...")

    # المحاولة الثانية: REST API
    result = fetch_railway_logs_rest(lines=lines)

    if result["success"]:
        return result

    # إذا فشلت كلتا الطريقتين، نعيد النتيجة الأخيرة
    return result


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# استخراج الأخطاء من السجلات
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def extract_error_patterns(logs: list[str]) -> list[dict]:
    """
    يستخرج أنماط الأخطاء من السجلات ويعيد قائمة بالأخطاء المُصنفة.

    كل خطأ يحتوي:
    - type: نوع الخطأ (typescript_error, api_error, etc.)
    - message: رسالة الخطأ
    - file: الملف المتأثر (إن وُجد)
    - line: رقم السطر (إن وُجد)
    - raw: السطر الأصلي
    """
    patterns = []

    for line in logs:
        error_info = _parse_error_line(line)
        if error_info:
            patterns.append(error_info)

    return patterns


def _parse_error_line(line: str) -> Optional[dict]:
    """يحلل سطر خطأ واحد ويستخرج المعلومات منه."""

    # نمط خطأ TypeScript
    if "Type '" in line and "is not assignable" in line:
        return {
            "type": "typescript_error",
            "subtype": "type_mismatch",
            "message": line.strip(),
            "file": _extract_file_path(line),
            "line": _extract_line_number(line),
            "raw": line.strip(),
        }

    # نمط خطأ Property does not exist
    if "Property" in line and "does not exist" in line:
        return {
            "type": "typescript_error",
            "subtype": "undefined_reference",
            "message": line.strip(),
            "file": _extract_file_path(line),
            "line": _extract_line_number(line),
            "raw": line.strip(),
        }

    # نمط خطأ Cannot find module
    if "Cannot find module" in line or "Module not found" in line:
        return {
            "type": "typescript_error",
            "subtype": "missing_import",
            "message": line.strip(),
            "file": _extract_file_path(line),
            "line": _extract_line_number(line),
            "raw": line.strip(),
        }

    # نمط خطأ NestJS / API
    if "InternalServerError" in line or "Nest" in line and "ERROR" in line:
        return {
            "type": "api_error",
            "subtype": "server_error",
            "message": line.strip(),
            "file": _extract_file_path(line),
            "line": _extract_line_number(line),
            "raw": line.strip(),
        }

    # نمط خطأ Prisma
    if "PrismaClient" in line or "prisma" in line.lower() and "error" in line.lower():
        return {
            "type": "api_error",
            "subtype": "database_error",
            "message": line.strip(),
            "file": _extract_file_path(line),
            "line": _extract_line_number(line),
            "raw": line.strip(),
        }

    # نمط خطأ عام
    error_keywords = ["ERROR", "Error", "error", "Exception", "exception", "failed", "Failed"]
    if any(kw in line for kw in error_keywords):
        return {
            "type": "unknown_error",
            "subtype": "generic",
            "message": line.strip(),
            "file": _extract_file_path(line),
            "line": _extract_line_number(line),
            "raw": line.strip(),
        }

    return None


def _extract_file_path(line: str) -> Optional[str]:
    """يستخرج مسار الملف من سطر الخطأ."""
    import re
    # نمط: apps/web/src/file.tsx أو apps/api/src/file.ts
    match = re.search(r'(apps/\S+\.(ts|tsx|js|jsx))', line)
    if match:
        return match.group(1)
    # نمط: src/file.ts
    match = re.search(r'(src/\S+\.(ts|tsx|js|jsx))', line)
    if match:
        return match.group(1)
    return None


def _extract_line_number(line: str) -> Optional[int]:
    """يستخرج رقم السطر من سطر الخطأ."""
    import re
    # نمط: :123: أو line 123
    match = re.search(r':(\d+):', line)
    if match:
        return int(match.group(1))
    match = re.search(r'line (\d+)', line, re.IGNORECASE)
    if match:
        return int(match.group(1))
    return None
