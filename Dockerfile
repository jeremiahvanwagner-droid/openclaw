# ═══════════════════════════════════════════════════════════════
# OpenClaw Bot — Dockerfile
# Runs the OpenClaw gateway + webhook handler for 24/7 operation
# ═══════════════════════════════════════════════════════════════
FROM node:22-slim AS base

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Install OpenClaw CLI globally (pin version for reproducibility)
ARG OPENCLAW_VERSION=latest
RUN npm install -g openclaw@${OPENCLAW_VERSION}

# Create non-root user
RUN groupadd --gid 1001 openclaw && \
    useradd --uid 1001 --gid openclaw --shell /bin/bash --create-home openclaw

WORKDIR /opt/openclaw

# Copy application files (order: least → most frequently changed)
COPY templates/ templates/
COPY docs/ docs/
COPY assets/ assets/
COPY supabase/ supabase/
COPY training/ training/
COPY scripts/ scripts/
COPY inngest/ inngest/
COPY lib/ lib/
COPY handlers/ handlers/
COPY skills/ skills/
COPY agents/ agents/
COPY config/ config/

# Create runtime data directories and workspace dirs
RUN mkdir -p data logs backups cron/runs delivery-queue media memory \
    workspace workspace-marketing workspace-sales workspace-support \
    workspaces/d1_ceo workspaces/d1_cto workspaces/d2_director \
    workspaces/d3_ceo workspaces/d4_cvo workspaces/d5_publisher \
    workspaces/d6_executive_director workspaces/shared_master_orchestrator \
    .openclaw && \
    chown -R openclaw:openclaw /opt/openclaw

# Copy cron config (needs to be writable at runtime)
RUN cp config/cron/jobs.json cron/jobs.json 2>/dev/null || true && \
    cp config/cron/training-jobs.json cron/training-jobs.json 2>/dev/null || true

# Install production config (Linux paths, env-based secrets)
RUN cp config/openclaw.prod.json .openclaw/openclaw.json 2>/dev/null || true

# Switch to non-root user
USER openclaw

# Expose gateway and webhook handler ports
EXPOSE 18789 8788

# Health check
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:18789/health || exit 1

# Default: run the OpenClaw gateway
CMD ["openclaw", "gateway", "--port", "18789"]
