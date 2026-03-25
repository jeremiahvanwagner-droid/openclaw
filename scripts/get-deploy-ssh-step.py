#!/usr/bin/env python3
"""Show full deploy log around the Deploy via SSH step."""
import subprocess, urllib.request, zipfile, io

def get_token():
    p = subprocess.run(['git', 'credential', 'fill'],
                       input='protocol=https\nhost=github.com\n',
                       capture_output=True, text=True)
    for l in p.stdout.splitlines():
        if l.startswith('password='): return l[9:]

token = get_token()
headers = {'Authorization': f'token {token}', 'Accept': 'application/vnd.github.v3+json'}
base = 'https://api.github.com/repos/jeremiahvanwagner-droid/openclaw'
run_id = '23569907487'

req = urllib.request.Request(f'{base}/actions/runs/{run_id}/logs', headers=headers)
resp = urllib.request.urlopen(req)
z = zipfile.ZipFile(io.BytesIO(resp.read()))

# Get the deploy step-specific log
for name in sorted(z.namelist()):
    if 'Deploy via SSH' in name or ('Deploy' in name and 'deploy' in name.lower()):
        content = z.read(name).decode('utf-8', errors='replace')
        lines = content.splitlines()
        print(f'\n=== {name} ({len(lines)} lines) ===')
        for l in lines:
            print(l)
        print()
