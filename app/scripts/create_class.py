"""学級を発行する（運用者が使う）— 学級コードと先生の PIN を Firestore に作り、先生に渡す 2 つを表示する。

    cd app
    GOOGLE_CLOUD_PROJECT=phonelab-2026 GOOGLE_CLOUD_QUOTA_PROJECT=phonelab-2026 \\
    uv run python -m scripts.create_class --school jhs                # コードも PIN も自動
    uv run python -m scripts.create_class --school jhs --code 2A-SATO # コードを決める
    uv run python -m scripts.create_class --delete 2A-SATO            # 学期末に、記録ごと消す

- PIN は 6 桁の乱数。保存するのは塩つきのハッシュだけで、表示はこの 1 回だけ（なくしたら --rotate-pin）
- 同じコードがあれば作らない（上書きで記録を失わないように）
- 手順の全体は docs/onboarding.md
"""

from __future__ import annotations

import argparse
import asyncio
import re
import secrets

from server.classroom import (
    ClassStore,
    FirestoreClassStore,
    hash_teacher_pin,
    new_class,
    normalize_code,
)

CODE_RE = re.compile(r"^[A-Z0-9-]{3,20}$")  # routes_class.CODE_RE と同じ
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # 0/O/1/I を除く
PIN_DIGITS = 6


def new_code() -> str:
    return "CLS-" + "".join(secrets.choice(CODE_ALPHABET) for _ in range(5))


def new_pin() -> str:
    return f"{secrets.randbelow(10**PIN_DIGITS):0{PIN_DIGITS}d}"


def checked_code(code: str) -> str:
    code = normalize_code(code)
    if not CODE_RE.match(code):
        raise SystemExit("学級コードは英大文字・数字・ハイフンで 3〜20 文字")
    return code


async def create(store: ClassStore, code: str | None, school: str) -> tuple[str, str]:
    code = checked_code(code) if code else new_code()
    if await store.get(code) is not None:
        raise SystemExit(f"{code} はもうあります。別のコードにするか、--delete で消してから")
    pin = new_pin()
    await store.put(new_class(code, school, pin))
    return code, pin


async def rotate_pin(store: ClassStore, code: str) -> str:
    code = checked_code(code)
    record = await store.get(code)
    if record is None:
        raise SystemExit(f"{code} はありません")
    pin = new_pin()
    salt = secrets.token_hex(8)
    # PIN を変えると、塩も変わるので、先生のセッションの印（8 時間）もすべて無効になる
    # PIN の項目だけを書く（文書全体を書き戻すと、同時に先生が押した停止を消せた。10/9 Codex #12）
    await store.set_pin(code, hash_teacher_pin(pin, salt), salt)
    return pin


async def delete(store: FirestoreClassStore, code: str) -> None:
    code = checked_code(code)
    if await store.get(code) is None:
        raise SystemExit(f"{code} はありません")
    # 生徒・記録・回数の下の集まりごと消す（load_test と同じ）
    await store._client.recursive_delete(store._doc(code))


def main() -> None:
    parser = argparse.ArgumentParser(description="学級の発行・PIN の再発行・削除")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--rotate-pin", metavar="CODE", help="先生が PIN をなくしたとき")
    group.add_argument("--delete", metavar="CODE", help="学級を記録ごと消す")
    parser.add_argument("--code", help="学級コード（省略すると CLS-XXXXX）")
    parser.add_argument("--school", choices=("jhs", "hs"), default="jhs")
    args = parser.parse_args()
    store = FirestoreClassStore()
    if args.delete:
        asyncio.run(delete(store, args.delete))
        print(f"{normalize_code(args.delete)} を記録ごと消しました")
        return
    if args.rotate_pin:
        pin = asyncio.run(rotate_pin(store, args.rotate_pin))
        print(f"新しい PIN: {pin}（この画面だけ。前の PIN と先生のセッションは使えなくなりました）")
        return
    code, pin = asyncio.run(create(store, args.code, args.school))
    print(f"学級コード: {code}（生徒に配る）")
    print(f"先生の PIN: {pin}（先生だけに渡す。表示はこの 1 回だけ）")


if __name__ == "__main__":
    main()
