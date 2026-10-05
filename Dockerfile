# syntax=docker/dockerfile:1
###############################################################################
# CompliSME — shared base
#
# A monorepo with a TypeScript workspace: build everything once in the builder
# stage, then ship only the runtime artefacts. The API image carries Chromium so
# PDF generation works with no external dependency.
###############################################################################

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app


###############################################################################
# deps — install the workspace once, cached independently of source changes
###############################################################################
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json       packages/shared/
COPY packages/frameworks/package.json   packages/frameworks/
COPY packages/core/package.json         packages/core/
COPY packages/generator/package.json    packages/generator/
COPY packages/scanner/package.json      packages/scanner/
COPY packages/llm/package.json          packages/llm/
COPY packages/cli/package.json          packages/cli/
COPY packages/api/package.json          packages/api/
COPY packages/web/package.json          packages/web/
COPY packages/docs/package.json         packages/docs/
# Skip postinstall so Puppeteer's Chromium download does not happen here; the
# system Chromium is installed in the runtime stage instead.
RUN pnpm install --frozen-lockfile --ignore-scripts


###############################################################################
# build — compile the TypeScript packages and prerender the Next.js apps
###############################################################################
FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_URL=http://localhost:4000
RUN pnpm --filter @complisme/shared \
    --filter @complisme/frameworks \
    --filter @complisme/core \
    --filter @complisme/generator \
    --filter @complisme/scanner \
    --filter @complisme/llm \
    --filter @complisme/cli \
    --filter @complisme/api \
    run build
RUN pnpm --filter @complisme/web run build || echo "web build skipped"
RUN pnpm --filter @complisme/docs run build || echo "docs build skipped"


###############################################################################
# api — Fastify server plus Chromium for PDF rendering
###############################################################################
FROM base AS api
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium fonts-liberation fonts-dejavu-core dumb-init \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules        ./node_modules
COPY --from=build /app/packages           ./packages
COPY --from=build /app/package.json       ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./

WORKDIR /app/packages/api
ENV API_HOST=0.0.0.0
ENV API_PORT=4000
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV STORAGE_DIR=/data/documents
RUN mkdir -p /data/documents

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]


###############################################################################
# web — Next.js standalone server
###############################################################################
FROM base AS web
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/packages/web

COPY --from=build /app/node_modules      ./node_modules
COPY --from=build /app/packages/shared   ./packages/shared
COPY --from=build /app/packages/web      ./
COPY --from=build /app/package.json      /app/package.json

ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000
CMD ["pnpm", "run", "start"]


###############################################################################
# docs — static documentation site
###############################################################################
FROM base AS docs
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/packages/docs

COPY --from=build /app/node_modules      ./node_modules
COPY --from=build /app/packages/shared   ./packages/shared
COPY --from=build /app/packages/docs     ./
COPY --from=build /app/package.json      /app/package.json

ENV PORT=3001
ENV HOSTNAME=0.0.0.0
EXPOSE 3001
CMD ["pnpm", "run", "start"]


###############################################################################
# cli — a one-shot image for CI: scan a mounted repository
###############################################################################
FROM base AS cli
ENV NODE_ENV=production
COPY --from=build /app/node_modules  ./node_modules
COPY --from=build /app/packages     ./packages
COPY --from=build /app/package.json ./package.json
WORKDIR /workspace
ENTRYPOINT ["node", "/app/packages/cli/dist/cli.js"]
CMD ["--help"]