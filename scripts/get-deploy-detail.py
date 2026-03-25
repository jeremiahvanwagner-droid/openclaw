#!/usr/bin/env python3
"""Show the Deploy via SSH step output."""
import json, subprocess, urllib.request, zipfile, io

def get_token():
    p = subprocess.run(['git', 'credential', 'fill'],
                       input='protocol=https\nhost=github.com\n',
                       capture_output=True, text=True)
    for l in p.stdout.splitlines():
        if l.startswith('password='): return l[9:]

token = get_token()
headers = {'Authorization': f'token {token}', 'Accept': 'application/vnd.github.v3+json'}
base = 'https://api.github.com/repos/jeremiahvanwagner-droid/openclaw'
run_id = '23569627693'

req = urllib.request.Request(f'{base}/actions/runs/{run_id}/logs', headers=headers)
resp = urllib.request.urlopen(req)
z = zipfile.ZipFile(io.BytesIO(resp.read()))

# List all files in the zip
for name in sorted(z.namelist()):
    if 'Deploy' in name:
        content = z.read(name).decode('utf-8', errors='replace')
        lines = content.splitlines()
        print(f'\n=== {name} ({len(lines)} lines) ===')
        # For the main deploy log, show the entrypoint.sh / Deploy via SSH output
        in_deploy = False
        for i, line in enumerate(lines):
            if 'Deploy via SSH' in line or 'deploy.sh' in line.lower() or 'entrypoint.sh' in line:
                in_deploy = True
            if in_deploy or 'Pull' in line or 'pnpm' in line or 'Install' in line or 'Sync' in line or 'exit' in line.lower():
                print(f'  [{i}] {line}')
