# Backend Dockerfile for Django application (production: Daphne/ASGI)
FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# build-essential/libpq-dev: compiling psycopg2 and friends.
# docker-ce-cli: lets this container talk to the host's Docker daemon via
# the mounted /var/run/docker.sock, which dynamic_analyzer.py needs to
# launch ephemeral per-submission grading containers.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    ca-certificates \
    gnupg \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian bookworm stable" \
       > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y --no-install-recommends docker-ce-cli \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/
RUN pip install -r requirements.txt

COPY . /app/

# Non-root user, but a member of a group whose GID matches the host's
# docker.sock GID (passed at build time via HOST_DOCKER_GID in .env), so it
# can actually use the mounted socket without running as root.
ARG DOCKER_GID=999
RUN groupadd -g ${DOCKER_GID} dockerhost || true \
    && useradd -m -u 1000 django \
    && usermod -aG ${DOCKER_GID} django \
    && chown -R django:django /app

USER django

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:8000/api/health/ || exit 1

# Daphne (ASGI) — required because the app serves WebSockets via Django
# Channels; a plain WSGI server (gunicorn) can't handle those.
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "autograder.asgi:application"]
