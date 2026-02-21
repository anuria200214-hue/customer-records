const firebaseConfig = {
    apiKey: "AIzaSyBoP9Dxain9dj6sNvtWzG8YZ1wFTBSe6MQ",
    authDomain: "service-records-d5ee6.firebaseapp.com",
    projectId: "service-records-d5ee6",
    databaseURL: "https://service-records-d5ee6-default-rtdb.firebaseio.com"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('id') || 'General';
const isAdmin = userId === 'admin';
const sessionKey = 'sys_admin_auth';

let bChart, pChart, currentFilter = 'all';

window.onload = () => {
    initContext();
    syncServices();
    if(isAdmin) syncShopControls();
};

// --- UPDATED SEPARATE CLOCK (NO SECONDS) ---
function updateLiveDateTime() {
    const now = new Date();
    
    // Date: DD/MM/YYYY
    const dateStr = now.toLocaleDateString('en-IN', {
        day: '2-digit', month: '2-digit', year: 'numeric'
    });
    
    // Time: HH:MM AM/PM (Removed seconds)
    const timeStr = now.toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', hour12: true
    });

    const dateField = document.getElementById('custDate');
    const timeField = document.getElementById('custTime');
    
    if (dateField) dateField.value = dateStr;
    if (timeField) timeField.value = timeStr;
}

document.getElementById('entryForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    
    // Save the current branch name before resetting the form
    const currentBranch = document.getElementById('displayShopId').value;

    const recordData = {
        shopId: userId,
        customer: document.getElementById('custName').value,
        phone: document.getElementById('custPhone').value,
        service: document.getElementById('custService').value,
        amount: document.getElementById('custAmount').value,
        date: document.getElementById('custDate').value,
        time: document.getElementById('custTime').value
    };

    db.ref('records').push(recordData).then(() => { 
        // Show success alert
        const alertBox = document.getElementById('success-alert');
        if (alertBox) {
            alertBox.classList.remove('d-none');
            setTimeout(() => alertBox.classList.add('d-none'), 3000);
        }

        e.target.reset(); // This clears all fields
        
        // RE-APPLY the branch name so it doesn't disappear
        document.getElementById('displayShopId').value = currentBranch;
        
        updateLiveDateTime(); // Refresh the date/time after reset
    }).catch(err => alert("Error: " + err.message));
});
function initContext() {
    const label = document.getElementById('sidebar-shop-label');
    const display = document.getElementById('displayShopId');
    
    // Start the clock
    updateLiveDateTime();
    setInterval(updateLiveDateTime, 1000);

    if (isAdmin) {
        label.innerText = "ADMIN CONSOLE";

    // THIS LINE ONLY RUNS FOR ADMIN
        if(display) display.value = "MASTER ADMIN";

        if (localStorage.getItem(sessionKey) !== 'true') {
            document.getElementById('login-overlay').classList.remove('hidden');
        } else {
            document.querySelectorAll('.admin-only').forEach(e => e.classList.remove('hidden'));
            initCharts();
            syncDashboard('all');
            navigateTo('dashboard');
        }
    } else {
        label.innerText = userId.toUpperCase();
        if(display) display.value = userId;
        db.ref('shops').once('value', snap => {
            const list = Object.values(snap.val() || {});
            if(!list.includes(userId)) db.ref('shops').push(userId);
        });
        navigateTo('form');
    }
}

function syncShopControls() {
    db.ref('shops').on('value', (snap) => {
        const shops = snap.val() || {};
        const dropdown = document.getElementById('masterShopDropdown');
        if(!dropdown) return;
        
        dropdown.innerHTML = '<option value="all">View All Records (Master)</option>';
        Object.keys(shops).forEach(id => {
            const name = shops[id];
            dropdown.innerHTML += `<option value="${name}" ${currentFilter === name ? 'selected' : ''}>${name}</option>`;
        });
    });
}

function filterBy(val) {
    currentFilter = val;
    syncDashboard(val);
}

function syncDashboard(filter = 'all') {
    db.ref('records').on('value', (snap) => {
        const data = snap.val() || {};
        let total = 0, count = 0, stats = {};
        const table = document.getElementById('recordTableBody');
        table.innerHTML = '';
        
        // Sort: Newest entries first
        const entries = Object.entries(data).reverse();

        entries.forEach(([id, entry]) => {
            if (filter !== 'all' && entry.shopId !== filter) return;

            count++;
            total += parseFloat(entry.amount) || 0;
            stats[entry.service] = (stats[entry.service] || 0) + 1;

            // Data extraction with fallbacks
            const unitDisplay = entry.shopId || 'N/A';
            const phoneDisplay = entry.phone || '—';
            const dateDisplay = entry.date || '—';
            const timeDisplay = entry.time || '—';

            table.innerHTML += `<tr>
                <td class="ps-3"><span class="badge bg-dark">${unitDisplay}</span></td>
                <td class="fw-bold">${entry.customer}</td>
                <td class="text-muted">${phoneDisplay}</td>
                <td>${entry.service}</td>
                <td class="fw-bold">₹${entry.amount}</td>
                <td>${dateDisplay}</td> <td class="text-muted">${timeDisplay}</td> <td class="pe-3 text-end">
                    <i class="bi bi-trash text-danger" role="button" onclick="deleteRecord('${id}')"></i>
                </td>
            </tr>`;
        });

        // Update Stats
        document.getElementById('stat-count').innerText = count;
        document.getElementById('stat-revenue').innerText = `₹${total.toFixed(2)}`;
        
        if (bChart) updateVisuals(stats);
    });
}

// --- INSTANT SEARCH FUNCTION ---
function filterTableData() {
    const input = document.getElementById("tableSearch").value.toLowerCase();
    const rows = document.querySelectorAll("#recordTableBody tr");

    rows.forEach(row => {
        const rowText = row.innerText.toLowerCase();
        row.style.display = rowText.includes(input) ? "" : "none";
    });
}

document.getElementById('entryForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    db.ref('records').push({
        shopId: userId,
        customer: document.getElementById('custName').value,
        service: document.getElementById('custService').value,
        amount: document.getElementById('custAmount').value,
        date: document.getElementById('custDateTime').value // Saves the live time
    }).then(() => { 
        alert("Record Saved Successfully."); 
        e.target.reset(); 
        updateLiveDateTime(); 
    });
});

async function handleLogin() {
    const input = document.getElementById('admin-pass-input').value;
    const snap = await db.ref('admin_config/password').get();
    if (input === (snap.val() || "1234")) {
        localStorage.setItem(sessionKey, 'true');
        location.reload();
    } else document.getElementById('login-error').classList.remove('hidden');
}

function syncServices() {
    db.ref('services').on('value', snap => {
        const svcs = snap.val() || {}, drop = document.getElementById('custService'), reg = document.getElementById('serviceRegistry');
        drop.innerHTML = ''; if(reg) reg.innerHTML = '';
        Object.keys(svcs).forEach(id => {
            drop.innerHTML += `<option value="${svcs[id]}">${svcs[id]}</option>`;
            if(reg) reg.innerHTML += `<span class="badge bg-light text-dark border me-1">${svcs[id]} <i class="bi bi-x text-danger" role="button" onclick="deleteService('${id}')"></i></span>`;
        });
        if(isAdmin) document.getElementById('stat-services').innerText = Object.keys(svcs).length;
    });
}

function registerService() {
    const val = document.getElementById('serviceInput').value.trim();
    if (val) db.ref('services').push(val).then(() => document.getElementById('serviceInput').value = '');
}
function deleteRecord(id) { if(confirm("Delete record?")) db.ref('records').child(id).remove(); }
function deleteService(id) { if(confirm("Remove?")) db.ref('services').child(id).remove(); }
function updatePassword() {
    const p = document.getElementById('new-pass').value;
    if(p.length > 3) db.ref('admin_config').update({password:p}).then(()=>alert("Success"));
}
function terminateSession() { localStorage.removeItem(sessionKey); window.location.href = window.location.pathname; }

function navigateTo(v) {
    ['dashboard', 'form', 'settings'].forEach(id => {
        const el = document.getElementById(`view-${id}`);
        if(el) el.classList.toggle('hidden', id !== v);
    });
    const navs = {'dashboard': 'nav-dash', 'form': 'nav-form', 'settings': 'nav-settings'};
    Object.keys(navs).forEach(k => {
        const el = document.getElementById(navs[k]);
        if(el) el.classList.toggle('active', k === v);
    });
}

function initCharts() {
    const o = { maintainAspectRatio: false, plugins: { legend: { display: false } } };
    bChart = new Chart(document.getElementById('barChart'), { type: 'bar', data: { labels: [], datasets: [{ data: [], backgroundColor: '#2271b1' }] }, options: o });
    pChart = new Chart(document.getElementById('pieChart'), { type: 'pie', data: { labels: [], datasets: [{ data: [], backgroundColor: ['#2271b1', '#d63638', '#ffb900', '#46b450'] }] }, options: { maintainAspectRatio: false } });
}

function updateVisuals(stats) {
    const l = Object.keys(stats), v = Object.values(stats);
    bChart.data.labels = l; bChart.data.datasets[0].data = v; bChart.update();
    pChart.data.labels = l; pChart.data.datasets[0].data = v; pChart.update();
}

function filterTableData() {
    const input = document.getElementById("tableSearch").value.toLowerCase();
    const rows = document.querySelectorAll("#recordTableBody tr");

    rows.forEach(row => {
        // This grabs all text inside the row (Name, Number, Date, Time, Service, Amount)
        const rowText = row.innerText.toLowerCase();
        
        if (rowText.includes(input)) {
            row.style.display = ""; // Show row
        } else {
            row.style.display = "none"; // Hide row
        }
    });
}