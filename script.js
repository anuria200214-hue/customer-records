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

/*let bChart, pChart, currentFilter = 'all';*/
let bChart, pChart, currentFilter = 'all', currentTimeFilter = 'all';
let manualRange = { from: null, to: null };

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

    // Initialize charge fields to 0
    if(document.getElementById('serviceCharge')) document.getElementById('serviceCharge').value = 0;
    if(document.getElementById('adminCharge')) document.getElementById('adminCharge').value = 0;
    if(document.getElementById('custAmount')) document.getElementById('custAmount').value = 0;

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
        payment: document.querySelector('input[name="payMethod"]:checked').value,
        serviceCharge: document.getElementById('serviceCharge').value,
       adminCharge: document.getElementById('adminCharge').value,
        amount: document.getElementById('custAmount').value,
        date: document.getElementById('custDate').value,
        time: document.getElementById('custTime').value
    };
    db.ref('records').push(recordData).then(() => {
        document.getElementById('success-alert').classList.remove('d-none');
        setTimeout(() => document.getElementById('success-alert').classList.add('d-none'), 3000);
        e.target.reset();
        document.getElementById('serviceCharge').value = 0; // Ensure reset to 0
        document.getElementById('adminCharge').value = 0;  // Ensure reset to 0
        document.getElementById('custAmount').value = 0;   // Ensure reset to 0  
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

                // --- INSERT THE LINE BELOW ---
    if (!isWithinRange(entry.date, currentTimeFilter)) return; 
    // ---
                count++; 
                total += parseFloat(entry.amount) || 0;
                
                // LOGIC: Sirf wahi service chart mein jayegi jo Active List mein hai
                if (activeServices.includes(entry.service)) {
                    stats[entry.service] = (stats[entry.service] || 0) + 1;
                }

                 // --- NAYA TAG LOGIC (Line 107 ke baad replace karein) ---
const isFollowupDone = entry.followupDone || false;
const isRenewalDone = entry.renewalDone || false;

let highlightClass = "", statusBadge = "";
const isIns = entry.service.toLowerCase().includes('insurance');

if (entry.date && entry.time) {
    const [d, m, y] = entry.date.split('/');
    const recordDateTime = new Date(`${y}-${m}-${d} ${entry.time}`);
    const diffMinutes = Math.floor((new Date() - recordDateTime) / 60000);

    // Follow-up Tag with "X"
    if (!isIns && !isFollowupDone && diffMinutes >= 5) {
        highlightClass = "follow-up-due";
        statusBadge = `<span class="badge-reminder bg-followup">Follow-up <i class="bi bi-x-circle ms-1" role="button" onclick="updateTag('${id}', 'followupDone', true)" style="color:red"></i></span>`;
    } 
    // Renewal Tag with "X"
    else if (isIns && !isRenewalDone && diffMinutes >= 15) {
        highlightClass = "insurance-due";
        statusBadge = `<span class="badge-reminder bg-insurance">Renewal Due <i class="bi bi-x-circle ms-1 text-white" role="button" onclick="updateTag('${id}', 'renewalDone', true)"></i></span>`;
    }
}
// --- STRICT MINUTES LOGIC END ---
                const displayDate = entry.date ? entry.date.split(',')[0] : 'N/A';
                const displayTime = entry.time || '--';

                const pType = entry.payment || 'Cash';
                const pBadgeClass = pType === 'Online' ? 'bg-info text-dark' : 'bg-secondary text-white';

                /*table.innerHTML += `<tr class="${highlightClass}" data-hidden="${entry.hiddenFromTabs || false}">
                    <td class="ps-3"><span class="badge bg-dark">${entry.shopId}</span></td>
                    <td class="fw-bold">${entry.customer}</td>
                    <td class="text-muted">${entry.phone}</td>
                    <td><div style="display:flex;align-items:center;gap:8px;"><span>${entry.service}</span>${statusBadge}</div></td>
                    <td><span class="badge ${pBadgeClass}" style="font-size: 10px;">${pType.toUpperCase()}</span></td>
                    <td class="fw-bold text-primary">
                     ₹${entry.amount}
                  <div style="font-size: 10px; color: #72777c; font-weight: normal;">
                      (S:₹${entry.serviceCharge || 0} + A:₹${entry.adminCharge || 0})
                 </div>
                 </td>
                    <td>${displayDate}</td>
                    <td>${displayTime}</td>
                    <td class="pe-3 text-end"><i class="bi bi-trash text-danger" role="button" onclick="deleteRecord('${id}')"></i></td>
                </tr>`;
            });*/

     table.innerHTML += `<tr class="${highlightClass}" data-hidden="${entry.hiddenFromTabs || false}">
    <td class="ps-3"><span class="badge bg-dark">${entry.shopId}</span></td>
    <td class="fw-bold">${entry.customer}</td>
    <td class="text-muted">${entry.phone}</td>
    <td><div style="display:flex;align-items:center;gap:8px;"><span>${entry.service}</span>${statusBadge}</div></td>
    <td><span class="badge ${pBadgeClass}" style="font-size: 10px;">${pType.toUpperCase()}</span></td>
    <td class="fw-bold text-primary">
        ₹${entry.amount}
        <div style="font-size: 10px; color: #72777c; font-weight: normal;">
            (S:₹${entry.serviceCharge || 0} + A:₹${entry.adminCharge || 0})
        </div>
    </td>
    <td>${displayDate}</td>
    <td>${displayTime}</td>
     <td class="pe-3 text-end">
        <div class="dropdown d-inline-block">
            <i class="bi bi-plus-circle text-primary me-3" role="button" data-bs-toggle="dropdown" style="font-size: 1.1rem;"></i>
            <ul class="dropdown-menu shadow border-0" style="font-size: 12px;">
                <li><a class="dropdown-item" href="javascript:void(0)" onclick="updateTag('${id}', 'followupDone', false)">+ Add Follow-up</a></li>
                <li><a class="dropdown-item" href="javascript:void(0)" onclick="updateTag('${id}', 'renewalDone', false)">+ Add Renewable</a></li>
            </ul>

            <i class="bi bi-trash text-danger" role="button" onclick="softDelete('${id}')"></i>
        </div>
    </td>
</tr>`;
 });

            document.getElementById('stat-count').innerText = count;
            document.getElementById('stat-revenue').innerText = `₹${total.toLocaleString('en-IN')}`;
            if (typeof bChart !== 'undefined') updateVisuals(stats);

            switchTab(currentTab);
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

// Add these at the very end of your script.js
function setTimeFilter(range, btn) {
    currentTimeFilter = range;

    // Clear manual inputs if a preset is clicked
    document.getElementById('manualDateFrom').value = '';
    document.getElementById('manualDateTo').value = '';
    manualRange = { from: null, to: null };

    btn.parentElement.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    syncDashboard(currentFilter); // Re-run the sync with the new time filter
}

function isWithinRange(dateStr, range) {
    if (range === 'all' || !dateStr) return true;
    
    const [d, m, y] = dateStr.split('/');
    const recordDate = new Date(y, m - 1, d);
    recordDate.setHours(0, 0, 0, 0);

    const now = new Date();
    now.setHours(0, 0, 0, 0);
   
    //Manual Range Logic
    /*if (range === 'manual') {
        if (!manualRange.from || !manualRange.to) return true;
        const fromDate = new Date(manualRange.from).setHours(0, 0, 0, 0);
        const toDate = new Date(manualRange.to).setHours(0, 0, 0, 0);
        return recordDate >= fromDate && recordDate <= toDate;
    }*/

    // --- MANUAL RANGE & SINGLE DATE LOGIC ---
    if (range === 'manual') {
        if (!manualRange.from) return true;

        const fromDate = new Date(manualRange.from);
        fromDate.setHours(0, 0, 0, 0);

        if (!manualRange.to) {
            // SINGLE DATE MODE: Agar dusri date nahi hai, toh exact match karein
            return recordDate.getTime() === fromDate.getTime();
        } else {
            // RANGE/MONTH MODE: Agar dono hain, toh beech ka data dikhayein
            const toDate = new Date(manualRange.to);
            toDate.setHours(0, 0, 0, 0);
            return recordDate >= fromDate && recordDate <= toDate;
        }
    }

    if (range === 'daily') {
        return recordDate.getTime() === now.getTime();
    }
    
    if (range === 'weekly') {
        const weekAgo = new Date();
        weekAgo.setDate(now.getDate() - 7);
        weekAgo.setHours(0, 0, 0, 0);
        return recordDate >= weekAgo && recordDate <= now;
    }
    
    if (range === 'monthly') {
        const monthAgo = new Date();
        monthAgo.setDate(now.getDate() - 30); // 30 days balance sheet
        monthAgo.setHours(0, 0, 0, 0);
        /*monthAgo.setMonth(now.getMonth() - 1);*/
        return recordDate >= monthAgo && recordDate <= now;
    }
    return false;
}

function calculateTotal() {
    const service = parseFloat(document.getElementById('serviceCharge').value) || 0;
    const admin = parseFloat(document.getElementById('adminCharge').value) || 0;
    document.getElementById('custAmount').value = service + admin;
}

/*function switchTab(type) {
    currentTab = type;
    const rows = document.querySelectorAll("#recordTableBody tr");
    let fCount = 0, rCount = 0;

    rows.forEach(row => {
        // We look for the data-attributes we'll add to the <tr> (see step 4)
        const isHidden = row.getAttribute('data-hidden') === 'true';
        const hasFollowup = row.querySelector('.bg-followup') !== null;
        const hasRenewal = row.querySelector('.bg-insurance') !== null;

        if (hasFollowup && !isHidden) fCount++;
        if (hasRenewal && !isHidden) rCount++;

        if (type === 'all') {
            row.style.display = ""; // Always show in ALL tab
        } else {
            // Hide if admin "soft deleted" it OR if it doesn't match the tab
            if (isHidden) {
                row.style.display = "none";
            } else if (type === 'renewal') {
                row.style.display = hasRenewal ? "" : "none";
            } else if (type === 'follow-up') {
                row.style.display = hasFollowup ? "" : "none";
            }
        }
    });

    if(document.getElementById('count-followup')) document.getElementById('count-followup').innerText = fCount;
    if(document.getElementById('count-renewal')) document.getElementById('count-renewal').innerText = rCount;
}
*/
let currentTab = 'all';
function switchTab(type) {
    currentTab = type;

  

    // Remove 'active' class from all buttons
    document.querySelectorAll('#recordTabs .nav-link').forEach(btn => {
        btn.classList.remove('active');
    });

    // Add 'active' class to the current clicked button
    if (type === 'all') document.getElementById('tab-all').classList.add('active');
    if (type === 'follow-up') document.getElementById('tab-followup').classList.add('active');
    if (type === 'renewal') document.getElementById('tab-renewal').classList.add('active');

    const rows = document.querySelectorAll("#recordTableBody tr");
    let fCount = 0, rCount = 0;

    rows.forEach(row => {
        const isHidden = row.getAttribute('data-hidden') === 'true';
        // Hum ab check karenge ki record "Insurance" hai ya normal service
        const serviceText = row.cells[3].innerText.toLowerCase();
        const isIns = serviceText.includes('insurance');

        // Counts update karein (sirf unka jo hide nahi kiye gaye)
        if (!isIns && !isHidden) fCount++;
        if (isIns && !isHidden) rCount++;

        if (type === 'all') {
            row.style.display = ""; // ALL tab mein sab dikhega
        } else {
            if (isHidden) {
                row.style.display = "none"; // Agar admin ne delete (hide) kiya hai
            } else if (type === 'renewal') {
                row.style.display = isIns ? "" : "none";
            } else if (type === 'follow-up') {
                row.style.display = !isIns ? "" : "none";
            }
        }
    });

    if(document.getElementById('count-followup')) document.getElementById('count-followup').innerText = fCount;
    if(document.getElementById('count-renewal')) document.getElementById('count-renewal').innerText = rCount;
}

function applyManualFilter() {
    const fromVal = document.getElementById('manualDateFrom').value;
    const toVal = document.getElementById('manualDateTo').value;

    /*if (fromVal && toVal) {
        manualRange = { 
            from: new Date(fromVal), 
            to: new Date(toVal) 
        };
        currentTimeFilter = 'manual'; // Switch mode to manual*/

        if (fromVal) {
        manualRange = { 
            from: fromVal, // String pass kar rahe hain simple handling ke liye
            to: toVal ? toVal : null 
        };
        currentTimeFilter = 'manual';
        
        /*document.querySelectorAll('.btn-group .btn').forEach(b => b.classList.remove('active'));*/
        
        syncDashboard(currentFilter); // Refresh data
    }
}

// 2. Modified updateTag to also clear the 'hiddenFromTabs' flag if adding a tag back
function softDelete(recordId) {
    if(confirm("Hide from this tab? Record stays in 'ALL'.")) {
        db.ref('records').child(recordId).update({
            hiddenFromTabs: true
        });
        // Firebase listener will auto-trigger syncDashboard
    }
}

function updateTag(recordId, field, status) {
    let updates = {};
    updates[field] = status;
    
    // If status is false, it means we are ADDING the tag back
    if (status === false) {
        updates['hiddenFromTabs'] = false;
    }

    db.ref('records').child(recordId).update(updates);
}