import json
import gzip
import os
import sys
import argparse
from datetime import datetime
import pytz

IST = pytz.timezone('Asia/Kolkata')

def convert_py_job(job):
    # Convert py_scraper job dict to ts_scraper short format
    short_job = {}
    
    # ID / URL
    short_job['i'] = job.get('id') or str(hash(job.get('url', ''))) # Fallback to hash of URL if no ID
    short_job['u'] = job.get('url', '')
    
    short_job['ti'] = job.get('title', '')
    short_job['c'] = job.get('company', '')
    short_job['loc'] = job.get('location', '')
    short_job['ats'] = job.get('ats', '')
    short_job['l'] = job.get('skill_level', '')
    
    # Dates
    short_job['p'] = job.get('updated_at')
    short_job['f'] = job.get('first_seen')
    
    # Add metadata
    now_ist = datetime.now(IST).isoformat()
    short_job['scrape_time'] = job.get('scraped_at', now_ist)
    short_job['modified_time'] = now_ist
    short_job['last_time'] = now_ist
    
    return short_job

def process_ts_job(job):
    # Ensure metadata exists
    now_ist = datetime.now(IST).isoformat()
    job['scrape_time'] = job.get('scrape_time', now_ist)
    job['modified_time'] = job.get('modified_time', now_ist)
    job['last_time'] = job.get('last_time', now_ist)
    return job

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--ts-input', help='Path to TS scraper outputs dir', required=True)
    parser.add_argument('--py-input', help='Path to Python scraper all_jobs.json', required=True)
    parser.add_argument('--output-dir', help='Path to output data dir (e.g., ui/data)', required=True)
    parser.add_argument('--commit-sha', help='GitHub commit SHA', default='local_run')
    args = parser.parse_args()
    
    all_jobs = {}
    
    # Load PY jobs
    if os.path.exists(args.py_input):
        with open(args.py_input, 'r', encoding='utf-8') as f:
            try:
                py_jobs = json.load(f)
                for j in py_jobs:
                    sj = convert_py_job(j)
                    key = sj.get('i') or sj.get('u')
                    if key and key not in all_jobs:
                        all_jobs[key] = sj
            except json.JSONDecodeError:
                pass
                    
    # Load TS jobs (scrape-outputs directory)
    if os.path.exists(args.ts_input):
        for fname in os.listdir(args.ts_input):
            if fname.endswith('.json'):
                path = os.path.join(args.ts_input, fname)
                with open(path, 'r', encoding='utf-8') as f:
                    try:
                        ts_data = json.load(f)
                        ts_jobs = ts_data.get('jobs', [])
                        for j in ts_jobs:
                            sj = process_ts_job(j)
                            key = sj.get('i') or sj.get('u')
                            if key:
                                # If duplicate, prefer TS data since it might be richer
                                all_jobs[key] = sj
                    except json.JSONDecodeError:
                        pass

    jobs_list = list(all_jobs.values())
    
    # Sort for deterministic chunking (by company then title)
    jobs_list.sort(key=lambda x: (x.get('c', '').lower(), x.get('ti', '').lower()))
    
    chunk_dir = os.path.join(args.output_dir, 'chunk')
    os.makedirs(chunk_dir, exist_ok=True)
    
    # Clean old chunks
    for f in os.listdir(chunk_dir):
        if f.endswith('.json.gz'):
            os.remove(os.path.join(chunk_dir, f))
            
    CHUNK_SIZE = 20000
    chunk_filenames = []
    
    for i in range(0, len(jobs_list), CHUNK_SIZE):
        chunk = jobs_list[i:i+CHUNK_SIZE]
        chunk_name = f'jobs_chunk_{i//CHUNK_SIZE}.json.gz'
        chunk_path = os.path.join(chunk_dir, chunk_name)
        with gzip.open(chunk_path, 'wt', encoding='utf-8') as f:
            json.dump(chunk, f, ensure_ascii=False, separators=(',', ':'))
        chunk_filenames.append({"file": f"chunk/{chunk_name}"})
        
    now_ist = datetime.now(IST).isoformat()
    manifest = {
        'chunks': chunk_filenames,
        'total_jobs': len(jobs_list),
        'built_at': now_ist,
        'scrape_time': now_ist,
        'modified_time': now_ist,
        'last_time': now_ist,
        'short_sha': args.commit_sha
    }
    
    manifest_path = os.path.join(args.output_dir, 'manifest.json')
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        
    print(f"Deduplication complete. {len(jobs_list)} unique jobs saved to {len(chunk_filenames)} chunks.")

if __name__ == '__main__':
    main()
