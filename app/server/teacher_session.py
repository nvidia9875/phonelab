"""先生のセッション — PIN で一度入ったら、8 時間はセッションの印（token）で教員画面を使う。

PIN の総当たり対策（間違いが続いたら、正しい PIN でも 429）と、授業中の教員画面（5 秒ごとの更新・停止ボタン）を分けるため。
同じ学校の IP から生徒が PIN を試し続けても、入っている先生の画面は止まらない（10/2 採点 2-6）。
印はサーバだけが持つ秘密鍵（PHONELAB_SESSION_SECRET、Secret Manager）と学級の PIN のハッシュを鍵にした HMAC。
DB を読めても秘密鍵が無ければ印は作れない（10/9 Codex #8: PIN のハッシュだけが鍵だった）。PIN を変えると、それまでの印はすべて使えなくなる。
期限は発行から 8 時間まで。それより先の期限が書かれた印は受け付けない。
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import time

from server.classroom import ClassRecord

SESSION_S = 8 * 3600
CLOCK_SKEW_S = 60
SECRET_ENV = "PHONELAB_SESSION_SECRET"
_process_secret = secrets.token_hex(32)


def _server_secret() -> str:
    value = os.environ.get(SECRET_ENV)
    if value:
        return value
    # 手元とテスト用。インスタンスごとに違うので、Cloud Run では必ず Secret Manager から渡す
    return _process_secret


def _sign(record: ClassRecord, expires: int) -> str:
    key = f"{_server_secret()}:{record.salt}:{record.pin_hash}".encode()
    msg = f"{record.policy.class_code}|{expires}".encode()
    return hmac.new(key, msg, hashlib.sha256).hexdigest()[:32]


def issue(record: ClassRecord, now: float | None = None) -> str:
    expires = int((now if now is not None else time.time()) + SESSION_S)
    return f"{expires}.{_sign(record, expires)}"


def verify(record: ClassRecord, token: str | None, now: float | None = None) -> bool:
    if not token or "." not in token:
        return False
    head, sig = token.split(".", 1)
    if not head.isdigit():
        return False
    expires = int(head)
    current = now if now is not None else time.time()
    if expires < current or expires > current + SESSION_S + CLOCK_SKEW_S:
        return False
    return hmac.compare_digest(sig, _sign(record, expires))
