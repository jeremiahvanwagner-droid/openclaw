#!/usr/bin/env python3
"""Fetch deploy-bot workflow failure logs from GitHub API."""
import json, subprocess, urllib.request, sys

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
if not token:
    print("No GitHub token found")
    sys.exit(1)

headers = {
    "Authorization": f"token {token}",
    "Accept": "application/vnd.github.v3+json",
}
base = "https://api.github.com/repos/jeremiahvanwagner-droid/openclaw"

# Get latest run
req = urllib.request.Request(f"{base}/actions/runs?per_page=1", headers=headers)
runs = json.loads(urllib.request.urlopen(req).read())
run = runs["workflow_runs"][0]
run_id = run["id"]
print(f"Run: {run['name']} — {run['status']} / {run.get('conclusion','...')}")
print(f"URL: {run['html_url']}")

# Get jobs
req = urllib.request.Request(f"{base}/actions/runs/{run_id}/jobs", headers=headers)
jobs = json.loads(urllib.request.urlopen(req).read())

for job in jobs["jobs"]:
    if job["conclusion"] == "failure":
        print(f"\nFailed job: {job['name']}")
        for step in job["steps"]:
            if step["conclusion"] == "failure":
                print(f"  Failed step: {step['name']} (#{step['number']})")

# Get logs (follow redirect)
log_headers = dict(headers)
log_headers["Accept"] = "application/vnd.github.v3+json"
req = urllib.request.Request(f"{base}/actions/runs/{run_id}/logs", headers=log_headers)
try:
    resp = urllib.request.urlopen(req)
    # It's a zip file
    import zipfile, io
    z = zipfile.ZipFile(io.BytesIO(resp.read()))
    for name in z.namelist():
        if "Run Tests" in name or "setup-node" in name.lower():
            content = z.read(name).decode("utf-8", errors="replace")
            # Find error lines
            lines = content.splitlines()
            for i, line in enumerate(lines):
                if "error" in line.lower() or "fail" in line.lower():
                    start = max(0, i - 2)
                    end = min(len(lines), i + 5)
                    print(f"\n--- {name} (line {i+1}) ---")
                    for l in lines[start:end]:
                        print(f"  {l}")
except Exception as e:
    print(f"Could not fetch logs: {e}")
