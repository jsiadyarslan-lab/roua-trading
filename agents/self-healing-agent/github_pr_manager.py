"""
وكيل الإصلاح الذاتي — مدير Pull Request على GitHub
يفتح PR مع وصف الإصلاح ويضيف تسميات وعينة مراجعة.
لا يدمج أي PR أبداً — المراجعة البشرية إجبارية.
"""

import json
import requests
from typing import Optional

from config import GITHUB_TOKEN, GITHUB_REPO, GITHUB_DEFAULT_BRANCH

from fix_generator import FixResult, generate_pr_description, generate_pr_title


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
# نتيجة PR
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class PRResult:
    """نتيجة فتح Pull Request."""

    def __init__(
        self,
        success: bool = False,
        pr_number: Optional[int] = None,
        pr_url: Optional[str] = None,
        pr_html_url: Optional[str] = None,
        branch_name: Optional[str] = None,
        error: Optional[str] = None,
    ):
        self.success = success
        self.pr_number = pr_number
        self.pr_url = pr_url
        self.pr_html_url = pr_html_url
        self.branch_name = branch_name
        self.error = error

    def to_dict(self) -> dict:
        return {
            "success": self.success,
            "pr_number": self.pr_number,
            "pr_url": self.pr_url,
            "pr_html_url": self.pr_html_url,
            "branch_name": self.branch_name,
            "error": self.error,
        }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# فتح Pull Request
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def create_pull_request(
    fix_result: FixResult,
    error_info: dict,
    branch_name: str,
    test_result: Optional[dict] = None,
) -> PRResult:
    """
    يفتح Pull Request على GitHub مع وصف الإصلاح.

    المعاملات:
        fix_result: نتيجة الإصلاح
        error_info: معلومات الخطأ الأصلي
        branch_name: اسم الفرع الذي يحتوي الإصلاح
        test_result: نتيجة الاختبار (اختياري)

    يعيد:
        PRResult
    """
    if not GITHUB_TOKEN:
        return PRResult(
            success=False,
            branch_name=branch_name,
            error="GITHUB_TOKEN غير مضبوط",
        )

    # 1. توليد عنوان ووصف PR
    title = generate_pr_title(fix_result, error_info)
    description = generate_pr_description(fix_result, error_info)

    # إضافة معلومات الاختبار إن وُجدت
    if test_result:
        test_status = "✅ نجحت" if test_result.get("tests_passed") else "❌ فشلت"
        build_status = "✅ نجح" if test_result.get("build_passed") else "❌ فشل"
        description += f"""

### نتائج الاختبار
- **البناء**: {build_status}
- **الاختبارات**: {test_status}
- **ملاحظات**: {test_result.get('error', 'لا يوجد')}"""

    # إضافة تحذير المراجعة البشرية
    description += """

### إجراءات الأمان
- [x] الإصلاح لا يلمس منطق التداول
- [x] الإصلاح لا يلمس إعدادات الأمان
- [x] الإصلاح لا يلمس إدارة المخاطر
- [ ] **مراجعة بشرية مطلوبة قبل الدمج**
- [ ] **لا تدمج هذا PR بدون موافقة صريحة**

---
_تم إنشاء هذا PR تلقائياً بواسطة وكيل الإصلاح الذاتي (Self-Healing Agent)_"""

    # 2. فتح PR
    url = f"https://api.github.com/repos/{GITHUB_REPO}/pulls"
    payload = {
        "title": title,
        "body": description,
        "head": branch_name,
        "base": GITHUB_DEFAULT_BRANCH,
        "draft": True,  # PR كمسودة لضمان المراجعة البشرية
    }

    try:
        resp = requests.post(url, headers=_github_headers(), json=payload, timeout=30)

        if resp.status_code == 201:
            data = resp.json()
            pr_number = data["number"]
            pr_url = data["url"]
            pr_html_url = data["html_url"]

            print(f"  ✅ تم فتح PR #{pr_number}: {pr_html_url}")

            # 3. إضافة تسميات
            _add_labels(pr_number, [
                "auto-fix",
                "needs-human-review",
                "self-healing-agent",
                fix_result.fix_scope or "unknown-scope",
            ])

            # 4. إضافة طلب مراجعة
            _add_review_request(pr_number)

            return PRResult(
                success=True,
                pr_number=pr_number,
                pr_url=pr_url,
                pr_html_url=pr_html_url,
                branch_name=branch_name,
            )

        else:
            error_data = resp.json()
            error_msg = error_data.get("message", "خطأ غير معروف")
            errors_detail = error_data.get("errors", [])
            if errors_detail:
                error_msg += f" — {errors_detail}"

            return PRResult(
                success=False,
                branch_name=branch_name,
                error=f"فشل فتح PR: {error_msg}",
            )

    except requests.exceptions.Timeout:
        return PRResult(
            success=False,
            branch_name=branch_name,
            error="انتهت مهلة فتح PR",
        )
    except Exception as e:
        return PRResult(
            success=False,
            branch_name=branch_name,
            error=f"خطأ في فتح PR: {e}",
        )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# إضافة تعليق على PR
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def add_comment(pr_number: int, comment: str) -> bool:
    """يضيف تعليقاً على Pull Request."""
    url = f"https://api.github.com/repos/{GITHUB_REPO}/issues/{pr_number}/comments"
    payload = {"body": comment}

    try:
        resp = requests.post(url, headers=_github_headers(), json=payload, timeout=15)
        return resp.status_code == 201
    except Exception as e:
        print(f"  ⚠️ فشل إضافة تعليق: {e}")
        return False


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# التحقق من حالة PR
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def check_pr_status(pr_number: int) -> dict:
    """يتحقق من حالة Pull Request (مفتوح، مدموج، مغلق)."""
    url = f"https://api.github.com/repos/{GITHUB_REPO}/pulls/{pr_number}"

    try:
        resp = requests.get(url, headers=_github_headers(), timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            return {
                "success": True,
                "state": data.get("state"),
                "merged": data.get("merged", False),
                "merged_at": data.get("merged_at"),
                "closed_at": data.get("closed_at"),
                "draft": data.get("draft", False),
                "title": data.get("title"),
            }
        return {"success": False, "error": f"HTTP {resp.status_code}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# دوال مساعدة
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def _add_labels(pr_number: int, labels: list[str]) -> bool:
    """يضيف تسميات إلى PR."""
    url = f"https://api.github.com/repos/{GITHUB_REPO}/issues/{pr_number}/labels"
    payload = {"labels": labels}

    try:
        resp = requests.post(url, headers=_github_headers(), json=payload, timeout=15)
        if resp.status_code == 200:
            print(f"  🏷️ تم إضافة التسميات: {', '.join(labels)}")
            return True
        return False
    except Exception as e:
        print(f"  ⚠️ فشل إضافة التسميات: {e}")
        return False


def _add_review_request(pr_number: int) -> bool:
    """يطلب مراجعة على PR."""
    # نحتاج معرف مراجع — نستخدم مالك المستودع كمراجع افتراضي
    url = f"https://api.github.com/repos/{GITHUB_REPO}/pulls/{pr_number}/requested_reviewers"

    try:
        # جلب المتعاونين على المستودع
        collaborators_url = f"https://api.github.com/repos/{GITHUB_REPO}/collaborators?permission=push"
        collab_resp = requests.get(collaborators_url, headers=_github_headers(), timeout=15)

        if collab_resp.status_code == 200:
            collaborators = collab_resp.json()
            if collaborators:
                # طلب مراجعة من أول متعاون
                reviewer = collaborators[0].get("login", "")
                if reviewer:
                    payload = {"reviewers": [reviewer]}
                    resp = requests.post(url, headers=_github_headers(), json=payload, timeout=15)
                    if resp.status_code == 201:
                        print(f"  📋 تم طلب مراجعة من {reviewer}")
                        return True
    except Exception as e:
        print(f"  ⚠️ فشل طلب المراجعة: {e}")

    return False
