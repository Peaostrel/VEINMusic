FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Create non-root user and a writable directory for uploaded images
# (mounted as a volume in docker-compose so uploads survive redeploys)
RUN groupadd -r appuser && useradd -r -g appuser -d /app appuser \
    && mkdir -p /app/uploads && chown appuser:appuser /app/uploads

# Install dependencies from requirements.txt (single source of truth, kept up
# to date by Dependabot). Binary wheels only, so no compiler is needed.
COPY requirements.txt .
RUN pip install --no-cache-dir --only-binary :all: -r requirements.txt

# Copy application files explicitly with proper ownership
COPY --chown=appuser:appuser app/ ./app/
COPY --chown=appuser:appuser alembic/ ./alembic/
COPY --chown=appuser:appuser alembic.ini .
COPY --chown=appuser:appuser docker-entrypoint.sh .

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status == 200 else 1)"

# Applies database migrations (when RUN_MIGRATIONS=1) and then runs CMD
ENTRYPOINT ["sh", "./docker-entrypoint.sh"]

# --proxy-headers: take the client IP from X-Forwarded-For, but only when the
# request comes from FORWARDED_ALLOW_IPS (env var read by uvicorn).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
