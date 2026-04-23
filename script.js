// script.js - Homedecor Portal | AI Stock Monitor & Secure Access
// Firebase configuration and external application logic

// -------------------- FIREBASE INIT --------------------
const firebaseConfig = {
    apiKey: "AIzaSyBgQ-NRH_UFKwEt0PybJ3y2zKGvRSqvLoU",
    authDomain: "portfolio-70f03.firebaseapp.com",
    databaseURL: "https://portfolio-70f03-default-rtdb.firebaseio.com",
    projectId: "portfolio-70f03",
    storageBucket: "portfolio-70f03.firebasestorage.app",
    messagingSenderId: "815368927704",
    appId: "1:815368927704:web:119b288294c5b26d2e1aad"
};
let database;
try {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    database = firebase.database();
    console.log("✅ Firebase ready");
} catch(e) { console.warn(e); }

// -------------------- AUTHENTICATION SYSTEM --------------------
const USERS_REF = () => database.ref('portalUsers');
const LOGIN_HISTORY_REF = () => database.ref('loginHistory');
const AUTHORIZED_USERS = [
    { username: "admin", password: "homedecor2025", role: "admin" },
    { username: "viewer", password: "view123", role: "viewer" }
];

async function seedAuthorizedUsers() {
    if (!database) return;
    const usersRef = USERS_REF();
    const snapshot = await usersRef.once('value');
    if (!snapshot.exists()) {
        for (const user of AUTHORIZED_USERS) {
            await usersRef.child(user.username).set({
                username: user.username,
                password: user.password,
                role: user.role,
                createdAt: Date.now(),
                createdBySystem: true
            });
        }
    } else {
        for (const user of AUTHORIZED_USERS) {
            if (!snapshot.hasChild(user.username)) {
                await usersRef.child(user.username).set({
                    username: user.username,
                    password: user.password,
                    role: user.role,
                    createdAt: Date.now(),
                    createdBySystem: true
                });
            }
        }
    }
}

async function recordLoginHistory(username, success, errorMessage = null) {
    if (!database) return;
    try {
        await LOGIN_HISTORY_REF().push({
            username: username,
            timestamp: Date.now(),
            success: success,
            errorMessage: errorMessage,
            userAgent: navigator.userAgent.substring(0, 200),
            sessionId: Math.random().toString(36).substring(2, 15)
        });
    } catch(e) { console.warn(e); }
}

async function hasSuccessfulLoginHistory(username) {
    if (!database) return false;
    try {
        const snapshot = await LOGIN_HISTORY_REF().orderByChild('username').equalTo(username).once('value');
        if (!snapshot.exists()) return false;
        let hasSuccess = false;
        snapshot.forEach(child => {
            if (child.val().success === true) hasSuccess = true;
        });
        return hasSuccess;
    } catch(e) { return false; }
}

async function verifyCredentials(username, password) {
    if (!database) return false;
    const snap = await USERS_REF().child(username).once('value');
    return snap.exists() && snap.val().password === password;
}

// -------------------- UI & LOGIN HANDLER --------------------
const authOverlay = document.getElementById('authOverlay');
const mainApp = document.getElementById('mainAppContainer');
const loginErrorMsgDiv = document.getElementById('loginErrorMsg');
const loginForm = document.getElementById('loginForm');
const logoutBtn = document.getElementById('logoutButton');
let currentLoggedInUser = null;

function performLogout() {
    mainApp.classList.remove('visible');
    currentLoggedInUser = null;
    fullDataset = [];
    coreFilteredData = [];
    currentHeadersMapped = [];
    globalSearchText = "";
    selectedClassName = "";
    if (globalSearchInput) globalSearchInput.value = "";
    if (classFilterSelect) classFilterSelect.value = "";
    tableBodyElem.innerHTML = `<tr><td colspan="13" class="empty-placeholder">🔐 Session ended. Please log in again.</td></tr>`;
    tableHeaderElem.innerHTML = '';
    totalRowsSpan.innerText = '—';
    filteredCountSpan.innerText = '—';
    lastSyncSpan.innerText = '—';
    paginationDiv.style.display = 'none';
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
    loginErrorMsgDiv.innerHTML = '';
    authOverlay.style.display = 'flex';
    authOverlay.style.opacity = '1';
    currentPage = 1;
    sortConfig = { columnKey: null, direction: 'asc' };
    closeAIModal();
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim().toLowerCase();
    const password = document.getElementById('loginPassword').value;
    if (!username || !password) {
        const errMsg = "⚠️ Please enter both username and password";
        loginErrorMsgDiv.innerHTML = `<div class="error-msg">${errMsg}</div>`;
        await recordLoginHistory(username, false, errMsg);
        return;
    }
    const isValid = await verifyCredentials(username, password);
    if (!isValid) {
        const errMsg = "❌ Access denied. Invalid credentials.";
        loginErrorMsgDiv.innerHTML = `<div class="error-msg">${errMsg}</div>`;
        await recordLoginHistory(username, false, errMsg);
        return;
    }
    await recordLoginHistory(username, true, null);
    const hasHistory = await hasSuccessfulLoginHistory(username);
    if (!hasHistory) {
        const errMsg = "❌ Access requires verified login history. Please contact administrator.";
        loginErrorMsgDiv.innerHTML = `<div class="error-msg">${errMsg}</div>`;
        await recordLoginHistory(username, false, errMsg);
        return;
    }
    currentLoggedInUser = username;
    authOverlay.style.opacity = "0";
    setTimeout(async () => {
        authOverlay.style.display = "none";
        mainApp.classList.add("visible");
        await loadLatestProductData();
    }, 280);
}

loginForm.addEventListener('submit', handleLogin);
if (logoutBtn) logoutBtn.addEventListener('click', performLogout);
seedAuthorizedUsers().catch(console.warn);

// -------------------- PRODUCT CORE LOGIC --------------------
const TARGET_COLUMNS = [
    "1001", "1002", "1006", "1007", "1008", "1010", "1011",
    "UPC", "SKU", "STOCK CODE", "ITEM DESCRIPTION", "CLASS NAME", "RETAIL PRICE", "UNIT COST"
];
const BRANCH_CODES = ["1001","1002","1006","1007","1008","1010","1011"];

let fullDataset = [];
let coreFilteredData = [];
let currentPage = 1;
const ROWS_PER_PAGE = 100;
let currentHeadersMapped = [];
let globalSearchText = "";
let selectedClassName = "";
let sortConfig = { columnKey: null, direction: 'asc' };
let lastMetadata = null;

const totalRowsSpan = document.getElementById('totalRowsDisplay');
const filteredCountSpan = document.getElementById('filteredCountDisplay');
const lastSyncSpan = document.getElementById('lastSyncTime');
const globalSearchInput = document.getElementById('globalSearchInput');
const clearSearchBtn = document.getElementById('clearGlobalSearch');
const tableHeaderElem = document.getElementById('tableHeader');
const tableBodyElem = document.getElementById('tableBody');
const paginationDiv = document.getElementById('paginationControls');
const prevBtn = document.getElementById('prevPageBtn');
const nextBtn = document.getElementById('nextPageBtn');
const pageInfoSpan = document.getElementById('pageInfoSpan');
const classFilterSelect = document.getElementById('classFilterSelect');
const clearClassFilterBtn = document.getElementById('clearClassFilter');

function escapeHtml(str) { if (!str) return ''; return String(str).replace(/[&<>]/g, m => m==='&'?'&amp;':m==='<'?'&lt;':'&gt;'); }
function formatTimestamp(ts) { if (!ts) return '—'; try { return new Date(ts).toLocaleString(); } catch(e) { return String(ts); } }
function isHintMatch(val, term) {
    if (!term) return true;
    const cellStr = String(val).toLowerCase().trim();
    const t = term.toLowerCase().trim();
    if (cellStr.includes(t)) return true;
    if (t.endsWith('s') && t.length>3 && cellStr.includes(t.slice(0,-1))) return true;
    if (!t.endsWith('s') && t.length>2 && cellStr.includes(t+'s')) return true;
    return false;
}
function highlightText(cellText, term) {
    if (!term || !cellText) return escapeHtml(String(cellText));
    const str = String(cellText);
    const lowerStr = str.toLowerCase();
    const lowerTerm = term.toLowerCase();
    let idx = lowerStr.indexOf(lowerTerm);
    if (idx === -1 && lowerTerm.endsWith('s') && lowerTerm.length>3) idx = lowerStr.indexOf(lowerTerm.slice(0,-1));
    if (idx !== -1) {
        return `${escapeHtml(str.substring(0, idx))}<span class="highlight-match">${escapeHtml(str.substring(idx, idx+lowerTerm.length))}</span>${escapeHtml(str.substring(idx+lowerTerm.length))}`;
    }
    return escapeHtml(str);
}

function populateAllClassFilters() {
    if (!fullDataset.length) return;
    const classSet = new Set();
    for (const row of fullDataset) {
        const cn = row["CLASS NAME"] ? String(row["CLASS NAME"]).trim() : "";
        if (cn) classSet.add(cn);
    }
    const sorted = Array.from(classSet).sort((a,b) => a.localeCompare(b));
    const options = '<option value="">All Categories</option>' + sorted.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    if (classFilterSelect) classFilterSelect.innerHTML = options;
    if (modalClassFilter) modalClassFilter.innerHTML = options;
    if (selectedClassName && classSet.has(selectedClassName)) {
        classFilterSelect.value = selectedClassName;
        modalClassFilter.value = selectedClassName;
    } else {
        classFilterSelect.value = "";
        modalClassFilter.value = "";
        selectedClassName = "";
    }
}

function populateBranchFilter() {
    const branchSelect = document.getElementById('modalBranchFilter');
    if (!branchSelect) return;
    const existingBranches = BRANCH_CODES.filter(bc => currentHeadersMapped.includes(bc));
    let options = '<option value="">All Branches (Cross‑Branch Alerts)</option>';
    existingBranches.forEach(b => {
        options += `<option value="${b}">Branch ${b}</option>`;
    });
    branchSelect.innerHTML = options;
    const currentVal = branchSelect.value;
    if (currentVal && existingBranches.includes(currentVal)) branchSelect.value = currentVal;
    else branchSelect.value = "";
}

function applyGlobalSearchAndSort() {
    if (!fullDataset.length) { coreFilteredData = []; filteredCountSpan.innerText = '0'; renderTablePage(); updatePaginationUI(); return; }
    let filtered = [...fullDataset];
    if (globalSearchText.trim()) {
        filtered = filtered.filter(row => {
            for (let col of currentHeadersMapped) {
                let val = row[col] !== undefined ? String(row[col]) : "";
                if (isHintMatch(val, globalSearchText)) return true;
            }
            return false;
        });
    }
    if (selectedClassName) {
        filtered = filtered.filter(row => (row["CLASS NAME"] ? String(row["CLASS NAME"]).trim() : "") === selectedClassName);
    }
    if (sortConfig.columnKey && currentHeadersMapped.includes(sortConfig.columnKey)) {
        const col = sortConfig.columnKey, dir = sortConfig.direction;
        filtered.sort((a,b) => {
            let av = a[col] !== undefined ? String(a[col]) : "";
            let bv = b[col] !== undefined ? String(b[col]) : "";
            let na = parseFloat(av), nb = parseFloat(bv);
            let isNumA = !isNaN(na) && av.trim() !== "";
            let isNumB = !isNaN(nb) && bv.trim() !== "";
            if (isNumA && isNumB) return dir === 'asc' ? na - nb : nb - na;
            return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        });
    }
    coreFilteredData = filtered;
    filteredCountSpan.innerText = coreFilteredData.length.toLocaleString();
    currentPage = 1;
    renderTablePage();
    updatePaginationUI();
}

function renderTablePage() { 
    if (!coreFilteredData.length) {
        const colCount = currentHeadersMapped.length || 13;
        tableBodyElem.innerHTML = `<tr><td colspan="${colCount}" class="empty-placeholder">📭 No products match filters.</td></tr>`;
        tableHeaderElem.innerHTML = '';
        paginationDiv.style.display = 'none';
        return;
    }
    const start = (currentPage-1)*ROWS_PER_PAGE;
    const end = Math.min(start+ROWS_PER_PAGE, coreFilteredData.length);
    const pageRows = coreFilteredData.slice(start, end);
    let theadHtml = '<tr>';
    for (let col of currentHeadersMapped) {
        let indicator = sortConfig.columnKey === col ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼') : ' ↕️';
        theadHtml += `<th data-sort-col="${escapeHtml(col)}">${escapeHtml(col)}<span class="sort-arrow">${indicator}</span></th>`;
    }
    theadHtml += '</tr>';
    tableHeaderElem.innerHTML = theadHtml;
    document.querySelectorAll('#tableHeader th').forEach(th => {
        th.removeEventListener('click', handleSortClick);
        th.addEventListener('click', handleSortClick);
    });
    function handleSortClick(e) {
        const col = e.currentTarget.getAttribute('data-sort-col');
        if (sortConfig.columnKey === col) sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
        else { sortConfig.columnKey = col; sortConfig.direction = 'asc'; }
        applyGlobalSearchAndSort();
    }
    let tbodyHtml = '';
    for (let row of pageRows) {
        tbodyHtml += '<tr>';
        for (let col of currentHeadersMapped) {
            let raw = row[col] !== undefined ? String(row[col]) : "";
            let display = raw.length > 120 ? raw.substring(0,117)+'...' : raw;
            if (globalSearchText.trim()) display = highlightText(raw, globalSearchText);
            else display = escapeHtml(display);
            tbodyHtml += `<td title="${escapeHtml(raw)}">${display}</td>`;
        }
        tbodyHtml += '</tr>';
    }
    tableBodyElem.innerHTML = tbodyHtml;
    paginationDiv.style.display = coreFilteredData.length > ROWS_PER_PAGE ? 'flex' : 'none';
}
function updatePaginationUI() { 
    if (!coreFilteredData.length) { paginationDiv.style.display = 'none'; return; }
    const totalPages = Math.ceil(coreFilteredData.length / ROWS_PER_PAGE);
    pageInfoSpan.innerText = `Page ${currentPage} of ${totalPages}`;
    prevBtn.disabled = (currentPage === 1);
    nextBtn.disabled = (currentPage === totalPages);
}
async function loadLatestProductData() { 
    if (!database) return;
    try {
        tableBodyElem.innerHTML = `<tr><td colspan="13" class="empty-placeholder"><span>🔄 Syncing dataset... <span class="loading-spinner-local"></span></span></td></tr>`;
        const snapshot = await database.ref('csvUploads').once('value');
        if (!snapshot.exists()) throw new Error("No product data");
        let latestUpload = null;
        snapshot.forEach(child => {
            const val = child.val();
            if (val.metadata && val.metadata.completed === true) {
                if (!latestUpload || (val.metadata.timestamp > latestUpload.metadata.timestamp)) {
                    latestUpload = { id: child.key, metadata: val.metadata, batches: val.batches || {} };
                }
            }
        });
        if (!latestUpload || !latestUpload.batches) throw new Error("No completed dataset");
        const allRows = [];
        for (let key of Object.keys(latestUpload.batches)) {
            if (latestUpload.batches[key]?.data) allRows.push(...latestUpload.batches[key].data);
        }
        if (!allRows.length) throw new Error("Empty dataset");
        fullDataset = allRows;
        lastMetadata = latestUpload.metadata;
        const availableHeaders = Object.keys(fullDataset[0]);
        const matchedColumns = TARGET_COLUMNS.map(target => availableHeaders.find(h => h === target) || availableHeaders.find(h => h.toLowerCase() === target.toLowerCase()) || target);
        currentHeadersMapped = matchedColumns.filter(col => col.toLowerCase() !== "unit cost");
        totalRowsSpan.innerText = fullDataset.length.toLocaleString();
        lastSyncSpan.innerText = lastMetadata?.timestamp ? formatTimestamp(lastMetadata.timestamp) : new Date().toLocaleString();
        globalSearchText = "";
        selectedClassName = "";
        if (globalSearchInput) globalSearchInput.value = "";
        if (classFilterSelect) classFilterSelect.value = "";
        sortConfig = { columnKey: null, direction: 'asc' };
        populateAllClassFilters();
        populateBranchFilter();
        applyGlobalSearchAndSort();
    } catch(err) {
        tableBodyElem.innerHTML = `<tr><td colspan="13" class="empty-placeholder">⚠️ ${escapeHtml(err.message)}</td></tr>`;
    }
}
if (globalSearchInput) globalSearchInput.addEventListener('input', () => { globalSearchText = globalSearchInput.value; applyGlobalSearchAndSort(); });
if (clearSearchBtn) clearSearchBtn.addEventListener('click', () => { globalSearchInput.value = ""; globalSearchText = ""; applyGlobalSearchAndSort(); });
if (classFilterSelect) classFilterSelect.addEventListener('change', (e) => { selectedClassName = e.target.value; applyGlobalSearchAndSort(); if (modalClassFilter) modalClassFilter.value = selectedClassName; });
if (clearClassFilterBtn) clearClassFilterBtn.addEventListener('click', () => { if(classFilterSelect) classFilterSelect.value = ""; selectedClassName = ""; applyGlobalSearchAndSort(); if(modalClassFilter) modalClassFilter.value = ""; });
if (prevBtn) prevBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderTablePage(); updatePaginationUI(); document.querySelector('.table-wrapper').scrollTop = 0; } });
if (nextBtn) nextBtn.addEventListener('click', () => { const total = Math.ceil(coreFilteredData.length / ROWS_PER_PAGE); if (currentPage < total) { currentPage++; renderTablePage(); updatePaginationUI(); document.querySelector('.table-wrapper').scrollTop = 0; } });

// FULLSCREEN AI STOCK MONITOR with BRANCH FILTER + REPLENISHABLE TOGGLE
const stockAiBtn = document.getElementById('stockMonitorAiBtn');
const modalOverlay = document.getElementById('aiFullscreenModal');
const closeModalBtn = document.getElementById('closeFullscreenModal');
const modalClassFilter = document.getElementById('modalClassFilter');
const modalThreshold = document.getElementById('modalLowStockThreshold');
const modalBranchFilter = document.getElementById('modalBranchFilter');
const onlyReplenishableCheckbox = document.getElementById('onlyReplenishableCheckbox');
const modalSummary = document.getElementById('modalSummaryStats');
const modalResultsContainer = document.getElementById('modalResultsContainer');

function runFullscreenAnalysis() {
    if (!fullDataset.length) {
        modalResultsContainer.innerHTML = '<div class="empty-monitor-modal">📦 No product data loaded.</div>';
        modalSummary.innerText = '⚠️ No data';
        return;
    }
    const threshold = parseInt(modalThreshold.value, 10);
    const selectedClass = modalClassFilter.value;
    const focusedBranch = modalBranchFilter.value;
    const onlyReplenishable = onlyReplenishableCheckbox.checked;

    let filteredProducts = [...fullDataset];
    if (selectedClass && selectedClass !== "") {
        filteredProducts = filteredProducts.filter(row => (row["CLASS NAME"] ? String(row["CLASS NAME"]).trim() : "") === selectedClass);
    }
    const existingBranches = BRANCH_CODES.filter(bc => currentHeadersMapped.includes(bc));
    if (!existingBranches.length) {
        modalResultsContainer.innerHTML = '<div class="empty-monitor-modal">❌ Branch stock columns not found in dataset.</div>';
        return;
    }

    const alerts = [];

    if (focusedBranch && focusedBranch !== "") {
        if (!existingBranches.includes(focusedBranch)) {
            modalResultsContainer.innerHTML = `<div class="empty-monitor-modal">⚠️ Branch ${escapeHtml(focusedBranch)} not available in current dataset.</div>`;
            return;
        }
        for (let row of filteredProducts) {
            const lowStockVal = Number(row[focusedBranch]);
            if (isNaN(lowStockVal)) continue;
            if (lowStockVal <= threshold) {
                const upc = row["UPC"] || "—";
                const sku = row["SKU"] || "";
                const stockCode = row["STOCK CODE"] || "";
                const desc = row["ITEM DESCRIPTION"] || "Unnamed";
                let identifierParts = [upc];
                if (sku) identifierParts.push(`SKU:${sku}`);
                if (stockCode) identifierParts.push(`SC:${stockCode}`);
                const productLabel = `${identifierParts.join(' | ')} | ${desc.substring(0,70)}`;
                let bestSource = null;
                let highestStock = -1;
                for (let branch of existingBranches) {
                    if (branch === focusedBranch) continue;
                    let stock = Number(row[branch]);
                    if (isNaN(stock)) stock = 0;
                    if (stock > highestStock) {
                        highestStock = stock;
                        bestSource = { branch, stock };
                    }
                }
                const isReplenishable = bestSource && bestSource.stock > 0;
                if (onlyReplenishable && !isReplenishable) continue;

                let urgency = lowStockVal === 0 ? "🚨 OUT" : (lowStockVal <= 2 ? "⚠️ CRITICAL" : "Low");
                let suggestion = "";
                if (bestSource && bestSource.stock > threshold) {
                    suggestion = `✨ Transfer from ${bestSource.branch} (stock ${bestSource.stock}) to ${focusedBranch}`;
                } else if (bestSource && bestSource.stock > 0) {
                    suggestion = `⚠️ Limited source: ${bestSource.branch} has only ${bestSource.stock} units. Reorder needed.`;
                } else {
                    suggestion = `🚚 No positive stock in other branches. Immediate purchase required.`;
                }
                alerts.push({
                    product: productLabel,
                    lowBranch: focusedBranch,
                    lowStock: lowStockVal,
                    sourceBranch: bestSource ? bestSource.branch : "—",
                    sourceStock: bestSource ? bestSource.stock : 0,
                    urgency: urgency,
                    suggestion: suggestion
                });
            }
        }
    } else {
        for (let row of filteredProducts) {
            const upc = row["UPC"] || "—";
            const sku = row["SKU"] || "";
            const stockCode = row["STOCK CODE"] || "";
            const desc = row["ITEM DESCRIPTION"] || "Unnamed";
            let identifierParts = [upc];
            if (sku) identifierParts.push(`SKU:${sku}`);
            if (stockCode) identifierParts.push(`SC:${stockCode}`);
            const productLabel = `${identifierParts.join(' | ')} | ${desc.substring(0,70)}`;
            let lowBranches = [], healthyBranches = [];
            for (let branch of existingBranches) {
                let stock = Number(row[branch]);
                if (isNaN(stock)) stock = 0;
                if (stock <= threshold) lowBranches.push({ branch, stock });
                else healthyBranches.push({ branch, stock });
            }
            if (lowBranches.length && healthyBranches.length) {
                for (let low of lowBranches) {
                    let best = healthyBranches.reduce((a,b) => b.stock > a.stock ? b : a, healthyBranches[0]);
                    let urgency = low.stock === 0 ? "🚨 OUT" : (low.stock <= 2 ? "⚠️ CRITICAL" : "Low");
                    alerts.push({
                        product: productLabel,
                        lowBranch: low.branch,
                        lowStock: low.stock,
                        sourceBranch: best.branch,
                        sourceStock: best.stock,
                        urgency: urgency,
                        suggestion: `✨ Transfer/pack from ${best.branch} (stock ${best.stock}) to ${low.branch} (${urgency})`
                    });
                }
            }
        }
    }

    if (alerts.length === 0) {
        let msg = focusedBranch ? (onlyReplenishable ? `✅ Branch ${focusedBranch} has no replenishable low‑stock items (≤${threshold}) with available stock elsewhere.` : `✅ Branch ${focusedBranch} has no products with stock ≤ ${threshold}.`) : `✨ Great news! No cross-branch stock alerts for the selected filters. All branches have sufficient stock.`;
        modalResultsContainer.innerHTML = `<div class="empty-monitor-modal">${msg}</div>`;
        let summaryText = focusedBranch ? `🧠 AI: Branch ${focusedBranch} | threshold ≤ ${threshold} | No low-stock items` : `✅ AI: Balanced | ${selectedClass ? `Class: ${escapeHtml(selectedClass)}` : 'All categories'} | threshold ≤ ${threshold}`;
        if (onlyReplenishable && focusedBranch) summaryText += ` (only replenishable)`;
        modalSummary.innerHTML = summaryText;
        return;
    }

    let summaryText = focusedBranch ? 
        `🧠 AI: Branch ${focusedBranch} — ${alerts.length} low‑stock items (≤${threshold})` :
        `🧠 AI: ${alerts.length} cross‑branch replenishment opportunities | ${selectedClass ? `Class: ${escapeHtml(selectedClass)}` : 'All products'} | threshold ≤ ${threshold}`;
    if (onlyReplenishable && focusedBranch) summaryText += ` (only replenishable)`;
    modalSummary.innerHTML = summaryText;

    let html = `<table class="analysis-full-table"><thead><tr><th>Product (UPC / SKU / Stock Code / Description)</th><th>Low Branch</th><th>Low Stock</th><th>Source Branch</th><th>Source Stock</th><th>🤖 AI Suggestion</th></tr></thead><tbody>`;
    for (let a of alerts.slice(0, 200)) {
        html += `<tr>
            <td title="${escapeHtml(a.product)}">${escapeHtml(a.product.substring(0,70))}</td>
            <td><span class="badge-low-modal">${escapeHtml(a.lowBranch)}</span></td>
            <td><strong style="color:#c0392b;">${a.lowStock}</strong></td>
            <td><span class="badge-source-modal">${escapeHtml(a.sourceBranch)}</span></td>
            <td>${a.sourceStock}</td>
            <td style="background:#fef7e0;">${escapeHtml(a.suggestion)}</td>
        </tr>`;
    }
    if (alerts.length > 200) html += `<tr><td colspan="6">... and ${alerts.length-200} more alerts. Adjust threshold or filters to refine.</td></tr>`;
    html += `</tbody></table><div style="font-size:12px; margin-top:16px; background:#f1f5f9; padding:12px; border-radius:24px;">💡 AI logic: For a focused branch, items with stock ≤ threshold are listed, with best available source from other branches. Toggle "Only show replenishable" to see only items that can be fulfilled from another branch.</div>`;
    modalResultsContainer.innerHTML = html;
}

function openAIModal() {
    if (!fullDataset.length) { alert("Product data not loaded yet. Please wait for sync."); return; }
    populateAllClassFilters();
    populateBranchFilter();
    modalThreshold.value = "5";
    if (modalClassFilter) modalClassFilter.value = selectedClassName || "";
    if (modalBranchFilter) modalBranchFilter.value = "";
    onlyReplenishableCheckbox.checked = false;
    runFullscreenAnalysis();
    modalOverlay.classList.add('active');
}
function closeAIModal() { modalOverlay.classList.remove('active'); }
if (stockAiBtn) stockAiBtn.addEventListener('click', openAIModal);
if (closeModalBtn) closeModalBtn.addEventListener('click', closeAIModal);
if (modalOverlay) modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeAIModal(); });
if (modalThreshold) modalThreshold.addEventListener('input', runFullscreenAnalysis);
if (modalClassFilter) modalClassFilter.addEventListener('change', runFullscreenAnalysis);
if (modalBranchFilter) modalBranchFilter.addEventListener('change', runFullscreenAnalysis);
if (onlyReplenishableCheckbox) onlyReplenishableCheckbox.addEventListener('change', runFullscreenAnalysis);