"""
متتبع تكاليف النماذج لوكيل صحة النماذج.
يجلب بيانات الاستهلاك من جدول AiUsageLog ويحللها.
"""

import traceback
import psycopg2
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional
from collections import defaultdict


def _safe_int(val) -> int:
    """تحويل آمن إلى int — يدعم Decimal و None."""
    if val is None:
        return 0
    try:
        return int(val)
    except (ValueError, TypeError):
        return 0


def _safe_float(val) -> float:
    """تحويل آمن إلى float — يدعم Decimal و None."""
    if val is None:
        return 0.0
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.0


def fetch_usage_stats(
    db_url: str,
    logger,
) -> dict[str, dict]:
    """
    يجلب إحصائيات الاستهلاك لكل مزود من قاعدة البيانات.

    يعيد:
        قاموس: provider → {monthly_cost, daily_cost, total_requests, avg_latency, cache_hit_rate, models}
    """
    try:
        # Ensure sslmode for Railway connections
        connect_url = db_url
        if 'sslmode' not in connect_url:
            if 'railway.internal' not in db_url:
                connect_url += '?sslmode=no-verify' if '?' in connect_url else '&sslmode=no-verify'

        try:
            conn = psycopg2.connect(connect_url, connect_timeout=10, application_name="model-health-agent")
        except TypeError:
            # Fallback: some psycopg2 versions don't accept application_name
            conn = psycopg2.connect(connect_url, connect_timeout=10)
        conn.autocommit = True
        cur = conn.cursor()

        now = datetime.now(timezone.utc)
        month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        # Monthly cost per provider
        cur.execute("""
            SELECT
                provider,
                SUM("costUsd") as monthly_cost,
                COUNT(*) as total_requests,
                AVG("latencyMs") as avg_latency,
                SUM(CASE WHEN cached = true THEN 1 ELSE 0 END) as cached_count,
                SUM(CASE WHEN success = false THEN 1 ELSE 0 END) as error_count,
                SUM("inputTokens") as total_input_tokens,
                SUM("outputTokens") as total_output_tokens
            FROM "AiUsageLog"
            WHERE "createdAt" >= %s
            GROUP BY provider
        """, (month_start,))

        if cur.description is None:
            cur.close()
            conn.close()
            return {"_endpoints": {}, "_total_monthly": 0, "_total_daily": 0}

        columns = [desc[0] for desc in cur.description]
        rows = cur.fetchall()

        results: dict[str, dict] = {}
        for row in rows:
            d = dict(zip(columns, row))
            provider = str(d.get("provider", "unknown") or "unknown")
            total_req = _safe_int(d.get("total_requests"))
            cached = _safe_int(d.get("cached_count"))
            error_count = _safe_int(d.get("error_count"))

            results[provider] = {
                "monthly_cost": _safe_float(d.get("monthly_cost")),
                "total_requests": total_req,
                "avg_latency": _safe_float(d.get("avg_latency")),
                "cache_hit_rate": (cached / total_req * 100) if total_req > 0 else 0,
                "error_count": error_count,
                "error_rate": (error_count / total_req * 100) if total_req > 0 else 0,
                "total_input_tokens": _safe_int(d.get("total_input_tokens")),
                "total_output_tokens": _safe_int(d.get("total_output_tokens")),
                "daily_cost": 0.0,
                "models": {},
            }

        # Daily cost per provider
        cur.execute("""
            SELECT provider, SUM("costUsd") as daily_cost
            FROM "AiUsageLog"
            WHERE "createdAt" >= %s
            GROUP BY provider
        """, (day_start,))

        for row in cur.fetchall():
            provider = str(row[0])
            cost_val = row[1]
            if provider in results:
                results[provider]["daily_cost"] = _safe_float(cost_val)

        # Cost per model per provider (monthly)
        cur.execute("""
            SELECT provider, model, SUM("costUsd") as cost, COUNT(*) as requests,
                   AVG("latencyMs") as avg_latency
            FROM "AiUsageLog"
            WHERE "createdAt" >= %s
            GROUP BY provider, model
            ORDER BY cost DESC
        """, (month_start,))

        for row in cur.fetchall():
            provider = str(row[0])
            model = str(row[1])
            cost = row[2]
            requests = row[3]
            avg_lat = row[4]
            if provider in results:
                results[provider]["models"][model] = {
                    "cost": _safe_float(cost),
                    "requests": _safe_int(requests),
                    "avg_latency": _safe_float(avg_lat),
                }

        # Cost per endpoint (monthly)
        cur.execute("""
            SELECT endpoint, SUM("costUsd") as cost, COUNT(*) as requests
            FROM "AiUsageLog"
            WHERE "createdAt" >= %s
            GROUP BY endpoint
            ORDER BY cost DESC
        """, (month_start,))

        endpoint_stats = {}
        for row in cur.fetchall():
            endpoint = str(row[0] or "unknown")
            endpoint_stats[endpoint] = {
                "cost": _safe_float(row[1]),
                "requests": _safe_int(row[2]),
            }

        cur.close()
        conn.close()

        # Add endpoint stats to a special key
        # WARNING: must calculate totals BEFORE adding them to results dict
        # otherwise the generator will try to subscript the int values
        total_monthly = sum(r["monthly_cost"] for k, r in results.items() if not k.startswith("_"))
        total_daily = sum(r["daily_cost"] for k, r in results.items() if not k.startswith("_"))

        results["_endpoints"] = endpoint_stats
        results["_total_monthly"] = total_monthly
        results["_total_daily"] = total_daily

        return results

    except psycopg2.errors.UndefinedTable:
        logger.warning('جدول "AiUsageLog" غير موجود — ستبدأ الإحصائيات فارغة')
        return {"_endpoints": {}, "_total_monthly": 0, "_total_daily": 0}
    except Exception as e:
        logger.error(f"خطأ في جلب إحصائيات الاستهلاك: {e}")
        logger.error(f"نوع الخطأ: {type(e).__name__}")
        logger.error(f"تفاصيل الخطأ:\n{traceback.format_exc()}")
        return {"_endpoints": {}, "_total_monthly": 0, "_total_daily": 0}


def fetch_recent_errors(
    db_url: str,
    hours: int = 24,
    logger=None,
) -> list[dict]:
    """
    يجلب أخطاء النماذج من آخر N ساعة.

    يعيد:
        قائمة بالأخطاء: [{provider, model, endpoint, error, count}]
    """
    try:
        conn = psycopg2.connect(db_url, connect_timeout=10, application_name="model-health-agent")
        conn.autocommit = True
        cur = conn.cursor()

        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)

        cur.execute("""
            SELECT provider, model, endpoint, "errorMessage", COUNT(*) as count,
                   AVG("latencyMs") as avg_latency, MAX("createdAt") as last_occurrence
            FROM "AiUsageLog"
            WHERE success = false AND "createdAt" >= %s
            GROUP BY provider, model, endpoint, "errorMessage"
            ORDER BY count DESC
            LIMIT 20
        """, (cutoff,))

        columns = [desc[0] for desc in cur.description]
        rows = cur.fetchall()

        errors = []
        for row in rows:
            d = dict(zip(columns, row))
            errors.append({
                "provider": d.get("provider", ""),
                "model": d.get("model", ""),
                "endpoint": d.get("endpoint", ""),
                "error": d.get("errorMessage", "Unknown error"),
                "count": int(d.get("count", 0) or 0),
                "avg_latency": float(d.get("avg_latency", 0) or 0),
                "last_occurrence": d.get("last_occurrence", ""),
            })

        cur.close()
        conn.close()
        return errors

    except Exception as e:
        if logger:
            logger.error(f"خطأ في جلب أخطاء النماذج: {e}")
        return []


def check_budget_thresholds(
    usage_stats: dict,
    config,
    logger,
) -> list[dict]:
    """
    يفحص تجاوز عتبات الميزانية لكل مزود.

    يعيد:
        قائمة بالتنبيهات: [{provider, level, cost, budget, percent}]
    """
    alerts = []

    # Provider budget mapping
    provider_budgets = {
        "groq": config.MONTHLY_BUDGET_GROQ,
        "zhipu": config.MONTHLY_BUDGET_GLM,
        "glm": config.MONTHLY_BUDGET_GLM,
        "google": config.MONTHLY_BUDGET_GEMINI,
        "gemini": config.MONTHLY_BUDGET_GEMINI,
        "aws": config.MONTHLY_BUDGET_BEDROCK,
        "bedrock": config.MONTHLY_BUDGET_BEDROCK,
        "huggingface": config.MONTHLY_BUDGET_HF,
        "hf": config.MONTHLY_BUDGET_HF,
        "ollama": config.MONTHLY_BUDGET_OLLAMA,
        "openai": config.MONTHLY_BUDGET_OPENAI,
        "cerebras": config.MONTHLY_BUDGET_CEREBRAS,
        "nvidia": config.MONTHLY_BUDGET_NVIDIA,
        "mistral": config.MONTHLY_BUDGET_MISTRAL,
        "deepseek": config.MONTHLY_BUDGET_DEEPSEEK,
    }

    for provider, stats in usage_stats.items():
        if provider.startswith("_"):
            continue

        budget = provider_budgets.get(provider.lower(), 0)
        if budget <= 0:
            # No budget set = free/unlimited (like Ollama)
            continue

        cost = stats.get("monthly_cost", 0)
        percent = (cost / budget) * 100 if budget > 0 else 0

        if percent >= config.CRITICAL_THRESHOLD:
            level = "critical"
        elif percent >= config.ALERT_THRESHOLD:
            level = "warning"
        else:
            level = "ok"

        if level != "ok":
            alerts.append({
                "provider": provider,
                "level": level,
                "cost": cost,
                "budget": budget,
                "percent": round(percent, 1),
            })

    # Check global budget
    total_cost = usage_stats.get("_total_monthly", 0)
    total_budget = config.MONTHLY_BUDGET_TOTAL
    if total_budget > 0:
        total_percent = (total_cost / total_budget) * 100
        if total_percent >= config.CRITICAL_THRESHOLD:
            alerts.append({
                "provider": "GLOBAL",
                "level": "critical",
                "cost": total_cost,
                "budget": total_budget,
                "percent": round(total_percent, 1),
            })
        elif total_percent >= config.ALERT_THRESHOLD:
            alerts.append({
                "provider": "GLOBAL",
                "level": "warning",
                "cost": total_cost,
                "budget": total_budget,
                "percent": round(total_percent, 1),
            })

    return alerts


def check_latency_anomalies(
    usage_stats: dict,
    config,
    logger,
) -> list[dict]:
    """
    يفحص مشاكل زمن الاستجابة.

    يعيد:
        قائمة بتنبيهات زمن الاستجابة: [{provider, avg_latency, level}]
    """
    alerts = []

    for provider, stats in usage_stats.items():
        if provider.startswith("_"):
            continue

        avg_latency = stats.get("avg_latency", 0)
        if avg_latency >= config.LATENCY_CRITICAL_MS:
            alerts.append({
                "provider": provider,
                "avg_latency": round(avg_latency),
                "level": "critical",
                "threshold": config.LATENCY_CRITICAL_MS,
            })
        elif avg_latency >= config.LATENCY_WARNING_MS:
            alerts.append({
                "provider": provider,
                "avg_latency": round(avg_latency),
                "level": "warning",
                "threshold": config.LATENCY_WARNING_MS,
            })

    return alerts


def format_daily_report(
    usage_stats: dict,
    budget_alerts: list,
    latency_alerts: list,
    recent_errors: list,
    config,
) -> str:
    """
    يهيئ التقرير اليومي لـ Telegram.
    """
    lines = [
        "🧠 <b>وكيل صحة النماذج — تقرير يومي</b>",
        "",
    ]

    # Summary
    total_monthly = usage_stats.get("_total_monthly", 0)
    total_daily = usage_stats.get("_total_daily", 0)
    total_budget = config.MONTHLY_BUDGET_TOTAL
    budget_percent = (total_monthly / total_budget * 100) if total_budget > 0 else 0

    lines.extend([
        f"📊 <b>الملخص:</b>",
        f"  • تكلفة اليوم: <b>${total_daily:.2f}</b>",
        f"  • تكلفة الشهر: <b>${total_monthly:.2f}</b> / ${total_budget:.0f} ({budget_percent:.0f}%)",
        "",
    ])

    # Per-provider breakdown
    lines.append(f"🏢 <b>حسب المزود:</b>")
    for provider, stats in sorted(usage_stats.items(), key=lambda x: x[1].get("monthly_cost", 0) if not x[0].startswith("_") else 0, reverse=True):
        if provider.startswith("_"):
            continue
        cost = stats.get("monthly_cost", 0)
        daily = stats.get("daily_cost", 0)
        reqs = stats.get("total_requests", 0)
        latency = stats.get("avg_latency", 0)
        cache = stats.get("cache_hit_rate", 0)
        err_rate = stats.get("error_rate", 0)

        emoji = "✅" if err_rate < 5 else "⚠️" if err_rate < 20 else "🔴"
        lines.append(
            f"  {emoji} {provider}: ${cost:.2f} (اليوم: ${daily:.2f}) | "
            f"{reqs} طلب | {latency:.0f}ms | cache: {cache:.0f}%"
        )
    lines.append("")

    # Budget alerts
    if budget_alerts:
        lines.append(f"💰 <b>تنبيهات الميزانية:</b>")
        for alert in budget_alerts:
            icon = "🔴" if alert["level"] == "critical" else "⚠️"
            lines.append(
                f"  {icon} {alert['provider']}: ${alert['cost']:.2f} / ${alert['budget']:.0f} ({alert['percent']}%)"
            )
        lines.append("")

    # Latency alerts
    if latency_alerts:
        lines.append(f"⏱️ <b>تنبيهات زمن الاستجابة:</b>")
        for alert in latency_alerts:
            icon = "🔴" if alert["level"] == "critical" else "⚠️"
            lines.append(
                f"  {icon} {alert['provider']}: {alert['avg_latency']}ms (الحد: {alert['threshold']}ms)"
            )
        lines.append("")

    # Recent errors
    if recent_errors:
        lines.append(f"❌ <b>أحدث الأخطاء (24 ساعة):</b>")
        for err in recent_errors[:5]:
            lines.append(f"  • {err['provider']}/{err['model']}: {err['count']}× {err['error'][:60]}")
        lines.append("")

    # Top endpoints by cost
    endpoints = usage_stats.get("_endpoints", {})
    if endpoints:
        lines.append(f"🔗 <b>أعلى نقاط نهاية تكلفة:</b>")
        for endpoint, stats in sorted(endpoints.items(), key=lambda x: x[1].get("cost", 0), reverse=True)[:5]:
            lines.append(f"  • {endpoint}: ${stats['cost']:.2f} ({stats['requests']} طلب)")

    return "\n".join(lines)
