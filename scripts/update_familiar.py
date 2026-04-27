#!/usr/bin/env python3
"""
Familiar Artist Deep Cuts

For each artist in the discovery catalog (not in the all-time top 1000),
check if they have 50+ total scrobbles. If so, include them on the
"Old Favorites" page with their top 3 tracks from your listening history.

These are artists you've built real history with but who haven't cracked
the top 1000 yet — the middle tier between brand-new discoveries and
established favorites.

Workflow:
1. Load existing discovery catalog (data/discovery_catalog.json)
2. Fetch extended top artists (limit=2000) with playcount data
3. Filter catalog entries where playcount >= min_scrobbles
4. Fetch user's all-time top tracks (limit=500)
5. For each qualifying artist, find their top 3 tracks
6. Write data/familiar_catalog.json

Supports:
- --dry-run mode for testing without API calls
- Resumable state (caches API results to continue if interrupted)

Created: 2026-04-26
"""

import argparse
import json
import os
import urllib.parse
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

PACIFIC = ZoneInfo("America/Los_Angeles")

import pylast
from dotenv import load_dotenv

# Paths
SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
DATA_DIR = PROJECT_DIR / "data"
CATALOG_FILE = DATA_DIR / "discovery_catalog.json"
FAMILIAR_FILE = DATA_DIR / "familiar_catalog.json"
STATE_FILE = DATA_DIR / "familiar_state.json"

ENV_PATH = PROJECT_DIR / ".env"
if ENV_PATH.exists():
    load_dotenv(ENV_PATH)


# ---------------------------------------------------------------------------
# Dry-run sample data
# ---------------------------------------------------------------------------

SAMPLE_CATALOG_ENTRIES = {
    "mdou moctar": {
        "artist": "Mdou Moctar",
        "first_discovered": "16 Feb 2026, 18:30",
        "last_listened": "20 Apr 2026, 14:00",
        "track": "Afrique Victime",
        "album": "Afrique Victime",
        "artist_url": "https://www.last.fm/user/sugarsmax/library/music/Mdou+Moctar",
        "track_url": "https://www.last.fm/music/Mdou+Moctar/_/Afrique+Victime",
        "graduated": False,
    },
    "yussef dayes": {
        "artist": "Yussef Dayes",
        "first_discovered": "12 Feb 2026, 21:45",
        "last_listened": "18 Apr 2026, 10:30",
        "track": "Black Classical Music",
        "album": "Black Classical Music",
        "artist_url": "https://www.last.fm/user/sugarsmax/library/music/Yussef+Dayes",
        "track_url": "https://www.last.fm/music/Yussef+Dayes/_/Black+Classical+Music",
        "graduated": False,
    },
    "arooj aftab": {
        "artist": "Arooj Aftab",
        "first_discovered": "15 Feb 2026, 22:00",
        "last_listened": "10 Apr 2026, 08:15",
        "track": "Mohabbat",
        "album": "Vulture Prince",
        "artist_url": "https://www.last.fm/user/sugarsmax/library/music/Arooj+Aftab",
        "track_url": "https://www.last.fm/music/Arooj+Aftab/_/Mohabbat",
        "graduated": False,
    },
    "osees": {
        "artist": "Osees",
        "first_discovered": "16 Feb 2026, 16:00",
        "last_listened": "05 Apr 2026, 19:00",
        "track": "The Dream",
        "album": "A Foul Form",
        "artist_url": "https://www.last.fm/user/sugarsmax/library/music/Osees",
        "track_url": "https://www.last.fm/music/Osees/_/The+Dream",
        "graduated": False,
    },
    "nala sinephro": {
        "artist": "Nala Sinephro",
        "first_discovered": "15 Feb 2026, 14:45",
        "last_listened": "01 Apr 2026, 11:00",
        "track": "Space 1.8",
        "album": "Space 1.8",
        "artist_url": "https://www.last.fm/user/sugarsmax/library/music/Nala+Sinephro",
        "track_url": "https://www.last.fm/music/Nala+Sinephro/_/Space+1.8",
        "graduated": False,
    },
}

# Simulated playcount for discovery artists (key -> playcount)
SAMPLE_PLAYCOUNTS = {
    "mdou moctar": 87,
    "yussef dayes": 63,
    "arooj aftab": 120,
    "osees": 31,          # below 50 -- will not qualify
    "nala sinephro": 18,  # below 50 -- will not qualify
}

# Simulated user all-time top tracks: (artist_key, title, playcount)
SAMPLE_TOP_TRACKS = [
    ("mdou moctar", "Afrique Victime", 22),
    ("mdou moctar", "Chismiten", 18),
    ("mdou moctar", "Tala Tannam", 15),
    ("mdou moctar", "Bismilahi Atagah", 10),
    ("yussef dayes", "Black Classical Music", 19),
    ("yussef dayes", "Vibe 5000", 12),
    ("yussef dayes", "Tonight Is the Night", 9),
    ("arooj aftab", "Mohabbat", 31),
    ("arooj aftab", "Last Night", 24),
    ("arooj aftab", "Udhero Na", 17),
    ("arooj aftab", "Saans Lo", 12),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

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


def build_track_url(artist_name: str, track_name: str) -> str:
    """Build the Last.fm track URL using plus-encoded paths."""
    encoded_artist = urllib.parse.quote_plus(artist_name, safe=":'")
    encoded_track = urllib.parse.quote_plus(track_name, safe=":'")
    return f"https://www.last.fm/music/{encoded_artist}/_/{encoded_track}"


def load_state() -> dict:
    """Load saved state for resuming an interrupted run."""
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
    """Clear saved state after a successful run."""
    if STATE_FILE.exists():
        STATE_FILE.unlink()


def load_discovery_catalog() -> dict:
    """Load the existing discovery catalog. Raises if not found."""
    if not CATALOG_FILE.exists():
        raise FileNotFoundError(
            f"Discovery catalog not found: {CATALOG_FILE}\n"
            "Run update_catalog.py first to generate it."
        )
    with open(CATALOG_FILE, "r") as f:
        return json.load(f)


def save_familiar_catalog(catalog: dict) -> None:
    """Write the familiar catalog JSON."""
    FAMILIAR_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(FAMILIAR_FILE, "w", encoding="utf-8") as f:
        json.dump(catalog, f, indent=2, ensure_ascii=False)


# ---------------------------------------------------------------------------
# API fetches
# ---------------------------------------------------------------------------

def fetch_top_artists_with_counts(
    username: str,
    limit: int = 2000,
    dry_run: bool = False,
    cached_state: dict | None = None,
) -> dict[str, int]:
    """
    Fetch the user's all-time top artists with per-artist playcount.

    Uses a higher limit than the discovery catalog script (which uses 1000)
    so that artists outside the top 1000 (the discovery cohort) are included.

    Returns:
        Dict mapping lowercase artist name -> total scrobble count
    """
    if dry_run:
        print(f"[DRY-RUN] Would fetch top {limit} artists with playcounts for: {username}")
        print(f"[DRY-RUN] Returning {len(SAMPLE_PLAYCOUNTS)} sample entries")
        return dict(SAMPLE_PLAYCOUNTS)

    if cached_state and "top_artists_counts" in cached_state:
        cached = cached_state["top_artists_counts"]
        cached_time = datetime.fromisoformat(cached["fetched_at"])
        age_hours = (datetime.now(PACIFIC) - cached_time).total_seconds() / 3600
        if age_hours < 24:
            print(f"Using cached top artist counts (fetched {age_hours:.1f}h ago)")
            return cached["data"]
        print("Cached top artist counts are stale, re-fetching...")

    print(f"Fetching top {limit} artists with playcounts for: {username}")

    try:
        network = get_lastfm_network()
        user = network.get_user(username)
        top_artists = user.get_top_artists(
            period=pylast.PERIOD_OVERALL,
            limit=limit,
        )
        counts = {}
        for item in top_artists:
            key = str(item.item).lower()
            try:
                counts[key] = int(item.weight)
            except (ValueError, TypeError):
                counts[key] = 0
        print(f"Fetched playcounts for {len(counts)} artists")
        return counts

    except pylast.WSError as e:
        print(f"Last.fm API error: {e}")
        return {}
    except Exception as e:
        print(f"Error fetching top artists: {e}")
        import traceback
        traceback.print_exc()
        return {}


def fetch_user_top_tracks(
    username: str,
    limit: int = 500,
    dry_run: bool = False,
    cached_state: dict | None = None,
) -> list[dict]:
    """
    Fetch the user's all-time top tracks, ordered by playcount descending.

    Returns:
        List of dicts with keys: artist_key, artist, title, playcount, url
    """
    if dry_run:
        print(f"[DRY-RUN] Would fetch top {limit} tracks for: {username}")
        result = []
        for artist_key, title, playcount in SAMPLE_TOP_TRACKS:
            artist_display = " ".join(w.capitalize() for w in artist_key.split())
            result.append({
                "artist_key": artist_key,
                "artist": artist_display,
                "title": title,
                "playcount": playcount,
                "url": build_track_url(artist_display, title),
            })
        print(f"[DRY-RUN] Returning {len(result)} sample top tracks")
        return result

    if cached_state and "top_tracks" in cached_state:
        cached = cached_state["top_tracks"]
        cached_time = datetime.fromisoformat(cached["fetched_at"])
        age_hours = (datetime.now(PACIFIC) - cached_time).total_seconds() / 3600
        if age_hours < 24:
            print(f"Using cached top tracks (fetched {age_hours:.1f}h ago)")
            return cached["data"]
        print("Cached top tracks are stale, re-fetching...")

    print(f"Fetching top {limit} tracks for: {username}")

    try:
        network = get_lastfm_network()
        user = network.get_user(username)
        top_tracks = user.get_top_tracks(
            period=pylast.PERIOD_OVERALL,
            limit=limit,
        )
        result = []
        for item in top_tracks:
            artist_name = str(item.item.artist)
            track_title = str(item.item.title)
            try:
                playcount = int(item.weight)
            except (ValueError, TypeError):
                playcount = 0
            result.append({
                "artist_key": artist_name.lower(),
                "artist": artist_name,
                "title": track_title,
                "playcount": playcount,
                "url": build_track_url(artist_name, track_title),
            })
        print(f"Fetched {len(result)} top tracks")
        return result

    except pylast.WSError as e:
        print(f"Last.fm API error: {e}")
        return []
    except Exception as e:
        print(f"Error fetching top tracks: {e}")
        import traceback
        traceback.print_exc()
        return []


# ---------------------------------------------------------------------------
# Core logic
# ---------------------------------------------------------------------------

def build_familiar_catalog(
    discovery_catalog: dict,
    artist_counts: dict[str, int],
    user_top_tracks: list[dict],
    username: str,
    min_scrobbles: int = 50,
) -> tuple[dict, dict]:
    """
    Cross-reference the discovery catalog against playcount and top-track data.

    Args:
        discovery_catalog: Loaded discovery_catalog.json
        artist_counts: Map of lowercase artist name -> playcount
        user_top_tracks: User's all-time top tracks (descending playcount)
        username: Last.fm username
        min_scrobbles: Minimum playcount to qualify for this page

    Returns:
        (familiar_catalog dict, stats dict)
    """
    stats = {
        "discovery_artists": len(discovery_catalog["catalog"]),
        "qualifying_artists": 0,
        "skipped_below_threshold": 0,
        "skipped_no_playcount": 0,
    }

    # Build lookup: artist_key -> list of top tracks (sorted desc by playcount)
    tracks_by_artist: dict[str, list[dict]] = {}
    for track in user_top_tracks:
        key = track["artist_key"]
        tracks_by_artist.setdefault(key, []).append(track)
    for key in tracks_by_artist:
        tracks_by_artist[key].sort(key=lambda t: t["playcount"], reverse=True)

    artists_out = {}
    for key, entry in discovery_catalog["catalog"].items():
        playcount = artist_counts.get(key)

        if playcount is None:
            # Not found even in the extended top-artist list -- playcount is negligible
            stats["skipped_no_playcount"] += 1
            continue

        if playcount < min_scrobbles:
            stats["skipped_below_threshold"] += 1
            continue

        top3 = [
            {"title": t["title"], "url": t["url"]}
            for t in tracks_by_artist.get(key, [])[:3]
        ]

        artists_out[key] = {
            "artist": entry["artist"],
            "artist_url": entry["artist_url"],
            "playcount": playcount,
            "recent_track": entry["track"],
            "recent_track_url": entry["track_url"],
            "last_seen": entry["last_listened"],
            "top_tracks": top3,
        }
        stats["qualifying_artists"] += 1

    familiar_catalog = {
        "metadata": {
            "last_updated": datetime.now(PACIFIC).isoformat(),
            "username": username,
            "total_artists": len(artists_out),
            "min_scrobbles": min_scrobbles,
        },
        "artists": artists_out,
    }
    return familiar_catalog, stats


def print_results(stats: dict, familiar_catalog: dict) -> None:
    """Print formatted results to the console."""
    print()
    print("=" * 72)
    print("  Familiar Artist Deep Cuts -- Results")
    print("=" * 72)
    print()
    print(f"  Discovery catalog size:              {stats['discovery_artists']:>5}")
    print(f"  No playcount data (very low plays):  {stats['skipped_no_playcount']:>5}")
    print(f"  Below threshold (< min scrobbles):   {stats['skipped_below_threshold']:>5}")
    print(f"  Qualifying artists:                  {stats['qualifying_artists']:>5}")
    print()

    artists = list(familiar_catalog["artists"].values())
    if not artists:
        print("  No qualifying artists found.")
        print("=" * 72)
        return

    artists.sort(key=lambda a: a["playcount"], reverse=True)

    max_name = max(len(a["artist"]) for a in artists)
    name_w = min(max(max_name, 6), 28)

    print(f"  {'Artist':<{name_w}}  {'Plays':>6}  Top Tracks")
    print(f"  {'-' * name_w}  {'-' * 6}  {'-' * 36}")

    for a in artists:
        name = a["artist"]
        if len(name) > name_w:
            name = name[:name_w - 1] + "\u2026"
        tracks_str = ", ".join(t["title"] for t in a["top_tracks"]) or "(none in top 500)"
        if len(tracks_str) > 40:
            tracks_str = tracks_str[:39] + "\u2026"
        print(f"  {name:<{name_w}}  {a['playcount']:>6}  {tracks_str}")

    print("=" * 72)


def main():
    parser = argparse.ArgumentParser(
        description=(
            "Find discovery catalog artists with significant listening history "
            "and list their top 3 tracks."
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
        "--min-scrobbles", "-m",
        type=int,
        default=50,
        help="Minimum total scrobbles for an artist to qualify (default: 50)",
    )
    parser.add_argument(
        "--top-artist-limit",
        type=int,
        default=2000,
        help="How many top artists to fetch for playcount lookup (default: 2000)",
    )
    parser.add_argument(
        "--top-track-limit",
        type=int,
        default=500,
        help="How many top tracks to fetch for top-3 lookup (default: 500)",
    )
    parser.add_argument(
        "--no-cache",
        action="store_true",
        help="Ignore cached API results and re-fetch everything",
    )

    args = parser.parse_args()
    state = {} if args.no_cache else load_state()

    print("=" * 72)
    print("  Familiar Artist Deep Cuts")
    print("=" * 72)
    print(f"  Username:           {args.username}")
    print(f"  Min scrobbles:      {args.min_scrobbles}")
    print(f"  Top artist limit:   {args.top_artist_limit}")
    print(f"  Top track limit:    {args.top_track_limit}")
    print(f"  Mode:               {'DRY-RUN' if args.dry_run else 'LIVE'}")
    if state:
        print(f"  Cached state:       Yes (use --no-cache to ignore)")
    print("=" * 72)
    print()

    # Step 1: Load discovery catalog
    print("Step 1/4: Loading discovery catalog...")
    if args.dry_run:
        print("[DRY-RUN] Using sample catalog entries")
        discovery_catalog = {
            "metadata": {"username": args.username},
            "catalog": SAMPLE_CATALOG_ENTRIES,
        }
    else:
        discovery_catalog = load_discovery_catalog()
    print(f"  Loaded {len(discovery_catalog['catalog'])} catalog entries.")

    # Step 2: Fetch top artists with playcounts
    print("\nStep 2/4: Fetching top artist playcounts...")
    artist_counts = fetch_top_artists_with_counts(
        username=args.username,
        limit=args.top_artist_limit,
        dry_run=args.dry_run,
        cached_state=state,
    )
    if not artist_counts and not args.dry_run:
        print("Warning: No artist playcount data returned.")

    if not args.dry_run and "top_artists_counts" not in state:
        state["top_artists_counts"] = {
            "fetched_at": datetime.now(PACIFIC).isoformat(),
            "data": artist_counts,
        }
        save_state(state)
        print("  (Cached top artist counts to familiar_state.json)")

    # Step 3: Fetch user top tracks
    print("\nStep 3/4: Fetching user top tracks...")
    user_top_tracks = fetch_user_top_tracks(
        username=args.username,
        limit=args.top_track_limit,
        dry_run=args.dry_run,
        cached_state=state,
    )
    if not user_top_tracks and not args.dry_run:
        print("Warning: No top track data returned.")

    if not args.dry_run and "top_tracks" not in state:
        state["top_tracks"] = {
            "fetched_at": datetime.now(PACIFIC).isoformat(),
            "data": user_top_tracks,
        }
        save_state(state)
        print("  (Cached top tracks to familiar_state.json)")

    # Step 4: Build familiar catalog
    print("\nStep 4/4: Building familiar catalog...")
    familiar_catalog, stats = build_familiar_catalog(
        discovery_catalog=discovery_catalog,
        artist_counts=artist_counts,
        user_top_tracks=user_top_tracks,
        username=args.username,
        min_scrobbles=args.min_scrobbles,
    )

    print_results(stats, familiar_catalog)

    if not args.dry_run:
        save_familiar_catalog(familiar_catalog)
        print(f"\nSaved familiar catalog to: {FAMILIAR_FILE}")
        clear_state()
        print("State cleared (run complete).")
    else:
        print(f"\n[DRY-RUN] Would save familiar catalog to: {FAMILIAR_FILE}")

    print("\nDone!")


if __name__ == "__main__":
    main()
