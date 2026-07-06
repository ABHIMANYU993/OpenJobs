import json
# dummy py_scraper output
dummy_jobs = [
    {
        "title": "Software Engineer",
        "company": "Twitch",
        "location": "Remote, US",
        "url": "https://boards.greenhouse.io/twitch/jobs/123",
        "id": "123",
        "ats": "Greenhouse",
        "skill_level": "mid",
        "updated_at": "2026-07-06T10:00:00Z",
        "first_seen": "2026-07-01T10:00:00Z"
    }
]
with open('py_scraper/all_jobs.json', 'w') as f:
    json.dump(dummy_jobs, f)
