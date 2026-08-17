// مصفوفة لتخزين البيانات التي يتم جلبها من الخادم
let suppliers = [];

// واجهات API
const API_BASE_URL = '/api/suppliers';
const WAREHOUSES_API_URL = '/api/warehouses';
const ALERT_HIDE_DELAY_MS = 5000;

// قيم احتياطية إذا فشل جلب أنواع المستودعات
const FALLBACK_WAREHOUSE_TYPES = [
    'مستودع للزيوت والشحوم',
    'مستودع للاطارات',
    'مستودع للقطع الكهربائية',
    'مستودع للقطع الميكانيكية'
];

function getElement(id) {
    return document.getElementById(id);
}

function getSupplierSubmitButton() {
    return document.querySelector('#supplier-form button[type="submit"]');
}

function getSupplierStars(ratingValue) {
    const rating = Number(ratingValue) || 0;
    const safeRating = Math.max(0, Math.min(5, rating));
    return '★'.repeat(safeRating) + '☆'.repeat(5 - safeRating);
}

async function requestJson(url, options) {
    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || `HTTP error! status: ${response.status}`);
    }

    return data;
}

async function fetchSupplierById(id) {
    return requestJson(`${API_BASE_URL}/${id}`);
}

function getSupplierFormData() {
    return {
        name: getElement('supplier-name').value.trim(),
        specialization: getElement('supplier-specialization').value,
        category: getElement('supplier-category').value,
        rating: Number.parseInt(getElement('supplier-rating').value, 10),
        contact_person: getElement('contact-person').value.trim(),
        primary_phone: getElement('primary-phone').value.trim(),
        secondary_phone: getElement('secondary-phone').value.trim(),
        email: getElement('email').value.trim(),
        address: getElement('address').value.trim(),
        commercial_reg: getElement('commercial-reg').value.trim(),
        tax_number: getElement('tax-number').value.trim(),
        payment_terms: getElement('payment-terms').value,
        currency: getElement('currency').value
    };
}

function resetSupplierForm() {
    const form = getElement('supplier-form');
    const submitBtn = getSupplierSubmitButton();

    form?.reset();

    if (submitBtn) {
        submitBtn.textContent = 'حفظ المورد';
        submitBtn.removeAttribute('data-edit-id');
    }
}

// عند اكتمال تحميل الصفحة
document.addEventListener('DOMContentLoaded', async function () {
    initTabs();
    initForms();
    initSearchFilter();
    initModals();
    initReportActions();

    await initSupplierSpecializationOptions();
    await fetchAndRenderSuppliers();
});

// تحميل تخصصات المورد من أنواع المستودعات
async function initSupplierSpecializationOptions(selectedValue = '') {
    const specializationSelect = getElement('supplier-specialization');
    if (!specializationSelect) return;

    const warehouseTypes = await fetchWarehouseTypes();
    renderSupplierSpecializationOptions(warehouseTypes, selectedValue);
}

// جلب أنواع المستودعات من الخادم
async function fetchWarehouseTypes() {
    try {
        const response = await fetch(WAREHOUSES_API_URL);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        const rawWarehouses = Array.isArray(data)
            ? data
            : Array.isArray(data.warehouses)
                ? data.warehouses
                : [];

        const warehouseTypes = Array.from(
            new Set(
                rawWarehouses
                    .map(warehouse => String(warehouse.warehouse_type || '').trim())
                    .filter(Boolean)
            )
        );

        return warehouseTypes.length ? warehouseTypes : [...FALLBACK_WAREHOUSE_TYPES];
    } catch (error) {
        console.error('Error fetching warehouse types:', error);
        return [...FALLBACK_WAREHOUSE_TYPES];
    }
}

// تعبئة قائمة التخصصات داخل select
function renderSupplierSpecializationOptions(warehouseTypes, selectedValue = '') {
    const specializationSelect = getElement('supplier-specialization');
    if (!specializationSelect) return;

    specializationSelect.innerHTML = '<option value="">اختر التخصص</option>';

    warehouseTypes.forEach((warehouseType) => {
        const option = document.createElement('option');
        option.value = warehouseType;
        option.textContent = warehouseType;

        if (warehouseType === selectedValue) {
            option.selected = true;
        }

        specializationSelect.appendChild(option);
    });
}

// تهيئة التبويبات
function initTabs() {
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', function () {
            const tabId = this.getAttribute('data-tab');

            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(tc => tc.classList.remove('active'));

            this.classList.add('active');

            const activeTabContent = document.getElementById(tabId);
            if (activeTabContent) {
                activeTabContent.classList.add('active');
            }
        });
    });
}

// جلب الموردين وعرضهم
async function fetchAndRenderSuppliers(queryParams = '') {
    const tableBody = getElement('suppliers-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center;">جاري تحميل البيانات من الخادم...</td></tr>';

    try {
        const response = await fetch(`${API_BASE_URL}${queryParams}`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        suppliers = Array.isArray(data.suppliers) ? data.suppliers : [];
        tableBody.innerHTML = '';

        if (suppliers.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center;">لا توجد بيانات موردين لعرضها</td></tr>';
            renderReportTable();
            return;
        }

        suppliers.forEach(supplier => {
            const row = document.createElement('tr');

            row.innerHTML = `
                <td>${supplier.id ?? ''}</td>
                <td>${supplier.name ?? ''}</td>
                <td>${supplier.specialization ?? ''}</td>
                <td>${supplier.category ?? ''}</td>
                <td class="rating-stars">${getSupplierStars(supplier.rating)}</td>
                <td>${supplier.primary_phone ?? ''}</td>
                <td>
                    <span class="status-badge ${supplier.status === 'active' ? 'status-active' : 'status-inactive'}">
                        ${supplier.status === 'active' ? 'نشط' : 'غير نشط'}
                    </span>
                </td>
                <td>
                    <button type="button" class="btn btn-primary btn-sm view-supplier" data-id="${supplier.id}">عرض</button>
                    <button type="button" class="btn btn-primary btn-sm supplier-history" data-id="${supplier.id}">التاريخ</button>
                    <button type="button" class="btn btn-primary btn-sm rate-supplier" data-id="${supplier.id}">تقييم</button>
                    <button type="button" class="btn btn-warning btn-sm edit-supplier" data-id="${supplier.id}">تعديل</button>
                    <button type="button" class="btn btn-danger btn-sm delete-supplier" data-id="${supplier.id}">حذف</button>
                </td>
            `;

            tableBody.appendChild(row);
        });

        addSupplierActionListeners();
        renderReportTable();

    } catch (error) {
        console.error('Error fetching suppliers:', error);
        tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: red;">حدث خطأ أثناء جلب البيانات من الخادم.</td></tr>';
        showAlert('فشل الاتصال بالخادم أو جلب البيانات.', 'danger');
    }
}

// إضافة معالجات أحداث أزرار الموردين
function addSupplierActionListeners() {
    document.querySelectorAll('.view-supplier').forEach(btn => {
        btn.addEventListener('click', function () {
            const supplierId = parseInt(this.getAttribute('data-id'), 10);
            if (!isNaN(supplierId)) {
                viewSupplier(supplierId);
            }
        });
    });

    document.querySelectorAll('.supplier-history').forEach(btn => {
        btn.addEventListener('click', function () {
            const supplierId = parseInt(this.getAttribute('data-id'), 10);
            if (!isNaN(supplierId)) {
                window.location.href = `time_supplier.html?id=${supplierId}`;
            }
        });
    });

    document.querySelectorAll('.rate-supplier').forEach(btn => {
        btn.addEventListener('click', function () {
            const supplierId = parseInt(this.getAttribute('data-id'), 10);
            if (!isNaN(supplierId)) {
                window.location.href = `rating.html?id=${supplierId}`;
            }
        });
    });

    document.querySelectorAll('.edit-supplier').forEach(btn => {
        btn.addEventListener('click', function () {
            const supplierId = parseInt(this.getAttribute('data-id'), 10);
            if (!isNaN(supplierId)) {
                fetchSupplierForEdit(supplierId);
            }
        });
    });

    document.querySelectorAll('.delete-supplier').forEach(btn => {
        btn.addEventListener('click', function () {
            const supplierId = parseInt(this.getAttribute('data-id'), 10);
            if (!isNaN(supplierId)) {
                confirmDelete(supplierId);
            }
        });
    });
}

// جلب مورد واحد للتعديل
async function fetchSupplierForEdit(id) {
    try {
        const supplier = await fetchSupplierById(id);

        await initSupplierSpecializationOptions(supplier.specialization || '');

        getElement('supplier-name').value = supplier.name || '';
        getElement('supplier-category').value = supplier.category || '';
        getElement('supplier-rating').value = supplier.rating || 5;
        getElement('contact-person').value = supplier.contact_person || '';
        getElement('primary-phone').value = supplier.primary_phone || '';
        getElement('secondary-phone').value = supplier.secondary_phone || '';
        getElement('email').value = supplier.email || '';
        getElement('address').value = supplier.address || '';
        getElement('commercial-reg').value = supplier.commercial_reg || '';
        getElement('tax-number').value = supplier.tax_number || '';
        getElement('payment-terms').value = supplier.payment_terms || 'صافي 30';
        getElement('currency').value = supplier.currency || 'SYP';

        switchToTab('add-supplier');

        const submitBtn = getSupplierSubmitButton();
        submitBtn.textContent = 'تحديث المورد';
        submitBtn.setAttribute('data-edit-id', id);

    } catch (error) {
        console.error('Error fetching supplier for edit:', error);
        showAlert('فشل جلب بيانات المورد للتعديل', 'danger');
    }
}

// عرض تفاصيل مورد
async function viewSupplier(id) {
    try {
        const supplier = await fetchSupplierById(id);

        const detailsHtml = `
            <div class="form-grid">
                <div class="form-group">
                    <label>اسم المورد:</label>
                    <p>${supplier.name || 'غير متوفر'}</p>
                </div>
                <div class="form-group">
                    <label>التخصص:</label>
                    <p>${supplier.specialization || 'غير متوفر'}</p>
                </div>
                <div class="form-group">
                    <label>التصنيف:</label>
                    <p>${supplier.category || 'غير متوفر'}</p>
                </div>
                <div class="form-group">
                    <label>التقييم:</label>
                    <p class="rating-stars">${getSupplierStars(supplier.rating)}</p>
                </div>
                <div class="form-group">
                    <label>الشخص المسؤول:</label>
                    <p>${supplier.contact_person || 'غير متوفر'}</p>
                </div>
                <div class="form-group">
                    <label>الهاتف الرئيسي:</label>
                    <p>${supplier.primary_phone || 'غير متوفر'}</p>
                </div>
                <div class="form-group">
                    <label>الهاتف الاحتياطي:</label>
                    <p>${supplier.secondary_phone || 'غير متوفر'}</p>
                </div>
                <div class="form-group">
                    <label>البريد الإلكتروني:</label>
                    <p>${supplier.email || 'غير متوفر'}</p>
                </div>
                <div class="form-group">
                    <label>العنوان:</label>
                    <p>${supplier.address || 'غير متوفر'}</p>
                </div>
                <div class="form-group">
                    <label>رقم السجل التجاري:</label>
                    <p>${supplier.commercial_reg || 'غير متوفر'}</p>
                </div>
                <div class="form-group">
                    <label>الرقم الضريبي:</label>
                    <p>${supplier.tax_number || 'غير متوفر'}</p>
                </div>
                <div class="form-group">
                    <label>شروط الدفع:</label>
                    <p>${supplier.payment_terms || 'غير متوفر'}</p>
                </div>
                <div class="form-group">
                    <label>عملة التعامل:</label>
                    <p>${supplier.currency || 'غير متوفر'}</p>
                </div>
            </div>
        `;

        getElement('supplier-details').innerHTML = detailsHtml;
        getElement('details-modal').style.display = 'flex';

    } catch (error) {
        console.error('Error viewing supplier:', error);
        showAlert('فشل جلب تفاصيل المورد', 'danger');
    }
}

// تأكيد الحذف
function confirmDelete(id) {
    const modal = getElement('delete-modal');
    const confirmBtn = getElement('confirm-delete');
    const cancelBtn = getElement('cancel-delete');

    modal.style.display = 'flex';

    confirmBtn.onclick = async function () {
        await deleteSupplier(id);
        modal.style.display = 'none';
    };

    cancelBtn.onclick = function () {
        modal.style.display = 'none';
    };
}

// حذف مورد
async function deleteSupplier(id) {
    try {
        const response = await fetch(`${API_BASE_URL}/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showAlert('تم حذف المورد بنجاح', 'success');
            await fetchAndRenderSuppliers();
        } else {
            let data = {};
            try {
                data = await response.json();
            } catch (_) {}
            showAlert(`فشل حذف المورد: ${data.message || 'خطأ غير معروف'}`, 'danger');
        }
    } catch (error) {
        console.error('Error deleting supplier:', error);
        showAlert('فشل الاتصال بالخادم أثناء الحذف', 'danger');
    }
}

// تهيئة النموذج
function initForms() {
    const supplierForm = getElement('supplier-form');
    if (!supplierForm) return;

    supplierForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const submitBtn = getSupplierSubmitButton();
        const editId = submitBtn.getAttribute('data-edit-id');

        if (editId) {
            updateSupplier(parseInt(editId, 10));
        } else {
            addSupplier();
        }
    });

    supplierForm.addEventListener('reset', function () {
        resetSupplierForm();

        setTimeout(() => {
            initSupplierSpecializationOptions();
        }, 0);
    });
}

// إضافة مورد
async function addSupplier() {
    const newSupplier = getSupplierFormData();

    try {
        const response = await fetch(API_BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(newSupplier)
        });

        const data = await response.json();

        if (response.ok && data.success) {
            resetSupplierForm();
            showAlert('تم إضافة المورد بنجاح', 'success');
            await fetchAndRenderSuppliers();
            switchToTab('suppliers-list');
        } else {
            showAlert(`فشل إضافة المورد: ${data.message || 'خطأ غير معروف'}`, 'danger');
        }

    } catch (error) {
        console.error('Error adding supplier:', error);
        showAlert('فشل الاتصال بالخادم أثناء الإضافة', 'danger');
    }
}

// تحديث مورد
async function updateSupplier(id) {
    const updatedData = getSupplierFormData();

    try {
        const response = await fetch(`${API_BASE_URL}/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updatedData)
        });

        const data = await response.json();

        if (response.ok && data.success) {
            resetSupplierForm();
            showAlert('تم تحديث المورد بنجاح', 'success');
            await fetchAndRenderSuppliers();
            switchToTab('suppliers-list');
        } else {
            showAlert(`فشل تحديث المورد: ${data.message || 'خطأ غير معروف'}`, 'danger');
        }
    } catch (error) {
        console.error('Error updating supplier:', error);
        showAlert('فشل الاتصال بالخادم أثناء التحديث', 'danger');
    }
}

// تهيئة البحث والتصفية
function initSearchFilter() {
    const searchBtn = getElement('search-btn');
    const resetBtn = getElement('reset-filters');

    if (searchBtn) {
        searchBtn.addEventListener('click', function () {
            const nameSearch = getElement('search-name').value.trim();
            const categoryFilter = getElement('filter-category').value;
            const ratingFilter = getElement('filter-rating').value;
            const statusFilter = getElement('filter-status').value;

            const params = new URLSearchParams();

            if (nameSearch) params.append('search', nameSearch);
            if (categoryFilter) params.append('category', categoryFilter);
            if (ratingFilter) params.append('min_rating', ratingFilter);
            if (statusFilter) params.append('status', statusFilter);

            const queryString = params.toString() ? `?${params.toString()}` : '';
            fetchAndRenderSuppliers(queryString);
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', function () {
            getElement('search-name').value = '';
            getElement('filter-category').value = '';
            getElement('filter-rating').value = '';
            getElement('filter-status').value = '';
            fetchAndRenderSuppliers();
        });
    }
}

// عرض جدول التقارير
function renderReportTable() {
    const tableBody = getElement('report-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    if (suppliers.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">لا توجد بيانات لعرضها</td></tr>';
        return;
    }

    suppliers.forEach(supplier => {
        const row = document.createElement('tr');

        row.innerHTML = `
            <td>${supplier.name ?? ''}</td>
            <td>${supplier.specialization ?? ''}</td>
            <td>${supplier.category ?? ''}</td>
            <td class="rating-stars">${getSupplierStars(supplier.rating)}</td>
            <td>${supplier.transactions ?? 0}</td>
            <td>${formatCurrency(supplier.total_value ?? 0, supplier.currency || 'SYP')}</td>
        `;

        tableBody.appendChild(row);
    });
}

// تهيئة النوافذ المنبثقة
function initModals() {
    const modals = document.querySelectorAll('.modal');
    const closeButtons = document.querySelectorAll('.close-modal');

    closeButtons.forEach(button => {
        button.addEventListener('click', function () {
            modals.forEach(modal => {
                modal.style.display = 'none';
            });
        });
    });

    modals.forEach(modal => {
        modal.addEventListener('click', function (e) {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });
}

// تهيئة أزرار التقارير
function initReportActions() {
    const generateBtn = document.getElementById('generate-report');
    const exportBtn = document.getElementById('export-report');

    if (generateBtn) {
        generateBtn.addEventListener('click', function () {
            showAlert('تم إنشاء التقرير بنجاح', 'success');
        });
    }

    if (exportBtn) {
        exportBtn.addEventListener('click', function () {
            showAlert('تم تصدير التقرير بنجاح', 'success');
        });
    }
}

// عرض تنبيه
function showAlert(message, type) {
    const alertDiv = getElement('alert-message');
    if (!alertDiv) return;

    alertDiv.textContent = message;
    alertDiv.className = `alert alert-${type}`;
    alertDiv.style.display = 'block';

    setTimeout(() => {
        alertDiv.style.display = 'none';
    }, ALERT_HIDE_DELAY_MS);
}

// تنسيق العملة
function formatCurrency(amount, currency) {
    try {
        return new Intl.NumberFormat('ar-SY', {
            style: 'currency',
            currency: currency
        }).format(amount);
    } catch (error) {
        return `${amount} ${currency}`;
    }
}

// الانتقال بين التبويبات برمجيًا
function switchToTab(tabId) {
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => tab.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));

    const targetTab = document.querySelector(`.tab[data-tab="${tabId}"]`);
    const targetContent = document.getElementById(tabId);

    if (targetTab) targetTab.classList.add('active');
    if (targetContent) targetContent.classList.add('active');
}
