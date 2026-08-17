const API_BASE_URL = '/api';
const ALERT_HIDE_DELAY_MS = 5000;

function getElement(id) {
    return document.getElementById(id);
}

function getNumericValue(element) {
    return Number.parseFloat(element?.value || '0') || 0;
}

function showAlert(message, type = 'success') {
    const alertDiv = getElement('alert-message');
    if (!alertDiv) {
        return;
    }

    alertDiv.textContent = message;
    alertDiv.className = `alert alert-${type}`;
    alertDiv.style.display = 'block';

    window.setTimeout(() => {
        alertDiv.style.display = 'none';
    }, ALERT_HIDE_DELAY_MS);
}

function calculateTotal(quantityInput, unitPriceInput, totalPriceField) {
    if (!totalPriceField) {
        return;
    }

    const total = getNumericValue(quantityInput) * getNumericValue(unitPriceInput);
    totalPriceField.value = total.toFixed(2);
}

async function fetchSuppliers(selectElement) {
    if (!selectElement) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/suppliers`);
        const result = await response.json();

        if (!response.ok || !result.success) {
            showAlert(`فشل جلب قائمة الموردين: ${result.message || 'خطأ في الاتصال'}`, 'danger');
            return;
        }

        const suppliers = Array.isArray(result.suppliers) ? result.suppliers : [];
        suppliers.forEach((supplier) => {
            const option = document.createElement('option');
            option.value = supplier.supplier_id;
            option.textContent = `${supplier.name} (${supplier.specialization})`;
            selectElement.appendChild(option);
        });
    } catch (error) {
        console.error('Error fetching suppliers:', error);
        showAlert('خطأ في الاتصال بالخادم لجلب الموردين.', 'danger');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const quantityInput = getElement('quantity');
    const unitPriceInput = getElement('unit-price');
    const totalPriceField = getElement('total-price');
    const supplierSelect = getElement('supplier-id');
    const form = getElement('purchase-form');
    const transactionDateInput = getElement('transaction-date');

    fetchSuppliers(supplierSelect);

    [quantityInput, unitPriceInput].forEach((input) => {
        input?.addEventListener('input', () => calculateTotal(quantityInput, unitPriceInput, totalPriceField));
    });

    if (transactionDateInput) {
        transactionDateInput.valueAsDate = new Date();
    }

    if (!form) {
        return;
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        const quantity = Number.parseFloat(data.quantity) || 0;
        const unitPrice = Number.parseFloat(data.unit_price) || 0;

        data.total = (quantity * unitPrice).toFixed(2);

        try {
            const response = await fetch(`${API_BASE_URL}/purchases`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                showAlert(`❌ فشل تسجيل عملية الشراء: ${result.message || 'خطأ غير معروف.'}`, 'danger');
                return;
            }

            showAlert('✅ تم تسجيل عملية الشراء بنجاح!');
            form.reset();

            if (totalPriceField) {
                totalPriceField.value = '0.00';
            }

            if (transactionDateInput) {
                transactionDateInput.valueAsDate = new Date();
            }
        } catch (error) {
            console.error('Submission error:', error);
            showAlert('❌ خطأ في الاتصال بالخادم.', 'danger');
        }
    });
});
