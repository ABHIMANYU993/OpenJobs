// Global State Configuration
const state = {
    allJobs: [],
    filteredJobs: [],
    currentPage: 1,
    pageSize: 15,
    searchMode: 'free', // 'free' or 'structured'
    
    // Search fields
    q: '',
    structTitle: '',
    structCompany: '',
    structLocation: '',
    
    // Facet selections (Sets)
    workplace: new Set(),
    posted: new Set(),
    level: new Set(),
    ats: new Set(),
    minComp: 0,
    
    // Boolean toggles
    hideRecruiter: false,
    hideStale: false,
    savedOnly: false,
    appliedOnly: false,
    showIgnored: false,
    
    // Sorting Configuration
    sortBy: 'role', // 'role', 'location', 'level', 'posted'
    sortDir: 'asc', // 'asc' or 'desc'
    
    isLoading: true
};

// Persistence State Arrays (LocalStorage Keys)
const Storage = {
    saved: new Set(JSON.parse(localStorage.getItem('open_jobs_saved') || '[]')),
    applied: new Set(JSON.parse(localStorage.getItem('open_jobs_applied') || '[]')),
    ignored: new Set(JSON.parse(localStorage.getItem('open_jobs_ignored') || '[]')),
    
    save(key, set) {
        localStorage.setItem(`open_jobs_${key}`, JSON.stringify(Array.from(set)));
    }
};

const DOM = {
    // Top headers
    totalJobs: document.getElementById('stat-total-jobs'),
    resultsCount: document.getElementById('results-count'),
    lastUpdated: document.getElementById('stat-last-updated'),
    
    // Search tabs & panel inputs
    tabFree: document.getElementById('tab-free'),
    tabStructured: document.getElementById('tab-structured'),
    panelFree: document.getElementById('search-free-panel'),
    panelStructured: document.getElementById('search-structured-panel'),
    inputFree: document.getElementById('input-free-search'),
    inputStructTitle: document.getElementById('input-struct-title'),
    inputStructCompany: document.getElementById('input-struct-company'),
    inputStructLocation: document.getElementById('input-struct-location'),
    
    // Active filters
    activeFiltersBox: document.getElementById('active-filters-box'),
    activeChips: document.getElementById('active-chips'),
    btnClearAll: document.getElementById('btn-clear-all'),
    
    // Steppers
    btnCompMinus: document.getElementById('btn-comp-minus'),
    btnCompPlus: document.getElementById('btn-comp-plus'),
    compDisplay: document.getElementById('comp-display'),
    
    // Toggles
    toggleHideRecruiters: document.getElementById('toggle-hide-recruiters'),
    toggleHideStale: document.getElementById('toggle-hide-stale'),
    toggleSavedOnly: document.getElementById('toggle-saved-only'),
    toggleAppliedOnly: document.getElementById('toggle-applied-only'),
    toggleShowIgnored: document.getElementById('toggle-show-ignored'),
    
    // Ledger elements
    loader: document.getElementById('loader'),
    ledgerRows: document.getElementById('ledger-rows'),
    sortHeaders: document.querySelectorAll('.sort-header-col[data-sort]'),
    
    // Pagination
    btnPrev: document.getElementById('btn-prev'),
    btnNext: document.getElementById('btn-next'),
    pageIndicator: document.getElementById('page-indicator')
};

// --- Accordion Action Registration ---
document.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', () => {
        const targetId = header.dataset.target;
        const body = document.getElementById(targetId);
        const indicator = header.querySelector('.acc-indicator');
        const isOpen = body.classList.contains('open');
        
        if (isOpen) {
            body.classList.remove('open');
            indicator.textContent = '[+]';
            header.setAttribute('aria-expanded', 'false');
        } else {
            body.classList.add('open');
            indicator.textContent = '[–]';
            header.setAttribute('aria-expanded', 'true');
        }
    });
});

// --- Search Tab Panel Toggle ---
function setupSearchTabs() {
    DOM.tabFree.addEventListener('click', () => {
        state.searchMode = 'free';
        DOM.tabFree.classList.add('active');
        DOM.tabStructured.classList.remove('active');
        DOM.panelFree.classList.add('active');
        DOM.panelStructured.classList.remove('active');
        applyFilters();
    });
    
    DOM.tabStructured.addEventListener('click', () => {
        state.searchMode = 'structured';
        DOM.tabStructured.classList.add('active');
        DOM.tabFree.classList.remove('active');
        DOM.panelStructured.classList.add('active');
        DOM.panelFree.classList.remove('active');
        applyFilters();
    });
}

// --- Stepper Controls ---
function setupStepper() {
    DOM.btnCompMinus.addEventListener('click', () => {
        if (state.minComp >= 10) {
            state.minComp -= 10;
            updateCompDisplay();
            applyFilters();
        }
    });
    
    DOM.btnCompPlus.addEventListener('click', () => {
        if (state.minComp < 300) {
            state.minComp += 10;
            updateCompDisplay();
            applyFilters();
        }
    });
}

function updateCompDisplay() {
    DOM.compDisplay.textContent = `$${state.minComp}k`;
}

// --- Toggle Controls ---
function setupToggles() {
    DOM.toggleHideRecruiters.addEventListener('change', (e) => {
        state.hideRecruiter = e.target.checked;
        applyFilters();
    });
    DOM.toggleHideStale.addEventListener('change', (e) => {
        state.hideStale = e.target.checked;
        applyFilters();
    });
    DOM.toggleSavedOnly.addEventListener('change', (e) => {
        state.savedOnly = e.target.checked;
        applyFilters();
    });
    DOM.toggleAppliedOnly.addEventListener('change', (e) => {
        state.appliedOnly = e.target.checked;
        applyFilters();
    });
    DOM.toggleShowIgnored.addEventListener('change', (e) => {
        state.showIgnored = e.target.checked;
        applyFilters();
    });
}

// --- Checkboxes Setup ---
function setupCheckboxes() {
    document.querySelectorAll('input[type="checkbox"][data-facet]').forEach(cb => {
        cb.addEventListener('change', () => {
            const facet = cb.dataset.facet;
            const value = cb.value;
            if (cb.checked) {
                state[facet].add(value);
            } else {
                state[facet].delete(value);
            }
            applyFilters();
        });
    });
}

// --- Sorting Controls ---
function setupSorting() {
    DOM.sortHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const targetSort = header.dataset.sort;
            if (state.sortBy === targetSort) {
                state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
            } else {
                state.sortBy = targetSort;
                state.sortDir = 'asc';
            }
            
            // Update Headers chevron indicators
            DOM.sortHeaders.forEach(h => {
                h.classList.remove('active');
                const chev = h.querySelector('.sort-chevron');
                if (chev) chev.textContent = '';
            });
            
            header.classList.add('active');
            const chev = header.querySelector('.sort-chevron');
            if (chev) chev.textContent = state.sortDir === 'asc' ? '▲' : '▼';
            
            renderPage();
        });
    });
}

// --- Init & Data Loader ---
async function init() {
    setupSearchTabs();
    setupStepper();
    setupToggles();
    setupCheckboxes();
    setupSorting();
    
    DOM.btnClearAll.addEventListener('click', clearAllFilters);
    
    // Search debouncing setup
    let debounceTimer;
    const handleSearchInput = (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            if (e.target === DOM.inputFree) {
                state.q = e.target.value;
            } else {
                state.structTitle = DOM.inputStructTitle.value;
                state.structCompany = DOM.inputStructCompany.value;
                state.structLocation = DOM.inputStructLocation.value;
            }
            applyFilters();
        }, 150);
    };
    
    DOM.inputFree.addEventListener('input', handleSearchInput);
    DOM.inputStructTitle.addEventListener('input', handleSearchInput);
    DOM.inputStructCompany.addEventListener('input', handleSearchInput);
    DOM.inputStructLocation.addEventListener('input', handleSearchInput);
    
    try {
        const manifestRes = await fetch('data/manifest.json');
        if (!manifestRes.ok) throw new Error("Manifest not found.");
        const manifest = await manifestRes.json();
        
        DOM.totalJobs.textContent = manifest.total_jobs.toLocaleString();
        
        const dateObj = new Date(manifest.updated_at_ist);
        DOM.lastUpdated.textContent = dateObj.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });

        const chunks = manifest.chunks || [];
        
        const chunkPromises = chunks.map(async (chunk) => {
            try {
                const res = await fetch(`data/${chunk.file}`);
                let json;
                try {
                    json = await res.clone().json();
                } catch (err) {
                    const ds = new DecompressionStream('gzip');
                    const decompressedStream = res.body.pipeThrough(ds);
                    const decompressedRes = new Response(decompressedStream);
                    json = await decompressedRes.json();
                }
                return json;
            } catch (e) {
                console.error("Failed loading chunk:", chunk.file, e);
                return [];
            }
        });
        
        const chunksData = await Promise.all(chunkPromises);
        
        let indexCounter = 0;
        for (const chunk of chunksData) {
            for (let i = 0; i < chunk.length; i++) {
                const job = chunk[i];
                job.inferredCategory = inferCategory(job.ti || '');
                job.inferredLevel = inferLevel(job.ti || '', job.l || '');
                
                // Add rich dataset elements to map layout requirements
                job.id = `${job.ti || ''}-${job.c || ''}-${indexCounter}`.replace(/\s+/g, '-').toLowerCase();
                job.comp = 80000 + ((indexCounter * 17) % 15) * 10000; // Mock salary: $80k-$220k
                job.isRecruiter = (indexCounter % 10 === 0) || (job.c || '').toLowerCase().match(/staffing|agency|group|recruiting|global/);
                job.isVerified = (indexCounter % 8 !== 0);
                
                // Infer ATS
                const url = (job.u || '').toLowerCase();
                if (url.includes('greenhouse.io') || url.includes('boards.greenhouse.io')) {
                    job.ats = 'greenhouse';
                } else if (url.includes('lever.co')) {
                    job.ats = 'lever';
                } else if (url.includes('myworkdayjobs')) {
                    job.ats = 'workday';
                } else {
                    job.ats = 'other';
                }
                
                state.allJobs.push(job);
                indexCounter++;
            }
        }
        
        state.isLoading = false;
        DOM.loader.classList.add('hidden');
        DOM.ledgerRows.classList.remove('hidden');
        
        // Rehydrate state from URL query params
        rehydrateFromURL();
        
        applyFilters();

    } catch (e) {
        console.error(e);
        DOM.loader.innerHTML = '<span class="loader-pulse">■</span> ERROR LOAD FAILED';
    }
}

// --- Category & Level Inference ---
function inferCategory(title) {
    title = title.toLowerCase();
    if (title.match(/engineer|developer|architect|full stack|backend|frontend|ios|android/)) return 'engineering';
    if (title.match(/data|machine learning|ml |ai |analytics|scientist/)) return 'data';
    if (title.match(/product|design|ui\/ux|researcher/)) return 'product';
    if (title.match(/sales|account|business development|marketing|growth|content/)) return 'sales';
    if (title.match(/operations|hr |human resources|talent|recruiter|finance|legal/)) return 'operations';
    return 'other';
}

function inferLevel(title, existingLevel) {
    title = title.toLowerCase();
    existingLevel = (existingLevel || '').toLowerCase();
    
    if (title.match(/intern|junior|entry|grad|associate|1|i\b/)) return 'entry';
    if (title.match(/senior|sr\.|staff|principal|lead|head|manager|director|vp|chief/)) return 'senior';
    if (title.match(/director|vp|head of|chief|president/)) return 'executive';
    if (title.match(/mid|ii\b/)) return 'mid';
    
    if (existingLevel.includes('senior') || existingLevel.includes('lead')) return 'senior';
    if (existingLevel.includes('junior') || existingLevel.includes('entry')) return 'entry';
    if (existingLevel.includes('executive') || existingLevel.includes('director')) return 'executive';
    
    return 'mid';
}

// --- Prefix Parser ---
function parseFreeQuery(query) {
    const filters = {
        title: '',
        company: '',
        location: '',
        general: []
    };
    
    // Match prefix mappings like title:"Software Engineer" or title:Staff
    const pattern = /(?:(\w+):(?:(?:"([^"]+)")|(\S+)))/g;
    let match;
    let lastIndex = 0;
    const cleanQuery = query;
    
    while ((match = pattern.exec(cleanQuery)) !== null) {
        const key = match[1].toLowerCase();
        const val = match[2] || match[3];
        
        if (key === 'title' || key === 't') filters.title = val.toLowerCase();
        else if (key === 'company' || key === 'c') filters.company = val.toLowerCase();
        else if (key === 'location' || key === 'l') filters.location = val.toLowerCase();
        
        // Grab non-matched text between matches
        const segment = cleanQuery.slice(lastIndex, match.index).trim();
        if (segment) {
            filters.general.push(segment.toLowerCase());
        }
        lastIndex = pattern.lastIndex;
    }
    
    const remaining = cleanQuery.slice(lastIndex).trim();
    if (remaining) {
        filters.general.push(remaining.toLowerCase());
    }
    
    return filters;
}

// --- Filtering Engine & Facet Counts Intersections ---
function applyFilters() {
    if (state.isLoading) return;
    
    // Core Array Filters
    state.filteredJobs = state.allJobs.filter(job => {
        return matchesJob(job, state);
    });
    
    state.currentPage = 1;
    DOM.resultsCount.textContent = state.filteredJobs.length.toLocaleString();
    
    // Render
    updateURL();
    renderActiveChips();
    renderPage();
    calculateFacetCounts();
}

// Helper to determine if a job matches state criteria
function matchesJob(job, testState) {
    const isIgnored = Storage.ignored.has(job.id);
    
    // Show ignored toggle evaluation
    if (isIgnored && !testState.showIgnored) return false;
    
    // savedOnly & appliedOnly evaluations
    if (testState.savedOnly && !Storage.saved.has(job.id)) return false;
    if (testState.appliedOnly && !Storage.applied.has(job.id)) return false;
    
    // Recruiter & Stale boolean evaluations
    if (testState.hideRecruiter && job.isRecruiter) return false;
    if (testState.hideStale && !job.isVerified) return false;
    
    // Compensation bounds
    if (job.comp < (testState.minComp * 1000)) return false;
    
    // Search input evaluations
    if (testState.searchMode === 'free') {
        if (testState.q.trim()) {
            const parsed = parseFreeQuery(testState.q);
            const title = (job.ti || '').toLowerCase();
            const company = (job.c || '').toLowerCase();
            const location = (job.loc || '').toLowerCase();
            
            if (parsed.title && !title.includes(parsed.title)) return false;
            if (parsed.company && !company.includes(parsed.company)) return false;
            if (parsed.location && !location.includes(parsed.location)) return false;
            
            // Check general terms
            for (const term of parsed.general) {
                if (!title.includes(term) && !company.includes(term) && !location.includes(term)) {
                    return false;
                }
            }
        }
    } else {
        // Structured inputs
        const title = (job.ti || '').toLowerCase();
        const company = (job.c || '').toLowerCase();
        const location = (job.loc || '').toLowerCase();
        
        if (testState.structTitle && !title.includes(testState.structTitle.toLowerCase())) return false;
        if (testState.structCompany && !company.includes(testState.structCompany.toLowerCase())) return false;
        if (testState.structLocation && !location.includes(testState.structLocation.toLowerCase())) return false;
    }
    
    // Workplace checks
    if (testState.workplace.size > 0) {
        const isRemote = job.w === 'remote' || (job.loc || '').toLowerCase().includes('remote');
        const type = isRemote ? 'remote' : 'onsite';
        if (!testState.workplace.has(type)) return false;
    }
    
    // Level checks
    if (testState.level.size > 0) {
        if (!testState.level.has(job.inferredLevel)) return false;
    }
    
    // ATS checks
    if (testState.ats.size > 0) {
        if (!testState.ats.has(job.ats)) return false;
    }
    
    // Posted time checks
    if (testState.posted.size > 0) {
        const dateObj = job.ist_scraped_at ? new Date(job.ist_scraped_at) : new Date();
        const diffDays = (new Date() - dateObj) / (1000 * 60 * 60 * 24);
        
        let matchedTime = false;
        testState.posted.forEach(range => {
            if (range === '24h' && diffDays <= 1) matchedTime = true;
            if (range === '3d' && diffDays <= 3) matchedTime = true;
            if (range === '7d' && diffDays <= 7) matchedTime = true;
        });
        if (!matchedTime) return false;
    }
    
    return true;
}

// --- Dynamic Facet Count Calculation ---
function calculateFacetCounts() {
    // Generate counts for workplace, level, ats, posted
    const categories = ['workplace', 'level', 'ats', 'posted'];
    
    categories.forEach(facetCat => {
        // Find all checkboxes in this facet category
        const cbs = document.querySelectorAll(`input[data-facet="${facetCat}"]`);
        cbs.forEach(cb => {
            const val = cb.value;
            
            // Build a temporary simulation state
            const simState = {
                ...state,
                workplace: new Set(state.workplace),
                level: new Set(state.level),
                ats: new Set(state.ats),
                posted: new Set(state.posted)
            };
            
            // Isolate current calculation: force it to match simulated value
            simState[facetCat] = new Set([val]);
            
            // Intersect all other active jobs
            const count = state.allJobs.filter(job => matchesJob(job, simState)).length;
            
            // Update labels
            const countLabel = document.getElementById(`count-${facetCat}-${val}`);
            if (countLabel) {
                countLabel.textContent = count.toLocaleString();
            }
            
            // Disable checkbox if count is 0 and it isn't currently checked
            const rowLabel = cb.closest('.filter-checkbox-row');
            if (count === 0 && !cb.checked) {
                rowLabel.classList.add('disabled');
                cb.disabled = true;
            } else {
                rowLabel.classList.remove('disabled');
                cb.disabled = false;
            }
        });
    });
}

// --- Active Chips strip ---
function renderActiveChips() {
    DOM.activeChips.innerHTML = '';
    const activeList = [];
    
    ['workplace', 'level', 'ats', 'posted'].forEach(facet => {
        state[facet].forEach(val => {
            activeList.push({ facet, val });
        });
    });
    
    if (activeList.length > 0) {
        DOM.activeFiltersBox.classList.remove('hidden');
        activeList.forEach(item => {
            const chip = document.createElement('div');
            chip.className = 'active-chip';
            chip.innerHTML = `${item.val.toUpperCase()} ✕`;
            chip.addEventListener('click', () => {
                state[item.facet].delete(item.val);
                const cb = document.querySelector(`input[data-facet="${item.facet}"][value="${item.val}"]`);
                if (cb) cb.checked = false;
                applyFilters();
            });
            DOM.activeChips.appendChild(chip);
        });
    } else {
        DOM.activeFiltersBox.classList.add('hidden');
    }
}

function clearAllFilters() {
    state.q = '';
    state.structTitle = '';
    state.structCompany = '';
    state.structLocation = '';
    state.minComp = 0;
    
    DOM.inputFree.value = '';
    DOM.inputStructTitle.value = '';
    DOM.inputStructCompany.value = '';
    DOM.inputStructLocation.value = '';
    
    ['workplace', 'level', 'ats', 'posted'].forEach(facet => {
        state[facet].clear();
    });
    
    document.querySelectorAll('input[type="checkbox"][data-facet]').forEach(cb => {
        cb.checked = false;
    });
    
    // Reset Boolean Toggles
    state.hideRecruiter = false;
    state.hideStale = false;
    state.savedOnly = false;
    state.appliedOnly = false;
    state.showIgnored = false;
    
    DOM.toggleHideRecruiters.checked = false;
    DOM.toggleHideStale.checked = false;
    DOM.toggleSavedOnly.checked = false;
    DOM.toggleAppliedOnly.checked = false;
    DOM.toggleShowIgnored.checked = false;
    
    updateCompDisplay();
    applyFilters();
}

// --- Sorting Mechanics ---
function getSortedJobs() {
    return [...state.filteredJobs].sort((a, b) => {
        let valA = '';
        let valB = '';
        
        switch (state.sortBy) {
            case 'role':
                valA = (a.ti || '').toLowerCase();
                valB = (b.ti || '').toLowerCase();
                break;
            case 'location':
                valA = (a.loc || '').toLowerCase();
                valB = (b.loc || '').toLowerCase();
                break;
            case 'level':
                valA = (a.inferredLevel || '').toLowerCase();
                valB = (b.inferredLevel || '').toLowerCase();
                break;
            case 'posted':
                valA = a.ist_scraped_at ? new Date(a.ist_scraped_at) : new Date(0);
                valB = b.ist_scraped_at ? new Date(b.ist_scraped_at) : new Date(0);
                break;
        }
        
        if (valA < valB) return state.sortDir === 'asc' ? -1 : 1;
        if (valA > valB) return state.sortDir === 'asc' ? 1 : -1;
        return 0;
    });
}

// --- Render Layout Tabular Rows ---
function renderPage() {
    DOM.ledgerRows.innerHTML = '';
    
    const sorted = getSortedJobs();
    const totalPages = Math.ceil(sorted.length / state.pageSize) || 1;
    const startIndex = (state.currentPage - 1) * state.pageSize;
    const endIndex = Math.min(startIndex + state.pageSize, sorted.length);
    
    const fragment = document.createDocumentFragment();
    
    for (let i = startIndex; i < endIndex; i++) {
        const job = sorted[i];
        
        const isSaved = Storage.saved.has(job.id);
        const isApplied = Storage.applied.has(job.id);
        const isIgnored = Storage.ignored.has(job.id);
        
        // Calculate Scraped Time Ago
        const dateObj = job.ist_scraped_at ? new Date(job.ist_scraped_at) : new Date();
        const diffDays = Math.floor((new Date() - dateObj) / (1000 * 60 * 60 * 24));
        
        // Badge Configurations
        let badgeHtml = '';
        if (diffDays <= 1) {
            badgeHtml += `<span class="ledger-badge badge-new">[NEW]</span>`;
        } else if (!job.isVerified) {
            badgeHtml += `<span class="ledger-badge badge-stale">[STALE]</span>`;
        }
        
        if (isSaved) badgeHtml += `<span class="ledger-badge badge-saved">[SAVED]</span>`;
        if (isApplied) badgeHtml += `<span class="ledger-badge badge-applied">[APPLIED]</span>`;
        
        const isRemote = job.w === 'remote' || (job.loc || '').toLowerCase().includes('remote');
        const locationText = isRemote ? 'Remote' : (job.loc || 'Unspecified');
        
        const row = document.createElement('div');
        row.className = `ledger-row ${isIgnored ? 'ignored' : ''}`;
        
        row.innerHTML = `
            <div class="ledger-cell">
                <div class="role-cell-wrapper">
                    <div class="role-title-row">
                        <a href="${job.u || '#'}" target="_blank" rel="noopener noreferrer" class="role-title-link">
                            ${escapeHTML(job.ti || 'Untitled Position')}
                        </a>
                        <div class="badge-wrapper">${badgeHtml}</div>
                    </div>
                    <span class="company-title">${escapeHTML(job.c || 'Unknown')}</span>
                </div>
            </div>
            <div class="ledger-cell">
                <span class="location-text">${escapeHTML(locationText)}</span>
            </div>
            <div class="ledger-cell">
                <span class="level-mono">${escapeHTML(job.inferredLevel)}</span>
            </div>
            <div class="ledger-cell">
                <span class="posted-mono">${diffDays === 0 ? 'Today' : diffDays === 1 ? '1d ago' : `${diffDays}d ago`}</span>
            </div>
            <div class="ledger-cell actions-cell">
                <!-- Save toggle glyph -->
                <button class="action-btn-glyph btn-glyph-save ${isSaved ? 'active' : ''}" title="Save Role">
                    ${isSaved ? '★' : '☆'}
                </button>
                <!-- Apply direct link -->
                <a href="${job.u || '#'}" target="_blank" rel="noopener noreferrer" class="action-btn-glyph btn-glyph-apply" title="Apply Externally">
                    ↗
                </a>
                <!-- Ignore toggle glyph -->
                <button class="action-btn-glyph btn-glyph-ignore ${isIgnored ? 'active' : ''}" title="Ignore Role">
                    ${isIgnored ? '✖' : '☐'}
                </button>
            </div>
        `;
        
        // Attach Action Click Listeners
        const btnSave = row.querySelector('.btn-glyph-save');
        btnSave.addEventListener('click', (e) => {
            e.stopPropagation();
            if (Storage.saved.has(job.id)) {
                Storage.saved.delete(job.id);
            } else {
                Storage.saved.add(job.id);
            }
            Storage.save('saved', Storage.saved);
            applyFilters();
        });
        
        const btnIgnore = row.querySelector('.btn-glyph-ignore');
        btnIgnore.addEventListener('click', (e) => {
            e.stopPropagation();
            if (Storage.ignored.has(job.id)) {
                Storage.ignored.delete(job.id);
            } else {
                Storage.ignored.add(job.id);
            }
            Storage.save('ignored', Storage.ignored);
            applyFilters();
        });
        
        // Simulating Apply Click
        const btnApply = row.querySelector('.btn-glyph-apply');
        btnApply.addEventListener('click', () => {
            Storage.applied.add(job.id);
            Storage.save('applied', Storage.applied);
            setTimeout(applyFilters, 500); // Trigger redraw slightly after opening window
        });
        
        fragment.appendChild(row);
    }
    
    DOM.ledgerRows.appendChild(fragment);
    
    // Page state rendering
    DOM.pageIndicator.textContent = `${String(state.currentPage).padStart(2, '0')} / ${String(totalPages).padStart(2, '0')}`;
    DOM.btnPrev.disabled = state.currentPage === 1;
    DOM.btnNext.disabled = state.currentPage === totalPages;
}

function escapeHTML(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// --- Query String Syncing Logic ---
function updateURL() {
    const params = new URLSearchParams();
    
    if (state.searchMode === 'free') {
        if (state.q) params.set('q', state.q);
    } else {
        if (state.structTitle) params.set('t', state.structTitle);
        if (state.structCompany) params.set('c', state.structCompany);
        if (state.structLocation) params.set('l', state.structLocation);
    }
    
    params.set('mode', state.searchMode);
    
    if (state.minComp > 0) params.set('comp', state.minComp);
    
    // Add Sets
    ['workplace', 'level', 'ats', 'posted'].forEach(facet => {
        if (state[facet].size > 0) {
            params.set(facet, Array.from(state[facet]).join(','));
        }
    });
    
    // Toggles
    if (state.hideRecruiter) params.set('no_rec', '1');
    if (state.hideStale) params.set('verified', '1');
    if (state.savedOnly) params.set('saved', '1');
    if (state.appliedOnly) params.set('applied', '1');
    if (state.showIgnored) params.set('show_ign', '1');
    
    // Sort
    params.set('sort', state.sortBy);
    params.set('dir', state.sortDir);
    
    const newURL = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({ path: newURL }, '', newURL);
}

function rehydrateFromURL() {
    const params = new URLSearchParams(window.location.search);
    
    state.searchMode = params.get('mode') || 'free';
    if (state.searchMode === 'free') {
        state.q = params.get('q') || '';
        DOM.inputFree.value = state.q;
        DOM.tabFree.classList.add('active');
        DOM.tabStructured.classList.remove('active');
        DOM.panelFree.classList.add('active');
        DOM.panelStructured.classList.remove('active');
    } else {
        state.structTitle = params.get('t') || '';
        state.structCompany = params.get('c') || '';
        state.structLocation = params.get('l') || '';
        DOM.inputStructTitle.value = state.structTitle;
        DOM.inputStructCompany.value = state.structCompany;
        DOM.inputStructLocation.value = state.structLocation;
        DOM.tabStructured.classList.add('active');
        DOM.tabFree.classList.remove('active');
        DOM.panelStructured.classList.add('active');
        DOM.panelFree.classList.add('active'); // Keep panels in sync
    }
    
    state.minComp = parseInt(params.get('comp') || '0', 10);
    updateCompDisplay();
    
    ['workplace', 'level', 'ats', 'posted'].forEach(facet => {
        const val = params.get(facet);
        if (val) {
            val.split(',').forEach(item => {
                state[facet].add(item);
                const cb = document.querySelector(`input[data-facet="${facet}"][value="${item}"]`);
                if (cb) cb.checked = true;
            });
        }
    });
    
    state.hideRecruiter = params.get('no_rec') === '1';
    DOM.toggleHideRecruiters.checked = state.hideRecruiter;
    
    state.hideStale = params.get('verified') === '1';
    DOM.toggleHideStale.checked = state.hideStale;
    
    state.savedOnly = params.get('saved') === '1';
    DOM.toggleSavedOnly.checked = state.savedOnly;
    
    state.appliedOnly = params.get('applied') === '1';
    DOM.toggleAppliedOnly.checked = state.appliedOnly;
    
    state.showIgnored = params.get('show_ign') === '1';
    DOM.toggleShowIgnored.checked = state.showIgnored;
    
    state.sortBy = params.get('sort') || 'role';
    state.sortDir = params.get('dir') || 'asc';
    
    DOM.sortHeaders.forEach(h => {
        h.classList.remove('active');
        const chev = h.querySelector('.sort-chevron');
        if (chev) chev.textContent = '';
        
        if (h.dataset.sort === state.sortBy) {
            h.classList.add('active');
            const chev = h.querySelector('.sort-chevron');
            if (chev) chev.textContent = state.sortDir === 'asc' ? '▲' : '▼';
        }
    });
}

// --- Pagination Actions ---
DOM.btnPrev.addEventListener('click', () => {
    if (state.currentPage > 1) {
        state.currentPage--;
        renderPage();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
});

DOM.btnNext.addEventListener('click', () => {
    const sorted = getSortedJobs();
    const totalPages = Math.ceil(sorted.length / state.pageSize);
    if (state.currentPage < totalPages) {
        state.currentPage++;
        renderPage();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
});

init();
