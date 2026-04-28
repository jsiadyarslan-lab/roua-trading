"""
خادم فحص صحة HTTP لكل وكيل.
يعمل في خيط منفصل ويسمح لـ Railway بالتحقق من حالة الوكيل.
"""

import json
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Optional


class _HealthHandler(BaseHTTPRequestHandler):
    """معالج طلبات فحص الصحة."""

    def do_GET(self) -> None:
        if self.path == "/health" or self.path == "/":
            status = self.server._agent_status  # type: ignore[attr-defined]
            status_code = 200 if status.get("healthy", False) else 503

            response = json.dumps({
                "status": "healthy" if status.get("healthy") else "unhealthy",
                "agent": status.get("agent_name", "unknown"),
                "uptime_seconds": status.get("uptime_seconds", 0),
                "total_checks": status.get("total_checks", 0),
                "total_errors": status.get("total_errors", 0),
                "last_check": status.get("last_check", "never"),
            }, ensure_ascii=False)

            self.send_response(status_code)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(response.encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args) -> None:  # type: ignore[override]
        """كتم سجلات HTTP الافتراضية."""
        pass


class HealthCheckServer:
    """
    خادم فحص صحة يعمل في خيط خلفي.
    يوفر نقطة نهاية /health لـ Railway.

    الاستخدام:
        health = HealthCheckServer("my-agent", port=8080)
        health.start()
        # ... العمل الرئيسي ...
        health.update(healthy=True, total_checks=42)
    """

    def __init__(self, agent_name: str, port: int = 8080):
        self._agent_name = agent_name
        self._port = port
        self._status: dict = {
            "healthy": True,
            "agent_name": agent_name,
            "uptime_seconds": 0,
            "total_checks": 0,
            "total_errors": 0,
            "last_check": "never",
        }
        self._server: Optional[HTTPServer] = None
        self._thread: Optional[threading.Thread] = None
        self._start_time: float = 0

    def start(self) -> None:
        """يبدأ خادم فحص الصحة في خيط خلفي."""
        try:
            self._server = HTTPServer(("0.0.0.0", self._port), _HealthHandler)
            self._server._agent_status = self._status  # type: ignore[attr-defined]
            self._start_time = __import__("time").monotonic()

            self._thread = threading.Thread(
                target=self._server.serve_forever,
                daemon=True,
                name=f"health-{self._agent_name}",
            )
            self._thread.start()
            print(f"🏥 خادم فحص الصحة يعمل على المنفذ {self._port}")
        except Exception as e:
            print(f"⚠️ فشل بدء خادم فحص الصحة: {e}")

    def update(
        self,
        healthy: bool = True,
        total_checks: Optional[int] = None,
        total_errors: Optional[int] = None,
        last_check: Optional[str] = None,
    ) -> None:
        """يحدّث حالة الوكيل."""
        self._status["healthy"] = healthy
        if self._start_time > 0:
            self._status["uptime_seconds"] = round(
                __import__("time").monotonic() - self._start_time
            )
        if total_checks is not None:
            self._status["total_checks"] = total_checks
        if total_errors is not None:
            self._status["total_errors"] = total_errors
        if last_check is not None:
            self._status["last_check"] = last_check

    def stop(self) -> None:
        """يوقف خادم فحص الصحة."""
        if self._server:
            self._server.shutdown()
