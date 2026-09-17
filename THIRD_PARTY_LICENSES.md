# 使用している OSS とライセンス

PhoneLab 自体は MIT License（`LICENSE`）。以下は直接依存しているオープンソースソフトウェアとそのライセンス。
推移的な依存を含む完全な一覧と各バージョンは `app/uv.lock`（Python）と `app/web/package-lock.json`（npm）にある。
各ライセンスの全文は、それぞれのパッケージの配布物（`app/.venv/lib/.../*.dist-info/`、`app/web/node_modules/<name>/LICENSE`）に含まれる。

## サーバ（Python 3.12、`app/pyproject.toml`）

| パッケージ | バージョン | ライセンス | 用途 |
|---|---|---|---|
| google-adk | 2.8.0 | Apache-2.0 | エージェント（LlmAgent / Runner / BasePlugin）。統制層 `PolicyPlugin` はこの Plugin API の上に実装 |
| google-genai | 2.22.0 | Apache-2.0 | Gemini（Vertex AI）クライアント。ADK 経由で利用 |
| google-cloud-firestore | 2.30.0 | Apache-2.0 | 学級・生徒・記録の要約の保存 |
| fastapi | 0.141.1 | MIT | HTTP API |
| pydantic | 2.13.5 | MIT | 入力の検証、Planner の構造化出力スキーマ |
| uvicorn | 0.52.4 | BSD-3-Clause | ASGI サーバ |
| pytest（開発） | 8.x | MIT | テスト |
| httpx（開発） | 0.27+ | BSD-3-Clause | FastAPI の TestClient |
| ruff（開発） | 0.6+ | MIT | lint / format |

OpenTelemetry（Apache-2.0）は google-adk の依存として入り、Cloud Trace への送信に使っている。

## Web（TypeScript、`app/web/package.json`）

| パッケージ | バージョン | ライセンス | 用途 |
|---|---|---|---|
| react / react-dom | 18.3 | MIT | 画面 |
| vite（開発） | 5.4 | MIT | ビルド・開発サーバ |
| @vitejs/plugin-react（開発） | 4.3 | MIT | React の変換 |
| typescript（開発） | 5.6 | Apache-2.0 | 型 |
| vitest（開発） | 4.1 | MIT | テスト |
| @types/react, @types/react-dom（開発） | 18.3 | MIT | 型定義 |

Web 側はブラウザ標準 API（DeviceMotion、getUserMedia、Web Audio、Web Crypto、localStorage）だけで測定・計算し、CDN からの外部 JavaScript の読み込みは無い。イラスト・アイコンは自作の SVG。

## フォント

| フォント | ライセンス | 読み込み元 |
|---|---|---|
| Zen Maru Gothic | SIL Open Font License 1.1 | Google Fonts |
| BIZ UDPGothic | SIL Open Font License 1.1 | Google Fonts |

読み込めない環境ではシステムフォントに落ちる。

## Google Cloud のサービス（OSS ではない）

Cloud Run、Cloud Build、Vertex AI（Gemini）、Firestore、Cloud Trace（Telemetry API）。利用条件は Google Cloud の規約に従う。
