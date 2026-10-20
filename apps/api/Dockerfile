FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
ARG INSTALL_DEV=false

RUN useradd --uid 1000 --create-home app \
    && mkdir -p /data/photos && chown app:app /data/photos && chmod 700 /data/photos
WORKDIR /app

COPY pyproject.toml ./
COPY src ./src
RUN if [ "$INSTALL_DEV" = "true" ]; then pip install -e ".[dev]"; else pip install -e .; fi

COPY . .
USER app
EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && python -m pixgym.seed && uvicorn pixgym.main:app --host 0.0.0.0 --port 8000"]
