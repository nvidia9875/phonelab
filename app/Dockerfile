# ベースイメージと uv は digest で固定する（同じソースから同じ中身が出るように。10/9 Codex セキュリティ #15）。
# 上げるときは tag と digest を一緒に変える。

# --- web (Vite) ---
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web ./
RUN npm run build

# --- server (FastAPI + ADK) ---
FROM python:3.12-slim@sha256:05cda9777409a9c3ffddd94a4c476b79f0769a0b4857f0c7ed9226b6800b0d6f
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY --from=ghcr.io/astral-sh/uv:0.11.7@sha256:240fb85ab0f263ef12f492d8476aa3a2e4e1e333f7d67fbdd923d00a506a516a /uv /usr/local/bin/uv
COPY pyproject.toml uv.lock* ./
RUN uv sync --frozen --no-dev --no-install-project
COPY server ./server
COPY --from=web /web/dist ./web/dist
ENV PATH="/app/.venv/bin:$PATH"
# root で動かさない
RUN useradd --system --uid 10001 --no-create-home phonelab
USER 10001
CMD ["sh", "-c", "uvicorn server.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
