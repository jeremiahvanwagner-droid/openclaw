# Canva API Quick Setup

## 1️⃣ In Canva Connect Dashboard

### Scopes
✅ Enable these scopes:
- `design:content:read`
- `design:content:write`
- `asset:read`
- `asset:write`
- `brandtemplate:content:read`
- `brandtemplate:meta:read`

### Data Autofill APIs
✅ Click **"Register for access"**

### Authentication
✅ Add redirect URL (required but unused):
```
http://127.0.0.1:3000/api/canva/callback
```
⚠️ **Must use `127.0.0.1` not `localhost`**

---

## 2️⃣ Get Credentials

1. Navigate to **Configuration** → **Manage integration**
2. Copy **Client ID** (starts with `OAC`)
3. Generate **Client Secret** (copy immediately, shown once)

---

## 3️⃣ Set Environment Variables

```powershell
# Required
[Environment]::SetEnvironmentVariable('CANVA_CLIENT_ID', 'OACxxxxxxxxx', 'User')
[Environment]::SetEnvironmentVariable('CANVA_CLIENT_SECRET', 'your-secret', 'User')

# Optional (get from test command below)
[Environment]::SetEnvironmentVariable('CANVA_BRAND_KIT_ID', 'your-kit-id', 'User')
```

**After setting, restart your terminal!**

---

## 4️⃣ Test Connection

```powershell
cd "$env:USERPROFILE\.openclaw\workspace\skills"
node design-generator.mjs test-canva
```

This will:
- ✅ Authenticate with Canva
- 📦 List your brand kits
- 💡 Show you the command to set CANVA_BRAND_KIT_ID

---

## 5️⃣ Generate Test Image

```powershell
# Local fallback (always works)
node design-generator.mjs thumbnail "Test Design" spiritual-elegant

# With Canva API (after credentials set)
node design-generator.mjs thumbnail "Sacred Blueprint" tech-futuristic
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "environment variables required" | Restart terminal after setting vars |
| "Canva OAuth failed" | Verify Client ID/Secret, check scopes |
| "No brand kits found" | Create brand kit in Canva first |

---

Full setup guide: [CANVA-API-SETUP.md](./CANVA-API-SETUP.md)
