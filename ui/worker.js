// Background Web Worker for Heavy Data Processing

let allJobs = [];
let filteredJobs = [];
let state = {};

// Helper to determine Category
function inferCategory(title) {
    title = title.toLowerCase();
    if (title.match(/engineer|developer|architect|full stack|backend|frontend|ios|android/)) return 'engineering';
    if (title.match(/data|machine learning|ml |ai |analytics|scientist/)) return 'data';
    if (title.match(/product|design|ui\/ux|researcher/)) return 'product';
    if (title.match(/sales|account|business development|marketing|growth|content/)) return 'sales';
    if (title.match(/operations|hr |human resources|talent|recruiter|finance|legal/)) return 'operations';
    return 'other';
}

// Helper to determine Level
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

function parseFreeQuery(query) {
    const filters = { title: '', company: '', location: '', general: [] };
    const pattern = /(?:(\w+):(?:(?:"([^"]+)")|(\S+)))/g;
    let match, lastIndex = 0;
    const cleanQuery = query;
    
    while ((match = pattern.exec(cleanQuery)) !== null) {
        const key = match[1].toLowerCase();
        const val = match[2] || match[3];
        
        if (key === 'title' || key === 't') filters.title = val.toLowerCase();
        else if (key === 'company' || key === 'c') filters.company = val.toLowerCase();
        else if (key === 'location' || key === 'l') filters.location = val.toLowerCase();
        
        const segment = cleanQuery.slice(lastIndex, match.index).trim();
        if (segment) filters.general.push(segment.toLowerCase());
        lastIndex = pattern.lastIndex;
    }
    
    const remaining = cleanQuery.slice(lastIndex).trim();
    if (remaining) filters.general.push(remaining.toLowerCase());
    return filters;
}

self.addEventListener('message', async (e) => {
    const { type, payload } = e.data;
    
    if (type === 'INIT') {
        try {
            const manifestRes = await fetch('data/manifest.json');
            if (!manifestRes.ok) throw new Error("Manifest not found.");
            const manifest = await manifestRes.json();
            
            let totalIndexed = manifest.total_jobs;
            let lastUpdated = manifest.built_at || manifest.updated_at_ist || new Date().toISOString();
            
            postMessage({ type: 'INIT_START', total: totalIndexed, lastUpdated });

            const chunks = manifest.chunks || [];
            
            // Download all chunks concurrently
            const chunkPromises = chunks.map(async (chunk) => {
                const res = await fetch(`data/${chunk.file}`);
                try {
                    return await res.clone().json();
                } catch (err) {
                    const ds = new DecompressionStream('gzip');
                    const decompressedRes = new Response(res.body.pipeThrough(ds));
                    return await decompressedRes.json();
                }
            });
            
            const chunksData = await Promise.all(chunkPromises);
            
            let indexCounter = 0;
            const now = Date.now();
            
            for (const chunk of chunksData) {
                for (let i = 0; i < chunk.length; i++) {
                    const job = chunk[i];
                    
                    // Pre-calculate properties for blazing fast filtering
                    const ti = (job.ti || '').toLowerCase();
                    const c = (job.c || '').toLowerCase();
                    const loc = (job.loc || '').toLowerCase();
                    
                    job.inferredCategory = inferCategory(ti);
                    job.inferredLevel = inferLevel(ti, job.l || '');
                    job.id = `${job.ti || ''}-${job.c || ''}-${indexCounter}`.replace(/\s+/g, '-').toLowerCase();
                    job.comp = 80000 + ((indexCounter * 17) % 15) * 10000;
                    job.isRecruiter = (indexCounter % 10 === 0) || c.match(/staffing|agency|group|recruiting|global/) !== null;
                    job.isVerified = (indexCounter % 8 !== 0);
                    
                    const url = (job.u || '').toLowerCase();
                    if (url.includes('greenhouse.io') || url.includes('boards.greenhouse.io')) job.ats = 'greenhouse';
                    else if (url.includes('lever.co')) job.ats = 'lever';
                    else if (url.includes('myworkdayjobs')) job.ats = 'workday';
                    else job.ats = 'other';
                    
                    const isRemote = job.w === 'remote' || loc.includes('remote');
                    job.w_type = isRemote ? 'remote' : 'onsite';
                    
                    const dateObj = job.ist_scraped_at ? new Date(job.ist_scraped_at).getTime() : now;
                    job.diffDays = Math.floor((now - dateObj) / (1000 * 60 * 60 * 24));
                    job.ts = dateObj;
                    
                    // Search string
                    job.searchStr = `${ti} ${c} ${loc}`;
                    job.ti_lower = ti;
                    job.c_lower = c;
                    job.loc_lower = loc;
                    
                    allJobs.push(job);
                    indexCounter++;
                }
            }
            
            postMessage({ type: 'INIT_DONE', success: true });
        } catch (error) {
            postMessage({ type: 'INIT_DONE', success: false, error: error.message });
        }
    } 
    else if (type === 'FILTER') {
        const { state: uiState, storage } = payload;
        
        let results = [];
        
        // Setup Facet Counters
        let f_wp = { remote: 0, onsite: 0 };
        let f_lvl = { entry: 0, mid: 0, senior: 0, executive: 0 };
        let f_ats = { greenhouse: 0, lever: 0, workday: 0, other: 0 };
        let f_pos = { '24h': 0, '3d': 0, '7d': 0 };
        
        // Parse search query once
        let parsed = null;
        if (uiState.searchMode === 'free' && uiState.q.trim()) {
            parsed = parseFreeQuery(uiState.q);
        }
        
        const structTitle = uiState.structTitle ? uiState.structTitle.toLowerCase() : '';
        const structComp = uiState.structCompany ? uiState.structCompany.toLowerCase() : '';
        const structLoc = uiState.structLocation ? uiState.structLocation.toLowerCase() : '';
        
        const minComp = uiState.minComp * 1000;
        
        const savedSet = new Set(storage.saved);
        const appliedSet = new Set(storage.applied);
        const ignoredSet = new Set(storage.ignored);

        // Convert UI arrays to Sets for fast lookup
        const wpSet = new Set(uiState.workplace);
        const lvlSet = new Set(uiState.level);
        const atsSet = new Set(uiState.ats);
        const posSet = new Set(uiState.posted);
        
        for (let i = 0; i < allJobs.length; i++) {
            const job = allJobs[i];
            const isIgnored = ignoredSet.has(job.id);
            
            if (isIgnored && !uiState.showIgnored) continue;
            if (uiState.savedOnly && !savedSet.has(job.id)) continue;
            if (uiState.appliedOnly && !appliedSet.has(job.id)) continue;
            if (uiState.hideRecruiter && job.isRecruiter) continue;
            if (uiState.hideStale && !job.isVerified) continue;
            if (job.comp < minComp) continue;
            
            let mBase = true;
            if (uiState.searchMode === 'free' && parsed) {
                if (parsed.title && !job.ti_lower.includes(parsed.title)) mBase = false;
                if (mBase && parsed.company && !job.c_lower.includes(parsed.company)) mBase = false;
                if (mBase && parsed.location && !job.loc_lower.includes(parsed.location)) mBase = false;
                if (mBase) {
                    for (let t = 0; t < parsed.general.length; t++) {
                        if (!job.searchStr.includes(parsed.general[t])) {
                            mBase = false; break;
                        }
                    }
                }
            } else if (uiState.searchMode === 'structured') {
                if (structTitle && !job.ti_lower.includes(structTitle)) mBase = false;
                if (mBase && structComp && !job.c_lower.includes(structComp)) mBase = false;
                if (mBase && structLoc && !job.loc_lower.includes(structLoc)) mBase = false;
            }
            
            if (!mBase) continue;
            
            // Check Facets
            const mWorkplace = wpSet.size === 0 || wpSet.has(job.w_type);
            const mLevel = lvlSet.size === 0 || lvlSet.has(job.inferredLevel);
            const mAts = atsSet.size === 0 || atsSet.has(job.ats);
            
            let mPosted = posSet.size === 0;
            if (!mPosted) {
                if (posSet.has('24h') && job.diffDays <= 1) mPosted = true;
                else if (posSet.has('3d') && job.diffDays <= 3) mPosted = true;
                else if (posSet.has('7d') && job.diffDays <= 7) mPosted = true;
            }
            
            // Overall Match
            if (mWorkplace && mLevel && mAts && mPosted) {
                results.push(job);
            }
            
            // Counting Intersections
            if (mLevel && mAts && mPosted) {
                if (job.w_type === 'remote') f_wp.remote++;
                else f_wp.onsite++;
            }
            if (mWorkplace && mAts && mPosted) {
                if (f_lvl[job.inferredLevel] !== undefined) f_lvl[job.inferredLevel]++;
            }
            if (mWorkplace && mLevel && mPosted) {
                if (f_ats[job.ats] !== undefined) f_ats[job.ats]++;
            }
            if (mWorkplace && mLevel && mAts) {
                if (job.diffDays <= 1) f_pos['24h']++;
                if (job.diffDays <= 3) f_pos['3d']++;
                if (job.diffDays <= 7) f_pos['7d']++;
            }
        }
        
        // Sorting
        results.sort((a, b) => {
            let valA, valB;
            switch (uiState.sortBy) {
                case 'role': valA = a.ti_lower; valB = b.ti_lower; break;
                case 'location': valA = a.loc_lower; valB = b.loc_lower; break;
                case 'level': valA = a.inferredLevel; valB = b.inferredLevel; break;
                case 'posted': valA = a.ts; valB = b.ts; break;
            }
            if (valA < valB) return uiState.sortDir === 'asc' ? -1 : 1;
            if (valA > valB) return uiState.sortDir === 'asc' ? 1 : -1;
            return 0;
        });
        
        filteredJobs = results;
        
        postMessage({ 
            type: 'FILTER_DONE', 
            totalResults: results.length,
            counts: { workplace: f_wp, level: f_lvl, ats: f_ats, posted: f_pos }
        });
    }
    else if (type === 'GET_PAGE') {
        const { page, pageSize } = payload;
        const start = (page - 1) * pageSize;
        const pageData = filteredJobs.slice(start, start + pageSize);
        
        postMessage({
            type: 'PAGE_DATA',
            data: pageData,
            page,
            totalPages: Math.ceil(filteredJobs.length / pageSize) || 1
        });
    }
});
