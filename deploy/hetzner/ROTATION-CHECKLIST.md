# Immediate Credential Rotation Checklist

These tokens were previously present in local plaintext config and should be revoked and reissued in their source systems:

1. Notion integration API key (previous local skill key)
2. OpenAI image generation API key (previous local skill key)
3. SAG/ElevenLabs API key (previous local skill key)
4. Old local OpenClaw gateway token (already rotated locally, still revoke any externally shared copies)
5. OpenClaw GHL webhook shared secret (`OPENCLAW_GHL_WEBHOOK_SECRET`) if previously exposed
6. Any legacy `OPENCLAW_GATEWAY_TOKEN` values (keep it mapped to `OPENCLAW_GATEWAY_AUTH_TOKEN` only as compatibility alias)

## Procedure

1. Revoke old token in provider dashboard.
2. Create a replacement token with minimum required scopes.
3. Update `credential-inventory.csv` with `created_date`, `rotate_by`, and `last_rotated`.
4. Keep production tokens only on VPS; do not store in local default OpenClaw profile.
5. Re-run:

```powershell
openclaw secrets audit --check
openclaw security audit --deep
```
