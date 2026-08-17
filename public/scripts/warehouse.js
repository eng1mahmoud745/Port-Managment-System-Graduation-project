// نقطة اتصال الـ API الرئيسية
const API_BASE_URL = '/api'; 

/* -------------------------
    UI helpers
------------------------- */
const el = id => document.getElementById(id);
const views = document.querySelectorAll('.view');
const navLinks = document.querySelectorAll('.nav-link');
const breadcrumb = el('breadcrumb');

function compareCodes(codeA, codeB) {
    const normalize = (value) => String(value || '').trim().toUpperCase();
    const left = normalize(codeA);
    const right = normalize(codeB);
    const leftMatch = left.match(/^([A-Z]+)-(\d+)$/);
    const rightMatch = right.match(/^([A-Z]+)-(\d+)$/);

    if (leftMatch && rightMatch) {
        const prefixCompare = leftMatch[1].localeCompare(rightMatch[1]);
        if (prefixCompare !== 0) return prefixCompare;
        return Number(leftMatch[2]) - Number(rightMatch[2]);
    }

    return left.localeCompare(right, undefined, { numeric: true });
}

// دالة جلب البيانات العامة (FETCH HELPER)
async function fetchData(endpoint, method = 'GET', data = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
    };
    if (data) {
        options.body = JSON.stringify(data);
    }
    
    try {
        const response = await fetch(API_BASE_URL + endpoint, options);
        const result = await response.json();

        if (!response.ok) {
            // التعامل مع أخطاء الخادم (4xx, 5xx)
            alert('❌ فشل العملية: ' + (result.message || 'حدث خطأ غير معروف'));
            throw new Error(result.message || 'API Error');
        }
        return result;
    } catch (error) {
        console.error('Fetch Error:', error);
        alert('❌ خطأ في الاتصال بالخادم: ' + error.message);
        throw error;
    }
}

function validateLocationPayload(data, { requireCode = false, requireRack = false } = {}) {
    const requiredFields = [
        ['warehouseId', 'المستودع التابع'],
        ['aisle', 'الممر'],
        ['level', 'المستوى'],
        ['capacity', 'السعة'],
        ['status', 'الحالة']
    ];

    if (requireCode) {
        requiredFields.unshift(['code', 'رمز الموقع']);
    }
    if (requireRack) {
        requiredFields.push(['rack', 'الرف']);
    }

    const missingFields = requiredFields
        .filter(([key]) => !String(data[key] || '').trim())
        .map(([, label]) => label);

    if (missingFields.length > 0) {
        return `يرجى تعبئة جميع بيانات الموقع المطلوبة: ${missingFields.join('، ')}`;
    }

    const capacityValue = Number(data.capacity);
    if (!Number.isFinite(capacityValue) || capacityValue <= 0) {
        return 'يرجى إدخال سعة صحيحة أكبر من صفر.';
    }

    return null;
}

function showView(name) {
    views.forEach(v => v.style.display = 'none');
    el('view-' + name).style.display = 'block';
    navLinks.forEach(a => a.classList.toggle('active', a.dataset.view === name));
    breadcrumb.textContent = (name === 'dashboard' ? 'لوحة القيادة' : name === 'warehouses' ? 'المستودعات' : name === 'locations' ? 'المواقع' : 'التقارير');
    // تحديث الجداول والإحصائيات في كل مرة يتم فيها تغيير العرض
    renderTables();
}

/* attach nav */
navLinks.forEach(a => a.addEventListener('click', e => { e.preventDefault(); showView(a.dataset.view); }));

/* -------------------------
    Rendering: tables + stats
------------------------- */
let warehouses = []; // المتغيرات الآن تخزن البيانات مؤقتاً بعد جلبها
let locations = [];
let supervisors = [];

function escapeWarehouseHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function loadSupervisors(forceRefresh = false) {
    if (!forceRefresh && supervisors.length) {
        return supervisors;
    }

    const result = await fetchData('/warehouses/supervisors');
    supervisors = result.supervisors || [];
    return supervisors;
}

function buildSupervisorOptions(selectedId = '') {
    const normalizedSelectedId = String(selectedId || '').trim();
    const options = supervisors.map((supervisor) => {
        const supervisorId = String(supervisor.user_id || '').trim();
        const selectedAttribute = supervisorId === normalizedSelectedId ? 'selected' : '';
        const label = `${supervisor.full_name || supervisor.email} — ${supervisor.email || ''}`;
        return `<option value="${supervisorId}" ${selectedAttribute}>${escapeWarehouseHtml(label)}</option>`;
    }).join('');

    return `<option value="">اختر مشرف المستودع</option>${options}`;
}

// تحديث الإحصائيات (تعتمد على جلب البيانات)
function compareLocations(left, right) {
    const warehouseCompare = String(left?.warehouse_name || '').localeCompare(String(right?.warehouse_name || ''), 'ar');
    if (warehouseCompare !== 0) return warehouseCompare;
    return compareCodes(left?.code, right?.code);
}

function parseLocationItems(storedItems) {
    return String(storedItems || '')
        .split(/\s*[،,]\s*/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function getLocationCapacityDetails(location) {
    const total = Number(location?.capacity || 0);
    const used = Number(location?.used_capacity || 0);
    const available = Math.max(total - used, 0);
    const percent = total > 0 ? Math.min((used / total) * 100, 100) : 0;

    return {
        total,
        used,
        available,
        percent,
        text: total > 0 ? `${used} / ${total}` : '—'
    };
}

function getLocationStatusClass(status) {
    if (status === 'مشغول') return 'is-busy';
    if (status === 'محجوز') return 'is-reserved';
    return 'is-free';
}

function buildLocationMaterialsMarkup(location, compact = false) {
    const items = parseLocationItems(location?.stored_items);

    if (!items.length) {
        return `<span class="location-items-empty">${compact ? 'فارغ' : 'لا توجد مواد داخل هذا الموقع حاليًا'}</span>`;
    }

    return items
        .map((item) => `<span class="location-item-chip">${escapeWarehouseHtml(item)}</span>`)
        .join('');
}

function buildLocationOverviewCard(location, options = {}) {
    const { showWarehouse = true, actionMarkup = '' } = options;
    const capacity = getLocationCapacityDetails(location);
    const status = String(location?.status || 'حر').trim() || 'حر';
    const warehouseBlock = showWarehouse
        ? `<div class="location-card-meta">المستودع: ${escapeWarehouseHtml(location?.warehouse_name || '—')}</div>`
        : '';

    return `
        <article class="location-card">
            <div class="location-card-head">
                <div>
                    <div class="location-card-code">${escapeWarehouseHtml(location?.code || '—')}</div>
                    ${warehouseBlock}
                </div>
                <span class="location-status-badge ${getLocationStatusClass(status)}">${escapeWarehouseHtml(status)}</span>
            </div>

            <div class="location-card-grid">
                <div class="location-card-stat">
                    <span>الرف</span>
                    <strong>${escapeWarehouseHtml(location?.rack || '—')}</strong>
                </div>
                <div class="location-card-stat">
                    <span>الممر</span>
                    <strong>${escapeWarehouseHtml(location?.aisle || '—')}</strong>
                </div>
                <div class="location-card-stat">
                    <span>المستوى</span>
                    <strong>${escapeWarehouseHtml(location?.level || '—')}</strong>
                </div>
                <div class="location-card-stat">
                    <span>المتاح</span>
                    <strong>${capacity.total > 0 ? capacity.available : '—'}</strong>
                </div>
            </div>

            <div class="location-capacity">
                <div class="location-capacity-row">
                    <span>السعة المستخدمة</span>
                    <strong>${capacity.text}</strong>
                </div>
                <div class="location-capacity-bar">
                    <span style="width:${capacity.percent}%"></span>
                </div>
            </div>

            <div class="location-card-items">
                <div class="location-card-items-title">المواد داخل الموقع</div>
                <div class="location-card-items-list">${buildLocationMaterialsMarkup(location)}</div>
            </div>

            ${actionMarkup ? `<div class="location-card-actions">${actionMarkup}</div>` : ''}
        </article>
    `;
}

function renderLocationsOverview(listLoc, emptyMessage = 'لا توجد مواقع مطابقة حاليًا.') {
    const overview = el('locationsOverview');
    if (!overview) return;

    if (!listLoc.length) {
        overview.innerHTML = `<div class="locations-empty-state">${escapeWarehouseHtml(emptyMessage)}</div>`;
        return;
    }

    overview.innerHTML = `
        <div class="location-overview-grid">
            ${listLoc.map((location) => buildLocationOverviewCard(location)).join('')}
        </div>
    `;
}

async function updateStats() {
    try {
        const whResult = await fetchData('/warehouses');
        warehouses = (whResult.warehouses || []).slice().sort((a, b) => compareCodes(a.code, b.code));

        const locResult = await fetchData('/locations');
        locations = (locResult.locations || []).slice().sort(compareLocations);

        el('statWh').textContent = warehouses.length + ' مستودع';
        el('statLoc').textContent = locations.length + ' موقع';
        
        // حساب الإحصائيات بناءً على البيانات المُجلبة
        el('statActive').textContent = warehouses.filter(w => w.status === 'نشط').length;
        el('statOccupied').textContent = locations.filter(l => l.status === 'مشغول').length;
        el('statFree').textContent = locations.filter(l => l.status === 'حر').length;

        renderCharts();
        populateFilterWarehouses();

    } catch (e) {
        // يتم التعامل مع الخطأ داخل fetchData
        console.error('Failed to update stats/fetch data:', e);
    }
}

// بناء الجداول (تعتمد على جلب البيانات وتطبيق الفلاتر محلياً)
async function renderTables() {
    // 1. جلب البيانات أولاً (أو الاعتماد على البيانات المحدثة في الذاكرة)
    await updateStats();

    // 2. تطبيق فلاتر المستودعات محلياً
    const fSearch = el('filterWhSearch').value.trim().toLowerCase();
    const fStatus = el('filterWhStatus').value;
    let listWh = warehouses.slice();
    if (fSearch) listWh = listWh.filter(w => (w.code + ' ' + w.name + ' ' + (w.warehouse_type || '') + ' ' + w.location + ' ' + (w.manager_name || '') + ' ' + (w.manager_email || '')).toLowerCase().includes(fSearch));
    if (fStatus) listWh = listWh.filter(w => w.status === fStatus);

    const tbWh = el('tbWarehouses'); tbWh.innerHTML = '';
    if (listWh.length === 0) tbWh.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#777;padding:14px">لا توجد مستودعات مطابقة</td></tr>';
    listWh.forEach(w => {
        const managerLabel = w.manager_name || w.manager_email || 'غير مرتبط';
        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="warehouse-code-cell">${w.code}</td>
            <td class="warehouse-name-cell"><a href="#" class="linkWh" data-id="${w.id}" title="${w.name}">${w.name}</a></td>
            <td>${w.warehouse_type || 'غير محدد'}</td>
            <td>${w.location || '—'}</td><td>${escapeWarehouseHtml(managerLabel)}</td><td>${w.status}</td>
            <td style="white-space:nowrap">
                <button class="btn ghost" data-action="editWh" data-id="${w.id}">تعديل</button>
                <button class="btn ghost" data-action="delWh" data-id="${w.id}">حذف</button>
            </td>`;
        tbWh.appendChild(tr);
    });

    // 3. تطبيق فلاتر المواقع محلياً
    const fLocSearch = el('filterLocSearch').value.trim().toLowerCase();
    const fLocWh = el('filterLocWarehouse').value;
    const fLocStatus = el('filterLocStatus').value;
    let listLoc = locations.slice();
    if (fLocWh) listLoc = listLoc.filter(l => l.warehouse_id == fLocWh); // لاحظ أننا نستخدم warehouse_id الآن
    if (fLocStatus) listLoc = listLoc.filter(l => l.status === fLocStatus);
    if (fLocSearch) listLoc = listLoc.filter(l => (l.code + ' ' + l.rack + ' ' + l.aisle + ' ' + l.level + ' ' + (l.warehouse_name || '') + ' ' + (l.stored_items || '')).toLowerCase().includes(fLocSearch));

    renderLocationsOverview(listLoc, 'لا توجد مواقع مطابقة لخيارات البحث الحالية.');

    const locationsTableHead = document.querySelector('#view-locations table thead tr');
    if (locationsTableHead) {
        locationsTableHead.innerHTML = '<th>رمز الموقع</th><th>المستودع</th><th>الرف</th><th>الممر</th><th>المستوى</th><th>السعة</th><th>المواد داخل الموقع</th><th>الحالة</th><th>إجراءات</th>';
    }

    const tbLoc = el('tbLocations'); tbLoc.innerHTML = '';
    if (listLoc.length === 0) tbLoc.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#777;padding:14px">لا توجد مواقع مطابقة</td></tr>';
    const emptyLocationsCell = tbLoc.querySelector('td[colspan]');
    if (emptyLocationsCell) emptyLocationsCell.colSpan = 9;

    listLoc.forEach(l => {
        const whName = l.warehouse_name || '—'; // نستخدم الاسم المجلوب مباشرة من API
        const tr = document.createElement('tr');
        const capacity = getLocationCapacityDetails(l);
        tr.innerHTML = `<td>${escapeWarehouseHtml(l.code || '—')}</td>
            <td>${escapeWarehouseHtml(whName || '—')}</td>
            <td>${escapeWarehouseHtml(l.rack || '—')}</td>
            <td>${escapeWarehouseHtml(l.aisle || '—')}</td>
            <td>${escapeWarehouseHtml(l.level || '—')}</td>
            <td>${capacity.total > 0 ? `${capacity.available} متاح من ${capacity.total}` : '—'}</td>
            <td><div class="location-table-items">${buildLocationMaterialsMarkup(l, true)}</div></td>
            <td><span class="location-status-badge ${getLocationStatusClass(l.status)}">${escapeWarehouseHtml(l.status || 'حر')}</span></td>
            <td style="white-space:nowrap">
            <button class="btn ghost" data-action="editLoc" data-id="${l.id}">تعديل</button>
            <button class="btn ghost" data-action="delLoc" data-id="${l.id}">حذف</button>
            </td>`;
        tbLoc.appendChild(tr);
    });

    // 4. إعادة ربط Handlers بعد تحديث الجداول
    attachEventHandlers();
}

function attachEventHandlers() {
    // attach warehouse name click handlers
    document.querySelectorAll('.linkWh').forEach(a => {
        a.removeEventListener('click', warehousePageHandler);
        a.addEventListener('click', warehousePageHandler);
    });

    // attach action handlers
    document.querySelectorAll('[data-action]').forEach(btn => {
        btn.removeEventListener('click', actionHandler);
        btn.addEventListener('click', actionHandler);
    });
}

const warehousePageHandler = e => { e.preventDefault(); openWarehousePage(e.target.dataset.id); };
const actionHandler = e => {
    const btn = e.currentTarget;
    const act = btn.dataset.action; const id = btn.dataset.id;
    if (act === 'editWh') openEditWarehouse(id);
    if (act === 'delWh') deleteWarehouse(id);
    if (act === 'editLoc') openEditLocation(id);
    if (act === 'delLoc') deleteLocation(id);
};

/* -------------------------
    CRUD: Warehouses
------------------------- */

// إضافة مستودع
async function openAddWarehouseModal() {
    await loadSupervisors(true);
    if (!supervisors.length) {
        alert('يجب إضافة مستخدم واحد على الأقل بدور مشرف قبل إنشاء مستودع جديد.');
        return;
    }

    showModal('إضافة مستودع جديد', `
        <form id="frmAddWh">
        <label>رمز المستودع</label><input id="wh_code" type="text" placeholder="اتركه فارغًا ليصبح مثل WH-01 أو اكتب كودًا يدويًا فريدًا" />
        <label>الاسم</label><input id="wh_name" type="text" required placeholder="اسم المستودع" />
        <label>نوع المستودع</label>
        <select id="wh_type" required>
            <option value="">اختر نوع المستودع</option>
            <option>مستودع للزيوت والشحوم</option>
            <option>مستودع للاطارات</option>
            <option>مستودع للقطع الكهربائية</option>
            <option>مستودع للقطع الميكانيكية</option>
        </select>
        <label>مشرف المستودع</label>
        <select id="wh_manager" required>${buildSupervisorOptions()}</select>
        <label>الموقع</label><input id="wh_location" type="text" placeholder="المدينة أو العنوان" />
        <label>الحالة</label><select id="wh_status"><option>نشط</option><option>تحت الصيانة</option><option>مغلق</option></select>
        <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
            <button class="btn" type="submit">حفظ</button><button class="btn ghost" type="button" id="cancelWh">إلغاء</button>
        </div>
        </form>
    `);
    document.getElementById('frmAddWh').addEventListener('submit', async e => {
        e.preventDefault();
        const data = { 
            code: el('wh_code').value.trim(), 
            name: el('wh_name').value.trim(), 
            warehouse_type: el('wh_type').value,
            manager_user_id: el('wh_manager').value,
            location: el('wh_location').value.trim(), 
            status: el('wh_status').value 
        };
        try {
            const result = await fetchData('/warehouses', 'POST', data);
            closeModal(); 
            renderTables(); 
            alert(`تمت إضافة المستودع بنجاح ✅\nالكود: ${result.code}`);
        } catch (e) {
            // يتم التعامل مع الخطأ داخل fetchData
        }
    });
    document.getElementById('cancelWh').addEventListener('click', closeModal);
}

// تعديل مستودع
async function openEditWarehouse(id) {
    const w = warehouses.find(x => x.id == id); // البحث الآن يتم في البيانات المخزنة مؤقتاً
    if (!w) return alert('المستودع غير موجود');
    await loadSupervisors(true);
    if (!supervisors.length) {
        alert('لا توجد قائمة مشرفين متاحة حالياً لتعديل المستودع.');
        return;
    }
    
    showModal('تعديل المستودع', `
        <form id="frmEditWh">
        <label>رمز المستودع</label><input id="ew_code" type="text" value="${w.code}" required />
        <label>الاسم</label><input id="ew_name" type="text" value="${w.name}" required />
        <label>نوع المستودع</label>
        <select id="ew_type" required>
            <option ${w.warehouse_type === 'مستودع للزيوت والشحوم' ? 'selected' : ''}>مستودع للزيوت والشحوم</option>
            <option ${w.warehouse_type === 'مستودع للاطارات' ? 'selected' : ''}>مستودع للاطارات</option>
            <option ${w.warehouse_type === 'مستودع للقطع الكهربائية' ? 'selected' : ''}>مستودع للقطع الكهربائية</option>
            <option ${w.warehouse_type === 'مستودع للقطع الميكانيكية' ? 'selected' : ''}>مستودع للقطع الميكانيكية</option>
        </select>
        <label>مشرف المستودع</label>
        <select id="ew_manager" required>${buildSupervisorOptions(w.manager_user_id)}</select>
        <label>الموقع</label><input id="ew_location" type="text" value="${w.location || ''}" />
        <label>الحالة</label>
        <select id="ew_status"><option ${w.status === 'نشط' ? 'selected' : ''}>نشط</option><option ${w.status === 'تحت الصيانة' ? 'selected' : ''}>تحت الصيانة</option><option ${w.status === 'مغلق' ? 'selected' : ''}>مغلق</option></select>
        <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
            <button class="btn" type="submit">حفظ</button><button class="btn ghost" type="button" id="cancelEditWh">إلغاء</button>
        </div>
        </form>
    `);
    document.getElementById('frmEditWh').addEventListener('submit', async e => {
        e.preventDefault();
        const data = {
            code: el('ew_code').value.trim(), 
            name: el('ew_name').value.trim(), 
            warehouse_type: el('ew_type').value,
            manager_user_id: el('ew_manager').value,
            location: el('ew_location').value.trim(), 
            status: el('ew_status').value 
        };
        try {
            await fetchData(`/warehouses/${id}`, 'PUT', data);
            closeModal(); 
            renderTables(); 
            alert('تم حفظ التعديل بنجاح ✅');
        } catch (e) {
            // يتم التعامل مع الخطأ داخل fetchData
        }
    });
    document.getElementById('cancelEditWh').addEventListener('click', closeModal);
}

// حذف مستودع
async function deleteWarehouse(id) {
    if (!confirm('حذف المستودع سيؤدي لحذف جميع المواقع التابعة له. هل تريد المتابعة؟')) return;
    try {
        await fetchData(`/warehouses/${id}`, 'DELETE');
        renderTables(); // تحديث الجدول بعد الحذف
        alert('تم حذف المستودع بنجاح ✅');
    } catch (e) {
        // يتم التعامل مع الخطأ داخل fetchData
    }
}

/* -------------------------
    CRUD: Locations
------------------------- */

// إضافة موقع
function openAddLocationModal(prefillWarehouseId) {
    // خيارات المستودعات متاحة من المصفوفة المخزنة مؤقتاً
    let opts = warehouses.map(w => `<option value="${w.id}">${w.name} — ${w.code}</option>`).join('');
    if (!opts) opts = '<option value="">(أضف مستودعًا أولًا)</option>';
    
    showModal('إضافة موقع جديد', `
        <form id="frmAddLoc">
        <label>رمز الموقع</label><input id="loc_code" type="text" placeholder="اكتب بادئة مثل LOC أو اتركه فارغًا للتوليد التلقائي" />
        <label>المستودع التابع</label><select id="loc_wh" required>${opts}</select>
        <label>الرف (Rack)</label><input id="loc_rack" type="text" placeholder="اكتب بادئة مثل RACK أو اتركه فارغًا للتوليد التلقائي" />
        <label>الممر (Aisle)</label><input id="loc_aisle" type="text" placeholder="مثال: A" />
        <label>المستوى (Level)</label><input id="loc_level" type="text" placeholder="مثال: L1" />
        <label>السعة</label><input id="loc_capacity" type="text" placeholder="مثال: 120" />
        <label>الحالة</label><select id="loc_status"><option>حر</option><option>مشغول</option><option>محجوز</option></select>
        <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
            <button class="btn" type="submit">حفظ</button><button class="btn ghost" type="button" id="cancelLoc">إلغاء</button>
        </div>
        </form>
    `);
    ['loc_wh', 'loc_aisle', 'loc_level', 'loc_capacity', 'loc_status'].forEach((fieldId) => {
        const input = el(fieldId);
        if (input) input.required = true;
    });
    if (el('loc_capacity')) {
        el('loc_capacity').type = 'number';
        el('loc_capacity').min = '1';
        el('loc_capacity').step = '1';
    }
    if (prefillWarehouseId) setTimeout(() => el('loc_wh').value = prefillWarehouseId, 50);

    document.getElementById('frmAddLoc').addEventListener('submit', async e => {
        e.preventDefault();
        const warehouseId = el('loc_wh').value;
        if (!warehouseId) return alert('اختر مستودعًا أولًا');

        const data = { 
            code: el('loc_code').value.trim(), 
            warehouseId: warehouseId, 
            rack: el('loc_rack').value.trim(), 
            aisle: el('loc_aisle').value.trim(), 
            level: el('loc_level').value.trim(), 
            capacity: el('loc_capacity').value.trim(), 
            status: el('loc_status').value 
        };
        const validationMessage = validateLocationPayload(data);
        if (validationMessage) return alert(validationMessage);

        try {
            const result = await fetchData('/locations', 'POST', data);
            closeModal(); 
            renderTables(); 
            alert(`تم إضافة الموقع بنجاح ✅\nالكود: ${result.code}${result.rack ? `\nالرف: ${result.rack}` : ''}`);
        } catch (e) {
            // يتم التعامل مع الخطأ داخل fetchData
        }
    });
    document.getElementById('cancelLoc').addEventListener('click', closeModal);
}

// تعديل موقع
async function openEditLocation(id) {
    const loc = locations.find(l => l.id == id);
    if (!loc) return alert('الموقع غير موجود');

    // خيارات المستودعات لـ Select
    let opts = warehouses.map(w => `<option value="${w.id}" ${w.id == loc.warehouse_id ? 'selected' : ''}>${w.name} — ${w.code}</option>`).join('');

    showModal('تعديل الموقع', `
        <form id="frmEditLoc">
        <label>رمز الموقع</label><input id="el_code" type="text" value="${loc.code}" required />
        <label>المستودع التابع</label><select id="el_wh" required>${opts}</select>
        <label>الرف</label><input id="el_rack" type="text" value="${loc.rack || ''}" />
        <label>الممر</label><input id="el_aisle" type="text" value="${loc.aisle || ''}" />
        <label>المستوى</label><input id="el_level" type="text" value="${loc.level || ''}" />
        <label>السعة</label><input id="el_capacity" type="text" value="${loc.capacity || ''}" />
        <label>الحالة</label><select id="el_status"><option ${loc.status === 'حر' ? 'selected' : ''}>حر</option><option ${loc.status === 'مشغول' ? 'selected' : ''}>مشغول</option><option ${loc.status === 'محجوز' ? 'selected' : ''}>محجوز</option></select>
        <div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
            <button class="btn" type="submit">حفظ</button><button class="btn ghost" type="button" id="cancelEditLoc">إلغاء</button>
        </div>
        </form>
    `);

    ['el_code', 'el_wh', 'el_rack', 'el_aisle', 'el_level', 'el_capacity', 'el_status'].forEach((fieldId) => {
        const input = el(fieldId);
        if (input) input.required = true;
    });
    if (el('el_capacity')) {
        el('el_capacity').type = 'number';
        el('el_capacity').min = '1';
        el('el_capacity').step = '1';
    }

    document.getElementById('frmEditLoc').addEventListener('submit', async e => {
        e.preventDefault();
        const data = {
            code: el('el_code').value.trim(), 
            warehouseId: el('el_wh').value, 
            rack: el('el_rack').value.trim(), 
            aisle: el('el_aisle').value.trim(),
            level: el('el_level').value.trim(), 
            capacity: el('el_capacity').value.trim(), 
            status: el('el_status').value 
        };
        const validationMessage = validateLocationPayload(data, { requireCode: true, requireRack: true });
        if (validationMessage) return alert(validationMessage);

        try {
            await fetchData(`/locations/${id}`, 'PUT', data);
            closeModal(); 
            renderTables(); 
            alert('تم حفظ التعديل بنجاح ✅');
        } catch (e) {
            // يتم التعامل مع الخطأ داخل fetchData
        }
    });
    document.getElementById('cancelEditLoc').addEventListener('click', closeModal);
}

// حذف موقع
async function deleteLocation(id) {
    if (!confirm('هل تريد حذف هذا الموقع؟')) return;
    try {
        await fetchData(`/locations/${id}`, 'DELETE');
        renderTables(); // تحديث الجدول بعد الحذف
        alert('تم حذف الموقع بنجاح ✅');
    } catch (e) {
        // يتم التعامل مع الخطأ داخل fetchData
    }
}

/* -------------------------
    Warehouse subpage view
------------------------- */
function openWarehousePage(id) {
    const warehouse = warehouses.find((item) => item.id == id);
    if (!warehouse) return alert('المستودع غير موجود');

    const warehouseLocations = locations
        .filter((location) => location.warehouse_id == id)
        .slice()
        .sort(compareLocations);
    const managerLabel = warehouse.manager_name || warehouse.manager_email || 'غير مرتبط';
    const locationsMarkup = warehouseLocations.length
        ? `
            <div class="location-overview-grid warehouse-location-overview">
                ${warehouseLocations.map((location) => buildLocationOverviewCard(location, {
                    showWarehouse: false,
                    actionMarkup: `<button class="btn ghost" data-loc="${location.id}">تحرير الموقع</button>`
                })).join('')}
            </div>
        `
        : '<div class="locations-empty-state">لا توجد مواقع لهذا المستودع بعد.</div>';

    showModal(`${warehouse.name} — تفاصيل المستودع`, `
        <div class="warehouse-page-head">
            <div>
                <div style="font-weight:800">${warehouse.name}</div>
                <div class="muted">${warehouse.code} — ${warehouse.warehouse_type || 'غير محدد'} — ${warehouse.location || '—'} — المشرف: ${escapeWarehouseHtml(managerLabel)}</div>
            </div>
            <div><span class="pill">${warehouseLocations.length} موقع</span></div>
        </div>
        <div class="warehouse-page-actions">
            <button class="btn" id="addLocHere">إضافة موقع في هذا المستودع</button>
        </div>
        <div style="margin-top:12px">${locationsMarkup}</div>
    `);

    document.getElementById('addLocHere').addEventListener('click', () => { closeModal(); openAddLocationModal(id); });
    setTimeout(() => {
        document.querySelectorAll('[data-loc]').forEach((button) => button.addEventListener('click', (event) => {
            closeModal();
            openEditLocation(event.currentTarget.dataset.loc);
        }));
    }, 80);
}


/* -------------------------
    Modal helpers
------------------------- */
const modalBack = el('modalBack');
function showModal(title, html) {
    el('modalTitle').textContent = title;
    el('modalBody').innerHTML = html;
    modalBack.style.display = 'flex';
}
function closeModal() { modalBack.style.display = 'none'; el('modalBody').innerHTML = ''; }
el('closeModal').addEventListener('click', closeModal);
modalBack.addEventListener('click', (e) => { if (e.target === modalBack) closeModal(); });


/* -------------------------
    Charts (Chart.js)
------------------------- */
let chartWh = null, chartLoc = null;
function renderCharts() {
    // warehouses by status
    const whByStatus = warehouses.reduce((acc, w) => { acc[w.status] = (acc[w.status] || 0) + 1; return acc; }, {});
    const whLabels = Object.keys(whByStatus); const whData = whLabels.map(l => whByStatus[l]);
    const ctxW = el('chartWarehouse').getContext('2d');
    if (chartWh) chartWh.destroy();
    chartWh = new Chart(ctxW, { type: 'doughnut', data: { labels: whLabels, datasets: [{ data: whData, backgroundColor: ['#04969A', '#FCBF49', '#E01E37'] }] }, options: { plugins: { legend: { position: 'bottom' } } } });

    // locations by status
    const locByStatus = locations.reduce((acc, l) => { acc[l.status] = (acc[l.status] || 0) + 1; return acc; }, {});
    const locLabels = Object.keys(locByStatus); const locData = locLabels.map(l => locByStatus[l]);
    const ctxL = el('chartLocations').getContext('2d');
    if (chartLoc) chartLoc.destroy();
    chartLoc = new Chart(ctxL, { type: 'pie', data: { labels: locLabels, datasets: [{ data: locData, backgroundColor: ['#05888D', '#1B4965', '#98C1D9'] }] }, options: { plugins: { legend: { position: 'bottom' } } } });
}

/* -------------------------
    Export / Import / Print
------------------------- */
// وظائف التصدير والاستيراد ستعمل الآن مع البيانات المحلية (المخزنة مؤقتاً)
el('btnExportJSON').addEventListener('click', () => {
    // يتم تصدير البيانات المخزنة مؤقتاً في الذاكرة (التي تم جلبها من API)
    const payload = { warehouses, locations, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'export_warehouses.json'; a.click(); URL.revokeObjectURL(url);
    alert('تم تصدير البيانات بنجاح. تذكر أن هذا التصدير لا يؤثر على قاعدة بيانات الخادم.');
});

el('btnImportJSON').addEventListener('click', () => {
    alert('⚠️ ملاحظة: الاستيراد عبر هذا الملف لا يضيف البيانات إلى قاعدة بيانات الخادم، بل يحل محل البيانات المخزنة مؤقتاً في المتصفح فقط. لإضافة البيانات إلى الخادم، يجب برمجة API مخصصة لذلك.');
    el('importFile').click();
});
el('importFile').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = async function() { 
        try { 
            const data = JSON.parse(this.result); 
            if (Array.isArray(data.warehouses) && Array.isArray(data.locations)) { 
                // يجب أن تكون هناك راوت API خاص بعملية الاستيراد الكامل، لكننا سنكتفي بالتنبيه هنا
                alert('فشل: لا يمكن استيراد البيانات إلى قاعدة البيانات مباشرة من الواجهة الأمامية حاليًا. يجب برمجة مسار API خاص بالاستيراد.');
            } else {
                alert('ملف غير صالح'); 
            }
        } catch (err) { 
            alert('فشل قراءة الملف'); 
        } 
    };
    reader.readAsText(f);
});

el('btnPrintAll').addEventListener('click', () => {
    // وظيفة الطباعة تعتمد على البيانات المخزنة مؤقتاً
    const now = new Date().toLocaleString();
    const header = `<div style="text-align:right;font-family:Arial, sans-serif"><h2>تقرير المستودعات والمواقع</h2><div style="color:#666">تاريخ الإصدار: ${now}</div><hr/></div>`;
    const whTable = `<h3>قائمة المستودعات (${warehouses.length})</h3>
        <table border="1" cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse;margin-bottom:12px">
        <thead><tr><th>رمز</th><th>اسم</th><th>النوع</th><th>موقع</th><th>المشرف</th><th>حالة</th></tr></thead>
        <tbody>${warehouses.map(w => `<tr><td>${w.code}</td><td>${w.name}</td><td>${w.warehouse_type || 'غير محدد'}</td><td>${w.location || ''}</td><td>${escapeWarehouseHtml(w.manager_name || w.manager_email || 'غير مرتبط')}</td><td>${w.status}</td></tr>`).join('')}</tbody>
        </table>`;
    const locTable = `<h3>قائمة المواقع (${locations.length})</h3>
        <table border="1" cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse">
        <thead><tr><th>رمز الموقع</th><th>مستودع</th><th>رف</th><th>ممر</th><th>مستوى</th><th>سعة</th><th>حالة</th></tr></thead>
        <tbody>${locations.map(l => { const whName = l.warehouse_name || ''; return `<tr><td>${l.code}</td><td>${whName}</td><td>${l.rack || ''}</td><td>${l.aisle || ''}</td><td>${l.level || ''}</td><td>${l.capacity || ''}</td><td>${l.status}</td></tr>` }).join('')}</tbody>
        </table>`;
    const stats = `<h3>ملخص إحصائي</h3><ul><li>المستودعات: ${warehouses.length}</li><li>المواقع: ${locations.length}</li><li>المستودعات النشطة: ${warehouses.filter(w => w.status === 'نشط').length}</li><li>المواقع المشغولة: ${locations.filter(l => l.status === 'مشغول').length}</li></ul>`;
    const win = window.open('', 'printWindow', 'width=900,height=700');
    win.document.write(`<html><head><title>تقرير المستودعات</title><style>body{font-family:Arial, sans-serif;padding:20px;color:#042f33}table{border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px;text-align:right}</style></head><body>${header}${stats}${whTable}${locTable}</body></html>`);
    win.document.close(); win.focus(); setTimeout(() => { win.print(); }, 400);
});

/* -------------------------
    Filters & Search events
------------------------- */
el('filterWhSearch').addEventListener('input', renderTables);
el('filterWhStatus').addEventListener('change', renderTables);
el('clearWhFilters').addEventListener('click', () => { el('filterWhSearch').value = ''; el('filterWhStatus').value = ''; renderTables(); });

el('filterLocWarehouse').addEventListener('change', renderTables);
el('filterLocStatus').addEventListener('change', renderTables);
el('filterLocSearch').addEventListener('input', renderTables);
el('clearLocFilters').addEventListener('click', () => { el('filterLocWarehouse').value = ''; el('filterLocStatus').value = ''; el('filterLocSearch').value = ''; renderTables(); });

el('globalSearch').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) { renderTables(); return; }
    el('filterWhSearch').value = q; el('filterLocSearch').value = q; showView('warehouses');
});

/* -------------------------
    Quick buttons
------------------------- */
el('btnAddWarehouse').addEventListener('click', openAddWarehouseModal);
el('openAddWh').addEventListener('click', openAddWarehouseModal);
el('quickAddWh').addEventListener('click', openAddWarehouseModal);
el('openAddLoc') && el('openAddLoc').addEventListener('click', () => openAddLocationModal());
el('quickAddLoc').addEventListener('click', () => openAddLocationModal());
el('openReports').addEventListener('click', () => showView('reports'));


/* -------------------------
    Populate warehouse filter dropdown
------------------------- */
function populateFilterWarehouses() {
    const sel = el('filterLocWarehouse'); 
    const currentWhId = sel.value; // حفظ القيمة المحددة
    sel.innerHTML = '<option value="">كل المستودعات</option>';
    warehouses.forEach(w => sel.innerHTML += `<option value="${w.id}">${w.name} — ${w.code}</option>`);
    sel.value = currentWhId; // إعادة تعيين القيمة المحددة
}


/* -------------------------
    Initial view
------------------------- */
showView('dashboard'); // يتم استدعاء renderTables و updateStats من هنا
