# BeamHaven production image (ADR-010, ADR-021).
#
# One Dockerfile, two images:
#   app  The website. Only the small "standalone" server Next.js builds,
#        so it holds no build tools and no source code.
#   ops  Maintenance commands: database migrations, creating the first
#        account, making password-reset links. It holds the full toolset,
#        and only runs when we ask it to.
#
# Build both on the server with:  docker compose build

ARG NODE_IMAGE=node:24-alpine

# --- 1. Install dependencies exactly as the lock file says ------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `npm ci` runs `prisma generate` afterwards, which needs the schema.
COPY prisma ./prisma
COPY prisma.config.ts ./
# The optional "extra_ca" secret is only for build machines behind an
# inspecting proxy (like our cloud test machine). Your VM doesn't need it.
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    npm ci --no-audit --no-fund

# --- 2. Build the website ---------------------------------------------------
FROM deps AS build
COPY . .
# The build needs no secrets: every setting is read when a request arrives.
ENV NEXT_TELEMETRY_DISABLED=1
# The same optional proxy certificate, for downloading the fonts while building.
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    npm run build

# --- 3a. The ops image: migrations and admin commands -----------------------
# Dependencies plus source code (the scripts run it directly); no website build.
FROM deps AS ops
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --chown=node:node . .
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

# --- 3b. The app image: what actually serves the website --------------------
FROM ${NODE_IMAGE} AS app
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
# Uploaded files live here, on a Docker volume (owned by the unprivileged user).
RUN mkdir -p /data/uploads && chown node:node /data/uploads
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
# Docker marks the container unhealthy if /api/health stops answering 200.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
