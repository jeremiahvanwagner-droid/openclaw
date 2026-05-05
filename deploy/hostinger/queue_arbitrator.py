#!/usr/bin/env python3
"""
Queue Arbitrator — OpenClaw Control Loop Budget Enforcement

Reads control_loops from jobs.json and the current running state.
Before a job starts, check whether its control loop has capacity.
If not, defer the job (skip this run) rather than overlapping.

Usage:
    python3 queue_arbitrator.py --job-id <id> --jobs-path <path>
    python3 queue_arbitrator.py --status --jobs-path <path>

Exit codes:
    0 = job may proceed
    1 = job deferred (control loop at capacity)
    2 = error
"""

import json
import os
import sys
import time
import argparse

def load_jobs_config(jobs_path):
    with open(jobs_path, "r") as f:
        return json.load(f)

def get_control_loop_for_job(config, job_id):
    loops = config.get("control_loops", {})
    for loop_name, loop_def in loops.items():
        if job_id in loop_def.get("members", []):
            return loop_name, loop_def
    return None, None

def count_running_in_loop(config, loop_def):
    """Count jobs in this control loop that are currently running."""
    running = 0
    member_ids = set(loop_def.get("members", []))
    jobs = config.get("jobs", [])
    now_ms = int(time.time() * 1000)

    for job in jobs:
        if job.get("id") not in member_ids:
            continue
        state = job.get("state", {})
        last_run = state.get("lastRunAtMs", 0)
        max_runtime = job.get("max_runtime_ms", 300000)  # default 5 min
        # If job started recently and hasn't exceeded max_runtime, consider it running
        if last_run > 0 and (now_ms - last_run) < max_runtime:
            # Check if it hasn't completed (no success after start)
            last_success = state.get("lastSuccessAtMs", 0)
            if last_success < last_run:
                running += 1

    return running

def check_job(jobs_path, job_id):
    config = load_jobs_config(jobs_path)
    loop_name, loop_def = get_control_loop_for_job(config, job_id)

    if loop_name is None:
        # Job not in any control loop — allow unconditionally
        print(f"ALLOW: job {job_id} not in any control loop")
        return 0

    max_concurrent = loop_def.get("max_concurrent", 1)
    running = count_running_in_loop(config, loop_def)

    if running >= max_concurrent:
        print(f"DEFER: job {job_id} in loop {loop_name} — {running}/{max_concurrent} slots used")
        return 1

    print(f"ALLOW: job {job_id} in loop {loop_name} — {running}/{max_concurrent} slots used")
    return 0

def show_status(jobs_path):
    config = load_jobs_config(jobs_path)
    loops = config.get("control_loops", {})

    print("Control Loop Status")
    print("=" * 60)

    for loop_name, loop_def in loops.items():
        max_c = loop_def.get("max_concurrent", 1)
        running = count_running_in_loop(config, loop_def)
        members = len(loop_def.get("members", []))
        status = "OK" if running < max_c else "AT CAPACITY"
        print(f"  {loop_name}: {running}/{max_c} running ({members} members) [{status}]")

    print("=" * 60)

def main():
    parser = argparse.ArgumentParser(description="Queue arbitrator for OpenClaw control loops")
    parser.add_argument("--job-id", help="Job ID to check before running")
    parser.add_argument("--jobs-path", required=True, help="Path to jobs.json")
    parser.add_argument("--status", action="store_true", help="Show control loop status")
    args = parser.parse_args()

    if args.status:
        show_status(args.jobs_path)
        return 0
    elif args.job_id:
        return check_job(args.jobs_path, args.job_id)
    else:
        parser.print_help()
        return 2

if __name__ == "__main__":
    sys.exit(main())
