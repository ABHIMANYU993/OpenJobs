import os
import sys
import json
import requests
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
import argparse

OPENROLES_MANIFEST_URL = "https://openroles.today/data/manifest.json"
FEASHLIAA_MANIFEST_URL = "https://feashliaa.github.io/job-board-data/data/chunks/jobs_manifest.json"
OUR_MANIFEST_URL = "https://abhimanyu993.github.io/OpenJobs/data/manifest.json"

TS_INPUTS_DIR = os.path.abspath("ts_inputs")
PY_INPUTS_DIR = os.path.abspath("py_inputs")

def fetch_json(url):
    try:
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"Warning: Failed to fetch {url}: {e}")
        return None

def download_file(url, local_path):
    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    resp = requests.get(url, timeout=15)
    resp.raise_for_status()
    with open(local_path, "wb") as f:
        f.write(resp.content)
    return True

def parse_time(time_str):
    if not time_str:
        return datetime.min.replace(tzinfo=timezone.utc)
    try:
        return datetime.fromisoformat(time_str.replace("Z", "+00:00"))
    except Exception:
        return datetime.min.replace(tzinfo=timezone.utc)

def write_github_output(key, value):
    if "GITHUB_OUTPUT" in os.environ:
        with open(os.environ["GITHUB_OUTPUT"], "a") as f:
            f.write(f"{key}={value}\n")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', choices=['daily', '3-day', 'push'], required=True)
    parser.add_argument('--ui-changed', action='store_true')
    args = parser.parse_args()

    print(f"Running smart cache check in {args.mode} mode.")

    ts_manifest = fetch_json(OPENROLES_MANIFEST_URL)
    py_manifest = fetch_json(FEASHLIAA_MANIFEST_URL)
    our_manifest = fetch_json(OUR_MANIFEST_URL)

    if not ts_manifest or not py_manifest:
        print("Failed to fetch remote manifests. Forcing scrape.")
        write_github_output("skip_all", "false")
        write_github_output("use_cache", "false")
        sys.exit(0)

    ts_time_str = ts_manifest.get("last_time") or ts_manifest.get("scrape_time") or ts_manifest.get("built_at")
    py_time_str = py_manifest.get("last_updated") or py_manifest.get("built_at")

    ts_time = parse_time(ts_time_str)
    py_time = parse_time(py_time_str)

    now = datetime.now(timezone.utc)
    ts_age_hours = (now - ts_time).total_seconds() / 3600.0
    py_age_hours = (now - py_time).total_seconds() / 3600.0

    print(f"Remote TS age: {ts_age_hours:.1f} hours")
    print(f"Remote PY age: {py_age_hours:.1f} hours")

    remote_ts_sha = ts_manifest.get("short_sha")
    remote_py_date = py_time_str

    if our_manifest:
        our_ts_sha = our_manifest.get("ts_upstream_sha")
        our_py_date = our_manifest.get("py_upstream_date")
        our_scrape_time = parse_time(our_manifest.get("scrape_time"))
    else:
        our_ts_sha = None
        our_py_date = None
        our_scrape_time = datetime.min.replace(tzinfo=timezone.utc)

    is_sync = (remote_ts_sha == our_ts_sha and remote_py_date == our_py_date and remote_ts_sha is not None)
    
    print(f"Is Sync: {is_sync}")
    
    action = None # 'skip', 'cache', 'scrape'

    if is_sync:
        if args.mode == 'daily':
            action = 'skip'
        else:
            if ts_age_hours < 48 and py_age_hours < 48:
                action = 'skip'
            else:
                action = 'scrape'
    else:
        print(f"Not in sync. Checking if remote caches are fresh (< 48h)...")
        if ts_age_hours < 48 and py_age_hours < 48:
            print("Both remote caches are fresh. Using cache!")
            action = 'cache'
        else:
            print("One or both remote caches are stale (> 48h).")
            if args.mode == 'daily':
                action = 'cache'
            else:
                action = 'scrape'

    print(f"Decided action: {action}")

    if action == 'skip' and args.ui_changed:
        print("UI changes detected! Upgrading action from 'skip' to 'cache' to ensure deployment.")
        action = 'cache'

    if action == 'skip':
        print("Aborting workflow early. We have the latest valid data and no UI changes.")
        write_github_output("skip_all", "true")
        write_github_output("use_cache", "false")
        sys.exit(0)
        
    elif action == 'scrape':
        print("Proceeding to scrape full data.")
        write_github_output("skip_all", "false")
        write_github_output("use_cache", "false")
        sys.exit(0)
        
    elif action == 'cache':
        print("Downloading upstream chunks...")
        os.makedirs(TS_INPUTS_DIR, exist_ok=True)
        os.makedirs(PY_INPUTS_DIR, exist_ok=True)
        
        downloads = []
        for chunk in ts_manifest.get("chunks", []):
            filename = (chunk["file"] if isinstance(chunk, dict) else chunk).replace("chunk/", "")
            downloads.append((f"https://openroles.today/data/chunk/{filename}", os.path.join(TS_INPUTS_DIR, filename)))
            
        for chunk in py_manifest.get("chunks", []):
            filename = (chunk if isinstance(chunk, str) else chunk.get("file", "")).replace("chunks/", "")
            downloads.append((f"https://feashliaa.github.io/job-board-data/data/chunks/{filename}", os.path.join(PY_INPUTS_DIR, filename)))

        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(download_file, url, path) for url, path in downloads]
            for future in as_completed(futures):
                future.result()

        # Write upstream metadata for deduplicate.py
        with open("upstream_metadata.json", "w") as f:
            json.dump({
                "ts_upstream_sha": remote_ts_sha,
                "py_upstream_date": remote_py_date
            }, f)

        write_github_output("skip_all", "false")
        write_github_output("use_cache", "true")
        sys.exit(0)

if __name__ == "__main__":
    main()
