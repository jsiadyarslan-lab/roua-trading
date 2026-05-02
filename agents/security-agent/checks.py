"""
فحوصات أمنية شاملة لمنصة روعة التجارية.
كل دالة تُجري فحصاً محدداً وتُعيد قاموساً بالنتيجة.
"""

import ssl
import socket
import requests
from datetime import datetime, timezone
from urllib.parse import urlparse


# ── ثوابت ──
_TIMEOUT = 15
_USER_AGENT = (
    "ROUA-Security-Agent/1.0 "
    "(Security Monitoring; +https://roua-trading-production.up.railway.app)"
)

_HEADERS_TO_CHECK = {
    "content-security-policy": {
        "name_ar": "سياسة أمان المحتوى (CSP)",
        "severity": "critical",
        "fail_msg": "رأس CSP غير موجود — المنصة معرضة لهجمات حقن النصوص البرمجية",
    },
    "strict-transport-security": {
        "name_ar": "HSTS (نقل صارم)",
        "severity": "critical",
        "fail_msg": "رأس HSTS غير موجود — اتصال HTTPS ليس إلزامياً",
    },
    "x-frame-options": {
        "name_ar": "حماية الإطارات (X-Frame-Options)",
        "severity": "medium",
        "fail_msg": "رأس X-Frame-Options غير موجود — المنصة معرضة لهجمات Clickjacking",
    },
    "x-content-type-options": {
        "name_ar": "خيارات نوع المحتوى",
        "severity": "medium",
        "fail_msg": "رأس X-Content-Type-Options غير موجود — المتصفح قد يفسّر الملفات بشكل خاطئ",
    },
    "referrer-policy": {
        "name_ar": "سياسة الإحالة",
        "severity": "low",
        "fail_msg": "رأس Referrer-Policy غير موجود — قد تتسرب بيانات عبر الإحالات",
    },
    "permissions-policy": {
        "name_ar": "سياسة الأذونات",
        "severity": "low",
        "fail_msg": "رأس Permissions-Policy غير موجود — صلاحيات المتصفح غير مقيدة",
    },
}

_EXPOSED_PATHS = [
    ("/.env", "critical", "ملف .env مكشوف — بيانات سرية مسربة"),
    ("/.git/HEAD", "critical", "مجلد .git مكشوف — الكود المصدري مسرب"),
    ("/.git/config", "critical", "ملف إعدادات Git مكشوف"),
    ("/package.json", "medium", "ملف package.json مكشوف — معلومات التبعيات مسربة"),
    ("/composer.json", "medium", "ملف composer.json مكشوف — معلومات التبعيات مسربة"),
    ("/.DS_Store", "low", "ملف .DS_Store مكشوف — معلومات بنية المجلدات"),
    ("/robots.txt", "low", "ملف robots.txt مكشوف — قد يكشف مسارات حساسة"),
    ("/sitemap.xml", "low", "ملف sitemap.xml مكشوف"),
    ("/wp-config.php", "critical", "ملف إعدادات WordPress مكشوف"),
    ("/config.php", "critical", "ملف إعدادات PHP مكشوف"),
    ("/.htaccess", "medium", "ملف .htaccess مكشوف — قواعد إعادة الكتابة مكشوفة"),
    ("/docker-compose.yml", "critical", "ملف docker-compose مكشوف — البنية التحتية مسربة"),
    ("/Dockerfile", "medium", "ملف Dockerfile مكشوف — تفاصيل البناء مسربة"),
    ("/.env.production", "critical", "ملف .env.production مكشوف — بيانات إنتاج سرية"),
    ("/.env.local", "critical", "ملف .env.local مكشوف — بيانات محلية سرية"),
    ("/server-status", "medium", "صفحة حالة الخادم مكشوفة"),
    ("/debug", "medium", "نقطة نهاية التصحيح مكشوفة"),
    ("/api-docs", "low", "توثيق API مكشوف"),
    ("/swagger.json", "low", "ملف Swagger مكشوف — مواصفات API مسربة"),
    ("/graphql", "medium", "نقطة نهاية GraphQL مكشوفة بدون مصادقة"),
]

_API_ENDPOINTS = [
    "/api/user/profile",
    "/api/user/settings",
    "/api/admin",
    "/api/admin/users",
    "/api/trades",
    "/api/wallet",
    "/api/wallet/balance",
    "/api/portfolio",
    "/api/orders",
    "/api/notifications",
]

_XSS_PAYLOADS = [
    "<script>alert(1)</script>",
    "'\"><script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "javascript:alert(1)",
]

_SQLI_PAYLOADS = [
    "' OR '1'='1",
    "1' OR '1'='1'--",
    "1; DROP TABLE users--",
    "' UNION SELECT NULL--",
    "1' AND 1=1--",
]


def _make_request(method: str, url: str, **kwargs) -> requests.Response | None:
    """يُجري طلب HTTP مع معالجة الأخطاء."""
    kwargs.setdefault("timeout", _TIMEOUT)
    kwargs.setdefault("headers", {"User-Agent": _USER_AGENT})
    kwargs.setdefault("allow_redirects", True)
    kwargs.setdefault("verify", True)
    try:
        return requests.request(method, url, **kwargs)
    except requests.exceptions.SSLError:
        raise
    except requests.exceptions.ConnectionError:
        return None
    except requests.exceptions.Timeout:
        return None
    except Exception:
        return None


def check_security_headers(url: str) -> list[dict]:
    """
    يفحص رؤوس الأمان HTTP.
    يتحقق من: CSP, HSTS, X-Frame-Options, X-Content-Type-Options,
    Referrer-Policy, Permissions-Policy.
    """
    results = []
    try:
        resp = _make_request("GET", url)
        if resp is None:
            for header_key, header_info in _HEADERS_TO_CHECK.items():
                results.append({
                    "name": f"رأس الأمان: {header_info['name_ar']}",
                    "severity": header_info["severity"],
                    "passed": False,
                    "details": f"لم يتم استلام استجابة من الخادم — لا يمكن التحقق من رأس {header_key}",
                })
            return results

        response_headers = {k.lower(): v for k, v in resp.headers.items()}

        for header_key, header_info in _HEADERS_TO_CHECK.items():
            if header_key in response_headers:
                value = response_headers[header_key]
                # فحص إضافي: هل القيمة فعّالة؟
                extra = ""
                passed = True

                if header_key == "strict-transport-security":
                    if "max-age=0" in value.lower():
                        passed = False
                        extra = " — max-age مضبوط على 0 (معطل)"
                    else:
                        max_age = 0
                        for part in value.split(";"):
                            part = part.strip()
                            if part.lower().startswith("max-age="):
                                try:
                                    max_age = int(part.split("=")[1])
                                except (ValueError, IndexError):
                                    pass
                        if max_age < 2592000:  # أقل من 30 يوم
                            extra = f" — max-age منخفض ({max_age} ثانية)، يُنصح برفعه"

                if header_key == "x-frame-options":
                    val_lower = value.lower()
                    if val_lower not in ("deny", "sameorigin"):
                        passed = False
                        extra = f" — قيمة غير صحيحة: {value}"

                if header_key == "content-security-policy":
                    if "unsafe-inline" in value and "unsafe-eval" in value:
                        extra = " — CSP يسمح بـ unsafe-inline و unsafe-eval (ضعيف)"
                    elif "unsafe-inline" in value:
                        extra = " — CSP يسمح بـ unsafe-inline (متوسط)"

                results.append({
                    "name": f"رأس الأمان: {header_info['name_ar']}",
                    "severity": header_info["severity"],
                    "passed": passed,
                    "details": (
                        f"موجود وقيمته: {value}{extra}" if passed
                        else f"موجود لكن قيمته غير فعّالة: {value}{extra}"
                    ),
                })
            else:
                results.append({
                    "name": f"رأس الأمان: {header_info['name_ar']}",
                    "severity": header_info["severity"],
                    "passed": False,
                    "details": header_info["fail_msg"],
                })

    except requests.exceptions.SSLError as e:
        results.append({
            "name": "رؤوس الأمان (فحص SSL)",
            "severity": "critical",
            "passed": False,
            "details": f"فشل اتصال SSL: {e}",
        })
    except Exception as e:
        results.append({
            "name": "رؤوس الأمان",
            "severity": "critical",
            "passed": False,
            "details": f"خطأ غير متوقع أثناء فحص الرؤوس: {e}",
        })

    return results


def test_xss_protection(url: str) -> list[dict]:
    """
    يختبر حماية المنصة من هجمات XSS.
    يرسل حمولات اختبار إلى نقاط نهاية شائعة ويتحقق من عدم انعكاسها في الاستجابة.
    """
    results = []
    parsed = urlparse(url)
    base_url = f"{parsed.scheme}://{parsed.netloc}"

    # نقاط نهاية شائعة للاختبار
    test_endpoints = [
        "/search",
        "/api/search",
        "/login",
        "/register",
        "/api/contact",
        "/api/feedback",
    ]

    found_reflected = False
    tested_count = 0

    for endpoint in test_endpoints:
        for payload in _XSS_PAYLOADS:
            test_url = f"{base_url}{endpoint}"
            # اختبار عبر معامل الاستعلام
            try:
                resp = _make_request(
                    "GET", test_url, params={"q": payload, "search": payload}
                )
                tested_count += 1

                if resp is not None:
                    # التحقق من عدم انعكاس الحمولة كما هي في الاستجابة
                    if payload in resp.text:
                        found_reflected = True
                        results.append({
                            "name": f"حماية XSS — انعكاس في {endpoint}",
                            "severity": "critical",
                            "passed": False,
                            "details": (
                                f"الحمولة انعكست في الاستجابة عبر {endpoint} — "
                                f"المنصة معرضة لهجوم XSS. الحمولة: {payload[:30]}..."
                            ),
                        })
                        break
            except Exception:
                tested_count += 1
                continue

        if found_reflected:
            break

    if not found_reflected:
        results.append({
            "name": "حماية XSS",
            "severity": "medium",
            "passed": True,
            "details": f"لم تُعكس أي حمولة XSS في {tested_count} اختبار — الحماية فعّالة",
        })

    return results


def test_sql_injection(url: str) -> list[dict]:
    """
    يختبر حماية المنصة من حقن SQL.
    يرسل حمولات اختبار ويتحقق من عدم ظهور أخطاء قاعدة بيانات في الاستجابة.
    """
    results = []
    parsed = urlparse(url)
    base_url = f"{parsed.scheme}://{parsed.netloc}"

    # مؤشرات خطأ قاعدة البيانات
    db_error_patterns = [
        "sql syntax",
        "mysql",
        "postgresql",
        "sqlite",
        "oracle",
        "odbc",
        "sqlstate",
        "syntax error",
        "unclosed quotation mark",
        "quoted string not properly terminated",
        "pg_query",
        "sql error",
        "database error",
        "db_",
        "ORA-0",
        "Microsoft OLE DB",
        "SQLServer",
    ]

    test_endpoints = [
        "/api/user/profile",
        "/login",
        "/register",
        "/api/trades",
        "/search",
    ]

    found_sqli = False
    tested_count = 0

    for endpoint in test_endpoints:
        for payload in _SQLI_PAYLOADS:
            test_url = f"{base_url}{endpoint}"
            try:
                # اختبار عبر معامل الاستعلام
                resp = _make_request(
                    "GET", test_url, params={"id": payload, "user": payload}
                )
                tested_count += 1

                if resp is not None:
                    text_lower = resp.text.lower()
                    for pattern in db_error_patterns:
                        if pattern.lower() in text_lower:
                            found_sqli = True
                            results.append({
                                "name": f"حماية SQLi — خطأ قاعدة بيانات في {endpoint}",
                                "severity": "critical",
                                "passed": False,
                                "details": (
                                    f"تم كشف خطأ قاعدة بيانات محتمل عبر {endpoint} — "
                                    f"النمط: '{pattern}'. قد تكون المنصة معرضة لحقن SQL"
                                ),
                            })
                            break

                if found_sqli:
                    break

            except Exception:
                tested_count += 1
                continue

        if found_sqli:
            break

    if not found_sqli:
        results.append({
            "name": "حماية حقن SQL",
            "severity": "medium",
            "passed": True,
            "details": f"لم تُكتشف أي أخطاء قاعدة بيانات في {tested_count} اختبار — الحماية فعّالة",
        })

    return results


def check_cors_policy(url: str) -> list[dict]:
    """
    يفحص سياسة CORS للتأكد من عدم السماح بأصول غير موثوقة.
    يتحقق من أن الخادم لا يسمح بالوصول من أي أصل (*).
    """
    results = []
    parsed = urlparse(url)
    base_url = f"{parsed.scheme}://{parsed.netloc}"

    test_origins = [
        "https://evil-phishing-site.com",
        "https://malicious-domain.xyz",
    ]

    # فحص نقاط نهاية API
    api_paths = ["/api/user/profile", "/api/trades", "/api/wallet", "/api/"]

    cors_wildcard_found = False
    tested_count = 0

    for path in api_paths:
        test_url = f"{base_url}{path}"

        for origin in test_origins:
            try:
                resp = _make_request(
                    "OPTIONS", test_url,
                    headers={
                        "User-Agent": _USER_AGENT,
                        "Origin": origin,
                        "Access-Control-Request-Method": "GET",
                    },
                )
                tested_count += 1

                if resp is not None:
                    acao = resp.headers.get("Access-Control-Allow-Origin", "")
                    acac = resp.headers.get("Access-Control-Allow-Credentials", "")

                    if acao == "*":
                        cors_wildcard_found = True
                        results.append({
                            "name": f"سياسة CORS — أصل عام في {path}",
                            "severity": "critical",
                            "passed": False,
                            "details": (
                                f"الخادم يسمح بالوصول من أي أصل (*) عبر {path} — "
                                f"هذا يتيح لأي موقع إجراء طلبات عبر الأصول"
                            ),
                        })
                        break
                    elif acao == origin and acac.lower() == "true":
                        cors_wildcard_found = True
                        results.append({
                            "name": f"سياسة CORS — انعكاس أصل خبيث في {path}",
                            "severity": "critical",
                            "passed": False,
                            "details": (
                                f"الخادم يعكس أي أصل مع بيانات الاعتماد عبر {path} — "
                                f"الأصل الخبيث '{origin}' قُبل مع Allow-Credentials: true"
                            ),
                        })
                        break

            except Exception:
                tested_count += 1
                continue

        if cors_wildcard_found:
            break

    if not cors_wildcard_found:
        results.append({
            "name": "سياسة CORS",
            "severity": "medium",
            "passed": True,
            "details": f"لم يُسمح بأصول عامة أو خبيثة في {tested_count} اختبار — السياسة آمنة",
        })

    return results


def check_ssl_certificate(url: str) -> list[dict]:
    """
    يفحص شهادة SSL للتأكد من صحتها وعدم اقتراب انتهائها.
    يتحقق من: صلاحية الشهادة، تاريخ الانتهاء، إصدار بروتوكول TLS.
    """
    results = []
    parsed = urlparse(url)
    hostname = parsed.hostname
    port = parsed.port or 443

    if not hostname:
        results.append({
            "name": "فحص شهادة SSL",
            "severity": "critical",
            "passed": False,
            "details": "لم يتم تحديد اسم المضيف في الرابط",
        })
        return results

    # ── فحص الشهادة عبر اتصال SSL ──
    try:
        context = ssl.create_default_context()
        with socket.create_connection((hostname, port), timeout=_TIMEOUT) as sock:
            with context.wrap_socket(sock, server_hostname=hostname) as ssock:
                cert = ssock.getpeercert()
                protocol_version = ssock.version()

                if not cert:
                    results.append({
                        "name": "شهادة SSL",
                        "severity": "critical",
                        "passed": False,
                        "details": "لم يتم استلام شهادة SSL من الخادم",
                    })
                    return results

                # التحقق من صلاحية الشهادة
                not_after_str = cert.get("notAfter", "")
                if not_after_str:
                    # تحليل تاريخ الانتهاء
                    try:
                        not_after = datetime.strptime(
                            not_after_str, "%b %d %H:%M:%S %Y %Z"
                        ).replace(tzinfo=timezone.utc)
                        now = datetime.now(timezone.utc)
                        days_remaining = (not_after - now).days

                        if days_remaining <= 0:
                            results.append({
                                "name": "شهادة SSL — منتهية الصلاحية",
                                "severity": "critical",
                                "passed": False,
                                "details": (
                                    f"شهادة SSL منتهية الصلاحية منذ "
                                    f"{abs(days_remaining)} يوم — الاتصال غير آمن!"
                                ),
                            })
                        elif days_remaining <= 7:
                            results.append({
                                "name": "شهادة SSL — قاربت الانتهاء",
                                "severity": "critical",
                                "passed": False,
                                "details": (
                                    f"شهادة SSL تنتهي خلال {days_remaining} يوم فقط — "
                                    f"يجب تجديدها فوراً"
                                ),
                            })
                        elif days_remaining <= 30:
                            results.append({
                                "name": "شهادة SSL — تنتهي قريباً",
                                "severity": "medium",
                                "passed": True,
                                "details": f"شهادة SSL تنتهي خلال {days_remaining} يوم — يُنصح بتجديدها",
                            })
                        else:
                            results.append({
                                "name": "شهادة SSL — صالحة",
                                "severity": "low",
                                "passed": True,
                                "details": (
                                    f"شهادة SSL صالحة وتبقى {days_remaining} يوم على انتهائها"
                                ),
                            })
                    except ValueError:
                        results.append({
                            "name": "شهادة SSL — تاريخ غير مقروء",
                            "severity": "medium",
                            "passed": True,
                            "details": f"تعذر تحليل تاريخ الانتهاء: {not_after_str}",
                        })

                # التحقق من اسم المضيف في الشهادة
                san_list = cert.get("subjectAltName", [])
                host_matched = False
                for san_type, san_value in san_list:
                    if san_type == "DNS":
                        if san_value == hostname:
                            host_matched = True
                            break
                        # دعم شهادات Wildcard
                        if san_value.startswith("*."):
                            domain_suffix = san_value[1:]  # إزالة النجمة
                            if hostname.endswith(domain_suffix):
                                host_matched = True
                                break

                cn_matched = False
                for rdn in cert.get("subject", ()):
                    for attr_type, attr_value in rdn:
                        if attr_type == "commonName" and attr_value == hostname:
                            cn_matched = True
                            break

                if not host_matched and not cn_matched:
                    san_names = [v for t, v in san_list if t == "DNS"]
                    results.append({
                        "name": "شهادة SSL — عدم تطابق اسم المضيف",
                        "severity": "critical",
                        "passed": False,
                        "details": (
                            f"اسم المضيف '{hostname}' غير مطابق للشهادة — "
                            f"الأسماء المعتمدة: {', '.join(san_names[:5]) if san_names else 'لا يوجد'}"
                        ),
                    })

                # التحقق من إصدار البروتوكول
                if protocol_version:
                    tls_version_map = {
                        "TLSv1": "TLS 1.0 (قديم وغير آمن)",
                        "TLSv1.1": "TLS 1.1 (قديم وغير آمن)",
                        "TLSv1.2": "TLS 1.2 (آمن)",
                        "TLSv1.3": "TLS 1.3 (الأكثر أماناً)",
                    }
                    version_desc = tls_version_map.get(protocol_version, protocol_version)

                    if protocol_version in ("TLSv1", "TLSv1.1"):
                        results.append({
                            "name": "بروتوكول SSL/TLS",
                            "severity": "critical",
                            "passed": False,
                            "details": f"الخادم يستخدم {version_desc} — يجب الترقية إلى TLS 1.2 أو أحدث",
                        })
                    else:
                        results.append({
                            "name": "بروتوكول SSL/TLS",
                            "severity": "low",
                            "passed": True,
                            "details": f"الخادم يستخدم {version_desc}",
                        })

    except ssl.SSLCertVerificationError as e:
        results.append({
            "name": "شهادة SSL — فشل التحقق",
            "severity": "critical",
            "passed": False,
            "details": f"فشل التحقق من شهادة SSL: {e}",
        })
    except ssl.SSLError as e:
        results.append({
            "name": "شهادة SSL — خطأ SSL",
            "severity": "critical",
            "passed": False,
            "details": f"خطأ في اتصال SSL: {e}",
        })
    except socket.timeout:
        results.append({
            "name": "شهادة SSL — انتهت المهلة",
            "severity": "medium",
            "passed": False,
            "details": f"انتهت مهلة الاتصال بالخادم {hostname}:{port}",
        })
    except ConnectionRefusedError:
        results.append({
            "name": "شهادة SSL — رفض الاتصال",
            "severity": "critical",
            "passed": False,
            "details": f"تم رفض الاتصال بالخادم {hostname}:{port}",
        })
    except Exception as e:
        results.append({
            "name": "شهادة SSL — خطأ غير متوقع",
            "severity": "critical",
            "passed": False,
            "details": f"خطأ غير متوقع أثناء فحص SSL: {type(e).__name__}: {e}",
        })

    return results


def check_exposed_files(url: str) -> list[dict]:
    """
    يفحص وجود ملفات ومسارات حساسة مكشوفة.
    يتحقق من: .env, .git, package.json, إعدادات, ملفات Docker، إلخ.
    """
    results = []
    parsed = urlparse(url)
    base_url = f"{parsed.scheme}://{parsed.netloc}"
    found_count = 0

    for path, severity, description in _EXPOSED_PATHS:
        test_url = f"{base_url}{path}"
        try:
            resp = _make_request("GET", test_url)

            if resp is not None and resp.status_code == 200:
                # فحص إضافي للتأكد من أن المحتوى حقيقي وليس صفحة 404 مخصصة
                content_length = len(resp.text)
                is_real_content = True

                # التحقق من أن المحتوى ليس صفحة إعادة توجيه أو خطأ مخصصة
                content_lower = resp.text.lower()
                fake_indicators = [
                    "not found", "404", "page not found",
                    "does not exist", "no longer available",
                ]
                indicator_count = sum(
                    1 for ind in fake_indicators if ind in content_lower
                )
                # إذا كان المحتوى قصيراً جداً أو يحتوي على عدة مؤشرات خطأ
                if content_length < 50 or indicator_count >= 2:
                    is_real_content = False

                if is_real_content:
                    found_count += 1
                    results.append({
                        "name": f"ملف مكشوف: {path}",
                        "severity": severity,
                        "passed": False,
                        "details": f"{description} (حجم الاستجابة: {content_length} بايت)",
                    })

        except Exception:
            continue

    if found_count == 0:
        results.append({
            "name": "ملفات مكشوفة",
            "severity": "low",
            "passed": True,
            "details": f"لم يُكتشف أي ملف حساس مكشوف عبر {len(_EXPOSED_PATHS)} مسار تم اختباره",
        })

    return results


def check_api_auth(url: str) -> list[dict]:
    """
    يفحص أن نقاط نهاية API المحمية تتطلب مصادقة.
    يتحقق من أن الطلبات بدون بيانات اعتماد تُعيد 401 أو 403.
    """
    results = []
    parsed = urlparse(url)
    base_url = f"{parsed.scheme}://{parsed.netloc}"

    unprotected_endpoints = []
    tested_count = 0

    for endpoint in _API_ENDPOINTS:
        test_url = f"{base_url}{endpoint}"
        try:
            resp = _make_request("GET", test_url)
            tested_count += 1

            if resp is not None:
                # الحالات المقبولة: 401 (غير مصادق)، 403 (محظور)،
                # 405 (الطريقة غير مسموحة)، أو إعادة توجيه لتسجيل الدخول
                status = resp.status_code

                if status in (401, 403):
                    # مصادقة مطلوبة — صحيح
                    continue
                elif status == 405:
                    # الطريقة غير مسموحة — نقطة النهاية موجودة لكن GET غير مسموح
                    continue
                elif status in (301, 302, 303, 307, 308):
                    # إعادة توجيه — غالباً لتسجيل الدخول
                    location = resp.headers.get("Location", "")
                    if "login" in location.lower() or "auth" in location.lower():
                        continue
                    # إعادة توجيه بدون مصادقة واضحة
                    unprotected_endpoints.append(
                        (endpoint, f"إعادة توجيه إلى {location[:80]}")
                    )
                elif status == 200:
                    # الوصول مسموح بدون مصادقة — مشكلة محتملة
                    # استثناء: نقاط نهاية عامة مثل /api/ قد تكون مقصودة
                    if endpoint in ("/api/", "/api"):
                        continue

                    content_type = resp.headers.get("Content-Type", "")
                    content_length = len(resp.text)

                    # التحقق من أن المحتوى حقيقي وليس صفحة فارغة أو خطأ
                    if content_length > 100:
                        unprotected_endpoints.append(
                            (
                                endpoint,
                                f"حالة 200 بدون مصادقة "
                                f"(نوع: {content_type[:40]}، حجم: {content_length} بايت)",
                            )
                        )
                elif status == 404:
                    # نقطة النهاية غير موجودة — ليست مشكلة أمنية
                    continue

        except Exception:
            tested_count += 1
            continue

    if unprotected_endpoints:
        for endpoint, detail in unprotected_endpoints:
            results.append({
                "name": f"مصادقة API — {endpoint}",
                "severity": "critical",
                "passed": False,
                "details": f"نقطة النهاية {endpoint} يمكن الوصول إليها بدون مصادقة — {detail}",
            })
    else:
        results.append({
            "name": "مصادقة API",
            "severity": "medium",
            "passed": True,
            "details": (
                f"جميع نقاط النهاية المحمية تتطلب مصادقة — "
                f"تم اختبار {tested_count} نقطة نهاية"
            ),
        })

    return results


# ── دوال مساعدة للتجميع ──

def run_quick_scan(url: str) -> list[dict]:
    """يُجري فحصاً سريعاً: رؤوس الأمان + SSL + ملفات مكشوفة."""
    all_results = []
    all_results.extend(check_security_headers(url))
    all_results.extend(check_ssl_certificate(url))
    all_results.extend(check_exposed_files(url))
    return all_results


def run_full_scan(url: str) -> list[dict]:
    """يُجري فحصاً شاملاً: جميع الفحوصات بما فيها XSS و SQLi و CORS."""
    all_results = []
    all_results.extend(check_security_headers(url))
    all_results.extend(check_ssl_certificate(url))
    all_results.extend(check_exposed_files(url))
    all_results.extend(test_xss_protection(url))
    all_results.extend(test_sql_injection(url))
    all_results.extend(check_cors_policy(url))
    all_results.extend(check_api_auth(url))
    return all_results


def group_by_severity(results: list[dict]) -> dict[str, list[dict]]:
    """يُجمّع النتائج حسب مستوى الخطورة."""
    grouped: dict[str, list[dict]] = {
        "critical": [],
        "medium": [],
        "low": [],
    }
    for result in results:
        severity = result.get("severity", "low")
        if severity in grouped:
            grouped[severity].append(result)
        else:
            grouped["low"].append(result)
    return grouped


def count_findings(results: list[dict]) -> dict[str, int]:
    """يحسب عدد النتائج حسب المستوى والحالة."""
    counts = {
        "critical_failed": 0,
        "critical_passed": 0,
        "medium_failed": 0,
        "medium_passed": 0,
        "low_failed": 0,
        "low_passed": 0,
    }
    for result in results:
        severity = result.get("severity", "low")
        passed = result.get("passed", True)
        key = f"{severity}_{'passed' if passed else 'failed'}"
        if key in counts:
            counts[key] += 1
    return counts
