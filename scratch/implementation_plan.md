# Implement Cache Pipeline, Fix Scraping, and Update Cron

The goal is to reduce GitHub Actions compute costs by reusing upstream scraped data if it's less than 2 days old, fix the Python scraper artifact upload path, remove the failing `jazzhr` ATS, and configure the cron job to run exactly every 2 days.

## Open Questions
None. The requirements are clear.

## Proposed Changes

### 1. New Caching Script
#### [NEW] `job_filters/scripts/check_and_fetch_cache.py`
A python script that runs before any scraping.
- It will fetch the manifests from `https://openroles.today/data/manifest.json` and `https://feashliaa.github.io/job-board-data/data/chunks/jobs_manifest.json`.
- It will parse the timestamps (`last_updated` / `built_at`).
- If BOTH are less than 48 hours old:
  - Downloads all TS chunks into a local `ts_inputs/` folder.
  - Downloads all PY chunks into a local `py_inputs/` folder.
  - Outputs a GitHub Actions output variable `use_cache=true`.
- If either is older than 48 hours, or if there's an error, it outputs `use_cache=false`.

### 2. Update Deduplication Script
#### [MODIFY] `job_filters/scripts/deduplicate.py`
- Modify the script to read Python chunks `.json.gz` from the `py_inputs/` directory. (Currently, it expects a single `all_jobs.json`. We need to support both `all_jobs.json` for live scrapes and `.json.gz` for cached chunks).

### 3. Update GitHub Actions Workflows
#### [MODIFY] `job_filters/.github/workflows/scrape-build-deploy-push.yml`
- Add a new `check-cache` job at the beginning to run `check_and_fetch_cache.py`.
- In `scrape-ts` and `scrape-py` jobs, add `needs: check-cache` and `if: needs.check-cache.outputs.use_cache != 'true'`.
- Remove `jazzhr` from the `scrape-ts` matrix.
- Fix the `scrape-py` artifact upload path to `py_scraper/scripts/output/all_jobs.json` (currently it was incorrectly set to `py_scraper/output/all_jobs.json`).
- In the `build` job, if `use_cache == 'true'`, download the `check-cache` artifact (which contains `ts_inputs` and `py_inputs`). Otherwise, download artifacts from the scraping jobs as normal.

#### [NEW] `job_filters/.github/workflows/scrape-build-deploy-cron.yml`
- We will merge the existing `scrape.yml` and `build-deploy.yml` into a single unified cron workflow (identical to the push workflow) for simplicity and reliability.
- **Cron Schedule**: `30 22 * * *` (runs every day at 4:00 AM IST).
- **Modulo Check**: Since you requested it to run exactly every 2 days starting on July 8, 2026, we will add a bash step at the top of the workflow that calculates the days since epoch. If it's an "odd" day (like July 7/9/11 UTC), it runs. If it's an "even" day (like July 6 UTC), it skips execution. This guarantees it skips today and runs perfectly every 2 days forever.

#### [DELETE] `job_filters/.github/workflows/scrape.yml`
#### [DELETE] `job_filters/.github/workflows/build-deploy.yml`

## Verification Plan
- Run `python scripts/check_and_fetch_cache.py` locally to verify it correctly downloads the data when upstream is fresh.
- Verify the deduplication script works seamlessly with the downloaded `.json.gz` python chunks.
- Commit to trigger the push workflow, observing the successful cache-hit deployment!
