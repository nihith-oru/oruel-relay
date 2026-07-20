# End-to-End Production Deployment Guide (GCP VM + GitHub + Cloudflare)

This guide provides the complete, step-by-step commands to push your project to GitHub, clean your GCP VM, install clean prerequisites, and deploy the relay server with direct port 80 mapping.

---

## Part 1: Push Local Code to GitHub

From your local machine's terminal in the `oruel-relay` project directory, run the following commands to initialize Git, commit the files, and push to a new private GitHub repository:

```bash
# 1. Initialize git (if not already done)
git init

# 2. Ensure sensitive files are ignored (verify .env is not tracked)
# The .gitignore should contain: node_modules, dist, .env, *.log, .DS_Store
git add .gitignore
git add .

# 3. Create initial commit
git commit -m "feat: relay server production ready with security and E2E verification"

# 4. Rename main branch
git branch -M main

# 5. Add your remote repository (Replace with your actual GitHub repo URL)
# Ensure it is a PRIVATE repository so your configuration examples aren't public.
git remote add origin git@github.com:YOUR_GITHUB_USERNAME/oruel-relay.git

# 6. Push to GitHub
git push -u origin main
```

---

## Part 2: SSH & Clean the GCP VM

SSH into your GCP VM using the Google Cloud Console, or from your local terminal:
```bash
ssh -i /path/to/ssh/key username@YOUR_VM_PUBLIC_IP
```

Once inside the VM, perform a **complete wipe** to clean out any old containers, volumes, networks, and existing source files to start fresh:

```bash
# 1. Stop and remove all running Docker containers
sudo docker stop $(sudo docker ps -aq) 2>/dev/null
sudo docker rm $(sudo docker ps -aq) 2>/dev/null

# 2. Prune all unused Docker data (containers, volumes, images, networks)
sudo docker system prune -a --volumes -f

# 3. Delete previous project source directories (Replace with your previous directory path)
sudo rm -rf ~/oruel-relay
```

---

## Part 3: Install Clean Prerequisites on VM

If the VM does not have Git, Docker, or Docker Compose installed, run these setup commands:

```bash
# 1. Update package list
sudo apt update -y

# 2. Install Git
sudo apt install -y git

# 3. Install Docker
sudo apt install -y docker.io

# 4. Install Docker Compose
sudo apt install -y docker-compose-v2

# 5. Start and enable Docker service
sudo systemctl start docker
sudo systemctl enable docker

# 6. (Optional) Allow running docker commands without sudo
sudo usermod -aG docker $USER
# Run 'newgrp docker' or log out/in to apply group membership
```

---

## Part 4: Clone & Configure on VM

```bash
# 1. Clone the repository from GitHub
git clone https://github.com/YOUR_GITHUB_USERNAME/oruel-relay.git ~/oruel-relay
cd ~/oruel-relay

# 2. Create the production environment configuration file
cp .env.example .env

# 3. Open the file to edit settings
nano .env
```

Set the variables inside `.env` exactly for production:
```env
# --- Server ---
PORT=4000
NODE_ENV=production
BASE_URL="https://relay.oru-el.com"
DOMAIN="relay.oru-el.com"

# --- Database ---
DATABASE_URL="postgresql://oruel:oruel_password@postgres:5432/oruel_relay?schema=public"

# --- Spheron AI API Key ---
SPHERON_API_KEY="sai_pk_..."
SPHERON_BASE_URL="https://app.spheron.ai"

# --- Markup ---
DEFAULT_MARKUP_PERCENT=20

# --- Admin Dashboard ---
ADMIN_SEED_USERNAME="admin"
ADMIN_SEED_PASSWORD="A_VERY_SECURE_PASSWORD_HERE"  # Change this to a secure password!

# Cost poller interval (5 minutes)
COST_POLL_INTERVAL_MS=300000
```
*(Press `Ctrl+O` then `Enter` to save, and `Ctrl+X` to exit nano)*

---

## Part 5: Deploy & Boot Server

Start the database container and compile/boot the Node.js application container mapping directly on port 80:

```bash
# 1. Start the Docker Compose stack (builds container and runs in background)
sudo docker compose up -d --build

# 2. Confirm both containers are up
sudo docker compose ps
```

---

## Part 6: Database Setup & Seed

Run database migrations and seed the first admin user credentials inside the running container:

```bash
# 1. Run Prisma database migrations to create the PostgreSQL tables
sudo docker compose exec app npx prisma migrate deploy

# 2. Seed the admin dashboard user
sudo docker compose exec app npm run seed
```

---

## Part 7: Cloudflare Setup

1. Log into your **Cloudflare Dashboard**.
2. Select your domain `oru-el.com` and go to **DNS**.
3. Create an **A record**:
   * **Name**: `relay`
   * **IPv4 address**: Your GCP VM Public IP
   * **Proxy status**: Proxied (Orange cloud active)
4. Go to **SSL/TLS** settings on Cloudflare:
   * Select **Flexible** (Cloudflare terminates SSL at edge, proxies HTTP traffic to VM Port 80).

---

## Part 8: Verification Checks

Verify that everything works end-to-end:

1. **Verify Docs**: Open your browser and navigate to `https://relay.oru-el.com/docs`. You should see the Swagger UI.
2. **Verify Admin Dashboard**: Navigate to `https://relay.oru-el.com/admin` and sign in with the credentials set in your `.env`.
3. **Run E2E Verification Tests**: Execute the automated integration suite directly inside the VM's container to ensure key headers, DB, proxy requests, and markup functions are working:
   ```bash
   sudo docker compose exec app npx tsx scripts/test-relay.ts
   ```
