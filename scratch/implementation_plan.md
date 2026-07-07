# Smart Workflow Orchestration Plan

This plan introduces a highly efficient, multi-tiered checking system that completely eliminates redundant scraping and downloading by strictly comparing upstream cache signatures with your currently deployed GitHub Pages site.

## Proposed Architecture

### 1. Unified Smart Cache Script
#### [NEW] `job_filters/scripts/smart_cache_check.py`
A new script that handles the intelligent version checking for both workflows. It will:
1. Fetch the remote upstream manifests (`openroles` and `job-board-aggregator`).
2. Fetch **your** currently live manifest (`https://abhimanyu993.github.io/OpenJobs/data/manifest.json`).
3. Compare the signatures (OpenRoles SHA and Python Scraper Date).
4. Decide the action based on the mode:

**Daily Mode (`--mode daily`)**:
- If signatures match yours: Output `skip_all=true`. (Aborts everything, saves 100% compute).
- If signatures differ: Downloads the remote chunks, outputs `use_cache=true`. (Builds and deploys the new cached data. No scraping).

**3-Day Mode (`--mode 3-day`)**:
- If signatures match yours:
  - If upstream data is **fresh** (< 48 hrs): Output `skip_all=true`. (Aborts everything, you already have the fresh data).
  - If upstream data is **stale** (> 48 hrs): Output `use_cache=false`. (Triggers your scrapers to run and get fresh data).
- If signatures differ:
  - If upstream data is **fresh**: Downloads chunks, outputs `use_cache=true`. (Uses the fresh cache).
  - If upstream data is **stale**: Outputs `use_cache=false`. (Triggers your scrapers).

### 2. Update Deduplication Script
#### [MODIFY] `job_filters/scripts/deduplicate.py`
- When building `manifest.json`, it will now embed the upstream `ts_upstream_sha` and `py_upstream_date`.
- This ensures that the smart cache script can check exactly which version of the upstream data you currently have deployed.

### 3. Workflows
#### [NEW] `.github/workflows/daily-cache-sync.yml`
- Runs daily at 4:00 AM IST (`30 22 * * *`).
- Runs `smart_cache_check.py --mode daily`.
- If `skip_all=true`, it cleanly aborts.
- If `skip_all=false`, it skips scraping, runs deduplication on the downloaded cache, and deploys.

#### [MODIFY] `.github/workflows/scrape-build-deploy-cron.yml`
- Runs daily at 5:00 AM IST (`30 23 * * *`).
- Modulo logic updated to run every 3 days (e.g., skips if `days_since_epoch % 3 != 0`).
- Runs `smart_cache_check.py --mode 3-day`.
- If `skip_all=true`, it cleanly aborts.
- If `use_cache=false`, it runs the TS and Py scrapers.
- Finally, builds and deploys.

#### [MODIFY] `.github/workflows/scrape-build-deploy-push.yml`
- We will update this manual trigger workflow to use the same smart logic (acting like the 3-day mode so it can test both cache and scraping).

## Verification Plan
1. Test the `smart_cache_check.py` locally against the live `abhimanyu993.github.io` manifest to ensure it evaluates the hashes correctly.
2. Verify the 3-day modulo calculation accurately spaces runs 72 hours apart.

Let me know if this aligns with your vision and I will implement it immediately!
