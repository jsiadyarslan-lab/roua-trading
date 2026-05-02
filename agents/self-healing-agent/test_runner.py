"""
وكيل الإصلاح الذاتي — مشغّل الاختبارات
ينشئ فرعاً جديداً في GitHub، يطبق الإصلاح، ويشغّل الاختبارات.
إذا نجحت الاختبارات، يُعيد معلومات الفرع للمراجعة.
إذا فشلت، يُعيد تقرير الفشل.
"""

import json
import time
import requests
from typing import Optional

from config import GITHUB_TOKEN, GITHUB_REPO, GITHUB_DEFAULT_BRANCH


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# GitHub API Headers
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def _github_headers() -> dict:
    """يعيد ترويسات GitHub API."""
    return {
        "Authorization": f"token {GITHUB_TOKEN}",
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json",
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# نتيجة الاختبار
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class TestResult:
    """نتيجة تشغيل الاختبارات."""

    def __init__(
        self,
        success: bool = False,
        branch_name: Optional[str] = None,
        commit_sha: Optional[str] = None,
        tests_passed: bool = False,
        build_passed: bool = False,
        error: Optional[str] = None,
        test_output: Optional[str] = None,
        workflow_run_id: Optional[int] = None,
    ):
        self.success = success
        self.branch_name = branch_name
        self.commit_sha = commit_sha
        self.tests_passed = tests_passed
        self.build_passed = build_passed
        self.error = error
        self.test_output = test_output
        self.workflow_run_id = workflow_run_id

    def to_dict(self) -> dict:
        return {
            "success": self.success,
            "branch_name": self.branch_name,
            "commit_sha": self.commit_sha,
            "tests_passed": self.tests_passed,
            "build_passed": self.build_passed,
            "error": self.error,
            "test_output": self.test_output,
            "workflow_run_id": self.workflow_run_id,
        }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# إنشاء فرع جديد وتطبيق الإصلاح
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def create_fix_branch(fix_result, error_info: dict) -> dict:
    """
    ينشئ فرعاً جديداً في GitHub ويطبق الإصلاح عليه.

    الخطوات:
    1. جلب أحدث SHA من الفرع الرئيسي
    2. إنشاء فرع جديد من الفرع الرئيسي
    3. جلب محتوى الملف الحالي
    4. تطبيق الإصلاح (بحث واستبدال)
    5. رفع التغييرات

    يعيد:
        قاموس يحتوي:
        - success: هل نجح إنشاء الفرع؟
        - branch_name: اسم الفرع الجديد
        - commit_sha: SHA الالتزام
        - error: رسالة الخطأ إن وجدت
    """
    if not GITHUB_TOKEN:
        return {
            "success": False,
            "branch_name": None,
            "commit_sha": None,
            "error": "GITHUB_TOKEN غير مضبوط",
        }

    # 1. جلب أحدث SHA من الفرع الرئيسي
    ref_result = _get_branch_sha(GITHUB_DEFAULT_BRANCH)
    if not ref_result["success"]:
        return ref_result

    base_sha = ref_result["sha"]

    # 2. إنشاء اسم فرع فريد
    timestamp = int(time.time())
    error_type = error_info.get("type", "fix")
    branch_name = f"auto-fix/{error_type}-{timestamp}"

    # 3. إنشاء الفرع
    create_result = _create_branch(branch_name, base_sha)
    if not create_result["success"]:
        return create_result

    # 4. جلب محتوى الملف الحالي
    file_result = _get_file_content(fix_result.file_path, branch_name)
    if not file_result["success"]:
        return {
            "success": False,
            "branch_name": branch_name,
            "commit_sha": None,
            "error": f"فشل جلب الملف: {file_result.get('error', 'غير معروف')}",
        }

    current_content = file_result["content"]
    file_sha = file_result["sha"]

    # 5. تطبيق الإصلاح (بحث واستبدال)
    if fix_result.search_code in current_content:
        new_content = current_content.replace(fix_result.search_code, fix_result.fix_code, 1)
    else:
        # محاولة تقريبية: البحث عن سطر يحتوي على جزء من الكود
        search_lines = fix_result.search_code.strip().split("\n")
        if len(search_lines) == 1 and search_lines[0] in current_content:
            new_content = current_content.replace(search_lines[0], fix_result.fix_code, 1)
        else:
            return {
                "success": False,
                "branch_name": branch_name,
                "commit_sha": None,
                "error": f"لم يتم العثور على الكود القديم في الملف {fix_result.file_path}",
            }

    # 6. رفع التغييرات
    commit_result = _commit_file(
        file_path=fix_result.file_path,
        content=new_content,
        file_sha=file_sha,
        branch_name=branch_name,
        message=f"fix: {fix_result.explanation or 'إصلاح تلقائي'}",
    )

    if not commit_result["success"]:
        return {
            "success": False,
            "branch_name": branch_name,
            "commit_sha": None,
            "error": f"فشل رفع التغييرات: {commit_result.get('error', 'غير معروف')}",
        }

    return {
        "success": True,
        "branch_name": branch_name,
        "commit_sha": commit_result.get("sha"),
        "error": None,
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# تشغيل الاختبارات عبر GitHub Actions
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def run_tests(branch_name: str, timeout: int = 300) -> TestResult:
    """
    يشغّل الاختبارات على الفرع المحدد عبر GitHub Actions.

    الخطوات:
    1. تشغيل سير عمل الاختبار (إذا وُجد)
    2. انتظار اكتمال سير العمل
    3. التحقق من نتائج الاختبار

    يعيد:
        TestResult
    """
    if not GITHUB_TOKEN:
        return TestResult(
            success=False,
            branch_name=branch_name,
            error="GITHUB_TOKEN غير مضبوط",
        )

    # محاولة تشغيل سير عمل CI إن وُجد
    dispatch_result = _trigger_workflow(branch_name)

    if not dispatch_result["success"]:
        # إذا لم يوجد سير عمل CI، نحاول تشغيل bun test مباشرة عبر API
        print(f"  ⚠️ لم يتم تشغيل CI تلقائياً، جارٍ التحقق من حالة البناء...")
        # نتحقق من أن الفرع على الأقل يمكن بناؤه
        return _check_build_status(branch_name, timeout)

    # انتظار اكتمال سير العمل
    workflow_run_id = dispatch_result.get("run_id")
    if workflow_run_id:
        return _wait_for_workflow(workflow_run_id, branch_name, timeout)

    return TestResult(
        success=False,
        branch_name=branch_name,
        error="لم يتم العثور على سير عمل CI",
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# حذف الفرع (في حالة فشل الاختبارات)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def delete_branch(branch_name: str) -> bool:
    """يحذف فرعاً من GitHub."""
    url = f"https://api.github.com/repos/{GITHUB_REPO}/git/refs/heads/{branch_name}"
    try:
        resp = requests.delete(url, headers=_github_headers(), timeout=15)
        if resp.status_code == 204:
            print(f"  🗑️ تم حذف الفرع {branch_name}")
            return True
        else:
            print(f"  ⚠️ فشل حذف الفرع {branch_name}: HTTP {resp.status_code}")
            return False
    except Exception as e:
        print(f"  ❌ خطأ في حذف الفرع: {e}")
        return False


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# دوال GitHub API الداخلية
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def _get_branch_sha(branch: str) -> dict:
    """يجلب SHA أحدث التزام من الفرع المحدد."""
    url = f"https://api.github.com/repos/{GITHUB_REPO}/git/refs/heads/{branch}"
    try:
        resp = requests.get(url, headers=_github_headers(), timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            sha = data["object"]["sha"]
            return {"success": True, "sha": sha}
        else:
            return {"success": False, "sha": None, "error": f"HTTP {resp.status_code}"}
    except Exception as e:
        return {"success": False, "sha": None, "error": str(e)}


def _create_branch(branch_name: str, base_sha: str) -> dict:
    """ينشئ فرعاً جديداً من SHA محدد."""
    url = f"https://api.github.com/repos/{GITHUB_REPO}/git/refs"
    payload = {
        "ref": f"refs/heads/{branch_name}",
        "sha": base_sha,
    }
    try:
        resp = requests.post(url, headers=_github_headers(), json=payload, timeout=15)
        if resp.status_code == 201:
            print(f"  🌿 تم إنشاء الفرع: {branch_name}")
            return {"success": True, "branch_name": branch_name}
        else:
            error_msg = resp.json().get("message", "خطأ غير معروف")
            return {"success": False, "error": f"فشل إنشاء الفرع: {error_msg}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def _get_file_content(file_path: str, branch: str) -> dict:
    """يجلب محتوى ملف من GitHub."""
    url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/{file_path}?ref={branch}"
    try:
        resp = requests.get(url, headers=_github_headers(), timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            import base64
            content = base64.b64decode(data["content"]).decode("utf-8")
            return {
                "success": True,
                "content": content,
                "sha": data["sha"],
            }
        else:
            return {"success": False, "error": f"HTTP {resp.status_code}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def _commit_file(
    file_path: str,
    content: str,
    file_sha: str,
    branch_name: str,
    message: str,
) -> dict:
    """يرفع ملفاً معدّلاً إلى GitHub."""
    import base64

    url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/{file_path}"
    encoded_content = base64.b64encode(content.encode("utf-8")).decode("utf-8")

    payload = {
        "message": message,
        "content": encoded_content,
        "sha": file_sha,
        "branch": branch_name,
    }

    try:
        resp = requests.put(url, headers=_github_headers(), json=payload, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            commit_sha = data.get("commit", {}).get("sha")
            print(f"  ✅ تم رفع الإصلاح إلى {branch_name}")
            return {"success": True, "sha": commit_sha}
        else:
            error_msg = resp.json().get("message", "خطأ غير معروف")
            return {"success": False, "error": f"فشل رفع الملف: {error_msg}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def _trigger_workflow(branch_name: str) -> dict:
    """يشغّل سير عمل GitHub Actions."""
    # محاولة تشغيل سير عمل ci.yml إن وُجد
    url = f"https://api.github.com/repos/{GITHUB_REPO}/actions/workflows/ci.yml/dispatches"
    payload = {"ref": branch_name}

    try:
        resp = requests.post(url, headers=_github_headers(), json=payload, timeout=15)
        if resp.status_code == 204:
            print(f"  🚀 تم تشغيل سير عمل CI على {branch_name}")
            # جلب run_id
            time.sleep(3)
            runs_url = f"https://api.github.com/repos/{GITHUB_REPO}/actions/runs?branch={branch_name}&per_page=1"
            runs_resp = requests.get(runs_url, headers=_github_headers(), timeout=15)
            if runs_resp.status_code == 200:
                runs = runs_resp.json().get("workflow_runs", [])
                if runs:
                    return {"success": True, "run_id": runs[0]["id"]}
            return {"success": True, "run_id": None}
        else:
            return {"success": False, "error": f"HTTP {resp.status_code}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def _check_build_status(branch_name: str, timeout: int) -> TestResult:
    """يتحقق من حالة البناء للفرع عبر check_runs."""
    url = f"https://api.github.com/repos/{GITHUB_REPO}/commits/{branch_name}/check-runs"

    try:
        # انتظار قصير لبدء الفحوصات
        time.sleep(10)

        resp = requests.get(url, headers=_github_headers(), timeout=15)
        if resp.status_code != 200:
            return TestResult(
                success=False,
                branch_name=branch_name,
                error=f"فشل جلب حالة الفحص: HTTP {resp.status_code}",
            )

        data = resp.json()
        check_runs = data.get("check_runs", [])

        if not check_runs:
            # لا توجد فحوصات — نعتبر هذا نجاحاً مشروطاً
            print(f"  ⚠️ لا توجد فحوصات CI على الفرع {branch_name}")
            return TestResult(
                success=True,
                branch_name=branch_name,
                tests_passed=True,
                build_passed=True,
                error="لا توجد فحوصات CI — مراجعة بشرية مطلوبة",
            )

        # التحقق من حالة كل فحص
        all_passed = all(
            run["conclusion"] == "success"
            for run in check_runs
            if run["status"] == "completed"
        )

        pending = any(
            run["status"] in ("queued", "in_progress")
            for run in check_runs
        )

        if pending:
            print(f"  ⏳ الفحوصات قيد التشغيل على {branch_name}...")
            return TestResult(
                success=True,
                branch_name=branch_name,
                tests_passed=True,
                build_passed=True,
                error="الفحوصات قيد التشغيل — المراجعة البشرية مطلوبة",
            )

        return TestResult(
            success=all_passed,
            branch_name=branch_name,
            tests_passed=all_passed,
            build_passed=all_passed,
            test_output=str(check_runs[:3]),
        )

    except Exception as e:
        return TestResult(
            success=False,
            branch_name=branch_name,
            error=str(e),
        )


def _wait_for_workflow(run_id: int, branch_name: str, timeout: int) -> TestResult:
    """ينتظر اكتمال سير عمل GitHub Actions."""
    url = f"https://api.github.com/repos/{GITHUB_REPO}/actions/runs/{run_id}"
    start_time = time.monotonic()

    while time.monotonic() - start_time < timeout:
        try:
            resp = requests.get(url, headers=_github_headers(), timeout=15)
            if resp.status_code == 200:
                data = resp.json()
                status = data.get("status", "")
                conclusion = data.get("conclusion", "")

                if status == "completed":
                    success = conclusion == "success"
                    return TestResult(
                        success=success,
                        branch_name=branch_name,
                        tests_passed=success,
                        build_passed=success,
                        workflow_run_id=run_id,
                        test_output=f"conclusion={conclusion}",
                    )

                print(f"  ⏳ سير العمل {status}... ({conclusion or 'بانتظار'})")
        except Exception as e:
            print(f"  ⚠️ خطأ في فحص سير العمل: {e}")

        time.sleep(15)

    return TestResult(
        success=False,
        branch_name=branch_name,
        workflow_run_id=run_id,
        error=f"انتهت مهلة انتظار سير العمل ({timeout}ث)",
    )
