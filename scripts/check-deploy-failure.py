#!/usr/bin/env python3
"""Fetch deploy-bot failure logs for a specific run."""
import json, subprocess, urllib.request, zipfile, io, sys

def get_token():
    p = subprocess.run(
        ["git", "credential", "fill"],
        input="protocol=https\nhost=github.com\n",
        capture_output=True, text=True
    )
    for line in p.stdout.splitlines():
        if line.startswith("password="):
            return line[9:]
    return None

token = get_token()
headers = {
    "Authorization": f"token {token}",
    "Accept": "application/vnd.github.v3+json",
}
base = "https://api.github.com/repos/jeremiahvanwagner-droid/openclaw"
run_id = "23569627693"

# Get logs zip
req = urllib.request.Request(f"{base}/actions/runs/{run_id}/logs", headers=headers)
resp = urllib.request.urlopen(req)
z = zipfile.ZipFile(io.BytesIO(resp.read()))

for name in z.namelist():
    if "Deploy" in name or "deploy" in name.lower():
        content = z.read(name).decode("utf-8", errors="replace")
        lines = content.splitlines()
        # Print last 80 lines or lines with error/fail
        print(f"\n=== {name} ({len(lines)} lines) ===")
        error_lines = []
        for i, line in enumerate(lines):
            if "error" in line.lower() or "fail" in line.lower() or "err " in line.lower():
                start = max(0, i - 3)
                end = min(len(lines), i + 3)
                for j in range(start, end):
                    if j not in [x[0] for x in error_lines]:
                        error_lines.append((j, lines[j]))
        if error_lines:
            for _, l in error_lines:
                print(f"  {l}")
        else:
            # Print last 40 lines
            for l in lines[-40:]:
                print(f"  {l}")
