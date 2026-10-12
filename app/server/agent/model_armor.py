"""Model Armor（X7、注入対策の第 1 層）— 生徒の文を、モデルに渡す前に Google Cloud の Model Armor で検査する。

テンプレートは us-central1（docs/architecture.md 4.1。東京リージョンには多言語の検出が無い）。
呼び出しは PolicyPlugin の before_model_callback から、1 回の実行で 1 回だけ。
Model Armor が遅い・落ちているときは通す（fail-open）。第 2 層（決定論のパターン、policy.py）と
第 3 層（構造化出力と出力の検査）は Model Armor と関係なく必ずかかる。
PHONELAB_MODEL_ARMOR_TEMPLATE（projects/.../locations/.../templates/...）が無ければ使わない。
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
from dataclasses import dataclass
from typing import Protocol

logger = logging.getLogger(__name__)

TEMPLATE_ENV = "PHONELAB_MODEL_ARMOR_TEMPLATE"
TIMEOUT_S = 3.0
LOCATION_RE = re.compile(r"^projects/[^/]+/locations/([a-z0-9-]+)/templates/[^/]+$")


@dataclass(frozen=True)
class ArmorVerdict:
    matched: bool
    filters: tuple[str, ...] = ()
    error: str | None = None


class ArmorClient(Protocol):
    async def screen(self, text: str) -> ArmorVerdict: ...


class CloudModelArmor:
    """REST の sanitizeUserPrompt を、Cloud Run のサービスアカウントで呼ぶ"""

    def __init__(self, template: str) -> None:
        match = LOCATION_RE.match(template)
        if not match:
            raise ValueError(f"{TEMPLATE_ENV} の形が違います: {template}")
        self._url = f"https://modelarmor.{match.group(1)}.rep.googleapis.com/v1/{template}:sanitizeUserPrompt"
        self._session = None

    def _post(self, text: str) -> dict:
        if self._session is None:
            import google.auth
            from google.auth.transport.requests import AuthorizedSession

            credentials, _ = google.auth.default(
                scopes=["https://www.googleapis.com/auth/cloud-platform"]
            )
            self._session = AuthorizedSession(credentials)
        res = self._session.post(
            self._url, json={"userPromptData": {"text": text}}, timeout=TIMEOUT_S
        )
        res.raise_for_status()
        return res.json()

    async def screen(self, text: str) -> ArmorVerdict:
        from google.auth.exceptions import GoogleAuthError
        from requests import RequestException

        try:
            data = await asyncio.wait_for(asyncio.to_thread(self._post, text), timeout=TIMEOUT_S)
        except (TimeoutError, RequestException, GoogleAuthError, ValueError) as exc:
            # 検査できなかった。統制層はこの文をモデルに渡さず、決まりごとで進める（10/9 fail-closed）
            logger.warning("Model Armor に届かなかった: %s", type(exc).__name__)
            return ArmorVerdict(matched=False, error=type(exc).__name__)
        return verdict_from(data)


def verdict_from(data: dict) -> ArmorVerdict:
    result = data.get("sanitizationResult") or {}
    state = result.get("invocationResult", "SUCCESS")
    if result.get("filterMatchState") != "MATCH_FOUND":
        # 一部のフィルタが走らなかった・失敗した（PARTIAL / FAILURE）ときは「検知なし」ではなく「検査できなかった」
        if state not in ("SUCCESS", "INVOCATION_RESULT_UNSPECIFIED"):
            return ArmorVerdict(matched=False, error=f"invocation_{state.lower()}")
        return ArmorVerdict(matched=False)
    hits: list[str] = []
    for name, wrapped in (result.get("filterResults") or {}).items():
        inner = next(iter(wrapped.values()), {}) if isinstance(wrapped, dict) else {}
        if isinstance(inner, dict) and inner.get("matchState") == "MATCH_FOUND":
            hits.append(name)
    return ArmorVerdict(matched=True, filters=tuple(hits))


def armor_from_env() -> ArmorClient | None:
    template = os.environ.get(TEMPLATE_ENV)
    if not template:
        return None
    try:
        return CloudModelArmor(template)
    except ValueError:
        logger.exception("Model Armor を使わない")
        return None
