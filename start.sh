#!/bin/bash

# ─── Colors ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()    { echo -e "${BLUE}[•] $*${NC}"; }
ok()     { echo -e "${GREEN}[✓] $*${NC}"; }
warn()   { echo -e "${YELLOW}[!] $*${NC}"; }
err()    { echo -e "${RED}[✗] $*${NC}"; }

echo ""
echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       Autograder+  Startup           ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
echo ""

# ─── Track all child PIDs for clean shutdown ──────────────────────────────────
PIDS=()
# Absolute path to project root regardless of where start.sh is invoked from
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

LOCK_FILE="/tmp/autograder-start.lock"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
    err "Autograder+ startup is already running. Stop the existing start.sh process before starting another copy."
    exit 1
fi

cleanup() {
    echo ""
    warn "Shutting down all services..."
    for pid in "${PIDS[@]}"; do
        kill "$pid" 2>/dev/null
    done
    # Also kill anything still on our ports
    fuser -k 8007/tcp 2>/dev/null
    fuser -k 5173/tcp 2>/dev/null
    ok "All services stopped."
    exit 0
}
trap cleanup SIGINT SIGTERM

# ─── 1. Kill anything already on our ports ────────────────────────────────────
log "Freeing ports 8007 and 5173..."
fuser -k 8007/tcp 2>/dev/null && warn "Killed process on port 8007"
fuser -k 5173/tcp 2>/dev/null && warn "Killed process on port 5173"
# Also kill any stale celery workers from previous runs
pkill -f "celery.*autograder" 2>/dev/null && warn "Killed stale Celery workers"
sleep 1

# ─── 2. Docker (Redis, Postgres, MinIO) ───────────────────────────────────────
log "Checking Docker services..."
if ! command -v docker &>/dev/null; then
    err "Docker not found! Please install Docker."
    exit 1
fi

if docker compose ps 2>/dev/null | grep -q "Up"; then
    ok "Docker services already running."
else
    log "Starting Docker services..."
    docker compose up -d
    if [ $? -ne 0 ]; then
        err "Docker compose failed! Check docker-compose.yml."
        exit 1
    fi
    log "Waiting for Redis to be ready..."
    for i in {1..15}; do
        if docker compose exec -T redis redis-cli ping 2>/dev/null | grep -q "PONG"; then
            ok "Redis is ready."
            break
        fi
        sleep 1
        if [ $i -eq 15 ]; then
            err "Redis did not become ready in time."
            exit 1
        fi
    done
fi

# ─── 3. Python Virtual Environment ────────────────────────────────────────────
log "Setting up Python virtual environment..."
if [ ! -d "venv" ]; then
    warn "venv not found — creating one..."
    python3 -m venv venv
    if [ $? -ne 0 ]; then
        err "Failed to create venv. Is python3-venv installed?"
        exit 1
    fi
fi
source venv/bin/activate
ok "Virtual environment activated."

# ─── 4. Install / update Python dependencies ──────────────────────────────────
log "Installing Python dependencies (this may take a moment on first run)..."
pip install -q --upgrade pip
pip install -q -r backend/requirements.txt
if [ $? -ne 0 ]; then
    err "pip install failed. Check backend/requirements.txt."
    exit 1
fi
ok "Python dependencies installed."

# ─── 5. Django: migrate + collect static ──────────────────────────────────────
log "Running Django migrations..."
(cd backend && python manage.py migrate --run-syncdb 2>&1 | tail -5)
if [ $? -ne 0 ]; then
    err "Django migrations failed!"
    exit 1
fi
ok "Migrations done."

# ─── 6. Autograder_plus venv (for AI analysis pipeline) ──────────────────────
APLUS_DIR="../Autograder_plus"
if [ -d "$APLUS_DIR" ]; then
    APLUS_VENV="$APLUS_DIR/newgrade"
    if [ ! -d "$APLUS_VENV" ]; then
        warn "Autograder_plus venv not found — creating at $APLUS_VENV ..."
        python3 -m venv "$APLUS_VENV"
    fi
    if [ -f "$APLUS_DIR/requirements.txt" ]; then
        log "Installing Autograder_plus dependencies..."
        "$APLUS_VENV/bin/pip" install -q -r "$APLUS_DIR/requirements.txt"
        ok "Autograder_plus dependencies installed."
    fi
else
    warn "Autograder_plus directory not found at $APLUS_DIR — AI analysis will not work."
fi

# ─── 7. Start Daphne with watchdog (auto-restart on crash) ──────────────────
# For a more robust alternative, use the systemd user service:
#   cp autograder-daphne.service ~/.config/systemd/user/
#   systemctl --user enable --now autograder-daphne
#   journalctl --user -u autograder-daphne -f
log "Starting Django backend (Daphne on port 8007) with watchdog..."

daphne_watchdog() {
    # Use absolute path so cwd is never ambiguous after a crash-restart
    local BACKEND_DIR="${PROJECT_DIR}/backend"
    local DAPHNE_BIN="${PROJECT_DIR}/venv/bin/daphne"
    while true; do
        echo "[watchdog] Starting Daphne..."
        cd "${BACKEND_DIR}" && "${DAPHNE_BIN}" -b 0.0.0.0 -p 8007 autograder.asgi:application 2>&1
        EXIT_CODE=$?
        echo "[watchdog] Daphne exited (code $EXIT_CODE). Restarting in 3s..."
        sleep 3
    done
}

daphne_watchdog &
DAPHNE_PID=$!
PIDS+=($DAPHNE_PID)

# Wait and verify watchdog + daphne started
sleep 4
if ! kill -0 $DAPHNE_PID 2>/dev/null; then
    err "Daphne watchdog failed to start!"
    exit 1
fi
ok "Daphne watchdog running (PID $DAPHNE_PID) — auto-restarts on crash"

# ─── 8a. General Celery Worker (code execution, gradebook, etc.) ────────────
log "Starting general Celery worker (concurrency=4)..."
(cd backend && celery -A autograder worker \
    --loglevel=info \
    --concurrency=4 \
    --max-memory-per-child=350000 \
    --queues=celery \
    --hostname=general@%h \
    --logfile=/tmp/celery.log 2>&1) &
CELERY_PID=$!
PIDS+=($CELERY_PID)

sleep 2
if ! kill -0 $CELERY_PID 2>/dev/null; then
    err "General Celery worker failed to start! Check /tmp/celery.log."
    exit 1
fi
ok "General Celery worker running (PID $CELERY_PID)"

# ─── 8b. AI Analysis Worker (sequential GPU pipeline, concurrency=1) ─────────
# concurrency=1 ensures only ONE question pipeline runs at a time → no GPU OOM.
# PYTORCH_CUDA_ALLOC_CONF lets PyTorch reuse fragmented GPU memory.
log "Starting AI analysis Celery worker (concurrency=1, sequential GPU)..."
(cd backend && PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True celery -A autograder worker \
    --loglevel=info \
    --concurrency=1 \
    --queues=ai_analysis \
    --hostname=ai@%h \
    --logfile=/tmp/celery_ai.log 2>&1) &
CELERY_AI_PID=$!
PIDS+=($CELERY_AI_PID)

sleep 2
if ! kill -0 $CELERY_AI_PID 2>/dev/null; then
    err "AI Celery worker failed to start! Check /tmp/celery_ai.log."
    exit 1
fi
ok "AI Celery worker running (PID $CELERY_AI_PID) → logs: /tmp/celery_ai.log"

# ─── 8c. Celery Beat Scheduler (periodic tasks: exam question auto-release) ──
log "Starting Celery Beat scheduler..."
(cd backend && celery -A autograder beat \
    --loglevel=info \
    --logfile=/tmp/celery_beat.log 2>&1) &
CELERY_BEAT_PID=$!
PIDS+=($CELERY_BEAT_PID)

sleep 2
if ! kill -0 $CELERY_BEAT_PID 2>/dev/null; then
    err "Celery Beat failed to start! Check /tmp/celery_beat.log."
    exit 1
fi
ok "Celery Beat running (PID $CELERY_BEAT_PID) → logs: /tmp/celery_beat.log"

# ─── 9. Frontend ─────────────────────────────────────────────────────────────
log "Setting up frontend..."
cd frontend

if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules/.package-lock.json" ]; then
    log "Installing/updating Node.js dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        err "npm install failed!"
        exit 1
    fi
    ok "Node.js dependencies installed."
else
    ok "Node.js dependencies up to date."
fi

log "Starting Vite dev server (port 5173)..."
npm run dev 2>&1 &
FRONTEND_PID=$!
PIDS+=($FRONTEND_PID)
cd ..

sleep 3
if ! kill -0 $FRONTEND_PID 2>/dev/null; then
    err "Frontend failed to start!"
    exit 1
fi
ok "Frontend running (PID $FRONTEND_PID)"

# ─── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  All services started successfully!              ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Backend  →  http://localhost:8007               ║${NC}"
echo -e "${GREEN}║  Frontend →  http://localhost:5173               ║${NC}"
echo -e "${GREEN}║  Celery   →  /tmp/celery.log                     ║${NC}"
echo -e "${GREEN}║  Beat     →  /tmp/celery_beat.log                ║${NC}"
echo -e "${GREEN}║                                                  ║${NC}"
echo -e "${GREEN}║  Press Ctrl+C to stop everything                 ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# Wait for all background processes
wait
