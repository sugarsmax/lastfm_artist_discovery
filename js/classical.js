/**
 * Classical Composer Detector
 *
 * Reads discovery_catalog.json and surfaces entries where a classical
 * composer's name appears in the track title or album name, but the
 * performing artist is not that composer.
 */

// Each entry: { name, fullName, alternatives }
// `name` is the short last-name key used for deduplication and artist matching.
// `fullName` is the proper display name shown in pills and the filter dropdown.
// `alternatives` covers alternate spellings / first-name combos found in metadata.
const COMPOSERS = [
  { name: "Bach",             fullName: "Johann Sebastian Bach",      alternatives: ["J.S. Bach", "J. S. Bach"] },
  { name: "Beethoven",        fullName: "Ludwig van Beethoven",       alternatives: ["L. van Beethoven"] },
  { name: "Mozart",           fullName: "Wolfgang Amadeus Mozart",    alternatives: ["W.A. Mozart", "W. A. Mozart"] },
  { name: "Chopin",           fullName: "Frédéric Chopin",            alternatives: ["Frederic Chopin"] },
  { name: "Brahms",           fullName: "Johannes Brahms",            alternatives: [] },
  { name: "Schubert",         fullName: "Franz Schubert",             alternatives: [] },
  { name: "Handel",           fullName: "George Frideric Handel",     alternatives: ["G.F. Handel", "G. F. Handel"] },
  { name: "Vivaldi",          fullName: "Antonio Vivaldi",            alternatives: [] },
  { name: "Haydn",            fullName: "Joseph Haydn",               alternatives: ["Franz Joseph Haydn"] },
  { name: "Tchaikovsky",      fullName: "Pyotr Ilyich Tchaikovsky",   alternatives: ["Peter Tchaikovsky"] },
  { name: "Debussy",          fullName: "Claude Debussy",             alternatives: [] },
  { name: "Ravel",            fullName: "Maurice Ravel",              alternatives: [] },
  { name: "Liszt",            fullName: "Franz Liszt",                alternatives: [] },
  { name: "Mahler",           fullName: "Gustav Mahler",              alternatives: [] },
  { name: "Bruckner",         fullName: "Anton Bruckner",             alternatives: [] },
  { name: "Schumann",         fullName: "Robert Schumann",            alternatives: ["Clara Schumann"] },
  { name: "Mendelssohn",      fullName: "Felix Mendelssohn",          alternatives: [] },
  { name: "Dvorak",           fullName: "Antonín Dvořák",             alternatives: ["Dvořák", "Antonin Dvorak"] },
  { name: "Sibelius",         fullName: "Jean Sibelius",              alternatives: [] },
  { name: "Prokofiev",        fullName: "Sergei Prokofiev",           alternatives: [] },
  { name: "Shostakovich",     fullName: "Dmitri Shostakovich",        alternatives: [] },
  { name: "Rachmaninoff",     fullName: "Sergei Rachmaninoff",        alternatives: ["Rachmaninov"] },
  { name: "Stravinsky",       fullName: "Igor Stravinsky",            alternatives: [] },
  { name: "Bartok",           fullName: "Béla Bartók",                alternatives: ["Bartók", "Bela Bartok"] },
  { name: "Satie",            fullName: "Erik Satie",                 alternatives: [] },
  { name: "Puccini",          fullName: "Giacomo Puccini",            alternatives: [] },
  { name: "Verdi",            fullName: "Giuseppe Verdi",             alternatives: [] },
  { name: "Wagner",           fullName: "Richard Wagner",             alternatives: [] },
  { name: "Strauss",          fullName: "Richard Strauss",            alternatives: ["Johann Strauss"] },
  { name: "Monteverdi",       fullName: "Claudio Monteverdi",         alternatives: [] },
  { name: "Telemann",         fullName: "Georg Philipp Telemann",     alternatives: [] },
  { name: "Purcell",          fullName: "Henry Purcell",              alternatives: [] },
  { name: "Corelli",          fullName: "Arcangelo Corelli",          alternatives: [] },
  { name: "Scarlatti",        fullName: "Domenico Scarlatti",         alternatives: ["Alessandro Scarlatti"] },
  { name: "Rameau",           fullName: "Jean-Philippe Rameau",       alternatives: [] },
  { name: "Paganini",         fullName: "Niccolò Paganini",           alternatives: ["Niccolo Paganini"] },
  { name: "Berlioz",          fullName: "Hector Berlioz",             alternatives: [] },
  { name: "Rossini",          fullName: "Gioachino Rossini",          alternatives: [] },
  { name: "Saint-Saëns",      fullName: "Camille Saint-Saëns",        alternatives: ["Saint-Saens"] },
  { name: "Fauré",            fullName: "Gabriel Fauré",              alternatives: ["Faure"] },
  { name: "Grieg",            fullName: "Edvard Grieg",               alternatives: [] },
  { name: "Elgar",            fullName: "Edward Elgar",               alternatives: [] },
  { name: "Holst",            fullName: "Gustav Holst",               alternatives: [] },
  { name: "Vaughan Williams", fullName: "Ralph Vaughan Williams",     alternatives: [] },
  { name: "Britten",          fullName: "Benjamin Britten",           alternatives: [] },
  { name: "Copland",          fullName: "Aaron Copland",              alternatives: [] },
  { name: "Messiaen",         fullName: "Olivier Messiaen",           alternatives: [] },
  { name: "Webern",           fullName: "Anton Webern",               alternatives: [] },
  { name: "Berg",             fullName: "Alban Berg",                 alternatives: [] },
  { name: "Schoenberg",       fullName: "Arnold Schoenberg",          alternatives: ["Schönberg", "Arnold Schönberg"] },
  { name: "Orff",             fullName: "Carl Orff",                  alternatives: [] },
  { name: "Janacek",          fullName: "Leoš Janáček",               alternatives: ["Janáček"] },
  { name: "Mussorgsky",       fullName: "Modest Mussorgsky",          alternatives: ["Moussorgsky"] },
  { name: "Rimsky-Korsakov",  fullName: "Nikolai Rimsky-Korsakov",    alternatives: ["Rimsky Korsakov"] },
  { name: "Borodin",          fullName: "Alexander Borodin",          alternatives: [] },
  { name: "Scriabin",         fullName: "Alexander Scriabin",         alternatives: [] },
  { name: "Boccherini",       fullName: "Luigi Boccherini",           alternatives: [] },
  { name: "Gluck",            fullName: "Christoph Willibald Gluck",  alternatives: [] },
];

// Build a flat list of { pattern, key, fullName } for matching.
// `key` (short last name) is used for deduplication; `fullName` is shown in the UI.
function buildComposerPatterns() {
  const patterns = [];
  for (const composer of COMPOSERS) {
    const terms = [composer.name, ...composer.alternatives];
    for (const term of terms) {
      // Escape regex special chars, then wrap in word boundaries
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      patterns.push({
        pattern: new RegExp(`\\b${escaped}\\b`, "i"),
        key: composer.name,
        fullName: composer.fullName,
      });
    }
  }
  return patterns;
}

const COMPOSER_PATTERNS = buildComposerPatterns();

/**
 * Returns an array of { key, fullName } objects for composers found in text.
 * Deduplicates so each composer appears at most once (by key).
 */
function detectComposers(text) {
  if (!text) return [];
  const seen = new Map(); // key -> fullName
  for (const { pattern, key, fullName } of COMPOSER_PATTERNS) {
    if (!seen.has(key) && pattern.test(text)) {
      seen.set(key, fullName);
    }
  }
  return [...seen.entries()].map(([key, fullName]) => ({ key, fullName }));
}

/**
 * Returns true if the artist name appears to be the composer themselves
 * (e.g. "Beethoven" performing "Beethoven: Sonata").
 * Matches on the short key name, not the full name.
 */
function artistIsComposer(artistName, composers) {
  const lowerArtist = artistName.toLowerCase();
  return composers.some(c => lowerArtist.includes(c.key.toLowerCase()));
}

// ---------------------------------------------------------------------------
// Page logic
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  const grid = document.getElementById("classicalGrid");
  const searchInput = document.getElementById("searchInput");
  const sortSelect = document.getElementById("sortSelect");
  const composerSelect = document.getElementById("composerSelect");

  let allMatches = [];  // { item, composers, matchSource }

  fetch("data/discovery_catalog.json")
    .then(response => response.json())
    .then(data => {
      const entries = Object.values(data.catalog);
      allMatches = buildMatches(entries);

      updateHeader(allMatches, data.metadata);
      populateComposerFilter(allMatches);
      renderGrid();
    })
    .catch(error => {
      console.error("Error loading catalog:", error);
      grid.innerHTML = `<div class="loading">Failed to load catalog. Ensure you are running a local server.</div>`;
    });

  searchInput.addEventListener("input", renderGrid);
  sortSelect.addEventListener("change", renderGrid);
  composerSelect.addEventListener("change", renderGrid);

  function buildMatches(entries) {
    const matches = [];
    for (const item of entries) {
      const trackComposers = detectComposers(item.track || "");
      const albumComposers = detectComposers(item.album || "");

      // Merge and deduplicate by key
      const seen = new Map();
      for (const c of [...trackComposers, ...albumComposers]) {
        if (!seen.has(c.key)) seen.set(c.key, c);
      }
      const allComposers = [...seen.values()]; // array of { key, fullName }
      if (allComposers.length === 0) continue;

      // Determine where each composer was found (keyed by short key)
      const sources = {};
      for (const c of allComposers) {
        const inTrack = trackComposers.some(t => t.key === c.key);
        const inAlbum = albumComposers.some(a => a.key === c.key);
        if (inTrack && inAlbum) sources[c.key] = "track & album";
        else if (inTrack) sources[c.key] = "track";
        else sources[c.key] = "album";
      }

      const performerIsComposer = artistIsComposer(item.artist, allComposers);

      matches.push({ item, composers: allComposers, sources, performerIsComposer });
    }
    return matches;
  }

  function updateHeader(matches, metadata) {
    const statsBar = document.getElementById("stats");
    const nonComposerCount = matches.filter(m => !m.performerIsComposer).length;
    const composerKeySet = new Set(matches.flatMap(m => m.composers.map(c => c.key)));

    statsBar.innerHTML = `
      <div class="stat-item">Classical Matches: <span>${matches.length}</span></div>
      <div class="stat-item">Unique Composers: <span>${composerKeySet.size}</span></div>
      <div class="stat-item">Performed by Others: <span>${nonComposerCount}</span></div>
    `;

    const lastUpdated = document.getElementById("lastUpdated");
    const date = new Date(metadata.last_updated);
    lastUpdated.textContent = `Catalog last updated: ${date.toLocaleString()}`;
  }

  function populateComposerFilter(matches) {
    // Build a map of key -> fullName, then sort by fullName for the dropdown
    const composerMap = new Map();
    for (const { composers } of matches) {
      for (const c of composers) {
        composerMap.set(c.key, c.fullName);
      }
    }
    const sorted = [...composerMap.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    for (const [key, fullName] of sorted) {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = fullName;
      composerSelect.appendChild(opt);
    }
  }

  function renderGrid() {
    const searchTerm = searchInput.value.toLowerCase();
    const sortMode = sortSelect.value;
    const filterComposer = composerSelect.value;

    let filtered = allMatches.filter(({ item, composers }) => {
      if (filterComposer && !composers.some(c => c.key === filterComposer)) return false;
      if (searchTerm) {
        return (
          item.artist.toLowerCase().includes(searchTerm) ||
          (item.track || "").toLowerCase().includes(searchTerm) ||
          (item.album || "").toLowerCase().includes(searchTerm) ||
          composers.some(c => c.fullName.toLowerCase().includes(searchTerm))
        );
      }
      return true;
    });

    filtered.sort((a, b) => {
      if (sortMode === "last_listened") {
        return new Date(b.item.last_listened) - new Date(a.item.last_listened);
      } else if (sortMode === "first_discovered") {
        return new Date(b.item.first_discovered) - new Date(a.item.first_discovered);
      } else if (sortMode === "artist_asc") {
        return a.item.artist.localeCompare(b.item.artist);
      } else if (sortMode === "composer_asc") {
        return a.composers[0].fullName.localeCompare(b.composers[0].fullName);
      }
      return 0;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `<div class="loading">No classical matches found.</div>`;
      return;
    }

    grid.innerHTML = filtered.map(({ item, composers, sources, performerIsComposer }) => {
      const composerPills = composers.map(c => {
        const src = sources[c.key];
        return `<span class="composer-pill" title="Found in ${src}">${c.fullName}</span>`;
      }).join(" ");

      const performerNote = performerIsComposer
        ? `<span class="badge badge-composer-match" title="Artist name matches the detected composer">Composer as Performer</span>`
        : `<span class="badge badge-performer">Performer</span>`;

      const albumLine = item.album
        ? `<div class="album-name">&#9836; ${item.album}</div>`
        : "";

      const lastDateStr = (item.last_listened || "").replace(" 2026", "");
      const firstDateStr = (item.first_discovered || "").replace(" 2026", "");

      return `
        <div class="card ${performerIsComposer ? "card-composer-match" : ""}">
          <div class="card-header">
            <a href="${item.artist_url}" target="_blank" class="artist-name">${item.artist}</a>
            ${performerNote}
          </div>
          <div class="card-body">
            <div class="track-info">
              <div class="track-label">Track</div>
              <a href="${item.track_url}" target="_blank" class="track-name">${item.track || "—"}</a>
            </div>
            ${albumLine}
            <div class="composer-row">
              <span class="track-label">Detected Composer(s)</span>
              <div class="composer-pills">${composerPills}</div>
            </div>
          </div>
          <div class="meta-info">
            <div class="meta-row">
              <span>Discovered:</span>
              <span>${firstDateStr}</span>
            </div>
            <div class="meta-row">
              <span>Last Played:</span>
              <span>${lastDateStr}</span>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }
});
