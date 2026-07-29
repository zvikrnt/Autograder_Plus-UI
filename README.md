# Autograder System

A comprehensive, AI-powered code autograding platform designed for computer science education. It features an isolated execution environment, robust multi-language support, real-time analytics, gamification aspects, and advanced AI-driven feedback generation.

## 📖 Overview

The Autograder system is built to provide educators with powerful tools to assess student code securely and provide students with instant, actionable feedback. It streamlines the lifecycle of assignments—from creation to grading to feedback generation—making the classroom process seamless.

### Core Architecture Pillars:
1. **Frontend**: A modern, responsive React interface offering localized dashboards for Students, Teachers, and Teaching Assistants.
2. **Backend**: A highly scalable Django backend handling ORM operations, REST APIs, WebSocket channels (Daphne), and orchestrated asynchronous tasks (Celery).
3. **Execution Sandbox**: An ephemeral container system utilizing Docker to run untrusted candidate code securely across multiple languages.
4. **Autograder+ (AI Pipeline)**: A specialized GPU-accelerated pipeline providing sophisticated semantic analysis and subjective AI-driven feedback, driven by localized Large Language Models (LLMs).

---

## ✨ Key Features

- **Multi-Language Execution Environment**: First-class support for Python (3.10), C (C11 gcc), and Java (21).
- **Secure Ephemeral Sandboxing**: Uses Docker containers behind the scenes for robust code isolation, ensuring malicious or runaway code is strictly bounded.
- **AI-Powered Code Feedback**: Integrates with local LLMs (via Ollama) and custom semantic embedding models to generate cognitive insights, highlight edge cases, and provide non-blocking hints.
- **Gamified Student Experience**: Features points, streaks, achievement badges, and a leaderboard to motivate consistent practice.
- **Role-Based Access Control**: Tailored portals distinguishing capabilities between overarching Administrators, Class Instructors (Teachers), Teaching Assistants, and enrolled Students.
- **Event-Driven Task Orchestration**: Leverages Redis and Celery to manage thousands of concurrent code executions and AI analyses without blocking the UI.

---

## 🏗️ Architecture & Technology Stack

| Layer | Technologies Used | Responsibilities |
|---------|---------------------|--------------------|
| **Frontend UI** | React 18, Vite, Tailwind CSS, Framer Motion, Lucide Icons | Renders the single-page application (SPA). Manages token-based isolated sessions, routing, and responsive dashboard components. |
| **Backend Core** | Django 5, Django REST Framework (DRF), Channels/Daphne | Exposes REST APIs, manages access control policies (JWT), handles database models, and manages WebSocket connections for live notifications. |
| **Database & Cache** | PostgreSQL 16, Redis 7 | PostGres provides transactional durability for relational data. Redis functions as both a fast ephemeral cache and the Celery message broker. |
| **Task Queue**| Celery | Orchestrates long-running jobs (sandbox provision, code execution, metric recording, auto-grading pipelines). |
| **Storage** | MinIO | S3-compatible local object storage for user avatars, raw submissions, and assignment attachments. |
| **AI Pipeline** | PyTorch, LangChain, Ollama (Llama 3/Mistral/LFM2) | Consumes Python code logic conceptually to issue smart, pedagogical, code-specific feedback. |

---

## 📁 Repository Structure

### High-Level Blueprint

```text
Autograder/
├── backend/            # Python/Django API Monolith
├── frontend/           # React SPA and UI System
├── scripts/            # Utility and maintenance scripts
├── tests/              # End-to-end integration tests
├── docker-compose.yml  # Base infrastructure definitions
└── start.sh            # Global initialization and process watcher
```

### Detailed Folder Breakdown

**Backend (`/backend`)**:
```text
backend/
├── analytics/           # Cross-application telemetry and performance metrics
├── assignments/         # Assignment definitions, content modules, file constraints
├── autograder/          # Django core settings, WSGI/ASGI endpoints, routing
├── classes/             # Roster management, student enrollments, TA designations
├── gamification/        # Badges, points logic, consecutive streak algorithms
├── notifications/       # Real-time WebSocket event dispatching
├── submissions/         # The core grading logic, Celery orchestration pipelines
├── code_executor/       # Interfaces wrapping the Docker execution daemon
├── users/               # JWT-based Auth endpoints and custom Auth User mappings
└── utils/               # Shared logic, hashing utils, Docker health checks
```

**Frontend (`/frontend/src`)**:
```text
frontend/src/
├── assets/              # Static assets, branding, and imagery
├── components/          
│   ├── auth/            # Login, Registration, Password recovery
│   ├── features/        # High-order components (Gamification widgets, Leaderboards)
│   ├── layout/          # Header, Sidebar, role-based layout wrappers
│   ├── ui/              # Base primitive library (Buttons, Cards, Modals)
│   └── workspace/       # IDE views, interactive Resizable Terminal logic
├── contexts/            # Global React state (AuthContext, ThemeContext)
├── pages/               
│   ├── admin/           # Global site visibility and settings
│   ├── student/         # Assignments, Code Editor Workspace, Practice Library
│   ├── teacher/         # Course publishing, Grading dashboard, Roster controls
│   └── teacher_assistant/ # Subset of Teacher privileges scoped to grading
├── services/            # Axios API interceptors and localized fetch mechanisms
└── utils/               # Frontend utility helpers (Token storage logic, formatters)
```

**AI Pipeline (`../Autograder_plus`)**: *(Included as a sibling directory)*
```text
Autograder_plus/         # Dedicated AI Engine
├── src/
│   ├── modules/
│   │   ├── embedding_engine.py # Translates subjective logic to AST embeddings
│   │   └── feedback_engine.py  # Orchestrates Ollama prompt pipelines
│   └── main.py                 # The Celery entrypoint for `ai_analysis` tasks
```

---

## 🚀 Deployment & Getting Started

The platform relies on several microservices and infrastructure databases orchestrating together. Follow these steps for local deployment.

### Prerequisites
- Unix-like OS (Linux / MacOS) or WSL2 (Windows)
- **Node.js**: v18+
- **Python**: v3.10+
- **Docker**: Engine & docker-compose installed and running.

### 1. Startup the Infrastructure Services
The database, cache, and object storage all operate as lightweight containers.
Navigate to the root directory and start the core Docker services:
```bash
docker-compose up -d
```
*This will bind PostGres to `5400`, Redis to `6380`, and MinIO to `9012`.*

### 2. Prepare Sandbox Execution Images
The dynamic analyzer spins up containers from minimal base images. You must pull these onto your host daemon first:
```bash
docker pull python:3.10-slim
docker pull gcc:13-bookworm
docker pull eclipse-temurin:21-jdk
```

### 3. Initiate the Application Stack
The project includes a centralized bash script (`start.sh`) that acts as a process watcher.
It will sequentially:
1. Generate and activate a Python virtual environment (`venv`).
2. Run database migrations (`manage.py migrate`).
3. Boot the **Daphne** ASGI Server for the Django backend.
4. Launch dual **Celery** Workers (One high-concurrency for operations, one low-concurrency for heavy AI).
5. Launch the **Celery Beat** Scheduler.
6. Install NPM packages and boot the **Vite** Frontend Server.

```bash
./start.sh
```

Once running successfully:
- **Frontend** interface is accessible at: `http://localhost:5173`
- **Backend APIs** are processed at: `http://localhost:8007` (The Vite configurator proxies routes here automatically).

---

## 🛡️ Important Security & Dev Notes

### Token Scopes and Sub-Account State
- The frontend architecture implements strict `sessionStorage` token isolation. This fundamentally ensures that if you open multiple browser tabs and log directly into differently-scoped test accounts (e.g., `jw` for John Wick the Teacher and `wj` for Chandwani Naman the Student), the Application respects individual contexts per tab. 
- Ensure that you are typing exact usernames during dev-testing (`jw` instead of `wj`) to avoid accidently bridging into existing automated fixture accounts with the same generic passwords. 

### Worker Configurations
- **AI Task Management**: Machine Learning tasks consume high VRAM. The secondary Celery worker strictly limits itself to `--concurrency=1` to serialize GPU workload pipelines, mitigating Out-Of-Memory exceptions.
- **Port Contention**: If services fail to boot, verify that overlapping legacy services are not occupying `8007` or `5173`. The `start.sh` attempts to kill orphaned processes, but unmanaged Docker deployments might conflict. 

### Access Contributions
When contributing to `Autograder_plus` AI engine, ensure the directory structurally mimics a sibling layout (`../Autograder_plus`) relative to `start.sh` so the startup scripts can successfully bootstrap its isolated venv environments.
