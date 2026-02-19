/**
 * SYSTEM STATE & INITIALIZATION
 */
const urlParams = new URLSearchParams(window.location.search);
const currentUnit = urlParams.get('id') || 'default_shop';
const isPrivileged = (currentUnit === 'admin');

let applicationData = [];
let availableServices = [];
let chartInstance1, chartInstance2;

window.onload = function() {
    if (isPrivileged) {
        if (sessionStorage.getItem('admin_session') === 'true') {
            unlockAdminView();
            loadGlobalData();
        } else {
            document.getElementById('authOverlay').classList.remove('hidden');
        }
    } else {
        document.getElementById('serviceConfigSection').classList.remove('hidden');
        loadGlobalData();
    }
};

/**
 * AUTH & SECURITY LOGIC
 */
function validateAccess() {
    const input = document.getElementById('accessKeyInput').value;
    const masterKey = localStorage.getItem('system_master_key') || '1234';
    
    if (input === masterKey) {
        sessionStorage.setItem('admin_session', 'true');
        unlockAdminView();
        loadGlobalData();
    } else {
        document.getElementById('authError').classList.remove('hidden');
        setTimeout(() => document.getElementById('authError').classList.add('hidden'), 2000);
    }
}

function unlockAdminView() {
    document.getElementById('authOverlay').classList.add('hidden');
    document.getElementById('masterPanel').classList.remove('hidden');
    document.getElementById('serviceConfigSection').classList.add('hidden');
    populateShopDropdown();
}

function terminateSession() {
    sessionStorage.removeItem('admin_session');
    window.location.reload();
}

function updateMasterKey() {
    const n = prompt("Set New Admin Access Key:");
    if(n) { localStorage.setItem('system_master_key', n.trim()); alert("Key Updated."); }
}

/**
 * DATA ENGINE
 */
function populateShopDropdown() {
    const selector = document.getElementById('unitSelector');
    selector.innerHTML = '<option value="all">All Shop Units</option>';
    Object.keys(localStorage).filter(k => k.startsWith('data_')).forEach(k => {
        const unit = k.replace('data_', '');
        if(unit !== 'admin') {
            const opt = document.createElement('option');
            opt.value = unit; opt.innerText = unit.toUpperCase();
            selector.appendChild(opt);
        }
    });
}

function loadGlobalData() {
    const target = isPrivileged ? document.getElementById('unitSelector').value : currentUnit;
    
    if (isPrivileged && target === 'all') {
        applicationData = [];
        Object.keys(localStorage).filter(k => k.startsWith('data_')).forEach(k => {
            applicationData = applicationData.concat(JSON.parse(localStorage.getItem(k)) || []);
        });
        // Admin gets a combined list of services or defaults
        availableServices = ['Pancard', 'Insurance']; 
    } else {
        applicationData = JSON.parse(localStorage.getItem(`data_${target}`)) || [];
        availableServices = JSON.parse(localStorage.getItem(`services_${target}`)) || ['Pancard', 'Insurance'];
    }
    updateDashboardUI(target);
}

function updateDashboardUI(targetLabel) {
    document.getElementById('displayUnitID').innerText = targetLabel.toUpperCase();
    document.getElementById('stat-count').innerText = applicationData.length;
    
    const rev = applicationData.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    document.getElementById('stat-revenue').innerText = '₹' + rev.toLocaleString(undefined, {minimumFractionDigits: 2});
    document.getElementById('stat-services').innerText = availableServices.length;

    const registry = document.getElementById('serviceRegistry');
    const typeSelect = document.getElementById('entryType');
    if(registry && typeSelect) {
        registry.innerHTML = ''; typeSelect.innerHTML = '';
        availableServices.forEach(s => {
            registry.innerHTML += `<span class="svc-tag">${s} <i class="bi bi-x-circle-fill" onclick="deregisterService('${s}')"></i></span>`;
            typeSelect.innerHTML += `<option value="${s}">${s}</option>`;
        });
    }
    renderTable(applicationData);
    initCharts(applicationData);
}

/**
 * RECORD ACTIONS
 */
document.getElementById('submissionForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const entry = {
        id: "TXN_" + Date.now() + Math.random().toString(36).substr(2, 5),
        unit: currentUnit,
        name: document.getElementById('entryName').value,
        phone: document.getElementById('entryPhone').value,
        date: document.getElementById('sysDate').value,
        time: document.getElementById('sysTime').value,
        type: document.getElementById('entryType').value,
        amount: document.getElementById('entryAmount').value
    };
    let db = JSON.parse(localStorage.getItem(`data_${currentUnit}`)) || [];
    db.push(entry);
    localStorage.setItem(`data_${currentUnit}`, JSON.stringify(db));
    e.target.reset(); navigateTo('dashboard'); loadGlobalData();
});

function removeEntry(id, sourceUnit) {
    if(!confirm("Delete this record permanently?")) return;
    const target = sourceUnit || currentUnit;
    let db = JSON.parse(localStorage.getItem(`data_${target}`)) || [];
    localStorage.setItem(`data_${target}`, JSON.stringify(db.filter(i => String(i.id) !== String(id))));
    loadGlobalData();
}

function executeSearch() {
    const val = document.getElementById('dataFilter').value.toLowerCase();
    const filtered = applicationData.filter(r => r.name.toLowerCase().includes(val) || r.phone.includes(val));
    renderTable(filtered);
}

/**
 * SERVICE CONFIG
 */
function registerService() {
    const input = document.getElementById('serviceInput');
    const val = input.value.trim();
    if(val && !availableServices.includes(val)) {
        availableServices.push(val);
        localStorage.setItem(`services_${currentUnit}`, JSON.stringify(availableServices));
        input.value = ''; loadGlobalData();
    }
}

function deregisterService(s) {
    if(!confirm(`Remove "${s}" category?`)) return;
    availableServices = availableServices.filter(x => x !== s);
    localStorage.setItem(`services_${currentUnit}`, JSON.stringify(availableServices));
    loadGlobalData();
}

/**
 * UTILS & NAVIGATION
 */
function navigateTo(view) {
    document.getElementById('view-dashboard').classList.toggle('hidden', view !== 'dashboard');
    document.getElementById('view-form').classList.toggle('hidden', view !== 'form');
    document.getElementById('nav-dash').classList.toggle('active', view === 'dashboard');
    document.getElementById('nav-form').classList.toggle('active', view === 'form');
    if(view === 'form') {
        const d = new Date();
        document.getElementById('sysDate').value = d.toISOString().split('T')[0];
        document.getElementById('sysTime').value = d.toTimeString().split(' ')[0].substring(0,5);
    }
}

function renderTable(data) {
    const body = document.getElementById('recordTableBody');
    body.innerHTML = '';
    [...data].reverse().forEach(r => {
        body.innerHTML += `
            <tr class="align-middle">
                <td class="ps-3 py-2 fw-bold text-primary">${r.name}</td>
                <td class="text-muted">${r.phone}</td>
                <td>${r.date} <span class="text-muted small">${r.time}</span></td>
                <td><span class="badge bg-light text-dark border fw-normal">${r.type}</span></td>
                <td class="fw-bold">₹${parseFloat(r.amount).toFixed(2)}</td>
                <td><span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2">Paid</span></td>
                <td class="pe-3 text-end">
                    <i class="bi bi-trash3-fill text-danger cursor-pointer" onclick="removeEntry('${r.id}', '${r.unit}')"></i>
                </td>
            </tr>`;
    });
}

function copyAccessLink() {
    const url = window.location.origin + window.location.pathname + "?id=" + currentUnit;
    navigator.clipboard.writeText(url);
    alert("Shareable link copied!");
}

function initCharts(data) {
    if(chartInstance1) chartInstance1.destroy(); if(chartInstance2) chartInstance2.destroy();
    if(data.length === 0) return;
    const stats = {};
    data.forEach(r => stats[r.type] = (stats[r.type] || 0) + 1);
    
    chartInstance1 = new Chart(document.getElementById('revenueChart'), {
        type: 'bar',
        data: { labels: Object.keys(stats), datasets: [{ label: 'Transactions', data: Object.values(stats), backgroundColor: '#2271b1' }] },
        options: { maintainAspectRatio: false }
    });
    chartInstance2 = new Chart(document.getElementById('distributionChart'), {
        type: 'pie',
        data: { labels: Object.keys(stats), datasets: [{ data: Object.values(stats), backgroundColor: ['#2271b1', '#d63638', '#dba617', '#00a32a', '#72aee6'] }] },
        options: { maintainAspectRatio: false }
    });
}