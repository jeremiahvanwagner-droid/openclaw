# 2026-05-05 REGGIE Memory Sweep — Audit Trail

This directory is the immutable audit trail for the Phase 1–5 sweep that
produced audit entry **`9c4f33c6c7f7`** in `REGGIE-STATE.md` §7.1.

## Contents

| Path | Purpose |
|---|---|
| `phase1-summary.txt` | Headline counts and bucket totals |
| `phase1-archive.csv` | 321 files queued for ARCHIVE move |
| `phase1-unknown.csv` | 96 files flagged UNKNOWN — manual review |
| `phase2/local/` | Per-host scripts for LOCAL Windows host (PowerShell + bash) |
| `phase2/vps/` | Per-host scripts for VPS Linux host (bash) |
| `classify.py` | Deterministic classifier (Phase 1 tool — reproducible) |

## Counts

- **TOTAL classified**: 208,846 files
- **ACTIVE**: 3,423 (working source)
- **ARCHIVE**: 321 (move to `archive/2026-05-05-sweep/`)
- **SHRED**: 148,986 = 148,740 vendor-tree-regenerable + 246 individual
- **UNKNOWN**: 96 (manual review required)
- **PROTECTED**: 56,020 (SOUL.md, .env*, .git/, .ssh/, .gnupg/, browser sessions, auth profiles)

## Execution status

Phase 2 deliverables are **DRY-RUN by default**. SHRED execution is gated
behind a typed `BURN` confirmation per script and was **not** executed by
the agent session — the operator runs each script on each host.

## Rollback

```sh
# On each host, in the openclaw root:
mv archive/2026-05-05-sweep/* ../
# Vendor trees regenerate automatically:
pnpm install        # node_modules
uv sync             # .venv
pnpm --filter dashboard dev   # .next
```

## Excluded from this snapshot

- `phase1-classified.csv` (52 MB, 208,846 rows) — too large for repo; kept in agent workspace
- `phase1-shred.csv` (148,986 rows) — derivable from `classify.py` + manifest scan
- `phase1-protected.csv` (56,020 rows) — derivable
- Per-host raw manifests — host-specific filesystem snapshots

If the sweep needs to be re-derived, `classify.py` is deterministic given
the same input manifests.
