// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyBoP9Dxain9dj6sNvtWzG8YZ1wFTBSe6MQ",
  authDomain: "service-records-d5ee6.firebaseapp.com",
  projectId: "service-records-d5ee6",
  storageBucket: "service-records-d5ee6.firebasestorage.app",
  messagingSenderId: "724836577296", // Yeh change hona zaroori hai
  appId: "1:724836577296:web:58c1a25b50aa7510e99a95",
  measurementId: "G-ZGK7V0N2CB"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// --- INITIALIZATION ---
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

// --- AUTH LOGIC ---
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
}

// --- CLOUD DATA ENGINE ---
function loadGlobalData() {
    const path = isPrivileged ? 'records' : `records/${currentUnit}`;
    
    // Cloud se data khinchna
    db.ref(path).on('value', (snapshot) => {
        const data = snapshot.val();
        applicationData = [];
        
        if (isPrivileged) {
            // Admin ke liye saari shops ka data merge karna
            for (let shop in data) {
                for (let id in data[shop]) {
                    applicationData.push({ ...data[shop][id], id: id, unit: shop });
                }
            }
        } else {
            // Shop ke liye sirf apna data
            for (let id in data) {
                applicationData.push({ ...data[id], id: id, unit: currentUnit });
            }
        }
        
        // Services load karna (Cloud se)
        db.ref(`services/${currentUnit}`).on('value', (svcSnap) => {
            availableServices = svcSnap.val() || ['Pancard', 'Insurance'];
            updateDashboardUI(isPrivileged ? 'ALL UNITS' : currentUnit);
        });
    });
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

// --- RECORD ACTIONS (SAVE TO CLOUD) ---
document.getElementById('submissionForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const entry = {
        name: document.getElementById('entryName').value,
        phone: document.getElementById('entryPhone').value,
        date: document.getElementById('sysDate').value,
        time: document.getElementById('sysTime').value,
        type: document.getElementById('entryType').value,
        amount: document.getElementById('entryAmount').value,
        timestamp: Date.now()
    };
    
    // Save to Firebase Cloud
    db.ref(`records/${currentUnit}`).push(entry).then(() => {
        e.target.reset();
        navigateTo('dashboard');
        alert("Success: Saved to Cloud!");
    });
});

function removeEntry(id, sourceUnit) {
    if(!confirm("Delete this record from Cloud?")) return;
    db.ref(`records/${sourceUnit}/${id}`).remove();
}

// --- SEARCH & SERVICES ---
function executeSearch() {
    const val = document.getElementById('dataFilter').value.toLowerCase();
    const filtered = applicationData.filter(r => r.name.toLowerCase().includes(val) || r.phone.includes(val));
    renderTable(filtered);
}

function registerService() {
    const input = document.getElementById('serviceInput');
    const val = input.value.trim();
    if(val && !availableServices.includes(val)) {
        availableServices.push(val);
        db.ref(`services/${currentUnit}`).set(availableServices);
        input.value = '';
    }
}

function deregisterService(s) {
    if(!confirm(`Remove "${s}"?`)) return;
    const newSvcs = availableServices.filter(x => x !== s);
    db.ref(`services/${currentUnit}`).set(newSvcs);
}

// --- TABLE & CHARTS (Aapka Purana Logic) ---
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
                <td><span class="badge bg-success-subtle text-success rounded-pill px-2">Paid</span></td>
                <td class="pe-3 text-end">
                    <i class="bi bi-trash3-fill text-danger cursor-pointer" onclick="removeEntry('${r.id}', '${r.unit}')"></i>
                </td>
            </tr>`;
    });
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

// --- UTILS ---
function navigateTo(view) {
    document.getElementById('view-dashboard').classList.toggle('hidden', view !== 'dashboard');
    document.getElementById('view-form').classList.toggle('hidden', view !== 'form');
}

function copyAccessLink() {
    const url = window.location.origin + window.location.pathname + "?id=" + currentUnit;
    navigator.clipboard.writeText(url);
    alert("Shareable link copied!");
}