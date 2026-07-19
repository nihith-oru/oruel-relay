# Deploying to production, cheaply

Your two costs are **compute** (running the Node server) and **database** (Postgres).
The setup below gets both to **$0/month** at low-to-moderate traffic, using your GCP
credits only as a buffer for anything that spills past the free tiers.

## The recommended stack: Cloud Run + Neon

| Piece | Service | Cost |
|---|---|---|
| App server | Google Cloud Run | Free: 2,000,000 requests/month + a generous vCPU/memory allowance, scales to zero when idle |
| Database | Neon (serverless Postgres, not GCP) | Free: 0.5 GB storage, 100 compute-hours/month, permanent (not a trial) |
| Secrets | Google Secret Manager | Free tier covers this easily at your scale |

**Why not Cloud SQL for the database?** Cloud SQL has no permanent free tier — even
the smallest instance runs a real monthly bill (roughly $10-15+/mo minimum), and it's
always-on even when nobody's calling your API. Neon is Postgres-compatible (same
`DATABASE_URL` connection string Prisma already expects, zero code changes), scales
to zero when idle, and is free forever at this project's size (a handful of tables:
clients, request logs, deployment records — nowhere near Neon's 0.5 GB cap for a long
time). This is the single biggest lever for keeping this at $0.

Keep your GCP credits in reserve for when/if you outgrow the free tiers rather than
spending them now.

---

## Step 1 — Create the Neon database

1. Sign up at https://neon.tech (no credit card required for the free tier).
2. Create a project, e.g. `oruel-relay`.
3. Copy the connection string it gives you — it looks like:
   ```
   postgresql://<user>:<password>@<host>.neon.tech/<db>?sslmode=require
   ```
4. You'll set this as `DATABASE_URL` in Step 3.

## Step 2 — Containerize the app

Add this `Dockerfile` to the project root (not currently in the zip — add it now):

```dockerfile
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/openapi ./openapi
COPY --from=build /app/prisma ./prisma
EXPOSE 4000
CMD ["node", "dist/server.js"]
```

And a `.dockerignore`:

```
node_modules
dist
.env
.git
```

Cloud Run expects the container to listen on `$PORT` (it sets this env var itself,
usually `8080`). Your `config.ts` already reads `PORT` from the environment, so
nothing to change there — just don't hardcode 4000 anywhere else.

## Step 3 — Push to Artifact Registry and deploy

From the project root, with `gcloud` CLI installed and authenticated
(`gcloud auth login`, `gcloud config set project <your-project-id>`):

```bash
# One-time setup
gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
gcloud artifacts repositories create oruel-relay --repository-format=docker --location=us-central1

# Build and push the image
gcloud builds submit --tag us-central1-docker.pkg.dev/<PROJECT_ID>/oruel-relay/relay:latest

# Store secrets (never pass these as plain env vars in the deploy command)
echo -n "postgresql://<user>:<password>@<host>.neon.tech/<db>?sslmode=require" | \
  gcloud secrets create DATABASE_URL --data-file=-
echo -n "<your real Spheron API key>" | \
  gcloud secrets create SPHERON_API_KEY --data-file=-

# Deploy
gcloud run deploy oruel-relay \
  --image us-central1-docker.pkg.dev/<PROJECT_ID>/oruel-relay/relay:latest \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production,SPHERON_BASE_URL=https://app.spheron.ai,DEFAULT_MARKUP_PERCENT=20 \
  --set-secrets DATABASE_URL=DATABASE_URL:latest,SPHERON_API_KEY=SPHERON_API_KEY:latest \
  --min-instances 0 \
  --max-instances 3
```

`--allow-unauthenticated` is required since Podstack calls this over plain HTTPS with
your own `X-API-Key` scheme — Cloud Run's own IAM auth is a separate, unrelated
layer you don't need here.

`--min-instances 0` is what makes this free: the container fully shuts down when idle
and costs nothing, at the price of a cold start (~1-2s) on the first request after a
quiet period. If that cold start matters for Podstack's SLA, set `--min-instances 1`
— note this moves you off the free tier into a small but real always-on cost (roughly
$5-10/month depending on region and how the instance is sized), paid for by your GCP
credits.

## Step 4 — Run the database migration once

Cloud Run containers don't have a shell you SSH into, so run the one-off migration
from your own machine, pointed at the same Neon `DATABASE_URL`:

```bash
DATABASE_URL="postgresql://<user>:<password>@<host>.neon.tech/<db>?sslmode=require" \
  npx prisma migrate deploy

DATABASE_URL="postgresql://<user>:<password>@<host>.neon.tech/<db>?sslmode=require" \
  ADMIN_SEED_USERNAME=admin ADMIN_SEED_PASSWORD="<a real password this time>" \
  npm run seed
```

## Step 5 — Point a real domain at it (optional but recommended)

Cloud Run gives you a `*.run.app` URL immediately. To use your own domain:

```bash
gcloud run domain-mappings create --service oruel-relay --domain relay.oruel.yourdomain.com --region us-central1
```

Then add the DNS records it gives you. Give Podstack this domain, not the raw
`.run.app` URL, so you can swap infrastructure later without breaking their
integration.

## What this actually costs

At low-to-moderate usage (Podstack polling offers periodically, launching a handful
of instances a day, a few hundred dashboard visits from you): **$0/month**, sitting
entirely inside Cloud Run's and Neon's free tiers. The only things that would push you
into paid territory:
- More than ~2M relay requests/month (Cloud Run)
- More than 0.5 GB of usage-log/deployment-record data (Neon) — at this schema size
  that's a very large number of logged requests before you'd hit it
- Setting `--min-instances 1` for zero cold-starts

If you outgrow the Neon free tier specifically, Neon's paid usage-based pricing has
no fixed minimum — you'd pay only for the compute-hours and storage actually used
beyond the free allowance, not a flat instance fee.

## Cheaper/simpler alternatives, if you'd rather not touch GCP

- **Railway** or **Render**: both offer a free/low-cost tier that bundles a small
  Postgres instance and Node hosting together in one dashboard — less setup than
  wiring Cloud Run to an external Neon database, at the cost of a lower free-tier
  ceiling (Render's free Postgres pauses after inactivity; Railway's free tier is
  trial-credit based, not permanent).
- **Fly.io**: has a small permanent free allowance for both compute and Postgres,
  similar tradeoffs to Railway/Render.

Given you already have GCP credits sitting there, Cloud Run + Neon is the
recommendation: it's genuinely free at this scale, and the credits stay available
as headroom rather than being your primary funding source.
