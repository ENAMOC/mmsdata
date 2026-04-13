// ==================== FIREBASE CONFIGURATION (read-only) ====================
const firebaseConfig = {
    apiKey: "AIzaSyBgQ-NRH_UFKwEt0PybJ3y2zKGvRSqvLoU",
    authDomain: "portfolio-70f03.firebaseapp.com",
    databaseURL: "https://portfolio-70f03-default-rtdb.firebaseio.com",
    projectId: "portfolio-70f03",
    storageBucket: "portfolio-70f03.firebasestorage.app",
    messagingSenderId: "815368927704",
    appId: "1:815368927704:web:119b288294c5b26d2e1aad"
};

// Global Firebase reference
let database;

// TARGET COLUMNS (exactly as required + UNIT COST)
const TARGET_COLUMNS = [
    "1001", "1002", "1006", "1007", "1008", "1010", "1011",
    "UPC", "ITEM DESCRIPTION", "RETAIL PRICE", "UNIT COST"
];

// Global application state
let fullDataset = [];
let coreFilteredData = [];
let currentPage = 1;
const ROWS_PER_PAGE = 100;
let currentHeadersMapped = [];
let globalSearchText = "";
let sortConfig = { columnKey: null, direction: 'asc' };
let lastMetadata = null;

// DOM Elements
let totalRowsSpan, filteredCountSpan, lastSyncSpan, globalSearchInput;
let clearSearchBtn, tableHeaderElem, tableBodyElem, paginationDiv;
let prevBtn, nextBtn, pageInfoSpan, statusArea;

// ==================== UTILITY FUNCTIONS ====================
function normalizeColumnName(colName) {
    if (!colName) return "";
    return colName.toString().trim();
}

function showStatusMessage(msg, type = "info") {
    const div = document.createElement('div');
    div.className = `status-message status-${type}`;
    div.innerText = msg;
    statusArea.innerHTML = '';
    statusArea.appendChild(div);
    setTimeout(() => {
        if (statusArea.firstChild === div) statusArea.innerHTML = '';
    }, 3800);
}

function formatTimestamp(timestamp) {
    if (!timestamp) return '—';
    try {
        const date = new Date(timestamp);
        return date.toLocaleString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit', 
            day: 'numeric', 
            month: 'short', 
            year: 'numeric' 
        });
    } catch(e) { 
        return String(timestamp); 
    }
}

// Smart substring matching with plural/suffix hints
function isHintMatch(cellValue, searchTerm) {
    if (!searchTerm || searchTerm.trim() === "") return true;
    const cellStr = String(cellValue).toLowerCase().trim();
    const term = searchTerm.toLowerCase().trim();
    
    if (cellStr.includes(term)) return true;
    
    // Handle plural to singular
    if (term.endsWith('s') && term.length > 3) {
        const singular = term.slice(0, -1);
        if (singular.length >= 2 && cellStr.includes(singular)) return true;
    }
    
    // Handle singular to plural
    if (!term.endsWith('s') && term.length > 2) {
        if (cellStr.includes(term + 's')) return true;
    }
    
    // Handle common suffixes
    const suffixes = ['ing', 'ed', 'er', 'est', 'ly', 'tion'];
    for (let suffix of suffixes) {
        if (term.endsWith(suffix)) {
            const base = term.slice(0, -suffix.length);
            if (base.length >= 3 && cellStr.includes(base)) return true;
        }
        if (cellStr.includes(term + suffix)) return true;
    }
    return false;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function highlightText(cellText, searchTerm) {
    if (!searchTerm || !cellText) return escapeHtml(String(cellText));
    
    const str = String(cellText);
    const lowerStr = str.toLowerCase();
    const lowerSearch = searchTerm.toLowerCase();
    let matchStart = lowerStr.indexOf(lowerSearch);
    
    // Try plural/singular variations
    if (matchStart === -1 && lowerSearch.endsWith('s') && lowerSearch.length > 3) {
        const singular = lowerSearch.slice(0, -1);
        matchStart = lowerStr.indexOf(singular);
    } else if (matchStart === -1 && !lowerSearch.endsWith('s') && lowerSearch.length > 2) {
        matchStart = lowerStr.indexOf(lowerSearch + 's');
    }
    
    if (matchStart !== -1) {
        const matchEnd = matchStart + (matchStart + lowerSearch.length <= lowerStr.length ? lowerSearch.length : 3);
        const before = escapeHtml(str.substring(0, matchStart));
        const matchPart = escapeHtml(str.substring(matchStart, matchEnd));
        const after = escapeHtml(str.substring(matchEnd));
        return `${before}<span class="highlight-match">${matchPart}</span>${after}`;
    }
    return escapeHtml(str);
}

// ==================== DATA PROCESSING FUNCTIONS ====================
function applyGlobalSearchAndSort() {
    if (!fullDataset.length) {
        coreFilteredData = [];
        if (filteredCountSpan) filteredCountSpan.innerText = '0';
        renderTablePage();
        updatePaginationUI();
        return;
    }
    
    let filtered = [...fullDataset];
    
    // Apply global search filter
    if (globalSearchText.trim() !== "") {
        filtered = filtered.filter(row => {
            for (let colKey of currentHeadersMapped) {
                let val = row[colKey] !== undefined && row[colKey] !== null ? String(row[colKey]) : "";
                if (isHintMatch(val, globalSearchText)) return true;
            }
            return false;
        });
    }
    
    // Apply sorting
    if (sortConfig.columnKey && currentHeadersMapped.includes(sortConfig.columnKey)) {
        const col = sortConfig.columnKey;
        const dir = sortConfig.direction;
        filtered.sort((a, b) => {
            let valA = a[col] !== undefined && a[col] !== null ? String(a[col]) : "";
            let valB = b[col] !== undefined && b[col] !== null ? String(b[col]) : "";
            
            // Try numeric comparison
            let numA = parseFloat(valA), numB = parseFloat(valB);
            let isNumA = !isNaN(numA) && isFinite(valA) && valA.trim() !== "";
            let isNumB = !isNaN(numB) && isFinite(valB) && valB.trim() !== "";
            
            if (isNumA && isNumB) {
                return dir === 'asc' ? numA - numB : numB - numA;
            }
            
            // Fallback to string comparison
            let comp = valA.localeCompare(valB);
            return dir === 'asc' ? comp : -comp;
        });
    }
    
    coreFilteredData = filtered;
    if (filteredCountSpan) filteredCountSpan.innerText = coreFilteredData.length.toLocaleString();
    currentPage = 1;
    renderTablePage();
    updatePaginationUI();
}

function renderTablePage() {
    if (!coreFilteredData.length) {
        const colCount = currentHeadersMapped.length || TARGET_COLUMNS.length;
        if (tableBodyElem) {
            tableBodyElem.innerHTML = `<tr><td colspan="${colCount}" class="empty-placeholder">📭 No products match the search. Try different keywords.</td></tr>`;
        }
        if (tableHeaderElem) tableHeaderElem.innerHTML = '';
        if (paginationDiv) paginationDiv.style.display = 'none';
        return;
    }
    
    const start = (currentPage - 1) * ROWS_PER_PAGE;
    const end = Math.min(start + ROWS_PER_PAGE, coreFilteredData.length);
    const pageRows = coreFilteredData.slice(start, end);
    
    // Build header with sort indicators
    let theadHtml = '<tr>';
    for (let colKey of currentHeadersMapped) {
        let displayName = colKey;
        let sortIndicator = '';
        if (sortConfig.columnKey === colKey) {
            sortIndicator = sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
        } else {
            sortIndicator = ' ↕️';
        }
        theadHtml += `<th data-sort-col="${escapeHtml(colKey)}"><span class="th-sort">${escapeHtml(displayName)}<span class="sort-arrow">${sortIndicator}</span></span></th>`;
    }
    theadHtml += '</tr>';
    
    if (tableHeaderElem) tableHeaderElem.innerHTML = theadHtml;
    
    // Attach sort listeners
    document.querySelectorAll('#tableHeader th').forEach(th => {
        th.removeEventListener('click', handleSortClick);
        th.addEventListener('click', handleSortClick);
    });
    
    function handleSortClick(e) {
        const th = e.currentTarget;
        const col = th.getAttribute('data-sort-col');
        if (sortConfig.columnKey === col) {
            sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
        } else {
            sortConfig.columnKey = col;
            sortConfig.direction = 'asc';
        }
        applyGlobalSearchAndSort();
    }
    
    // Build table body
    let tbodyHtml = '';
    for (let row of pageRows) {
        tbodyHtml += '<tr>';
        for (let colKey of currentHeadersMapped) {
            let rawVal = row[colKey] !== undefined && row[colKey] !== null ? String(row[colKey]) : "";
            let displayVal = rawVal.length > 120 ? rawVal.substring(0, 117) + '...' : rawVal;
            
            if (globalSearchText.trim() !== "") {
                displayVal = highlightText(rawVal, globalSearchText);
            } else {
                displayVal = escapeHtml(displayVal);
            }
            tbodyHtml += `<td title="${escapeHtml(rawVal)}">${displayVal}</td>`;
        }
        tbodyHtml += '</tr>';
    }
    
    if (tableBodyElem) tableBodyElem.innerHTML = tbodyHtml;
    if (paginationDiv) paginationDiv.style.display = coreFilteredData.length > ROWS_PER_PAGE ? 'flex' : 'none';
}

function updatePaginationUI() {
    if (!coreFilteredData.length) {
        if (paginationDiv) paginationDiv.style.display = 'none';
        return;
    }
    
    const totalPages = Math.ceil(coreFilteredData.length / ROWS_PER_PAGE);
    if (pageInfoSpan) pageInfoSpan.innerText = `Page ${currentPage} of ${totalPages}`;
    if (prevBtn) prevBtn.disabled = (currentPage === 1);
    if (nextBtn) nextBtn.disabled = (currentPage === totalPages);
}

// ==================== FIREBASE DATA LOADING ====================
async function loadLatestProductData() {
    if (!database) {
        if (tableBodyElem) {
            tableBodyElem.innerHTML = `<tr><td colspan="11" class="empty-placeholder">⚠️ Firebase not available</td></tr>`;
        }
        return;
    }
    
    try {
        // Show loading state
        if (tableBodyElem) {
            tableBodyElem.innerHTML = `<tr><td colspan="11" class="empty-placeholder"><span>🔄 Syncing dataset... <span class="loading-spinner-local"></span></span></td></tr>`;
        }
        
        const uploadsRef = database.ref('csvUploads');
        const snapshot = await uploadsRef.once('value');
        
        if (!snapshot.exists()) {
            if (tableBodyElem) {
                tableBodyElem.innerHTML = `<tr><td colspan="11" class="empty-placeholder">📭 No product data available. Please ask admin to upload CSV/Excel.</td></tr>`;
            }
            if (totalRowsSpan) totalRowsSpan.innerText = '0';
            if (filteredCountSpan) filteredCountSpan.innerText = '0';
            fullDataset = [];
            coreFilteredData = [];
            if (paginationDiv) paginationDiv.style.display = 'none';
            if (lastSyncSpan) lastSyncSpan.innerText = '—';
            return;
        }
        
        // Find the latest completed upload
        let latestUpload = null;
        snapshot.forEach(child => {
            const val = child.val();
            if (val.metadata && val.metadata.completed === true) {
                if (!latestUpload || (val.metadata.timestamp > latestUpload.metadata.timestamp)) {
                    latestUpload = { id: child.key, metadata: val.metadata, batches: val.batches || {} };
                }
            }
        });
        
        if (!latestUpload || !latestUpload.batches) {
            throw new Error("No completed dataset with batches");
        }
        
        // Aggregate all rows from batches
        const allRows = [];
        const batches = latestUpload.batches;
        for (let key of Object.keys(batches)) {
            if (batches[key] && Array.isArray(batches[key].data)) {
                allRows.push(...batches[key].data);
            }
        }
        
        if (!allRows.length) throw new Error("Dataset contains zero rows");
        
        fullDataset = allRows;
        lastMetadata = latestUpload.metadata;
        
        // Get available headers from first row
        const availableHeaders = fullDataset.length ? Object.keys(fullDataset[0]) : [];
        
        // Match target columns with flexible case-insensitive lookup
        const matchedColumns = [];
        for (let target of TARGET_COLUMNS) {
            // Try exact match first, then case-insensitive
            let foundKey = availableHeaders.find(h => h === target);
            if (!foundKey) {
                foundKey = availableHeaders.find(h => h.toLowerCase() === target.toLowerCase());
            }
            if (foundKey) matchedColumns.push(foundKey);
            else matchedColumns.push(target); // placeholder for missing column
        }
        
        currentHeadersMapped = matchedColumns;
        
        // Update UI stats
        if (totalRowsSpan) totalRowsSpan.innerText = fullDataset.length.toLocaleString();
        if (lastMetadata && lastMetadata.timestamp) {
            if (lastSyncSpan) lastSyncSpan.innerText = formatTimestamp(lastMetadata.timestamp);
        } else {
            if (lastSyncSpan) lastSyncSpan.innerText = new Date().toLocaleString();
        }
        
        // Reset search and sort
        globalSearchText = "";
        if (globalSearchInput) globalSearchInput.value = "";
        sortConfig = { columnKey: null, direction: 'asc' };
        
        // Apply filters and render
        applyGlobalSearchAndSort();
        showStatusMessage(`✅ Loaded ${fullDataset.length.toLocaleString()} products | Core columns + Unit Cost (full-screen)`, "success");
        
    } catch (err) {
        console.error(err);
        if (tableBodyElem) {
            tableBodyElem.innerHTML = `<tr><td colspan="11" class="empty-placeholder">⚠️ Error: ${escapeHtml(err.message)}</td></tr>`;
        }
        showStatusMessage("Failed to load dataset: " + err.message, "error");
    }
}

// ==================== EVENT HANDLERS ====================
function handleGlobalSearch() {
    globalSearchText = globalSearchInput ? globalSearchInput.value : "";
    applyGlobalSearchAndSort();
}

function clearGlobalSearch() {
    if (globalSearchInput) globalSearchInput.value = "";
    globalSearchText = "";
    applyGlobalSearchAndSort();
    showStatusMessage("Search cleared", "info");
}

function prevPage() {
    if (currentPage > 1) {
        currentPage--;
        renderTablePage();
        updatePaginationUI();
        const wrapper = document.querySelector('.table-wrapper');
        if (wrapper) wrapper.scrollTop = 0;
    }
}

function nextPage() {
    const totalPages = Math.ceil(coreFilteredData.length / ROWS_PER_PAGE);
    if (currentPage < totalPages) {
        currentPage++;
        renderTablePage();
        updatePaginationUI();
        const wrapper = document.querySelector('.table-wrapper');
        if (wrapper) wrapper.scrollTop = 0;
    }
}

// ==================== INITIALIZATION ====================
function initializeFirebase() {
    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        database = firebase.database();
        console.log("✅ Firebase ready (full-screen core + unit cost)");
    } catch(e) { 
        console.warn("Firebase initialization error:", e);
        showStatusMessage("Firebase connection error", "error");
    }
}

function initializeDOMReferences() {
    totalRowsSpan = document.getElementById('totalRowsDisplay');
    filteredCountSpan = document.getElementById('filteredCountDisplay');
    lastSyncSpan = document.getElementById('lastSyncTime');
    globalSearchInput = document.getElementById('globalSearchInput');
    clearSearchBtn = document.getElementById('clearGlobalSearch');
    tableHeaderElem = document.getElementById('tableHeader');
    tableBodyElem = document.getElementById('tableBody');
    paginationDiv = document.getElementById('paginationControls');
    prevBtn = document.getElementById('prevPageBtn');
    nextBtn = document.getElementById('nextPageBtn');
    pageInfoSpan = document.getElementById('pageInfoSpan');
    statusArea = document.getElementById('statusMessageArea');
}

function attachEventListeners() {
    if (globalSearchInput) globalSearchInput.addEventListener('input', handleGlobalSearch);
    if (clearSearchBtn) clearSearchBtn.addEventListener('click', clearGlobalSearch);
    if (prevBtn) prevBtn.addEventListener('click', prevPage);
    if (nextBtn) nextBtn.addEventListener('click', nextPage);
}

// Start the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initializeDOMReferences();
    initializeFirebase();
    attachEventListeners();
    loadLatestProductData();
});