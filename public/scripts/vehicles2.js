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
 * بطاقات الفئات (تعتمد الآن على المصفوفة العالمية machines المحدثة)
 *************************************************************************/
const cardsContainer = document.getElementById('cardsContainer');
function renderCards() {
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
    document.getElementById('filterCategory').value = cat;
    renderTable();
}

/*************************************************************************
 * جدول الآليات — **API CALL**
 *************************************************************************/
const tbody = document.querySelector('#machinesTable tbody');
let renderRequestId = 0;

function scheduleSecondaryRender(requestId) {
    requestAnimationFrame(() => {
        if (requestId !== renderRequestId) return;
        populateFilterCategories();
        renderCards();
        renderStats();
        renderAlerts();
    });
}

function populateFilterCategories() {
    const sel = document.getElementById('filterCategory');
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
    const requestId = ++renderRequestId;
    const search = document.getElementById('searchInput').value.trim();
    const cat = document.getElementById('filterCategory').value;
    const status = document.getElementById('filterStatus').value;
    const sort = document.getElementById('sortSelect').value;

    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (cat) params.append('category', cat);
    if (status) params.append('status', status);
    if (sort) params.append('sort', sort);

    try {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">جارٍ تحميل البيانات...</td></tr>';
        
        const response = await fetch(`/api/machines?${params.toString()}`);
        
        if (!response.ok) {
            throw new Error(`HTTP Error! Status: ${response.status}`);
        }

        // list تحتوي الآن على البيانات المفلترة والمصنفة من الخادم
        const list = await response.json();
        
        // تحديث مصفوفة machines العالمية (مهمة لـ renderAlerts/renderStats/openEditMachine)
        machines = list;

        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">لا توجد آليات مطابقة.</td></tr>';
            document.getElementById('countMachines').textContent = 0;
            scheduleSecondaryRender(requestId);
            return;
        }

        tbody.innerHTML = list.map(m => {
            const sev = maintenanceSeverity(m.next_maintenance_date);
            const maintenanceColor = sev === 'danger' ? '#b91c1c' : sev === 'warn' ? '#92400e' : '#047857';

            return `
                <tr>
                    <td>${escapeHTML(m.machine_code || '-')}</td>
                    <td>${escapeHTML(m.machine_name || '-')}</td>
                    <td>${escapeHTML(m.category || '-')}</td>
                    <td>${escapeHTML(m.supplier_name || '-')}</td>
                    <td>${escapeHTML(m.status || '-')}</td>
                    <td>${formatDate(m.last_maintenance_date)}</td>
                    <td style="color:${maintenanceColor}">${formatDate(m.next_maintenance_date)}</td>
                    <td>${Number(m.operating_hours || 0).toFixed(2)}</td>
                    <td class="actions">
                        <button class="btn" onclick="openMachineProfile(${m.machine_id})">تفاصيل</button>
                    </td>
                </tr>`;
        }).join('');
        document.getElementById('countMachines').textContent = list.length;
        scheduleSecondaryRender(requestId);
        return;


    } catch (error) {
        console.error('Error fetching and rendering machines:', error);
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#b91c1c;">تعذر تحميل بيانات الآليات. يرجى إعادة المحاولة لاحقاً.</td></tr>';
        document.getElementById('countMachines').textContent = 0;
    }
}

/*************************************************************************
 * أدوات: تهريب محتوى HTML آمن
 *************************************************************************/
function escapeHTML(s) { if (s == null) return ''; return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

/*************************************************************************
 * CRUD للآليات (تم تعديلها لاستخدام API)
 *************************************************************************/

// 1. دالة مساعدة لجلب الموردين من API
async function fetchSuppliers() {
    try {
        // نستخدم راوت /api/suppliers لجلب جميع الموردين
        const response = await fetch('/api/suppliers');
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

function openEditMachine(id) {
    const m = machines.find(x => x.machine_id === id);
    if (!m) return alert('لم يتم العثور على الآلية');
    openModal(renderMachineForm(m));
}

// 2. دالة الحذف (تستخدم API الآن)
async function deleteMachine(id) {
    if (!confirm('هل أنت متأكد من حذف الآلية؟ سيؤدي هذا إلى حذف جميع سجلات الصيانة المرتبطة بها (بسبب ON DELETE CASCADE).')) return;
    
    try {
        const response = await fetch(`/api/machines/${id}`, { method: 'DELETE' });
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
    const modalContent = document.createElement('div');
    modalContent.className = 'machine-form-shell';
    modalContent.innerHTML = `
      <h2>${isEdit ? 'تعديل بيانات الآلية' : 'إضافة آلية جديدة'}</h2>
      <div id="machineFormBody">
        <div class="modal-loading-state">جارٍ تحميل الموردين...</div>
      </div>
      <div class="modal-actions">
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

            <div class="form-row form-row-wide"><label>المرفق</label><input id="f_facility" value="${escapeHTML(machine?.facility_name || '')}" /></div>
            <div class="form-row form-row-wide"><label>ملاحظات</label><textarea id="f_notes" rows="4">${escapeHTML(machine?.notes || '')}</textarea></div>
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

        const url = isEdit ? `/api/machines/${tempId}` : '/api/machines';
        const method = isEdit ? 'PUT' : 'POST';

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(machineData)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || `HTTP Error! Status: ${response.status}`);
            }

            alert(result.machine_code ? `${result.message}\nالكود: ${result.machine_code}` : (result.message || 'تم حفظ البيانات بنجاح.'));
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
    const h = canvas.height = 180;
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
document.getElementById('open-driver-page-btn')?.addEventListener('click', () => {
    window.location.href = '/driver.html';
});
document.getElementById('searchInput').addEventListener('input', debounce(renderTable, 250));
document.getElementById('filterCategory').addEventListener('change', renderTable);
document.getElementById('filterStatus').addEventListener('change', renderTable);
document.getElementById('sortSelect').addEventListener('change', renderTable);

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
renderTable();
// renderCards(); // سيتم استدعاؤها داخل renderTable
// renderStats(); // سيتم استدعاؤها داخل renderTable
// renderAlerts(); // سيتم استدعاؤها داخل renderTable
