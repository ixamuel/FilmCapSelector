const ICON_COPY = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
const ICON_CHECK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

const capacitorData = packedData.d.map(r => {
    const o = {};
    packedData.h.forEach((k, i) => o[k] = r[i]);
    return o;
});

let filteredData = [];
let compareList = [];
let isKeepMode = false;
let displayLimit = 100;
let updateTimeout;
let selectedSeries = new Set();
let selectedTypes = new Set();
let selectedVTypes = new Set();
let selectedVoltages = new Set();
let selectedTemps = new Set();
let selectedDielectrics = new Set();
let selectedLeads = new Set();

const distributions = {
    _dia: { bins: 20, max: 100, counts: [] },
    _h: { bins: 20, max: 100, counts: [] },
    _c: { bins: 50, min: 0.001, max: 2000, isLog: true, counts: [] },
    _ripple: { bins: 20, max: 100, counts: [] },
    _w: { bins: 20, max: 100, counts: [] }
};

const globalLimits = { capMin: 0.001, capMax: 2000, diaMin: 0, diaMax: 100, heightMin: 0, heightMax: 100, rippleMin: 0, rippleMax: 100, widthMin: 0, widthMax: 100 };

function debounceUpdate() {
    if (updateTimeout) clearTimeout(updateTimeout);
    updateTimeout = setTimeout(() => applyFilters(), 100);
}

window.addEventListener('DOMContentLoaded', () => {
    initializeData();
    setupEventListeners();
    applyFilters();

    if (window.innerWidth >= 768) {
        const sidebar = document.getElementById('appSidebar');
        if (sidebar) sidebar.classList.add('active');
    }

    // On mobile, the sidebar starts OPEN as requested
    if (window.innerWidth <= 768) {
        const sidebar = document.getElementById('appSidebar');
        const overlay = document.getElementById('sidebarOverlay');
        if (sidebar && overlay) {
            sidebar.classList.add('active');
            overlay.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }
});

function parseRange(str) {
    if (!str) return { min: null, max: null };
    const match = str.match(/(-?\d+)\s*to\s*(-?\d+)/);
    if (match) return { min: parseFloat(match[1]), max: parseFloat(match[2]) };
    return { min: null, max: null };
}

function initializeData() {
    capacitorData.forEach(cap => {
        cap._v = parseFloat(cap['Rated \nVoltage (V)']);
        cap._c = parseFloat(cap['Capacitance\n(uF)']);
        cap._esr = parseFloat(cap['ESR (mΩ)']);
        cap._ripple = parseFloat(cap['Permissible Current (Arms)']);
        cap._h = parseFloat(cap['Height\n(mm)']);
        cap._l = parseFloat(cap['Body length / dia\n(mm)']);
        cap._w = parseFloat(cap['Body width\n(mm)']);
        cap._dia = cap._l; // Keep dia for historical logic
        cap._pn = (cap['PartNumber'] || '').toLowerCase();
        cap._type = (cap['Type'] || 'Other');

        const tempRange = parseRange(cap['Category Temperature Range \n(°C)']);
        cap._tempMin = tempRange.min;
        cap._tempMax = tempRange.max;
    });

    // Initialize Type Tags
    const types = [...new Set(capacitorData.map(c => c._type).filter(t => t))].sort();
    const typeTags = document.getElementById('type-tags');
    if (typeTags) {
        typeTags.innerHTML = '';
        types.forEach(t => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tag-btn active';
            btn.dataset.type = t;
            btn.innerHTML = `${t} <span class="count-badge">0</span>`;
            typeTags.appendChild(btn);
            btn.onclick = () => handleTagClick(btn, 'type', typeTags);
        });
    }

    // Initialize V-Type Tags
    const vtypes = [...new Set(capacitorData.map(c => c['Voltage type']).filter(t => t))].sort();
    const vTypeTags = document.getElementById('vtype-tags');
    if (vTypeTags) {
        vTypeTags.innerHTML = '';
        vtypes.forEach(t => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tag-btn active';
            btn.dataset.vtype = t;
            btn.innerHTML = `${t} <span class="count-badge">0</span>`;
            vTypeTags.appendChild(btn);
            btn.onclick = () => handleTagClick(btn, 'vtype', vTypeTags);
        });
    }

    // Initialize Voltage Tags
    const vs = [...new Set(capacitorData.map(c => c._v).filter(v => !isNaN(v)))].sort((a, b) => a - b);
    const vTags = document.getElementById('voltage-tags');
    if (vTags) {
        vTags.innerHTML = '';
        vs.forEach(v => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tag-btn active';
            btn.dataset.voltage = String(v);
            btn.innerHTML = `${v}V <span class="count-badge">0</span>`;
            vTags.appendChild(btn);
            btn.onclick = () => handleTagClick(btn, 'voltage', vTags);
        });
    }

    // Initialize Temperature Tags
    const temps = [...new Set(capacitorData.map(c => c['Category Temperature Range \n(°C)']).filter(t => t))].sort();
    const tTags = document.getElementById('temp-tags');
    if (tTags) {
        tTags.innerHTML = '';
        temps.forEach(t => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tag-btn active';
            btn.dataset.temp = t;
            btn.innerHTML = `${t} <span class="count-badge">0</span>`;
            tTags.appendChild(btn);
            btn.onclick = () => handleTagClick(btn, 'temp', tTags);
        });
    }

    // Initialize Dielectric Tags
    const dielectrics = [...new Set(capacitorData.map(c => c['Dielectric Material']).filter(t => t))].sort();
    const dTags = document.getElementById('dielectric-tags');
    if (dTags) {
        dTags.innerHTML = '';
        dielectrics.forEach(t => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tag-btn active';
            btn.dataset.dielectric = t;
            btn.innerHTML = `${t} <span class="count-badge">0</span>`;
            dTags.appendChild(btn);
            btn.onclick = () => handleTagClick(btn, 'dielectric', dTags);
        });
    }

    // Initialize Lead Space Tags
    const leads = [...new Set(capacitorData.map(c => c['Lead Space P1\n(mm)']).filter(t => t !== null && t !== undefined))].sort((a, b) => parseFloat(a) - parseFloat(b));
    const lTags = document.getElementById('lead-tags');
    if (lTags) {
        lTags.innerHTML = '';
        leads.forEach(t => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tag-btn active';
            btn.dataset.lead = String(t);
            btn.innerHTML = `${t}mm <span class="count-badge">0</span>`;
            lTags.appendChild(btn);
            btn.onclick = () => handleTagClick(btn, 'lead', lTags);
        });
    }

    // Range Initialization
    const caps = capacitorData.map(c => c._c).filter(v => !isNaN(v));
    globalLimits.capMax = Math.max(...caps) || 2000;
    globalLimits.capMin = Math.min(...caps) || 0.001;
    distributions._c.min = globalLimits.capMin;
    distributions._c.max = globalLimits.capMax;

    const dias = capacitorData.map(c => c._dia).filter(v => !isNaN(v));
    globalLimits.diaMax = Math.max(...dias) || 100;
    globalLimits.diaMin = Math.min(...dias) || 0;
    distributions._dia.max = globalLimits.diaMax;

    const heights = capacitorData.map(c => c._h).filter(v => !isNaN(v));
    globalLimits.heightMax = Math.max(...heights) || 100;
    globalLimits.heightMin = Math.min(...heights) || 0;
    distributions._h.max = globalLimits.heightMax;

    const ripples = capacitorData.map(c => c._ripple).filter(v => !isNaN(v));
    globalLimits.rippleMax = Math.max(...ripples) || 100;
    globalLimits.rippleMin = Math.min(...ripples) || 0;
    distributions._ripple.max = globalLimits.rippleMax;

    const widths = capacitorData.map(c => c._w).filter(v => !isNaN(v));
    globalLimits.widthMax = Math.max(...widths) || 100;
    globalLimits.widthMin = Math.min(...widths) || 0;
    distributions._w.max = globalLimits.widthMax;

    updateSliderInputs();
}

function handleTagClick(btn, type, container) {
    const all = container.querySelectorAll('.tag-btn');
    const active = container.querySelectorAll('.tag-btn.active');
    if (active.length === all.length) {
        all.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    } else {
        btn.classList.toggle('active');
        if (container.querySelectorAll('.tag-btn.active').length === 0) {
            all.forEach(b => b.classList.add('active'));
        }
    }
    debounceUpdate();
}

function updateSliderInputs() {
    const set = (id, val, max, isPlaceholder = false) => {
        const el = document.getElementById(id);
        if (el) {
            if (max !== undefined) el.max = max;
            if (isPlaceholder) {
                el.placeholder = val;
                el.value = '';
            } else {
                el.value = val;
            }
        }
    };
    set('capMin', globalLimits.capMin, undefined, true);
    set('capMax', globalLimits.capMax, undefined, true);
    set('capSliderMin', 0, 1000000);
    set('capSliderMax', 1000000, 1000000);

    set('diaMin', globalLimits.diaMin, undefined, true);
    set('diaMax', globalLimits.diaMax, undefined, true);
    set('diaSliderMin', globalLimits.diaMin, globalLimits.diaMax);
    set('diaSliderMax', globalLimits.diaMax, globalLimits.diaMax);

    set('heightMin', globalLimits.heightMin, undefined, true);
    set('heightMax', globalLimits.heightMax, undefined, true);
    set('heightSliderMin', globalLimits.heightMin, globalLimits.heightMax);
    set('heightSliderMax', globalLimits.heightMax, globalLimits.heightMax);

    set('rippleMin', globalLimits.rippleMin, undefined, true);
    set('rippleMax', globalLimits.rippleMax, undefined, true);
    set('rippleSliderMin', globalLimits.rippleMin, globalLimits.rippleMax);
    set('rippleSliderMax', globalLimits.rippleMax, globalLimits.rippleMax);

    set('widthMin', globalLimits.widthMin, undefined, true);
    set('widthMax', globalLimits.widthMax, undefined, true);
    set('widthSliderMin', globalLimits.widthMin, globalLimits.widthMax);
    set('widthSliderMax', globalLimits.widthMax, globalLimits.widthMax);
}

function calculateDistributions(dataSubset) {
    Object.keys(distributions).forEach(prop => {
        const dist = distributions[prop];
        dist.counts = new Array(dist.bins).fill(0);
        if (dist.isLog) {
            const lMin = Math.log10(dist.min);
            const lMax = Math.log10(dist.max);
            dataSubset.forEach(cap => {
                const val = cap[prop] || dist.min;
                const logVal = Math.log10(Math.max(val, dist.min));
                let bin = Math.floor(((logVal - lMin) / (lMax - lMin)) * dist.bins);
                if (bin >= dist.bins) bin = dist.bins - 1;
                if (bin >= 0) dist.counts[bin]++;
            });
        } else {
            dataSubset.forEach(cap => {
                const val = cap[prop] || 0;
                let bin = Math.floor((val / dist.max) * dist.bins);
                if (bin >= dist.bins) bin = dist.bins - 1;
                if (bin >= 0) dist.counts[bin]++;
            });
        }
    });
}

function renderHistograms() {
    Object.keys(distributions).forEach(prop => {
        const id = 'hist-' + prop.replace('_', '').replace('ripple', 'ripple');
        const container = document.getElementById(id);
        if (!container) return;
        const dist = distributions[prop];
        const maxCount = Math.max(...dist.counts) || 1;
        container.innerHTML = dist.counts.map(c => `<div class="hist-bar" style="height: ${(c / maxCount) * 100}%"></div>`).join('');
    });
}

function updateSeriesDropdown() {
    const preFiltered = getPreFilteredData(true);
    const seriesCounts = {};
    preFiltered.forEach(cap => {
        const s = cap.Series || 'Unknown';
        seriesCounts[s] = (seriesCounts[s] || 0) + 1;
    });

    const seriesList = Object.keys(seriesCounts).sort();
    const container = document.getElementById('series-list');
    const searchTerm = document.getElementById('series-search').value.toLowerCase();
    const filteredSeries = seriesList.filter(s => s.toLowerCase().includes(searchTerm));

    if (container) {
        container.innerHTML = filteredSeries.map(s => {
            const selected = selectedSeries.has(s) ? 'selected' : '';
            return `<div class="series-item ${selected}" data-series="${s}">${s} <span class="count-badge">${seriesCounts[s]}</span></div>`;
        }).join('');

        container.querySelectorAll('.series-item').forEach(item => {
            item.onclick = (e) => {
                e.stopPropagation();
                const s = item.dataset.series;
                if (selectedSeries.has(s)) selectedSeries.delete(s);
                else selectedSeries.add(s);
                updateSeriesDropdown();
                debounceUpdate();
            };
        });
    }

    const toggleText = document.getElementById('series-toggle-text');
    const seriesMenuClear = document.getElementById('series-menu-clear');

    if (toggleText) {
        if (selectedSeries.size === 0) {
            toggleText.textContent = 'All Series';
            toggleText.style.fontSize = '0.8rem';
            if (seriesMenuClear) seriesMenuClear.style.display = 'none';
        } else {
            if (seriesMenuClear) seriesMenuClear.style.display = 'flex';

            if (selectedSeries.size <= 4) {
                toggleText.textContent = Array.from(selectedSeries).join(', ');
                // Dynamic font sizing
                if (selectedSeries.size === 1) toggleText.style.fontSize = '0.8rem';
                else if (selectedSeries.size === 2) toggleText.style.fontSize = '0.75rem';
                else if (selectedSeries.size === 3) toggleText.style.fontSize = '0.7rem';
                else toggleText.style.fontSize = '0.65rem';
            } else {
                toggleText.textContent = `${selectedSeries.size} Series Selected`;
                toggleText.style.fontSize = '0.8rem';
            }
        }
    }
    const totalCount = document.getElementById('series-total-count');
    if (totalCount) totalCount.textContent = filteredSeries.length;
}

function getActiveFilters() {
    const getActive = (gridId, dataAttr) => {
        const container = document.getElementById(gridId);
        if (!container) return new Set();
        const all = container.querySelectorAll('.tag-btn');
        const active = container.querySelectorAll('.tag-btn.active');
        return active.length < all.length ? new Set(Array.from(active).map(b => b.dataset[dataAttr])) : new Set();
    };

    return {
        types: getActive('type-tags', 'type'),
        vtypes: getActive('vtype-tags', 'vtype'),
        voltages: getActive('voltage-tags', 'voltage'),
        temps: getActive('temp-tags', 'temp'),
        dielectrics: getActive('dielectric-tags', 'dielectric'),
        leads: getActive('lead-tags', 'lead'),
        capMin: parseFloat(document.getElementById('capMin').value),
        capMax: parseFloat(document.getElementById('capMax').value),
        esrMax: parseFloat(document.getElementById('esrMax').value),
        rippleMin: parseFloat(document.getElementById('rippleMin').value),
        rippleMax: parseFloat(document.getElementById('rippleMax').value),
        search: document.getElementById('pnSearch').value.toLowerCase(),
        diaMin: parseFloat(document.getElementById('diaMin').value) || 0,
        diaMax: parseFloat(document.getElementById('diaMax').value) || 1000,
        heightMin: parseFloat(document.getElementById('heightMin').value) || 0,
        heightMax: parseFloat(document.getElementById('heightMax').value) || 1000,
        widthMin: parseFloat(document.getElementById('widthMin').value) || 0,
        widthMax: parseFloat(document.getElementById('widthMax').value) || 1000,
        automotive: document.querySelector('#auto-filters .tag-btn.active').dataset.value,
        series: selectedSeries,
        seriesSearch: document.getElementById('series-search').value.toLowerCase()
    };
}

function getPreFilteredData(skipSeries = false, skipCat = null) {
    const f = getActiveFilters();
    return capacitorData.filter(cap => {
        if (isKeepMode && !compareList.includes(cap.PartNumber)) return false;
        if (f.search && !cap._pn.includes(f.search)) return false;
        if (skipCat !== 'type' && f.types.size > 0 && !f.types.has(cap._type)) return false;
        if (skipCat !== 'vtype' && f.vtypes.size > 0 && !f.vtypes.has(cap['Voltage type'])) return false;
        if (skipCat !== 'voltage' && f.voltages.size > 0 && !f.voltages.has(String(cap._v))) return false;
        if (skipCat !== 'temp' && f.temps.size > 0 && !f.temps.has(cap['Category Temperature Range \n(°C)'])) return false;
        if (skipCat !== 'dielectric' && f.dielectrics.size > 0 && !f.dielectrics.has(cap['Dielectric Material'])) return false;
        if (skipCat !== 'lead' && f.leads.size > 0 && !f.leads.has(String(cap['Lead Space P1\n(mm)']))) return false;
        if (!isNaN(f.capMin) && cap._c < f.capMin) return false;
        if (!isNaN(f.capMax) && cap._c > f.capMax) return false;
        if (!isNaN(f.esrMax) && cap._esr > f.esrMax) return false;
        if (!isNaN(f.rippleMin) && cap._ripple < f.rippleMin) return false;
        if (!isNaN(f.rippleMax) && cap._ripple > f.rippleMax) return false;
        if (cap._dia < f.diaMin || cap._dia > f.diaMax) return false;
        if (cap._h < f.heightMin || cap._h > f.heightMax) return false;
        if (cap._w < f.widthMin || cap._w > f.widthMax) return false;
        if (f.automotive !== 'all' && cap['Automotive grade'] !== f.automotive) return false;
        if (!skipSeries) {
            if (f.series.size > 0) {
                if (!f.series.has(cap.Series)) return false;
            } else if (f.seriesSearch) {
                if (!cap.Series || !cap.Series.toLowerCase().includes(f.seriesSearch)) return false;
            }
        }
        return true;
    });
}

function updateTagCounts() {
    // Update Type counts
    const typeData = getPreFilteredData(false, 'type');
    const typeCounts = {};
    typeData.forEach(c => typeCounts[c._type] = (typeCounts[c._type] || 0) + 1);
    document.querySelectorAll('#type-tags .tag-btn').forEach(btn => {
        const count = typeCounts[btn.dataset.type] || 0;
        btn.querySelector('.count-badge').textContent = count;
        btn.classList.toggle('voltage-zero', count === 0);
    });

    // Update V-Type counts
    const vtData = getPreFilteredData(false, 'vtype');
    const vtCounts = {};
    vtData.forEach(c => vtCounts[c['Voltage type']] = (vtCounts[c['Voltage type']] || 0) + 1);
    document.querySelectorAll('#vtype-tags .tag-btn').forEach(btn => {
        const count = vtCounts[btn.dataset.vtype] || 0;
        btn.querySelector('.count-badge').textContent = count;
        btn.classList.toggle('voltage-zero', count === 0);
    });

    // Update Voltage counts
    const vData = getPreFilteredData(false, 'voltage');
    const vCounts = {};
    vData.forEach(c => vCounts[c._v] = (vCounts[c._v] || 0) + 1);
    document.querySelectorAll('#voltage-tags .tag-btn').forEach(btn => {
        const count = vCounts[btn.dataset.voltage] || 0;
        btn.querySelector('.count-badge').textContent = count;
        btn.classList.toggle('voltage-zero', count === 0);
    });

    // Update Temp counts
    const tData = getPreFilteredData(false, 'temp');
    const tCounts = {};
    tData.forEach(c => tCounts[c['Category Temperature Range \n(°C)']] = (tCounts[c['Category Temperature Range \n(°C)']] || 0) + 1);
    document.querySelectorAll('#temp-tags .tag-btn').forEach(btn => {
        const count = tCounts[btn.dataset.temp] || 0;
        btn.querySelector('.count-badge').textContent = count;
        btn.classList.toggle('voltage-zero', count === 0);
    });
    // Update Dielectric counts
    const dData = getPreFilteredData(false, 'dielectric');
    const dCounts = {};
    dData.forEach(c => dCounts[c['Dielectric Material']] = (dCounts[c['Dielectric Material']] || 0) + 1);
    document.querySelectorAll('#dielectric-tags .tag-btn').forEach(btn => {
        const count = dCounts[btn.dataset.dielectric] || 0;
        btn.querySelector('.count-badge').textContent = count;
        btn.classList.toggle('voltage-zero', count === 0);
    });

    // Update Lead Space counts
    const lData = getPreFilteredData(false, 'lead');
    const lCounts = {};
    lData.forEach(c => {
        const key = String(c['Lead Space P1\n(mm)']);
        lCounts[key] = (lCounts[key] || 0) + 1;
    });
    document.querySelectorAll('#lead-tags .tag-btn').forEach(btn => {
        const count = lCounts[btn.dataset.lead] || 0;
        btn.querySelector('.count-badge').textContent = count;
        btn.classList.toggle('voltage-zero', count === 0);
    });
}

let currentSort = { col: null, dir: 1 };

function handleHeaderClick(label) {
    if (currentSort.col !== label) {
        currentSort.col = label;
        currentSort.dir = -1; // Standard to Descending
    } else {
        if (currentSort.dir === -1) {
            currentSort.dir = 1; // Descending to Ascending
        } else {
            currentSort.col = null; // Ascending to Standard
            currentSort.dir = 1;
        }
    }
    applyFilters();
}

function applyFilters() {
    filteredData = getPreFilteredData();
    if (currentSort.col) {
        filteredData.sort((a, b) => {
            let va = a[currentSort.col], vb = b[currentSort.col];

            // Natural numeric sort for strings and numbers
            if (va === null || va === undefined || va === '-') return 1;
            if (vb === null || vb === undefined || vb === '-') return -1;

            const na = parseFloat(va);
            const nb = parseFloat(vb);

            if (!isNaN(na) && !isNaN(nb)) {
                return (na - nb) * currentSort.dir;
            }

            if (typeof va === 'string' && typeof vb === 'string') {
                return va.localeCompare(vb, undefined, { numeric: true, sensitivity: 'base' }) * currentSort.dir;
            }

            if (va < vb) return -1 * currentSort.dir;
            if (va > vb) return 1 * currentSort.dir;
            return 0;
        });
    }
    updateSeriesDropdown();
    updateTagCounts();
    calculateDistributions(filteredData);
    renderHistograms();
    displayLimit = 100;
    renderTable();
}

function formatVal(val, decimals = 1) {
    if (val === undefined || val === null || val === '') return '-';
    const num = parseFloat(val);
    return isNaN(num) ? val : num.toFixed(decimals);
}

function renderTable() {
    const container = document.getElementById('results-container');
    document.getElementById('resultsCount').textContent = `${filteredData.length} matches`;
    if (filteredData.length === 0) {
        container.innerHTML = '<div style="padding:40px; text-align:center;">No parts found.</div>';
        return;
    }

    // Row order based on Excel: 
    // Type, V, V-type, Cap, Tol, Arms, ESR, L/D, W, H, LeadSpace, Temp, MOQ, Dielectric, Auto, Series, PartNumber
    // We'll keep PartNumber as the primary identifier (second column after checkbox)
    const headers = [
        { l: 'PartNumber', d: 'Part Number' },
        { l: 'Type', d: 'Type' },
        { l: 'Rated \nVoltage (V)', d: 'Voltage' },
        { l: 'Voltage type', d: 'V-Type' },
        { l: 'Capacitance\n(uF)', d: 'Cap.' },
        { l: 'C Tol.\n(%)', d: 'Tol.' },
        { l: 'Permissible Current (Arms)', d: 'Arms' },
        { l: 'ESR (mΩ)', d: 'ESR' },
        { l: 'Body length / dia\n(mm)', d: 'L/D' },
        { l: 'Body width\n(mm)', d: 'W' },
        { l: 'Height\n(mm)', d: 'H' },
        { l: 'Lead Space P1\n(mm)', d: 'Lead Space' },
        { l: 'Category Temperature Range \n(°C)', d: 'Temp' },
        { l: 'MOQ\n(pcs)', d: 'MOQ' },
        { l: 'Dielectric Material', d: 'Dielectric' },
        { l: 'Automotive grade', d: 'Auto' },
        { l: 'Series', d: 'Series' }
    ];

    let thead = '<thead><tr><th style="width:30px;"><input type="checkbox" id="selectAll"></th>';
    headers.forEach(h => {
        let arrow = currentSort.col === h.l ? (currentSort.dir === 1 ? ' ▲' : ' ▼') : '';
        // Escape newlines in label for the onclick JS handler
        const escapedLabel = h.l.replace(/\n/g, '\\n');
        thead += `<th onclick="handleHeaderClick('${escapedLabel}')" style="cursor:pointer; user-select:none; white-space:nowrap;">${h.d || h.l}${arrow}</th>`;
    });
    thead += '</tr></thead>';

    const dataToDisplay = filteredData.slice(0, displayLimit);
    let tbody = '<tbody>' + dataToDisplay.map(cap => {
        const isSelected = compareList.includes(cap.PartNumber);
        return `<tr class="${isSelected ? 'selected' : ''}">
            <td><input type="checkbox" class="compare-check" data-pn="${cap.PartNumber}" ${isSelected ? 'checked' : ''}></td>
            <td><div class="pn-container"><a href="https://industry.panasonic.eu/productfinder?search=${cap.PartNumber}" target="_blank" class="pn-link"><strong>${cap.PartNumber}</strong></a><button class="copy-btn" data-pn="${cap.PartNumber}">${ICON_COPY}</button></div></td>
            <td>${cap.Type}</td>
            <td>${cap['Rated \nVoltage (V)']}V</td>
            <td>${cap['Voltage type']}</td>
            <td>${cap['Capacitance\n(uF)']}µF</td>
            <td>${cap['C Tol.\n(%)']}</td>
            <td>${formatVal(cap['Permissible Current (Arms)'], 2)}</td>
            <td>${formatVal(cap['ESR (mΩ)'], 1)}</td>
            <td>${formatVal(cap['Body length / dia\n(mm)'], 1)}</td>
            <td>${formatVal(cap['Body width\n(mm)'], 1)}</td>
            <td>${formatVal(cap['Height\n(mm)'], 1)}</td>
            <td>${formatVal(cap['Lead Space P1\n(mm)'], 1)}</td>
            <td>${cap['Category Temperature Range \n(°C)']}</td>
            <td>${cap['MOQ\n(pcs)']}</td>
            <td>${cap['Dielectric Material']}</td>
            <td>${cap['Automotive grade']}</td>
            <td>${cap.Series}</td>
        </tr>`;
    }).join('') + '</tbody>';

    container.innerHTML = `<table class="results-table">${thead}${tbody}</table>`;
    if (filteredData.length > displayLimit) {
        const btnLimit = document.createElement('div');
        btnLimit.style.textAlign = 'center'; btnLimit.style.padding = '20px';
        btnLimit.innerHTML = `<button class="tag-btn">Load More (${filteredData.length - displayLimit})</button>`;
        btnLimit.onclick = () => { displayLimit += 100; renderTable(); };
        container.appendChild(btnLimit);
    }
    setupTableInteractions(container);
}

function setupTableInteractions(container) {
    if (!container) return;
    container.querySelectorAll('.copy-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(btn.dataset.pn).then(() => {
                btn.innerHTML = ICON_CHECK;
                setTimeout(() => btn.innerHTML = ICON_COPY, 2000);
            });
        };
    });
    container.querySelectorAll('.compare-check').forEach(cb => {
        cb.onchange = () => {
            if (cb.checked) { if (!compareList.includes(cb.dataset.pn)) compareList.push(cb.dataset.pn); }
            else compareList = compareList.filter(pn => pn !== cb.dataset.pn);
            updateCompareBar();
        };
    });
    const selectAll = container.querySelector('#selectAll');
    if (selectAll) {
        selectAll.onchange = () => {
            const checks = container.querySelectorAll('.compare-check');
            checks.forEach(c => {
                c.checked = selectAll.checked;
                if (c.checked) { if (!compareList.includes(c.dataset.pn)) compareList.push(c.dataset.pn); }
                else compareList = compareList.filter(pn => pn !== c.dataset.pn);
            });
            updateCompareBar();
        };
    }
}

function updateCompareBar() {
    const wrap = document.getElementById('compareBarWrap');
    if (!wrap) return;

    const count = compareList.length;
    document.getElementById('compareText').textContent = `Selection (${count})`;

    const list = document.getElementById('selectionList');
    list.innerHTML = compareList.map(pn => `
        <span class="selection-pn">
            ${pn}
            <span class="remove-btn" data-pn="${pn}">×</span>
        </span>
    `).join('');

    // Setup remove functionality
    list.querySelectorAll('.remove-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const pn = btn.dataset.pn;
            compareList = compareList.filter(item => item !== pn);
            updateCompareBar();
            renderTable(); // Update checkbox in table
        };
    });

    wrap.style.display = count > 0 ? 'flex' : 'none';
    const bar = document.getElementById('compareBar');
    if (bar) {
        bar.classList.toggle('visible', count > 0);
        // Make entire bar clickable to show modal
        bar.onclick = (e) => {
            if (!e.target.closest('.compare-btn') && !e.target.closest('.remove-btn')) {
                document.getElementById('showCompare').click();
            }
        };
    }
    if (isKeepMode) {
        document.getElementById('keepSelection').classList.add('active');
    } else {
        document.getElementById('keepSelection').classList.remove('active');
    }
}

function resetFilters() {
    // Reset Search
    document.getElementById('pnSearch').value = '';

    // Reset Tags
    document.querySelectorAll('.tag-group').forEach(group => {
        const btns = group.querySelectorAll('.tag-btn');
        btns.forEach(btn => btn.classList.add('active'));
    });

    // Reset Automotive
    document.querySelectorAll('#auto-filters .tag-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.value === 'all') btn.classList.add('active');
    });

    // Reset Series
    selectedSeries.clear();
    const sc = document.getElementById('series-search');
    if (sc) sc.value = '';
    updateSeriesDropdown();

    // Reset Sliders
    const resetSlider = (minId, maxId, sMinId, sMaxId, trackId, minVal, maxVal, isLog) => {
        const sMin = document.getElementById(sMinId);
        const sMax = document.getElementById(sMaxId);
        const iMin = document.getElementById(minId);
        const iMax = document.getElementById(maxId);
        const track = document.getElementById(trackId);

        if (sMin && sMax) {
            sMin.value = isLog ? 0 : minVal;
            sMax.value = isLog ? 1000000 : maxVal;
            if (track) {
                track.style.left = '0%';
                track.style.width = '100%';
            }
            if (iMin && iMax) {
                iMin.placeholder = minVal;
                iMax.placeholder = maxVal;
                iMin.value = '';
                iMax.value = '';
            }
        }
    };

    resetSlider('capMin', 'capMax', 'capSliderMin', 'capSliderMax', 'capTrack', globalLimits.capMin, globalLimits.capMax, true);
    resetSlider('diaMin', 'diaMax', 'diaSliderMin', 'diaSliderMax', 'diaTrack', globalLimits.diaMin, globalLimits.diaMax, false);
    resetSlider('heightMin', 'heightMax', 'heightSliderMin', 'heightSliderMax', 'heightTrack', globalLimits.heightMin, globalLimits.heightMax, false);
    resetSlider('rippleMin', 'rippleMax', 'rippleSliderMin', 'rippleSliderMax', 'rippleTrack', globalLimits.rippleMin, globalLimits.rippleMax, false);
    resetSlider('widthMin', 'widthMax', 'widthSliderMin', 'widthSliderMax', 'widthTrack', globalLimits.widthMin, globalLimits.widthMax, false);

    const esrMax = document.getElementById('esrMax');
    if (esrMax) esrMax.value = 10000;

    debounceUpdate();
}

function openExportWindow() {
    const selected = compareList.map(pn => capacitorData.find(c => c.PartNumber === pn)).filter(Boolean);
    if (selected.length === 0) return;

    const win = window.open('', '_blank');
    win.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>FilmCap - Export Selection</title>
            <style>
                :root { --primary: #4f46e5; --bg: #f8fafc; --text: #1e293b; --border: #e2e8f0; }
                body { font-family: 'Inter', sans-serif; padding: 40px; background: var(--bg); color: var(--text); }
                .header-actions { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
                h2 { margin: 0; color: var(--primary); }
                .btn { background: #10b981; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 600; }
                table { border-collapse: collapse; width: 100%; background: white; border-radius: 12px; overflow: hidden; border: 1px solid var(--border); font-size: 0.8rem; }
                th { background: #f1f5f9; padding: 12px; border-bottom: 2px solid var(--border); text-transform: uppercase; font-size: 0.7rem; }
                td { padding: 12px; border-bottom: 1px solid var(--border); text-align: center; }
            </style>
        </head>
        <body>
            <div class="header-actions">
                <h2>Selected Film Capacitors</h2>
                <button class="btn" onclick="copyTable()">Copy Table</button>
            </div>
            <table id="exportTable">
                <thead>
                    <tr>
                        <th>Part Number</th>
                        <th>Type</th>
                        <th>Voltage</th>
                        <th>V-Type</th>
                        <th>Capacitance</th>
                        <th>Tolerance</th>
                        <th>Arms</th>
                        <th>ESR</th>
                        <th>L/D</th>
                        <th>W</th>
                        <th>H</th>
                        <th>Lead Space</th>
                        <th>Temp</th>
                        <th>MOQ</th>
                        <th>Dielectric</th>
                        <th>Auto</th>
                        <th>Series</th>
                    </tr>
                </thead>
                <tbody>
                    ${selected.map(c => `
                        <tr>
                            <td><strong>${c.PartNumber}</strong></td>
                            <td>${c.Type}</td>
                            <td>${c['Rated \nVoltage (V)']}V</td>
                            <td>${c['Voltage type']}</td>
                            <td>${c['Capacitance\n(uF)']}µF</td>
                            <td>${c['C Tol.\n(%)']}</td>
                            <td>${formatVal(c['Permissible Current (Arms)'], 2)}</td>
                            <td>${formatVal(c['ESR (mΩ)'], 1)}</td>
                            <td>${formatVal(c._l)}</td>
                            <td>${formatVal(c._w)}</td>
                            <td>${formatVal(c._h)}</td>
                            <td>${formatVal(c['Lead Space P1\n(mm)'], 1)}</td>
                            <td>${c['Category Temperature Range \n(°C)']}</td>
                            <td>${c['MOQ\n(pcs)']}</td>
                            <td>${c['Dielectric Material']}</td>
                            <td>${c['Automotive grade']}</td>
                            <td>${c.Series}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <script>
                async function copyTable() {
                    const table = document.getElementById('exportTable');
                    const html = '<style>table{border-collapse:collapse;width:100%;}th,td{border:1px solid #ccc;padding:8px;text-align:center;}</style>' + table.outerHTML;
                    const blob = new Blob([html], { type: 'text/html' });
                    const data = [new ClipboardItem({ 'text/html': blob })];
                    await navigator.clipboard.write(data);
                    alert('Copied to clipboard!');
                }
            <\/script>
        </body>
        </html>
    `);
    win.document.close();
}

function setupEventListeners() {
    const toggleBtn = document.getElementById('toggleSidebar');
    if (toggleBtn) {
        toggleBtn.onclick = () => {
            const sidebar = document.getElementById('appSidebar');
            const overlay = document.getElementById('sidebarOverlay');
            if (sidebar) {
                // Desktop uses 'collapsed', mobile uses 'active'
                if (window.innerWidth > 768) {
                    sidebar.classList.toggle('collapsed');
                } else {
                    const isActive = sidebar.classList.toggle('active');
                    if (overlay) overlay.classList.toggle('active', isActive);
                    document.body.style.overflow = isActive ? 'hidden' : '';
                }
            }
        };
    }

    const overlay = document.getElementById('sidebarOverlay');
    if (overlay) {
        overlay.onclick = () => {
            const sidebar = document.getElementById('appSidebar');
            if (sidebar) sidebar.classList.remove('active');
            overlay.classList.remove('active');
            document.body.style.overflow = '';
        };
    }

    // Section Header Toggles
    document.querySelectorAll('.section-header').forEach(header => {
        header.onclick = (e) => {
            // Prevent toggle if clicking the info button
            if (e.target.closest('.dim-info-btn')) return;
            header.parentElement.classList.toggle('section-collapsed');
        };
    });

    // Dimension Info Popup Logic
    const dimInfoBtn = document.getElementById('dimInfoBtn');
    const dimPopup = document.getElementById('dimInfoPopup');
    const closeDimPopup = document.getElementById('closeDimPopup');

    if (dimInfoBtn && dimPopup) {
        dimInfoBtn.onclick = (e) => {
            e.stopPropagation();
            const isVisible = dimPopup.classList.toggle('visible');
            dimInfoBtn.classList.toggle('active', isVisible);
        };
    }

    if (closeDimPopup && dimPopup) {
        closeDimPopup.onclick = (e) => {
            e.stopPropagation();
            dimPopup.classList.remove('visible');
            if (dimInfoBtn) dimInfoBtn.classList.remove('active');
        };
    }

    // Close popup on outside click
    document.addEventListener('click', (e) => {
        if (dimPopup && dimPopup.classList.contains('visible')) {
            if (!dimPopup.contains(e.target) && !dimInfoBtn.contains(e.target)) {
                dimPopup.classList.remove('visible');
                dimInfoBtn.classList.remove('active');
            }
        }
    });

    const inputs = ['pnSearch', 'capMin', 'capMax', 'esrMax', 'rippleMin', 'rippleMax', 'diaMin', 'diaMax', 'heightMin', 'heightMax', 'widthMin', 'widthMax'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.oninput = debounceUpdate;
    });

    document.querySelectorAll('#auto-filters .tag-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('#auto-filters .tag-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active'); debounceUpdate();
        };
    });

    const clearAll = document.getElementById('clearAll');
    if (clearAll) clearAll.onclick = resetFilters;

    const seriesToggle = document.getElementById('series-toggle');
    if (seriesToggle) {
        seriesToggle.onclick = () => {
            const menu = document.getElementById('series-dropdown-container');
            if (menu) menu.classList.toggle('active');
        };
    }

    const seriesSearch = document.getElementById('series-search');
    if (seriesSearch) {
        seriesSearch.oninput = () => {
            updateSeriesDropdown();
            debounceUpdate();
        };
    }

    const seriesMenuClear = document.getElementById('series-menu-clear');
    if (seriesMenuClear) {
        seriesMenuClear.onclick = (e) => {
            e.stopPropagation();
            selectedSeries.clear();
            const sc = document.getElementById('series-search');
            if (sc) sc.value = '';
            updateSeriesDropdown();
            debounceUpdate();
        };
    }

    const setupDual = (sMin, sMax, iMin, iMax, track, isLog) => {
        if (!sMin || !sMax) return;
        const updateFromSliders = () => {
            let vMin = parseFloat(sMin.value), vMax = parseFloat(sMax.value);
            if (vMin > vMax) { sMin.value = vMax; vMin = vMax; }
            const min = parseFloat(sMin.min), max = parseFloat(sMax.max);
            const range = max - min;
            if (range > 0 && track) {
                track.style.left = ((vMin - min) / range * 100) + '%';
                track.style.width = ((vMax - vMin) / range * 100) + '%';
            }

            const formatPrecision = (num) => {
                if (num === null || num === undefined) return '';
                // If it's effectively an integer, don't show decimals
                if (Math.abs(num - Math.round(num)) < 0.000001) return Math.round(num).toString();
                // Otherwise show up to 3 decimals, trimming trailing zeros
                return parseFloat(num.toFixed(3)).toString();
            };

            if (isLog) {
                const sMaxVal = parseFloat(sMax.max);
                const lMin = Math.log10(globalLimits.capMin), lMax = Math.log10(globalLimits.capMax);
                const valMin = Math.pow(10, lMin + (vMin / sMaxVal) * (lMax - lMin));
                const valMax = Math.pow(10, lMin + (vMax / sMaxVal) * (lMax - lMin));
                if (document.activeElement !== iMin) iMin.value = formatPrecision(valMin);
                if (document.activeElement !== iMax) iMax.value = formatPrecision(valMax);
            } else {
                if (document.activeElement !== iMin) iMin.value = formatPrecision(vMin);
                if (document.activeElement !== iMax) iMax.value = formatPrecision(vMax);
            }
            debounceUpdate();
        };

        const updateFromInputs = () => {
            let iMinVal = parseFloat(iMin.value), iMaxVal = parseFloat(iMax.value);
            if (isNaN(iMinVal)) iMinVal = isLog ? globalLimits.capMin : parseFloat(sMin.min);
            if (isNaN(iMaxVal)) iMaxVal = isLog ? globalLimits.capMax : parseFloat(sMax.max);

            if (isLog) {
                const sMaxVal = parseFloat(sMax.max);
                const lm = Math.log10(globalLimits.capMin), lmx = Math.log10(globalLimits.capMax);
                const lMin = Math.log10(Math.max(iMinVal, globalLimits.capMin));
                const lMax = Math.log10(Math.max(iMaxVal, globalLimits.capMin));
                sMin.value = (lMin - lm) / (lmx - lm) * sMaxVal;
                sMax.value = (lMax - lm) / (lmx - lm) * sMaxVal;
            } else {
                sMin.value = iMinVal;
                sMax.value = iMaxVal;
            }

            // Update track UI without overwriting inputs
            let vMin = parseFloat(sMin.value), vMax = parseFloat(sMax.value);
            const min = parseFloat(sMin.min), max = parseFloat(sMax.max);
            const range = max - min;
            if (range > 0 && track) {
                track.style.left = ((vMin - min) / range * 100) + '%';
                track.style.width = ((vMax - vMin) / range * 100) + '%';
            }
            debounceUpdate();
        };

        sMin.oninput = updateFromSliders;
        sMax.oninput = updateFromSliders;
        iMin.oninput = updateFromInputs;
        iMax.oninput = updateFromInputs;

        // Initialize display
        updateFromSliders();
        // But clear the values initially to show placeholders if they match limits
        if (iMin.value == globalLimits.capMin || iMin.value == sMin.min) iMin.value = '';
        if (iMax.value == globalLimits.capMax || iMax.value == sMax.max) iMax.value = '';
    };

    setupDual(document.getElementById('capSliderMin'), document.getElementById('capSliderMax'), document.getElementById('capMin'), document.getElementById('capMax'), document.getElementById('capTrack'), true);
    setupDual(document.getElementById('diaSliderMin'), document.getElementById('diaSliderMax'), document.getElementById('diaMin'), document.getElementById('diaMax'), document.getElementById('diaTrack'), false);
    setupDual(document.getElementById('heightSliderMin'), document.getElementById('heightSliderMax'), document.getElementById('heightMin'), document.getElementById('heightMax'), document.getElementById('heightTrack'), false);
    setupDual(document.getElementById('rippleSliderMin'), document.getElementById('rippleSliderMax'), document.getElementById('rippleMin'), document.getElementById('rippleMax'), document.getElementById('rippleTrack'), false);
    setupDual(document.getElementById('widthSliderMin'), document.getElementById('widthSliderMax'), document.getElementById('widthMin'), document.getElementById('widthMax'), document.getElementById('widthTrack'), false);

    const showCompare = document.getElementById('showCompare');
    if (showCompare) {
        showCompare.onclick = () => {
            const selected = compareList.map(pn => capacitorData.find(c => c.PartNumber === pn)).filter(Boolean);
            let table = '<table class="compare-table"><thead><tr><th>Part Number</th>' +
                selected.map(c => `<th>${c.PartNumber}</th>`).join('') + '</tr></thead><tbody>';

            const rows = [
                { l: 'Type', k: '_type' },
                { l: 'Voltage Type', k: 'Voltage type' },
                { l: 'Voltage (V)', k: '_v', s: 'V' },
                { l: 'Capacitance (µF)', k: '_c', s: 'µF' },
                { l: 'Series', k: 'Series' },
                { l: 'Material', k: 'Dielectric Material' },
                { l: 'Size L (mm)', k: '_l' },
                { l: 'Size W (mm)', k: '_w' },
                { l: 'Size H (mm)', k: '_h' },
                { l: 'Lead Space P1', k: 'Lead Space P1\n(mm)' },
                { l: 'Temperature', k: 'Category Temperature Range \n(°C)' },
                { l: 'Status', k: 'Status' }
            ];

            rows.forEach(r => {
                table += `<tr><td><strong>${r.l}</strong></td>` +
                    selected.map(c => `<td>${formatVal(c[r.k], 1)}${r.s || ''}</td>`).join('') + '</tr>';
            });

            table += '</tbody></table>';
            document.getElementById('compareTableWrapper').innerHTML = table;
            document.getElementById('compareModal').style.display = 'flex';
        };
    }

    const keepSelection = document.getElementById('keepSelection');
    if (keepSelection) {
        keepSelection.onclick = () => {
            if (compareList.length > 0) {
                isKeepMode = !isKeepMode;
                keepSelection.style.background = isKeepMode ? '#10b981' : '';
                applyFilters();
            }
        };
    }

    const clearSelection = document.getElementById('clearSelection');
    if (clearSelection) {
        clearSelection.onclick = () => {
            compareList = [];
            isKeepMode = false;
            if (keepSelection) keepSelection.style.background = '';
            document.querySelectorAll('.compare-check').forEach(cb => cb.checked = false);
            updateCompareBar();
            renderTable();
        };
    }

    const exportBtn = document.getElementById('exportSelection');
    if (exportBtn) exportBtn.onclick = openExportWindow;

    const openProducts = document.getElementById('openProducts');
    if (openProducts) {
        openProducts.onclick = () => {
            if (compareList.length === 0) { alert('Please select at least one part.'); return; }
            compareList.forEach(pn => {
                const url = `https://industry.panasonic.eu/productfinder?search=${pn}`;
                window.open(url, '_blank');
            });
        };
    }

    const openOctopart = document.getElementById('openOctopart');
    if (openOctopart) {
        openOctopart.onclick = () => {
            compareList.forEach(pn => window.open(`https://octopart.com/search?q=${pn}`, '_blank'));
        };
    }

    const openMouser = document.getElementById('openMouser');
    if (openMouser) {
        openMouser.onclick = () => {
            compareList.forEach(pn => window.open(`https://www.mouser.com/Search/Refine?Keyword=${pn}`, '_blank'));
        };
    }

    const openFarnell = document.getElementById('openFarnell');
    if (openFarnell) {
        openFarnell.onclick = () => {
            compareList.forEach(pn => window.open(`https://de.farnell.com/search?brand=panasonic&st=${pn}`, '_blank'));
        };
    }

    const closeModal = document.getElementById('closeModal');
    if (closeModal) closeModal.onclick = () => document.getElementById('compareModal').style.display = 'none';

    window.onclick = (e) => {
        if (e.target === document.getElementById('compareModal')) document.getElementById('compareModal').style.display = 'none';
        if (!e.target.closest('.dropdown-container')) {
            const sc = document.getElementById('series-dropdown-container');
            if (sc) sc.classList.remove('active');
        }
    };
}
