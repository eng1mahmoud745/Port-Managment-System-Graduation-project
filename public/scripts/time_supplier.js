const API_BASE_URL = '/api';
const FALLBACK_PAGE = 'supllier.html';
const chartInstances = {};

const pageElements = {
    supplierName: document.getElementById('supplier-name'),
    totalTransactions: document.getElementById('total-transactions'),
    totalValue: document.getElementById('total-value'),
    lastPurchase: document.getElementById('last-purchase'),
    avgTransaction: document.getElementById('avg-transaction'),
    transactionsBody: document.getElementById('transactions-body'),
    yearlyChart: document.getElementById('yearlyChart'),
    productsChart: document.getElementById('productsChart'),
    printButton: document.getElementById('print-report-btn')
};

function formatCurrency(amount) {
    return new Intl.NumberFormat('ar-SY', {
        style: 'currency',
        currency: 'SYP',
        minimumFractionDigits: 0
    }).format(amount);
}

async function fetchData(endpoint) {
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`);
        const result = await response.json();

        if (!response.ok || !result.success) {
            alert(`❌ فشل جلب البيانات: ${result.message || 'حدث خطأ غير معروف'}`);
            throw new Error(result.message || 'API Error');
        }

        return result;
    } catch (error) {
        console.error('Fetch Error:', error);
        alert(`❌ خطأ في الاتصال بالخادم أو جلب البيانات: ${error.message}`);
        throw error;
    }
}

function renderTransactions(transactions) {
    if (!pageElements.transactionsBody) {
        return;
    }

    if (!transactions.length) {
        pageElements.transactionsBody.innerHTML = '<tr><td colspan="7" style="text-align: center;">لا توجد تعاملات مسجلة</td></tr>';
        return;
    }

    pageElements.transactionsBody.innerHTML = transactions.map((transaction) => `
        <tr>
            <td>${transaction.date}</td>
            <td>${transaction.product}</td>
            <td>${transaction.quantity}</td>
            <td>${formatCurrency(transaction.unit_price)}</td>
            <td>${formatCurrency(transaction.total)}</td>
            <td>${transaction.year}</td>
            <td>${transaction.notes || '—'}</td>
        </tr>
    `).join('');
}

function groupTransactions(transactions, key, valueSelector) {
    return transactions.reduce((accumulator, transaction) => {
        const groupKey = transaction[key];
        accumulator[groupKey] = (accumulator[groupKey] || 0) + valueSelector(transaction);
        return accumulator;
    }, {});
}

function renderChart(instanceKey, canvas, config) {
    if (!canvas) {
        return;
    }

    chartInstances[instanceKey]?.destroy();
    chartInstances[instanceKey] = new Chart(canvas.getContext('2d'), config);
}

async function fetchSupplierHistory(id) {
    try {
        const result = await fetchData(`/suppliers/${id}/history`);
        const supplier = result.history;

        if (!supplier) {
            alert('لم يتم العثور على بيانات المورد.');
            return;
        }

        const transactions = Array.isArray(supplier.transactions) ? supplier.transactions : [];

        pageElements.supplierName.textContent = supplier.name;
        pageElements.totalTransactions.textContent = supplier.total_transactions;
        pageElements.totalValue.textContent = formatCurrency(supplier.total_value);
        pageElements.lastPurchase.textContent = supplier.last_purchase || '-';
        pageElements.avgTransaction.textContent = formatCurrency(supplier.avg_transaction_value || 0);

        renderTransactions(transactions);
        createCharts(transactions);
    } catch (error) {
        console.error('Failed to load supplier history:', error);
    }
}

function createCharts(transactions) {
    const yearlyData = groupTransactions(transactions, 'year', (transaction) => transaction.total);
    const years = Object.keys(yearlyData).sort();
    const yearlyValues = years.map((year) => yearlyData[year]);

    renderChart('yearly', pageElements.yearlyChart, {
        type: 'bar',
        data: {
            labels: years,
            datasets: [{
                label: 'قيمة التعاملات بالليرة السورية',
                data: yearlyValues,
                backgroundColor: 'rgba(46, 134, 193, 0.7)',
                borderColor: 'rgba(26, 82, 118, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback(value) {
                            return `${value.toLocaleString('ar-SY')} ل.س`;
                        }
                    }
                }
            }
        }
    });

    const productData = groupTransactions(transactions, 'product', (transaction) => transaction.quantity);
    const products = Object.keys(productData);
    const productQuantities = products.map((product) => productData[product]);

    renderChart('products', pageElements.productsChart, {
        type: 'pie',
        data: {
            labels: products,
            datasets: [{
                data: productQuantities,
                backgroundColor: [
                    'rgba(243, 156, 18, 0.7)',
                    'rgba(46, 134, 193, 0.7)',
                    'rgba(40, 167, 69, 0.7)',
                    'rgba(220, 53, 69, 0.7)',
                    'rgba(108, 117, 125, 0.7)'
                ],
                borderColor: [
                    'rgba(243, 156, 18, 1)',
                    'rgba(46, 134, 193, 1)',
                    'rgba(40, 167, 69, 1)',
                    'rgba(220, 53, 69, 1)',
                    'rgba(108, 117, 125, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });
}

const supplierId = new URLSearchParams(window.location.search).get('id');

if (supplierId) {
    fetchSupplierHistory(supplierId);
} else {
    alert('لم يتم تحديد مورد');
    window.location.href = FALLBACK_PAGE;
}

pageElements.printButton?.addEventListener('click', () => {
    window.print();
});
