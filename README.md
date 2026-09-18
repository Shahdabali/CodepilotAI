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
| SAFE | Ask before every file modification |
| BALANCED | Auto-modify files, ask for risky operations |
| AUTONOMOUS | Complete normal dev tasks independently |

## Security

- API keys stored in backend `.env`, never sent to frontend
- All file operations restricted to the project workspace
- Dangerous commands require explicit user confirmation
- Process execution sandboxed with timeouts
- No automatic git push to remote
