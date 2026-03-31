# Security Hardening Sprint Initial Report

Date: 2026-03-31  
Repo: `jeremiahvanwagner-droid/openclaw`  
Current Repo HEAD: `e2c549d` (`working production`)  
Status: Diagnostics complete, no code changes applied

## File Inventory Report

- Current repo HEAD is `e2c549d`, not the prompt's `ecd5fb3`.
- Requested files resolved as:
  - Root webhook copy: `ghl-webhook-handler.mjs`
  - Executed webhook copy: `handlers/ghl-webhook-handler.mjs`
  - Local compose: `docker-compose.yml`
  - Production compose: `deploy/docker-compose.prod.yml`
  - Env file: `.env`
  - Credential inventory: `deploy/hetzner/credential-inventory.csv`
  - Runtime baseline config: `config/openclaw.prod.json`
  - Runtime-equivalent repo config: `openclaw.json`
  - Prometheus config: `deploy/monitoring/prometheus/prometheus.yml`
- `/root/.openclaw/openclaw.json` is not present in this workspace, so repo baselines are available but the live host-mounted runtime file is not.
- The repo shows two deployment paths:
  - Docker Compose via `deploy/docker-compose.prod.yml`
  - systemd via `deploy/hetzner/deploy.sh` and `deploy/hetzner/webhook.service`

## TASK 1 - WEBHOOK HEALTHCHECK FIX

### Phase 1 - Diagnose

**Status:** DIAGNOSING

**Finding:**  
The active webhook server is `handlers/ghl-webhook-handler.mjs`, not the root-level copy. It binds `OPENCLAW_GHL_WEBHOOK_PORT || 8788` at `handlers/ghl-webhook-handler.mjs:91`, and exposes `GET /health` at `handlers/ghl-webhook-handler.mjs:579-591`. The root `docker-compose.yml` has no `healthcheck` for `webhook` at `docker-compose.yml:31-45`, so it would inherit the image-wide Dockerfile probe to `http://localhost:18789/health` from `Dockerfile:93-94`, which is wrong for the webhook container. However, the production compose file already overrides this correctly to `http://localhost:8788/health` at `deploy/docker-compose.prod.yml:69-74`, and the Hetzner deploy health check also probes `8788/health` at `deploy/hetzner/deploy.sh:120-123`.

**Action:**  
Treat this as a deployment-model mismatch until production control plane is confirmed.

**Diff / Output:**

```text
handlers/ghl-webhook-handler.mjs:91   PORT = OPENCLAW_GHL_WEBHOOK_PORT || 8788
handlers/ghl-webhook-handler.mjs:579  GET /health returns 200 JSON
docker-compose.yml:31-45             webhook service has no healthcheck block
Dockerfile:93-94                     default image healthcheck -> localhost:18789/health
deploy/docker-compose.prod.yml:69-74 explicit webhook healthcheck -> localhost:8788/health
deploy/hetzner/deploy.sh:120-123     systemd health check -> localhost:8788/health
```

**Verification Required:**  
Yes - confirm the live control plane on Hetzner: `docker compose -f deploy/docker-compose.prod.yml`, root `docker-compose.yml`, or `systemd`.

## TASK 2 - TIGHTEN TELEGRAM AUTHORIZATION

### Phase 1 - Diagnose

**Status:** DIAGNOSING

**Finding:**  
The live host runtime file is unavailable here, but the repo baselines are already allowlisted, not wildcarded. In `config/openclaw.prod.json:4667-4673`, Telegram has `dmPolicy: "allowlist"`, `allowFrom` set to a single env-backed value at `config/openclaw.prod.json:4669-4670`, `groupPolicy: "allowlist"` at `config/openclaw.prod.json:4672`, and no `requireMention`, `allowedChatIds`, or `allowedUserIds` keys. The runtime-equivalent repo file `openclaw.json:469-475` shows the same structure with one concrete numeric allowlist entry. Related mention-gating behavior exists as `ackReactionScope: "group-mentions"` at `config/openclaw.prod.json:4640`. No hardcoded command-auth bypass was found in the inspected Telegram-facing handler code.

**Action:**  
Block planning of the live config diff until Jeremiah's approved IDs are confirmed and either the real `/root/.openclaw/openclaw.json` is available or the repo runtime-equivalent file is accepted as authoritative.

**Diff / Output:**

```text
config/openclaw.prod.json:4667  dmPolicy = "allowlist"
config/openclaw.prod.json:4669  allowFrom = ["${TELEGRAM_ALERT_CHAT_ID}"]
config/openclaw.prod.json:4672  groupPolicy = "allowlist"
config/openclaw.prod.json       no requireMention / allowedChatIds / allowedUserIds found
openclaw.json:469-475           same structure with one concrete numeric allowFrom entry
config/openclaw.prod.json:4640  ackReactionScope = "group-mentions"
```

**Verification Required:**  
Yes - the live runtime file or confirmation to use the repo runtime-equivalent config is required.

### Phase 2 - Gather Required Values

**Status:** COMPLETE

**Finding:**  
Operator inputs received:

1. Telegram `chat_id`: `7737707872`
2. Telegram `user_id`: `@truthjblue`
3. Additional user IDs: none
4. Group `chat_id`: none
5. DM mode preference: `FULL`

The inspected repo configs do not expose `allowedUserIds` or a separate Telegram user allowlist field. Current enforcement appears to be chat-based via `allowFrom`. `@truthjblue` is a Telegram username, not a numeric Telegram `user_id`, so it is recorded as operator context but is not currently usable as an enforcement primitive in the config shape found in this repo.

`FULL` is not a repo-observed `dmPolicy` enum. For execution planning, it is normalized to secure full personal-DM access from the allowlisted personal chat only, which maps to `dmPolicy: "allowlist"` plus `allowFrom: [7737707872]`.

**Action:**  
Proceed to planning against chat-based allowlisting unless the live runtime file reveals separate user-level authorization fields.

**Diff / Output:**  
```text
Received:
- chat_id = 7737707872
- user identifier supplied = @truthjblue (username, not numeric user_id)
- additional user_ids = none
- group chat_id = none
- DM mode preference = FULL

Execution normalization:
- dmPolicy => "allowlist"
- allowFrom => [7737707872]
- group access => disabled by omission; no group allow entries planned
```

**Verification Required:**  
No - values received are sufficient to prepare the Task 2 plan. Live execution still depends on deployment-model confirmation.

### Phase 3 - Plan

**Status:** PREPARED

**Finding:**  
Because no Telegram group should retain access, `requireMention` is not applicable in the planned end state. The secure plan is to keep DM access on a single allowlisted personal chat, remove any permissive or wildcard entries if present in the live runtime, and leave group access ungranted.

**Action:**  
Prepare the host runtime config change against `/root/.openclaw/openclaw.json` with chat-based enforcement.

**Diff / Output:**

```json
// BEFORE (repo baseline shape)
"telegram": {
  "enabled": true,
  "commands": {
    "nativeSkills": false
  },
  "dmPolicy": "allowlist",
  "botToken": "${TELEGRAM_BOT_TOKEN}",
  "allowFrom": [
    "${TELEGRAM_ALERT_CHAT_ID}"
  ],
  "groupPolicy": "allowlist",
  "streaming": "off"
}

// AFTER (planned live runtime state)
"telegram": {
  "enabled": true,
  "commands": {
    "nativeSkills": false
  },
  "dmPolicy": "allowlist",
  "botToken": "${TELEGRAM_BOT_TOKEN}",
  "allowFrom": [
    7737707872
  ],
  "groupPolicy": "allowlist",
  "streaming": "off"
}
```

**Verification Required:**  
Yes - this is execution-ready, but the live control plane still has to be confirmed before I can safely pair it with the correct restart or reload steps.

## TASK 3 - CREDENTIAL ROTATION

### Phase 1 - Inventory

**Status:** DIAGNOSING

**Finding:**  
The prompt's statement about blank CSV dates is stale for the repo copy. `deploy/hetzner/credential-inventory.csv` already has populated `created_date`, `rotate_by`, and `last_rotated` for tracked credentials. The real problem is incomplete coverage: `.env` contains many more live secrets than the CSV tracks, including Anthropic, per-tenant GHL PITs, Supabase service role, Inngest keys, gateway auth, OpenRouter, and Microsoft app secrets.

**Action:**  
Inventory captured below. No rotations or file edits have been performed.

**Diff / Output:**

| Credential Name | Type | Location | Exposure Risk | Rotation Priority | Rotation Method |
| --- | --- | --- | --- | --- | --- |
| HCLOUD_TOKEN | Cloud API token | `credential-inventory.csv` only | No | P1 | Hetzner Console revoke/regenerate |
| ANTHROPIC_API_KEY_SOVEREIGN | API key | `.env` | Possible | P0 | Anthropic Console revoke/regenerate |
| ANTHROPIC_API_KEY_SHARED | API key | `.env` | Possible | P0 | Anthropic Console revoke/regenerate |
| OPENAI_API_KEY | API key | `.env`, `credential-inventory.csv` | Possible | P1 | OpenAI Platform revoke/regenerate |
| GHL_TOKEN | GHL token/alias; duplicated in `.env` | `.env` | Possible | P1 | GHL Private Integrations regenerate and remove alias ambiguity |
| GHL_PRIVATE_INTEGRATION_TOKEN_TJB | GHL private integration token | `.env` | Possible | P0 | GHL TJB Private Integrations regenerate |
| GHL_PRIVATE_INTEGRATION_TOKEN_MSL | GHL private integration token | `.env` | Possible | P0 | GHL MSL Private Integrations regenerate |
| GHL_PASSWORD | App login password | `.env` | Possible | P1 | Change GHL account password |
| SUPABASE_SERVICE_ROLE_KEY | Service role key | `.env` | Possible | P0 | Supabase dashboard rotate service role |
| SUPABASE_ANON_KEY | Publishable anon key | `.env` | No | P2 | Rotate only if required; low sensitivity |
| INNGEST_SIGNING_KEY | Signing key; duplicated in `.env` | `.env` | Possible | P1 | Inngest dashboard rotate signing key |
| INNGEST_EVENT_KEY | Event dispatch key; duplicated in `.env` | `.env` | Possible | P0 | Inngest dashboard rotate event key |
| TELEGRAM_BOT_TOKEN | Bot token | `.env`, `credential-inventory.csv` | Yes | P0 | BotFather revoke/reissue |
| OPENCLAW_TELEGRAM_BOT_TOKEN | Alias of Telegram bot token | `.env` | Yes | P0 | Update alongside `TELEGRAM_BOT_TOKEN` or remove alias drift |
| OPEN_CLAW_GATEWAY_AUTH_TOKEN | Gateway auth token under legacy typo name | `.env` | Possible | P0 | Generate new token and rename to `OPENCLAW_GATEWAY_AUTH_TOKEN` |
| OPENROUTER_API_KEY | API key | `.env` | Possible | P1 | OpenRouter dashboard rotate |
| MSTEAMS_APP_PASSWORD | App secret | `.env` | Possible | P1 | Azure/Teams app secret rotation |
| M365_EMAIL_CLIENT_SECRET | Azure app secret alias | `.env` | Possible | P1 | Rotate same underlying Azure app secret |
| CANVA_CLIENT_SECRET | App secret (currently blank) | `.env` | No | P2 | None until provisioned |
| BRAVE_SEARCH_API_KEY | API key | `.env`, `credential-inventory.csv` | Possible | P2 | Brave dashboard rotate |
| BRAVE_API_KEY | API key alias | `.env` | Possible | P2 | Update alongside `BRAVE_SEARCH_API_KEY` if retained |
| OPENCLAW_GHL_WEBHOOK_SECRET | Shared webhook secret | `.env`, `credential-inventory.csv` | Possible | P0 | Generate new 32-byte+ hex secret and update both ends |

**Verification Required:**  
Yes - confirm whether aliases such as `OPENCLAW_TELEGRAM_BOT_TOKEN` and `BRAVE_API_KEY` should be tracked as separate managed entries or collapsed to one underlying credential per provider.

## TASK 4 - HARDEN WEBHOOK SECRET FALLBACK

### Phase 1 - Audit

**Status:** DIAGNOSING

**Finding:**  
The active handler does not use the exact hardcoded fallback shown in the prompt. Instead, `handlers/ghl-webhook-handler.mjs:93` resolves `OPENCLAW_GHL_WEBHOOK_SECRET || ''`, so a missing secret does not currently crash startup. `.env` does contain `OPENCLAW_GHL_WEBHOOK_SECRET`, so the secret is present now. The actual webhook HMAC path is in `lib/ghl-webhook.mjs:80-87` and already uses `crypto.timingSafeEqual` at `lib/ghl-webhook.mjs:84`. Headers and auth modes are read at `lib/ghl-webhook.mjs:162-165`. A separate weakness exists in `lib/human-approval.mjs:171-190`: it reuses `OPENCLAW_GHL_WEBHOOK_SECRET` for Telegram callback HMAC, falls back to predictable `"openclaw-approval"`, and compares with `===` at `lib/human-approval.mjs:219`.

**Action:**  
Prepare a fail-closed diff for the active webhook handler and a companion hardening diff for `lib/human-approval.mjs` after approval.

**Diff / Output:**

```text
handlers/ghl-webhook-handler.mjs:93      OPENCLAW_GHL_WEBHOOK_SECRET || ''
lib/ghl-webhook.mjs:80-87                HMAC sha256 + timingSafeEqual
lib/ghl-webhook.mjs:162-165              reads x-ghl-signature / authorization / x-openclaw-signature / x-openclaw-secret
lib/human-approval.mjs:171-174           callback secret falls back to OPENCLAW_GHL_WEBHOOK_SECRET or ''
lib/human-approval.mjs:190               predictable fallback "openclaw-approval"
lib/human-approval.mjs:219               non-constant-time equality
.env:87                                  OPENCLAW_GHL_WEBHOOK_SECRET is present
```

**Verification Required:**  
Yes - approve planning against `handlers/ghl-webhook-handler.mjs` and `lib/human-approval.mjs`.

## Pending Operator Confirmations

1. Confirm live control plane: `systemd` or Docker Compose
2. Confirm whether repo `openclaw.json` can be treated as the runtime-equivalent config until `/root/.openclaw/openclaw.json` is available
3. Approve moving into Phase 2 planning diffs for Task 1 and Task 4
