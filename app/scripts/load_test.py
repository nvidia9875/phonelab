"""31 人の授業の負荷試験（10/2 採点 3-6）— 本番の Cloud Run に、生徒 31 人と先生 1 人を同時に流す。

    cd app
    GOOGLE_CLOUD_PROJECT=phonelab-2026 GOOGLE_CLOUD_QUOTA_PROJECT=phonelab-2026 \\
    uv run python -m scripts.load_test --base https://phonelab-1094091671194.asia-northeast1.run.app

- 学級は使い捨て（LOAD-xxxx）を Firestore に直接作り、終わったら消す。DEMO-2026 には触らない
- 生徒: 入場 → 計画（本物の Gemini）→ 記録の送信 6 回 → 測定中の確認（2 秒ごと）→ 次の一手
- 先生: 教員画面の更新（5 秒ごと、セッションの印）、途中で全端末停止 → 全員の端末が停止を見るまでの時間 → 解除
- 結果は docs/load/<日付>.json と docs/load-test.md
"""

from __future__ import annotations

import argparse
import asyncio
import json
import secrets
import statistics
import time
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path

import httpx

from server.classroom import FirestoreClassStore, new_class

ROOT = Path(__file__).resolve().parents[2]
PREDICTIONS = [
    ("sound", "強くはじくとゴムが速く震えるから、音が高くなると思う"),
    ("sound", "震える長さを短くすると、ギターと同じで高い音になると思う"),
    ("energy", "高いところから放すほど速くなると思う。勢いがつくから"),
    ("energy", "重いほうが速く落ちるから、いちばん下で速くなると思う"),
    ("bottle", "水を入れると空気の部分が短くなるから、音が高くなると思う"),
]
POLL_S = 2.0
TEACHER_POLL_S = 5.0


class Stats:
    def __init__(self) -> None:
        self.codes: dict[str, Counter[int]] = defaultdict(Counter)
        self.secs: dict[str, list[float]] = defaultdict(list)

    async def call(self, client: httpx.AsyncClient, name: str, method: str, url: str, **kw):
        start = time.perf_counter()
        try:
            res = await client.request(method, url, **kw)
            code = res.status_code
        except httpx.HTTPError:
            res, code = None, 0
        self.codes[name][code] += 1
        self.secs[name].append(time.perf_counter() - start)
        return res

    def summary(self) -> dict:
        out = {}
        for name, secs in self.secs.items():
            ordered = sorted(secs)
            out[name] = {
                "n": len(secs),
                "codes": dict(self.codes[name]),
                "p50_s": round(statistics.median(ordered), 2),
                "p95_s": round(ordered[min(len(ordered) - 1, round(0.95 * (len(ordered) - 1)))], 2),
            }
        return out


def summary_body(record_id: str, theme: str, i: int, status: str = "open") -> dict:
    return {
        "record_id": record_id,
        "theme_id": theme,
        "variant_id": None,
        "status": status,
        "stage": "plan",
        "prediction": "",
        "hold_codes": [],
        "retries": {},
        "events": [{"t": "10:00", "k": "予想", "body": "…"}],
        "updated_at": f"2026-10-02T10:00:{i:02d}Z",
    }


async def student(base: str, code: str, n: int, stats: Stats, halt_at: dict, seen_halt: dict):
    number = f"L-{n:02d}"
    theme, text = PREDICTIONS[n % len(PREDICTIONS)]
    record_id = f"LR{n:02d}"
    async with httpx.AsyncClient(base_url=base, timeout=30) as client:
        res = await stats.call(
            client, "join", "POST", f"/api/class/{code}/join", json={"number": number}
        )
        if res is None or res.status_code != 200:
            return
        secret = res.json()["secret"]
        ident = {"class_code": code, "number": number, "secret": secret, "record_id": record_id}
        await stats.call(
            client,
            "plan",
            "POST",
            "/api/plan",
            json={"theme_id": theme, "school": "jhs", "text": text, **ident},
        )
        for i in range(6):
            await stats.call(
                client,
                "records",
                "POST",
                "/api/records",
                json={
                    "class_code": code,
                    "number": number,
                    "secret": secret,
                    "record": summary_body(record_id, theme, i),
                },
            )
        # 測定中: 2 秒ごとに学級の状態を確かめる（停止が届くまで、または 40 秒）
        deadline = time.monotonic() + 40
        while time.monotonic() < deadline:
            res = await stats.call(client, "class_poll", "GET", f"/api/class/{code}")
            if res is not None and res.status_code == 200 and res.json().get("halted"):
                if "t" in halt_at and number not in seen_halt:
                    seen_halt[number] = time.monotonic() - halt_at["t"]
                break
            await asyncio.sleep(POLL_S)


async def teacher(base: str, code: str, pin: str, stats: Stats, halt_at: dict, stop: asyncio.Event):
    async with httpx.AsyncClient(base_url=base, timeout=30) as client:
        res = await stats.call(
            client, "dashboard", "POST", f"/api/class/{code}/dashboard", json={"pin": pin}
        )
        token = (
            res.json().get("session_token") if res is not None and res.status_code == 200 else None
        )
        started = time.monotonic()
        halted = False
        while not stop.is_set():
            await stats.call(
                client, "dashboard", "POST", f"/api/class/{code}/dashboard", json={"token": token}
            )
            if not halted and time.monotonic() - started > 15:
                await stats.call(
                    client,
                    "halt",
                    "POST",
                    f"/api/class/{code}/halt",
                    json={"token": token, "halted": True},
                )
                halt_at["t"] = time.monotonic()
                halted = True
            try:
                await asyncio.wait_for(stop.wait(), timeout=TEACHER_POLL_S)
            except TimeoutError:
                pass


async def delete_class(store: FirestoreClassStore, code: str) -> None:
    """下の集まり（生徒・記録・回数）ごと消す。文書の無い生徒の下に回数だけ残ることがあるので、再帰で"""
    await store._client.recursive_delete(store._doc(code))


async def main(base: str, students: int) -> None:
    store = FirestoreClassStore()
    code = f"LOAD-{secrets.token_hex(2).upper()}"
    pin = f"{secrets.randbelow(10_000):04d}"
    await store.put(new_class(code, "jhs", pin))
    stats = Stats()
    halt_at: dict = {}
    seen_halt: dict = {}
    stop = asyncio.Event()
    began = time.monotonic()
    try:
        t = asyncio.create_task(teacher(base, code, pin, stats, halt_at, stop))
        await asyncio.gather(
            *[student(base, code, n, stats, halt_at, seen_halt) for n in range(students)]
        )
        stop.set()
        await t
    finally:
        await delete_class(store, code)
    halt_secs = sorted(seen_halt.values())
    out = {
        "at": datetime.now(UTC).isoformat(timespec="seconds"),
        "base": base,
        "students": students,
        "duration_s": round(time.monotonic() - began, 1),
        "endpoints": stats.summary(),
        "halt": {
            "students_saw_halt": len(seen_halt),
            "p50_s": round(statistics.median(halt_secs), 2) if halt_secs else None,
            "max_s": round(max(halt_secs), 2) if halt_secs else None,
        },
    }
    stamp = datetime.now(UTC).strftime("%Y-%m-%d")
    path = ROOT / "docs" / "load" / f"{stamp}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2))
    (ROOT / "docs" / "load-test.md").write_text(render(out))
    print(json.dumps(out, ensure_ascii=False, indent=1))


def render(out: dict) -> str:
    rows = [
        f"| {name} | {v['n']} | {', '.join(f'{k}: {c}' for k, c in sorted(v['codes'].items()))} | {v['p50_s']} 秒 | {v['p95_s']} 秒 |"
        for name, v in out["endpoints"].items()
    ]
    h = out["halt"]
    return (
        "\n".join(
            [
                "# 31 人の授業の負荷試験",
                "",
                (
                    f"> {out['at']}、{out['base']}、生徒 {out['students']} 人＋先生 1 人を同時に。全体 {out['duration_s']} 秒。"
                    "学級は使い捨て（終わったら削除）。再現: `cd app && uv run python -m scripts.load_test --base <URL>`"
                ),
                "",
                "| 呼び出し | 回数 | 応答の番号 | 中央値 | 95% |",
                "|---|---|---|---|---|",
                *rows,
                "",
                (
                    f"**全端末停止**: 先生が押してから、測定中の端末が停止を見るまで 中央値 {h['p50_s']} 秒・最大 {h['max_s']} 秒"
                    f"（{h['students_saw_halt']} / {out['students']} 人。端末は 2 秒ごとに確かめる）"
                ),
                "",
            ]
        )
        + "\n"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", required=True)
    parser.add_argument("--students", type=int, default=31)
    args = parser.parse_args()
    asyncio.run(main(args.base, args.students))
