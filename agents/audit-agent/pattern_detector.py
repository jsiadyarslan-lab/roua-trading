"""
كاش الأنماط المشبوهة لوكيل التدقيق.
يفحص سجلات قاعدة البيانات للبحث عن أنشطة احتيالية أو مشبوهة.
"""

import psycopg2
from datetime import datetime, timezone, timedelta
from typing import Optional


def detect_suspicious_patterns(
    db_url: str,
    config,
    logger,
) -> list[dict]:
    """
    يفحص قاعدة البيانات بحثاً عن أنماط مشبوهة.

    يعيد:
        قائمة بالأنماط المكتشفة: [{type, severity, user_id, details}]
    """
    all_findings = []

    try:
        conn = psycopg2.connect(db_url, connect_timeout=10, application_name="audit-agent")
        conn.autocommit = True
        cur = conn.cursor()

        # 1. كشف تسجيلات الدخول من دول متعددة
        findings = _detect_multi_country_logins(cur, config, logger)
        all_findings.extend(findings)

        # 2. كشف حجم تداول غير عادي
        findings = _detect_unusual_trading_volume(cur, config, logger)
        all_findings.extend(findings)

        # 3. كشف أوامر مرفوضة بكثرة
        findings = _detect_high_rejected_orders(cur, config, logger)
        all_findings.extend(findings)

        # 4. كشف تعديل بيانات حساسة متكرر
        findings = _detect_credential_changes(cur, config, logger)
        all_findings.extend(findings)

        # 5. كشف استخدام API مفرط
        findings = _detect_api_abuse(cur, config, logger)
        all_findings.extend(findings)

        # 6. كشف جلسات منتهية الصلاحية غير مغلقة
        findings = _detect_stale_sessions(cur, config, logger)
        all_findings.extend(findings)

        cur.close()
        conn.close()

        return all_findings

    except psycopg2.errors.UndefinedTable as e:
        logger.warning(f"جدول غير موجود: {e}")
        return []
    except Exception as e:
        logger.error(f"خطأ في فحص الأنماط المشبوهة: {e}")
        return []


def _detect_multi_country_logins(cur, config, logger) -> list[dict]:
    """يكشف تسجيلات دخول من دول متعددة لنفس المستخدم."""
    findings = []

    try:
        # Check audit logs for login events from different IPs
        # Since we don't have country data directly, we check for multiple
        # distinct IP addresses for login actions
        cur.execute("""
            SELECT "userId", COUNT(DISTINCT "ipAddress") as ip_count,
                   array_agg(DISTINCT "ipAddress") as ips
            FROM "AuditLog"
            WHERE "action" LIKE '%login%' OR "action" LIKE '%auth%'
            AND "createdAt" >= NOW() - INTERVAL '24 hours'
            AND "userId" IS NOT NULL
            GROUP BY "userId"
            HAVING COUNT(DISTINCT "ipAddress") >= %s
        """, (config.MAX_COUNTRIES_PER_USER,))

        for row in cur.fetchall():
            user_id, ip_count, ips = row
            findings.append({
                "type": "multi_ip_login",
                "severity": "high" if ip_count >= 5 else "medium",
                "user_id": user_id,
                "details": f"{ip_count} عنوان IP مختلف في 24 ساعة: {ips[:3]}...",
            })
            logger.warning(f"نمط مشبوه: {ip_count} IPs للمستخدم {user_id}")

    except Exception as e:
        logger.debug(f"تخطي فحص تسجيل الدخول متعدد IPs: {e}")

    return findings


def _detect_unusual_trading_volume(cur, config, logger) -> list[dict]:
    """يكشف حجم تداول غير عادي."""
    findings = []

    try:
        # Users with abnormally high order counts in the last hour
        cur.execute("""
            SELECT "userId", COUNT(*) as order_count,
                   SUM("quantity" * COALESCE("price", 0)) as total_volume
            FROM "Order"
            WHERE "createdAt" >= NOW() - INTERVAL '1 hour'
            GROUP BY "userId"
            HAVING COUNT(*) >= %s
        """, (config.MAX_ORDERS_PER_HOUR,))

        for row in cur.fetchall():
            user_id, count, volume = row
            findings.append({
                "type": "high_trading_volume",
                "severity": "high" if count >= 100 else "medium",
                "user_id": user_id,
                "details": f"{count} طلب في ساعة واحدة (حجم: {float(volume or 0):,.2f})",
            })
            logger.warning(f"حجم تداول مرتفع: {count} طلب للمستخدم {user_id}")

    except Exception as e:
        logger.debug(f"تخطي فحص حجم التداول: {e}")

    return findings


def _detect_high_rejected_orders(cur, config, logger) -> list[dict]:
    """يكشف الأوامر المرفوضة بكثرة."""
    findings = []

    try:
        cur.execute("""
            SELECT "userId", COUNT(*) as rejected_count
            FROM "Order"
            WHERE "status" = 'REJECTED'
            AND "createdAt" >= NOW() - INTERVAL '24 hours'
            GROUP BY "userId"
            HAVING COUNT(*) >= %s
        """, (config.MAX_FAILED_ORDERS_PER_DAY,))

        for row in cur.fetchall():
            user_id, count = row
            findings.append({
                "type": "high_rejected_orders",
                "severity": "medium",
                "user_id": user_id,
                "details": f"{count} طلب مرفوض في 24 ساعة — محتمل مشكلة في الاستراتيجية أو إساءة استخدام",
            })

    except Exception as e:
        logger.debug(f"تخطي فحص الأوامر المرفوضة: {e}")

    return findings


def _detect_credential_changes(cur, config, logger) -> list[dict]:
    """يكشف تعديلات متكررة على بيانات Exchange Credentials."""
    findings = []

    try:
        # Multiple credential updates for same user in 24h
        cur.execute("""
            SELECT "userId", COUNT(*) as change_count
            FROM "ExchangeCredential"
            WHERE "updatedAt" >= NOW() - INTERVAL '24 hours'
            GROUP BY "userId"
            HAVING COUNT(*) >= 3
        """)

        for row in cur.fetchall():
            user_id, count = row
            findings.append({
                "type": "frequent_credential_changes",
                "severity": "high",
                "user_id": user_id,
                "details": f"{count} تعديل على بيانات Exchange في 24 ساعة — محتمل اختراق",
            })
            logger.warning(f"تعديلات مشبوهة على Credentials: {count}× للمستخدم {user_id}")

    except Exception as e:
        logger.debug(f"تخطي فحص بيانات الاعتماد: {e}")

    return findings


def _detect_api_abuse(cur, config, logger) -> list[dict]:
    """يكشف استخدام API مفرط من مستخدم واحد."""
    findings = []

    try:
        # Check AiUsageLog for excessive AI API usage
        cur.execute("""
            SELECT "userId", COUNT(*) as request_count,
                   SUM("costUsd") as total_cost
            FROM "AiUsageLog"
            WHERE "createdAt" >= NOW() - INTERVAL '1 hour'
            AND "userId" IS NOT NULL
            GROUP BY "userId"
            HAVING COUNT(*) >= 100 OR SUM("costUsd") >= 5
            ORDER BY total_cost DESC
            LIMIT 10
        """)

        for row in cur.fetchall():
            user_id, count, cost = row
            findings.append({
                "type": "ai_api_abuse",
                "severity": "medium",
                "user_id": user_id or "anonymous",
                "details": f"{count} طلب AI في ساعة (${float(cost or 0):.2f}) — استهلاك مفرط",
            })

    except Exception as e:
        logger.debug(f"تخطي فحص استخدام AI: {e}")

    return findings


def _detect_stale_sessions(cur, config, logger) -> list[dict]:
    """يكشف جلسات منتهية الصلاحية لم تُغلق."""
    findings = []

    try:
        cur.execute("""
            SELECT COUNT(*) as stale_count
            FROM "Session"
            WHERE "expiresAt" < NOW()
        """)

        row = cur.fetchone()
        if row and row[0] > 100:
            findings.append({
                "type": "stale_sessions",
                "severity": "low",
                "user_id": "system",
                "details": f"{row[0]} جلسة منتهية لم تُحذف — يجب تشغيل تنظيف الجلسات",
            })

    except Exception as e:
        logger.debug(f"تخطي فحص الجلسات المنتهية: {e}")

    return findings


def format_audit_report(findings: list[dict], logger) -> str:
    """
    يهيئ تقرير التدقيق لـ Telegram.
    """
    if not findings:
        return (
            "🔍 <b>وكيل التدقيق — تقرير يومي</b>\n\n"
            "✅ لم يتم اكتشاف أنماط مشبوهة\n"
            "جميع الأنشطة ضمن الحدود الطبيعية."
        )

    # ترتيب حسب الخطورة
    severity_order = {"high": 0, "medium": 1, "low": 2}
    findings.sort(key=lambda f: severity_order.get(f.get("severity", "low"), 3))

    lines = [
        "🔍 <b>وكيل التدقيق — تقرير يومي</b>",
        "",
        f"⚠️ تم اكتشاف <b>{len(findings)}</b> نمط مشبوه:",
        "",
    ]

    # تجميع حسب النوع
    by_type: dict[str, list] = {}
    for f in findings:
        by_type.setdefault(f["type"], []).append(f)

    type_names = {
        "multi_ip_login": "🌐 تسجيل دخول متعدد",
        "high_trading_volume": "📊 حجم تداول مرتفع",
        "high_rejected_orders": "❌ أوامر مرفوضة بكثرة",
        "frequent_credential_changes": "🔑 تعديلات بيانات متكررة",
        "ai_api_abuse": "🤖 استخدام AI مفرط",
        "stale_sessions": "⏰ جلسات منتهية",
    }

    for ftype, items in by_type.items():
        name = type_names.get(ftype, ftype)
        lines.append(f"<b>{name}:</b>")
        for item in items[:5]:
            icon = "🔴" if item["severity"] == "high" else "⚠️" if item["severity"] == "medium" else "ℹ️"
            lines.append(f"  {icon} مستخدم {item['user_id'][:8]}...: {item['details']}")
        lines.append("")

    return "\n".join(lines)
