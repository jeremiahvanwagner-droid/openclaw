#!/usr/bin/env python3
"""Check deploy workflow run status."""
import json, subprocess, urllib.request

def get_token():
    proc = subprocess.run(
        ["git", "credential", "fill"],
        input="protocol=https\nhost=github.com\n",
        capture_output=True, text=True
    )
    for line in proc.stdout.splitlines():
        if line.startswith("password="):
            return line[len("password="):]
    raise RuntimeError("No token found")

token = get_token()
run_id = "23570056119"
base = "https://api.github.com/repos/jeremiahvanwagner-droid/openclaw"

# Get run status
req = urllib.request.Request(
    f"{base}/actions/runs/{run_id}",
    headers={"Authorization": f"token {token}", "Accept": "application/vnd.github+json"}
)
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read())
print(f"Status: {data['status']}, Conclusion: {data.get('conclusion', 'pending')}")

# Get jobs
req2 = urllib.request.Request(
    f"{base}/actions/runs/{run_id}/jobs",
    headers={"Authorization": f"token {token}", "Accept": "application/vnd.github+json"}
)
with urllib.request.urlopen(req2) as resp:
    jobs_data = json.loads(resp.read())

for job in jobs_data.get("jobs", []):
    print(f"\n{job['name']}: {job['status']} / {job.get('conclusion', 'pending')}")
    for step in job.get("steps", []):
        icon = "✅" if step.get("conclusion") == "success" else "❌" if step.get("conclusion") == "failure" else "⏳"
        print(f"  {icon} {step['name']}")
