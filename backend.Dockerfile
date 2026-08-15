FROM python:3.11-slim

WORKDIR /app

# Install system dependencies and create non-root user
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r appuser && useradd -r -g appuser -d /app appuser

# Copy requirements first to leverage Docker cache
COPY requirements.txt .

RUN pip install --no-cache-dir --only-binary :all: \
    alembic==1.18.5 \
    annotated-doc==0.0.5 \
    annotated-types==0.8.0 \
    anyio==4.14.2 \
    arq==0.28.0 \
    asyncpg==0.31.0 \
    bcrypt==5.0.0 \
    certifi==2026.7.22 \
    click==8.4.2 \
    colorama==0.4.6 \
    deprecated==1.3.1 \
    fastapi==0.141.1 \
    greenlet==3.5.4 \
    h11==0.16.0 \
    hiredis==3.4.0 \
    httpcore==1.0.9 \
    httpx==0.28.1 \
    idna==3.18 \
    limits==5.8.0 \
    mako==1.3.12 \
    markupsafe==3.0.3 \
    packaging==26.2 \
    psycopg2-binary==2.9.12 \
    pydantic-core==2.46.4 \
    pydantic==2.13.4 \
    pyjwt==2.13.0 \
    python-dotenv==1.2.2 \
    python-multipart==0.0.32 \
    redis==5.3.1 \
    slowapi==0.1.10 \
    sqlalchemy==2.0.51 \
    starlette==1.3.1 \
    typing-extensions==4.16.0 \
    typing-inspection==0.4.2 \
    urllib3==2.2.3 \
    uvicorn==0.52.1 \
    websockets==12.0 \
    wrapt==2.3.0

# Copy application files explicitly with proper ownership
COPY --chown=appuser:appuser app/ ./app/
COPY --chown=appuser:appuser alembic/ ./alembic/
COPY --chown=appuser:appuser alembic.ini .

RUN mkdir -p /app/uploads && chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

# Command to run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]


