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

// --- HARD SECURITY ---
if (!isAdmin && !allowedShops.includes(userId)) {
    document.body.innerHTML = '<div id="denied-overlay"><h1>403 - ACCESS DENIED</h1><p>Terminal Unauthorized</p></div>';
}

let bChart, pChart, currentFilter = 'all';

window.onload = () => {
    if (!document.getElementById('denied-overlay')) {
        initContext();
        syncServices();
        if(isAdmin) syncShopControls();
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
    const display = document.getElementById('displayShopId');
    updateLiveDateTime();
    setInterval(updateLiveDateTime, 1000);

    if (isAdmin) {
        label.innerText = "ADMIN CONSOLE";
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
        navigateTo('form');
    }
}

async function handleLogin() {
    const input = document.getElementById('admin-pass-input').value;
    // Default password is set to 'admin'
    if (input === "admin") {
        localStorage.setItem(sessionKey, 'true');
        location.reload();
    } else {
        document.getElementById('login-error').classList.remove('hidden');
    }
}

document.getElementById('entryForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
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
        const alertBox = document.getElementById('success-alert');
        alertBox.classList.remove('d-none');
        setTimeout(() => alertBox.classList.add('d-none'), 3000);
        e.target.reset();
        document.getElementById('displayShopId').value = currentBranch;
        updateLiveDateTime();
    });
});

function syncDashboard(filter = 'all') {
    db.ref('records').on('value', (snap) => {
        const data = snap.val() || {};
        const table = document.getElementById('recordTableBody');
        let total = 0, count = 0, stats = {};
        table.innerHTML = '';
        const now = new Date();
        const entries = Object.entries(data).reverse();

        entries.forEach(([id, entry]) => {
            if (filter !== 'all' && entry.shopId !== filter) return;
            count++; total += parseFloat(entry.amount) || 0;
            stats[entry.service] = (stats[entry.service] || 0) + 1;

            let highlightClass = "";
            if (entry.date) {
                const [d, m, y] = entry.date.split('/');
                const rDate = new Date(y, m - 1, d);
                const diffDays = Math.ceil(Math.abs(now - rDate) / (1000 * 60 * 60 * 24));
                const isIns = entry.service.toLowerCase().includes('insurance');
                if (isIns && diffDays >= 330) highlightClass = "insurance-due";
                else if (!isIns && diffDays >= 30) highlightClass = "follow-up-due";
            }

            table.innerHTML += `<tr class="${highlightClass}">
                <td class="ps-3"><span class="badge bg-dark">${entry.shopId}</span></td>
                <td class="fw-bold">${entry.customer}</td>
                <td>${entry.phone}</td>
                <td>${entry.service}</td>
                <td class="fw-bold">₹${entry.amount}</td>
                <td>${entry.date}</td>
                <td class="text-muted">${entry.time}</td>
                <td class="pe-3 text-end"><i class="bi bi-trash text-danger" role="button" onclick="deleteRecord('${id}')"></i></td>
            </tr>`;
        });
        document.getElementById('stat-count').innerText = count;
        document.getElementById('stat-revenue').innerText = `₹${total.toFixed(2)}`;
        if (bChart) updateVisuals(stats);
    });
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

function filterTableData() {
    const input = document.getElementById("tableSearch").value.toLowerCase();
    document.querySelectorAll("#recordTableBody tr").forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(input) ? "" : "none";
    });
}

function registerService() {
    const val = document.getElementById('serviceInput').value.trim();
    if (val) db.ref('services').push(val).then(() => document.getElementById('serviceInput').value = '');
}

function syncShopControls() {
    db.ref('shops').on('value', snap => {
        const dropdown = document.getElementById('masterShopDropdown');
        dropdown.innerHTML = '<option value="all">All Shops</option>';
        Object.values(snap.val() || {}).forEach(name => {
            dropdown.innerHTML += `<option value="${name}">${name}</option>`;
        });
    });
}

function navigateTo(v) {
    ['dashboard', 'form', 'settings'].forEach(id => document.getElementById(`view-${id}`)?.classList.toggle('hidden', id !== v));
    const navs = {'dashboard': 'nav-dash', 'form': 'nav-form', 'settings': 'nav-settings'};
    Object.keys(navs).forEach(k => document.getElementById(navs[k])?.classList.toggle('active', k === v));
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

function deleteRecord(id) { if(confirm("Delete record?")) db.ref('records').child(id).remove(); }
function deleteService(id) { if(confirm("Remove?")) db.ref('services').child(id).remove(); }
function terminateSession() { localStorage.removeItem(sessionKey); location.reload(); }
function filterBy(val) { currentFilter = val; syncDashboard(val); }