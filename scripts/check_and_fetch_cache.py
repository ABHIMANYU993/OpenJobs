import os
import sys
import json
import requests
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed

OPENROLES_MANIFEST_URL = "https://openroles.today/data/manifest.json"
FEASHLIAA_MANIFEST_URL = "https://feashliaa.github.io/job-board-data/data/chunks/jobs_manifest.json"

TS_INPUTS_DIR = os.path.abspath("ts_inputs")
PY_INPUTS_DIR = os.path.abspath("py_inputs")

def fetch_json(url):
    resp = requests.get(url, timeout=15)
    resp.raise_for_status()
    return resp.json()

def download_file(url, local_path):
    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    resp = requests.get(url, timeout=15)
    resp.raise_for_status()
    with open(local_path, "wb") as f:
        f.write(resp.content)
    return True

def main():
    try:
        ts_manifest = fetch_json(OPENROLES_MANIFEST_URL)
        py_manifest = fetch_json(FEASHLIAA_MANIFEST_URL)
    except Exception as e:
        print(f"Failed to fetch manifests: {e}")
        sys.exit(1)

    ts_time_str = ts_manifest.get("last_time") or ts_manifest.get("scrape_time") or ts_manifest.get("built_at")
    py_time_str = py_manifest.get("last_updated") or py_manifest.get("built_at")

    if not ts_time_str or not py_time_str:
        print("Missing timestamps in manifests.")
        sys.exit(1)

    try:
        # Some are IST with +05:30, some are Z. fromisoformat handles +05:30 in newer pythons
        ts_time = datetime.fromisoformat(ts_time_str.replace("Z", "+00:00"))
        py_time = datetime.fromisoformat(py_time_str.replace("Z", "+00:00"))
    except Exception as e:
        print(f"Failed to parse timestamps: {e}")
        sys.exit(1)

    now = datetime.now(timezone.utc)
    ts_age_hours = (now - ts_time).total_seconds() / 3600.0
    py_age_hours = (now - py_time).total_seconds() / 3600.0

    print(f"TS Manifest age: {ts_age_hours:.1f} hours")
    print(f"PY Manifest age: {py_age_hours:.1f} hours")

    if ts_age_hours < 48 and py_age_hours < 48:
        print("Both upstream datasets are fresh (< 48 hours). Downloading chunks...")
        
        # Ensure clean directories
        os.makedirs(TS_INPUTS_DIR, exist_ok=True)
        os.makedirs(PY_INPUTS_DIR, exist_ok=True)
        
        downloads = []
        
        # TS chunks
        ts_chunks = ts_manifest.get("chunks", [])
        for chunk in ts_chunks:
            # openroles manifest has 'file' keys in chunks array, or direct strings
            filename = chunk["file"] if isinstance(chunk, dict) else chunk
            filename = filename.replace("chunk/", "")
            url = f"https://openroles.today/data/chunk/{filename}"
            local_path = os.path.join(TS_INPUTS_DIR, filename)
            downloads.append((url, local_path))
            
        # PY chunks
        py_chunks = py_manifest.get("chunks", [])
        for chunk in py_chunks:
            # feashliaa has strings like 'jobs_chunk_0.json.gz' or 'chunks/jobs_chunk...'
            filename = chunk if isinstance(chunk, str) else chunk.get("file", "")
            filename = filename.replace("chunks/", "")
            url = f"https://feashliaa.github.io/job-board-data/data/chunks/{filename}"
            local_path = os.path.join(PY_INPUTS_DIR, filename)
            downloads.append((url, local_path))

        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(download_file, url, path) for url, path in downloads]
            for future in as_completed(futures):
                future.result() # Will raise if any download fails

        print("Successfully downloaded all cached chunks.")
        
        # Write to GITHUB_OUTPUT for github actions
        if "GITHUB_OUTPUT" in os.environ:
            with open(os.environ["GITHUB_OUTPUT"], "a") as f:
                f.write("use_cache=true\n")
                
        sys.exit(0)
    else:
        print("Data is stale (> 48 hours). Must scrape.")
        sys.exit(1)

if __name__ == "__main__":
    main()
