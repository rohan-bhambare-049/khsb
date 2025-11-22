// --- Firebase Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyCVo10ySah9cCb1vlXIqQxqK_m05a1m0M0",
    authDomain: "khs-web.firebaseapp.com",
    projectId: "khs-web",
    storageBucket: "khs-web.firebasestorage.app",
    messagingSenderId: "1007815361986",
    appId: "1:1007815361986:web:388f64c952c50f5dfb825b"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const dbStore = firebase.firestore();

// --- Data Management ---
class FirebaseManager {
    constructor() {
        this.init();
    }

    async init() {
        // Check if initial data exists, if not, seed it
        const doc = await dbStore.collection('settings').doc('init').get();
        if (!doc.exists) {
            await this.seedData();
        }

        // Initialize admin password if not set
        if (!localStorage.getItem('khs_admin_password')) {
            localStorage.setItem('khs_admin_password', '014145');
        }
    }

    async seedData() {
        console.log('Seeding initial data...');
        const batch = dbStore.batch();

        // Flats 1-40
        const flats = Array.from({ length: 40 }, (_, i) => (i + 1).toString());
        const flatsRef = dbStore.collection('settings').doc('flats');
        batch.set(flatsRef, { list: flats });

        // Flat Owners
        for (let i = 1; i <= 40; i++) {
            const ownerRef = dbStore.collection('owners').doc(i.toString());
            batch.set(ownerRef, { name: `Owner ${i}` });
        }

        // Initial Notice
        const noticeRef = dbStore.collection('notices').doc(Date.now().toString());
        batch.set(noticeRef, {
            id: Date.now(),
            title: 'Welcome',
            content: 'Welcome to the new digital society portal!',
            date: new Date().toISOString().split('T')[0]
        });

        // Mark initialized
        const initRef = dbStore.collection('settings').doc('init');
        batch.set(initRef, { initialized: true });

        await batch.commit();
        console.log('Data seeded.');
    }

    // Helpers
    async getFlats() {
        const doc = await dbStore.collection('settings').doc('flats').get();
        return doc.exists ? doc.data().list : [];
    }

    async getFlatOwner(flatNo) {
        const doc = await dbStore.collection('owners').doc(flatNo).get();
        return doc.exists ? doc.data().name : `Owner ${flatNo}`;
    }

    async updateFlatOwner(flatNo, ownerName) {
        await dbStore.collection('owners').doc(flatNo).set({ name: ownerName }, { merge: true });
    }

    async getMaintenance(month) {
        const snapshot = await dbStore.collection('maintenance').doc(month).collection('records').get();
        const records = {};
        snapshot.forEach(doc => {
            records[doc.id] = doc.data();
        });
        return records;
    }

    async updateMaintenance(month, flat, data) {
        await dbStore.collection('maintenance').doc(month).collection('records').doc(flat).set(data, { merge: true });
    }

    async getExpenses(month) {
        const snapshot = await dbStore.collection('expenses').where('month', '==', month).get();
        const expenses = [];
        snapshot.forEach(doc => {
            expenses.push(doc.data());
        });
        return expenses;
    }

    async addExpense(month, expense) {
        expense.month = month; // Add month field for querying
        await dbStore.collection('expenses').doc(expense.id.toString()).set(expense);
    }

    async deleteExpense(expenseId) {
        await dbStore.collection('expenses').doc(expenseId.toString()).delete();
    }

    async updateExpense(expenseId, updatedExpense) {
        await dbStore.collection('expenses').doc(expenseId.toString()).update(updatedExpense);
    }

    async getNotices() {
        const snapshot = await dbStore.collection('notices').orderBy('id', 'desc').get();
        const notices = [];
        snapshot.forEach(doc => {
            notices.push(doc.data());
        });
        return notices;
    }

    async addNotice(notice) {
        await dbStore.collection('notices').doc(notice.id.toString()).set(notice);
    }

    async deleteNotice(noticeId) {
        await dbStore.collection('notices').doc(noticeId.toString()).delete();
    }

    async updateNotice(noticeId, updatedNotice) {
        await dbStore.collection('notices').doc(noticeId.toString()).update(updatedNotice);
    }
}

const db = new FirebaseManager();
let isAdmin = false;

// --- UI Controllers ---

// Navigation
document.querySelectorAll('.nav-links li').forEach(link => {
    link.addEventListener('click', () => {
        const target = link.getAttribute('data-target');
        navigateTo(target);
    });
});

function navigateTo(sectionId) {
    // Update Nav
    document.querySelectorAll('.nav-links li').forEach(l => l.classList.remove('active'));
    const activeLink = document.querySelector(`.nav-links li[data-target="${sectionId}"]`);
    if (activeLink) activeLink.classList.add('active');

    // Update Section
    document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');

    // Refresh Data
    if (sectionId === 'maintenance') renderMaintenance();
    if (sectionId === 'expenses') renderExpenses();
    if (sectionId === 'notices') renderNotices();
}

// --- Maintenance Section ---
const maintenanceMonthFilter = document.getElementById('maintenance-month-filter');

function initMaintenance() {
    const months = getLast12Months();
    maintenanceMonthFilter.innerHTML = months.map(m => `<option value="${m}">${m}</option>`).join('');
    maintenanceMonthFilter.addEventListener('change', renderMaintenance);
}

async function renderMaintenance() {
    const tbody = document.getElementById('maintenance-list');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Loading...</td></tr>';

    const month = maintenanceMonthFilter.value;
    const flats = (await db.getFlats()).slice(0, 20);
    const records = await db.getMaintenance(month);

    // Fetch all owners in parallel for speed
    const ownerPromises = flats.map(flat => db.getFlatOwner(flat));
    const owners = await Promise.all(ownerPromises);

    tbody.innerHTML = flats.map((flat, index) => {
        const record = records[flat] || { status: 'unpaid', amount: 0, mode: '-', paymentDate: '-' };
        const ownerName = owners[index];

        const status = record.status || 'unpaid';
        const amount = record.amount || 0;
        const mode = record.mode || '-';
        const paymentDate = record.paymentDate || '-';

        const statusClass = status === 'paid' ? 'status-paid' : 'status-unpaid';
        const editOwnerBtn = isAdmin
            ? `<button class="btn-sm" onclick="editFlatOwner('${flat}', '${ownerName}')" style="margin-left: 0.5rem;">
                <i class="fa-solid fa-user-pen"></i>
               </button>`
            : '';
        const actionBtn = isAdmin
            ? `<button class="btn-sm" onclick="openMaintenanceModal('${month}', '${flat}', '${status}', '${amount}', '${mode}', '${paymentDate}')">
                <i class="fa-solid fa-pen"></i> Edit
               </button>`
            : '';

        return `
            <tr>
                <td>${flat}</td>
                <td>${ownerName}${editOwnerBtn}</td>
                <td>₹${amount}</td>
                <td><span class="${statusClass}">${status.toUpperCase()}</span></td>
                <td>${mode}</td>
                <td>${paymentDate}</td>
                <td class="admin-only">${actionBtn}</td>
            </tr>
        `;
    }).join('');

    checkAdminVisibility();
}

function openMaintenanceModal(month, flat, currentStatus, currentAmount, currentMode, currentPaymentDate) {
    const formHtml = `
        <p><strong>Flat: ${flat} (${month})</strong></p>
        <label>Status</label>
        <select name="status">
            <option value="paid" ${currentStatus === 'paid' ? 'selected' : ''}>Paid</option>
            <option value="unpaid" ${currentStatus === 'unpaid' ? 'selected' : ''}>Unpaid</option>
        </select>
        <label>Amount (₹)</label>
        <input type="number" name="amount" value="${currentAmount}" required>
        <label>Payment Mode</label>
        <select name="mode">
            <option value="Cash" ${currentMode === 'Cash' ? 'selected' : ''}>Cash</option>
            <option value="Online" ${currentMode === 'Online' ? 'selected' : ''}>Online</option>
            <option value="Pending" ${currentMode === 'Pending' || currentMode === '-' ? 'selected' : ''}>Pending</option>
        </select>
        <label>Payment Date</label>
        <input type="date" name="paymentDate" value="${currentPaymentDate !== '-' ? currentPaymentDate : ''}">
        <button type="submit" class="btn-primary" style="width:100%; margin-top:1rem;">Update</button>
    `;

    openFormModal('Update Maintenance', formHtml, async (formData) => {
        await db.updateMaintenance(month, flat, {
            status: formData.get('status'),
            amount: formData.get('amount'),
            mode: formData.get('mode'),
            paymentDate: formData.get('paymentDate') || '-'
        });
        renderMaintenance();
    });
}

function editFlatOwner(flatNo, currentOwner) {
    const formHtml = `
        <p><strong>Edit Owner for Flat ${flatNo}</strong></p>
        <label>Owner Name</label>
        <input type="text" name="ownerName" value="${currentOwner}" required>
        <button type="submit" class="btn-primary" style="width:100%; margin-top:1rem;">Update Owner</button>
    `;

    openFormModal('Edit Flat Owner', formHtml, async (formData) => {
        await db.updateFlatOwner(flatNo, formData.get('ownerName'));
        renderMaintenance();
    });
}


// --- Expenses Section ---
const expenseMonthFilter = document.getElementById('expense-month-filter');

function initExpenses() {
    const months = getLast12Months();
    expenseMonthFilter.innerHTML = months.map(m => `<option value="${m}">${m}</option>`).join('');
    expenseMonthFilter.addEventListener('change', renderExpenses);

    document.getElementById('add-expense-btn').addEventListener('click', showAddExpenseModal);
}

async function renderExpenses() {
    const list = document.getElementById('expense-list');
    list.innerHTML = '<p class="text-muted" style="padding:1rem;">Loading...</p>';

    const month = expenseMonthFilter.value;
    const expenses = await db.getExpenses(month);
    const totalEl = document.getElementById('total-expense-amount');

    let total = 0;
    list.innerHTML = expenses.map(exp => {
        total += parseInt(exp.amount);
        const actionButtons = isAdmin
            ? `<div class="admin-only" style="display: flex; gap: 0.5rem;">
                <button class="btn-sm" onclick="editExpense('${month}', ${exp.id})">
                    <i class="fa-solid fa-pen"></i> Edit
                </button>
                <button class="btn-danger" onclick="deleteExpenseItem(${exp.id})">
                    <i class="fa-solid fa-trash"></i> Delete
                </button>
               </div>`
            : '';
        return `
            <li class="list-group-item">
                <div>
                    <strong>${exp.title}</strong>
                    <br><small class="text-muted">${exp.date}</small>
                </div>
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <span>₹${exp.amount}</span>
                    ${actionButtons}
                </div>
            </li>
        `;
    }).join('');

    if (expenses.length === 0) list.innerHTML = '<p class="text-muted" style="padding:1rem;">No expenses recorded.</p>';

    totalEl.textContent = `₹${total}`;
    renderChart(total);
}

function renderChart(total) {
    // Simple visual representation
    const chart = document.getElementById('expense-chart');
    const max = 50000; // Arbitrary max for visualization
    const percentage = Math.min((total / max) * 100, 100);

    chart.innerHTML = `
        <div style="background: #e5e7eb; height: 20px; border-radius: 10px; overflow: hidden; margin-top: 1rem;">
            <div style="width: ${percentage}%; background: var(--primary-color); height: 100%; transition: width 1s ease;"></div>
        </div>
        <p style="text-align: right; font-size: 0.8rem; margin-top: 0.5rem;">Spending Capacity Used</p>
    `;
}

function showAddExpenseModal() {
    const formHtml = `
        <label>Title</label>
        <input type="text" name="title" required>
        <label>Amount</label>
        <input type="number" name="amount" required>
        <label>Date</label>
        <input type="date" name="date" value="${new Date().toISOString().split('T')[0]}" required>
        <button type="submit" class="btn-primary" style="width:100%">Save Expense</button>
    `;
    openFormModal('Add Expense', formHtml, async (formData) => {
        const month = expenseMonthFilter.value;
        await db.addExpense(month, {
            id: Date.now(),
            title: formData.get('title'),
            amount: formData.get('amount'),
            date: formData.get('date')
        });
        renderExpenses();
    });
}

async function editExpense(month, expenseId) {
    const expenses = await db.getExpenses(month);
    const expense = expenses.find(exp => exp.id === expenseId);

    if (!expense) return;

    const formHtml = `
        <label>Title</label>
        <input type="text" name="title" value="${expense.title}" required>
        <label>Amount</label>
        <input type="number" name="amount" value="${expense.amount}" required>
        <label>Date</label>
        <input type="date" name="date" value="${expense.date}" required>
        <button type="submit" class="btn-primary" style="width:100%">Update Expense</button>
    `;
    openFormModal('Edit Expense', formHtml, async (formData) => {
        await db.updateExpense(expenseId, {
            title: formData.get('title'),
            amount: formData.get('amount'),
            date: formData.get('date')
        });
        renderExpenses();
    });
}

function deleteExpenseItem(expenseId) {
    if (confirm('Are you sure you want to delete this expense?')) {
        db.deleteExpense(expenseId).then(() => renderExpenses());
    }
}

// --- Notices Section ---
function initNotices() {
    document.getElementById('add-notice-btn').addEventListener('click', showAddNoticeModal);
}

async function renderNotices() {
    const board = document.getElementById('notice-board');
    board.innerHTML = '<p style="text-align:center; width:100%;">Loading...</p>';

    const notices = await db.getNotices();

    board.innerHTML = notices.map(notice => {
        const actionButtons = isAdmin
            ? `<div class="admin-only" style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                <button class="btn-sm" onclick="editNotice(${notice.id})">
                    <i class="fa-solid fa-pen"></i> Edit
                </button>
                <button class="btn-danger" onclick="deleteNoticeItem(${notice.id})">
                    <i class="fa-solid fa-trash"></i> Delete
                </button>
               </div>`
            : '';
        return `
            <div class="notice-card">
                <span class="notice-date">${notice.date}</span>
                <h3 class="notice-title">${notice.title}</h3>
                <p>${notice.content}</p>
                ${actionButtons}
            </div>
        `;
    }).join('');
}

function showAddNoticeModal() {
    const formHtml = `
        <label>Title</label>
        <input type="text" name="title" required>
        <label>Content</label>
        <textarea name="content" rows="4" required style="width:100%; padding:0.5rem; border:1px solid #ccc; border-radius:0.5rem;"></textarea>
        <button type="submit" class="btn-primary" style="width:100%; margin-top:1rem;">Post Notice</button>
    `;
    openFormModal('Post Notice', formHtml, async (formData) => {
        await db.addNotice({
            id: Date.now(),
            title: formData.get('title'),
            content: formData.get('content'),
            date: new Date().toISOString().split('T')[0]
        });
        renderNotices();
    });
}

async function editNotice(noticeId) {
    const notices = await db.getNotices();
    const notice = notices.find(n => n.id === noticeId);

    if (!notice) return;

    const formHtml = `
        <label>Title</label>
        <input type="text" name="title" value="${notice.title}" required>
        <label>Content</label>
        <textarea name="content" rows="4" required style="width:100%; padding:0.5rem; border:1px solid #ccc; border-radius:0.5rem;">${notice.content}</textarea>
        <button type="submit" class="btn-primary" style="width:100%; margin-top:1rem;">Update Notice</button>
    `;
    openFormModal('Edit Notice', formHtml, async (formData) => {
        await db.updateNotice(noticeId, {
            title: formData.get('title'),
            content: formData.get('content')
        });
        renderNotices();
    });
}

function deleteNoticeItem(noticeId) {
    if (confirm('Are you sure you want to delete this notice?')) {
        db.deleteNotice(noticeId).then(() => renderNotices());
    }
}

// --- Admin System ---
const adminBtn = document.getElementById('admin-btn');
const adminModal = document.getElementById('admin-modal');
const adminPinInput = document.getElementById('admin-pin');
const adminLoginSubmit = document.getElementById('admin-login-submit');
const closeModalBtn = document.querySelector('.close-modal');

adminBtn.addEventListener('click', () => {
    if (isAdmin) {
        // Logout
        isAdmin = false;
        document.body.classList.remove('admin-mode');
        adminBtn.innerHTML = '<i class="fa-solid fa-lock"></i> Admin';
        adminBtn.classList.remove('active');
        // Hide change password button
        document.getElementById('change-password-btn').style.display = 'none';
        navigateTo('home');
    } else {
        // Show Login
        adminModal.style.display = 'flex';
        adminPinInput.value = '';
        document.getElementById('login-error').textContent = '';
        adminPinInput.focus();
    }
});

closeModalBtn.addEventListener('click', () => {
    adminModal.style.display = 'none';
});

adminLoginSubmit.addEventListener('click', checkPin);
adminPinInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') checkPin();
});

function checkPin() {
    const storedPassword = localStorage.getItem('khs_admin_password') || '014145';
    if (adminPinInput.value === storedPassword) {
        isAdmin = true;
        document.body.classList.add('admin-mode');
        adminBtn.innerHTML = '<i class="fa-solid fa-unlock"></i> Logout';
        adminBtn.classList.add('active');
        adminModal.style.display = 'none';
        // Show change password button
        document.getElementById('change-password-btn').style.display = 'inline-block';
        // Re-render current view to show admin controls
        const currentSection = document.querySelector('.page-section.active').id;
        navigateTo(currentSection);
    } else {
        document.getElementById('login-error').textContent = 'Incorrect Password';
    }
}

function checkAdminVisibility() {
    // Helper to re-apply display styles if needed, though CSS handles most via body class
}

// --- Generic Form Modal ---
const formModal = document.getElementById('form-modal');
const closeFormModalBtn = document.querySelector('.close-form-modal');
const formTitle = document.getElementById('form-title');
const dynamicForm = document.getElementById('dynamic-form');
let currentFormSubmitHandler = null;

function openFormModal(title, html, submitCallback) {
    formTitle.textContent = title;
    dynamicForm.innerHTML = html;
    formModal.style.display = 'flex';

    // Remove old listener
    if (currentFormSubmitHandler) {
        dynamicForm.removeEventListener('submit', currentFormSubmitHandler);
    }

    // Add new listener
    currentFormSubmitHandler = (e) => {
        e.preventDefault();
        const formData = new FormData(dynamicForm);
        submitCallback(formData);
        formModal.style.display = 'none';
    };
    dynamicForm.addEventListener('submit', currentFormSubmitHandler);
}

closeFormModalBtn.addEventListener('click', () => {
    formModal.style.display = 'none';
});

// --- Utilities ---
function getLast12Months() {
    const months = [];
    const date = new Date();
    for (let i = 0; i < 12; i++) {
        months.push(date.toISOString().slice(0, 7)); // YYYY-MM
        date.setMonth(date.getMonth() - 1);
    }
    return months;
}

// --- CSV Export Functions ---
async function convertMaintenanceToCSV(month) {
    const flats = (await db.getFlats()).slice(0, 20);
    const records = await db.getMaintenance(month);

    // Fetch all owners
    const ownerPromises = flats.map(flat => db.getFlatOwner(flat));
    const owners = await Promise.all(ownerPromises);

    // CSV Header
    let csv = 'Sr No.,Owner Name,Amount,Status,Payment Mode,Payment Date\n';

    // CSV Rows
    flats.forEach((flat, index) => {
        const record = records[flat] || { status: 'unpaid', amount: 0, mode: '-', paymentDate: '-' };
        const ownerName = owners[index];

        const status = record.status || 'unpaid';
        const amount = record.amount || 0;
        const mode = record.mode || '-';
        const paymentDate = record.paymentDate || '-';

        csv += `${flat},${ownerName},${amount},${status},${mode},${paymentDate}\n`;
    });

    return csv;
}

async function convertExpensesToCSV(month) {
    const expenses = await db.getExpenses(month);

    // CSV Header
    let csv = 'Date,Title,Amount\n';

    // CSV Rows
    expenses.forEach(exp => {
        // Escape commas in title by wrapping in quotes
        const title = exp.title.includes(',') ? `"${exp.title}"` : exp.title;
        csv += `${exp.date},${title},${exp.amount}\n`;
    });

    return csv;
}

async function convertNoticesToCSV() {
    const notices = await db.getNotices();

    // CSV Header
    let csv = 'Date,Title,Content\n';

    // CSV Rows
    notices.forEach(notice => {
        // Escape commas and quotes in text fields
        const title = notice.title.includes(',') || notice.title.includes('"')
            ? `"${notice.title.replace(/"/g, '""')}"`
            : notice.title;
        const content = notice.content.includes(',') || notice.content.includes('"')
            ? `"${notice.content.replace(/"/g, '""')}"`
            : notice.content;
        csv += `${notice.date},${title},${content}\n`;
    });

    return csv;
}

function downloadCSV(csvContent, filename) {
    // Create blob
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

    // Create download link
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';

    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Export button event handlers
function setupExportButtons() {
    document.getElementById('export-maintenance-btn').addEventListener('click', async () => {
        const month = maintenanceMonthFilter.value;
        const csv = await convertMaintenanceToCSV(month);
        downloadCSV(csv, `maintenance_${month}.csv`);
    });

    document.getElementById('export-expenses-btn').addEventListener('click', async () => {
        const month = expenseMonthFilter.value;
        const csv = await convertExpensesToCSV(month);
        downloadCSV(csv, `expenses_${month}.csv`);
    });

    document.getElementById('export-notices-btn').addEventListener('click', async () => {
        const csv = await convertNoticesToCSV();
        const date = new Date().toISOString().split('T')[0];
        downloadCSV(csv, `notices_${date}.csv`);
    });
}

// --- Change Password Functionality ---
const changePasswordBtn = document.getElementById('change-password-btn');
const changePasswordModal = document.getElementById('change-password-modal');
const closeChangePasswordBtn = document.querySelector('.close-change-password-modal');
const currentPasswordInput = document.getElementById('current-password');
const newPasswordInput = document.getElementById('new-password');
const confirmPasswordInput = document.getElementById('confirm-password');
const changePasswordSubmit = document.getElementById('change-password-submit');

changePasswordBtn.addEventListener('click', () => {
    changePasswordModal.style.display = 'flex';
    currentPasswordInput.value = '';
    newPasswordInput.value = '';
    confirmPasswordInput.value = '';
    document.getElementById('change-password-error').textContent = '';
    currentPasswordInput.focus();
});

closeChangePasswordBtn.addEventListener('click', () => {
    changePasswordModal.style.display = 'none';
});

changePasswordSubmit.addEventListener('click', handlePasswordChange);

function handlePasswordChange() {
    const storedPassword = localStorage.getItem('khs_admin_password') || '014145';
    const currentPassword = currentPasswordInput.value;
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;
    const errorMsg = document.getElementById('change-password-error');

    // Validate current password
    if (currentPassword !== storedPassword) {
        errorMsg.textContent = 'Current password is incorrect';
        return;
    }

    // Validate new password
    if (newPassword.length < 4) {
        errorMsg.textContent = 'New password must be at least 4 characters';
        return;
    }

    if (newPassword.length > 6) {
        errorMsg.textContent = 'New password must be at most 6 characters';
        return;
    }

    // Validate password confirmation
    if (newPassword !== confirmPassword) {
        errorMsg.textContent = 'New passwords do not match';
        return;
    }

    // Save new password
    localStorage.setItem('khs_admin_password', newPassword);
    errorMsg.style.color = 'var(--success)';
    errorMsg.textContent = 'Password changed successfully!';

    // Close modal after 1.5 seconds
    setTimeout(() => {
        changePasswordModal.style.display = 'none';
        errorMsg.style.color = 'var(--danger)';
        errorMsg.textContent = '';
    }, 1500);
}

// --- Initialization ---
window.addEventListener('DOMContentLoaded', () => {
    initMaintenance();
    initExpenses();
    initNotices();
    setupExportButtons();

    // Load Home by default
    navigateTo('home');
});
