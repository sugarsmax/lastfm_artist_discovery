/**
 * Old Favorites
 *
 * Reads familiar_catalog.json and renders cards for discovery-catalog artists
 * who have 50+ total scrobbles. Each card shows the artist's total playcount,
 * the track most recently heard, and their top 3 tracks from all-time history.
 */

document.addEventListener("DOMContentLoaded", () => {
  const grid = document.getElementById("familiarGrid");
  const searchInput = document.getElementById("searchInput");
  const sortSelect = document.getElementById("sortSelect");

  let allArtists = [];
  let metadata = {};

  fetch("data/familiar_catalog.json")
    .then(response => response.json())
    .then(data => {
      metadata = data.metadata;
      allArtists = Object.values(data.artists);

      updateHeader();
      renderGrid();
    })
    .catch(error => {
      console.error("Error loading familiar catalog:", error);
      grid.innerHTML = `<div class="loading">Failed to load catalog. Ensure you are running a local server.</div>`;
    });

  searchInput.addEventListener("input", renderGrid);
  sortSelect.addEventListener("change", renderGrid);

  function updateHeader() {
    const statsBar = document.getElementById("stats");
    const threshold = metadata.min_scrobbles || 50;
    statsBar.innerHTML = `
      <div class="stat-item">Old Favorites: <span>${metadata.total_artists}</span></div>
      <div class="stat-item">Scrobble threshold: <span>${threshold}+</span></div>
    `;

    const lastUpdated = document.getElementById("lastUpdated");
    if (metadata.last_updated) {
      const date = new Date(metadata.last_updated);
      lastUpdated.textContent = `Last updated: ${date.toLocaleString()}`;
    }
  }

  function renderGrid() {
    const searchTerm = searchInput.value.toLowerCase();
    const sortMode = sortSelect.value;

    let filtered = allArtists.filter(artist => {
      if (!searchTerm) return true;
      const trackTitles = (artist.top_tracks || []).map(t => t.title.toLowerCase()).join(" ");
      return (
        artist.artist.toLowerCase().includes(searchTerm) ||
        (artist.recent_track || "").toLowerCase().includes(searchTerm) ||
        trackTitles.includes(searchTerm)
      );
    });

    filtered.sort((a, b) => {
      if (sortMode === "playcount") {
        return b.playcount - a.playcount;
      } else if (sortMode === "last_seen") {
        return new Date(b.last_seen) - new Date(a.last_seen);
      } else if (sortMode === "artist_asc") {
        return a.artist.localeCompare(b.artist);
      }
      return 0;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `<div class="loading">No artists found matching your search.</div>`;
      return;
    }

    grid.innerHTML = filtered.map(artist => {
      const lastSeenStr = (artist.last_seen || "").replace(" 2026", "");

      const topTracksHtml = (artist.top_tracks || []).length > 0
        ? `<ol class="top-tracks-list">
            ${artist.top_tracks.map(t =>
              `<li><a href="${t.url}" target="_blank" class="top-track-link">${t.title}</a></li>`
            ).join("")}
          </ol>`
        : `<p class="top-tracks-empty">No top tracks found</p>`;

      return `
        <div class="card">
          <div class="card-header">
            <a href="${artist.artist_url}" target="_blank" class="artist-name">${artist.artist}</a>
            <span class="badge badge-playcount">${artist.playcount} plays</span>
          </div>
          <div class="card-body">
            <div class="track-info">
              <div class="track-label">Recently Heard</div>
              <a href="${artist.recent_track_url}" target="_blank" class="track-name">${artist.recent_track}</a>
            </div>
            <div class="top-tracks-section">
              <div class="track-label">Your Top Tracks</div>
              ${topTracksHtml}
            </div>
          </div>
          <div class="meta-info">
            <div class="meta-row">
              <span>Last Seen:</span>
              <span>${lastSeenStr}</span>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }
});
