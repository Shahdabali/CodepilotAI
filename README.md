# CodePilot AI

> Autonomous AI-powered coding assistant — tell it what to build, let it handle the engineering.

## Quick Start

### Prerequisites
- Node.js 18+
- npm 9+
- A Google Gemini API key ([get one free](https://aistudio.google.com/app/apikey))

### Setup

```bash
# 1. Install dependencies
cd backend && npm install
cd ../frontend && npm install

# 2. Configure the backend
cd backend
cp .env.example .env
# Edit .env and set your GEMINI_API_KEY

# 3. Start the backend (terminal 1)
cd backend
npm run dev

# 4. Start the frontend (terminal 2)  
cd frontend
npm run dev
```

Open http://localhost:5173

## Architecture

```
User Command
     ↓
Task Analyzer      — understand intent and mode
     ↓
Context Analyzer   — inspect project files and stack
     ↓
Implementation Planner  — create step-by-step plan
     ↓
Code Generator     — create/modify files
     ↓
Execution Engine   — run the project
     ↓
Test Runner        — run tests and checks
     ↓
Error Analyzer  ←──── (loop if errors)
     ↓
Fix Generator      — apply fixes
     ↓
Optimizer          — improve code quality
     ↓
Verification       — confirm original request satisfied
     ↓
Final Result
```

## Project Structure

```
codepilot-ai/
├── backend/           # Fastify + TypeScript API server
│   ├── src/
│   │   ├── ai/        # AI provider abstraction (Gemini)
│   │   ├── agent/     # 10-stage agent pipeline
│   │   ├── db/        # SQLite schema + queries
│   │   ├── git/       # Git integration
│   │   ├── routes/    # API routes + SSE + WebSocket
│   │   ├── types/     # Shared TypeScript types
│   │   └── workspace/ # File ops, sandbox, diff, rollback
│   └── .env.example
└── frontend/          # React + Vite + Tailwind CSS
    └── src/
        ├── app/       # App shell and global styles
        ├── components/ # UI components
        ├── hooks/     # Custom React hooks
        ├── lib/       # API client, SSE, WebSocket
        ├── pages/     # Welcome and Workspace pages
        ├── stores/    # Zustand state stores
        └── types/     # TypeScript types
```

## Agent Modes

| Mode | Description |
|------|-------------|
| BUILD | Scaffold and implement new features |
| FIX | Find and repair bugs |
| OPTIMIZE | Analyze and improve performance/quality |
| EXPLAIN | Explain code and architecture |
| TEST | Generate and run tests |
| REFACTOR | Improve structure without changing behavior |
| REVIEW | Code review with detailed findings |
| MIGRATE | Tech stack migration assistance |
| AUTONOMOUS | Full pipeline with minimal interaction |

## Autonomy Levels

| Level | Behavior |
|-------|----------|
| SAFE | Pauses on an **Approve / Skip** card before every file write and every risky command |
| BALANCED | Writes files on its own; asks before risky commands |
| AUTONOMOUS | Runs end to end without asking (destructive commands stay blocked by the sandbox) |

Pick the level per task on the Home screen (it starts from the level saved in Settings). The chosen level is stored with
the task, so **Run again** behaves the same way. **Explain** and **Review** tasks are read-only: they answer from your code
and never write files or run builds. Any running task can be **cancelled** — the pipeline stops before its next write.

## API Fetcher

A developer-focused API workstation: open **API Fetcher** from the sidebar (or the command palette).

- **Request builder** – methods, URL with two-way query-param sync, headers (with presets), JSON / form-data / urlencoded / raw bodies, and Bearer, API key, Basic and OAuth 2.0 (client-credentials / password) authorization.
- **Real execution** – requests are sent by the backend (`backend/src/api-fetcher`), so CORS never applies and secrets stay server-side. Cancellation, timeouts, redirect chains, gzip/br decoding, and a 25 MB capture limit with full download.
- **Response viewer** – virtualized JSON tree (collapse, search, copy path/value), raw view, sandboxed HTML preview, image/PDF/media preview, headers, and per-status debugging hints.
- **Diagnostics** – measured DNS / TCP / TLS / TTFB / download timings, resolved IP, TLS certificate, redirect chain, and on-demand DNS+TCP and CORS-preflight checks.
- **Code & types** – Fetch, Axios, TypeScript, Python (Requests, HTTPX), cURL, Java, C#, Go, PHP; TypeScript interfaces/types, Python dataclasses and JSON Schema from real responses.
- **Workspace** – history, saved requests, nested collections, environments (`{{VAR}}`, secret values are write-only), import (cURL, OpenAPI/Swagger JSON+YAML, JSON, Postman v2.1) and export.
- **AI assistant** – uses the existing provider router; credentials and secret variable values are removed server-side before anything reaches a model.

Shortcuts: `Ctrl/Cmd+Enter` send · `Ctrl/Cmd+S` save · `Ctrl/Cmd+K` search · `Ctrl/Cmd+Shift+A` assistant.

Optional backend settings (all default to safe values):

| Variable | Default | Purpose |
|----------|---------|---------|
| `API_FETCHER_ALLOW_PRIVATE_NETWORK` | `true` in dev, `false` when `NODE_ENV=production` | Allow requests to localhost / LAN addresses. Cloud-metadata addresses are always blocked. |
| `API_FETCHER_MAX_RESPONSE_BYTES` | `26214400` (25 MB, max 100 MB) | Response capture limit |
| `API_FETCHER_ENCRYPTION_KEY` | unset | When set, environment secrets are encrypted at rest (AES-256-GCM) |

Tests: `npm run test:fetcher -w backend` (integration, add `FETCHER_TEST_ONLINE=1` to include real public APIs), `npm run test:fetcher -w frontend` (logic), `npm run test:codegen -w frontend` (executes generated snippets in every installed runtime).

### Other tests

| Command | Covers |
|---------|--------|
| `npm run test:agent -w backend` | task event protocol, SAFE/BALANCED/AUTONOMOUS approvals, cancellation, read-only modes, SSE replay, diff contract |
| `npm run test:github -w backend` | GitHub proxy: validation, ETag cache, rate limits, token handling, routes, AI briefing (fetch is stubbed; add `GITHUB_TEST_ONLINE=1` for live calls) |
| `npm run test:github -w frontend` | repo-URL parsing, file tree/search, formatters, API Fetcher collection builder, safe Markdown rendering |

## GitHub Explorer

Open **GitHub Explorer** from the sidebar, or paste a repository into the command palette (`Ctrl+K`).

- **Understand a repo fast** – README (rendered safely, relative links/images resolved), language breakdown, stats, topics, latest release, top contributors.
- **Browse** – virtualized file tree with keyboard navigation, "Go to file" fuzzy search, a read-only syntax-highlighted viewer, commits (copy full SHA), issues and pull requests with state filters.
- **AI briefing** – streams a short brief (what it is, stack, layout, how to start, where to contribute). The *server* fetches the README, tree, commits and issues, so the model only sees real repository data.
- **Clone to workspace** – hands the URL to the Clone dialog with a sensible destination already filled in.
- **API Fetcher hand-off** – one click creates a collection of 11 ready-to-send GitHub REST requests for that repository.
- Paste anything: `owner/repo`, a `https://github.com/...` URL (including `/tree/…` and `/blob/…` deep links), or `git@github.com:owner/repo.git`.

Requests go through the backend (`/api/github/*`), which talks only to `api.github.com`, validates every path segment,
caches with ETags, and maps failures (404, rate limit with reset time, network) to clear messages. Anonymous access allows
60 requests/hour; set `GITHUB_TOKEN` (or `GH_TOKEN`) in `backend/.env` for 5,000/hour. The token stays on the server — the
browser only learns *whether* one is configured. A rejected token falls back to anonymous access instead of breaking reads.

## Security

- API keys stored in backend `.env`, never sent to frontend
- All file operations restricted to the project workspace
- Dangerous commands require explicit user confirmation
- Process execution sandboxed with timeouts
- No automatic git push to remote
