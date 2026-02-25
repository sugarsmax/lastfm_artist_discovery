# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Does

A GitHub Pages static site that tracks newly discovered Last.fm artists. The Python script (`scripts/update_catalog.py`) runs nightly via GitHub Actions, fetches the user's recent scrobbles, filters out any artist already in the all-time top 1000, and writes results to `data/discovery_catalog.json`. The frontend (`index.html` + `js/app.js`) reads that JSON file and renders a searchable, sortable card grid.

An artist "graduates" when they eventually appear in the top 1000 — that status persists in the catalog.

## Running the Script

```bash
# Dry-run (sample data, no API calls, no file writes)
python scripts/update_catalog.py --dry-run

# Live run against the API
python scripts/update_catalog.py --username sugarsmax

# Skip cached state from a previous interrupted run
python scripts/update_catalog.py --username sugarsmax --no-cache
```

Key flags: `--days` (lookback window, default 7), `--top-limit` (top artist threshold, default 1000).

## Local Development

Install dependencies into the shared venv or a local one:
```bash
pip install -r requirements.txt
```

Credentials go in a `.env` file at the project root (gitignored):
```
LASTFM_API_KEY=...
LASTFM_API_SECRET=...
```

To preview the frontend locally, serve from the project root (a plain `file://` open won't work due to the `fetch()` call):
```bash
python -m http.server 8000
```

## Architecture

| Layer | Files | Role |
|---|---|---|
| Data pipeline | `scripts/update_catalog.py` | Fetches API data, updates catalog JSON |
| Catalog | `data/discovery_catalog.json` | Single source of truth; committed to git |
| Resume state | `data/state.json` | Temporary cache for interrupted runs; gitignored |
| Frontend | `index.html`, `js/app.js`, `css/style.css` | Static site; reads catalog JSON via `fetch()` |
| CI | `.github/workflows/update_catalog.yml` | Runs script daily at 02:00 UTC, commits changed JSON |

### Catalog JSON Shape

```json
{
  "metadata": { "last_updated": "...", "username": "...", "total_discoveries": N, "total_graduated": N },
  "catalog": {
    "artist key (lowercase)": {
      "artist": "Display Name",
      "first_discovered": "YYYY-MM-DD HH:MM",
      "last_listened": "YYYY-MM-DD HH:MM",
      "track": "Track Title",
      "artist_url": "https://www.last.fm/user/.../library/music/...",
      "track_url": "https://www.last.fm/music/.../_/...",
      "graduated": false
    }
  }
}
```

## Secrets (GitHub Actions)

The workflow reads `LASTFM_API_KEY` and `LASTFM_API_SECRET` from repository secrets. Add these under **Settings → Secrets and variables → Actions**.
