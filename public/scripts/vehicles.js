/*************************************************************************
 * بيانات نموذجية + بنية التخزين
 * تم الإبقاء على Local Storage مؤقتاً لسجل الصيانة المحلي فقط
 *************************************************************************/
// فهرس فئات مقترحة
const CATEGORIES = ['رافعة', 'شاحنة', 'مولد', 'رافعة شوكية', 'معدات أخرى'];
const getElement = (id) => document.getElementById(id);

const tableElements = {
    tbody: document.querySelector('#machinesTable tbody'),
    searchInput: getElement('searchInput'),
    filterCategory: getElement('filterCategory'),
    filterStatus: getElement('filterStatus'),
    sortSelect: getElement('sortSelect'),
    countMachines: getElement('countMachines'),
    statsTotalMachines: getElement('statsTotalMachines'),
    statsReadyMachines: getElement('statsReadyMachines'),
    statsMaintenanceMachines: getElement('statsMaintenanceMachines'),
    statsStoppedMachines: getElement('statsStoppedMachines'),
    availabilitySummary: getElement('availabilitySummary'),
    availabilityBreakdown: getElement('availabilityBreakdown'),
    availabilityChart: getElement('availabilityChart'),
    byStatusList: getElement('byStatusList'),
    addMachineBtn: getElement('addMachineBtn'),
    modalBg: getElement('modalBg'),
    modalContent: getElement('modalContent'),
    closeModalBtn: getElement('closeModal')
};

// بيانات التشغيل: الآليات (سيتم جلبها من API)
let machines = []; // سيتم ملؤها بواسطة الدالة renderTable من API

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
 * جدول الآليات — **API CALL**
 *************************************************************************/
function populateFilterCategories() {
    const sel = tableElements.filterCategory;
    if (!sel) {
        return;
    }

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
    const search = tableElements.searchInput?.value.trim() || '';
    const cat = tableElements.filterCategory?.value || '';
    const status = tableElements.filterStatus?.value || '';
    const sort = tableElements.sortSelect?.value || '';

    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (cat) params.append('category', cat);
    if (status) params.append('status', status);
    if (sort) params.append('sort', sort);

    try {
        tableElements.tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">جارٍ تحميل البيانات...</td></tr>';
        const list = await fetchJson(`/api/machines?${params.toString()}`, undefined, 'تعذر تحميل بيانات الآليات.');
        
        // تحديث مصفوفة machines العالمية (مهمة لـ renderStats/openEditMachine)
        machines = list; 

        // 4. عرض القائمة المصفاة والـ Count
        tableElements.tbody.innerHTML = '';
        list.forEach(m => {
            const tr = document.createElement('tr');
            
            tr.innerHTML = `
                <td>${escapeHTML(m.machine_code || '-')}</td>
                <td>${escapeHTML(m.machine_name || '-')}</td>
                <td>${escapeHTML(m.category || '-')}</td>
                <td>${escapeHTML(m.driver_name || '-')}</td>
                <td>${escapeHTML(m.status || '-')}</td>
                <td>${Number(m.operating_hours || 0).toFixed(2)}</td>
                <td class="actions">
                    <button class="btn" onclick="openMachineProfile(${m.machine_id})">تفاصيل</button>
                    <button class="btn ghost" onclick="openEditMachine(${m.machine_id})">تعديل</button>
                    <button class="btn secondary" onclick="deleteMachine(${m.machine_id})">حذف</button>
                </td>`;
            tableElements.tbody.appendChild(tr);
        });

        tableElements.countMachines.textContent = list.length;
        
        // تحديث باقي المكونات التي تعتمد على بيانات الآليات
        populateFilterCategories();
        renderStats();

    } catch (error) {
        console.error('Error fetching and rendering machines:', error);
        tableElements.tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#b91c1c;">تعذر تحميل بيانات الآليات. يرجى إعادة المحاولة لاحقاً.</td></tr>';
        tableElements.countMachines.textContent = 0;
    }
}

/*************************************************************************
 * أدوات: تهريب محتوى HTML آمن
 *************************************************************************/
function escapeHTML(s) { if (s == null) return ''; return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

async function fetchJson(url, options, fallbackMessage) {
    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || fallbackMessage || `HTTP Error! Status: ${response.status}`);
    }

    return data;
}

function notifyMachineUpdate(action = 'updated') {
    try {
        localStorage.setItem('machine-refresh', JSON.stringify({
            action,
            timestamp: Date.now()
        }));
    } catch (error) {
        console.warn('Failed to broadcast machine update:', error);
    }
}

async function fetchMachineMaintenanceHistory(machineId) {
    const data = await fetchJson(`/api/machines/${machineId}/maintenance-history`, {
        method: 'GET',
        cache: 'no-store'
    }, 'تعذر تحميل سجل الصيانة.');

    if (!data.success) {
        throw new Error(data.message || 'تعذر تحميل سجل الصيانة.');
    }

    return Array.isArray(data.history) ? data.history : [];
}

/*************************************************************************
 * CRUD للآليات (تم تعديلها لاستخدام API)
 *************************************************************************/
tableElements.addMachineBtn.addEventListener('click', () => openAddMachine());

async function fetchDrivers() {
    try {
        const data = await fetchJson('/api/drivers', undefined, 'فشل جلب قائمة السائقين');
        return data.drivers || [];
    } catch (error) {
        console.error('Error fetching drivers:', error);
        alert('فشل في جلب قائمة السائقين من الخادم.');
        return [];
    }
}

function openAddMachine() {
    openModal(renderMachineForm());
}
function openEditMachine(id) {
    const m = machines.find(x => x.machine_id === id);
    if (!m) return alert('لم يتم العثور على الآلية');
    openModal(renderMachineForm(m));
}

// 2. دالة الحذف (تستخدم API الآن)
async function deleteMachine(id) {
    if (!confirm('هل أنت متأكد من حذف الآلية؟ سيؤدي هذا إلى حذف جميع سجلات الصيانة المرتبطة بها (بسبب ON DELETE CASCADE).')) return;
    
    try {
        const result = await fetchJson(`/api/machines/${id}`, { method: 'DELETE' }, 'فشل الحذف من الخادم.');

        alert(result.message || 'تم حذف الآلية بنجاح.');
        notifyMachineUpdate('deleted');
        renderTable(); 
        
    } catch (error) {
        console.error('Error deleting machine:', error);
        alert(`فشل الحذف: ${error.message}`);
    }
}

// 3. دالة إنشاء وعرض النموذج (معدّلة: أصبحت async لجلب الموردين)
function renderMachineForm(machine = null) {
    const isEdit = !!machine;
    const modalContent = document.createElement('div');
    modalContent.className = 'machine-form-shell';
    modalContent.innerHTML = `
      <div class="modal-title-wrap">
        <h2>${isEdit ? 'تعديل بيانات الآلية' : 'إضافة آلية جديدة'}</h2>
        <div class="small-muted">${isEdit ? 'حدّث بيانات الآلية الحالية ثم احفظ التعديلات.' : 'أدخل البيانات الأساسية لإضافة آلية جديدة إلى النظام.'}</div>
      </div>
      <div id="machineFormBody">
        <div class="modal-loading-state">جارٍ تحميل بيانات السائقين...</div>
      </div>
      <div class="modal-actions">
        <button id="saveMachine" class="btn" disabled>${isEdit ? 'حفظ التعديلات' : 'إضافة الآلية'}</button>
        <button id="cancelModal" class="btn ghost">إلغاء</button>
      </div>`;
      
    // إضافة زر الإلغاء والانتظار حتى يتم تحميل الموردين
    setTimeout(() => modalContent.querySelector('#cancelModal').onclick = closeModal, 0);

    // دالة داخلية لبناء النموذج بعد تحميل السائقين
    async function buildForm() {
        const drivers = await fetchDrivers();

        const availableDrivers = drivers.filter(driver => {
            if (!driver.assigned_machine_id) return true;
            return Number(driver.assigned_machine_id) === Number(machine?.machine_id);
        });

        const driverPlaceholder = availableDrivers.length
            ? '-- اختر سائق --'
            : '-- لا يوجد سائق متاح --';
        const driverOptions = availableDrivers.map(driver => `
            <option value="${driver.user_id}" ${Number(machine?.driver_user_id) === Number(driver.user_id) ? 'selected' : ''}>
                ${escapeHTML(driver.full_name || driver.email)}
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
            <div class="form-row"><label>ساعات التشغيل</label><input id="f_hours" type="number" step="0.1" value="${machine?.operating_hours || 0}" /></div>

            <div class="form-row"><label>السائق</label>
                <select id="f_driver_user_id">
                    <option value="" ${!machine?.driver_user_id ? 'selected' : ''}>${driverPlaceholder}</option>
                    ${driverOptions}
                </select>
            </div>

            <div class="form-row form-row-wide"><label>ملاحظات</label><textarea id="f_notes" rows="4" placeholder="أدخل أي ملاحظات تشغيلية أو فنية إضافية">${escapeHTML(machine?.notes || '')}</textarea></div>
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
            last_maintenance_date: null,
            next_maintenance_date: null,
            operating_hours: parseFloat(modalContent.querySelector('#f_hours').value || 0),
            supplier_id: null,
            driver_user_id: modalContent.querySelector('#f_driver_user_id').value || null,
            facility_name: null,
            notes: modalContent.querySelector('#f_notes').value.trim()
        };

        if (!machineData.machine_name || !machineData.status || (isEdit && !machineData.machine_code)) {
            return alert(isEdit ? 'الرجاء تعبئة الحقول الأساسية (الرمز، الاسم، والحالة).' : 'الرجاء تعبئة اسم الآلية والحالة، ويمكن ترك الكود فارغًا أو كتابة بادئة فقط.');
        }

            const url = isEdit ? `/api/machines/${tempId}` : '/api/machines';
            const method = isEdit ? 'PUT' : 'POST';

        try {
            const result = await fetchJson(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(machineData)
            }, 'فشل حفظ بيانات الآلية.');

            alert(result.machine_code ? `${result.message}\nالكود: ${result.machine_code}` : (result.message || 'تم حفظ البيانات بنجاح.'));
            notifyMachineUpdate(isEdit ? 'updated' : 'created');
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
      <div class="small-muted">الفئة: ${escapeHTML(machine.category)} • السائق: ${escapeHTML(machine.driver_name || '-')}</div>
      <div style="display:flex;gap:12px;margin-top:12px">
        <div style="flex:1">
          <div class="form-row"><label>الحالة التشغيلية</label><div>${escapeHTML(machine.status)}</div></div>
          <div class="form-row"><label>ساعات التشغيل</label><div>${Number(machine.operating_hours || 0).toFixed(2)}</div></div>
        </div>
      </div>
      <hr>
      <h3>سجل الصيانة</h3>
      <div id="maintenanceList"><div class="small-muted">جارٍ تحميل سجل الصيانة...</div></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
        <button id="closeProfile" class="btn ghost">إغلاق</button>
      </div>
    `;

    setTimeout(() => {
        div.querySelector('#closeProfile').onclick = closeModal;
        const container = div.querySelector('#maintenanceList');
        fetchMachineMaintenanceHistory(machine.machine_id)
            .then((list) => {
                if (!list.length) {
                    container.innerHTML = '<div class="small-muted">لا يوجد سجلات صيانة بعد.</div>';
                    return;
                }

                container.innerHTML = list.map((record) => `
                    <div style="padding:12px;border-radius:14px;background:rgba(255,255,255,0.04);margin-bottom:10px;border:1px solid rgba(168, 210, 225, 0.12)">
                        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
                            <div><strong>طلب صيانة مكتمل</strong> — ${formatDate(record.fulfilled_at || record.requested_for_date || record.created_at)}</div>
                            <div class="small-muted">المادة: ${escapeHTML(record.item_name || '-')} (${escapeHTML(record.item_code || '-')})</div>
                        </div>
                        <div class="small-muted" style="margin-top:8px">الكمية المطلوبة: ${escapeHTML(Number(record.requested_qty || 0).toFixed(2))} • الكمية المصروفة: ${escapeHTML(Number(record.issued_qty || 0).toFixed(2))}</div>
                        <div class="small-muted" style="margin-top:6px">الطالب: ${escapeHTML(record.requested_by || '-')} • تم الصرف بواسطة: ${escapeHTML(record.fulfilled_by || '-')}</div>
                        ${record.justification ? `<div class="small-muted" style="margin-top:8px">${escapeHTML(record.justification)}</div>` : ''}
                    </div>
                `).join('');
            })
            .catch((error) => {
                container.innerHTML = `<div class="small-muted" style="color:#fca5a5;">${escapeHTML(error.message || 'تعذر تحميل سجل الصيانة.')}</div>`;
            });
    }, 0);

    return div;
}



/*************************************************************************
 * إحصاءات بسيطة (نسبة الجاهزية، قائمة حسب الحالة)
 *************************************************************************/
function renderStats() {
    const total = machines.length;
    const ready = machines.filter(m => m.status === 'جاهزة').length;
    const maintenanceCount = machines.filter(m => m.status === 'تحت الصيانة').length;
    const stoppedCount = machines.filter(m => m.status === 'متوقفة').length;
    const readyPct = total ? Math.round((ready / total) * 100) : 0;

    if (tableElements.statsTotalMachines) tableElements.statsTotalMachines.textContent = total;
    if (tableElements.statsReadyMachines) tableElements.statsReadyMachines.textContent = ready;
    if (tableElements.statsMaintenanceMachines) tableElements.statsMaintenanceMachines.textContent = maintenanceCount;
    if (tableElements.statsStoppedMachines) tableElements.statsStoppedMachines.textContent = stoppedCount;
    if (tableElements.availabilitySummary) tableElements.availabilitySummary.textContent = `${readyPct}% جاهزية`;
    if (tableElements.availabilityBreakdown) tableElements.availabilityBreakdown.textContent = `${ready} جاهزة من أصل ${total || 0}`;

    // رسم شريط جاهزية متجاوب على canvas
    const canvas = tableElements.availabilityChart;
    if (!canvas) {
        return;
    }

    const ctx = canvas.getContext('2d');
    const w = canvas.width = Math.max(canvas.clientWidth, 280);
    const h = canvas.height = Math.max(Math.round(canvas.clientWidth * 0.2), 180);
    ctx.clearRect(0, 0, w, h);

    const paddingX = Math.max(22, Math.round(w * 0.04));
    const trackY = 54;
    const trackHeight = Math.max(44, Math.round(h * 0.28));
    const trackWidth = w - (paddingX * 2);
    const fillWidth = Math.max(trackWidth * (readyPct / 100), readyPct > 0 ? 10 : 0);

    ctx.fillStyle = 'rgba(214, 236, 244, 0.18)';
    ctx.strokeStyle = 'rgba(214, 236, 244, 0.32)';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, paddingX, trackY, trackWidth, trackHeight, 18, true, true);

    const gradient = ctx.createLinearGradient(paddingX, 0, paddingX + trackWidth, 0);
    gradient.addColorStop(0, '#35e7ca');
    gradient.addColorStop(1, '#19c3a7');
    ctx.fillStyle = gradient;
    drawRoundedRect(ctx, paddingX, trackY, fillWidth, trackHeight, 18, true, false);

    ctx.fillStyle = '#f3fbff';
    ctx.font = '700 18px Cairo, Segoe UI, sans-serif';
    ctx.fillText(`${readyPct}%`, paddingX, 34);

    ctx.fillStyle = '#a9c0cd';
    ctx.font = '600 13px Cairo, Segoe UI, sans-serif';
    ctx.fillText(`جاهزة: ${ready}`, paddingX, h - 24);
    ctx.fillText(`غير جاهزة: ${Math.max(total - ready, 0)}`, Math.max(w - paddingX - 110, paddingX + 120), h - 24);

    // by status
    const byStatus = {};
    machines.forEach(m => byStatus[m.status] = (byStatus[m.status] || 0) + 1);
    const bstatus = tableElements.byStatusList;
    bstatus.innerHTML = Object.entries(byStatus).map(([k, v]) => `<div class="pill">${escapeHTML(k)}: <strong>${v}</strong></div>`).join(' ') || '<div class="small-muted">لا توجد بيانات</div>';

}

function drawRoundedRect(ctx, x, y, width, height, radius, fill, stroke) {
    const safeRadius = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + safeRadius, y);
    ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
    ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
    ctx.arcTo(x, y + height, x, y, safeRadius);
    ctx.arcTo(x, y, x + width, y, safeRadius);
    ctx.closePath();

    if (fill) {
        ctx.fill();
    }

    if (stroke) {
        ctx.stroke();
    }
}

/*************************************************************************
 * مودال عام
 *************************************************************************/
const modalBg = tableElements.modalBg;
const modalContent = tableElements.modalContent;
tableElements.closeModalBtn.onclick = closeModal;
function openModal(nodeContent) {
    modalContent.innerHTML = '';
    if (typeof nodeContent === 'string') modalContent.innerHTML = nodeContent;
    else modalContent.appendChild(nodeContent);
    document.body.classList.add('modal-open');
    modalBg.style.display = 'flex';
    modalBg.scrollTop = 0;
    modalBg.querySelector('.modal')?.scrollTo({ top: 0, behavior: 'auto' });
    modalContent.scrollTop = 0;
}
function closeModal() {
    document.body.classList.remove('modal-open');
    modalBg.style.display = 'none';
    modalContent.innerHTML = '';
}



/*************************************************************************
 * تهيئة عناصر التحكم
 *************************************************************************/
tableElements.searchInput.addEventListener('input', debounce(renderTable, 250));
tableElements.filterCategory.addEventListener('change', renderTable);
tableElements.filterStatus.addEventListener('change', renderTable);
tableElements.sortSelect.addEventListener('change', renderTable);
window.addEventListener('resize', debounce(renderStats, 120));

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
window.openEditMachine = openEditMachine;
window.deleteMachine = deleteMachine;

// بدء العرض
renderTable();
// renderStats(); // سيتم استدعاؤها داخل renderTable
