/*************************************************************************
 * بيانات نموذجية + بنية التخزين
 * تم الإبقاء على Local Storage مؤقتاً للجداول الثانوية (الصيانة، المواد)
 *************************************************************************/
const STORAGE_KEYS = {
    machines: 'hm_machines_v1',
    maintenances: 'hm_maint_v1',
    materials: 'hm_materials_v1',
    usage: 'hm_maint_materials_v1'
};

// فهرس فئات مقترحة
const CATEGORIES = ['رافعة', 'شاحنة', 'مولد', 'رافعة شوكية', 'معدات أخرى'];

// مساعدة: تحميل من localStorage أو القيمة الافتراضية
function load(key, defaultValue) {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultValue;
    try { return JSON.parse(raw); } catch (e) { return defaultValue; }
}
function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

// بيانات التشغيل: الآليات (سيتم جلبها من API)، الصيانات، المواد، استخدامات المواد (لا تزال محلياً)
let machines = []; // سيتم ملؤها بواسطة الدالة renderTable من API
let maintenances = load(STORAGE_KEYS.maintenances, []);
let materials = load(STORAGE_KEYS.materials, []);
let usage = load(STORAGE_KEYS.usage, []);
let dischargeTasks = [];
let availableDischargeDrivers = [];
let activeModalMode = null;

const machinesPanel = document.getElementById('machinesPanel');
const toggleMachinesBtn = document.getElementById('toggleMachinesBtn');
const refreshDashboardBtn = document.getElementById('refreshDashboardBtn');
const refreshDischargeBtn = document.getElementById('refreshDischargeBtn');
const searchPanelDock = document.getElementById('searchPanelDock');
const searchPanelContent = document.getElementById('searchPanelContent');
const applySearchBtn = document.getElementById('applySearchBtn');
const resetSearchBtn = document.getElementById('resetSearchBtn');
const searchInput = document.getElementById('searchInput');
const filterCategorySelect = document.getElementById('filterCategory');
const filterStatusSelect = document.getElementById('filterStatus');
const sortSelect = document.getElementById('sortSelect');
const maintenanceRequestsBody = document.getElementById('maintenanceRequestsBody');

function restoreSearchPanel() {
    if (!searchPanelDock || !searchPanelContent) return;
    if (searchPanelContent.parentElement !== searchPanelDock) {
        searchPanelDock.appendChild(searchPanelContent);
    }
}

function setMachinesPanelVisibility(visible) {
    if (!machinesPanel || !toggleMachinesBtn) return;
    machinesPanel.hidden = !visible;
    toggleMachinesBtn.textContent = visible ? 'إخفاء الآليات' : 'عرض الآليات';
    toggleMachinesBtn.setAttribute('aria-expanded', visible ? 'true' : 'false');
}

function openSearchModal() {
    if (!searchPanelContent) return;
    openModal(searchPanelContent, { type: 'search' });
    window.setTimeout(() => searchInput?.focus(), 50);
}

function resetSearchFilters() {
    if (searchInput) searchInput.value = '';
    if (filterCategorySelect) filterCategorySelect.value = '';
    if (filterStatusSelect) filterStatusSelect.value = '';
    if (sortSelect) sortSelect.value = 'machine_name:asc';
}

function getSessionIdFromQuery() {
    const params = new URLSearchParams(window.location.search);
    return (params.get('sid') || '').trim();
}

async function fetchWithSession(url, options = {}) {
    const headers = new Headers(options.headers || {});
    const sessionId = getSessionIdFromQuery();

    if (sessionId) {
        headers.set('X-Session-Id', sessionId);
    }

    return fetch(url, {
        ...options,
        credentials: 'include',
        headers
    });
}

// توليد معرف جديد (ملاحظة: هذا لم يعد ضرورياً للآليات، لكن أُبقي للجداول المحلية)
function nextId(arr) { return arr.length ? Math.max(...arr.map(x => x.id || x.machine_id || 0)) + 1 : 1; }

/*************************************************************************
 * دوال مساعدة للتواريخ والألوان
 *************************************************************************/
function formatDate(d) {
    if (!d) return '-';
    const dt = new Date(d);
    // نستخدم 'ar-EG' للعرض العربي، ونضمن أن تكون القيمة صالحة
    return dt instanceof Date && !isNaN(dt) ? dt.toLocaleDateString('ar-EG') : '-';
}
function daysUntil(date) {
    if (!date) return Infinity;
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const target = new Date(date); target.setHours(0, 0, 0, 0);
    const diff = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
    return diff;
}
function maintenanceSeverity(nextDate) {
    if (!nextDate) return 'ok';
    const d = daysUntil(nextDate);
    if (d < 0) return 'danger'; // متأخرة
    if (d <= 7) return 'warn';
    return 'ok';
}

/*************************************************************************
 * واجهة التنبيهات الذكية (تعتمد الآن على المصفوفة العالمية machines المحدثة)
 *************************************************************************/
const alertsContainer = document.getElementById('alertsContainer');
function renderAlerts() {
    if (!alertsContainer) return;
    alertsContainer.innerHTML = '';
    // نستخدم مصفوفة machines العالمية
    const urgent = machines
        .map(m => ({ ...m, days: daysUntil(m.next_maintenance_date) }))
        .filter(m => m.next_maintenance_date && m.days <= 7)
        .sort((a, b) => a.days - b.days);

    urgent.forEach(m => {
        const sev = maintenanceSeverity(m.next_maintenance_date);
        const div = document.createElement('div');
        div.className = 'alert ' + (sev === 'ok' ? 'ok' : sev === 'warn' ? 'warn' : 'danger');
        const daysText = m.days < 0 ? `متأخرة منذ ${Math.abs(m.days)} يوم` : `${m.days} يوم`;
        div.innerHTML = `<div>🔧 تنبيه: الآلية <strong>${m.machine_name}</strong> (${m.machine_code}) تحتاج صيانة خلال <strong>${daysText}</strong>.</div>
                         <div><button class="btn" onclick="openMachineProfile(${m.machine_id})">عرض</button></div>`;
        alertsContainer.appendChild(div);
    });

    if (urgent.length === 0) {
        const div = document.createElement('div');
        div.className = 'alert ok';
        div.textContent = 'لا توجد تنبيهات صيانة عاجلة — كل الآليات ضمن فترة آمنة (أكثر من 7 أيام أو غير محددة).';
        alertsContainer.appendChild(div);
    }
}

/*************************************************************************
 * مهام تفريغ البواخر لمدير الآليات
 *************************************************************************/
const dischargeTasksBody = document.getElementById('dischargeTasksBody');

async function renderDischargeTasks() {
    if (!dischargeTasksBody) return;

    try {
        dischargeTasksBody.innerHTML = '<tr><td colspan="9" style="text-align:center;">جارٍ تحميل مهام التفريغ...</td></tr>';
        const response = await fetchWithSession('/api/mechanic/discharge-tasks', {
            method: 'GET',
            cache: 'no-store'
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'تعذر تحميل مهام التفريغ.');
        }

        dischargeTasks = Array.isArray(data.tasks) ? data.tasks : [];
        availableDischargeDrivers = Array.isArray(data.availableDrivers) ? data.availableDrivers : [];
        document.getElementById('countDischargeTasks').textContent = dischargeTasks.length;

        if (!dischargeTasks.length) {
            dischargeTasksBody.innerHTML = '<tr><td colspan="9" style="text-align:center;">لا توجد مهام تفريغ بانتظار مدير الآليات حالياً.</td></tr>';
            return;
        }

        dischargeTasksBody.innerHTML = dischargeTasks.map(renderDischargeTaskRow).join('');
        /*
            <tr>
                <td>${escapeHTML(task.vesselName || '-')}<div class="small-muted">${escapeHTML(task.voyageReference || '-')}</div></td>
                <td>${escapeHTML(task.containerNumber || '-')}</td>
                <td>${escapeHTML(translateDischargeDestination(task.destinationType))}</td>
                <td>${escapeHTML(task.proposedBerth || '-')}</td>
                <td>${escapeHTML(task.machineName || '-')}</td>
                <td>${getDischargeDriverStatusMarkup(task)}</td>
                <td>
                    ${task.planStatus === 'draft' && task.status === 'planned'
                        ? `<select id="assign-driver-${task.id}">
                            <option value="">اختر السائق</option>
                            ${buildDriverOptions(task.driverUserId)}
                        </select>`
                        : '<span class="small-muted">تم الإرسال</span>'}
                </td>
                <td>${escapeHTML(getMechanicTaskStatus(task))}</td>
                <td>
                    ${task.planStatus === 'draft' && task.status === 'planned'
                        ? `<button class="btn" data-assign-task-id="${task.id}">إرسال المهمة</button>`
                        : '<span class="small-muted">-</span>'}
                </td>
            </tr>
        `).join('');
        */
    } catch (error) {
        console.error('Error loading discharge tasks:', error);
        dischargeTasksBody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#b91c1c;">${escapeHTML(error.message || 'فشل تحميل مهام التفريغ.')}</td></tr>`;
        document.getElementById('countDischargeTasks').textContent = 0;
    }
}

function renderDischargeTaskRow(task) {
    return `
        <tr>
            <td>${escapeHTML(task.vesselName || '-')}<div class="small-muted">${escapeHTML(task.voyageReference || '-')}</div></td>
            <td>${escapeHTML(task.containerNumber || '-')}</td>
            <td>${escapeHTML(translateDischargeDestination(task.destinationType))}</td>
            <td>${escapeHTML(task.proposedBerth || '-')}</td>
            <td>${escapeHTML(task.machineName || '-')}</td>
            <td>${getDischargeDriverStatusMarkup(task)}</td>
            <td>
                ${task.status === 'planned' && task.driverResponseStatus !== 'accepted'
                    ? `<select id="assign-driver-${task.id}">
                        <option value="">اختر السائق</option>
                        ${buildDriverOptions(task.driverUserId)}
                    </select>`
                    : '<span class="small-muted">-</span>'}
            </td>
            <td>${escapeHTML(getDetailedMechanicTaskStatus(task))}</td>
            <td>
                ${task.status === 'planned' && task.driverResponseStatus !== 'accepted'
                    ? `<button class="btn" data-assign-task-id="${task.id}">${['busy', 'failed'].includes(task.driverResponseStatus) ? 'تعيين سائق آخر' : 'إرسال المهمة'}</button>`
                    : '<span class="small-muted">-</span>'}
            </td>
        </tr>
    `;
}

function getDetailedMechanicTaskStatus(task) {
    if (task.status === 'completed') {
        return 'تم إنجاز المهمة';
    }

    if (task.status === 'in_progress') {
        return 'جارٍ التنفيذ';
    }

    if (task.driverResponseStatus === 'completed') {
        return 'بانتظار تأكيد مدير الرصيف';
    }

    if (task.driverResponseStatus === 'failed') {
        return task.driverResponseNote
            ? `تعذر الإنجاز: ${task.driverResponseNote}`
            : 'تعذر الإنجاز ويحتاج إعادة إسناد';
    }

    if (task.driverResponseStatus === 'busy') {
        return 'يلزم تعيين سائق آخر';
    }

    if (task.driverResponseStatus === 'accepted') {
        return 'السائق وافق';
    }

    if (task.driverUserId) {
        return 'بانتظار رد السائق';
    }

    return 'بانتظار تعيين سائق';
}

function buildDriverOptions(selectedDriverId) {
    const assignedDriver = dischargeTasks
        .filter((task) => Number(task.driverUserId) === Number(selectedDriverId))
        .map((task) => ({ id: task.driverUserId, name: task.driverName }))
        .find(Boolean);

    const driverPool = [...availableDischargeDrivers];
    if (assignedDriver && !driverPool.find((driver) => Number(driver.id) === Number(assignedDriver.id))) {
        driverPool.unshift(assignedDriver);
    }

    return driverPool.map((driver) => `
        <option value="${driver.id}" ${Number(driver.id) === Number(selectedDriverId) ? 'selected' : ''}>
            ${escapeHTML(driver.name || driver.email || 'سائق')}
        </option>
    `).join('');
}

function translateDischargeDestination(destinationType) {
    return {
        yard: 'ساحة',
        truck: 'شاحنة',
        warehouse: 'مستودع',
        truck_berth: 'رصيف الشاحنات',
        train_berth: 'رصيف القطار',
        berth_a: 'رصيف A',
        berth_b: 'رصيف B',
        berth_c: 'رصيف C'
    }[destinationType] || destinationType || '-';
}

function getDischargeDriverStatusMarkup(task) {
    if (!task.driverUserId) {
        return 'غير محدد';
    }

    const driverName = escapeHTML(task.driverName || 'سائق');
    if (task.driverResponseStatus === 'failed') {
        const noteMarkup = task.driverResponseNote
            ? `<div class="small-muted" style="color:#fca5a5;">${escapeHTML(task.driverResponseNote)}</div>`
            : '';
        return `${driverName}<div class="small-muted" style="color:#fca5a5;">تعذر إنجاز المهمة</div>${noteMarkup}`;
    }

    if (task.driverResponseStatus === 'busy') {
        const noteMarkup = task.driverResponseNote
            ? `<div class="small-muted" style="color:#fca5a5;">${escapeHTML(task.driverResponseNote)}</div>`
            : '';
        return `${driverName}<div class="small-muted" style="color:#fca5a5;">السائق مشغول الآن</div>${noteMarkup}`;
    }

    if (task.driverResponseStatus === 'accepted') {
        return `${driverName}<div class="small-muted" style="color:#86efac;">السائق وافق</div>`;
    }

    return `${driverName}<div class="small-muted">بانتظار رد السائق</div>`;
}

function getMechanicTaskStatus(task) {
    if (task.planStatus === 'active') {
        return 'جارٍ التنفيذ';
    }

    if (task.driverUserId) {
        return 'تم الإرسال للسائق';
    }

    return 'بانتظار تعيين سائق';
}

async function assignDriverToDischargeTask(taskId) {
    const select = document.getElementById(`assign-driver-${taskId}`);
    const driverUserId = Number(select?.value);

    if (!driverUserId) {
        alert('يرجى اختيار السائق قبل إرسال المهمة.');
        return;
    }

    try {
        const response = await fetchWithSession(`/api/mechanic/discharge-tasks/${taskId}/assign-driver`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ driverUserId })
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'تعذر إرسال المهمة إلى السائق.');
        }

        alert(data.message);
        await renderDischargeTasks();
    } catch (error) {
        console.error('Error assigning discharge task:', error);
        alert(error.message || 'تعذر إرسال المهمة إلى السائق.');
    }
}

function notifyMaintenanceRequestUpdate(reason) {
    try {
        localStorage.setItem('maintenance-request-refresh', JSON.stringify({
            reason,
            timestamp: Date.now()
        }));
    } catch (error) {
        console.warn('Failed to notify maintenance request update:', error);
    }
}

async function renderMaintenanceRequests() {
    if (!maintenanceRequestsBody) return;

    try {
        maintenanceRequestsBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">جارٍ تحميل إشعارات الصيانة...</td></tr>';
        const response = await fetchWithSession('/api/mechanic/maintenance-requests', {
            method: 'GET',
            cache: 'no-store'
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'تعذر تحميل إشعارات الصيانة.');
        }

        const requests = Array.isArray(data.requests) ? data.requests : [];
        if (!requests.length) {
            maintenanceRequestsBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">لا توجد طلبات صيانة جديدة بانتظار مدير الآليات.</td></tr>';
            return;
        }

        maintenanceRequestsBody.innerHTML = requests.map((request) => `
            <tr>
                <td>${escapeHTML(request.id)}</td>
                <td>${escapeHTML(request.requested_by || request.requested_by_email || '-')}</td>
                <td>${escapeHTML(request.itemName || '-')}<div class="small-muted">${escapeHTML(request.itemCode || '-')}</div></td>
                <td>${escapeHTML(request.qty)}</td>
                <td>${escapeHTML(request.justification || '-')}</td>
                <td>${escapeHTML(formatDate(request.requested_for_date || request.date))}</td>
                <td>
                    <div class="task-actions">
                        <button type="button" class="btn" data-maintenance-approve="${request.id}">موافق</button>
                        <button type="button" class="btn secondary" data-maintenance-reject="${request.id}">رفض</button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading mechanic maintenance requests:', error);
        maintenanceRequestsBody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#fca5a5;">${escapeHTML(error.message || 'تعذر تحميل إشعارات الصيانة.')}</td></tr>`;
    }
}

async function handleMaintenanceRequestDecision(requestId, decision) {
    try {
        const response = await fetchWithSession(`/api/mechanic/maintenance-requests/${requestId}/${decision}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'تعذر تحديث طلب الصيانة.');
        }

        notifyMaintenanceRequestUpdate(decision);
        await renderMaintenanceRequests();
        alert(data.message);
    } catch (error) {
        alert(error.message || 'تعذر تحديث طلب الصيانة.');
    }
}

/*************************************************************************
 * بطاقات الفئات (تعتمد الآن على المصفوفة العالمية machines المحدثة)
 *************************************************************************/
const cardsContainer = document.getElementById('cardsContainer');
function renderCards() {
    if (!cardsContainer) return;
    cardsContainer.innerHTML = '';
    // عداد حسب فئة
    const byCat = {};
    machines.forEach(m => { byCat[m.category] = (byCat[m.category] || 0) + 1 });
    CATEGORIES.forEach(cat => {
        const count = byCat[cat] || 0;
        const card = document.createElement('div'); card.className = 'card';
        card.innerHTML = `<div class="icon">${cat.slice(0, 2)}</div>
          <div class="meta">
            <div class="small">${cat}</div>
            <div class="big">${count} آلة</div>
          </div>
          <div style="text-align:left">
            <button class="btn ghost" onclick="filterByCategory('${cat}')">عرض</button>
          </div>`;
        cardsContainer.appendChild(card);
    });
    // فئة أخرى
    const otherCount = machines.filter(m => !CATEGORIES.includes(m.category)).length;
    const cardOther = document.createElement('div'); cardOther.className = 'card';
    cardOther.innerHTML = `<div class="icon">أخ</div>
      <div class="meta"><div class="small">أخرى</div><div class="big">${otherCount} آلة</div></div>
      <div style="text-align:left"><button class="btn ghost" onclick="filterByCategory('')">عرض الكل</button></div>`;
    cardsContainer.appendChild(cardOther);
    populateFilterCategories();
}

function filterByCategory(cat) {
    filterCategorySelect.value = cat;
    setMachinesPanelVisibility(true);
    renderTable();
    machinesPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/*************************************************************************
 * جدول الآليات — **API CALL**
 *************************************************************************/
const tbody = document.querySelector('#machinesTable tbody');

function populateFilterCategories() {
    const sel = filterCategorySelect;
    if (!sel) return;
    const currentValue = sel.value; // حفظ القيمة الحالية
    sel.innerHTML = '<option value="">كل الفئات</option>';
    // نستخدم مصفوفة machines المحدثة لملء القائمة
    const unique = Array.from(new Set(machines.map(m => m.category))).filter(Boolean);
    unique.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        if (c === currentValue) opt.selected = true; // استعادة القيمة
        sel.appendChild(opt);
    });
}

// **الدالة الرئيسية الجديدة: الاتصال بالـ API**
async function renderTable() {
    const search = searchInput?.value.trim() || '';
    const cat = filterCategorySelect?.value || '';
    const status = filterStatusSelect?.value || '';
    const sort = sortSelect?.value || 'machine_name:asc';

    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (cat) params.append('category', cat);
    if (status) params.append('status', status);
    if (sort) params.append('sort', sort);

    try {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">جارٍ تحميل البيانات...</td></tr>';
        
        const response = await fetchWithSession(`/api/machines?${params.toString()}`);
        
        if (!response.ok) {
            throw new Error(`HTTP Error! Status: ${response.status}`);
        }

        // list تحتوي الآن على البيانات المفلترة والمصنفة من الخادم
        const list = await response.json();
        
        // تحديث مصفوفة machines العالمية (مهمة لـ renderAlerts/renderStats/openEditMachine)
        machines = list; 

        // 4. عرض القائمة المصفاة والـ Count
        tbody.innerHTML = '';
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">لا توجد آليات مطابقة للبحث الحالي.</td></tr>';
        }
        list.forEach(m => {
            const tr = document.createElement('tr');
            const sev = maintenanceSeverity(m.next_maintenance_date);
            
            tr.innerHTML = `
                <td>${escapeHTML(m.machine_code || '-')}</td>
                <td>${escapeHTML(m.machine_name || '-')}</td>
                <td>${escapeHTML(m.category || '-')}</td>
                <td>${escapeHTML(m.location_id || m.facility_name || m.supplier_name || '-')}</td>
                <td>${escapeHTML(m.status || '-')}</td>
                <td>${formatDate(m.last_maintenance_date)}</td>
                <td style="color:${sev === 'danger' ? '#b91c1c' : sev === 'warn' ? '#92400e' : '#047857'}">${formatDate(m.next_maintenance_date)}</td>
                <td>${Number(m.operating_hours || 0).toFixed(2)}</td>
                <td class="actions">
                    <button class="btn" onclick="openMachineProfile(${m.machine_id})">تفاصيل</button>
                    <button class="btn secondary" onclick="deleteMachine(${m.machine_id})">حذف</button>
                </td>`;
            tbody.appendChild(tr);
        });

        const countMachinesEl = document.getElementById('countMachines');
        if (countMachinesEl) countMachinesEl.textContent = list.length;
        
        // تحديث باقي المكونات التي تعتمد على بيانات الآليات
        populateFilterCategories();
        renderCards();
        renderStats();
        renderAlerts();

    } catch (error) {
        console.error('Error fetching and rendering machines:', error);
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#b91c1c;">فشل في جلب البيانات من الخادم. تأكد من تشغيل الباك إند!</td></tr>';
        const countMachinesEl = document.getElementById('countMachines');
        if (countMachinesEl) countMachinesEl.textContent = 0;
    }
}

/*************************************************************************
 * أدوات: تهريب محتوى HTML آمن
 *************************************************************************/
function escapeHTML(s) { if (s == null) return ''; return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

/*************************************************************************
 * CRUD للآليات (تم تعديلها لاستخدام API)
 *************************************************************************/
// تم إلغاء معالج حدث النقر لزر 'إضافة آلية جديدة'
// document.getElementById('addMachineBtn').addEventListener('click', () => openAddMachine()); 

// 1. دالة مساعدة لجلب الموردين من API
async function fetchSuppliers() {
    try {
        // نستخدم راوت /api/suppliers لجلب جميع الموردين
        const response = await fetchWithSession('/api/suppliers');
        if (!response.ok) throw new Error('فشل جلب قائمة الموردين');
        const data = await response.json();
        // الراوت يرجع { success: true, suppliers: [...] } والمورد يحتوي على 'id' (supplier_id) و 'name'
        return data.suppliers || [];
    } catch (error) {
        console.error('Error fetching suppliers:', error);
        alert('فشل في جلب قائمة الموردين من الخادم.');
        return [];
    }
}

// تم إلغاء دالة openAddMachine()

function openEditMachine(id) {
    const m = machines.find(x => x.machine_id === id);
    if (!m) return alert('لم يتم العثور على الآلية');
    openModal(renderMachineForm(m));
}

// 2. دالة الحذف (تستخدم API الآن)
async function deleteMachine(id) {
    if (!confirm('هل أنت متأكد من حذف الآلية؟ سيؤدي هذا إلى حذف جميع سجلات الصيانة المرتبطة بها (بسبب ON DELETE CASCADE).')) return;
    
    try {
        const response = await fetchWithSession(`/api/machines/${id}`, { method: 'DELETE' });
        const result = await response.json();

        if (!response.ok) {
            // يمكن أن يكون الخطأ بسبب Foreign Key (في حال لم تستخدم CASCADE)
            throw new Error(result.message || 'فشل الحذف من الخادم.');
        }

        alert(result.message || 'تم حذف الآلية بنجاح.');
        renderTable(); 
        
    } catch (error) {
        console.error('Error deleting machine:', error);
        alert(`فشل الحذف: ${error.message}`);
    }
}

// 3. دالة إنشاء وعرض النموذج (معدّلة: أصبحت async لجلب الموردين)
function renderMachineForm(machine = null) {
    const isEdit = !!machine;
    
    // **NOTE**: إذا لم تكن هناك آلية (أي محاولة إضافة)، سنمنع فتح النموذج
    if (!isEdit) {
        alert('وظيفة إضافة آلية جديدة معطلة حالياً.');
        return document.createElement('div'); // إرجاع عنصر فارغ لمنع فتح الـ Modal
    }

    const modalContent = document.createElement('div');
    modalContent.innerHTML = `
      <h2>${isEdit ? 'تعديل بيانات الآلية' : 'إضافة آلية جديدة'}</h2>
      <div id="machineFormBody">
        <div style="text-align:center;padding:20px;">جارٍ تحميل الموردين...</div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
        <button id="saveMachine" class="btn" disabled>${isEdit ? 'حفظ التعديلات' : 'إضافة الآلية'}</button>
        <button id="cancelModal" class="btn ghost">إلغاء</button>
      </div>`;
      
    // إضافة زر الإلغاء والانتظار حتى يتم تحميل الموردين
    setTimeout(() => modalContent.querySelector('#cancelModal').onclick = closeModal, 0);

    // دالة داخلية لبناء النموذج بعد تحميل الموردين
    async function buildForm() {
        const suppliers = await fetchSuppliers();
        
        // بناء قائمة اختيار الموردين (supplier_id)
        const supplierOptions = suppliers.map(s => `
            <option value="${s.id}" ${machine?.supplier_id === s.id ? 'selected' : ''}>
                ${escapeHTML(s.name)}
            </option>
        `).join('');

        const formBody = modalContent.querySelector('#machineFormBody');
        formBody.innerHTML = `
            <div class="form-row"><label>رمز الآلية</label><input id="f_code" value="${escapeHTML(machine?.machine_code || '')}" placeholder="${isEdit ? 'رمز الآلية' : 'كود أو بادئة مثل MCH - اتركه فارغًا للتوليد التلقائي'}" /></div>
            <div class="form-row"><label>اسم الآلية</label><input id="f_name" value="${escapeHTML(machine?.machine_name || '')}" required /></div>
            <div class="form-row"><label>الفئة</label>
                <select id="f_cat">${CATEGORIES.map(c => `<option ${machine?.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
            </div>
            <div class="form-row"><label>الموقع (معرف)</label><input id="f_loc" value="${escapeHTML(machine?.location_id || 'المرفق-1')}" /></div>
            <div class="form-row"><label>الحالة التشغيلية</label>
                <select id="f_status">
                    <option ${machine?.status === 'جاهزة' ? 'selected' : ''}>جاهزة</option>
                    <option ${machine?.status === 'تحت الصيانة' ? 'selected' : ''}>تحت الصيانة</option>
                    <option ${machine?.status === 'متوقفة' ? 'selected' : ''}>متوقفة</option>
                    <option ${machine?.status === 'في الخدمة' ? 'selected' : ''}>في الخدمة</option>
                </select>
            </div>
            <div class="form-row"><label>تاريخ الشراء</label><input id="f_purchase" type="date" value="${machine?.purchase_date ? new Date(machine.purchase_date).toISOString().slice(0, 10) : ''}" /></div>
            <div class="form-row"><label>آخر صيانة</label><input id="f_last" type="date" value="${machine?.last_maintenance_date ? new Date(machine.last_maintenance_date).toISOString().slice(0, 10) : ''}" /></div>
            <div class="form-row"><label>الصيانة القادمة</label><input id="f_next" type="date" value="${machine?.next_maintenance_date ? new Date(machine.next_maintenance_date).toISOString().slice(0, 10) : ''}" /></div>
            <div class="form-row"><label>ساعات التشغيل</label><input id="f_hours" type="number" step="0.1" value="${machine?.operating_hours || 0}" /></div>
            
            <div class="form-row"><label>المورد</label>
                <select id="f_supplier_id">
                    <option value="" ${!machine?.supplier_id ? 'selected' : ''}>-- اختر مورد --</option>
                    ${supplierOptions}
                </select>
            </div>

            <div class="form-row"><label>المرفق</label><input id="f_facility" value="${escapeHTML(machine?.facility_name || '')}" /></div>
            <div class="form-row"><label>ملاحظات</label><textarea id="f_notes" rows="3">${escapeHTML(machine?.notes || '')}</textarea></div>
        `;
        
        // تفعيل زر الحفظ وإضافة معالج الحدث
        const saveBtn = modalContent.querySelector('#saveMachine');
        saveBtn.disabled = false;
        saveBtn.onclick = saveMachine;
    }

    // دالة حفظ البيانات (تستخدم API الآن)
    async function saveMachine() {
        const tempId = machine ? machine.machine_id : null; 

        const machineData = {
            machine_code: modalContent.querySelector('#f_code').value.trim(),
            machine_name: modalContent.querySelector('#f_name').value.trim(),
            category: modalContent.querySelector('#f_cat').value,
            location_id: modalContent.querySelector('#f_loc').value.trim(),
            status: modalContent.querySelector('#f_status').value,
            purchase_date: modalContent.querySelector('#f_purchase').value || null,
            last_maintenance_date: modalContent.querySelector('#f_last').value || null,
            next_maintenance_date: modalContent.querySelector('#f_next').value || null,
            operating_hours: parseFloat(modalContent.querySelector('#f_hours').value || 0),
            // نرسل supplier_id
            supplier_id: modalContent.querySelector('#f_supplier_id').value || null, 
            facility_name: modalContent.querySelector('#f_facility').value.trim(),
            notes: modalContent.querySelector('#f_notes').value.trim()
        };

        if (!machineData.machine_name || !machineData.status || (isEdit && !machineData.machine_code)) {
            return alert(isEdit ? 'الرجاء تعبئة الحقول الأساسية (الرمز، الاسم، والحالة).' : 'الرجاء تعبئة اسم الآلية والحالة، ويمكن ترك الكود فارغًا أو كتابة بادئة فقط.');
        }

        // تم تعيين method و url بشكل دائم لـ PUT لأننا ألغينا الإضافة
        const url = `/api/machines/${tempId}`;
        const method = 'PUT';

        try {
            const response = await fetchWithSession(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(machineData)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || `HTTP Error! Status: ${response.status}`);
            }

            alert(result.message || 'تم حفظ البيانات بنجاح.');
            closeModal();
            renderTable(); // إعادة جلب البيانات لتحديث الجدول
            
        } catch (error) {
            console.error('Error saving machine:', error);
            alert(`فشل الحفظ: ${error.message}`);
        }
    }
    
    // بدء بناء النموذج
    buildForm();

    return modalContent;
}

// ... (بقية الدوال الخاصة بالآليات لم تتغير)

/*************************************************************************
 * نافذة تفاصيل الآلة
 *************************************************************************/
function openMachineProfile(id) {
    const m = machines.find(x => x.machine_id === id);
    if (!m) return alert('لم يتم العثور على الآلية');
    openModal(renderMachineProfile(m));
}

function renderMachineProfile(machine) {
    const div = document.createElement('div');
    div.innerHTML = `
      <h2>ملف الآلة — ${escapeHTML(machine.machine_name)} (${escapeHTML(machine.machine_code)})</h2>
      <div class="small-muted">الفئة: ${escapeHTML(machine.category)} • الموقع: ${escapeHTML(machine.location_id)} • المورد: ${escapeHTML(machine.supplier_name || '-')}</div>
      <div style="display:flex;gap:12px;margin-top:12px">
        <div style="flex:1">
          <div class="form-row"><label>الحالة التشغيلية</label><div>${escapeHTML(machine.status)}</div></div>
          <div class="form-row"><label>آخر صيانة</label><div>${formatDate(machine.last_maintenance_date)}</div></div>
          <div class="form-row"><label>الصيانة القادمة</label><div>${formatDate(machine.next_maintenance_date)}</div></div>
          <div class="form-row"><label>ساعات التشغيل</label><div>${Number(machine.operating_hours || 0).toFixed(2)}</div></div>
        </div>
      </div>
      <hr>
      <h3>سجل الصيانة</h3>
      <div id="maintenanceList"></div>
      <hr>
      <h3>استهلاك المواد (مرتبط بهذه الآلة)</h3>
      <div id="usageList"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
        <button id="closeProfile" class="btn ghost">إغلاق</button>
      </div>
    `;

    setTimeout(() => {
        div.querySelector('#closeProfile').onclick = closeModal;

        // render maintenance history
        const list = maintenances.filter(x => x.machine_id === machine.machine_id).sort((a, b) => new Date(b.date) - new Date(a.date));
        const container = div.querySelector('#maintenanceList');
        if (list.length === 0) container.innerHTML = '<div class="small-muted">لا يوجد سجلات صيانة بعد.</div>';
        else {
            container.innerHTML = list.map(r => `
          <div style="padding:8px;border-radius:8px;background:#fbfbfc;margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div><strong>${escapeHTML(r.type)}</strong> — ${formatDate(r.date)}</div>
              <div class="small-muted">فني: ${escapeHTML(r.technician || '-')}</div>
            </div>
            <div class="small-muted" style="margin-top:6px">${escapeHTML(r.notes || '')}</div>
          </div>
        `).join('');
        }

        // render usage of materials
        const ulist = usage.filter(u => u.machine_id === machine.machine_id).sort((a, b) => new Date(b.used_at) - new Date(a.used_at));
        const ucont = div.querySelector('#usageList');
        if (ulist.length === 0) ucont.innerHTML = '<div class="small-muted">لا توجد عمليات خصم مواد مرتبطة بهذه الآلة.</div>';
        else {
            ucont.innerHTML = ulist.map(u => {
                const mat = materials.find(m => m.item_id === u.item_id) || { item_name: 'مادة مجهولة' };
                return `<div style="padding:8px;border-radius:8px;background:#fff;margin-bottom:8px"><div><strong>${escapeHTML(mat.item_name)}</strong> — ${Number(u.quantity_used).toFixed(2)} وحدة</div><div class="small-muted">${formatDate(u.used_at)} بواسطة ${escapeHTML(u.recorded_by || '-')}</div></div>`;
            }).join('');
        }

    }, 0);

    return div;
}
/*************************************************************************
 * إحصاءات بسيطة (نسبة الجاهزية، قائمة حسب الحالة، أعلى المواد في المخزون)
 *************************************************************************/
function renderStats() {
    const total = machines.length;
    const ready = machines.filter(m => m.status === 'جاهزة').length;
    const readyPct = total ? Math.round((ready / total) * 100) : 0;

    // رسم دائري/شريطي بسيط على canvas
    const canvas = document.getElementById('availabilityChart');
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.clientWidth;
    const h = 180; // تم تعديل h لـ 180 لتبسيط الكود وتجنب canvas.clientHeight
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    // bar representation
    ctx.fillStyle = '#e6f7f6';
    ctx.fillRect(20, 20, w - 40, h - 60);
    ctx.fillStyle = '#10b981';
    ctx.fillRect(20, 20, (w - 40) * (readyPct / 100), h - 60);
    ctx.fillStyle = '#0f172a';
    ctx.font = '600 16px sans-serif';
    ctx.fillText(`${readyPct}% جاهزة`, 26, 45);

    // by status
    const byStatus = {};
    machines.forEach(m => byStatus[m.status] = (byStatus[m.status] || 0) + 1);
    const bstatus = document.getElementById('byStatusList');
    bstatus.innerHTML = Object.entries(byStatus).map(([k, v]) => `<div class="pill">${escapeHTML(k)}: ${v}</div>`).join(' ') || '<div class="small-muted">لا توجد بيانات</div>';

    // top materials
    const top = materials.slice().sort((a, b) => b.quantity - a.quantity).slice(0, 5);
    const topEl = document.getElementById('topMaterials');
    topEl.innerHTML = top.map(t => `<div>${escapeHTML(t.item_name)} — <strong>${Number(t.quantity).toFixed(2)}</strong></div>`).join('') || '<div class="small-muted">لا توجد مواد</div>';
}

/*************************************************************************
 * مودال عام
 *************************************************************************/
const modalBg = document.getElementById('modalBg');
const modalContent = document.getElementById('modalContent');
document.getElementById('closeModal').onclick = closeModal;
function openModal(nodeContent, options = {}) {
    if (!nodeContent || (typeof nodeContent !== 'string' && nodeContent.innerHTML === '')) return; // لمنع فتح المودال الفارغ عند محاولة الإضافة
    if (activeModalMode === 'search') {
        restoreSearchPanel();
    }
    modalContent.innerHTML = '';
    if (typeof nodeContent === 'string') modalContent.innerHTML = nodeContent;
    else modalContent.appendChild(nodeContent);
    activeModalMode = options.type || 'default';
    modalBg.style.display = 'flex';
    document.body.classList.add('modal-open');
    window.scrollTo(0, 0);
}
function closeModal() {
    if (activeModalMode === 'search') {
        restoreSearchPanel();
    }
    modalBg.style.display = 'none';
    modalContent.innerHTML = '';
    activeModalMode = null;
    document.body.classList.remove('modal-open');
}



/*************************************************************************
 * تهيئة عناصر التحكم
 *************************************************************************/
searchInput?.addEventListener('input', debounce(renderTable, 250));
filterCategorySelect?.addEventListener('change', renderTable);
filterStatusSelect?.addEventListener('change', renderTable);
sortSelect?.addEventListener('change', renderTable);
toggleMachinesBtn?.addEventListener('click', () => {
    const isVisible = !machinesPanel?.hidden;
    setMachinesPanelVisibility(!isVisible);
    if (machinesPanel && !machinesPanel.hidden) {
        machinesPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
});
refreshDashboardBtn?.addEventListener('click', async () => {
    await Promise.all([renderTable(), renderDischargeTasks(), renderMaintenanceRequests()]);
});
refreshDischargeBtn?.addEventListener('click', renderDischargeTasks);
document.getElementById('open-driver-page-btn')?.addEventListener('click', () => {
    window.location.href = '/driver';
});
document.querySelectorAll('[data-open-search="true"]').forEach((button) => {
    button.addEventListener('click', openSearchModal);
});
applySearchBtn?.addEventListener('click', async () => {
    setMachinesPanelVisibility(true);
    await renderTable();
    closeModal();
    machinesPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
resetSearchBtn?.addEventListener('click', async () => {
    resetSearchFilters();
    setMachinesPanelVisibility(true);
    await renderTable();
});
dischargeTasksBody?.addEventListener('click', (event) => {
    const assignButton = event.target.closest('[data-assign-task-id]');
    if (!assignButton) return;
    assignDriverToDischargeTask(Number(assignButton.dataset.assignTaskId));
});
maintenanceRequestsBody?.addEventListener('click', (event) => {
    const approveButton = event.target.closest('[data-maintenance-approve]');
    if (approveButton) {
        handleMaintenanceRequestDecision(Number(approveButton.dataset.maintenanceApprove), 'approve');
        return;
    }

    const rejectButton = event.target.closest('[data-maintenance-reject]');
    if (rejectButton) {
        handleMaintenanceRequestDecision(Number(rejectButton.dataset.maintenanceReject), 'reject');
    }
});
window.addEventListener('storage', (event) => {
    if (!event.newValue) return;
    if (event.key === 'mechanic-refresh') {
        renderDischargeTasks();
        return;
    }
    if (event.key === 'maintenance-request-refresh') {
        renderMaintenanceRequests();
    }
});
modalBg?.addEventListener('click', (event) => {
    if (event.target === modalBg) {
        closeModal();
    }
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modalBg?.style.display === 'flex') {
        closeModal();
    }
});

// debounce
function debounce(fn, wait) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

/*************************************************************************
 * مساعدة: تحميل المبدئي
 *************************************************************************/
// ربط التصدير/استيراد (اختياري — لامتحان)
window.openMachineProfile = openMachineProfile;
window.deleteMachine = deleteMachine;

// بدء العرض
setMachinesPanelVisibility(false);
renderTable();
renderDischargeTasks();
renderMaintenanceRequests();
// renderCards(); // سيتم استدعاؤها داخل renderTable
// renderStats(); // سيتم استدعاؤها داخل renderTable
// renderAlerts(); // سيتم استدعاؤها داخل renderTable
