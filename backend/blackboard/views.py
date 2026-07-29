import logging

from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from .runner import run_code, SUPPORTED

logger = logging.getLogger(__name__)


class BlackboardThrottle(UserRateThrottle):
    """Prevent the free-run endpoint from being hammered."""
    scope = "blackboard"
    rate = "60/min"


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def languages(request):
    """List the languages the blackboard can run."""
    return Response({"languages": list(SUPPORTED)})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([BlackboardThrottle])
def run(request):
    """
    Run arbitrary code with optional stdin — a Docker-free online compiler for
    free practice. Nothing is saved.

    Body: { language, code, stdin }
    Returns: { success, output, error, execution_time, language }
    """
    data = request.data or {}
    language = data.get("language", "python")
    code = data.get("code", "")
    stdin = data.get("stdin", data.get("input", ""))

    if not code or not str(code).strip():
        return Response({"success": False, "output": "", "error": "No code to run.",
                         "execution_time": 0, "language": language})

    try:
        result = run_code(language, code, stdin)
    except Exception as exc:
        logger.error(f"[blackboard] run failed: {exc}", exc_info=True)
        return Response({"success": False, "output": "",
                         "error": "Execution failed on the server.",
                         "execution_time": 0, "language": language}, status=500)

    return Response(result)
