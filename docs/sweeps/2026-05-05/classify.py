#!/usr/bin/env python3
"""
REGGIE Phase 1 Discovery Sweep — Classifier
Reads the two manifest CSVs and classifies every file into one of:
  ACTIVE | ARCHIVE | SHRED | UNKNOWN | PROTECTED

Outputs:
  - phase1-classified.csv  (full manifest, every row classified)
  - phase1-summary.txt     (counts + high-priority flags)
  - phase1-shred.csv       (SHRED candidates, broken out)
  - phase1-archive.csv     (ARCHIVE candidates, broken out)
  - phase1-unknown.csv     (UNKNOWN — manual review)
  - phase1-protected.csv   (PROTECTED — never touch)
  - phase1-zero-bytes.csv  (zero-byte files — auto-shred)
  - phase1-duplicates.csv  (probable duplicate basenames in same dir)
"""
import csv, os, re, sys
from collections import defaultdict, Counter
from datetime import datetime, timezone

LOCAL_CSV = "/home/user/workspace/reggie-local-phase1-manifest.csv"
VPS_CSV   = "/home/user/workspace/reggie-vps-phase1-manifest.csv"
OUT_DIR   = "/home/user/workspace/phase1"
os.makedirs(OUT_DIR, exist_ok=True)

# ----- normalize loaders --------------------------------------------------
def load_local(path):
    rows = []
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for r in reader:
            try:
                size = int(r.get("size_bytes") or 0)
            except ValueError:
                size = 0
            rows.append({
                "source": r.get("source") or "LOCAL",
                "path": (r.get("path") or "").strip(),
                "size": size,
                "mtime": (r.get("last_modified") or "").strip(),
                "ext": (r.get("extension") or "").strip(),
                "name": (r.get("name") or "").strip(),
            })
    return rows

def load_vps(path):
    rows = []
    # VPS file is headerless and unquoted: source,path,size,mtime,name
    # Filenames CAN contain commas, so we anchor on two reliable signals:
    #   - mtime field matches ISO-8601 datetime regex
    #   - size field is the comma immediately before mtime, all digits
    # Path = everything between source and size; name = basename(path).
    iso_re = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$')
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n\r")
            if not line: continue
            fields = line.split(",")
            if len(fields) < 5: continue
            src = fields[0]
            # find the mtime field by regex, walking from the right
            mt_idx = None
            for i in range(len(fields)-1, 0, -1):
                if iso_re.match(fields[i].strip()):
                    mt_idx = i; break
            if mt_idx is None: continue
            mt   = fields[mt_idx]
            sz_s = fields[mt_idx-1]
            try: sz = int(sz_s)
            except: sz = 0
            p = ",".join(fields[1:mt_idx-1])
            # name is the basename of the path (last segment after final '/')
            name = p.rsplit("/", 1)[-1] if "/" in p else p
            ext = ""
            if "." in name:
                ext = "." + name.rsplit(".", 1)[-1]
            rows.append({"source": src.strip(), "path": p.strip(), "size": sz,
                         "mtime": mt.strip(), "ext": ext, "name": name.strip()})
    return rows

print("Loading manifests...", file=sys.stderr)
local = load_local(LOCAL_CSV)
vps   = load_vps(VPS_CSV)
all_rows = local + vps
print(f"  local rows: {len(local)}", file=sys.stderr)
print(f"  vps   rows: {len(vps)}", file=sys.stderr)
print(f"  total:      {len(all_rows)}", file=sys.stderr)

# ----- classification rules ----------------------------------------------
def norm(p): return p.replace("\\", "/").lower()

PROTECTED_BASENAMES = {"soul.md"}
PROTECTED_PATTERNS = [
    re.compile(r"(^|/)\.env($|\.|/)"),                 # .env, .env.local, .env.production etc
    re.compile(r"(^|/)secrets?(/|$)"),
    re.compile(r"(^|/)credentials?(/|$)"),
    re.compile(r"\.pem$"), re.compile(r"\.key$"),
    re.compile(r"id_rsa($|\.pub$)"),
    re.compile(r"(^|/)\.ssh(/|$)"),
    re.compile(r"(^|/)\.gnupg(/|$)"),
    re.compile(r"auth_profile"),                       # agent auth profiles
    re.compile(r"(^|/)token(s)?\.json$"),
    re.compile(r"(^|/)browser/openclaw/user-data(/|$)"),# Chromium logged-in profile data
    re.compile(r"(^|/)browser/sessions(/|$)"),         # IG/TikTok/FB/GHL session caches
    re.compile(r"(^|/)data/browser-sessions(/|$)"),    # playwright GHL session
    re.compile(r"(^|/)\.git(/|$)"),                    # git internals
]

# Things whose mere presence inside their path means they are HARD vendor noise
# and should never be treated as TJB artifacts at all.
VENDOR_DIRS = re.compile(
    r"(^|/)("
    r"node_modules|\.venv|venv|__pycache__|\.pytest_cache|\.mypy_cache|"
    r"\.next|\.nuxt|\.turbo|\.cache|\.parcel-cache|\.gradle|\.idea|\.vscode|"
    r"site-packages|dist-info|egg-info|"
    r"\.git/objects|\.git/logs|\.git/refs|\.git/index|\.git/hooks"
    r")(/|$)"
)

# Anything in these is structural junk that REGGIE doesn't govern; classify as SHRED
# but only when also clearly transient / regenerable.
TRANSIENT_DIRS = re.compile(
    r"(^|/)("
    r"node_modules|\.venv|venv|__pycache__|\.pytest_cache|\.mypy_cache|"
    r"\.next|\.nuxt|\.turbo|\.parcel-cache|"
    r"site-packages"
    r")(/|$)"
)

ARCHIVE_HINTS = re.compile(
    r"(^|/|\.|-|_)("
    r"old|legacy|deprecated|superseded|"
    r"backup|bak|"
    r"draft|drafts|"
    r"v1|v2|v3|"
    r"archive|archived|"
    r"plan|plans|roadmap|roadmaps|"
    r"wp-\d+|work[-_]?package|"
    r"phase[-_]?\d+(-old|-draft|-backup)?"
    r")(\.|-|_|/|$)"
)

SHRED_HINTS = re.compile(
    r"(^|/|\.|-|_)("
    r"temp|tmp|"
    r"swp|swo|swn|"
    r"orig|"
    r"~|"
    r"copy|"
    r"untitled|"
    r"new\s+folder"
    r")(\.|-|_|/|$)"
)

# Active "tells" — paths that almost always mean the file is part of running reality.
ACTIVE_PATTERNS = [
    re.compile(r"(^|/)docs/REGGIE-STATE\.md$", re.I),
    re.compile(r"(^|/)docs/MASTER[-_]?PLAN", re.I),
    re.compile(r"(^|/)SOUL\.md$", re.I),
    re.compile(r"(^|/)AGENTS\.md$", re.I),
    re.compile(r"(^|/)docker-compose(\.[\w.-]+)?\.ya?ml$", re.I),
    re.compile(r"(^|/)Dockerfile(\.[\w.-]+)?$", re.I),
    re.compile(r"(^|/)package\.json$", re.I),
    re.compile(r"(^|/)pyproject\.toml$", re.I),
    re.compile(r"(^|/)skills/[^/]+/SKILL\.md$", re.I),
    re.compile(r"(^|/)skills/\.audit-(allowlist|manifest)\.json$", re.I),
    re.compile(r"(^|/)caddy(file)?", re.I),
    re.compile(r"(^|/)gateway", re.I),
    re.compile(r"(^|/)runtime[-_]?config\.json$", re.I),
]

def parse_mtime(s):
    if not s: return None
    s = s.split(".")[0]  # drop sub-second tail
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try: return datetime.strptime(s, fmt)
        except: pass
    return None

NOW = datetime(2026, 5, 5, 12, 31)  # current_time per context

def classify(row):
    p = row["path"]; n = row["name"].lower(); np = norm(p); sz = row["size"]
    ext = row["ext"].lower()
    reasons = []

    # 1. PROTECTED — never touch
    if n in PROTECTED_BASENAMES:
        return "PROTECTED", "SOUL.md — sacred, never touch"
    for rx in PROTECTED_PATTERNS:
        if rx.search(np):
            return "PROTECTED", f"matches protected pattern {rx.pattern}"

    # 2. Vendor / transient dirs => SHRED bucket as regenerable noise (but
    #    SHRED inside a vendor tree only if it is also a known cache type).
    if TRANSIENT_DIRS.search(np):
        return "SHRED", "inside transient/regenerable dir (node_modules/.venv/__pycache__/etc)"

    # 3. Zero-byte = SHRED automatically, regardless of name (per spec)
    if sz == 0:
        return "SHRED", "zero-byte file (auto-shred per spec)"

    # 4. Active "tells"
    for rx in ACTIVE_PATTERNS:
        if rx.search(p) or rx.search(np):
            # but if it ALSO has an archive hint in the basename, prefer ARCHIVE
            if ARCHIVE_HINTS.search(n):
                return "ARCHIVE", "active-shape file but basename indicates archived/backup version"
            return "ACTIVE", "matches active-infrastructure pattern"

    # 5. SHRED hints (temp/tmp/.swp/orig/~ etc) — strong
    # Editor swap files
    if ext in (".swp", ".swo", ".swn", ".tmp", ".bak~"):
        return "SHRED", f"editor/temp file ({ext})"
    if n.endswith("~"):
        return "SHRED", "trailing-tilde backup"
    if SHRED_HINTS.search(n):
        return "SHRED", "basename matches shred hint (tmp/temp/orig/copy/untitled)"

    # 6. ARCHIVE hints
    if ARCHIVE_HINTS.search(n) or ARCHIVE_HINTS.search(np):
        return "ARCHIVE", "matches archive hint (old/legacy/backup/draft/wp-/v1/v2/plan/roadmap)"

    # Specific: REGGIE-STATE-* that are not the canonical one
    if re.search(r"REGGIE-STATE.*\.md$", n, re.I) and n != "reggie-state.md":
        return "ARCHIVE", "non-canonical REGGIE-STATE variant"

    # 6.5 Agent session jsonl files
    if "/agents/" in np and "/sessions/" in np:
        # Already-deleted or reset markers => SHRED
        if ".jsonl.deleted." in n or ".jsonl.reset." in n:
            return "SHRED", "obsolete agent session marker (.deleted/.reset)"
        if n.endswith(".jsonl"):
            mt = parse_mtime(row["mtime"])
            if mt and (NOW - mt).days > 30:
                return "ARCHIVE", f"agent session jsonl older than 30 days ({(NOW-mt).days}d)"
            return "ACTIVE", "recent agent session jsonl"

    # 7. Stale session memory > 30d
    if "/memory/" in np or n.startswith("session-") or "session_" in n:
        mt = parse_mtime(row["mtime"])
        if mt and (NOW - mt).days > 30 and ext in (".md", ".json", ".log", ".txt"):
            return "ARCHIVE", f"session-memory file older than 30 days ({(NOW-mt).days}d)"

    # 8. Logs
    if ext in (".log", ".log1", ".log2") or "/logs/" in np:
        mt = parse_mtime(row["mtime"])
        if mt and (NOW - mt).days > 7:
            return "ARCHIVE", "log file older than 7 days"
        return "ACTIVE", "recent log"

    # 9. .git internals — keep but don't classify as ACTIVE individually
    if "/.git/" in np or np.endswith("/.git"):
        return "PROTECTED", ".git internal — leave to git"

    # 10. Default — keep familiar source files as ACTIVE
    if ext in (".md", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".py", ".sh", ".sql",
               ".yml", ".yaml", ".json", ".toml", ".ini", ".conf",
               ".dockerignore", ".gitignore", ".gitattributes", ".prettierrc",
               ".editorconfig", ".jsonl", ".csv", ".html", ".css",
               ".service", ".template", ".ps1"):
        return "ACTIVE", f"working source file ({ext})"

    # Common transient blobs that aren't TJB-governed
    if ext in (".db", ".db-wal", ".sqlite", ".sqlite3", ".ldb", ".pma", ".pb",
               ".dat", ".baj", ".baf", ".dmp"):
        return "UNKNOWN", f"binary state blob ({ext}) — manual review"

    if ext in (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"):
        # images are content artifacts — review individually
        return "UNKNOWN", f"image asset ({ext}) — manual review"

    # Time-suffixed names like ".747Z" / ".437Z" are reset/deleted artifacts
    if re.match(r"\.\d+z$", ext, re.I):
        return "SHRED", "trailing-timestamp reset/deleted artifact"

    return "UNKNOWN", f"no rule matched (ext={ext or 'none'}, size={sz})"

# ----- run classification -------------------------------------------------
counts = Counter()
out_rows = []
shred = []; archive = []; unknown = []; protected = []; active = []; zero = []

for r in all_rows:
    bucket, reason = classify(r)
    counts[bucket] += 1
    rec = {**r, "bucket": bucket, "reason": reason}
    out_rows.append(rec)
    if bucket == "SHRED":   shred.append(rec)
    if bucket == "ARCHIVE": archive.append(rec)
    if bucket == "UNKNOWN": unknown.append(rec)
    if bucket == "PROTECTED": protected.append(rec)
    if bucket == "ACTIVE":  active.append(rec)
    if r["size"] == 0: zero.append(rec)

# ----- duplicate detection (same basename in same dir, weird) -------------
basename_dir = defaultdict(list)
for r in all_rows:
    p = r["path"].replace("\\", "/")
    parent = p.rsplit("/", 1)[0] if "/" in p else ""
    basename_dir[(parent, r["name"].lower())].append(r)

# also detect repeated basenames across dirs (likely copies)
basename_global = defaultdict(list)
for r in all_rows:
    if r["size"] > 0:
        basename_global[(r["name"].lower(), r["size"])].append(r)

dup_rows = []
for (name, sz), group in basename_global.items():
    if len(group) > 1 and sz > 0 and not any(VENDOR_DIRS.search(norm(g["path"])) for g in group):
        for g in group:
            dup_rows.append({**g, "dup_basename": name, "dup_size": sz, "dup_count": len(group)})

# ----- write outputs ------------------------------------------------------
def write_csv(path, rows, fields):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)

base_fields = ["bucket", "reason", "source", "path", "size", "mtime", "ext", "name"]

write_csv(f"{OUT_DIR}/phase1-classified.csv", out_rows, base_fields)
write_csv(f"{OUT_DIR}/phase1-shred.csv",      shred,    base_fields)
write_csv(f"{OUT_DIR}/phase1-archive.csv",    archive,  base_fields)
write_csv(f"{OUT_DIR}/phase1-unknown.csv",    unknown,  base_fields)
write_csv(f"{OUT_DIR}/phase1-protected.csv",  protected,base_fields)
write_csv(f"{OUT_DIR}/phase1-zero-bytes.csv", zero,     base_fields)
write_csv(f"{OUT_DIR}/phase1-duplicates.csv", dup_rows,
          base_fields + ["dup_basename", "dup_size", "dup_count"])

# ----- summary ------------------------------------------------------------
def by_source(rows):
    c = Counter(r["source"] for r in rows)
    return dict(c)

# top reasons inside each bucket
def top_reasons(rows, n=10):
    c = Counter(r["reason"] for r in rows)
    return c.most_common(n)

# specific high-priority flags
flagged = []

# Zero-byte AGENTS.md template
for r in zero:
    if r["path"].endswith("AGENTS.md"):
        flagged.append(("ZERO_BYTE_AGENTS_MD", r["path"]))

# duplicate runtime-config*.json files
rc_dups = [r for r in all_rows if re.match(r".*runtime[-_]?config.*\.json$", r["name"], re.I)]
if len(rc_dups) > 1:
    for r in rc_dups:
        flagged.append(("DUPLICATE_RUNTIME_CONFIG", r["path"]))

# multiple REGGIE-STATE
rs = [r for r in all_rows if re.search(r"REGGIE-STATE.*\.md$", r["name"], re.I)]
if len(rs) > 1:
    for r in rs:
        flagged.append(("MULTIPLE_REGGIE_STATE", r["path"]))

# old sanitizer scripts
san = [r for r in all_rows if "sanit" in r["name"].lower()]
if len(san) > 1:
    for r in san:
        flagged.append(("MULTIPLE_SANITIZER", r["path"]))

# stale session memory
stale_mem = [r for r in archive if "session-memory" in r["reason"]]

# write summary
with open(f"{OUT_DIR}/phase1-summary.txt", "w", encoding="utf-8") as f:
    f.write("REGGIE PHASE 1 DISCOVERY SWEEP — SUMMARY\n")
    f.write(f"Generated: {NOW.isoformat()}\n")
    f.write("="*70 + "\n\n")
    f.write(f"Total files swept:  {len(all_rows):>8}\n")
    f.write(f"  LOCAL:            {len(local):>8}\n")
    f.write(f"  VPS:              {len(vps):>8}\n\n")
    f.write("BUCKET DISTRIBUTION\n")
    for b in ("ACTIVE","ARCHIVE","SHRED","UNKNOWN","PROTECTED"):
        f.write(f"  {b:<10} {counts[b]:>8}\n")
    f.write("\n")
    f.write("BUCKET BY SOURCE\n")
    for b in ("ACTIVE","ARCHIVE","SHRED","UNKNOWN","PROTECTED"):
        bs = by_source([r for r in out_rows if r["bucket"] == b])
        f.write(f"  {b:<10} {bs}\n")
    f.write("\n")
    f.write("TOP SHRED REASONS\n")
    for reason, n in top_reasons(shred): f.write(f"  {n:>6}  {reason}\n")
    f.write("\nTOP ARCHIVE REASONS\n")
    for reason, n in top_reasons(archive): f.write(f"  {n:>6}  {reason}\n")
    f.write("\nTOP UNKNOWN REASONS\n")
    for reason, n in top_reasons(unknown): f.write(f"  {n:>6}  {reason}\n")
    f.write("\n")
    f.write(f"Zero-byte files: {len(zero)}\n")
    f.write(f"Probable duplicate (same name+size, different paths): {len(dup_rows)}\n")
    f.write("\nHIGH-PRIORITY FLAGS\n")
    if not flagged:
        f.write("  (none)\n")
    else:
        for tag, path in flagged[:200]:
            f.write(f"  [{tag}] {path}\n")

print("Wrote outputs to", OUT_DIR, file=sys.stderr)
print("Counts:", dict(counts), file=sys.stderr)
