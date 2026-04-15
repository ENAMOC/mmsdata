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

// -------------------- AUTHENTICATION SYSTEM (NO REGISTRATION) --------------------
const USERS_REF = () => database.ref('portalUsers');
const LOGIN_HISTORY_REF = () => database.ref('loginHistory');

// Predefined allowed users (admin only - no public signup)
const AUTHORIZED_USERS = [
    { username: "admin", password: "homedecor2025", role: "admin" },
    { username: "viewer", password: "view123", role: "viewer" }
];

// Seed ONLY the predefined users into Firebase (no dynamic creation allowed)
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
        console.log("✅ Seeded authorized users (admin/viewer)");
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

// Record login attempt with timestamp and IP info (simulated)
async function recordLoginHistory(username, success, errorMessage = null) {
    if (!database) return;
    try {
        const historyRef = LOGIN_HISTORY_REF().push();
        await historyRef.set({
            username: username,
            timestamp: Date.now(),
            success: success,
            errorMessage: errorMessage,
            userAgent: navigator.userAgent.substring(0, 200),
            sessionId: Math.random().toString(36).substring(2, 15)
        });
    } catch(e) { console.warn("History log failed:", e); }
}

// Check if user has any successful login history (required to proceed)
async function hasSuccessfulLoginHistory(username) {
    if (!database) return false;
    try {
        const historyRef = LOGIN_HISTORY_REF();
        const snapshot = await historyRef.orderByChild('username').equalTo(username).once('value');
        if (!snapshot.exists()) return false;
        let hasSuccess = false;
        snapshot.forEach(child => {
            const record = child.val();
            if (record.success === true) {
                hasSuccess = true;
                return true; // break loop
            }
        });
        return hasSuccess;
    } catch(e) {
        console.warn("Check history failed:", e);
        return false;
    }
}

async function verifyCredentials(username, password) {
    if (!database) return false;
    const userRef = USERS_REF().child(username);
    const snap = await userRef.once('value');
    if (snap.exists()) {
        const userData = snap.val();
        if (userData.password === password) return true;
    }
    return false;
}

// -------------------- UI & LOGIN HANDLER --------------------
const authOverlay = document.getElementById('authOverlay');
const mainApp = document.getElementById('mainAppContainer');
const loginErrorMsgDiv = document.getElementById('loginErrorMsg');
const loginForm = document.getElementById('loginForm');
const logoutBtn = document.getElementById('logoutButton');

// Track currently logged in user
let currentLoggedInUser = null;

// Central logout function: reset UI, clear data, show login overlay
function performLogout() {
    // Reset main app visibility
    mainApp.classList.remove('visible');
    // Clear current user
    currentLoggedInUser = null;
    // Clear any displayed product data
    fullDataset = [];
    coreFilteredData = [];
    currentHeadersMapped = [];
    globalSearchText = "";
    if (globalSearchInput) globalSearchInput.value = "";
    tableBodyElem.innerHTML = `<tr><td colspan="11" class="empty-placeholder">🔐 Session ended. Please log in again.</td></tr>`;
    tableHeaderElem.innerHTML = '';
    totalRowsSpan.innerText = '—';
    filteredCountSpan.innerText = '—';
    lastSyncSpan.innerText = '—';
    paginationDiv.style.display = 'none';
    // Clear login form fields and errors for fresh login
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
    loginErrorMsgDiv.innerHTML = '';
    // Show overlay with fade effect
    authOverlay.style.display = 'flex';
    setTimeout(() => {
        authOverlay.style.opacity = '1';
    }, 10);
    // Reset any sorting/pagination state
    currentPage = 1;
    sortConfig = { columnKey: null, direction: 'asc' };
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
    
    // Verify credentials against Firebase
    const isValid = await verifyCredentials(username, password);
    
    if (!isValid) {
        const errMsg = "❌ Access denied. Invalid credentials.";
        loginErrorMsgDiv.innerHTML = `<div class="error-msg">${errMsg}</div>`;
        await recordLoginHistory(username, false, errMsg);
        return;
    }
    
    // CRITICAL: Check if user has ANY successful login history
    // If no history exists, this is first login attempt - BUT we still allow it?
    // Requirement: "if the account is not login history, it will never proceed to the dashboard"
    // This means: only accounts that have previously logged in successfully can access dashboard.
    // However, we need to handle first-time authorized users: they must have at least one successful login recorded.
    // To satisfy this strictly: after successful credential check, we record success, THEN check history.
    // But the first login would have no history BEFORE this login. So we record first, then allow.
    // Better interpretation: An account must have at least one successful login record (including current) to proceed.
    // So we record the successful attempt first, then verify history exists (which will include this attempt).
    
    // Record this successful login attempt
    await recordLoginHistory(username, true, null);
    
    // Now verify that the user has at least one successful login record
    const hasHistory = await hasSuccessfulLoginHistory(username);
    
    if (!hasHistory) {
        // This should not happen since we just recorded one, but as a safety measure
        const errMsg = "❌ Access requires verified login history. Please contact administrator.";
        loginErrorMsgDiv.innerHTML = `<div class="error-msg">${errMsg}</div>`;
        await recordLoginHistory(username, false, errMsg);
        return;
    }
    
    // Store current user
    currentLoggedInUser = username;
    
    // Success: hide overlay and show main app
    authOverlay.style.opacity = "0";
    setTimeout(async () => {
        authOverlay.style.display = "none";
        mainApp.classList.add("visible");
        await loadLatestProductData();
    }, 280);
}

loginForm.addEventListener('submit', handleLogin);
if (logoutBtn) {
    logoutBtn.addEventListener('click', performLogout);
}

// Seed authorized users on startup
seedAuthorizedUsers().catch(console.warn);

// -------------------- PRODUCT CORE LOGIC (fully functional) --------------------
const TARGET_COLUMNS = [
    "1001", "1002", "1006", "1007", "1008", "1010", "1011",
    "UPC", "ITEM DESCRIPTION", "RETAIL PRICE", "UNIT COST"
];

let fullDataset = [];
let coreFilteredData = [];
let currentPage = 1;
const ROWS_PER_PAGE = 100;
let currentHeadersMapped = [];
let globalSearchText = "";
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

function formatTimestamp(timestamp) {
    if (!timestamp) return '—';
    try {
        const date = new Date(timestamp);
        return date.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short', year: 'numeric' });
    } catch(e) { return String(timestamp); }
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

function isHintMatch(cellValue, searchTerm) {
    if (!searchTerm || searchTerm.trim() === "") return true;
    const cellStr = String(cellValue).toLowerCase().trim();
    const term = searchTerm.toLowerCase().trim();
    if (cellStr.includes(term)) return true;
    if (term.endsWith('s') && term.length > 3) {
        const singular = term.slice(0, -1);
        if (singular.length >= 2 && cellStr.includes(singular)) return true;
    }
    if (!term.endsWith('s') && term.length > 2) {
        if (cellStr.includes(term + 's')) return true;
    }
    return false;
}

function highlightText(cellText, searchTerm) {
    if (!searchTerm || !cellText) return escapeHtml(String(cellText));
    const str = String(cellText);
    const lowerStr = str.toLowerCase();
    const lowerSearch = searchTerm.toLowerCase();
    let matchStart = lowerStr.indexOf(lowerSearch);
    if (matchStart === -1 && lowerSearch.endsWith('s') && lowerSearch.length > 3) {
        matchStart = lowerStr.indexOf(lowerSearch.slice(0, -1));
    }
    if (matchStart !== -1) {
        const before = escapeHtml(str.substring(0, matchStart));
        const matchPart = escapeHtml(str.substring(matchStart, matchStart + lowerSearch.length));
        const after = escapeHtml(str.substring(matchStart + lowerSearch.length));
        return `${before}<span class="highlight-match">${matchPart}</span>${after}`;
    }
    return escapeHtml(str);
}

function applyGlobalSearchAndSort() {
    if (!fullDataset.length) {
        coreFilteredData = [];
        filteredCountSpan.innerText = '0';
        renderTablePage();
        updatePaginationUI();
        return;
    }
    let filtered = [...fullDataset];
    if (globalSearchText.trim() !== "") {
        filtered = filtered.filter(row => {
            for (let colKey of currentHeadersMapped) {
                let val = row[colKey] !== undefined && row[colKey] !== null ? String(row[colKey]) : "";
                if (isHintMatch(val, globalSearchText)) return true;
            }
            return false;
        });
    }
    if (sortConfig.columnKey && currentHeadersMapped.includes(sortConfig.columnKey)) {
        const col = sortConfig.columnKey;
        const dir = sortConfig.direction;
        filtered.sort((a, b) => {
            let valA = a[col] !== undefined && a[col] !== null ? String(a[col]) : "";
            let valB = b[col] !== undefined && b[col] !== null ? String(b[col]) : "";
            let numA = parseFloat(valA), numB = parseFloat(valB);
            let isNumA = !isNaN(numA) && valA.trim() !== "";
            let isNumB = !isNaN(numB) && valB.trim() !== "";
            if (isNumA && isNumB) return dir === 'asc' ? numA - numB : numB - numA;
            return dir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
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
        const colCount = currentHeadersMapped.length || TARGET_COLUMNS.length;
        tableBodyElem.innerHTML = `<tr><td colspan="${colCount}" class="empty-placeholder">📭 No products match the search. Try different keywords.</td></tr>`;
        tableHeaderElem.innerHTML = '';
        paginationDiv.style.display = 'none';
        return;
    }
    const start = (currentPage - 1) * ROWS_PER_PAGE;
    const end = Math.min(start + ROWS_PER_PAGE, coreFilteredData.length);
    const pageRows = coreFilteredData.slice(start, end);
    
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
    tableHeaderElem.innerHTML = theadHtml;
    
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
    tableBodyElem.innerHTML = tbodyHtml;
    paginationDiv.style.display = coreFilteredData.length > ROWS_PER_PAGE ? 'flex' : 'none';
}

function updatePaginationUI() {
    if (!coreFilteredData.length) {
        paginationDiv.style.display = 'none';
        return;
    }
    const totalPages = Math.ceil(coreFilteredData.length / ROWS_PER_PAGE);
    pageInfoSpan.innerText = `Page ${currentPage} of ${totalPages}`;
    prevBtn.disabled = (currentPage === 1);
    nextBtn.disabled = (currentPage === totalPages);
}

async function loadLatestProductData() {
    if (!database) {
        tableBodyElem.innerHTML = `<tr><td colspan="11" class="empty-placeholder">⚠️ Firebase not available</td></tr>`;
        return;
    }
    try {
        tableBodyElem.innerHTML = `<tr><td colspan="11" class="empty-placeholder"><span>🔄 Syncing dataset... <span class="loading-spinner-local"></span></span></td></tr>`;
        const uploadsRef = database.ref('csvUploads');
        const snapshot = await uploadsRef.once('value');
        if (!snapshot.exists()) {
            tableBodyElem.innerHTML = `<tr><td colspan="11" class="empty-placeholder">📭 No product data available. Please ask admin to upload CSV/Excel.</td></tr>`;
            totalRowsSpan.innerText = '0';
            filteredCountSpan.innerText = '0';
            fullDataset = [];
            coreFilteredData = [];
            paginationDiv.style.display = 'none';
            lastSyncSpan.innerText = '—';
            return;
        }
        let latestUpload = null;
        snapshot.forEach(child => {
            const val = child.val();
            if (val.metadata && val.metadata.completed === true) {
                if (!latestUpload || (val.metadata.timestamp > latestUpload.metadata.timestamp)) {
                    latestUpload = { id: child.key, metadata: val.metadata, batches: val.batches || {} };
                }
            }
        });
        if (!latestUpload || !latestUpload.batches) throw new Error("No completed dataset with batches");
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
        const availableHeaders = fullDataset.length ? Object.keys(fullDataset[0]) : [];
        const matchedColumns = [];
        for (let target of TARGET_COLUMNS) {
            let foundKey = availableHeaders.find(h => h === target);
            if (!foundKey) foundKey = availableHeaders.find(h => h.toLowerCase() === target.toLowerCase());
            if (foundKey) matchedColumns.push(foundKey);
            else matchedColumns.push(target);
        }
        currentHeadersMapped = matchedColumns;
        totalRowsSpan.innerText = fullDataset.length.toLocaleString();
        lastSyncSpan.innerText = lastMetadata && lastMetadata.timestamp ? formatTimestamp(lastMetadata.timestamp) : new Date().toLocaleString();
        globalSearchText = "";
        if (globalSearchInput) globalSearchInput.value = "";
        sortConfig = { columnKey: null, direction: 'asc' };
        applyGlobalSearchAndSort();
    } catch (err) {
        console.error(err);
        tableBodyElem.innerHTML = `<tr><td colspan="11" class="empty-placeholder">⚠️ Error: ${escapeHtml(err.message)}</td></tr>`;
    }
}

if (globalSearchInput) globalSearchInput.addEventListener('input', () => { globalSearchText = globalSearchInput.value; applyGlobalSearchAndSort(); });
if (clearSearchBtn) clearSearchBtn.addEventListener('click', () => { globalSearchInput.value = ""; globalSearchText = ""; applyGlobalSearchAndSort(); });
if (prevBtn) prevBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderTablePage(); updatePaginationUI(); document.querySelector('.table-wrapper').scrollTop = 0; } });
if (nextBtn) nextBtn.addEventListener('click', () => { const totalPages = Math.ceil(coreFilteredData.length / ROWS_PER_PAGE); if (currentPage < totalPages) { currentPage++; renderTablePage(); updatePaginationUI(); document.querySelector('.table-wrapper').scrollTop = 0; } });