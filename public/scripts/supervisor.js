/* ===== API Constants & Initialization ===== */
// العنوان الأساسي لجميع مكالمات API
const API_BASE_URL = '/api'; 

// مصفوفات للتخزين المؤقت لبيانات المخزون والموردين (لتغذية القوائم المنسدلة وتجنب التحميل المتكرر)
let INVENTORY_ITEMS = []; 
let SUPPLIERS = []; 
let supervisorSession = null;
let supervisorAccessBlocked = false;
let managedWarehouses = [];
let activeWarehouseId = null;
const SECTION_IDS = ['inventory', 'requests', 'suppliers', 'transactions'];
const NAV_SECTION_MAP = {
    'nav-inventory': 'inventory',
    'nav-requests': 'requests',
    'nav-suppliers': 'suppliers',
    'nav-transactions': 'transactions'
};

// عند تحميل الصفحة، ابدأ بتحميل وعرض جميع البيانات
document.addEventListener('DOMContentLoaded', async () => {
    ensurePurchaseRequestButton();
    applyStaticLabels();

    const warehousesNavButton = document.getElementById('nav-warehouses');
    if (warehousesNavButton) {
        warehousesNavButton.hidden = true;
    }

    document.getElementById('nav-inventory')?.addEventListener('click', () => show('inventory'));
    document.getElementById('nav-requests')?.addEventListener('click', () => show('requests'));
    document.getElementById('nav-suppliers')?.addEventListener('click', () => show('suppliers'));
    document.getElementById('nav-transactions')?.addEventListener('click', () => show('transactions'));
    document.getElementById('searchItem')?.addEventListener('input', renderItems);
    document.getElementById('open-add-item-btn')?.addEventListener('click', openAddItemModal);
    document.getElementById('open-issue-btn')?.addEventListener('click', openIssueModal);
    document.getElementById('open-purchase-request-btn')?.addEventListener('click', openPurchaseRequestModal);
    document.getElementById('open-new-request-btn')?.addEventListener('click', openNewRequestModal);
    document.getElementById('refresh-requests-btn')?.addEventListener('click', renderRequests);
    document.getElementById('warehouse-selector')?.addEventListener('change', async (event) => {
        activeWarehouseId = Number.parseInt(event.target.value, 10) || null;
        syncWarehouseContext();
        await renderAll();
    });

    const hasValidSession = await verifySupervisorSession();
    if (!hasValidSession) {
        return;
    }

    if (supervisorAccessBlocked) {
        renderWarehouseAssignmentRequiredState();
        return;
    }

    const hasManagedWarehouses = await loadManagedWarehouses();
    if (!hasManagedWarehouses) {
        renderWarehouseAssignmentRequiredState();
        return;
    }

    syncWarehouseContext();
    await renderAll();
    setActiveNav('inventory');
});

async function verifySupervisorSession() {
    try {
        const response = await fetch('/api/session-status', {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache'
            }
        });

        if (!response.ok) {
            window.location.replace('/login.html');
            return false;
        }

        const data = await response.json();
        if (!data?.success || data?.session?.role !== 'supervisor') {
            window.location.replace('/login.html');
            return false;
        }

        supervisorSession = data.session;
        supervisorAccessBlocked = !Boolean(data.session.hasWarehouseAssignment);
        return true;
    } catch (error) {
        window.location.replace('/login.html');
        return false;
    }
}

async function loadManagedWarehouses() {
    const result = await fetchData('/warehouses/managed', { skipWarehouseContext: true });
    managedWarehouses = Array.isArray(result?.warehouses) ? result.warehouses : [];

    if (!managedWarehouses.length) {
        activeWarehouseId = null;
        syncWarehouseContext();
        return false;
    }

    const warehouseIds = managedWarehouses
        .map((warehouse) => Number.parseInt(warehouse?.id, 10))
        .filter((warehouseId) => Number.isInteger(warehouseId) && warehouseId > 0);

    if (!warehouseIds.includes(activeWarehouseId)) {
        activeWarehouseId = warehouseIds[0] || null;
    }

    syncWarehouseContext();
    return true;
}

function getActiveWarehouse() {
    return managedWarehouses.find((warehouse) => Number.parseInt(warehouse?.id, 10) === activeWarehouseId) || null;
}

function syncWarehouseContext() {
    const selector = document.getElementById('warehouse-selector');
    const warehouseName = document.getElementById('warehouse-context-name');
    const warehouseCopy = document.getElementById('warehouse-context-copy');
    const activeWarehouse = getActiveWarehouse();

    if (selector) {
        selector.innerHTML = managedWarehouses
            .map((warehouse) => {
                const warehouseId = Number.parseInt(warehouse?.id, 10);
                const selectedAttr = warehouseId === activeWarehouseId ? 'selected' : '';
                const codeText = warehouse?.code ? ` - ${escapeHtml(warehouse.code)}` : '';
                return `<option value="${warehouseId}" ${selectedAttr}>${escapeHtml(warehouse.name || 'مستودع بدون اسم')}${codeText}</option>`;
            })
            .join('');
        selector.disabled = managedWarehouses.length <= 1;
    }

    if (warehouseName) {
        warehouseName.textContent = activeWarehouse?.name || 'لا يوجد مستودع مرتبط';
    }

    if (warehouseCopy) {
        warehouseCopy.textContent = activeWarehouse
            ? `يعرض الآن بيانات ${activeWarehouse.name} فقط، ويمكنك التبديل بين ${managedWarehouses.length} مستودع/مستودعات مرتبطة بحسابك.`
            : 'سيتم عرض المخزون والطلبات والحركات الخاصة بالمستودع المختار فقط.';
    }

    setText(
        '.container > .row .small',
        activeWarehouse
            ? `أنت تعمل الآن على ${activeWarehouse.name} فقط. كل عمليات المخزون والطلبات والحركات في هذه الصفحة معزولة حسب المستودع المختار.`
            : 'سيتم عرض بيانات المستودع المختار فقط داخل هذه الصفحة.'
    );
}

function renderWarehouseAssignmentRequiredState() {
    const container = document.querySelector('.container');
    const anchorCard = document.getElementById('inventory');
    if (!container || !anchorCard) {
        return;
    }

    document.getElementById('warehouse-context-card')?.classList.add('hidden');

    SECTION_IDS.forEach((sectionId) => document.getElementById(sectionId)?.classList.add('hidden'));

    ['nav-inventory', 'nav-requests', 'nav-suppliers', 'nav-warehouses', 'nav-transactions'].forEach((buttonId) => {
        const button = document.getElementById(buttonId);
        if (!button) return;
        button.disabled = true;
        button.setAttribute('aria-disabled', 'true');
    });

    ['open-add-item-btn', 'open-issue-btn', 'open-purchase-request-btn', 'open-new-request-btn', 'refresh-requests-btn']
        .forEach((buttonId) => {
            const button = document.getElementById(buttonId);
            if (!button) return;
            button.disabled = true;
            button.setAttribute('aria-disabled', 'true');
        });

    setText('.container > .row .small', 'تم تسجيل الدخول بنجاح، لكن لن تظهر بيانات المستودع حتى تربط الإدارة حسابك بمستودع واحد على الأقل.');

    let pendingCard = document.getElementById('warehouse-assignment-block');
    if (!pendingCard) {
        pendingCard = document.createElement('div');
        pendingCard.id = 'warehouse-assignment-block';
        pendingCard.className = 'card access-pending-card';
        container.insertBefore(pendingCard, anchorCard);
    }

    pendingCard.innerHTML = `
        <div class="access-pending-eyebrow">حالة الوصول</div>
        <h3 class="access-pending-title">لم يتم ربط حسابك بأي مستودع بعد</h3>
        <p class="access-pending-copy">يمكنك الدخول إلى الصفحة، لكن تم إيقاف عرض البيانات والعمليات التشغيلية مؤقتًا حتى تقوم الإدارة بربطك بمستودع واحد على الأقل.</p>
        <div class="access-pending-note">عدد المستودعات المرتبطة حالياً: ${Number(supervisorSession?.assignedWarehousesCount || 0)}</div>
    `;
}

function ensurePurchaseRequestButton() {
    const actionsRow = document.querySelector('#inventory .inventory-toolbar-actions');
    if (!actionsRow || document.getElementById('open-purchase-request-btn')) {
        return;
    }

    const issueButton = document.getElementById('open-issue-btn');
    const purchaseButton = document.createElement('button');
    purchaseButton.id = 'open-purchase-request-btn';
    purchaseButton.type = 'button';
    purchaseButton.className = 'btn secondary';
    purchaseButton.textContent = 'طلب شراء';

    if (issueButton?.nextSibling) {
        issueButton.parentNode.insertBefore(purchaseButton, issueButton.nextSibling);
        return;
    }

    actionsRow.appendChild(purchaseButton);
}

function setText(selector, text) {
    const element = document.querySelector(selector);
    if (element) {
        element.textContent = text;
    }
}

function setPlaceholder(id, text) {
    const element = document.getElementById(id);
    if (element) {
        element.placeholder = text;
    }
}

function setTableHeaders(tableId, labels) {
    const headers = document.querySelectorAll(`#${tableId} thead th`);
    headers.forEach((header, index) => {
        if (labels[index]) {
            header.textContent = labels[index];
        }
    });
}

function applyStaticLabels() {
    document.title = 'نظام مستودع الصيانة البحرية';

    setText('.container > h2', 'نظام مستودع الصيانة البحرية');
    setText('.container > .row .small', 'لإضافة مرفقات مثل صور القطع أو الفواتير استخدم نماذج الإضافة أو الاستلام أو الصرف داخل الصفحة.');

    setText('#nav-inventory', 'المخزون');
    setText('#nav-requests', 'طلبات المواد');
    setText('#nav-suppliers', 'الموردين');
    setText('#nav-warehouses', 'المستودعات');
    setText('#nav-transactions', 'الحركات');

    setText('#inventory h3', 'المخزون');
    setText('#requests h3', 'طلبات المواد');
    setText('#suppliers h3', 'الموردين');
    setText('#transactions h3', 'حركات المخزون');

    setText('#open-add-item-btn', 'إضافة / استلام مادة');
    setText('#open-issue-btn', 'صرف مادة');
    setText('#open-purchase-request-btn', 'طلب شراء');
    setText('#open-new-request-btn', 'إنشاء طلب');
    setText('#refresh-requests-btn', 'تحديث');
    setPlaceholder('searchItem', 'ابحث عن مادة أو كود');

    setTableHeaders('itemsTable', ['الكود', 'المادة', 'الكمية', 'الحد الأدنى', 'الموقع (مخزن/رف/خانة)', 'صور', 'إجراءات']);
    setTableHeaders('reqTable', ['رقم', 'المادة', 'الكمية', 'الطالب', 'الحالة', 'التاريخ', 'إجراءات']);
    setTableHeaders('supTable', ['الاسم', 'الهاتف', 'المسؤول', 'العنوان', '']);
    setTableHeaders('transTable', ['رقم', 'النوع', 'المادة', 'الكمية', 'المرجع', 'الموظف', 'التاريخ', '']);
}

function getSupplierIdentifier(supplier) {
    const rawId = supplier?.supplier_id ?? supplier?.id ?? null;
    const parsedId = Number(rawId);
    return Number.isFinite(parsedId) ? parsedId : null;
}

function getSupplierDisplayName(supplier) {
    return String(supplier?.name || supplier?.supplier_name || '').trim();
}


/* ===== Utility Functions (Alerts, Modals, Network) ===== */

// وظيفة عرض التنبيهات على الشاشة
function showAlert(message, type = 'success') {
    const alertEl = document.getElementById('lowStockAlert');
    alertEl.classList.remove('hidden', 'alert-success', 'alert-danger', 'alert-warning');
    alertEl.classList.add('alert', `alert-${type}`);
    alertEl.textContent = message;
    setTimeout(() => {
        alertEl.classList.add('hidden');
    }, 5000);
}

function appendWarehouseContext(endpoint) {
    if (!activeWarehouseId) {
        return endpoint;
    }

    const separator = endpoint.includes('?') ? '&' : '?';
    return `${endpoint}${separator}warehouse_id=${encodeURIComponent(activeWarehouseId)}`;
}

// دالة مساعدة لجلب البيانات من الـ API (GET Requests)
async function fetchData(endpoint, options = {}) {
    try {
        const finalEndpoint = options.skipWarehouseContext ? endpoint : appendWarehouseContext(endpoint);
        const response = await fetch(`${API_BASE_URL}${finalEndpoint}`);
        const result = await response.json();
        if (!response.ok || !result.success) {
            // في حالة عدم النجاح (status: 200, success: false)، أو خطأ HTTP (response.ok: false)
            throw new Error(result.message || 'فشل في جلب البيانات من الخادم.');
        }
        return result;
    } catch (error) {
        console.error(`Error fetching ${endpoint}:`, error);
        showAlert(`خطأ في جلب البيانات: ${error.message}`, 'danger');
        return null;
    }
}

// دالة مساعدة لإرسال البيانات إلى الـ API (POST Requests)
async function postData(endpoint, data, options = {}) {
    try {
        const payload = options.skipWarehouseContext || !activeWarehouseId
            ? { ...(data || {}) }
            : { ...(data || {}), warehouse_id: activeWarehouseId };
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'POST', // نستخدم POST للتعديل والإضافة في هذا النظام
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'فشل تنفيذ العملية على الخادم.');
        }
        return result;
    } catch (error) {
        console.error(`Error posting to ${endpoint}:`, error);
        showAlert(`خطأ في تنفيذ العملية: ${error.message}`, 'danger');
        return null;
    }
}

// الوظائف الأصلية للـ Modal و الـ HTML Escaping (تم الحفاظ عليها)
function modal(html) { document.getElementById('modalRoot').innerHTML = `<div class='modal-bg'> <div class='modal'>${html}</div> </div>`; }
function closeModal() { document.getElementById('modalRoot').innerHTML = ''; }
function readFileAsDataURL(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); }); }
function escapeHtml(s) { if (!s) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }


/* ===== Section Navigation & Global Render (العرض الشامل) ===== */
function setActiveNav(activeSectionId) {
    Object.entries(NAV_SECTION_MAP).forEach(([buttonId, sectionId]) => {
        const button = document.getElementById(buttonId);
        if (!button) return;

        const isActive = sectionId === activeSectionId;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
    });

    const warehousesButton = document.getElementById('nav-warehouses');
    if (warehousesButton) {
        warehousesButton.classList.remove('is-active');
        warehousesButton.setAttribute('aria-pressed', 'false');
    }
}

function animateSection(sectionEl) {
    sectionEl.classList.remove('section-reveal');
    void sectionEl.offsetWidth;
    sectionEl.classList.add('section-reveal');
}

function show(id) { 
    SECTION_IDS.forEach(sectionId => document.getElementById(sectionId)?.classList.add('hidden'));

    const activeSection = document.getElementById(id);
    activeSection?.classList.remove('hidden');
    if (activeSection) {
        animateSection(activeSection);
    }

    setActiveNav(id);
}

async function renderAll() { 
    // يجب أولاً جلب البيانات الضرورية للقوائم المنسدلة (المخزون والموردين)
    await populateDropdowns(); 
    
    // عرض الجداول
    await renderItems(); 
    await renderRequests(); 
    await renderSuppliers(); 
    await renderTransactions(); 
    
    // التحقق من انخفاض المخزون بعد تحميله
    checkLowStock(); 
}

// دالة لجلب البيانات الأساسية للقوائم المنسدلة وتحديث الذاكرة المؤقتة
async function populateDropdowns() {
    // يجب أن تكون '/inventory/items' نقطة نهاية موجودة
    const itemData = await fetchData('/inventory/items'); 
    if (itemData) {
        INVENTORY_ITEMS = itemData.items;
    }
    // يجب أن تكون '/suppliers' نقطة نهاية موجودة
    const supData = await fetchData('/suppliers'); 
    if (supData) {
        SUPPLIERS = supData.suppliers;
    }
}


/* ===== Inventory Items (المخزون) API Functions ===== */

function checkLowStock() { 
    const low = INVENTORY_ITEMS.filter(i => i.current_qty <= i.min_stock); 
    const alertEl = document.getElementById('lowStockAlert'); 
    
    alertEl.classList.remove('alert-warning', 'alert-success', 'hidden'); 
    
    if (low.length > 0) { 
        alertEl.classList.remove('hidden'); 
        alertEl.textContent = `تنبيه: ${low.length} مادة وصلت للحد الأدنى أو أقل.`; 
        alertEl.classList.add('alert-warning');
    } else { 
        alertEl.classList.add('hidden'); 
        alertEl.textContent = ''; 
    } 
}

async function renderItems() {
    const tbody = document.querySelector('#itemsTable tbody'); 
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">جاري تحميل المخزون...</td></tr>';
    
    const data = await fetchData('/inventory/items');
    if (!data) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">فشل تحميل بيانات المخزون.</td></tr>';
        return;
    }
    
    INVENTORY_ITEMS = data.items;
    const q = document.getElementById('searchItem').value.trim().toLowerCase(); 
    tbody.innerHTML = ''; 
    
    INVENTORY_ITEMS.filter(it => !q || it.item_name.toLowerCase().includes(q) || it.item_code.toLowerCase().includes(q)).forEach(it => {
        // الـ images تأتي كـ مصفوفة جاهزة من الـ API
        const imgs = (it.images || []).map(src => `<img src="${src}" class="img-thumb">`).join(' '); 
        const locationText = `${it.warehouse_name || 'غير محدد'}/${it.rack || '-'}/${it.location_code || '-'}`;
        
        const tr = document.createElement('tr'); 
        tr.innerHTML = `
            <td>${escapeHtml(it.item_code)}</td>
            <td style="cursor:pointer;color:#2980b9" onclick="openEditItemModal(${it.item_id})">${escapeHtml(it.item_name)}</td>
            <td>${it.current_qty} ${escapeHtml(it.unit)}</td>
            <td>${it.min_stock}</td>
            <td>${locationText}</td>
            <td>${imgs}</td>
            <td><button class='btn' onclick='openEditItemModal(${it.item_id})'>تعديل</button></td>
        `; 
        tbody.appendChild(tr);
    });
    checkLowStock();
}

function openAddItemModal() {
    modal(`<h3>إضافة مادة جديدة بالكامل</h3>
        <input id='itm_code' placeholder='كود المادة أو بادئة مثل OC - اتركه فارغًا للتوليد التلقائي'>
        <input id='itm_name' placeholder='اسم المادة' required>
        <input id='itm_qty' type='number' placeholder='الكمية الأولية (استلام)' value='0' min='0' step='0.01'>
        <input id='itm_min' type='number' placeholder='الحد الأدنى' value='5' min='0'>
        <input id='itm_unit' placeholder='الوحدة (مثال: قطعة)' value='قطعة'>
        <div style='margin-top:10px;padding:10px 12px;border-radius:12px;background:rgba(56, 208, 193, 0.08);border:1px solid rgba(56, 208, 193, 0.18);font-size:13px;line-height:1.8'>
            يتم اختيار موقع التخزين تلقائيًا داخل المستودع النشط حسب السعة المتاحة عند إدخال كمية أولية أكبر من صفر.
        </div>
        <div style='display:flex;gap:8px;justify-content:flex-end;margin-top:15px'>
            <button class='btn btn-primary' onclick='saveNewItem()'>➕ حفظ وإضافة</button>
            <button class='btn secondary' onclick='closeModal()'>إلغاء</button>
        </div>
    `);
}

async function saveNewItem() {
    const code = document.getElementById('itm_code').value.trim();
    const name = document.getElementById('itm_name').value.trim();
    const qty = Number(document.getElementById('itm_qty').value);
    const min = Number(document.getElementById('itm_min').value);
    const unit = document.getElementById('itm_unit').value || 'قطعة';
    const files = document.getElementById('itm_images').files;

    if (!name) { 
        showAlert('الرجاء إدخال اسم المادة فقط، ويمكن ترك الكود فارغًا أو كتابة بادئة مثل OC.', 'warning');
        return; 
    }
    
    const payload = { code, name, qty, min, unit, user: 'مشرف' };
    
    // معالجة الصور وإرسالها كـ JSON string
    if (files && files.length) {
        try {
            const readers = []; 
            for (let i = 0; i < files.length; i++) { 
                readers.push(readFileAsDataURL(files[i])); 
            }
            const results = await Promise.all(readers);
            payload.images = JSON.stringify(results); 
        } catch (e) {
             showAlert('فشل معالجة الصور.', 'danger');
             return;
        }
    }

    // استخدام API إضافة مادة جديدة
    const result = await postData('/inventory/new', payload);
    if (result) {
        const locationSuffix = result.location_label ? ` الموقع: ${result.location_label}` : '';
        showAlert(`${result.message}${result.item_code ? ` الكود: ${result.item_code}` : ''}${locationSuffix}`);
        closeModal();
        renderAll();
    }
}

/**
 * دالة جديدة: تفتح نموذج تعديل البيانات الوصفية للمادة
 */
function openEditItemModal(id) {
    const item = INVENTORY_ITEMS.find(i => i.item_id === id);
    if (!item) return showAlert('المادة غير موجودة في المخزون المؤقت.', 'danger');
    
    // عرض الصور الحالية
    modal(`<h3>تعديل بيانات المادة: ${escapeHtml(item.item_name)}</h3>
        <input id='edit_code' placeholder='كود المادة' value='${escapeHtml(item.item_code)}' required>
        <input id='edit_name' placeholder='اسم المادة' value='${escapeHtml(item.item_name)}' required>
        <input id='edit_min' type='number' placeholder='الحد الأدنى' value='${item.min_stock}' min='0'>
        <input id='edit_unit' placeholder='الوحدة (مثال: قطعة)' value='${escapeHtml(item.unit)}'>
        
        <label class='small'>الموقع الحالي (غير قابل للتعديل حالياً في هذا النموذج): ${item.location_code || 'غير محدد'}</label>
        
        <hr style="margin: 10px 0;">    
        <div style='display:flex;gap:8px;justify-content:flex-end;margin-top:15px'>
            <button class='btn btn-primary' onclick='saveEditItem(${item.item_id})'>💾 حفظ التعديلات</button>
            <button class='btn secondary' onclick='closeModal()'>إلغاء</button>
        </div>
    `);
}

/**
 * دالة جديدة: لحفظ تعديلات البيانات الوصفية للمادة عبر API
 */
async function saveEditItem(id) {
    const code = document.getElementById('edit_code').value.trim();
    const name = document.getElementById('edit_name').value.trim();
    // التأكد من أن القيمة رقمية
    const min_stock = parseFloat(document.getElementById('edit_min').value); 
    const unit = document.getElementById('edit_unit').value || 'قطعة';
    const files = document.getElementById('edit_images')?.files || null;

    if (!name || !code || isNaN(min_stock)) { 
        showAlert('الرجاء إدخال كود واسم المادة والحد الأدنى بشكل صحيح.', 'warning');
        return; 
    }
    
    // بناء حمولة البيانات
    const payload = { code, name, min_stock, unit };
    
    // معالجة الصور الجديدة
    if (files && files.length > 0) {
        try {
            const readers = []; 
            for (let i = 0; i < files.length; i++) { 
                readers.push(readFileAsDataURL(files[i])); 
            }
            const results = await Promise.all(readers);
            // new_images هو الحقل المتوقع في API التعديل
            payload.new_images = JSON.stringify(results); 
        } catch (e) {
             showAlert('فشل معالجة الصور المرفقة.', 'danger');
             return;
        }
    }

    // استدعاء API تعديل المادة
    const result = await postData(`/inventory/edit/${id}`, payload);
    if (result) {
        showAlert(result.message);
        closeModal();
        renderAll();
    }
}


/* ===== استلام/صرف (Issue/Receive Modals) API Functions ===== */

function openIssueModal() {
    if (INVENTORY_ITEMS.length === 0) {
        return showAlert('يجب تحميل بيانات المخزون أولاً.', 'warning');
    }
    const itemOptions = INVENTORY_ITEMS.map(i => `<option value='${i.item_id}'>${escapeHtml(i.item_name)} (${i.item_code}) - متوفر: ${i.current_qty}</option>`).join('');
    
    modal(`<h3>صرف مادة من المخزون</h3>
        <select id='iss_item' required><option value=''>--- اختر المادة ---</option>${itemOptions}</select>
        <input id='iss_qty' type='number' placeholder='الكمية المراد صرفها' min='0.01' step='0.01' required>
        <input id='iss_ref' placeholder='مرجع (طلب/سند صرف/عمل صيانة)'>
        <input id='iss_user' placeholder='اسم الموظف الذي قام بالصرف' value='مشرف النظام'>
       
        <div style='display:flex;gap:8px;justify-content:flex-end;margin-top:15px'>
            <button class='btn btn-warning' onclick='saveIssue()'>صرف المادة</button>
            <button class='btn secondary' onclick='closeModal()'>إلغاء</button>
        </div>`);
}

async function saveIssue() { 
    const id = Number(document.getElementById('iss_item').value); 
    const qty = Number(document.getElementById('iss_qty').value);
    const ref = document.getElementById('iss_ref').value || 'صرف يدوي'; 
    const user = document.getElementById('iss_user').value || 'مشرف النظام'; 
    const file = document.getElementById('iss_file').files[0];
    
    if (!qty || !id) { 
        showAlert('الرجاء اختيار مادة وإدخال كمية صحيحة.', 'warning'); 
        return; 
    } 

    const it = INVENTORY_ITEMS.find(x => x.item_id === id); 
    if (it && it.current_qty < qty && !confirm(`المخزون المتوفر (${it.current_qty}) غير كافٍ لصرف الكمية المطلوبة (${qty}). هل تريد السماح بالرصيد السالب؟`)) {
        return;
    }
    
    const payload = { item_id: id, qty, reference: ref, user };
    
    if (file) {
        try {
            const dataURL = await readFileAsDataURL(file);
            payload.attachment_paths = JSON.stringify([dataURL]);
        } catch (e) {
             showAlert('فشل معالجة المرفق.', 'danger');
             return;
        }
    }
    
    // استخدام API تسجيل الصرف
    const result = await postData('/inventory/issue', payload);
    
    if (result) {
        showAlert(result.message, 'warning');
        closeModal();
        renderAll();
    }
}


/* ===== Suppliers (الموردون) API Functions ===== */

function openPurchaseRequestModal() {
    if (false) {
        showAlert('يجب تحميل بيانات المخزون أولًا قبل إنشاء طلب شراء.', 'warning');
        return;
    }

    if (!SUPPLIERS.length) {
        showAlert('يجب تحميل الموردين أولًا قبل إنشاء طلب شراء.', 'warning');
        return;
    }

    const itemOptions = INVENTORY_ITEMS
        .map((item) => {
            const itemId = Number(item.item_id);
            if (!Number.isFinite(itemId)) {
                return '';
            }

            return `<option value='${itemId}'>${escapeHtml(item.item_name)} (${escapeHtml(item.item_code)})</option>`;
        })
        .filter(Boolean)
        .join('');

    const supplierOptions = SUPPLIERS
        .map((supplier) => {
            const supplierId = getSupplierIdentifier(supplier);
            const supplierName = escapeHtml(getSupplierDisplayName(supplier));
            if (!supplierId || !supplierName) {
                return '';
            }

            return `<option value='${supplierId}'>${supplierName}</option>`;
        })
        .filter(Boolean)
        .join('');

    modal(`<h3>طلب شراء جديد</h3>
        <select id='purchase_item_id' required>
            <option value=''>--- اختر المادة من المخزون ---</option>
            ${itemOptions}<option value='__other__'>قطع أخرى</option>
        </select>
        <input id='purchase_custom_item_name' class='hidden' placeholder='اسم القطعة المطلوبة'>
        <input id='purchase_qty' type='number' placeholder='الكمية المطلوبة' min='0.01' step='0.01' required>
        <select id='purchase_supplier_id' required>
            <option value=''>--- اختر المورد المقترح ---</option>
            ${supplierOptions}
        </select>

        <div style='display:flex;gap:8px;justify-content:flex-end;margin-top:15px'>
            <button class='btn btn-primary' onclick='savePurchaseRequest()'>إرسال الطلب</button>
            <button class='btn secondary' onclick='closeModal()'>إلغاء</button>
        </div>`);

    document.getElementById('purchase_item_id')?.addEventListener('change', togglePurchaseCustomItemField);
    togglePurchaseCustomItemField();
}

function togglePurchaseCustomItemField() {
    const itemSelector = document.getElementById('purchase_item_id');
    const customItemField = document.getElementById('purchase_custom_item_name');
    if (!itemSelector || !customItemField) {
        return;
    }

    const isOtherSelected = itemSelector.value === '__other__';
    customItemField.classList.toggle('hidden', !isOtherSelected);
    customItemField.required = isOtherSelected;

    if (!isOtherSelected) {
        customItemField.value = '';
    }
}

async function savePurchaseRequest() {
    const selectedItemValue = document.getElementById('purchase_item_id')?.value || '';
    const isCustomItem = selectedItemValue === '__other__';
    const item_id = isCustomItem ? null : Number(selectedItemValue);
    const item_name = (document.getElementById('purchase_custom_item_name')?.value || '').trim();
    const quantity = Number(document.getElementById('purchase_qty')?.value);
    const supplier_id = Number(document.getElementById('purchase_supplier_id')?.value);

    if ((!isCustomItem && !item_id) || !quantity || quantity <= 0 || !supplier_id || (isCustomItem && !item_name)) {
        showAlert('يرجى اختيار المادة والكمية والمورد المقترح.', 'warning');
        return;
    }

    const result = await postData('/purchase-requests', {
        item_id,
        item_name,
        quantity,
        supplier_id
    });

    if (result) {
        showAlert(result.message, 'success');
        closeModal();
    }
}

async function renderSuppliers() { 
    const tbody = document.querySelector('#supTable tbody'); 
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">جاري تحميل الموردين...</td></tr>';
    
    const data = await fetchData('/suppliers');
    if (!data) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">فشل تحميل بيانات الموردين.</td></tr>';
        return;
    }
    
    SUPPLIERS = data.suppliers; 
    tbody.innerHTML = '';
    
    // ملاحظة: الحقول في الـ API هي name, primary_phone, contact_person, address
    SUPPLIERS.forEach(s => { 
        const tr = document.createElement('tr'); 
        tr.innerHTML = `
            <td>${escapeHtml(s.name)}</td>
            <td>${escapeHtml(s.primary_phone || '-')}</td>
            <td>${escapeHtml(s.contact_person || '-')}</td>
            <td>${escapeHtml(s.address || '-')}</td>
            <td><button class='btn' onclick='editSupplier(${s.supplier_id})'>تعديل</button></td>
        `; 
        tbody.appendChild(tr); 
    }); 
}

function editSupplier(id) { 
    // يجب استخدام supplier_id من قاعدة البيانات
    const s = SUPPLIERS.find(x => x.supplier_id === id); 
    if (!s) return showAlert('المورد غير موجود.', 'danger');
    
    modal(`<h3>تعديل مورد</h3>
        <input id='su_name' value='${escapeHtml(s.name)}' placeholder='اسم المورد'>
        <input id='su_phone' value='${escapeHtml(s.primary_phone || '')}' placeholder='هاتف أساسي'>
        <input id='su_contact' value='${escapeHtml(s.contact_person || '')}' placeholder='مسؤول الاتصال'>
        <input id='su_addr' value='${escapeHtml(s.address || '')}' placeholder='عنوان المورد'>
        
        <div style='display:flex;gap:8px;justify-content:flex-end;margin-top:15px'>
            <button class='btn btn-primary' onclick='saveEditSupplier(${id})'>حفظ التعديلات</button>
            <button class='btn secondary' onclick='closeModal()'>إلغاء</button>
        </div>`);
}

async function saveEditSupplier(id) { 
    const payload = {
        name: document.getElementById('su_name').value,
        primary_phone: document.getElementById('su_phone').value,
        contact_person: document.getElementById('su_contact').value,
        address: document.getElementById('su_addr').value
    };
    
    // استخدام API تعديل المورد
    // ملاحظة: يجب أن يقبل /suppliers/edit/:id الحقول الأربعة المطلوبة
    const result = await postData(`/suppliers/edit/${id}`, payload);
    
    if (result) {
        showAlert(result.message);
        closeModal();
        renderAll();
    }
}


/* ===== Transactions (الحركات) API Functions ===== */

async function renderTransactions() { 
    const tbody = document.querySelector('#transTable tbody'); 
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">جاري تحميل سجل الحركات...</td></tr>';
    
    // يجب أن تكون '/inventory/transactions' نقطة نهاية موجودة
    const data = await fetchData('/inventory/transactions');
    if (!data) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">فشل تحميل سجل الحركات.</td></tr>';
        return;
    }
    
    tbody.innerHTML = '';
    
    data.transactions.forEach(t => { 
        const dateString = new Date(t.date).toLocaleString('ar-SY', { dateStyle: 'short', timeStyle: 'short' });
        const qtyDisplay = t.type === 'صرف' ? `<span style="color:red;font-weight:bold">${t.qty}</span>` : `<span style="color:green;font-weight:bold">+${t.qty}</span>`;
        
        const tr = document.createElement('tr'); 
        tr.innerHTML = `
            <td>${t.id}</td>
            <td>${t.type}</td>
            <td>${escapeHtml(t.itemName || '-')}</td>
            <td>${qtyDisplay}</td>
            <td>${escapeHtml(t.reference || '')}</td>
            <td>${escapeHtml(t.user || '')}</td>
            <td>${dateString}</td>
            <td><button class='btn' onclick='openTransactionDetail(${t.id})'>تفاصيل</button></td>
        `; 
        tbody.appendChild(tr); 
    }); 
}

/* ===== Transactions (الحركات) API Functions (القسم الذي يحوي الوظيفة) ===== */

// ... (بقية دوال القسم)

async function openTransactionDetail(id) {
    const data = await fetchData(`/inventory/transactions/${id}`);
    
    if (!data || !data.transaction) {
        // رسالة الخطأ يتم عرضها بالفعل عبر showAlert في دالة fetchData
        return;
    }

    const t = data.transaction;
    const dateString = new Date(t.date).toLocaleString('ar-SY', { dateStyle: 'full', timeStyle: 'short' });
    const qtyChange = t.qty > 0 ? `+${t.qty}` : t.qty;
    
    // معالجة المرفقات
    let attachmentsHtml = 'لا توجد مرفقات.';
    if (t.attachment_paths) {
        try {
            // يتم افتراض أن attachment_paths هو JSON string لمسارات/DataURLs الصور
            const paths = JSON.parse(t.attachment_paths);
            if (Array.isArray(paths) && paths.length > 0) {
                attachmentsHtml = paths.map(src => `<img src="${src}" class="img-thumb" style="max-height: 100px; margin: 5px; border: 1px solid #ccc;">`).join('');
            }
        } catch (e) {
            console.error('Error parsing attachment_paths:', e);
            attachmentsHtml = 'فشل في عرض المرفقات.';
        }
    }

    modal(`
        <style>
            .detail-table th, .detail-table td { padding: 8px; text-align: right; border-bottom: 1px solid #eee; }
            .detail-table th { background-color: #f7f7f7; width: 30%; }
        </style>
        <h3>تفاصيل الحركة #${t.id}</h3>
        <table class="detail-table" style="width: 100%; border-collapse: collapse;">
            <tr><th>نوع الحركة</th><td>${escapeHtml(t.type)}</td></tr>
            <tr><th>المادة</th><td>${escapeHtml(t.item_name)} (${escapeHtml(t.item_code)})</td></tr>
            <tr><th>تغيّر الكمية</th><td><span style="font-weight: bold; color: ${t.qty > 0 ? 'green' : 'red'};">${qtyChange}</span> ${escapeHtml(t.unit)}</td></tr>
            <tr><th>التاريخ والوقت</th><td>${dateString}</td></tr>
            <tr><th>المرجع</th><td>${escapeHtml(t.reference || '-')}</td></tr>
            <tr><th>المستخدم</th><td>${escapeHtml(t.user || '-')}</td></tr>
        </table>
        
        <h4>المرفقات</h4>
        <div style="display: flex; flex-wrap: wrap; border: 1px dashed #ccc; padding: 10px; min-height: 50px; justify-content: center;">
            ${attachmentsHtml}
        </div>

        <div style='display:flex;gap:8px;justify-content:flex-end;margin-top:20px'>
            <button class='btn btn-primary' onclick='window.print()'>🖨️ طباعة السجل</button>
            <button class='btn secondary' onclick='closeModal()'>إغلاق</button>
        </div>
    `);
}


/* ===== Requests (الطلبات) API Functions ===== */

async function renderRequests() { 
    const tbody = document.querySelector('#reqTable tbody'); 
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">جاري تحميل الطلبات...</td></tr>';
    
    // يجب أن تكون '/requests' نقطة نهاية موجودة
    const data = await fetchData('/requests');
    if (!data) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">فشل تحميل قائمة الطلبات.</td></tr>';
        return;
    }
    
    tbody.innerHTML = '';
    const visibleRequests = (data.requests || []).filter((request) => !['بانتظار مدير الآليات', 'مرفوض من مدير الآليات'].includes(request.status));
    visibleRequests.forEach(r => { 
        const dateString = new Date(r.date).toLocaleString('ar-SY', { dateStyle: 'short', timeStyle: 'short' });
        
        const actionButton = r.status === 'جديد' ? 
            `<button class='btn btn-success' onclick='approveRequest(${r.id})'>اعتماد وصرف</button>` : ''; 
        
        const tr = document.createElement('tr'); 
        tr.innerHTML = `
            <td>${r.id}</td>
            <td>${escapeHtml(r.itemName)} (${escapeHtml(r.itemCode)})</td>
            <td>${r.qty}</td>
            <td>${escapeHtml(r.requested_by)}</td>
            <td>${r.status}</td>
            <td>${dateString}</td>
            <td>${actionButton}</td>
        `; 
        tbody.appendChild(tr); 
    }); 

    if (!visibleRequests.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">لا توجد إشعارات مواد بانتظار المستودع حاليًا.</td></tr>';
    }
}

function openNewRequestModal() {
    if (INVENTORY_ITEMS.length === 0) {
        return showAlert('يجب تحميل بيانات المخزون أولاً.', 'warning');
    }
    const itemOptions = INVENTORY_ITEMS.map(i => `<option value='${i.item_id}'>${escapeHtml(i.item_name)} (${i.item_code}) - متوفر: ${i.current_qty}</option>`).join('');
    
    modal(`<h3>إنشاء طلب مادة</h3>
        <select id='req_item' required><option value=''>--- اختر المادة ---</option>${itemOptions}</select>
        <input id='req_qty' type='number' placeholder='كمية الطلب' min='0.01' step='0.01' required>
        <input id='req_by' placeholder='اسم الطالب' required>
        <textarea id='req_justification' rows="3" placeholder='مبررات الطلب (اختياري)'></textarea>
        
        <div style='display:flex;gap:8px;justify-content:flex-end;margin-top:15px'>
            <button class='btn btn-primary' onclick='saveNewRequest()'>إرسال الطلب</button>
            <button class='btn secondary' onclick='closeModal()'>إلغاء</button>
        </div>`);
}

async function saveNewRequest() { 
    const id = Number(document.getElementById('req_item').value); 
    const quantity = Number(document.getElementById('req_qty').value);
    const requested_by = document.getElementById('req_by').value || 'فني'; 
    const justification = document.getElementById('req_justification').value; 
    
    if (!quantity || quantity <= 0 || !id || !requested_by) { 
        showAlert('الرجاء إدخال بيانات صحيحة وكاملة للطلب.', 'warning'); 
        return; 
    } 

    const payload = { item_id: id, quantity, requested_by, justification };
    
    // يجب أن تكون '/requests' نقطة نهاية موجودة
    const result = await postData('/requests', payload);
    
    if (result) {
        showAlert('تم إرسال طلب المادة بنجاح.');
        closeModal();
        renderAll();
    }
}

async function approveRequest(id) { 
    if (!confirm('هل أنت متأكد من اعتماد هذا الطلب وصرف الكمية المطلوبة؟ سيتم تحديث المخزون.')) {
        return;
    }
    
    const payload = { user: 'مشرف النظام' }; 
    
    // يجب أن تكون '/requests/approve/:id' نقطة نهاية موجودة
    const result = await postData(`/requests/approve/${id}`, payload);
    
    if (result) {
        showAlert(result.message, 'success');
        renderAll();
    }
}

function buildLocationOptionLabel(location) {
    const rack = String(location?.rack || '-').trim() || '-';
    const code = String(location?.code || '-').trim() || '-';
    const status = String(location?.status || '').trim();
    const capacity = Number(location?.capacity || 0);
    const usedCapacity = Number(location?.used_capacity || 0);
    const availableCapacity = Math.max(capacity - usedCapacity, 0);
    let label = `${rack} / ${code}`;

    if (capacity > 0) {
        label += ` - المتاح: ${availableCapacity} من ${capacity}`;
    }

    if (status) {
        label += ` - الحالة: ${status}`;
    }

    return label;
}

function renderExistingItemQuickSummary(items = []) {
    const select = document.getElementById('itm_existing_item');
    const summary = document.getElementById('itm_existing_summary');
    if (!summary) {
        return;
    }

    const selectedId = Number.parseInt(select?.value || '', 10);
    const selectedItem = items.find((item) => Number(item?.item_id) === selectedId);

    if (!selectedItem) {
        summary.innerHTML = `<span>اختر مادة من المخزون الحالي ليظهر ملخصها هنا.</span>`;
        return;
    }

    const qty = Number(selectedItem.current_qty || 0);
    const unit = escapeHtml(selectedItem.unit || 'وحدة');
    const locationLabel = [selectedItem.rack, selectedItem.location_code].filter(Boolean).join(' / ') || 'غير محدد';
    summary.innerHTML = `
        <div class='modal-summary-grid'>
            <div class='modal-summary-card'>
                <strong>الكود</strong>
                <span>${escapeHtml(selectedItem.item_code || '—')}</span>
            </div>
            <div class='modal-summary-card'>
                <strong>المتوفر</strong>
                <span>${escapeHtml(`${qty} ${unit}`)}</span>
            </div>
            <div class='modal-summary-card modal-summary-card-span-2'>
                <strong>الموقع الحالي</strong>
                <span>${escapeHtml(locationLabel)}</span>
            </div>
        </div>
    `;
}

function setAddItemModalMode(mode) {
    const normalizedMode = mode === 'existing' ? 'existing' : 'new';
    const modeInput = document.getElementById('itm_mode');
    const existingPanel = document.getElementById('itm_existing_panel');
    const newPanel = document.getElementById('itm_new_panel');
    const locationWrap = document.getElementById('itm_location_wrap');
    const submitLabel = document.getElementById('itm_submit_label');
    const qtyLabel = document.getElementById('itm_qty_label');
    const qtyInput = document.getElementById('itm_qty');
    const nameInput = document.getElementById('itm_name');

    if (modeInput) {
        modeInput.value = normalizedMode;
    }

    document.querySelectorAll('[data-add-item-mode]').forEach((button) => {
        button.classList.toggle('is-active', button.getAttribute('data-add-item-mode') === normalizedMode);
    });

    if (existingPanel) existingPanel.classList.toggle('hidden', normalizedMode !== 'existing');
    if (newPanel) newPanel.classList.toggle('hidden', normalizedMode !== 'new');
    if (locationWrap) locationWrap.classList.toggle('hidden', normalizedMode !== 'new');
    if (submitLabel) submitLabel.textContent = normalizedMode === 'existing' ? 'استلام الكمية' : 'حفظ وإضافة';
    if (qtyLabel) qtyLabel.textContent = normalizedMode === 'existing' ? 'الكمية المستلمة' : 'الكمية الأولية';
    if (qtyInput) qtyInput.placeholder = normalizedMode === 'existing' ? 'مثال: 10' : '0';
    if (nameInput) {
        if (normalizedMode === 'new') {
            nameInput.setAttribute('required', 'required');
        } else {
            nameInput.removeAttribute('required');
        }
    }
}

function bindAddItemModalEnhancements(existingItems = [], defaultMode = 'new') {
    const imagesInput = document.getElementById('itm_images');
    const imagesFeedback = document.getElementById('itm_images_feedback');
    const existingSelect = document.getElementById('itm_existing_item');

    if (imagesInput && imagesFeedback) {
        const syncFeedback = () => {
            const filesCount = imagesInput.files?.length || 0;
            imagesFeedback.textContent = filesCount
                ? `${filesCount} ملف${filesCount > 1 ? 'ات' : ''} مرفق`
                : 'لم يتم اختيار صور بعد';
        };

        imagesInput.addEventListener('change', syncFeedback);
        syncFeedback();
    }

    document.querySelectorAll('[data-add-item-mode]').forEach((button) => {
        button.addEventListener('click', () => {
            const nextMode = button.getAttribute('data-add-item-mode') || 'new';
            setAddItemModalMode(nextMode);
        });
    });

    if (existingSelect) {
        existingSelect.addEventListener('change', () => renderExistingItemQuickSummary(existingItems));
        renderExistingItemQuickSummary(existingItems);
    }

    setAddItemModalMode(defaultMode);
}

async function openAddItemModal() {
    if (!activeWarehouseId) {
        showAlert('يرجى اختيار المستودع النشط أولًا قبل إضافة مادة جديدة.', 'warning');
        return;
    }

    const [locationsResponse, itemsResponse] = await Promise.all([
        fetchData(`/locations?warehouseId=${encodeURIComponent(activeWarehouseId)}`, {
            skipWarehouseContext: true
        }),
        fetchData('/inventory/items')
    ]);

    const locations = Array.isArray(locationsResponse?.locations) ? locationsResponse.locations : [];
    const warehouseItems = Array.isArray(itemsResponse?.items) ? itemsResponse.items : [];
    if (warehouseItems.length) {
        INVENTORY_ITEMS = warehouseItems;
    }

    const selectableLocations = locations.filter((location) => String(location?.status || '').trim() !== 'محجوز');
    const autoSelectedLocationId = selectableLocations.length === 1
        ? Number.parseInt(selectableLocations[0]?.id, 10) || null
        : null;
    const warehouseName = escapeHtml(getActiveWarehouse()?.name || 'المستودع النشط');
    const existingItemOptions = warehouseItems.length
        ? warehouseItems.map((item) => {
            const availableText = `${Number(item.current_qty || 0)} ${item.unit || ''}`.trim();
            return `<option value='${item.item_id}'>${escapeHtml(item.item_name)} - ${escapeHtml(item.item_code || 'بدون كود')} - المتوفر: ${escapeHtml(availableText)}</option>`;
        }).join('')
        : `<option value=''>لا توجد مواد مسجلة في هذا المستودع بعد</option>`;
    const locationOptions = selectableLocations.length
        ? `
            ${autoSelectedLocationId ? '' : `<option value=''>اختيار تلقائي حسب السعة المتاحة</option>`}
            ${selectableLocations.map((location) => {
                const locationId = Number.parseInt(location?.id, 10);
                const isSelected = autoSelectedLocationId === locationId ? 'selected' : '';
                return `<option value='${locationId}' ${isSelected}>${escapeHtml(buildLocationOptionLabel(location))}</option>`;
            }).join('')}
        `
        : `<option value=''>لا يوجد موقع متاح حاليًا</option>`;
    const locationHint = autoSelectedLocationId
        ? 'تم اختيار الموقع الوحيد المتاح تلقائيًا، ويمكنك المتابعة مباشرة.'
        : selectableLocations.length
            ? 'يمكنك ترك الموقع فارغًا ليتم اختياره تلقائيًا حسب السعة المتاحة.'
            : 'لا يوجد موقع متاح الآن، لكن يمكنك إنشاء المادة بكمية صفر ثم إسناد موقع لها لاحقًا.';
    const defaultMode = warehouseItems.length ? 'existing' : 'new';

    modal(`
        <div class='modal-shell modal-shell-wide'>
            <div class='modal-header'>
                <div>
                    <div class='modal-kicker'>إدارة المخزون</div>
                    <h3>إضافة أو استلام مادة</h3>
                    <p class='modal-subtitle'>اختر مادة موجودة لاستلام كمية جديدة لها، أو أنشئ مادة جديدة بالكامل باسم مختلف.</p>
                </div>
                <div class='modal-badge'>${warehouseName}</div>
            </div>

            <form class='modal-form' autocomplete='off' onsubmit='event.preventDefault(); saveNewItem();'>
                <input id='itm_mode' type='hidden' value='${defaultMode}'>

                <div class='modal-mode-switch'>
                    <button type='button' class='modal-mode-option ${defaultMode === 'existing' ? 'is-active' : ''}' data-add-item-mode='existing' ${warehouseItems.length ? '' : 'disabled'}>
                        مادة موجودة
                    </button>
                    <button type='button' class='modal-mode-option ${defaultMode === 'new' ? 'is-active' : ''}' data-add-item-mode='new'>
                        مادة جديدة
                    </button>
                </div>

                <div id='itm_existing_panel' class='modal-section ${defaultMode === 'existing' ? '' : 'hidden'}'>
                    <div class='modal-section-head'>
                        <strong>اختيار من المواد الحالية</strong>
                        <span>سيتم تسجيل الكمية كعملية استلام للمادة المختارة.</span>
                    </div>
                    <div class='modal-form-grid modal-form-grid-tight'>
                        <div class='modal-field modal-field-span-2'>
                            <label for='itm_existing_item'>المادة الموجودة</label>
                            <select id='itm_existing_item' ${warehouseItems.length ? '' : 'disabled'}>
                                ${existingItemOptions}
                            </select>
                        </div>
                    </div>
                    <div id='itm_existing_summary' class='modal-inline-note'></div>
                </div>

                <div id='itm_new_panel' class='modal-section ${defaultMode === 'new' ? '' : 'hidden'}'>
                    <div class='modal-section-head'>
                        <strong>إنشاء مادة جديدة</strong>
                        <span>اكتب الاسم والكود والوحدة، ثم اختر الموقع إذا رغبت.</span>
                    </div>
                    <div class='modal-form-grid'>
                        <div class='modal-field modal-field-span-2'>
                            <label for='itm_name'>اسم المادة الجديدة</label>
                            <input id='itm_name' placeholder='اكتب اسم المادة الجديدة' autocomplete='off'>
                        </div>

                        <div class='modal-field'>
                            <label for='itm_code'>الكود</label>
                            <input id='itm_code' placeholder='يولد تلقائيًا أو اكتب بادئة مثل OC' autocomplete='off'>
                        </div>

                        <div class='modal-field'>
                            <label for='itm_unit'>الوحدة</label>
                            <input id='itm_unit' placeholder='مثال: قطعة' autocomplete='off'>
                        </div>

                        <div class='modal-field'>
                            <label for='itm_min'>الحد الأدنى</label>
                            <input id='itm_min' type='number' placeholder='5' min='0' step='1' inputmode='numeric' autocomplete='off'>
                        </div>

                        <div id='itm_location_wrap' class='modal-field modal-field-span-2'>
                            <label for='itm_location_id'>موقع التخزين</label>
                            <select id='itm_location_id' ${!selectableLocations.length ? 'disabled' : ''}>
                                ${locationOptions}
                            </select>
                            <div class='modal-field-help'>${escapeHtml(locationHint)}</div>
                        </div>
                    </div>
                </div>

                <div class='modal-form-grid modal-form-grid-tight'>
                    <div class='modal-field'>
                        <label id='itm_qty_label' for='itm_qty'>${defaultMode === 'existing' ? 'الكمية المستلمة' : 'الكمية الأولية'}</label>
                        <input id='itm_qty' type='number' placeholder='${defaultMode === 'existing' ? 'مثال: 10' : '0'}' min='0' step='0.01' inputmode='decimal' autocomplete='off'>
                    </div>

                    <div class='modal-field'>
                        <label for='itm_reference'>المرجع أو الملاحظة</label>
                        <input id='itm_reference' placeholder='مثال: استلام شراء أو دفعة جديدة' autocomplete='off'>
                    </div>

                    <div class='modal-field modal-field-span-2'>
                        <label for='itm_images'>صور أو مرفقات</label>
                        <div class='modal-file'>
                            <label for='itm_images' class='modal-file-trigger'>اختيار الملفات</label>
                            <span id='itm_images_feedback' class='modal-file-feedback'>لم يتم اختيار صور بعد</span>
                            <input id='itm_images' class='modal-file-input' type='file' accept='image/*' multiple>
                        </div>
                    </div>
                </div>

                <div class='modal-note'>
                    في حالة المادة الجديدة سيتم التحقق من سعة الموقع قبل الحفظ، وفي حالة المادة الموجودة سيتم تسجيل الكمية كاستلام مباشر على نفس المادة.
                </div>

                <div class='modal-actions'>
                    <button type='button' class='btn secondary' onclick='closeModal()'>إلغاء</button>
                    <button type='submit' class='btn btn-primary'><span id='itm_submit_label'>${defaultMode === 'existing' ? 'استلام الكمية' : 'حفظ وإضافة'}</span></button>
                </div>
            </form>
        </div>
    `);

    bindAddItemModalEnhancements(warehouseItems, defaultMode);
}

async function saveNewItem() {
    const mode = document.getElementById('itm_mode')?.value === 'existing' ? 'existing' : 'new';
    const qtyInput = document.getElementById('itm_qty')?.value.trim() || '';
    const qty = qtyInput === '' ? 0 : Number(qtyInput);
    const files = document.getElementById('itm_images')?.files || null;
    const reference = document.getElementById('itm_reference')?.value.trim() || '';

    let encodedFiles = null;
    if (files && files.length) {
        try {
            const readers = [];
            for (let i = 0; i < files.length; i++) {
                readers.push(readFileAsDataURL(files[i]));
            }
            encodedFiles = JSON.stringify(await Promise.all(readers));
        } catch (error) {
            showAlert('فشل معالجة الملفات المرفقة.', 'danger');
            return;
        }
    }

    if (mode === 'existing') {
        const itemId = Number.parseInt(document.getElementById('itm_existing_item')?.value || '', 10);
        if (!Number.isInteger(itemId) || itemId <= 0) {
            showAlert('يرجى اختيار مادة موجودة من القائمة أولًا.', 'warning');
            return;
        }

        if (!Number.isFinite(qty) || qty <= 0) {
            showAlert('يرجى إدخال كمية استلام صحيحة أكبر من صفر.', 'warning');
            return;
        }

        const payload = {
            item_id: itemId,
            qty,
            reference: reference || 'استلام عبر نافذة الإضافة',
            user: 'مشرف'
        };

        if (encodedFiles) {
            payload.attachment_paths = encodedFiles;
        }

        const result = await postData('/inventory/receive', payload);
        if (result) {
            showAlert(result.message, 'success');
            closeModal();
            renderAll();
        }
        return;
    }

    const code = document.getElementById('itm_code')?.value.trim() || '';
    const name = document.getElementById('itm_name')?.value.trim() || '';
    const minInput = document.getElementById('itm_min')?.value.trim() || '';
    const min = minInput === '' ? 5 : Number(minInput);
    const unit = document.getElementById('itm_unit')?.value.trim() || 'قطعة';
    const selectedLocationId = Number.parseInt(document.getElementById('itm_location_id')?.value || '', 10);

    if (!name) {
        showAlert('يرجى إدخال اسم المادة الجديدة.', 'warning');
        return;
    }

    if (!Number.isFinite(qty) || qty < 0) {
        showAlert('يرجى إدخال كمية أولية صحيحة تساوي صفر أو أكبر.', 'warning');
        return;
    }

    if (!Number.isFinite(min) || min < 0) {
        showAlert('يرجى إدخال حد أدنى صحيح يساوي صفر أو أكبر.', 'warning');
        return;
    }

    const payload = { code, name, qty, min, unit, user: 'مشرف' };
    if (Number.isInteger(selectedLocationId) && selectedLocationId > 0) {
        payload.location_id = selectedLocationId;
    }
    if (encodedFiles) {
        payload.images = encodedFiles;
    }

    const result = await postData('/inventory/new', payload);
    if (result) {
        const locationSuffix = result.location_label ? ` الموقع: ${result.location_label}` : '';
        showAlert(`${result.message}${result.item_code ? ` الكود: ${result.item_code}` : ''}${locationSuffix}`, 'success');
        closeModal();
        renderAll();
    }
}

function openIssueModal() {
    if (INVENTORY_ITEMS.length === 0) {
        return showAlert('يجب تحميل بيانات المخزون أولاً.', 'warning');
    }

    const itemOptions = INVENTORY_ITEMS
        .map((item) => `<option value='${item.item_id}'>${escapeHtml(item.item_name)} (${item.item_code}) - متوفر: ${item.current_qty}</option>`)
        .join('');

    modal(`
        <div class='modal-shell'>
            <div class='modal-header'>
                <div>
                    <div class='modal-kicker'>المخزون</div>
                    <h3>صرف مادة</h3>
                    <p class='modal-subtitle'>نموذج مرتب لتسجيل عملية الصرف مع الكمية والمرجع والمرفق إن وجد.</p>
                </div>
            </div>
            <div class='modal-form'>
                <div class='modal-section'>
                    <div class='modal-section-head'>
                        <strong>بيانات الصرف</strong>
                        <span>سيتم التحقق من الكمية المتاحة قبل تنفيذ العملية.</span>
                    </div>
                    <div class='modal-form-grid'>
                        <div class='modal-field modal-field-span-2'>
                            <label for='iss_item'>المادة</label>
                            <select id='iss_item' required>
                                <option value=''>--- اختر المادة ---</option>
                                ${itemOptions}
                            </select>
                        </div>
                        <div class='modal-field'>
                            <label for='iss_qty'>الكمية</label>
                            <input id='iss_qty' type='number' min='0.01' step='0.01' placeholder='الكمية المراد صرفها' required>
                        </div>
                        <div class='modal-field'>
                            <label for='iss_user'>المسؤول</label>
                            <input id='iss_user' placeholder='اسم الموظف الذي قام بالصرف' value='مشرف النظام'>
                        </div>
                        <div class='modal-field modal-field-span-2'>
                            <label for='iss_ref'>المرجع</label>
                            <input id='iss_ref' placeholder='طلب / سند صرف / عمل صيانة'>
                        </div>
                        <div class='modal-field modal-field-span-2'>
                            <label for='iss_file'>مرفق الحركة</label>
                            <div class='modal-file'>
                                <label for='iss_file' class='modal-file-trigger'>اختيار ملف</label>
                                <span id='iss_file_feedback' class='modal-file-feedback'>لم يتم اختيار ملف بعد</span>
                                <input id='iss_file' class='modal-file-input' type='file' accept='image/*'>
                            </div>
                        </div>
                    </div>
                </div>
                <div class='modal-actions'>
                    <button class='btn secondary' onclick='closeModal()'>إلغاء</button>
                    <button class='btn' onclick='saveIssue()'>صرف المادة</button>
                </div>
            </div>
        </div>`);

    document.getElementById('iss_file')?.addEventListener('change', (event) => {
        const feedback = document.getElementById('iss_file_feedback');
        if (feedback) {
            feedback.textContent = event.target?.files?.[0]?.name || 'لم يتم اختيار ملف بعد';
        }
    });
}

function openPurchaseRequestModal() {
    if (!SUPPLIERS.length) {
        showAlert('يجب تحميل الموردين أولاً قبل إنشاء طلب شراء.', 'warning');
        return;
    }

    const itemOptions = INVENTORY_ITEMS
        .map((item) => {
            const itemId = Number(item.item_id);
            if (!Number.isFinite(itemId)) {
                return '';
            }

            return `<option value='${itemId}'>${escapeHtml(item.item_name)} (${escapeHtml(item.item_code)})</option>`;
        })
        .filter(Boolean)
        .join('');

    const supplierOptions = SUPPLIERS
        .map((supplier) => {
            const supplierId = getSupplierIdentifier(supplier);
            const supplierName = escapeHtml(getSupplierDisplayName(supplier));
            if (!supplierId || !supplierName) {
                return '';
            }

            return `<option value='${supplierId}'>${supplierName}</option>`;
        })
        .filter(Boolean)
        .join('');

    modal(`
        <div class='modal-shell'>
            <div class='modal-header'>
                <div>
                    <div class='modal-kicker'>التوريد</div>
                    <h3>طلب شراء جديد</h3>
                    <p class='modal-subtitle'>يمكنك اختيار مادة من الموجودات أو اختيار "قطعة أخرى" ثم كتابة اسمها يدويًا.</p>
                </div>
            </div>
            <div class='modal-form'>
                <div class='modal-section'>
                    <div class='modal-section-head'>
                        <strong>تفاصيل الطلب</strong>
                        <span>النموذج الآن منظم ومتجاوب حتى لا تتكسر الحقول عند الفتح.</span>
                    </div>
                    <div class='modal-form-grid'>
                        <div class='modal-field modal-field-span-2'>
                            <label for='purchase_item_id'>المادة</label>
                            <select id='purchase_item_id' required>
                                <option value=''>--- اختر المادة من المخزون ---</option>
                                ${itemOptions}<option value='__other__'>قطعة أخرى</option>
                            </select>
                        </div>
                        <div id='purchase_custom_item_wrap' class='modal-field modal-field-span-2 hidden'>
                            <label for='purchase_custom_item_name'>اسم المادة الأخرى</label>
                            <input id='purchase_custom_item_name' placeholder='اسم القطعة المطلوبة'>
                        </div>
                        <div class='modal-field'>
                            <label for='purchase_qty'>الكمية</label>
                            <input id='purchase_qty' type='number' min='0.01' step='0.01' placeholder='الكمية المطلوبة' required>
                        </div>
                        <div class='modal-field'>
                            <label for='purchase_supplier_id'>المورد</label>
                            <select id='purchase_supplier_id' required>
                                <option value=''>--- اختر المورد المقترح ---</option>
                                ${supplierOptions}
                            </select>
                        </div>
                    </div>
                </div>
                <div class='modal-actions'>
                    <button class='btn secondary' onclick='closeModal()'>إلغاء</button>
                    <button class='btn' onclick='savePurchaseRequest()'>إرسال الطلب</button>
                </div>
            </div>
        </div>`);

    document.getElementById('purchase_item_id')?.addEventListener('change', togglePurchaseCustomItemField);
    togglePurchaseCustomItemField();
}

function togglePurchaseCustomItemField() {
    const itemSelector = document.getElementById('purchase_item_id');
    const customItemField = document.getElementById('purchase_custom_item_name');
    const customItemWrap = document.getElementById('purchase_custom_item_wrap');
    if (!itemSelector || !customItemField) {
        return;
    }

    const isOtherSelected = itemSelector.value === '__other__';
    customItemField.classList.toggle('hidden', !isOtherSelected);
    customItemWrap?.classList.toggle('hidden', !isOtherSelected);
    customItemField.required = isOtherSelected;

    if (!isOtherSelected) {
        customItemField.value = '';
    }
}

function openNewRequestModal() {
    if (INVENTORY_ITEMS.length === 0) {
        return showAlert('يجب تحميل بيانات المخزون أولاً.', 'warning');
    }

    const itemOptions = INVENTORY_ITEMS
        .map((item) => `<option value='${item.item_id}'>${escapeHtml(item.item_name)} (${item.item_code}) - متوفر: ${item.current_qty}</option>`)
        .join('');

    modal(`
        <div class='modal-shell'>
            <div class='modal-header'>
                <div>
                    <div class='modal-kicker'>الطلبات</div>
                    <h3>إنشاء طلب مادة</h3>
                    <p class='modal-subtitle'>واجهة أوضح لإدخال الطلب بدون تداخل أو ضيق في الحقول.</p>
                </div>
            </div>
            <div class='modal-form'>
                <div class='modal-section'>
                    <div class='modal-section-head'>
                        <strong>بيانات الطلب</strong>
                        <span>سيظهر الطلب في القائمة للمراجعة والاعتماد بعد الحفظ.</span>
                    </div>
                    <div class='modal-form-grid'>
                        <div class='modal-field modal-field-span-2'>
                            <label for='req_item'>المادة</label>
                            <select id='req_item' required>
                                <option value=''>--- اختر المادة ---</option>
                                ${itemOptions}
                            </select>
                        </div>
                        <div class='modal-field'>
                            <label for='req_qty'>الكمية</label>
                            <input id='req_qty' type='number' min='0.01' step='0.01' placeholder='كمية الطلب' required>
                        </div>
                        <div class='modal-field'>
                            <label for='req_by'>اسم الطالب</label>
                            <input id='req_by' placeholder='اسم الطالب' required>
                        </div>
                        <div class='modal-field modal-field-span-2'>
                            <label for='req_justification'>مبرر الطلب</label>
                            <textarea id='req_justification' rows='4' placeholder='مبررات الطلب (اختياري)'></textarea>
                        </div>
                    </div>
                </div>
                <div class='modal-actions'>
                    <button class='btn secondary' onclick='closeModal()'>إلغاء</button>
                    <button class='btn' onclick='saveNewRequest()'>إرسال الطلب</button>
                </div>
            </div>
        </div>`);
}

window.addEventListener('storage', (event) => {
    if (event.key === 'maintenance-request-refresh' && event.newValue) {
        renderRequests();
    }
});
