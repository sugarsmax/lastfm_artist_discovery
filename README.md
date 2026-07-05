# lastfm_artist_discovery

https://sugarsmax.github.io/lastfm_artist_discovery/

A GitHub Pages site that tracks artists discovered via Last.fm scrobbles. Updated nightly by GitHub Actions.

## Pages

**Discoveries** (`index.html`) — Artists heard in the last 7 days that are not in the all-time top 500. Stays in the catalog until they graduate into the top 500.

**Classical Spotter** (`classical.html`) — Filters the discovery catalog for tracks or albums where a classical composer's name appears, performed by someone else.

**Old Favorites** (`familiar.html`) — All non-graduated discovery artists, enriched with each artist's personal top 3 all-time tracks.

## Stack

- Python + `pylast` for data collection (`scripts/update_catalog.py`, `scripts/update_familiar.py`)
- Static JSON files in `data/` as the data layer
- Vanilla JS frontend; no build step
- GitHub Actions for nightly runs and automatic Pages deployment
