# ReachFlow — AI Voice Outreach Platform

> **Portfolio project** — built to demonstrate full-stack product engineering,
> AI integration, and production-grade architecture skills.
> Not yet connected to a live calling backend or real client data.
> All data shown is mock/demo data.

---

## What this project is

ReachFlow is an AI-powered outbound sales call automation platform.
Clients upload lists of leads (phone numbers + names), and an AI voice
assistant calls each one, qualifies their interest, and updates the
dashboard in real time with outcomes.

This portfolio version demonstrates the complete frontend UI with mock
data, the full system architecture, and a production-ready CI/CD setup.
The live calling backend (Vapi.ai + FastAPI) is being built in Phase 2.

---

## Live demo

> 🔗 Coming soon — will be deployed to Vercel once Phase 1 is merged

---

## Features built (Phase 1 — UI)

- **Dashboard** — campaign stats, lead upload (CSV/Excel + manual),
  activity feed, client overview for Super Admin
- **Call Data** — full leads table with search, status filters,
  column sorting, pagination, CSV export, and transcript drawer
- **Progress** — Kanban pipeline of agreed leads grouped by stage
  (Contacted → High interest → Follow-up → Converted)
- **Settings** — profile, TRAI compliance config, retry scheduling,
  team & role management, API integrations, security controls
- **Dark / light theme** — persists across pages via localStorage
- **Role-based UI** — Super Admin sees all clients; Client Admin/Viewer
  see only their own data (enforced in backend, Phase 2)

---

## Planned (Phase 2 — Backend + AI)

- FastAPI backend (Python) with PostgreSQL on AWS Mumbai (ap-south-1)
- Vapi.ai integration for outbound AI voice calls
- Celery + Redis for retry scheduling (2-hour / 30-day logic)
- TRAI / NDNC compliance layer — scrubs numbers before calling
- OpenAI for call summarization and sentiment scoring
- JWT authentication with 3-tier RBAC
- Full deployment to AWS ECS + Vercel with GitHub Actions CI/CD

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, TypeScript, DM Sans |
| Backend (planned) | FastAPI, Python 3.11 |
| Database (planned) | PostgreSQL on AWS RDS Mumbai |
| Job queue (planned) | Celery + Redis (AWS ElastiCache) |
| AI voice (planned) | Vapi.ai + Plivo (India telephony) |
| AI intelligence (planned) | OpenAI GPT-4o |
| Hosting | Vercel (FE) + AWS ECS Fargate (BE) |
| CI/CD | GitHub Actions |

---

## Local setup

```bash
# 1. Clone
git clone https://github.com/YOUR_USERNAME/reachflow.git
cd reachflow

# 2. Install dependencies
npm install

# 3. Environment (no real values needed for Phase 1 — it's all mock data)
cp .env.example .env.local

# 4. Run
npm run dev
# Opens at http://localhost:3000
```

---

## Branch strategy

| Branch | Purpose |
|---|---|
| `feat/*` | Feature branches — daily work |
| `dev` | Integration — features merged here first |
| `staging` | Pre-production — QA and testing |
| `main` | Production — stable, deployed to Vercel |

---

## Project structure

```
reachflow/
├── src/
│   ├── app/                  # Next.js routes
│   │   ├── page.tsx          # / → Dashboard
│   │   ├── call-data/        # /call-data
│   │   ├── progress/         # /progress
│   │   └── settings/         # /settings
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx   # Shared navigation
│   │   │   └── Topbar.tsx    # Shared header
│   │   ├── Dashboard.tsx
│   │   ├── CallData.tsx
│   │   ├── Progress.tsx
│   │   └── Settings.tsx
│   ├── lib/
│   │   ├── api.ts            # API calls (mock → real in Phase 2)
│   │   ├── mock-data.ts      # All demo data (deleted in Phase 2)
│   │   └── theme-context.tsx # Dark/light mode
│   └── types/
│       └── index.ts          # TypeScript types
├── .github/workflows/
│   ├── ci.yml                # Runs on every PR
│   └── deploy.yml            # Deploys on merge to main
└── .env.example              # Safe template — no real secrets
```

---

## Compliance notes

This platform is designed for the Indian market with the following
regulatory considerations built into the architecture:

- **TRAI** — calls only between 9 AM and 9 PM IST
- **NDNC** — National Do Not Call registry scrubbing before every call
- **PDPB** — phone numbers encrypted at rest (AES-256)
- **Data residency** — all data stored in AWS Mumbai (ap-south-1)

---

## About this project

Built as a portfolio demonstration of:
- Full-stack product thinking (UI → backend → AI → compliance)
- Production architecture decisions with real-world constraints (India market, TRAI, PDPB)
- Modern frontend engineering with Next.js 15 + TypeScript
- CI/CD setup with GitHub Actions + Vercel

**This is not a finished product.** It is a structured, phased build
being developed publicly to show how a real SaaS product is architected
and built from scratch.

---

*Built by [Your Name] · [Your LinkedIn] · [Your Email]*
