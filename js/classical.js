/**
 * Classical Composer Detector
 *
 * Reads discovery_catalog.json and surfaces entries where a classical
 * composer's name appears in the track title or album name, but the
 * performing artist is not that composer.
 */

// Each entry: { name, alternatives }
// `name` is the canonical last name used for matching and display.
// `alternatives` covers alternate spellings / first-name combos that
// appear in album/track metadata in the wild.
const COMPOSERS = [
  { name: "Bach",             alternatives: ["J.S. Bach", "Johann Sebastian Bach", "J. S. Bach"] },
  { name: "Beethoven",        alternatives: ["Ludwig van Beethoven", "L. van Beethoven"] },
  { name: "Mozart",           alternatives: ["W.A. Mozart", "Wolfgang Amadeus Mozart", "W. A. Mozart"] },
  { name: "Chopin",           alternatives: ["Frédéric Chopin", "Frederic Chopin"] },
  { name: "Brahms",           alternatives: ["Johannes Brahms"] },
  { name: "Schubert",         alternatives: ["Franz Schubert"] },
  { name: "Handel",           alternatives: ["G.F. Handel", "George Frideric Handel"] },
  { name: "Vivaldi",          alternatives: ["Antonio Vivaldi"] },
  { name: "Haydn",            alternatives: ["Franz Joseph Haydn", "Joseph Haydn"] },
  { name: "Tchaikovsky",      alternatives: ["Pyotr Ilyich Tchaikovsky", "Peter Tchaikovsky"] },
  { name: "Debussy",          alternatives: ["Claude Debussy"] },
  { name: "Ravel",            alternatives: ["Maurice Ravel"] },
  { name: "Liszt",            alternatives: ["Franz Liszt"] },
  { name: "Mahler",           alternatives: ["Gustav Mahler"] },
  { name: "Bruckner",         alternatives: ["Anton Bruckner"] },
  { name: "Schumann",         alternatives: ["Robert Schumann", "Clara Schumann"] },
  { name: "Mendelssohn",      alternatives: ["Felix Mendelssohn"] },
  { name: "Dvorak",           alternatives: ["Dvořák", "Antonín Dvořák", "Antonin Dvorak"] },
  { name: "Sibelius",         alternatives: ["Jean Sibelius"] },
  { name: "Prokofiev",        alternatives: ["Sergei Prokofiev"] },
  { name: "Shostakovich",     alternatives: ["Dmitri Shostakovich"] },
  { name: "Rachmaninoff",     alternatives: ["Rachmaninov", "Sergei Rachmaninoff"] },
  { name: "Stravinsky",       alternatives: ["Igor Stravinsky"] },
  { name: "Bartok",           alternatives: ["Bartók", "Béla Bartók", "Bela Bartok"] },
  { name: "Satie",            alternatives: ["Erik Satie"] },
  { name: "Puccini",          alternatives: ["Giacomo Puccini"] },
  { name: "Verdi",            alternatives: ["Giuseppe Verdi"] },
  { name: "Wagner",           alternatives: ["Richard Wagner"] },
  { name: "Strauss",          alternatives: ["Richard Strauss", "Johann Strauss"] },
  { name: "Monteverdi",       alternatives: ["Claudio Monteverdi"] },
  { name: "Telemann",         alternatives: ["Georg Philipp Telemann"] },
  { name: "Purcell",          alternatives: ["Henry Purcell"] },
  { name: "Corelli",          alternatives: ["Arcangelo Corelli"] },
  { name: "Scarlatti",        alternatives: ["Domenico Scarlatti", "Alessandro Scarlatti"] },
  { name: "Rameau",           alternatives: ["Jean-Philippe Rameau"] },
  { name: "Paganini",         alternatives: ["Niccolò Paganini", "Niccolo Paganini"] },
  { name: "Berlioz",          alternatives: ["Hector Berlioz"] },
  { name: "Rossini",          alternatives: ["Gioachino Rossini"] },
  { name: "Saint-Saëns",      alternatives: ["Saint-Saens", "Camille Saint-Saëns"] },
  { name: "Fauré",            alternatives: ["Faure", "Gabriel Fauré"] },
  { name: "Grieg",            alternatives: ["Edvard Grieg"] },
  { name: "Elgar",            alternatives: ["Edward Elgar"] },
  { name: "Holst",            alternatives: ["Gustav Holst"] },
  { name: "Vaughan Williams", alternatives: ["Ralph Vaughan Williams"] },
  { name: "Britten",          alternatives: ["Benjamin Britten"] },
  { name: "Copland",          alternatives: ["Aaron Copland"] },
  { name: "Messiaen",         alternatives: ["Olivier Messiaen"] },
  { name: "Webern",           alternatives: ["Anton Webern"] },
  { name: "Berg",             alternatives: ["Alban Berg"] },
  { name: "Schoenberg",       alternatives: ["Schönberg", "Arnold Schoenberg", "Arnold Schönberg"] },
  { name: "Orff",             alternatives: ["Carl Orff"] },
  { name: "Janacek",          alternatives: ["Janáček", "Leoš Janáček"] },
  { name: "Mussorgsky",       alternatives: ["Moussorgsky", "Modest Mussorgsky"] },
  { name: "Rimsky-Korsakov",  alternatives: ["Rimsky Korsakov", "Nikolai Rimsky-Korsakov"] },
  { name: "Borodin",          alternatives: ["Alexander Borodin"] },
  { name: "Scriabin",         alternatives: ["Alexander Scriabin"] },
  { name: "Boccherini",       alternatives: ["Luigi Boccherini"] },
  { name: "Gluck",            alternatives: ["Christoph Willibald Gluck"] },
];

// Build a flat list of { pattern: RegExp, displayName, composerEntry } for matching
function buildComposerPatterns() {
  const patterns = [];
  for (const composer of COMPOSERS) {
    const terms = [composer.name, ...composer.alternatives];
    for (const term of terms) {
      // Escape regex special chars, then wrap in word boundaries
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      patterns.push({
        pattern: new RegExp(`\\b${escaped}\\b`, "i"),
        displayName: composer.name,
        composerEntry: composer,
      });
    }
  }
  return patterns;
}

const COMPOSER_PATTERNS = buildComposerPatterns();

/**
 * Returns an array of composer display names found in the given text.
 * Deduplicates so each composer appears at most once.
 */
function detectComposers(text) {
  if (!text) return [];
  const found = new Set();
  for (const { pattern, displayName } of COMPOSER_PATTERNS) {
    if (pattern.test(text)) {
      found.add(displayName);
    }
  }
  return [...found];
}

/**
 * Returns true if the artist name appears to be the composer themselves
 * (e.g. "Beethoven" performing "Beethoven: Sonata").
 */
function artistIsComposer(artistName, composerNames) {
  const lowerArtist = artistName.toLowerCase();
  return composerNames.some(c => lowerArtist.includes(c.toLowerCase()));
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

      // Merge and deduplicate
      const allComposers = [...new Set([...trackComposers, ...albumComposers])];
      if (allComposers.length === 0) continue;

      // Determine where each composer was found
      const sources = {};
      for (const c of allComposers) {
        const inTrack = trackComposers.includes(c);
        const inAlbum = albumComposers.includes(c);
        if (inTrack && inAlbum) sources[c] = "track & album";
        else if (inTrack) sources[c] = "track";
        else sources[c] = "album";
      }

      // Flag whether the performing artist appears to be the composer
      const performerIsComposer = artistIsComposer(item.artist, allComposers);

      matches.push({ item, composers: allComposers, sources, performerIsComposer });
    }
    return matches;
  }

  function updateHeader(matches, metadata) {
    const statsBar = document.getElementById("stats");
    const nonComposerCount = matches.filter(m => !m.performerIsComposer).length;
    const composerSet = new Set(matches.flatMap(m => m.composers));

    statsBar.innerHTML = `
      <div class="stat-item">Classical Matches: <span>${matches.length}</span></div>
      <div class="stat-item">Unique Composers: <span>${composerSet.size}</span></div>
      <div class="stat-item">Performed by Others: <span>${nonComposerCount}</span></div>
    `;

    const lastUpdated = document.getElementById("lastUpdated");
    const date = new Date(metadata.last_updated);
    lastUpdated.textContent = `Catalog last updated: ${date.toLocaleString()}`;
  }

  function populateComposerFilter(matches) {
    const composerSet = new Set(matches.flatMap(m => m.composers));
    const sorted = [...composerSet].sort();
    for (const name of sorted) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      composerSelect.appendChild(opt);
    }
  }

  function renderGrid() {
    const searchTerm = searchInput.value.toLowerCase();
    const sortMode = sortSelect.value;
    const filterComposer = composerSelect.value;

    let filtered = allMatches.filter(({ item, composers }) => {
      if (filterComposer && !composers.includes(filterComposer)) return false;
      if (searchTerm) {
        return (
          item.artist.toLowerCase().includes(searchTerm) ||
          (item.track || "").toLowerCase().includes(searchTerm) ||
          (item.album || "").toLowerCase().includes(searchTerm) ||
          composers.some(c => c.toLowerCase().includes(searchTerm))
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
        return a.composers[0].localeCompare(b.composers[0]);
      }
      return 0;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `<div class="loading">No classical matches found.</div>`;
      return;
    }

    grid.innerHTML = filtered.map(({ item, composers, sources, performerIsComposer }) => {
      const composerPills = composers.map(c => {
        const src = sources[c];
        return `<span class="composer-pill" title="Found in ${src}">${c}</span>`;
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
