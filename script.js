const firebaseConfig = {
    apiKey: "AIzaSyBoP9Dxain9dj6sNvtWzG8YZ1wFTBSe6MQ",
    authDomain: "service-records-d5ee6.firebaseapp.com",
    projectId: "service-records-d5ee6",
    databaseURL: "https://service-records-d5ee6-default-rtdb.firebaseio.com"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('id');
const allowedShops = ['shop0.1', 'shop0.2', 'shop0.3', 'shop0.4', 'shop0.5'];
const isAdmin = userId === 'admin';
const sessionKey = 'sys_admin_auth';

let bChart, pChart, currentFilter = 'all';

window.onload = () => {
    if (isAdmin || allowedShops.includes(userId)) {
        initContext();
        syncServices();
        if(isAdmin) syncShopControls();
    } else {
        document.body.innerHTML = `<div id="denied-overlay"><h1>403 - ACCESS DENIED</h1></div>`;
    }
};

function updateLiveDateTime() {
    const now = new Date();
    const dStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const tStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    if (document.getElementById('custDate')) document.getElementById('custDate').value = dStr;
    if (document.getElementById('custTime')) document.getElementById('custTime').value = tStr;
}

function initContext() {
    const label = document.getElementById('sidebar-shop-label');
    const branchDisplay = document.getElementById('displayShopId'); // Form field reference
    updateLiveDateTime();
    setInterval(updateLiveDateTime, 1000);

    if (isAdmin) {
        label.innerText = "ADMIN CONSOLE";
        // Fix: Admin hone par field mein text set karein
        if(branchDisplay) branchDisplay.value = "MASTER ADMIN"; 
        
        if (localStorage.getItem(sessionKey) !== 'true') {
            document.getElementById('login-overlay').classList.remove('hidden');
        } else {
            document.querySelectorAll('.admin-only').forEach(e => e.classList.remove('hidden'));
            initCharts();
            syncDashboard('all');
            navigateTo('dashboard');

            setInterval(() => {
                syncDashboard(currentFilter);
            }, 30000);
        }
    } else {
        label.innerText = userId.toUpperCase();
        // Shop user hone par Shop ID set karein
        if(branchDisplay) branchDisplay.value = userId; 
        navigateTo('form');
    }
}
async function handleLogin() {
    if (document.getElementById('admin-pass-input').value === "admin") {
        localStorage.setItem(sessionKey, 'true');
        location.reload();
    } else {
        document.getElementById('login-error').classList.remove('hidden');
    }
}

document.getElementById('entryForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
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
        document.getElementById('success-alert').classList.remove('d-none');
        setTimeout(() => document.getElementById('success-alert').classList.add('d-none'), 3000);
        e.target.reset();
        document.getElementById('displayShopId').value = isAdmin ? "MASTER ADMIN" : userId;
        updateLiveDateTime();
    });
});

function syncDashboard(filter = 'all') {
    // 1. Pehle Active Services ki list fetch karein
    db.ref('services').once('value', (svcSnap) => {
        const activeServices = Object.values(svcSnap.val() || {});

        // 2. Phir Records listen karein
        db.ref('records').on('value', (snap) => {
            const data = snap.val() || {};
            const table = document.getElementById('recordTableBody');
            let total = 0, count = 0, stats = {};
            table.innerHTML = '';
            const now = new Date();
            const entries = Object.entries(data).reverse();

            entries.forEach(([id, entry]) => {
                if (filter !== 'all' && entry.shopId !== filter) return;
                count++; 
                total += parseFloat(entry.amount) || 0;
                
                // LOGIC: Sirf wahi service chart mein jayegi jo Active List mein hai
                if (activeServices.includes(entry.service)) {
                    stats[entry.service] = (stats[entry.service] || 0) + 1;
                }

                let highlightClass = "", statusBadge = "";
                // --- STRICT MINUTES LOGIC START ---
if (entry.date && entry.time) {
    const [d, m, y] = entry.date.split('/');
    const formattedDate = `${y}-${m}-${d}`;
    const recordDateTime = new Date(`${formattedDate} ${entry.time}`);
    const now = new Date();
    
    const diffMs = now - recordDateTime;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    const isIns = entry.service.toLowerCase().includes('insurance');

    if (isIns) {
        // Sirf 15 minute hone par hi show karega
        if (diffMinutes >= 15) {
            highlightClass = "insurance-due";
            statusBadge = `<span class="badge-reminder bg-insurance">Renewal Due</span>`;
        }
    } else {
        // Sirf 5 minute hone par hi show karega
        if (diffMinutes >= 5) {
            highlightClass = "follow-up-due";
            statusBadge = `<span class="badge-reminder bg-followup">Follow-up</span>`;
        }
    }
}
// --- STRICT MINUTES LOGIC END ---
                const displayDate = entry.date ? entry.date.split(',')[0] : 'N/A';
                const displayTime = entry.time || '--';

                table.innerHTML += `<tr class="${highlightClass}">
                    <td class="ps-3"><span class="badge bg-dark">${entry.shopId}</span></td>
                    <td class="fw-bold">${entry.customer}</td>
                    <td class="text-muted">${entry.phone}</td>
                    <td><div style="display:flex;align-items:center;gap:8px;"><span>${entry.service}</span>${statusBadge}</div></td>
                    <td class="fw-bold text-primary">₹${entry.amount}</td>
                    <td>${displayDate}</td>
                    <td>${displayTime}</td>
                    <td class="pe-3 text-end"><i class="bi bi-trash text-danger" role="button" onclick="deleteRecord('${id}')"></i></td>
                </tr>`;
            });

            document.getElementById('stat-count').innerText = count;
            document.getElementById('stat-revenue').innerText = `₹${total.toLocaleString('en-IN')}`;
            if (typeof bChart !== 'undefined') updateVisuals(stats);
        });
    });
}


function syncServices() {
    db.ref('services').on('value', snap => {
        const svcs = snap.val() || {}, drop = document.getElementById('custService'), reg = document.getElementById('serviceRegistry');
        if(drop) drop.innerHTML = ''; if(reg) reg.innerHTML = '';
        Object.keys(svcs).forEach(id => {
            if(drop) drop.innerHTML += `<option value="${svcs[id]}">${svcs[id]}</option>`;
            if(reg) reg.innerHTML += `<span class="badge bg-white text-dark border p-2">${svcs[id]} <i class="bi bi-x text-danger ms-2" role="button" onclick="deleteService('${id}')"></i></span>`;
        });
        if(isAdmin) document.getElementById('stat-services').innerText = Object.keys(svcs).length;
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

function registerService() {
    const val = document.getElementById('serviceInput').value.trim();
    if (val) db.ref('services').push(val).then(() => {
        document.getElementById('serviceInput').value = '';
        if(isAdmin) syncDashboard(currentFilter); // Refresh dashboard charts
    });
}

function deleteService(id) {
    if(confirm("Remove category? Visual Dashboard will update immediately.")) {
        db.ref('services').child(id).remove().then(() => syncDashboard(currentFilter));
    }
}

function navigateTo(v) {
    ['dashboard', 'form', 'settings'].forEach(id => document.getElementById(`view-${id}`)?.classList.toggle('hidden', id !== v));
    const navs = {'dashboard': 'nav-dash', 'form': 'nav-form', 'settings': 'nav-settings'};
    Object.keys(navs).forEach(k => document.getElementById(navs[k])?.classList.toggle('active', k === v));
}

function syncShopControls() {
    const dropdown = document.getElementById('masterShopDropdown');
    dropdown.innerHTML = '<option value="all">All Shop Records</option>';
    allowedShops.forEach(shop => dropdown.innerHTML += `<option value="${shop}">${shop}</option>`);
}

function filterTableData() {
    const input = document.getElementById("tableSearch").value.toLowerCase();
    document.querySelectorAll("#recordTableBody tr").forEach(row => row.style.display = row.innerText.toLowerCase().includes(input) ? "" : "none");
}

function deleteRecord(id) { if(confirm("Delete?")) db.ref('records').child(id).remove(); }
function terminateSession() { localStorage.removeItem(sessionKey); location.reload(); }
function filterBy(val) { currentFilter = val; syncDashboard(val); }