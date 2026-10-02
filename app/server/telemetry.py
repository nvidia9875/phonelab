"""Cloud Trace への送信 — docs/architecture.md 4.5, 5。

ADK の自動スパン（invoke_agent / call_llm）と PhoneLab のスパン（phonelab.*）を Cloud Trace に送る。
本文（予想文・応答）はスパンに入れない。ADK は既定で入れるので env で切る。
"""

from __future__ import annotations

import logging
import os

TRACE_TO_CLOUD_ENV = "PHONELAB_TRACE_TO_CLOUD"
_CONTENT_CAPTURE_ENVS = (
    "ADK_CAPTURE_MESSAGE_CONTENT_IN_SPANS",
    "OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT",
)

logger = logging.getLogger(__name__)


def disable_content_capture() -> None:
    """既に true が入っていても上書きする（setdefault では外から入れた true を消せない。10/2 採点 2-5）"""
    for name in _CONTENT_CAPTURE_ENVS:
        if os.environ.get(name, "").lower() not in {"", "false", "0"}:
            logger.warning(
                "%s=%s を false に上書き（生徒の文をスパンに入れない）", name, os.environ[name]
            )
        os.environ[name] = "false"


def setup_cloud_tracing() -> bool:
    """PHONELAB_TRACE_TO_CLOUD=1 のときだけ Cloud Trace に送る。失敗しても API は止めない。"""
    if os.environ.get(TRACE_TO_CLOUD_ENV, "").lower() not in {"1", "true"}:
        return False

    from google.adk.telemetry.google_cloud import get_gcp_exporters, get_gcp_resource
    from google.adk.telemetry.setup import maybe_set_otel_providers

    project = os.environ.get("GOOGLE_CLOUD_PROJECT")
    try:
        maybe_set_otel_providers(
            [get_gcp_exporters(enable_cloud_tracing=True)],
            otel_resource=get_gcp_resource(project),
        )
    except Exception:
        logger.exception("Cloud Trace の設定に失敗したのでトレースなしで起動する")
        return False

    logger.info("Cloud Trace export enabled (project=%s)", project)
    return True
