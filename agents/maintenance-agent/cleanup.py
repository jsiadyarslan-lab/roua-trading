"""
وحدة التنظيف لوكيل الصيانة.
تتضمن تنظيف الجلسات المنتهية، السجلات القديمة، الملفات المؤقتة، وضغط قاعدة البيانات.
"""

import os
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

import psycopg2
import psycopg2.extras


def cleanup_expired_sessions(db_url: str, max_age_hours: int, logger) -> dict:
    """
    يحذف الجلسات المنتهية الصلاحية من قاعدة البيانات.

    يبحث عن جدول Session أو session أو sessions أو أي جدول يحتوي على
    عمود تاريخ انتهاء (expires_at, expired_at, expiry, created_at).

    المعاملات:
        db_url: رابط اتصال قاعدة البيانات
        max_age_hours: أقصى عمر للجلسة بالساعات
        logger: كائن التسجيل (ColoredLogger)

    يعيد:
        قاموس الحالة: {success, deleted_count, table_used, error}
    """
    conn = None
    try:
        conn = psycopg2.connect(db_url)
        conn.autocommit = True
        cur = conn.cursor()

        # البحث عن جدول الجلسات
        session_table = _find_session_table(cur)
        if not session_table:
            logger.info("لم يتم العثور على جدول جلسات — تخطي تنظيف الجلسات")
            cur.close()
            return {
                "success": True,
                "deleted_count": 0,
                "table_used": "",
                "error": "",
            }

        # البحث عن عمود التاريخ المناسب
        date_column = _find_date_column(cur, session_table)
        if not date_column:
            logger.info(f"لم يتم العثور على عمود تاريخ في {session_table} — تخطي تنظيف الجلسات")
            cur.close()
            return {
                "success": True,
                "deleted_count": 0,
                "table_used": session_table,
                "error": "",
            }

        # حساب تاريخ الانتهاء
        cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)

        # عدد الجلسات قبل الحذف
        cur.execute(
            f"SELECT COUNT(*) FROM {session_table} WHERE {date_column} < %s",
            (cutoff,),
        )
        count_before = cur.fetchone()[0]

        if count_before == 0:
            logger.info("لا توجد جلسات منتهية الصلاحية للحذف")
            cur.close()
            return {
                "success": True,
                "deleted_count": 0,
                "table_used": session_table,
                "error": "",
            }

        # حذف الجلسات المنتهية
        cur.execute(
            f"DELETE FROM {session_table} WHERE {date_column} < %s",
            (cutoff,),
        )
        deleted_count = cur.rowcount

        logger.info(
            f"تم حذف {deleted_count} جلسة منتهية من {session_table} "
            f"(أقدم من {max_age_hours} ساعة)"
        )

        cur.close()
        return {
            "success": True,
            "deleted_count": deleted_count,
            "table_used": session_table,
            "error": "",
        }

    except psycopg2.OperationalError as e:
        logger.error(f"خطأ اتصال بقاعدة البيانات أثناء تنظيف الجلسات: {e}")
        return {
            "success": False,
            "deleted_count": 0,
            "table_used": "",
            "error": f"خطأ اتصال: {e}",
        }
    except Exception as e:
        logger.error(f"خطأ أثناء تنظيف الجلسات: {e}")
        return {
            "success": False,
            "deleted_count": 0,
            "table_used": "",
            "error": f"خطأ غير متوقع: {e}",
        }
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


def cleanup_old_logs(log_dir: str, max_age_days: int, logger) -> dict:
    """
    يحذف ملفات السجلات الأقدم من max_age_days.

    المعاملات:
        log_dir: مسار مجلد السجلات
        max_age_days: أقصى عمر للسجلات بالأيام
        logger: كائن التسجيل (ColoredLogger)

    يعيد:
        قاموس الحالة: {success, deleted_count, freed_bytes, error}
    """
    try:
        if not os.path.isdir(log_dir):
            logger.info(f"مجلد السجلات غير موجود: {log_dir} — تخطي التنظيف")
            return {
                "success": True,
                "deleted_count": 0,
                "freed_bytes": 0,
                "error": "",
            }

        cutoff_time = time.time() - (max_age_days * 86400)
        deleted_count = 0
        freed_bytes = 0

        for filename in os.listdir(log_dir):
            file_path = os.path.join(log_dir, filename)

            if not os.path.isfile(file_path):
                continue

            # فحص وقت التعديل الأخير للملف
            file_mtime = os.path.getmtime(file_path)

            if file_mtime < cutoff_time:
                try:
                    file_size = os.path.getsize(file_path)
                    os.remove(file_path)
                    deleted_count += 1
                    freed_bytes += file_size
                except OSError as e:
                    logger.warning(f"فشل حذف ملف السجل {filename}: {e}")

        if deleted_count > 0:
            freed_mb = freed_bytes / (1024 * 1024)
            logger.info(
                f"تم حذف {deleted_count} ملف سجل قديم — تم تحرير {freed_mb:.2f} ميغابايت"
            )
        else:
            logger.info("لا توجد ملفات سجلات قديمة للحذف")

        return {
            "success": True,
            "deleted_count": deleted_count,
            "freed_bytes": freed_bytes,
            "error": "",
        }

    except Exception as e:
        logger.error(f"خطأ أثناء تنظيف السجلات: {e}")
        return {
            "success": False,
            "deleted_count": 0,
            "freed_bytes": 0,
            "error": f"خطأ غير متوقع: {e}",
        }


def cleanup_temp_files(temp_dir: str, logger) -> dict:
    """
    يحذف الملفات المؤقتة الأقدم من 24 ساعة.

    المعاملات:
        temp_dir: مسار مجلد الملفات المؤقتة
        logger: كائن التسجيل (ColoredLogger)

    يعيد:
        قاموس الحالة: {success, deleted_count, freed_bytes, error}
    """
    try:
        if not os.path.isdir(temp_dir):
            logger.info(f"مجلد الملفات المؤقتة غير موجود: {temp_dir} — تخطي التنظيف")
            return {
                "success": True,
                "deleted_count": 0,
                "freed_bytes": 0,
                "error": "",
            }

        cutoff_time = time.time() - 86400  # 24 ساعة
        deleted_count = 0
        freed_bytes = 0

        for filename in os.listdir(temp_dir):
            file_path = os.path.join(temp_dir, filename)

            # تخطي المجلدات
            if not os.path.isfile(file_path):
                continue

            # تخطي الملفات المهمة
            if filename.startswith("."):
                continue

            # فحص وقت التعديل
            try:
                file_mtime = os.path.getmtime(file_path)
            except OSError:
                continue

            if file_mtime < cutoff_time:
                try:
                    file_size = os.path.getsize(file_path)
                    os.remove(file_path)
                    deleted_count += 1
                    freed_bytes += file_size
                except OSError as e:
                    logger.warning(f"فشل حذف الملف المؤقت {filename}: {e}")

        if deleted_count > 0:
            freed_mb = freed_bytes / (1024 * 1024)
            logger.info(
                f"تم حذف {deleted_count} ملف مؤقت — تم تحرير {freed_mb:.2f} ميغابايت"
            )
        else:
            logger.info("لا توجد ملفات مؤقتة قديمة للحذف")

        return {
            "success": True,
            "deleted_count": deleted_count,
            "freed_bytes": freed_bytes,
            "error": "",
        }

    except Exception as e:
        logger.error(f"خطأ أثناء تنظيف الملفات المؤقتة: {e}")
        return {
            "success": False,
            "deleted_count": 0,
            "freed_bytes": 0,
            "error": f"خطأ غير متوقع: {e}",
        }


def vacuum_database(db_url: str, logger) -> dict:
    """
    ينفذ أمر VACUUM ANALYZE على قاعدة البيانات لاستعادة المساحة.

    ملاحظة: VACUUM ANALYZE لا يمكن تنفيذه داخل معاملة، لذلك نستخدم
    autocommit=True.

    المعاملات:
        db_url: رابط اتصال قاعدة البيانات
        logger: كائن التسجيل (ColoredLogger)

    يعيد:
        قاموس الحالة: {success, tables_vacuumed, error}
    """
    conn = None
    try:
        conn = psycopg2.connect(db_url)
        conn.autocommit = True
        cur = conn.cursor()

        # عدد الجداول قبل VACUUM
        cur.execute("""
            SELECT COUNT(*) FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        """)
        tables_count = cur.fetchone()[0]

        # تنفيذ VACUUM ANALYZE
        logger.info("بدء تنفيذ VACUUM ANALYZE على قاعدة البيانات...")
        cur.execute("VACUUM ANALYZE")

        logger.info(
            f"تم تنفيذ VACUUM ANALYZE بنجاح — عدد الجداول: {tables_count}"
        )

        cur.close()
        return {
            "success": True,
            "tables_vacuumed": tables_count,
            "error": "",
        }

    except psycopg2.OperationalError as e:
        logger.error(f"خطأ اتصال أثناء VACUUM: {e}")
        return {
            "success": False,
            "tables_vacuumed": 0,
            "error": f"خطأ اتصال: {e}",
        }
    except psycopg2.Error as e:
        # VACUUM لا يمكن تنفيذه داخل معاملة
        logger.warning(f"خطأ أثناء VACUUM (قد يكون بسبب قفل): {e}")
        return {
            "success": False,
            "tables_vacuumed": 0,
            "error": f"خطأ VACUUM: {e}",
        }
    except Exception as e:
        logger.error(f"خطأ غير متوقع أثناء VACUUM: {e}")
        return {
            "success": False,
            "tables_vacuumed": 0,
            "error": f"خطأ غير متوقع: {e}",
        }
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass


def run_cleanup_cycle(config, alerter, logger) -> dict:
    """
    ينفذ دورة التنظيف الكاملة:
    تنظيف الجلسات ← تنظيف السجلات ← تنظيف الملفات المؤقتة ← ضغط قاعدة البيانات

    المعاملات:
        config: كائن الإعدادات (MaintenanceConfig)
        alerter: كائن تنبيهات Telegram (TelegramAlerter)
        logger: كائن التسجيل (ColoredLogger)

    يعيد:
        قاموس النتائج الكاملة للدورة
    """
    results = {
        "sessions": None,
        "logs": None,
        "temp_files": None,
        "vacuum": None,
        "overall_success": False,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "finished_at": "",
    }

    total_deleted = 0
    total_freed_bytes = 0
    has_errors = False

    # ── الخطوة 1: تنظيف الجلسات المنتهية ──
    logger.info("بدء تنظيف الجلسات المنتهية الصلاحية...")

    if config.DATABASE_URL:
        session_result = cleanup_expired_sessions(
            db_url=config.DATABASE_URL,
            max_age_hours=config.SESSION_MAX_AGE_HOURS,
            logger=logger,
        )
        results["sessions"] = session_result

        if session_result["success"]:
            total_deleted += session_result["deleted_count"]
            logger.info(f"تم حذف {session_result['deleted_count']} جلسة منتهية")
        else:
            has_errors = True
            logger.error(f"فشل تنظيف الجلسات: {session_result['error']}")
    else:
        logger.warning("DATABASE_URL غير مضبوط — تخطي تنظيف الجلسات")
        results["sessions"] = {"success": True, "deleted_count": 0, "table_used": "", "error": "DATABASE_URL غير مضبوط"}

    # ── الخطوة 2: تنظيف السجلات القديمة ──
    logger.info("بدء تنظيف ملفات السجلات القديمة...")

    log_result = cleanup_old_logs(
        log_dir=config.LOG_DIR,
        max_age_days=config.LOG_MAX_AGE_DAYS,
        logger=logger,
    )
    results["logs"] = log_result

    if log_result["success"]:
        total_deleted += log_result["deleted_count"]
        total_freed_bytes += log_result["freed_bytes"]
    else:
        has_errors = True
        logger.error(f"فشل تنظيف السجلات: {log_result['error']}")

    # ── الخطوة 3: تنظيف الملفات المؤقتة ──
    logger.info("بدء تنظيف الملفات المؤقتة...")

    temp_result = cleanup_temp_files(
        temp_dir=config.TEMP_DIR,
        logger=logger,
    )
    results["temp_files"] = temp_result

    if temp_result["success"]:
        total_deleted += temp_result["deleted_count"]
        total_freed_bytes += temp_result["freed_bytes"]
    else:
        has_errors = True
        logger.error(f"فشل تنظيف الملفات المؤقتة: {temp_result['error']}")

    # ── الخطوة 4: ضغط قاعدة البيانات ──
    logger.info("بدء ضغط قاعدة البيانات (VACUUM ANALYZE)...")

    if config.DATABASE_URL:
        vacuum_result = vacuum_database(
            db_url=config.DATABASE_URL,
            logger=logger,
        )
        results["vacuum"] = vacuum_result

        if not vacuum_result["success"]:
            has_errors = True
            logger.warning(f"تحذير في ضغط قاعدة البيانات: {vacuum_result['error']}")
    else:
        logger.warning("DATABASE_URL غير مضبوط — تخطي ضغط قاعدة البيانات")
        results["vacuum"] = {"success": True, "tables_vacuumed": 0, "error": "DATABASE_URL غير مضبوط"}

    # ── إعداد النتائج النهائية ──
    results["overall_success"] = not has_errors
    results["finished_at"] = datetime.now(timezone.utc).isoformat()

    # ── إرسال ملخص عبر Telegram ──
    if alerter.is_configured:
        total_freed_mb = total_freed_bytes / (1024 * 1024)

        stats = {
            "إجمالي العناصر المحذوفة": total_deleted,
            "المساحة المحررة": f"{total_freed_mb:.2f} ميغابايت",
            "جلسات محذوفة": results["sessions"]["deleted_count"] if results["sessions"] else 0,
            "سجلات محذوفة": results["logs"]["deleted_count"] if results["logs"] else 0,
            "ملفات مؤقتة محذوفة": results["temp_files"]["deleted_count"] if results["temp_files"] else 0,
            "ضغط قاعدة البيانات": "نجح" if results.get("vacuum", {}).get("success") else "فشل",
        }

        sections = []

        if results["sessions"] and results["sessions"]["deleted_count"] > 0:
            sections.append((
                "تنظيف الجلسات",
                [f"تم حذف {results['sessions']['deleted_count']} جلسة منتهية (أقدم من {config.SESSION_MAX_AGE_HOURS} ساعة)"],
            ))

        if results["logs"] and results["logs"]["deleted_count"] > 0:
            sections.append((
                "تنظيف السجلات",
                [f"تم حذف {results['logs']['deleted_count']} ملف سجل (أقدم من {config.LOG_MAX_AGE_DAYS} يوم)"],
            ))

        if results["temp_files"] and results["temp_files"]["deleted_count"] > 0:
            sections.append((
                "تنظيف الملفات المؤقتة",
                [f"تم حذف {results['temp_files']['deleted_count']} ملف مؤقت"],
            ))

        if results.get("vacuum", {}).get("success"):
            sections.append((
                "ضغط قاعدة البيانات",
                [f"تم ضغط {results['vacuum']['tables_vacuumed']} جدول"],
            ))

        severity = "ℹ️" if not has_errors else "⚠️"
        summary_msg = alerter.format_summary(
            agent_name="🔧 وكيل الصيانة",
            stats=stats,
            sections=sections,
        )
        # تعديل العنوان
        summary_msg = summary_msg.replace("ملخص دوري", "ملخص التنظيف")

        alerter.send(summary_msg, cooldown=0)

    logger.info("اكتملت دورة التنظيف")
    return results


# ── دوال مساعدة ──

def _find_session_table(cur) -> str:
    """يبحث عن جدول الجلسات في قاعدة البيانات."""
    possible_names = [
        "Session", "session", "sessions",
        "user_session", "user_sessions",
        "app_session", "app_sessions",
    ]

    try:
        cur.execute("""
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        """)
        existing_tables = {row[0] for row in cur.fetchall()}

        for name in possible_names:
            if name in existing_tables:
                return name

    except Exception:
        pass

    return ""


def _find_date_column(cur, table_name: str) -> str:
    """يبحث عن عمود التاريخ المناسب في جدول الجلسات."""
    possible_columns = [
        "expires_at", "expired_at", "expiry", "expire_time",
        "created_at", "createdAt", "updated_at", "updatedAt",
        "last_accessed", "last_access",
    ]

    try:
        cur.execute(f"""
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = %s
        """, (table_name.lower(),))
        existing_columns = {row[0] for row in cur.fetchall()}

        for col in possible_columns:
            if col in existing_columns:
                return col

    except Exception:
        pass

    return ""
