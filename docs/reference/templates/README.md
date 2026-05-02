# Reference Templates (Runtime-Loaded)

These files are loaded by the OpenClaw CLI at runtime from
`docs/reference/templates/`. The gateway looks for them when handling
commands like `/status` and when bootstrapping workspaces that don't yet
have a local `AGENTS.md` / `SOUL.md` / `TOOLS.md` / `MEMORY.md` / `USER.md`.

Do **not** delete this directory. If a file is missing here, the gateway
will fail soft commands such as `/status` (the symptom that triggered the
May 2, 2026 fix).

## File-by-file source of truth

| Runtime file (this dir)            | Repo source of truth                      |
| ---------------------------------- | ----------------------------------------- |
| `AGENTS.md`                        | `/AGENTS.md` (auto-generated workforce snapshot) |
| `SOUL.md`                          | `templates/SOUL.md.template`              |
| `TOOLS.md`                         | `templates/TOOLS.md.template`             |
| `MEMORY.md`                        | `templates/MEMORY.md.template`            |
| `USER.md`                          | `templates/USER.md.template`              |

## Refresh procedure

When the workforce snapshot or any template changes, regenerate this
directory:

```bash
cp AGENTS.md                         docs/reference/templates/AGENTS.md
cp templates/SOUL.md.template        docs/reference/templates/SOUL.md
cp templates/TOOLS.md.template       docs/reference/templates/TOOLS.md
cp templates/MEMORY.md.template      docs/reference/templates/MEMORY.md
cp templates/USER.md.template        docs/reference/templates/USER.md
```

Then rebuild the Docker image so the runtime container picks them up:

```bash
ssh root@177.7.32.224 \
  "cd /root/openclaw && docker compose build --no-cache && docker compose up -d"
```

## Encoding rule

All files in this directory MUST be UTF-8 **without** BOM. The gateway
parser rejects BOM-prefixed templates silently, which surfaces as the
`/status` command returning no reply.

If you author on Windows, strip BOM before commit:

```bash
sed -i '1s/^\xEF\xBB\xBF//' docs/reference/templates/*.md
```
