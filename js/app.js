document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('catalogGrid');
    const searchInput = document.getElementById('searchInput');
    const sortSelect = document.getElementById('sortSelect');
    const hideGraduatedCb = document.getElementById('hideGraduated');
    
    let catalogData = [];
    let metadata = {};

    // Fetch the JSON catalog
    fetch('data/discovery_catalog.json')
        .then(response => response.json())
        .then(data => {
            metadata = data.metadata;
            // Convert catalog object to array for easier filtering/sorting
            catalogData = Object.values(data.catalog);
            
            updateHeader();
            renderGrid();
        })
        .catch(error => {
            console.error('Error loading catalog:', error);
            grid.innerHTML = `<div class="loading">Failed to load catalog. Ensure you are running a local server.</div>`;
        });

    // Event listeners for controls
    searchInput.addEventListener('input', renderGrid);
    sortSelect.addEventListener('change', renderGrid);
    hideGraduatedCb.addEventListener('change', renderGrid);

    function updateHeader() {
        const statsBar = document.getElementById('stats');
        statsBar.innerHTML = `
            <div class="stat-item">Total Discoveries: <span>${metadata.total_discoveries}</span></div>
            <div class="stat-item">Graduated to Top 1000: <span>${metadata.total_graduated}</span></div>
        `;

        const lastUpdated = document.getElementById('lastUpdated');
        const date = new Date(metadata.last_updated);
        lastUpdated.textContent = `Last updated: ${date.toLocaleString()}`;
    }

    function renderGrid() {
        const searchTerm = searchInput.value.toLowerCase();
        const sortMode = sortSelect.value;
        const hideGraduated = hideGraduatedCb.checked;

        // Filter
        let filtered = catalogData.filter(item => {
            if (hideGraduated && item.graduated) return false;
            
            return item.artist.toLowerCase().includes(searchTerm) || 
                   item.track.toLowerCase().includes(searchTerm);
        });

        // Sort
        filtered.sort((a, b) => {
            if (sortMode === 'last_listened') {
                return new Date(b.last_listened) - new Date(a.last_listened);
            } else if (sortMode === 'first_discovered') {
                return new Date(b.first_discovered) - new Date(a.first_discovered);
            } else if (sortMode === 'artist_asc') {
                return a.artist.localeCompare(b.artist);
            }
        });

        // Render
        if (filtered.length === 0) {
            grid.innerHTML = `<div class="loading">No artists found matching your criteria.</div>`;
            return;
        }

        grid.innerHTML = filtered.map(item => {
            const isNew = item.first_discovered === item.last_listened;
            let badge = '';
            
            if (item.graduated) {
                badge = `<span class="badge badge-graduated">Graduated</span>`;
            } else if (isNew) {
                // If discovered in the last 7 days, flag as NEW
                const discoveredDate = new Date(item.first_discovered);
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                if (discoveredDate > weekAgo) {
                    badge = `<span class="badge badge-new">New</span>`;
                }
            }

            // Clean up Last.fm string dates if needed, or just display them
            const firstDateStr = item.first_discovered.replace(' 2026', ''); // simplify display
            const lastDateStr = item.last_listened.replace(' 2026', '');

            return `
                <div class="card">
                    <div class="card-header">
                        <a href="${item.artist_url}" target="_blank" class="artist-name">${item.artist}</a>
                        ${badge}
                    </div>
                    <div class="card-body">
                        <div class="track-info">
                            <div class="track-label">Latest Track</div>
                            <a href="${item.track_url}" target="_blank" class="track-name">${item.track}</a>
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
        }).join('');
    }
});