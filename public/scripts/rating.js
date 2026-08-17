const API_BASE_URL = '/api/suppliers';
const FALLBACK_PAGE = 'supllier.html';
const SCORE_FIELDS = [
    'quality',
    'specs',
    'delivery',
    'response',
    'professionalism',
    'flexibility',
    'pricing',
    'support'
];

const ratingForm = document.getElementById('rating-form');
const supplierNameElement = document.getElementById('supplier-name');
const supplierIdInput = document.getElementById('supplier-id');
const resultSection = document.getElementById('rating-result');
const finalStarsElement = document.getElementById('final-stars');
const ratingTextElement = document.getElementById('rating-text');
const saveRatingButton = document.getElementById('save-rating');

let currentSupplier = null;
let pendingRatingValue = null;

function getSupplierIdFromQuery() {
    const urlParams = new URLSearchParams(window.location.search);
    return String(urlParams.get('id') || '').trim();
}

function redirectToSuppliersPage() {
    window.location.href = FALLBACK_PAGE;
}

function buildStars(rating) {
    return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

function getRatingSummary(averageScore) {
    if (averageScore >= 4.5) {
        return { stars: 5, text: 'ممتاز - 5 نجوم' };
    }

    if (averageScore >= 3.5) {
        return { stars: 4, text: 'جيد جداً - 4 نجوم' };
    }

    if (averageScore >= 2.5) {
        return { stars: 3, text: 'جيد - 3 نجوم' };
    }

    if (averageScore >= 1.5) {
        return { stars: 2, text: 'متوسط - نجمتان' };
    }

    return { stars: 1, text: 'ضعيف - نجمة واحدة' };
}

async function requestJson(url, options, fallbackMessage) {
    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok || data.success === false) {
        throw new Error(data.message || fallbackMessage);
    }

    return data;
}

function renderSupplierHeader(supplier) {
    supplierNameElement.textContent = supplier.name || 'المورد';
    supplierIdInput.value = supplier.id || '';
}

function collectScoreValues() {
    return SCORE_FIELDS.map((fieldName) => {
        const input = document.querySelector(`input[name="${fieldName}"]:checked`);
        return Number.parseInt(input?.value || '0', 10);
    });
}

function renderRatingResult(ratingSummary) {
    pendingRatingValue = ratingSummary.stars;
    finalStarsElement.textContent = buildStars(ratingSummary.stars);
    ratingTextElement.textContent = ratingSummary.text;
    resultSection.style.display = 'block';
    saveRatingButton.disabled = false;
}

function buildRatingPayload(supplier, rating) {
    return {
        name: supplier.name,
        specialization: supplier.specialization,
        category: supplier.category,
        rating,
        contact_person: supplier.contact_person,
        primary_phone: supplier.primary_phone,
        secondary_phone: supplier.secondary_phone,
        email: supplier.email,
        address: supplier.address,
        commercial_reg: supplier.commercial_reg,
        tax_number: supplier.tax_number,
        payment_terms: supplier.payment_terms,
        currency: supplier.currency
    };
}

async function handleSaveRating() {
    if (!currentSupplier || !pendingRatingValue) {
        return;
    }

    saveRatingButton.disabled = true;

    try {
        await requestJson(
            `${API_BASE_URL}/${encodeURIComponent(currentSupplier.id)}`,
            {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(buildRatingPayload(currentSupplier, pendingRatingValue))
            },
            'تعذر حفظ التقييم.'
        );

        alert('تم حفظ التقييم بنجاح.');
        redirectToSuppliersPage();
    } catch (error) {
        console.error('Rating save failed:', error);
        alert(error.message || 'حدث خطأ أثناء حفظ التقييم.');
        saveRatingButton.disabled = false;
    }
}

async function initializeRatingPage() {
    if (!ratingForm || !saveRatingButton) {
        return;
    }

    const supplierId = getSupplierIdFromQuery();

    if (!supplierId) {
        alert('لم يتم تحديد مورد للتقييم.');
        redirectToSuppliersPage();
        return;
    }

    try {
        currentSupplier = await requestJson(
            `${API_BASE_URL}/${encodeURIComponent(supplierId)}`,
            undefined,
            'تعذر جلب بيانات المورد.'
        );
        renderSupplierHeader(currentSupplier);
    } catch (error) {
        console.error('Supplier fetch failed:', error);
        alert(error.message || 'تعذر تحميل بيانات المورد.');
        redirectToSuppliersPage();
        return;
    }

    ratingForm.addEventListener('submit', (event) => {
        event.preventDefault();

        const scores = collectScoreValues();
        const totalScore = scores.reduce((sum, value) => sum + value, 0);
        const averageScore = totalScore / scores.length;

        renderRatingResult(getRatingSummary(averageScore));
    });

    saveRatingButton.addEventListener('click', handleSaveRating);
}

initializeRatingPage();
