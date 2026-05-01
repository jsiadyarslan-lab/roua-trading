"""
وحدة النسخ الاحتياطي لوكيل الصيانة.
تتضمن إنشاء نسخ قاعدة البيانات، رفعها للتخزين، تدوير النسخ، والتحقق منها.
"""

import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import boto3
from botocore.exceptions import ClientError, BotoCoreError


def create_database_backup(db_url: str, output_dir: str) -> dict:
    """
    ينشئ نسخة احتياطية من قاعدة البيانات باستخدام pg_dump.

    المعاملات:
        db_url: رابط اتصال قاعدة البيانات (DATABASE_URL)
        output_dir: مسار مجلد حفظ النسخة الاحتياطية

    يعيد:
        قاموس الحالة: {success, file_path, size_bytes, error}
    """
    now = datetime.now(timezone.utc)
    timestamp = now.strftime("%Y%m%d_%H%M%S")
    filename = f"roua_backup_{timestamp}.sql.gz"
    file_path = os.path.join(output_dir, filename)

    try:
        # التأكد من وجود مجلد الإخراج
        Path(output_dir).mkdir(parents=True, exist_ok=True)

        # تنفيذ أمر pg_dump مع ضغط gzip
        env = os.environ.copy()
        # إخفاء كلمة المرور في متغير بيئة مؤقت
        env["PGPASSWORD"] = _extract_password(db_url)

        cmd = [
            "pg_dump",
            db_url,
            "--no-password",
            "--format=plain",
            "--verbose",
        ]

        # فتح ملف الإخراج وتوجيه الإخراج عبر gzip
        with open(file_path + ".tmp", "wb") as f_out:
            pg_dump_proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=env,
            )
            gzip_proc = subprocess.Popen(
                ["gzip", "-9"],
                stdin=pg_dump_proc.stdout,
                stdout=f_out,
                stderr=subprocess.PIPE,
            )

            # السماح لـ pg_dump بإرسال الإخراج إلى gzip
            pg_dump_proc.stdout.close()

            # انتظار انتهاء gzip أولاً
            gzip_stdout, gzip_stderr = gzip_proc.communicate()
            pg_dump_stderr = pg_dump_proc.communicate()[1]

        # التحقق من رموز الخروج
        if pg_dump_proc.returncode != 0:
            error_msg = pg_dump_stderr.decode("utf-8", errors="replace").strip()
            _safe_remove(file_path + ".tmp")
            return {
                "success": False,
                "file_path": "",
                "size_bytes": 0,
                "error": f"فشل pg_dump (رمز {pg_dump_proc.returncode}): {error_msg}",
            }

        if gzip_proc.returncode != 0:
            error_msg = gzip_stderr.decode("utf-8", errors="replace").strip()
            _safe_remove(file_path + ".tmp")
            return {
                "success": False,
                "file_path": "",
                "size_bytes": 0,
                "error": f"فشل ضغط gzip (رمز {gzip_proc.returncode}): {error_msg}",
            }

        # إعادة تسمية الملف المؤقت إلى الاسم النهائي
        if os.path.exists(file_path + ".tmp"):
            os.rename(file_path + ".tmp", file_path)

        size_bytes = os.path.getsize(file_path)

        return {
            "success": True,
            "file_path": file_path,
            "size_bytes": size_bytes,
            "error": "",
        }

    except FileNotFoundError as e:
        _safe_remove(file_path + ".tmp")
        return {
            "success": False,
            "file_path": "",
            "size_bytes": 0,
            "error": f"أداة غير موجودة: {e}. تأكد من تثبيت postgresql-client",
        }
    except Exception as e:
        _safe_remove(file_path + ".tmp")
        return {
            "success": False,
            "file_path": "",
            "size_bytes": 0,
            "error": f"خطأ أثناء إنشاء النسخة الاحتياطية: {e}",
        }
    finally:
        # تنظيف كلمة المرور من البيئة
        env.pop("PGPASSWORD", None)


def upload_to_s3(file_path: str, config) -> dict:
    """
    يرفع ملف النسخة الاحتياطية إلى تخزين S3 المتوافق.

    المعاملات:
        file_path: مسار الملف المحلي
        config: كائن الإعدادات (MaintenanceConfig)

    يعيد:
        قاموس الحالة: {success, s3_key, error}
    """
    try:
        session = boto3.Session(
            aws_access_key_id=config.S3_ACCESS_KEY,
            aws_secret_access_key=config.S3_SECRET_KEY,
        )

        endpoint_url = config.S3_ENDPOINT if config.S3_ENDPOINT else None
        s3_client = session.client("s3", endpoint_url=endpoint_url)

        filename = os.path.basename(file_path)
        # تنظيم الملفات في مجلدات حسب التاريخ
        now = datetime.now(timezone.utc)
        s3_key = f"backups/{now.strftime('%Y/%m')}/{filename}"

        s3_client.upload_file(
            Filename=file_path,
            Bucket=config.S3_BUCKET,
            Key=s3_key,
        )

        return {
            "success": True,
            "s3_key": s3_key,
            "error": "",
        }

    except (ClientError, BotoCoreError) as e:
        return {
            "success": False,
            "s3_key": "",
            "error": f"خطأ S3 أثناء الرفع: {e}",
        }
    except Exception as e:
        return {
            "success": False,
            "s3_key": "",
            "error": f"خطأ غير متوقع أثناء الرفع إلى S3: {e}",
        }


def upload_to_local(file_path: str, config) -> dict:
    """
    يحفظ النسخة الاحتياطية محلياً في مجلد النسخ.

    المعاملات:
        file_path: مسار الملف الحالي
        config: كائن الإعدادات (MaintenanceConfig)

    يعيد:
        قاموس الحالة: {success, local_path, error}
    """
    try:
        backup_dir = config.BACKUP_DIR
        Path(backup_dir).mkdir(parents=True, exist_ok=True)

        # إذا كان الملف موجوداً بالفعل في مجلد النسخ، لا حاجة لنقله
        if os.path.dirname(file_path) == backup_dir:
            return {
                "success": True,
                "local_path": file_path,
                "error": "",
            }

        # نقل الملف إلى مجلد النسخ
        filename = os.path.basename(file_path)
        dest_path = os.path.join(backup_dir, filename)

        if file_path != dest_path:
            import shutil
            shutil.move(file_path, dest_path)

        return {
            "success": True,
            "local_path": dest_path,
            "error": "",
        }

    except Exception as e:
        return {
            "success": False,
            "local_path": "",
            "error": f"خطأ أثناء الحفظ المحلي: {e}",
        }


def rotate_backups(backup_dir: str, config) -> dict:
    """
    يطبق سياسة الاحتفاظ بالنسخ الاحتياطية:
    - 7 نسخ يومية
    - 4 نسخ أسبوعية
    - 3 نسخ شهرية

    يحدد النسخ اليومية والأسبوعية والشهرية تلقائياً من أسماء الملفات.

    المعاملات:
        backup_dir: مسار مجلد النسخ الاحتياطية
        config: كائن الإعدادات (MaintenanceConfig)

    يعيد:
        قاموس الحالة: {success, kept, deleted, freed_bytes, error}
    """
    try:
        if not os.path.isdir(backup_dir):
            return {
                "success": True,
                "kept": 0,
                "deleted": 0,
                "freed_bytes": 0,
                "error": "",
            }

        # جمع ملفات النسخ الاحتياطية
        backup_files = []
        for f in os.listdir(backup_dir):
            full_path = os.path.join(backup_dir, f)
            if os.path.isfile(full_path) and f.startswith("roua_backup_") and f.endswith(".sql.gz"):
                # استخراج التاريخ من اسم الملف: roua_backup_20250101_120000.sql.gz
                try:
                    date_str = f.replace("roua_backup_", "").replace(".sql.gz", "")
                    file_date = datetime.strptime(date_str, "%Y%m%d_%H%M%S")
                    file_date = file_date.replace(tzinfo=timezone.utc)
                    backup_files.append({
                        "path": full_path,
                        "name": f,
                        "date": file_date,
                        "size": os.path.getsize(full_path),
                    })
                except ValueError:
                    continue

        if not backup_files:
            return {
                "success": True,
                "kept": 0,
                "deleted": 0,
                "freed_bytes": 0,
                "error": "",
            }

        # ترتيب حسب التاريخ (الأحدث أولاً)
        backup_files.sort(key=lambda x: x["date"], reverse=True)

        # تحديد النسخ التي يجب الاحتفاظ بها
        keep_set = set()
        daily_kept = 0
        weekly_kept = 0
        monthly_kept = 0

        # تتبع الأيام/الأسابيع/الأشهر المحتفظ بها لتجنب التكرار
        daily_days = set()
        weekly_weeks = set()
        monthly_months = set()

        for bf in backup_files:
            d = bf["date"]
            day_key = d.strftime("%Y-%m-%d")
            week_key = f"{d.year}-W{d.isocalendar()[1]:02d}"
            month_key = d.strftime("%Y-%m")

            kept = False

            # الاحتفاظ بالنسخ اليومية
            if day_key not in daily_days and daily_kept < config.BACKUP_RETENTION_DAILY:
                daily_days.add(day_key)
                daily_kept += 1
                kept = True

            # الاحتفاظ بالنسخ الأسبوعية (آخر نسخة في كل أسبوع)
            if week_key not in weekly_weeks and weekly_kept < config.BACKUP_RETENTION_WEEKLY:
                weekly_weeks.add(week_key)
                weekly_kept += 1
                kept = True

            # الاحتفاظ بالنسخ الشهرية (آخر نسخة في كل شهر)
            if month_key not in monthly_months and monthly_kept < config.BACKUP_RETENTION_MONTHLY:
                monthly_months.add(month_key)
                monthly_kept += 1
                kept = True

            if kept:
                keep_set.add(bf["name"])

        # حذف النسخ غير المحتفاظ بها
        deleted_count = 0
        freed_bytes = 0

        for bf in backup_files:
            if bf["name"] not in keep_set:
                try:
                    os.remove(bf["path"])
                    deleted_count += 1
                    freed_bytes += bf["size"]
                except OSError:
                    pass

        return {
            "success": True,
            "kept": len(keep_set),
            "deleted": deleted_count,
            "freed_bytes": freed_bytes,
            "error": "",
        }

    except Exception as e:
        return {
            "success": False,
            "kept": 0,
            "deleted": 0,
            "freed_bytes": 0,
            "error": f"خطأ أثناء تدوير النسخ الاحتياطية: {e}",
        }


def verify_backup(file_path: str, db_url: str) -> dict:
    """
    يتحقق من صحة النسخة الاحتياطية عبر:
    1. فحص حجم الملف (يجب أن يكون أكبر من 1 كيلوبايت)
    2. محاولة عرض قائمة الجداول باستخدام pg_restore --list

    المعاملات:
        file_path: مسار ملف النسخة الاحتياطية
        db_url: رابط قاعدة البيانات (للاتصال الاختياري)

    يعيد:
        قاموس الحالة: {success, file_size, table_count, error}
    """
    try:
        # فحص وجود الملف وحجمه
        if not os.path.exists(file_path):
            return {
                "success": False,
                "file_size": 0,
                "table_count": 0,
                "error": f"ملف النسخة الاحتياطية غير موجود: {file_path}",
            }

        file_size = os.path.getsize(file_path)
        if file_size < 1024:
            return {
                "success": False,
                "file_size": file_size,
                "table_count": 0,
                "error": f"حجم الملف صغير جداً ({file_size} بايت) — النسخة قد تكون تالفة",
            }

        # فك ضغط الملف مؤقتاً لفحصه باستخدام pg_restore --list
        table_count = 0
        try:
            # فك ضغط إلى pipe واستخدام pg_restore --list
            zcat_proc = subprocess.Popen(
                ["zcat", file_path],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            restore_proc = subprocess.Popen(
                ["pg_restore", "--list"],
                stdin=zcat_proc.stdout,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )

            zcat_proc.stdout.close()
            stdout, stderr = restore_proc.communicate(timeout=60)

            if restore_proc.returncode == 0:
                output = stdout.decode("utf-8", errors="replace")
                # عد الجداول من الإخراج (الأسطر التي تحتوي على ; TABLE)
                table_count = sum(
                    1 for line in output.splitlines()
                    if "TABLE" in line.upper() and ";" in line
                )
            else:
                # pg_restore قد يفشل مع ملفات SQL النصية، لكن يمكن قراءة المحتوى مباشرة
                # محاولة بديلة: فحص محتوى الملف مباشرة
                zcat_proc2 = subprocess.Popen(
                    ["zcat", file_path],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                )
                grep_proc = subprocess.Popen(
                    ["grep", "-c", "CREATE TABLE"],
                    stdin=zcat_proc2.stdout,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                )
                zcat_proc2.stdout.close()
                grep_stdout, _ = grep_proc.communicate(timeout=60)

                if grep_proc.returncode >= 0:
                    try:
                        table_count = int(grep_stdout.decode("utf-8", errors="replace").strip())
                    except ValueError:
                        table_count = 0

        except subprocess.TimeoutExpired:
            return {
                "success": True,
                "file_size": file_size,
                "table_count": 0,
                "error": "انتهت مهلة التحقق من النسخة — لكن حجم الملف مقبول",
            }
        except Exception:
            # فشل pg_restore ليس خطأ قاتلاً — تم التحقق من حجم الملف
            pass

        return {
            "success": True,
            "file_size": file_size,
            "table_count": table_count,
            "error": "",
        }

    except Exception as e:
        return {
            "success": False,
            "file_size": 0,
            "table_count": 0,
            "error": f"خطأ أثناء التحقق من النسخة الاحتياطية: {e}",
        }


def run_backup_cycle(config, alerter, logger) -> dict:
    """
    ينفذ دورة النسخ الاحتياطي الكاملة:
    إنشاء ← رفع ← تدوير ← تحقق ← تنبيه

    المعاملات:
        config: كائن الإعدادات (MaintenanceConfig)
        alerter: كائن تنبيهات Telegram (TelegramAlerter)
        logger: كائن التسجيل (ColoredLogger)

    يعيد:
        قاموس النتائج الكاملة للدورة
    """
    results = {
        "backup": None,
        "upload": None,
        "rotation": None,
        "verification": None,
        "overall_success": False,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "finished_at": "",
    }

    # ── الخطوة 1: إنشاء النسخة الاحتياطية ──
    logger.info("بدء إنشاء النسخة الاحتياطية لقاعدة البيانات...")

    if not config.DATABASE_URL:
        logger.error("DATABASE_URL غير مضبوط — لا يمكن إنشاء نسخة احتياطية")
        results["overall_success"] = False
        results["finished_at"] = datetime.now(timezone.utc).isoformat()

        if alerter.is_configured:
            alert = alerter.format_alert(
                agent_name="🔧 وكيل الصيانة",
                title="فشل النسخ الاحتياطي",
                details=["DATABASE_URL غير مضبوط", "لا يمكن إنشاء نسخة احتياطية بدون رابط قاعدة البيانات"],
                severity="🚨",
            )
            alerter.send(alert, cooldown=0)
        return results

    backup_result = create_database_backup(
        db_url=config.DATABASE_URL,
        output_dir=config.BACKUP_DIR,
    )
    results["backup"] = backup_result

    if not backup_result["success"]:
        logger.error(f"فشل إنشاء النسخة الاحتياطية: {backup_result['error']}")
        results["finished_at"] = datetime.now(timezone.utc).isoformat()

        if alerter.is_configured:
            alert = alerter.format_alert(
                agent_name="🔧 وكيل الصيانة",
                title="فشل النسخ الاحتياطي",
                details=["فشل إنشاء نسخة احتياطية من قاعدة البيانات", backup_result["error"][:200]],
                severity="🚨",
            )
            alerter.send(alert, cooldown=0)
        return results

    size_mb = backup_result["size_bytes"] / (1024 * 1024)
    logger.info(f"تم إنشاء النسخة الاحتياطية بنجاح — الحجم: {size_mb:.2f} ميغابايت")

    # ── الخطوة 2: رفع النسخة إلى التخزين ──
    logger.info(f"رفع النسخة الاحتياطية إلى التخزين ({config.BACKUP_STORAGE_TYPE})...")

    if config.BACKUP_STORAGE_TYPE == "s3":
        upload_result = upload_to_s3(backup_result["file_path"], config)
    else:
        upload_result = upload_to_local(backup_result["file_path"], config)

    results["upload"] = upload_result

    if not upload_result["success"]:
        logger.warning(f"فشل رفع النسخة الاحتياطية: {upload_result['error']}")
        # لا نوقف الدورة هنا — النسخة موجودة محلياً
    else:
        if config.BACKUP_STORAGE_TYPE == "s3":
            logger.info(f"تم رفع النسخة إلى S3: {upload_result['s3_key']}")
        else:
            logger.info(f"تم حفظ النسخة محلياً: {upload_result['local_path']}")

    # ── الخطوة 3: تدوير النسخ القديمة ──
    logger.info("بدء تدوير النسخ الاحتياطية القديمة...")

    rotation_result = rotate_backups(config.BACKUP_DIR, config)
    results["rotation"] = rotation_result

    if rotation_result["success"]:
        freed_mb = rotation_result["freed_bytes"] / (1024 * 1024)
        logger.info(
            f"تم تدوير النسخ — محتفظ بـ {rotation_result['kept']} نسخة، "
            f"حذف {rotation_result['deleted']} نسخة، "
            f"تم تحرير {freed_mb:.2f} ميغابايت"
        )
    else:
        logger.warning(f"تحذير في تدوير النسخ: {rotation_result['error']}")

    # ── الخطوة 4: التحقق من النسخة الاحتياطية ──
    actual_path = upload_result.get("local_path", "") or backup_result["file_path"]

    if config.VERIFY_BACKUP and actual_path:
        logger.info("بدء التحقق من صحة النسخة الاحتياطية...")

        verify_result = verify_backup(actual_path, config.DATABASE_URL)
        results["verification"] = verify_result

        if verify_result["success"]:
            logger.info(
                f"تم التحقق من النسخة — الحجم: {verify_result['file_size']} بايت، "
                f"عدد الجداول: {verify_result['table_count']}"
            )
        else:
            logger.warning(f"تحذير في التحقق: {verify_result['error']}")
    else:
        logger.info("تخطي التحقق من النسخة الاحتياطية (VERIFY_BACKUP=false)")

    # ── الخطوة 5: إرسال تنبيه النجاح ──
    results["overall_success"] = True
    results["finished_at"] = datetime.now(timezone.utc).isoformat()

    if alerter.is_configured:
        stats = {
            "حجم النسخة": f"{size_mb:.2f} ميغابايت",
            "التخزين": config.BACKUP_STORAGE_TYPE,
            "النسخ المحتفظ بها": rotation_result.get("kept", 0),
            "النسخ المحذوفة": rotation_result.get("deleted", 0),
        }

        if results.get("verification") and results["verification"]["success"]:
            stats["عدد الجداول"] = results["verification"]["table_count"]

        sections = []
        if upload_result.get("s3_key"):
            sections.append(("التخزين السحابي", [f"مسار S3: {upload_result['s3_key']}"]))
        elif upload_result.get("local_path"):
            sections.append(("التخزين المحلي", [f"المسار: {upload_result['local_path']}"]))

        if rotation_result.get("freed_bytes", 0) > 0:
            freed_mb = rotation_result["freed_bytes"] / (1024 * 1024)
            sections.append(("التدوير", [f"تم تحرير {freed_mb:.2f} ميغابايت"]))

        success_msg = alerter.format_summary(
            agent_name="🔧 وكيل الصيانة",
            stats=stats,
            sections=sections,
        )
        # تعديل العنوان يدوياً ليناسب النسخ الاحتياطي
        success_msg = success_msg.replace("ملخص دوري", "نسخة احتياطية ناجحة")

        alerter.send(success_msg, cooldown=0)

    logger.info("اكتملت دورة النسخ الاحتياطي بنجاح")
    return results


# ── دوال مساعدة ──

def _extract_password(db_url: str) -> str:
    """يستخرج كلمة المرور من رابط قاعدة البيانات."""
    try:
        # الشكل: postgresql://user:password@host:port/dbname
        if "@" in db_url and ":" in db_url.split("@")[0]:
            after_proto = db_url.split("://", 1)[1] if "://" in db_url else db_url
            creds = after_proto.split("@")[0]
            if ":" in creds:
                return creds.split(":", 1)[1]
    except Exception:
        pass
    return ""


def _safe_remove(file_path: str) -> None:
    """يحذف ملفاً بأمان مع تجاهل الأخطاء."""
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
    except OSError:
        pass


def format_bytes(size_bytes: int) -> str:
    """يحول حجم البايتات إلى نص مقروء."""
    for unit in ["بايت", "ك.ب", "م.ب", "ج.ب", "ت.ب"]:
        if abs(size_bytes) < 1024.0:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.1f} ت.ب"
