/**
 * Old Favorites
 *
 * Reads familiar_catalog.json and renders a card for every non-graduated
 * discovery artist. Cards show the most recently heard track and the user's
 * personal top 3 all-time tracks for that artist (where available).
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
    const withTracks = allArtists.filter(a => a.top_tracks && a.top_tracks.length > 0).length;
    statsBar.innerHTML = `
      <div class="stat-item">Discovery Artists: <span>${metadata.total_artists}</span></div>
      <div class="stat-item">With Top Tracks: <span>${withTracks}</span></div>
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
      if (sortMode === "last_seen") {
        return new Date(b.last_seen) - new Date(a.last_seen);
      } else if (sortMode === "first_discovered") {
        return new Date(b.first_discovered) - new Date(a.first_discovered);
      } else if (sortMode === "artist_asc") {
        return a.artist.localeCompare(b.artist);
      } else if (sortMode === "top_tracks") {
        return (b.top_tracks || []).length - (a.top_tracks || []).length;
      }
      return 0;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `<div class="loading">No artists found matching your search.</div>`;
      return;
    }

    grid.innerHTML = filtered.map(artist => {
      const lastSeenStr = (artist.last_seen || "").replace(" 2026", "");

      const hasTopTracks = artist.top_tracks && artist.top_tracks.length > 0;
      const badgeText = hasTopTracks ? `${artist.top_tracks.length} top tracks` : "No top tracks";
      const badgeClass = hasTopTracks ? "badge-playcount" : "badge-no-tracks";

      const topTracksHtml = hasTopTracks
        ? `<ol class="top-tracks-list">
            ${artist.top_tracks.map(t =>
              `<li><a href="${t.url}" target="_blank" class="top-track-link">${t.title}</a></li>`
            ).join("")}
          </ol>`
        : `<p class="top-tracks-empty">No tracks in your top 500</p>`;

      return `
        <div class="card">
          <div class="card-header">
            <a href="${artist.artist_url}" target="_blank" class="artist-name">${artist.artist}</a>
            <span class="badge ${badgeClass}">${badgeText}</span>
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
