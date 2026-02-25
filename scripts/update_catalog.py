#!/usr/bin/env python3
"""
Find New Artist Discoveries from Last.fm

Maintains a living catalog of new artists discovered in the past week.
Any artist listened to in the past 7 days that doesn't appear in the
user's all-time top 1000 artists is added to the catalog, or has their
`last_listened` date updated.

Workflow:
1. Load existing discovery catalog (data/discovery_catalog.json)
2. Fetch all scrobbles from the last 7 days via user.get_recent_tracks()
3. Group by artist, identifying the most recent track for each
4. Fetch all-time top 1000 artists via user.get_top_artists()
5. For each recent artist not in the top 1000:
    - Add to catalog if new
    - Update last_listened and track if already in catalog
6. Check if any catalog artists have "graduated" into the top 1000
7. Save updated catalog

Supports:
- --dry-run mode for testing without API calls
- Resumable state (caches API results to continue if interrupted)

Created: 2026-02-17
"""

import argparse
import json
import os
import urllib.parse
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

PACIFIC = ZoneInfo("America/Los_Angeles")

import pylast
from dotenv import load_dotenv

# Paths
SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent

# Output paths
DATA_DIR = PROJECT_DIR / "data"
CATALOG_FILE = DATA_DIR / "discovery_catalog.json"
STATE_FILE = DATA_DIR / "state.json"

# In GitHub Actions, credentials will be set as environment variables.
# For local testing, we can load from a local .env file in the project root if it exists.
ENV_PATH = PROJECT_DIR / ".env"
if ENV_PATH.exists():
    load_dotenv(ENV_PATH)

# ---------------------------------------------------------------------------
# Filters — add entries here to exclude scrobbles from the catalog
# ---------------------------------------------------------------------------

# Tracks whose name contains any of these strings (case-insensitive) are skipped
TRACK_NAME_FILTERS = [
    "trailer",
]


def utc_to_pacific(ts: str) -> str:
    """Convert a Last.fm UTC timestamp string to Pacific time."""
    if not ts:
        return ts
    try:
        dt = datetime.strptime(ts, "%d %b %Y, %H:%M").replace(tzinfo=timezone.utc)
        return dt.astimezone(PACIFIC).strftime("%d %b %Y, %H:%M")
    except ValueError:
        return ts


def clean_artist_name(name: str) -> str:
    """Strip leading/trailing quotation marks (straight and curly) from artist names."""
    return name.strip('\'"\u201c\u201d\u2018\u2019')


def should_skip_track(track_name: str) -> bool:
    """Return True if the track name matches any entry in TRACK_NAME_FILTERS."""
    lower = track_name.lower()
    return any(f in lower for f in TRACK_NAME_FILTERS)


def get_lastfm_network() -> pylast.LastFMNetwork:
    """Initialize Last.fm API connection using environment variables."""
    api_key = os.getenv("LASTFM_API_KEY")
    api_secret = os.getenv("LASTFM_API_SECRET")

    if not api_key or not api_secret:
        raise ValueError(
            "Missing Last.fm API credentials. "
            f"Expected in: {ENV_PATH}"
        )

    return pylast.LastFMNetwork(api_key=api_key, api_secret=api_secret)


def build_library_url(username: str, artist_name: str) -> str:
    """Build the Last.fm library URL for an artist."""
    encoded_artist = urllib.parse.quote(artist_name, safe="")
    return f"https://www.last.fm/user/{username}/library/music/{encoded_artist}"


def build_track_url(artist_name: str, track_name: str) -> str:
    """Build the Last.fm track URL."""
    encoded_artist = urllib.parse.quote(artist_name, safe="")
    encoded_track = urllib.parse.quote(track_name, safe="")
    return f"https://www.last.fm/music/{encoded_artist}/_/{encoded_track}"


def load_state() -> dict:
    """Load saved state for resuming."""
    if STATE_FILE.exists():
        with open(STATE_FILE, "r") as f:
            return json.load(f)
    return {}


def save_state(state: dict) -> None:
    """Save state for resuming."""
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)


def clear_state() -> None:
    """Clear saved state after successful completion."""
    if STATE_FILE.exists():
        STATE_FILE.unlink()


def load_catalog() -> dict:
    """Load the existing discovery catalog or create a fresh one."""
    if CATALOG_FILE.exists():
        with open(CATALOG_FILE, "r") as f:
            return json.load(f)
    return {
        "metadata": {
            "last_updated": None,
            "username": "",
            "total_discoveries": 0,
            "total_graduated": 0,
        },
        "catalog": {},
    }


def save_catalog(catalog: dict) -> None:
    """Save the discovery catalog."""
    CATALOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    
    with open(CATALOG_FILE, "w", encoding="utf-8") as f:
        json.dump(catalog, f, indent=2, ensure_ascii=False)


# ---------------------------------------------------------------------------
# Dry-run sample data
# ---------------------------------------------------------------------------

SAMPLE_RECENT_TRACKS = [
    # Single-scrobble artists (some known, some new)
    {"artist": "Khruangbin", "track": "Maria También", "timestamp": "2026-02-16 20:15"},
    {"artist": "Mdou Moctar", "track": "Afrique Victime", "timestamp": "2026-02-16 18:30"},
    {"artist": "Arooj Aftab", "track": "Mohabbat", "timestamp": "2026-02-15 22:00"},
    {"artist": "Nala Sinephro", "track": "Space 1.8", "timestamp": "2026-02-15 14:45"},
    {"artist": "BADBADNOTGOOD", "track": "Time Moves Slow", "timestamp": "2026-02-14 11:20"},
    {"artist": "Floating Points", "track": "Silhouettes (I, II & III)", "timestamp": "2026-02-14 09:00"},
    {"artist": "Little Simz", "track": "Introvert", "timestamp": "2026-02-13 16:30"},
    {"artist": "Beth Gibbons", "track": "Floating on a Moment", "timestamp": "2026-02-13 10:15"},
    {"artist": "Yussef Dayes", "track": "Black Classical Music", "timestamp": "2026-02-12 21:45"},
    {"artist": "Shabaka", "track": "As the Planets and the Stars Collapse", "timestamp": "2026-02-12 19:00"},
    {"artist": "Sault", "track": "Free", "timestamp": "2026-02-11 15:30"},
    {"artist": "Ezra Collective", "track": "Victory Dance", "timestamp": "2026-02-11 08:00"},
    # Multi-scrobble artists (should be excluded if in Top 1000, included if new)
    {"artist": "Radiohead", "track": "Everything In Its Right Place", "timestamp": "2026-02-16 10:00"},
    {"artist": "Radiohead", "track": "Idioteque", "timestamp": "2026-02-15 09:30"},
    {"artist": "Radiohead", "track": "The National Anthem", "timestamp": "2026-02-14 08:00"},
    {"artist": "Tame Impala", "track": "Let It Happen", "timestamp": "2026-02-16 12:00"},
    {"artist": "Tame Impala", "track": "Elephant", "timestamp": "2026-02-13 14:00"},
    # A new artist listened to multiple times
    {"artist": "Osees", "track": "The Dream", "timestamp": "2026-02-16 16:00"},
    {"artist": "Osees", "track": "C", "timestamp": "2026-02-16 15:45"},
]

SAMPLE_TOP_ARTISTS = [
    # Simulated all-time top 1000 (abbreviated)
    "Radiohead", "Tame Impala", "Khruangbin", "BADBADNOTGOOD",
    "Floating Points", "Little Simz", "Sault",
    "Boards of Canada", "Aphex Twin", "Four Tet",
]


# ---------------------------------------------------------------------------
# Core logic
# ---------------------------------------------------------------------------

def fetch_recent_tracks(
    username: str,
    days: int = 7,
    dry_run: bool = False,
    cached_state: dict | None = None,
) -> list[dict]:
    """
    Fetch all scrobbles from the last N days.

    Args:
        username: Last.fm username
        days: Number of days to look back
        dry_run: If True, return sample data
        cached_state: Previously saved state with cached results

    Returns:
        List of dicts with artist, track, and timestamp
    """
    if dry_run:
        print(f"[DRY-RUN] Would fetch recent tracks for user: {username}")
        print(f"[DRY-RUN] Period: Last {days} days")
        print(f"[DRY-RUN] Returning {len(SAMPLE_RECENT_TRACKS)} sample tracks")
        return SAMPLE_RECENT_TRACKS

    # Check for cached recent tracks
    if cached_state and "recent_tracks" in cached_state:
        cached = cached_state["recent_tracks"]
        cached_time = datetime.fromisoformat(cached["fetched_at"])
        age_hours = (datetime.now(PACIFIC) - cached_time).total_seconds() / 3600
        if age_hours < 6:
            print(f"Using cached recent tracks (fetched {age_hours:.1f}h ago)")
            return cached["data"]
        print("Cached recent tracks are stale, re-fetching...")

    print(f"Fetching recent tracks for user: {username}")
    print(f"Period: Last {days} days")

    now = datetime.now(timezone.utc)
    time_from = int((now - timedelta(days=days)).timestamp())
    time_to = int(now.timestamp())

    try:
        network = get_lastfm_network()
        user = network.get_user(username)

        print("Fetching scrobble data from Last.fm API...")
        # pylast adds +1 internally for "now playing" detection,
        # so 999 keeps the API param within the 1-1000 bound.
        recent = user.get_recent_tracks(
            limit=999,
            time_from=time_from,
            time_to=time_to,
        )

        tracks = []
        for played_track in recent:
            artist_name = str(played_track.track.artist)
            track_name = str(played_track.track.title)
            ts = utc_to_pacific(played_track.playback_date or "")

            tracks.append({
                "artist": artist_name,
                "track": track_name,
                "timestamp": ts,
            })

        print(f"Fetched {len(tracks)} scrobbles from the last {days} days")
        return tracks

    except pylast.WSError as e:
        print(f"Last.fm API error: {e}")
        return []
    except Exception as e:
        print(f"Error fetching recent tracks: {e}")
        import traceback
        traceback.print_exc()
        return []


def fetch_top_artists(
    username: str,
    limit: int = 1000,
    dry_run: bool = False,
    cached_state: dict | None = None,
) -> set[str]:
    """
    Fetch the user's all-time top artists as a set of lowercase names.

    Args:
        username: Last.fm username
        limit: Number of top artists to fetch
        dry_run: If True, return sample data
        cached_state: Previously saved state with cached results

    Returns:
        Set of lowercase artist names
    """
    if dry_run:
        print(f"[DRY-RUN] Would fetch top {limit} all-time artists for: {username}")
        top_set = {a.lower() for a in SAMPLE_TOP_ARTISTS}
        print(f"[DRY-RUN] Returning {len(top_set)} sample top artists")
        return top_set

    # Check for cached top artists
    if cached_state and "top_artists" in cached_state:
        cached = cached_state["top_artists"]
        cached_time = datetime.fromisoformat(cached["fetched_at"])
        age_hours = (datetime.now(PACIFIC) - cached_time).total_seconds() / 3600
        if age_hours < 24:
            print(f"Using cached top artists (fetched {age_hours:.1f}h ago)")
            return set(cached["data"])
        print("Cached top artists are stale, re-fetching...")

    print(f"Fetching top {limit} all-time artists for: {username}")

    try:
        network = get_lastfm_network()
        user = network.get_user(username)

        print("Fetching top artist data from Last.fm API...")
        top_artists = user.get_top_artists(
            period=pylast.PERIOD_OVERALL,
            limit=limit,
        )

        artist_set = set()
        for item in top_artists:
            artist_set.add(str(item.item).lower())

        print(f"Fetched {len(artist_set)} top artists")
        return artist_set

    except pylast.WSError as e:
        print(f"Last.fm API error: {e}")
        return set()
    except Exception as e:
        print(f"Error fetching top artists: {e}")
        import traceback
        traceback.print_exc()
        return set()


def update_catalog(
    catalog: dict,
    recent_tracks: list[dict],
    top_artists: set[str],
    username: str,
) -> dict:
    """
    Update the discovery catalog with new scrobbles and graduations.

    Args:
        catalog: The existing catalog dictionary
        recent_tracks: List of recent scrobble dicts
        top_artists: Set of lowercase known artist names
        username: Last.fm username

    Returns:
        Dictionary of stats from this update run
    """
    stats = {
        "unique_artists_this_week": 0,
        "matched_to_top": 0,
        "new_to_catalog": 0,
        "updated_in_catalog": 0,
        "graduated_to_top": 0,
    }

    # 1. Check for graduated catalog entries
    for key, entry in catalog["catalog"].items():
        if key in top_artists and not entry.get("graduated"):
            entry["graduated"] = True
            entry["graduated_date"] = datetime.now(PACIFIC).isoformat()
            stats["graduated_to_top"] += 1

    # 2. Get most recent track for each artist this week
    latest_tracks: dict[str, dict] = {}
    for track in recent_tracks:
        if should_skip_track(track["track"]):
            continue
        artist_clean = clean_artist_name(track["artist"])
        key = artist_clean.lower()
        # Last.fm get_recent_tracks returns newest first. We want the newest one, so if it's
        # already in the dict, we don't overwrite it.
        if key not in latest_tracks:
            latest_tracks[key] = {**track, "artist": artist_clean}
            
    stats["unique_artists_this_week"] = len(latest_tracks)

    # 3. Process each artist
    for key, track_info in latest_tracks.items():
        artist_display = track_info["artist"]
        
        # Skip if they are in the all-time Top 1000
        if key in top_artists:
            stats["matched_to_top"] += 1
            continue

        # We have a discovery!
        if key in catalog["catalog"]:
            # Update existing entry
            entry = catalog["catalog"][key]
            entry["last_listened"] = track_info["timestamp"]
            entry["track"] = track_info["track"]
            entry["track_url"] = build_track_url(artist_display, track_info["track"])
            stats["updated_in_catalog"] += 1
        else:
            # Brand new discovery
            catalog["catalog"][key] = {
                "artist": artist_display,
                "first_discovered": track_info["timestamp"],
                "last_listened": track_info["timestamp"],
                "track": track_info["track"],
                "artist_url": build_library_url(username, artist_display),
                "track_url": build_track_url(artist_display, track_info["track"]),
                "graduated": False
            }
            stats["new_to_catalog"] += 1

    # Update metadata
    catalog["metadata"]["last_updated"] = datetime.now(PACIFIC).isoformat()
    catalog["metadata"]["username"] = username
    catalog["metadata"]["total_discoveries"] = len(catalog["catalog"])
    catalog["metadata"]["total_graduated"] = sum(
        1 for a in catalog["catalog"].values() if a.get("graduated")
    )

    return stats


def print_results(stats: dict, catalog: dict) -> None:
    """Print formatted results to console."""
    print()
    print("=" * 72)
    print("  New Artist Discoveries (Last 7 Days)")
    print("=" * 72)
    print()
    print(f"  Unique artists heard this week: {stats['unique_artists_this_week']:>5}")
    print(f"  Already in all-time Top 1000:   {stats['matched_to_top']:>5}")
    print(f"  Brand new discoveries added:    {stats['new_to_catalog']:>5}")
    print(f"  Existing discoveries updated:   {stats['updated_in_catalog']:>5}")
    if stats["graduated_to_top"] > 0:
        print(f"  Graduated to Top 1000:          {stats['graduated_to_top']:>5}")
    print()
    
    if stats["new_to_catalog"] == 0 and stats["updated_in_catalog"] == 0:
        print("  No new or existing discoveries were played this week.")
        print("=" * 72)
        return

    # Find the entries we just touched
    touched_entries = []
    
    # Simple way to identify recently touched items: 
    # check if their last_listened string matches something from this run.
    # But better to just sort the whole catalog by last_listened and show the top ones.
    
    all_entries = list(catalog["catalog"].values())
    all_entries.sort(key=lambda x: x["last_listened"], reverse=True)
    
    # Take entries updated in this run
    recent_count = stats["new_to_catalog"] + stats["updated_in_catalog"]
    recent_entries = all_entries[:recent_count]

    # Calculate column widths
    max_artist = max(len(a["artist"]) for a in recent_entries)
    max_track = max(len(a["track"]) for a in recent_entries)
    artist_w = min(max(max_artist, 6), 30)
    track_w = min(max(max_track, 5), 35)

    header = f"  {'Artist':<{artist_w}}  {'Latest Track':<{track_w}}  {'Status'}"
    sep = f"  {'-' * artist_w}  {'-' * track_w}  {'-' * 16}"

    print(header)
    print(sep)

    for entry in recent_entries:
        artist = entry["artist"]
        track = entry["track"]
        
        if entry["first_discovered"] == entry["last_listened"]:
            status = "NEW!"
        else:
            status = "Updated"

        # Truncate long names
        if len(artist) > artist_w:
            artist = artist[: artist_w - 1] + "\u2026"
        if len(track) > track_w:
            track = track[: track_w - 1] + "\u2026"

        print(f"  {artist:<{artist_w}}  {track:<{track_w}}  {status}")

    print(sep)
    print(f"  Total catalog size: {catalog['metadata']['total_discoveries']} artists")
    print("=" * 72)


def main():
    parser = argparse.ArgumentParser(
        description=(
            "Maintain a catalog of new artist discoveries from the "
            "last 7 days that are not in your all-time top 1000."
        )
    )
    parser.add_argument(
        "--dry-run", "-n",
        action="store_true",
        help="Run in test mode with sample data (no API calls)",
    )
    parser.add_argument(
        "--username", "-u",
        default="sugarsmax",
        help="Last.fm username (default: sugarsmax)",
    )
    parser.add_argument(
        "--days", "-d",
        type=int,
        default=7,
        help="Number of days to look back (default: 7)",
    )
    parser.add_argument(
        "--top-limit", "-t",
        type=int,
        default=1000,
        help="Number of all-time top artists to compare against (default: 1000)",
    )
    parser.add_argument(
        "--no-cache",
        action="store_true",
        help="Ignore cached API results and re-fetch everything",
    )

    args = parser.parse_args()

    # Load state for resuming
    state = {} if args.no_cache else load_state()

    print("=" * 72)
    print("  New Artist Discovery Cataloger")
    print("=" * 72)
    print(f"  Username:       {args.username}")
    print(f"  Lookback:       {args.days} days")
    print(f"  Top artists:    {args.top_limit}")
    print(f"  Catalog:        {CATALOG_FILE}")
    print(f"  Mode:           {'DRY-RUN' if args.dry_run else 'LIVE'}")
    if state:
        print(f"  Cached state:   Yes (use --no-cache to ignore)")
    print("=" * 72)
    print()

    # Load Catalog
    catalog = load_catalog()
    print(f"Loaded existing catalog with {catalog['metadata'].get('total_discoveries', 0)} artists.")

    # Step 1: Fetch recent tracks
    print("\nStep 1/3: Fetching recent tracks...")
    recent_tracks = fetch_recent_tracks(
        username=args.username,
        days=args.days,
        dry_run=args.dry_run,
        cached_state=state,
    )

    if not recent_tracks:
        print("\nNo recent tracks found. Nothing to analyze.")
        return

    # Cache recent tracks (live mode only)
    if not args.dry_run and "recent_tracks" not in state:
        state["recent_tracks"] = {
            "fetched_at": datetime.now(PACIFIC).isoformat(),
            "data": recent_tracks,
        }
        save_state(state)
        print("  (Cached recent tracks to state.json)")

    # Step 2: Fetch top artists
    print("\nStep 2/3: Fetching all-time top artists...")
    top_artists = fetch_top_artists(
        username=args.username,
        limit=args.top_limit,
        dry_run=args.dry_run,
        cached_state=state,
    )

    if not top_artists:
        print("\nWarning: No top artists returned. All non-top artists "
              "will be treated as 'new'.")

    # Cache top artists (live mode only)
    if not args.dry_run and "top_artists" not in state:
        state["top_artists"] = {
            "fetched_at": datetime.now(PACIFIC).isoformat(),
            "data": list(top_artists),
        }
        save_state(state)
        print("  (Cached top artists to state.json)")

    # Step 3: Update catalog
    print("\nStep 3/3: Updating discovery catalog...")
    stats = update_catalog(catalog, recent_tracks, top_artists, args.username)

    # Print console results
    print_results(stats, catalog)

    # Save Catalog
    if not args.dry_run:
        save_catalog(catalog)
        print(f"\nSaved updated catalog to: {CATALOG_FILE}")
        clear_state()
        print("State cleared (run complete).")
    else:
        print(f"\n[DRY-RUN] Would save catalog to: {CATALOG_FILE}")

    print("\nDone!")


if __name__ == "__main__":
    main()
