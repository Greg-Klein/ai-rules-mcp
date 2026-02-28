# ============================================================
# Stage 1: Build
# ============================================================
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# ============================================================
# Stage 2: Runtime
# ============================================================
FROM node:22-alpine

# Git is needed to clone/pull the skills repo
RUN apk add --no-cache git openssh-client

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist/ ./dist/

# Persistent volume for the cloned skills repo
VOLUME ["/data"]

# Default env
ENV PORT=3000
ENV SKILLS_REPO_BRANCH=main
ENV SKILLS_SUBDIR=skills
ENV SYNC_INTERVAL_SEC=300

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
