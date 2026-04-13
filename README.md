# Zamtel TDR Monitor

A full-stack Progressive Web App (PWA) for monitoring Zamtel Territory Development Representatives (TDR) sales performance across all 10 zones of Zambia.

## Architecture

```
zamtel-tdr-monitor/
├── frontend/     # React 18 + TypeScript + TailwindCSS + Vite PWA
├── backend/      # Node.js + Express + TypeScript + Prisma
└── docker-compose.yml
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, TailwindCSS, Vite, Redux Toolkit |
| PWA | vite-plugin-pwa (Workbox), service worker, IndexedDB offline queue |
| Backend | Node.js 20, Express 4, TypeScript |
| ORM | Prisma 5 |
| Database | PostgreSQL 16 |
| Auth | PIN-based (bcrypt hash) + JWT (30-day tokens) |
| Hosting | Railway (backend) + GitHub Pages (frontend) |

## Role Hierarchy

```
HSD (Head of Sales & Distribution)
  └── ZBM (Zonal Business Manager) — 1 per zone
        └── TDR (Territory Development Rep)
```

## Monthly Targets (per TDR)

| KPI | Target |
|-----|--------|
| Agent Recruitments | 96 |
| Merchant Recruitments | 96 |
| Outlet Visitations | 20 |

## Zambia Zones

Lusaka, Copperbelt, Northern, Eastern, Southern, Western, Luapula, Muchinga, North-Western, Central

---

## Quick Start (Local Development)

### Prerequisites
- Node.js 20+
- PostgreSQL 16 (or use Docker)
- npm 9+

### 1. Clone & Setup

```bash
git clone <repo-url>
cd zamtel-tdr-monitor
```

### 2. Database (Docker)

```bash
docker run --name zamtel-db \
  -e POSTGRES_USER=zamtel \
  -e POSTGRES_PASSWORD=zamtel_password \
  -e POSTGRES_DB=zamtel_tdr \
  -p 5432:5432 -d postgres:16-alpine
```

### 3. Backend Setup

```bash
cd backend
cp .env.example .env
# Edit .env with your DATABASE_URL and JWT_SECRET

npm install
npx prisma migrate dev --name init
npm run seed
npm run dev
```

Backend runs on **http://localhost:3000**

### 4. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on **http://localhost:5173**

### 5. Login

| User | ID | PIN | Role | Zone |
|------|----|-----|------|------|
| James Banda  | hsd-001 | 9999 | HSD | — |
| Mary Phiri   | zbm-001 | 5678 | ZBM | Copperbelt |
| David Mwale  | zbm-002 | 5679 | ZBM | Lusaka |
| Abel Mumba   | tdr-001 | 1234 | TDR | Copperbelt |
| Grace Tembo  | tdr-002 | 2345 | TDR | Copperbelt |
| Peter Lungu  | tdr-003 | 3456 | TDR | Lusaka |

---

## Docker Compose (Full Stack)

```bash
docker compose up --build
```

- Frontend: http://localhost:4173
- Backend:  http://localhost:3000
- DB:       localhost:5432

---

## Production Deployment

### Backend → Railway

1. Create a new Railway project
2. Add a PostgreSQL service
3. Deploy the `backend/` directory
4. Set environment variables:
   ```
   DATABASE_URL=<railway-postgres-url>
   JWT_SECRET=<long-random-secret>
   CORS_ORIGIN=https://your-github-pages-url.github.io
   PORT=3000
   NODE_ENV=production
   ```
5. Railway auto-runs: `prisma migrate deploy && node dist/index.js`
6. After first deploy, run seed:
   ```bash
   railway run npm run seed
   ```

### Frontend → GitHub Pages

1. Set the `VITE_API_URL` in `.github/workflows/ci.yml`:
   ```yaml
   VITE_API_URL: https://your-backend.railway.app/api/v1
   ```
2. Update `CNAME` in `ci.yml` to your actual domain (or remove it for `username.github.io/repo`)
3. Push to `main` — GitHub Actions builds and deploys automatically
4. In repo Settings → Pages → Source: `gh-pages` branch

---

## API Reference

### Auth
```
POST /api/v1/auth/login   { id, pin } → { token, user }
```

### TDR (requires TDR JWT)
```
GET  /api/v1/tdr/dashboard
POST /api/v1/tdr/agents
POST /api/v1/tdr/visits
POST /api/v1/tdr/float-issues
GET  /api/v1/tdr/float-issues
PATCH /api/v1/tdr/float-issues/:id
POST /api/v1/tdr/prospects
GET  /api/v1/tdr/prospects
PATCH /api/v1/tdr/prospects/:id
```

### ZBM (requires ZBM JWT)
```
GET   /api/v1/zbm/dashboard
GET   /api/v1/zbm/tdr/:tdrId
GET   /api/v1/zbm/float-issues
PATCH /api/v1/zbm/float-issues/:id
GET   /api/v1/zbm/prospects
```

### HSD (requires HSD JWT)
```
GET   /api/v1/hsd/dashboard?period=YYYY-MM
GET   /api/v1/hsd/zones?period=YYYY-MM
GET   /api/v1/hsd/zones/:zone?period=YYYY-MM
PATCH /api/v1/hsd/float-issues/:id
POST  /api/v1/hsd/targets
GET   /api/v1/hsd/export?period=YYYY-MM
```

### Admin (requires HSD JWT)
```
POST /api/v1/admin/migrate-from-sheets   { agents: [], visits: [] }
GET  /api/v1/admin/users
```

---

## Data Migration from Google Sheets

1. Export your Google Sheet as CSV
2. Parse the CSV into `agents` and `visits` arrays
3. POST to `/api/v1/admin/migrate-from-sheets`:

```bash
curl -X POST https://your-api.railway.app/api/v1/admin/migrate-from-sheets \
  -H "Authorization: Bearer <hsd-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "agents": [
      {
        "tdrId": "tdr-001",
        "tdrName": "Abel Mumba",
        "zone": "Copperbelt",
        "agentName": "Mwamba Store",
        "agentCode": "ZM-COP-001",
        "contactPhone": "+260977000001",
        "type": "normal",
        "initialFloat": 5000,
        "town": "Kitwe"
      }
    ],
    "visits": []
  }'
```

---

## PWA Features

- **Installable** on Android and iOS ("Add to Home Screen")
- **Offline dashboard**: Last-fetched data cached via Workbox `StaleWhileRevalidate`
- **Offline write queue**: New records queued in IndexedDB, auto-synced when back online
- **Offline banner**: Yellow banner shows when device is offline

---

## Color Palette

| Color | Hex | Usage |
|-------|-----|-------|
| Zamtel Red | `#E2231A` | Primary brand color, CTAs |
| Dark Navy | `#1A1A2E` | Header, dark backgrounds |
| White | `#FFFFFF` | Cards, backgrounds |

---

## Development Notes

- **PIN auth only** — no email/password. PINs stored as bcrypt hashes.
- **JWT expiry**: 30 days (suitable for field staff)
- **Rate limiting**: 20 login attempts per 15min; 300 API requests per minute
- **Role enforcement**: Each route group (tdr/zbm/hsd) strictly enforces role via JWT middleware
- **Prospect auto-convert**: When a prospect status → `converted`, a real `Agent` record is automatically created

---

## License

Proprietary — Zambia Telecommunications Company Limited
