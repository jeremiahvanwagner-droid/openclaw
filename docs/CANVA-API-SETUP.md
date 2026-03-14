# Canva Connect API Setup Guide

## Overview
OpenClaw uses **Canva Connect Data Autofill APIs** with **OAuth 2.0 Client Credentials** flow for automated design generation.

---

## Step 1: Register for Data Autofill APIs

1. **Navigate to Scopes** in your Canva Connect integration
2. **Enable** `collaboration:event` toggle (if you want webhooks/notifications)
3. **Click "Register for access"** under Data Autofill APIs section
4. Wait for approval (usually instant for testing)

### Required Scopes
Enable these scopes in your Canva Connect app:

| Scope | Purpose |
|-------|---------|
| `design:content:read` | Read design content and metadata |
| `design:content:write` | Create and modify designs |
| `asset:read` | Access brand assets and templates |
| `asset:write` | Upload media to designs |
| `brandtemplate:content:read` | Read brand template data |
| `brandtemplate:meta:read` | Read brand kit metadata |

---

## Step 2: Configure Authentication

### Authorized Redirects

Even though OpenClaw uses **client credentials flow** (server-to-server), Canva requires at least one redirect URL:

**Required URL for local automation:**
```
http://127.0.0.1:3000/api/canva/callback
```
⚠️ **Must use `127.0.0.1` not `localhost`** (Canva requirement)

Or use your production domain:
```
https://yourdomain.com/api/canva/callback
```

**Note:** Since we're using client credentials, this redirect won't actually be called, but Canva requires it for app configuration.

### Enable Return Navigation (Optional)

If you plan to embed Canva editor in a web interface later:
- Toggle **ON** "Enable return navigation"
- This allows users to return to your platform after editing

---

## Step 3: Get Your Credentials

1. Go to **Configuration** → **Manage integration**
2. Copy your **Client ID** (looks like: `OACabc123xyz`)
3. Generate and copy your **Client Secret** (only shown once)

---

## Step 4: Set Environment Variables

Open PowerShell and run:

```powershell
[Environment]::SetEnvironmentVariable('CANVA_CLIENT_ID', 'OC-xxxxxxxxxxxx', 'User')
[Environment]::SetEnvironmentVariable('CANVA_CLIENT_SECRET', 'your-secret-string-here', 'User')
[Environment]::SetEnvironmentVariable('CANVA_BRAND_KIT_ID', 'your-brand-kit-id', 'User')
```

**⚠️ IMPORTANT:** The Client Secret is a **random string** (not a URL). It looks like:
```
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

**After setting env vars, restart your terminal!**

### Get Your Brand Kit ID

Brand Kit ID will be shown after you authorize (next step).

---

## Step 5: Authorize OpenClaw with Canva

OpenClaw uses **Authorization Code flow with PKCE**, which requires one-time browser authorization:

```powershell
cd "$env:USERPROFILE\.openclaw\workspace\skills"

# Start authorization flow (opens browser)
node canva-auth.mjs authorize
```

This will:
1. 🌐 Open your browser to Canva authorization page
2. ✅ You approve OpenClaw's access
3. 🔐 Receive and store access + refresh tokens
4. ✨ Done! Tokens auto-refresh for future requests

**Tokens are stored in:** `~/.openclaw/data/canva-tokens.json`

---

## Step 6: Test Connection

```powershell
# Test API connection and list brand kits
node canva-auth.mjs test

# Check token status
node canva-auth.mjs status

## Step 7: Configure Template IDs (Optional)

If you have pre-made templates in Canva for specific design types:

```powershell
[Environment]::SetEnvironmentVariable('CANVA_THUMBNAIL_TEMPLATE_ID', 'DAFabc123', 'User')
[Environment]::SetEnvironmentVariable('CANVA_INSTAGRAM_TEMPLATE_ID', 'DAFxyz789', 'User')
[Environment]::SetEnvironmentVariable('CANVA_FACEBOOK_TEMPLATE_ID', 'DAFpqr456', 'User')
[Environment]::SetEnvironmentVariable('CANVA_BANNER_TEMPLATE_ID', 'DAFstu012', 'User')
[Environment]::SetEnvironmentVariable('CANVA_BOOKCOVER_TEMPLATE_ID', 'DAFvwx345', 'User')
```

**Without templates:** OpenClaw will use Sharp.js local fallback

**With templates:** OpenClaw will use Canva API for professional branded designs

---

## Step 8: Generate Test Designs

Run the design generator to create test images:

```powershell
cd "$env:USERPROFILE\.openclaw\workspace\skills"

# Test local fallback (always works, no Canva needed)
node design-generator.mjs thumbnail "The Sacred Blueprint" --style spiritual-elegant

# Test with Canva API (uses your authorized account)
node design-generator.mjs thumbnail "Divine Technology" --style tech-futuristic
```

---

## Troubleshooting

### "CANVA_CLIENT_ID and CANVA_CLIENT_SECRET environment variables required"

**Solution:** Ensure you set the env vars in PowerShell and **RESTARTED YOUR TERMINAL**:
```powershell
# Verify they're set
[Environment]::GetEnvironmentVariable('CANVA_CLIENT_ID','User')
[Environment]::GetEnvironmentVariable('CANVA_CLIENT_SECRET','User')
```

### "Need to re-authorize" or "No valid access token"

**Solution:** Run the authorization flow:
```powershell
cd "$env:USERPROFILE\.openclaw\workspace\skills"
node canva-auth.mjs authorize
```

### "Canva OAuth failed: invalid_client"

**Solution:** 
- Double-check your Client ID and Secret are correct
- The Client Secret is a **random string**, not a URL
- Secret is only shown once when generated - regenerate if lost

### "Insufficient scope"

**Solution:** Go back to Scopes section in Canva Connect and ensure all required scopes are enabled:
- design:content:read
- design:content:write
- asset:read
- asset:write
- brandtemplate:content:read
- brandtemplate:meta:read

### Browser doesn't open for authorization

**Solution:** Manually copy the authorization URL from terminal and paste into browser

---

## Architecture Details

### OAuth Flow Used
OpenClaw uses **Authorization Code Grant with PKCE** (OAuth 2.0):

1. User initiates authorization → browser opens to Canva
2. User approves scopes → redirected to local callback server
3. OpenClaw exchanges authorization code for access + refresh tokens
4. Tokens stored locally in `~/.openclaw/data/canva-tokens.json`
5. Access token auto-refreshes when expired (no re-authorization needed)

### Token Management
- **Access tokens**: Valid ~1 hour, auto-refresh
- **Refresh tokens**: Long-lived, used to get new access tokens
- **Storage**: `~/.openclaw/data/canva-tokens.json` (file-based, secure)
- **Revocation**: `node canva-auth.mjs revoke` to invalidate tokens

### Fallback Strategy
If Canva API is unavailable:
- Uses Sharp.js for local image generation
- Applies Truth J Blue brand kit styling
- Notifies via Telegram if configured

---

## CLI Commands

### canva-auth.mjs
```powershell
node canva-auth.mjs authorize   # Start browser authorization
node canva-auth.mjs test        # Test API connection
node canva-auth.mjs status      # Show token status
node canva-auth.mjs revoke      # Revoke active tokens
```

### design-generator.mjs
```powershell
node design-generator.mjs test-canva              # Test and show brand kits
node design-generator.mjs thumbnail <topic>       # Generate thumbnail
node design-generator.mjs social <topic> <platform>  # Social post image
node design-generator.mjs brand-kit               # Show brand kit details
```

---

## Reference Links

- [Canva Connect Documentation](https://www.canva.dev/)
- [OAuth 2.0 Authorization Code with PKCE](https://www.canva.dev/docs/connect/authentication/)
- [Data Autofill APIs](https://www.canva.dev/docs/connect/api-reference/autofill/)
- [Brand Templates](https://www.canva.dev/docs/connect/brand-templates/)

---

## Security Notes

⚠️ **Never commit credentials to git**
- Client Secret is sensitive - treat like a password
- `canva-tokens.json` is auto-generated - add to `.gitignore`
- Store in environment variables only

✅ **Credentials are loaded via PowerShell env vars**
- Configured in `openclaw.json` → `secrets.providers`
- Executed at runtime, never stored in config files
