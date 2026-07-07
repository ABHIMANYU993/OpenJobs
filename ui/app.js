// Global State Configuration
const state = {
    currentPage: 1,
    pageSize: 15,
    searchMode: 'free', // 'free' or 'structured'
    
    // Search fields
    q: '',
    structTitle: '',
    structCompany: '',
    structLocation: '',
    
    // Facet selections (Arrays for easy serialization to worker)
    workplace: [],
    posted: [],
    level: [],
    ats: [],
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
    },
    
    serialize() {
        return {
            saved: Array.from(this.saved),
            applied: Array.from(this.applied),
            ignored: Array.from(this.ignored)
        };
    }
};

const DOM = {
    totalJobs: document.getElementById('stat-total-jobs'),
    resultsCount: document.getElementById('results-count'),
    lastUpdated: document.getElementById('stat-last-updated'),
    
    tabFree: document.getElementById('tab-free'),
    tabStructured: document.getElementById('tab-structured'),
    panelFree: document.getElementById('search-free-panel'),
    panelStructured: document.getElementById('search-structured-panel'),
    inputFree: document.getElementById('input-free-search'),
    inputStructTitle: document.getElementById('input-struct-title'),
    inputStructCompany: document.getElementById('input-struct-company'),
    inputStructLocation: document.getElementById('input-struct-location'),
    
    activeFiltersBox: document.getElementById('active-filters-box'),
    activeChips: document.getElementById('active-chips'),
    btnClearAll: document.getElementById('btn-clear-all'),
    
    btnCompMinus: document.getElementById('btn-comp-minus'),
    btnCompPlus: document.getElementById('btn-comp-plus'),
    compDisplay: document.getElementById('comp-display'),
    
    toggleHideRecruiters: document.getElementById('toggle-hide-recruiters'),
    toggleHideStale: document.getElementById('toggle-hide-stale'),
    toggleSavedOnly: document.getElementById('toggle-saved-only'),
    toggleAppliedOnly: document.getElementById('toggle-applied-only'),
    toggleShowIgnored: document.getElementById('toggle-show-ignored'),
    
    loader: document.getElementById('loader'),
    ledgerRows: document.getElementById('ledger-rows'),
    sortHeaders: document.querySelectorAll('.sort-header-col[data-sort]'),
    
    btnPrev: document.getElementById('btn-prev'),
    btnNext: document.getElementById('btn-next'),
    pageIndicator: document.getElementById('page-indicator'),
    selectPageSize: document.getElementById('select-page-size')
};

// Web Worker Initialization
const worker = new Worker('worker.js');

worker.addEventListener('message', (e) => {
    const { type } = e.data;
    
    if (type === 'INIT_START') {
        DOM.totalJobs.textContent = e.data.total.toLocaleString();
        const dateObj = new Date(e.data.lastUpdated);
        DOM.lastUpdated.textContent = dateObj.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
    } 
    else if (type === 'INIT_DONE') {
        if (!e.data.success) {
            DOM.loader.innerHTML = '<span class="loader-pulse">■</span> ERROR LOAD FAILED';
            return;
        }
        state.isLoading = false;
        DOM.loader.classList.add('hidden');
        DOM.ledgerRows.classList.remove('hidden');
        rehydrateFromURL();
        applyFilters();
    }
    else if (type === 'FILTER_DONE') {
        DOM.resultsCount.textContent = e.data.totalResults.toLocaleString();
        updateFacetDOMCounts(e.data.counts);
        requestPage();
    }
    else if (type === 'PAGE_DATA') {
        renderPageDOM(e.data.data, e.data.page, e.data.totalPages);
    }
});

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
    DOM.toggleHideRecruiters.addEventListener('change', (e) => { state.hideRecruiter = e.target.checked; applyFilters(); });
    DOM.toggleHideStale.addEventListener('change', (e) => { state.hideStale = e.target.checked; applyFilters(); });
    DOM.toggleSavedOnly.addEventListener('change', (e) => { state.savedOnly = e.target.checked; applyFilters(); });
    DOM.toggleAppliedOnly.addEventListener('change', (e) => { state.appliedOnly = e.target.checked; applyFilters(); });
    DOM.toggleShowIgnored.addEventListener('change', (e) => { state.showIgnored = e.target.checked; applyFilters(); });
}

// --- Checkboxes Setup ---
function setupCheckboxes() {
    document.querySelectorAll('input[type="checkbox"][data-facet]').forEach(cb => {
        cb.addEventListener('change', () => {
            const facet = cb.dataset.facet;
            const value = cb.value;
            const set = new Set(state[facet]);
            if (cb.checked) set.add(value);
            else set.delete(value);
            state[facet] = Array.from(set);
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
            
            DOM.sortHeaders.forEach(h => {
                h.classList.remove('active');
                const chev = h.querySelector('.sort-chevron');
                if (chev) chev.textContent = '';
            });
            
            header.classList.add('active');
            const chev = header.querySelector('.sort-chevron');
            if (chev) chev.textContent = state.sortDir === 'asc' ? '▲' : '▼';
            
            applyFilters(); // Must re-filter to trigger sort in worker
        });
    });
}

// --- Page Size Control ---
if (DOM.selectPageSize) {
    DOM.selectPageSize.addEventListener('change', (e) => {
        state.pageSize = parseInt(e.target.value, 10);
        state.currentPage = 1;
        applyFilters();
    });
}

// --- Init ---
function init() {
    setupSearchTabs();
    setupStepper();
    setupToggles();
    setupCheckboxes();
    setupSorting();
    
    DOM.btnClearAll.addEventListener('click', clearAllFilters);
    
    let debounceTimer;
    const handleSearchInput = (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            if (e.target === DOM.inputFree) state.q = e.target.value;
            else {
                state.structTitle = DOM.inputStructTitle.value;
                state.structCompany = DOM.inputStructCompany.value;
                state.structLocation = DOM.inputStructLocation.value;
            }
            applyFilters();
        }, 250); // Increased debounce to 250ms to prevent rapid-fire worker requests
    };
    
    DOM.inputFree.addEventListener('input', handleSearchInput);
    DOM.inputStructTitle.addEventListener('input', handleSearchInput);
    DOM.inputStructCompany.addEventListener('input', handleSearchInput);
    DOM.inputStructLocation.addEventListener('input', handleSearchInput);
    
    // Kickoff worker load
    worker.postMessage({ type: 'INIT' });
}

// --- Worker Communication Engine ---
function applyFilters() {
    if (state.isLoading) return;
    state.currentPage = 1; // Reset to page 1 on new filter
    updateURL();
    renderActiveChips();
    worker.postMessage({ type: 'FILTER', payload: { state, storage: Storage.serialize() } });
}

function requestPage() {
    worker.postMessage({ type: 'GET_PAGE', payload: { page: state.currentPage, pageSize: state.pageSize } });
}

// --- UI Updaters ---
function updateFacetDOMCounts(counts) {
    // Dynamically generate ATS checkboxes if they don't exist
    if (counts.ats) {
        const atsContainer = document.getElementById('acc-ats');
        if (atsContainer) {
            const atsKeys = Object.keys(counts.ats).sort((a, b) => counts.ats[b] - counts.ats[a]);
            atsKeys.forEach(val => {
                let cb = document.querySelector(`input[data-facet="ats"][value="${val}"]`);
                if (!cb) {
                    const row = document.createElement('label');
                    row.className = 'filter-checkbox-row';
                    row.innerHTML = `
                        <input type="checkbox" value="${escapeHTML(val)}" data-facet="ats" />
                        <span class="checkbox-visual"></span>
                        <span class="checkbox-label">${escapeHTML(val).toUpperCase()}</span>
                        <span class="facet-count" id="count-ats-${escapeHTML(val)}">0</span>
                    `;
                    atsContainer.appendChild(row);
                    cb = row.querySelector('input');
                    cb.addEventListener('change', () => {
                        const set = new Set(state['ats']);
                        if (cb.checked) set.add(val);
                        else set.delete(val);
                        state['ats'] = Array.from(set);
                        applyFilters();
                    });
                }
            });
        }
    }

    ['workplace', 'level', 'ats', 'posted'].forEach(facetCat => {
        const cbs = document.querySelectorAll(`input[data-facet="${facetCat}"]`);
        cbs.forEach(cb => {
            const val = cb.value;
            const count = counts[facetCat][val] || 0;
            const countLabel = document.getElementById(`count-${facetCat}-${val}`);
            if (countLabel) countLabel.textContent = count.toLocaleString();
            
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

function renderActiveChips() {
    DOM.activeChips.innerHTML = '';
    const activeList = [];
    
    ['workplace', 'level', 'ats', 'posted'].forEach(facet => {
        state[facet].forEach(val => activeList.push({ facet, val }));
    });
    
    if (activeList.length > 0) {
        DOM.activeFiltersBox.classList.remove('hidden');
        activeList.forEach(item => {
            const chip = document.createElement('div');
            chip.className = 'active-chip';
            chip.innerHTML = `${item.val.toUpperCase()} ✕`;
            chip.addEventListener('click', () => {
                const set = new Set(state[item.facet]);
                set.delete(item.val);
                state[item.facet] = Array.from(set);
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
    
    ['workplace', 'level', 'ats', 'posted'].forEach(facet => state[facet] = []);
    document.querySelectorAll('input[type="checkbox"][data-facet]').forEach(cb => cb.checked = false);
    
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

function formatISTTimeAgo(postedAtStr) {
    if (!postedAtStr) return 'Unknown';
    const postedTime = new Date(postedAtStr).getTime();
    if (isNaN(postedTime)) return 'Unknown';
    const diffHours = Math.floor((Date.now() - postedTime) / (1000 * 60 * 60));
    
    if (diffHours < 1) return 'now';
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays >= 30) return '30+ days ago';
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

function renderPageDOM(jobs, page, totalPages) {
    DOM.ledgerRows.innerHTML = '';
    const fragment = document.createDocumentFragment();
    
    for (const job of jobs) {
        const isSaved = Storage.saved.has(job.id);
        const isApplied = Storage.applied.has(job.id);
        const isIgnored = Storage.ignored.has(job.id);
        
        let badgeHtml = '';
        if (job.diffDays <= 1) badgeHtml += `<span class="ledger-badge badge-new">[NEW]</span>`;
        else if (!job.isVerified) badgeHtml += `<span class="ledger-badge badge-stale">[STALE]</span>`;
        
        if (isSaved) badgeHtml += `<span class="ledger-badge badge-saved">[SAVED]</span>`;
        if (isApplied) badgeHtml += `<span class="ledger-badge badge-applied">[APPLIED]</span>`;
        
        const isRemote = job.remote || (job.location || '').toLowerCase().includes('remote');
        const locationText = isRemote ? 'Remote' : (job.location || 'Unspecified');
        
        const row = document.createElement('div');
        row.className = `ledger-row ${isIgnored ? 'ignored' : ''}`;
        
        row.innerHTML = `
            <div class="ledger-cell">
                <div class="role-cell-wrapper">
                    <div class="role-title-row">
                        <a href="${job.url || '#'}" target="_blank" rel="noopener noreferrer" class="role-title-link">
                            ${escapeHTML(job.title || 'Untitled Position')}
                        </a>
                        <div class="badge-wrapper">${badgeHtml}</div>
                    </div>
                    <span class="company-title">${escapeHTML(job.company || 'Unknown')}</span>
                </div>
            </div>
            <div class="ledger-cell">
                <span class="location-text">${escapeHTML(locationText)}</span>
            </div>
            <div class="ledger-cell">
                <span class="level-mono">${escapeHTML(job.inferredLevel)}</span>
            </div>
            <div class="ledger-cell">
                <span class="posted-mono">${formatISTTimeAgo(job.posted_at || job.scrape_time)}</span>
            </div>
            <div class="ledger-cell actions-cell">
                <button class="action-btn-glyph btn-glyph-save ${isSaved ? 'active' : ''}" title="Save Role">
                    ${isSaved ? '★' : '☆'}
                </button>
                <a href="${job.u || '#'}" target="_blank" rel="noopener noreferrer" class="action-btn-glyph btn-glyph-apply" title="Apply Externally">
                    ↗
                </a>
                <button class="action-btn-glyph btn-glyph-ignore ${isIgnored ? 'active' : ''}" title="Remove/Ignore Role" style="font-size: 1.1em; line-height: 1;">
                    ${isIgnored ? '↺' : '✕'}
                </button>
            </div>
        `;
        
        const btnSave = row.querySelector('.btn-glyph-save');
        btnSave.addEventListener('click', (e) => {
            e.stopPropagation();
            if (Storage.saved.has(job.id)) Storage.saved.delete(job.id);
            else Storage.saved.add(job.id);
            Storage.save('saved', Storage.saved);
            applyFilters();
        });
        
        const btnIgnore = row.querySelector('.btn-glyph-ignore');
        btnIgnore.addEventListener('click', (e) => {
            e.stopPropagation();
            if (Storage.ignored.has(job.id)) Storage.ignored.delete(job.id);
            else Storage.ignored.add(job.id);
            Storage.save('ignored', Storage.ignored);
            applyFilters();
        });
        
        const btnApply = row.querySelector('.btn-glyph-apply');
        btnApply.addEventListener('click', () => {
            Storage.applied.add(job.id);
            Storage.save('applied', Storage.applied);
            setTimeout(applyFilters, 500);
        });
        
        fragment.appendChild(row);
    }
    
    DOM.ledgerRows.appendChild(fragment);
    
    DOM.pageIndicator.textContent = `${String(page).padStart(2, '0')} / ${String(totalPages).padStart(2, '0')}`;
    DOM.btnPrev.disabled = page === 1;
    DOM.btnNext.disabled = page === totalPages || totalPages === 0;
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
    
    ['workplace', 'level', 'ats', 'posted'].forEach(facet => {
        if (state[facet].length > 0) params.set(facet, state[facet].join(','));
    });
    
    if (state.hideRecruiter) params.set('no_rec', '1');
    if (state.hideStale) params.set('verified', '1');
    if (state.savedOnly) params.set('saved', '1');
    if (state.appliedOnly) params.set('applied', '1');
    if (state.showIgnored) params.set('show_ign', '1');
    
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
        DOM.panelFree.classList.add('active'); 
    }
    
    state.minComp = parseInt(params.get('comp') || '0', 10);
    updateCompDisplay();
    
    ['workplace', 'level', 'ats', 'posted'].forEach(facet => {
        const val = params.get(facet);
        if (val) {
            state[facet] = val.split(',');
            state[facet].forEach(item => {
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

DOM.btnPrev.addEventListener('click', () => {
    if (state.currentPage > 1) {
        state.currentPage--;
        requestPage();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
});

DOM.btnNext.addEventListener('click', () => {
    state.currentPage++;
    requestPage();
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

init();
