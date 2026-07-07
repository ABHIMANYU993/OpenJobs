import json
import gzip
import os
import sys
import argparse
from datetime import datetime
import pytz

IST = pytz.timezone('Asia/Kolkata')

def convert_py_job(job):
    # Convert py_scraper job dict to standardized full-key format
    std_job = {}
    
    # ID / URL
    std_job['id'] = job.get('id') or str(hash(job.get('url', ''))) # Fallback to hash of URL if no ID
    std_job['url'] = job.get('url', '')
    
    std_job['title'] = job.get('title', '')
    std_job['company'] = job.get('company', '')
    std_job['location'] = job.get('location', '')
    std_job['ats'] = job.get('ats', '')
    std_job['level'] = job.get('skill_level', '')
    std_job['remote'] = job.get('remote', False)
    std_job['salary'] = job.get('salary', None)
    
    # Dates (map first_seen or updated_at to posted_at)
    std_job['posted_at'] = job.get('first_seen') or job.get('updated_at')
    
    # Add metadata (keep original metadata in standard schema if needed)
    now_ist = datetime.now(IST).isoformat()
    std_job['scrape_time'] = job.get('scraped_at', now_ist)
    std_job['modified_time'] = now_ist
    std_job['last_time'] = now_ist
    
    # Transfer any extra keys from job to std_job
    for k, v in job.items():
        if k not in ['id', 'url', 'title', 'company', 'location', 'ats', 'skill_level', 'first_seen', 'updated_at', 'scraped_at', 'remote', 'salary']:
            std_job[k] = v
            
    return std_job

def process_ts_job(job):
    std_job = {}
    # Shortkeys to Fullkeys
    std_job['id'] = job.get('i') or job.get('id') or str(hash(job.get('u', '')))
    std_job['url'] = job.get('u') or job.get('url', '')
    std_job['title'] = job.get('ti') or job.get('title', '')
    std_job['company'] = job.get('c') or job.get('company', '')
    std_job['location'] = job.get('loc') or job.get('location', '')
    std_job['ats'] = job.get('a') or job.get('ats', '')
    std_job['level'] = job.get('l') or job.get('level', '')
    
    is_remote = False
    if job.get('w') == 'remote' or str(job.get('loc', '')).lower() == 'remote':
        is_remote = True
    std_job['remote'] = is_remote
    std_job['salary'] = job.get('cur') or job.get('salary')
    
    std_job['posted_at'] = job.get('p') or job.get('posted_at')
    
    # Add metadata
    now_ist = datetime.now(IST).isoformat()
    std_job['scrape_time'] = job.get('scrape_time', now_ist)
    std_job['modified_time'] = now_ist
    std_job['last_time'] = now_ist
    
    # Transfer other raw fields
    for k, v in job.items():
        if k not in ['i', 'u', 'ti', 'c', 'loc', 'a', 'l', 'w', 'cur', 'p', 'scrape_time', 'modified_time', 'last_time']:
            std_job[k] = v
            
    return std_job

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--ts-input', help='Path to TS scraper outputs dir', required=True)
    parser.add_argument('--py-input', help='Path to Python scraper all_jobs.json or a directory of .json.gz chunks', required=True)
    parser.add_argument('--output-dir', help='Path to output data dir (e.g., ui/data)', required=True)
    parser.add_argument('--commit-sha', help='GitHub commit SHA', default='local_run')
    args = parser.parse_args()
    
    all_jobs = {}
    
    # Load PY jobs
    if os.path.isdir(args.py_input):
        # py_inputs is a directory of .json.gz files downloaded from upstream cache
        for fname in os.listdir(args.py_input):
            if fname.endswith('.json.gz') or fname.endswith('.json'):
                path = os.path.join(args.py_input, fname)
                try:
                    open_func = gzip.open if fname.endswith('.gz') else open
                    mode = 'rt' if fname.endswith('.gz') else 'r'
                    with open_func(path, mode, encoding='utf-8') as f:
                        py_jobs = json.load(f)
                        for j in py_jobs:
                            sj = convert_py_job(j)
                            key = sj.get('id') or sj.get('url')
                            if key and key not in all_jobs:
                                all_jobs[key] = sj
                except json.JSONDecodeError:
                    pass
    elif os.path.isfile(args.py_input):
        # py_input is a single all_jobs.json file from the scraper
        with open(args.py_input, 'r', encoding='utf-8') as f:
            try:
                py_jobs = json.load(f)
                for j in py_jobs:
                    sj = convert_py_job(j)
                    key = sj.get('id') or sj.get('url')
                    if key and key not in all_jobs:
                        all_jobs[key] = sj
            except json.JSONDecodeError:
                pass
                    
    # Load TS jobs (scrape-outputs directory)
    if os.path.exists(args.ts_input):
        for fname in os.listdir(args.ts_input):
            if fname.endswith('.json') or fname.endswith('.json.gz'):
                path = os.path.join(args.ts_input, fname)
                try:
                    open_func = gzip.open if fname.endswith('.gz') else open
                    mode = 'rt' if fname.endswith('.gz') else 'r'
                    with open_func(path, mode, encoding='utf-8') as f:
                        ts_data = json.load(f)
                        ts_jobs = ts_data.get('jobs', [])
                        # Some caches might just be a flat array instead of {jobs: []}
                        if isinstance(ts_data, list):
                            ts_jobs = ts_data
                        for j in ts_jobs:
                            sj = process_ts_job(j)
                            key = sj.get('id') or sj.get('url')
                            if key:
                                # If duplicate, prefer TS data since it might be richer
                                all_jobs[key] = sj
                except json.JSONDecodeError:
                    pass

    jobs_list = list(all_jobs.values())
    
    # Sort for deterministic chunking (by company then title)
    jobs_list.sort(key=lambda x: (x.get('company', '').lower(), x.get('title', '').lower()))
    
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
    
    # Inject upstream metadata if we downloaded cache
    if os.path.exists("upstream_metadata.json"):
        try:
            with open("upstream_metadata.json", "r") as f:
                meta = json.load(f)
                manifest['ts_upstream_sha'] = meta.get('ts_upstream_sha')
                manifest['py_upstream_date'] = meta.get('py_upstream_date')
        except:
            pass
    
    manifest_path = os.path.join(args.output_dir, 'manifest.json')
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        
    print(f"Deduplication complete. {len(jobs_list)} unique jobs saved to {len(chunk_filenames)} chunks.")

if __name__ == '__main__':
    main()
