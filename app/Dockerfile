FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
COPY pyproject.toml uv.lock* ./
RUN uv sync --frozen --no-dev --no-install-project || uv sync --no-dev --no-install-project
COPY server ./server
ENV PATH="/app/.venv/bin:$PATH"
CMD ["sh", "-c", "uvicorn server.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
