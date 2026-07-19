# Oru'el ↔ Spheron GPU Relay

A relay API that sits between **Spheron AI's GPU API** (`https://app.spheron.ai`) and
**Podstack**. Oru'el holds the real Spheron partner API key; this service re-exposes
Spheron's GPU catalog and deployment lifecycle to Podstack under Oru'el's own API key
system, with a configurable markup applied to every price, and a dashboard showing
exactly what Podstack has done with it.

```
Podstack  --X-API-Key-->  Oru'el relay  --Bearer SPHERON_API_KEY-->  Spheron AI
                                │
                                └── Postgres: usage log, deployment cost, clients
                                └── /admin dashboard (you, internal only)
```

## What's relayed vs. what's not

Everything Podstack can call maps 1:1 to a real Spheron endpoint, with the same
request/response shape, so their integration reads exactly like it's talking to
Spheron directly — just via `https://your-relay-host` instead of `https://app.spheron.ai`,
with `X-API-Key: <key you issued them>` instead of their own Spheron key.

| Relayed to Podstack (`/api/...`) | Markup applied? |
|---|---|
| `GET /providers` | no (no pricing) |
| `GET /gpu-offers` | yes |
| `POST/GET/PATCH/DELETE /deployments`, `.../can-terminate` | yes |
| `GET /kubernetes/versions`, `GET /kubernetes/:id/health` | no (no pricing) |
| `GET/POST/DELETE /ssh-keys/*` | no (no pricing) |
| `GET/POST/PATCH/DELETE /volumes/*`, `/attach`, `/detach`, `/pricing`, `/regions` | yes |

**Deliberately NOT relayed:** `GET /api/balance` and `GET /api/teams`. Those expose
Oru'el's own Spheron account balance and team membership — internal business
information, not something a downstream partner should see. If Podstack needs "how
much have we spent," that's served from Oru'el's own tracked data instead (see
`/admin` dashboard, and the `by-client` breakdown), which is more relevant to them
anyway since it reflects billed (marked-up) cost, not Oru'el's raw Spheron balance.

## How the markup works

Every numeric field in a Spheron response that represents a USD rate (`price`,
`hourlyRate`, `totalCost`, `hourlyRatePerGb`, etc. — see `src/markup/index.ts` for the
full list cross-referenced against Spheron's docs) is multiplied by
`1 + markupPercent / 100` before the response reaches Podstack. The percentage is
stored in Postgres, editable live from the dashboard's fader control, and takes effect
within ~5 seconds (no restart, no redeploy).

Deployment cost is **not** double-marked-up: we always store Spheron's raw
`hourlyRate`/`totalCost` in `DeploymentRecord`, and apply the *current* markup at
read time everywhere (relay responses, dashboard). That means if you change the
markup today, every dashboard number and every future Podstack read reflects it
immediately — including for instances launched before the change.

## Project layout

```
oruel-relay/
├── prisma/schema.prisma        # Client, Setting, RequestLog, DeploymentRecord, AdminUser, AdminSession
├── openapi/openapi.yaml        # OpenAPI 3.0 spec, served at /docs (Swagger UI) and /docs/openapi.json
├── src/
│   ├── server.ts                # express app, middleware wiring, /docs, listen()
│   ├── config.ts                 # env var loading
│   ├── db.ts                     # Prisma client singleton
│   ├── spheron/client.ts         # the ONLY place SPHERON_API_KEY is used
│   ├── markup/index.ts           # recursive markup engine
│   ├── middleware/
│   │   ├── clientAuth.ts         # validates Podstack's X-API-Key
│   │   ├── adminAuth.ts          # cookie session auth for /admin
│   │   ├── requestLogger.ts      # logs every relayed call
│   │   └── errorHandler.ts       # maps SpheronApiError -> HTTP response
│   ├── services/
│   │   ├── settingsService.ts    # live markup get/set (5s cache)
│   │   ├── usageLogger.ts        # writes RequestLog rows, redacts secrets
│   │   └── costPoller.ts         # background refresh of running deployment cost
│   └── routes/
│       ├── relay/                # Podstack-facing: providers, gpu-offers, deployments,
│       │                         # kubernetes, ssh-keys, volumes
│       └── admin/                # Oru'el-facing: auth, clients, settings, usage, offers
├── public/                       # dashboard frontend (vanilla JS + Chart.js, no build step)
│   ├── index.html                # login
│   ├── dashboard.html            # overview / clients / deployments / requests / API+offers exposed
│   ├── dashboard.js
│   └── styles.css
├── scripts/seed-admin.ts         # creates the first admin login
├── docker-compose.yml            # local Postgres
├── Dockerfile                    # production container build (Cloud Run-ready)
├── .dockerignore
├── DEPLOYMENT.md                 # cheapest production deployment path
├── .env.example
└── package.json
```

## API documentation for Podstack

Interactive Swagger UI: `https://<your-host>/docs`
Raw OpenAPI spec (importable into Postman/Insomnia): `https://<your-host>/docs/openapi.json`

The spec (`openapi/openapi.yaml`) documents every relayed endpoint field-for-field
against Spheron's own docs, with an explicit note that every price already includes
your markup and that deployments/results are scoped to the caller's own API key. Send
Podstack the `/docs` link directly — no separate document to maintain, it stays in
sync with the code because it's generated from the same source of truth you edit.

## Seeing everything the API exposes

The dashboard has an **API & offers exposed** tab that shows, live:
- A table of every relayed endpoint, whether markup applies, and whether it's scoped
  per-client — the same information as the table above, kept in the UI so you don't
  have to open this file to check.
- Every current GPU offer exactly as Podstack would see it, side-by-side with
  Spheron's raw (pre-markup) price, so you can sanity-check the markup math and see
  margin per offer per hour, live.

## Deploying to production

See [`DEPLOYMENT.md`](./DEPLOYMENT.md) — cheapest path is Cloud Run (free tier) +
Neon serverless Postgres (free tier), landing at $0/month for low-to-moderate traffic,
with your GCP credits as headroom rather than the primary cost. Includes the
`Dockerfile`/`.dockerignore` already in this repo, exact `gcloud` commands, and
cheaper alternatives if you'd rather not touch GCP at all.

## Setup

### 1. Prerequisites
- Node.js 20+
- Docker (for local Postgres) — or point `DATABASE_URL` at any Postgres 14+ instance
- A real Spheron API key: generate one at https://app.spheron.ai/settings under
  Oru'el's partner account

### 2. Install & configure

```bash
cd oruel-relay
npm install
cp .env.example .env
```

Edit `.env`:
- `SPHERON_API_KEY` — Oru'el's real key. **Never commit this, never log it, never
  send it to Podstack.**
- `DATABASE_URL` — leave as-is if using the bundled `docker-compose.yml`
- `ADMIN_SEED_USERNAME` / `ADMIN_SEED_PASSWORD` — your first dashboard login;
  change the password immediately after first sign-in in any non-local environment
- `DEFAULT_MARKUP_PERCENT` — starting markup (you asked for 20; adjustable live later)

### 3. Database

```bash
docker compose up -d          # starts local Postgres
npx prisma migrate dev        # creates tables
npm run seed                  # creates your first admin login
```

### 4. Run

```bash
npm run dev        # dev mode, auto-reload
# or
npm run build && npm start   # production
```

Server starts on `http://localhost:4000` (change with `PORT`).

### 5. Open the dashboard

Go to `http://localhost:4000/admin`, sign in with the admin credentials from step 2.
From there:
- **Overview** — request volume, active deployments, billed vs. raw Spheron cost,
  margin, and the live markup fader
- **Clients & keys** — click **+ New client**, name it (e.g. `Podstack - Production`),
  copy the generated key. This is the only time the raw key is shown — store it
  somewhere safe (password manager / secrets vault) and hand it to Podstack over a
  secure channel. Revoke or rotate any key from the same screen.
- **Deployments** — every GPU instance launched through the relay, real Spheron
  rate vs. billed rate vs. margin
- **Request log** — raw call-by-call history, filterable by path

### 6. Give Podstack their integration details

Tell Podstack:
- Base URL: `https://<your-relay-host>` (same paths as Spheron's own docs, e.g.
  `GET /api/gpu-offers`, `POST /api/deployments`)
- Auth header: `X-API-Key: <the key you generated for them>`
- Everything else (request/response shapes, status values, error format) matches
  Spheron's public API reference at https://docs.spheron.ai/api-reference — the relay
  intentionally mirrors it field-for-field so their existing Spheron-shaped
  integration code needs minimal changes.

## Known limitations / natural next steps

- **SSH keys and Kubernetes cluster health are not ownership-scoped per client.**
  Deployments and volumes are tracked in `DeploymentRecord`/derived from it, so the
  relay can enforce "Podstack can only see their own." SSH keys and k8s cluster
  IDs currently aren't tied to a client the same way — every relayed SSH key lives
  in Oru'el's single Spheron account. Fine for a single downstream partner (Podstack);
  if you onboard a second partner, add an `SshKeyRecord` table mirroring
  `DeploymentRecord` before doing so.
- **Spend caps are stored but not yet enforced.** `Client.spendCapUsd` exists in the
  schema and dashboard so you can set an intended ceiling, but nothing currently
  blocks a deployment once a client exceeds it — add a check in
  `routes/relay/deployments.ts` (sum billed cost, compare to cap) before relying on
  it as a hard limit.
- **Rate limiting is in-memory** (`express-rate-limit`'s default store), which resets
  on restart and doesn't share state across multiple server instances. Fine for a
  single-process deployment; swap in the Redis store (`rate-limit-redis`) if you run
  more than one instance behind a load balancer.
- **`GET /api/kubernetes/:clusterId/health`** is proxied without ownership
  verification since cluster IDs aren't tracked locally yet (only opaque UUIDs
  known to whoever provisioned the cluster).

## Security notes

- `SPHERON_API_KEY` is read once in `src/spheron/client.ts` and never appears in any
  response, log line, or dashboard view.
- Podstack's raw API key is shown to you exactly once, at creation time; only its
  SHA-256 hash is stored, so if it's lost, rotate rather than "recover."
- Admin dashboard sessions are httpOnly cookies backed by a DB-stored session table
  (not JWTs), so revoking a session (or wiping `AdminSession`) is immediate.
