#!/usr/bin/env python3
"""Fetch deploy SSH logs for latest run."""
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

for name in z.namelist():
    if 'Deploy' in name:
        content = z.read(name).decode('utf-8', errors='replace')
        lines = content.splitlines()
        # Find the deploy SSH step output
        deploy_lines = [l for l in lines if 'deploy' in l.lower() or 'error' in l.lower() or 'fail' in l.lower() or 'fatal' in l.lower() or 'cannot' in l.lower() or 'Unrecognized' in l or 'restart' in l.lower()]
        if deploy_lines:
            print(f'\n=== {name} ({len(deploy_lines)} relevant lines) ===')
            for l in deploy_lines:
                print(l)
