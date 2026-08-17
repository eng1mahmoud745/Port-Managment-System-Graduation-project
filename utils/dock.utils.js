/**
 * مسؤولية الملف: تجميع دوال المساعدة العامة الخاصة بالأرصفة والحاويات وتطبيع القيم المرتبطة بالتفريغ.
 * ملاحظات: الملف لا يحتوي على استعلامات قواعد بيانات أو منطق معاملات، وإنما فقط دوال تطبيع وقراءة metadata.
 */

const {
    DOCK_LEVELS,
    DOCK_BERTHS,
    ALL_DOCK_LEVELS,
    BERTH_DESTINATION_TYPES
} = require('../config/constants');

/**
 * الغرض: تحويل قيمة التاريخ/الوقت القادمة من الواجهة إلى صيغة MySQL المقبولة.
 * المدخلات: value نص التاريخ بصيغة HTML datetime-local أو صيغة مشابهة.
 * المخرجات: نص بصيغة YYYY-MM-DD HH:mm:ss أو null إذا كانت القيمة غير صالحة.
 * ملاحظات: يضيف الثواني عند غيابها ويحافظ على نفس قواعد التحقق الحالية.
 * متى يُستخدم: قبل تخزين مواعيد الوصول أو الأحداث الزمنية في MySQL.
 */
function normalizeMysqlDateTime(value) {
    const normalizedValue = String(value || '').trim().replace('T', ' ');

    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalizedValue)) {
        return `${normalizedValue}:00`;
    }

    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(normalizedValue)) {
        return normalizedValue;
    }

    return null;
}

/**
 * الغرض: توحيد أولوية التفريغ والتحقق من كونها ضمن القيم المسموحة.
 * المدخلات: value قيمة الأولوية الخام.
 * المخرجات: قيمة مطبعة من low/normal/high/urgent أو null إذا كانت غير مقبولة.
 * ملاحظات: يعتمد على نفس القائمة الحالية للأولويات المسموح بها.
 * متى يُستخدم: قبل حفظ أولوية التفريغ أو ترتيب الحاويات وفقها.
 */
function normalizeDischargePriority(value) {
    const normalizedValue = String(value || '').trim().toLowerCase();
    const allowedPriorities = ['low', 'normal', 'high', 'urgent'];
    return allowedPriorities.includes(normalizedValue) ? normalizedValue : null;
}

/**
 * الغرض: توحيد حالة الحاوية والتحقق من صلاحية القيمة المدخلة.
 * المدخلات: value حالة الحاوية الخام.
 * المخرجات: sound أو damaged أو inspection أو null إذا كانت القيمة غير معتمدة.
 * ملاحظات: يطبّع القيمة إلى أحرف صغيرة فقط.
 * متى يُستخدم: قبل حفظ أو معالجة حالة الحاوية في خطط التفريغ والاستقبال.
 */
function normalizeContainerCondition(value) {
    const normalizedValue = String(value || '').trim().toLowerCase();
    const allowedConditions = ['sound', 'damaged', 'inspection'];
    return allowedConditions.includes(normalizedValue) ? normalizedValue : null;
}

/**
 * الغرض: توحيد وجهة الحاوية سواء أُدخلت كاسم وجهة أو كاسم رصيف.
 * المدخلات: value الوجهة الخام القادمة من الطلب أو النموذج.
 * المخرجات: نوع الوجهة القياسي مثل warehouse أو berth_a أو null عند الفشل.
 * ملاحظات: يحاول أولًا مطابقة الرصيف ثم يرجع إلى قائمة الوجهات المسموح بها.
 * متى يُستخدم: قبل إنشاء الحاويات أو خطط التفريغ المرتبطة بوجهة نهائية.
 */
function normalizeContainerDestination(value) {
    const normalizedValue = String(value || '').trim().toLowerCase();
    const berthKey = normalizeDockBerthKey(value);
    if (berthKey) {
        const mappedDestinationEntry = Object.entries(BERTH_DESTINATION_TYPES)
            .find(([, mappedBerthKey]) => mappedBerthKey === berthKey);
        return mappedDestinationEntry?.[0] || `berth_${berthKey.toLowerCase()}`;
    }

    const allowedDestinations = ['yard', 'truck', 'warehouse', 'berth_a', 'berth_b', 'berth_c', 'truck_berth', 'train_berth'];
    return allowedDestinations.includes(normalizedValue) ? normalizedValue : null;
}

/**
 * الغرض: التحقق من نوع الحمولة وإرجاعه فقط إذا كان ضمن القيم المدعومة.
 * المدخلات: value نوع الحمولة الخام.
 * المخرجات: نوع الحمولة كما هو إذا كان صالحًا، أو null إذا كان غير معروف.
 * ملاحظات: يحافظ على نفس النصوص العربية المعتمدة حاليًا دون تغيير.
 * متى يُستخدم: قبل تخزين أو تحديث نوع الحمولة في بيانات السفن والحاويات.
 */
function normalizeCargoType(value) {
    const normalizedValue = String(value || '').trim();
    const allowedCargoTypes = [
        'حمولة جافة',
        'حمولة سائلة',
        'حمولة مبردة',
        'حمولة مجمدة',
        'حمولة سائبة جافة',
        'حمولة خطرة',
        'حمولة ذات أبعاد غير قياسية',
        'حمولة تتطلب تهوية',
        'حمولة سيارات ومعدات متحركة',
        'أخرى'
    ];

    if (!normalizedValue) {
        return null;
    }

    return allowedCargoTypes.includes(normalizedValue) ? normalizedValue : null;
}

/**
 * الغرض: إرجاع ترتيب رقمي ثابت لأولوية التفريغ لتسهيل الفرز.
 * المدخلات: priority قيمة الأولوية النصية.
 * المخرجات: رقم أقل يعني أولوية أعلى، أو 9 للقيم غير المعروفة.
 * ملاحظات: هذه الدالة لا تغيّر البيانات وإنما تهيئها فقط للترتيب.
 * متى يُستخدم: عند فرز خطط أو مهام التفريغ حسب الأولوية.
 */
function getPriorityRank(priority) {
    return {
        urgent: 0,
        high: 1,
        normal: 2,
        low: 3
    }[String(priority || '').trim().toLowerCase()] ?? 9;
}

/**
 * الغرض: إرجاع ترتيب رقمي ثابت لأنواع الوجهات لتسهيل الفرز.
 * المدخلات: destinationType نوع الوجهة النصي.
 * المخرجات: رقم ترتيب للوجهة أو 9 عند القيم غير المعروفة.
 * ملاحظات: يستخدم نفس أولوية الوجهات الحالية من دون تعديل سلوكي.
 * متى يُستخدم: عند ترتيب الحاويات أو المهام بحسب أولوية الوجهة.
 */
function getDestinationRank(destinationType) {
    return {
        truck_berth: 0,
        train_berth: 1,
        truck: 0,
        warehouse: 1,
        berth_a: 2,
        berth_b: 2,
        berth_c: 2,
        yard: 3
    }[String(destinationType || '').trim().toLowerCase()] ?? 9;
}

/**
 * الغرض: تحديد حالة الإنجاز النهائية للحاوية حسب نوع الوجهة.
 * المدخلات: destinationType نوع الوجهة.
 * المخرجات: قيمة status نهائية مثل loaded_truck أو warehoused أو stored.
 * ملاحظات: يطابق نفس خريطة الحالات الحالية المستخدمة بعد إتمام المهمة.
 * متى يُستخدم: عند إغلاق مهام التفريغ وتحديث حالة الحاوية.
 */
function getContainerCompletionStatus(destinationType) {
    const normalizedValue = String(destinationType || '').trim().toLowerCase();

    if (normalizedValue === 'truck') {
        return 'loaded_truck';
    }

    if (normalizedValue === 'warehouse') {
        return 'warehoused';
    }

    return 'stored';
}

/**
 * الغرض: حساب الموقع النهائي الافتراضي المعروض للحاوية حسب وجهتها أو الرصيف المقترح.
 * المدخلات: destinationType نوع الوجهة، proposedBerth اسم الرصيف المقترح، activeWarehouseName اسم المستودع التشغيلي.
 * المخرجات: وصف عربي للموقع النهائي الافتراضي.
 * ملاحظات: لا يحجز موقعًا فعليًا؛ فقط يولّد النص المناسب للعرض أو التخزين الأولي.
 * متى يُستخدم: عند إنشاء أو استكمال مهام التفريغ قبل معرفة الموقع النهائي يدويًا.
 */
function getDefaultFinalLocation(destinationType, proposedBerth, activeWarehouseName = '') {
    const normalizedValue = String(destinationType || '').trim().toLowerCase();
    const berthLabel = String(proposedBerth || '').trim();
    const destinationBerthKey = BERTH_DESTINATION_TYPES[normalizedValue];

    if (destinationBerthKey) {
        return getDockBerthMeta(destinationBerthKey)?.label || `رصيف ${destinationBerthKey}`;
    }

    if (normalizedValue === 'truck') {
        return berthLabel ? `منطقة تحميل الشاحنات - ${berthLabel}` : 'منطقة تحميل الشاحنات';
    }

    if (normalizedValue === 'warehouse') {
        return activeWarehouseName || 'المستودع التشغيلي';
    }

    return berthLabel ? `ساحة الحاويات - ${berthLabel}` : 'ساحة الحاويات';
}

/**
 * الغرض: جلب معلومات المستوى داخل الرصيف من قائمة الثوابت.
 * المدخلات: levelKey مفتاح المستوى مثل upper أو lower.
 * المخرجات: كائن metadata للمستوى أو null إذا لم يوجد.
 * ملاحظات: لا يغيّر البيانات ويعتمد فقط على ALL_DOCK_LEVELS.
 * متى يُستخدم: عند عرض مستويات الأرصفة أو التحقق من صحتها.
 */
function getDockLevelMeta(levelKey) {
    return ALL_DOCK_LEVELS.find((level) => level.key === levelKey) || null;
}

/**
 * الغرض: جلب معلومات الرصيف من قائمة الأرصفة المعرفة ثابتًا.
 * المدخلات: berthKey مفتاح الرصيف مثل A أو TRUCK.
 * المخرجات: كائن metadata للرصيف أو null إذا لم يوجد.
 * ملاحظات: لا يجري أي استعلامات؛ يعتمد فقط على DOCK_BERTHS.
 * متى يُستخدم: عند بناء الاستجابات أو التحقق من الرصيف قبل التعامل معه.
 */
function getDockBerthMeta(berthKey) {
    return DOCK_BERTHS.find((berth) => berth.key === berthKey) || null;
}

/**
 * الغرض: جلب المستويات المتاحة لرصيف معيّن أو المستويات الافتراضية عند غياب تعريف خاص.
 * المدخلات: berthKey مفتاح الرصيف.
 * المخرجات: مصفوفة مستويات الرصيف.
 * ملاحظات: يعيد DOCK_LEVELS الافتراضية إذا لم يكن للرّصيف تعريف مستويات خاص.
 * متى يُستخدم: عند عرض الشواغر أو إنشاء أماكن داخل الرصيف.
 */
function getDockLevelsForBerth(berthKey) {
    const berthMeta = getDockBerthMeta(berthKey);
    return berthMeta?.levels?.length ? berthMeta.levels : DOCK_LEVELS;
}

/**
 * الغرض: تطبيع قيمة الرصيف النصية إلى المفتاح القياسي الداخلي.
 * المدخلات: value قيمة الرصيف الخام مثل A أو رصيف A أو BERTH A.
 * المخرجات: مفتاح الرصيف القياسي أو null إذا لم يمكن التعرف عليه.
 * ملاحظات: يحاول المطابقة المباشرة ثم المطابقة عبر الاسم العربي أو الإنجليزي.
 * متى يُستخدم: قبل التحقق من الوجهات أو إنشاء الحاويات أو التعامل مع الشواغر.
 */
function normalizeDockBerthKey(value) {
    const normalizedValue = String(value || '').trim().toUpperCase();
    if (!normalizedValue) {
        return null;
    }

    const directMatch = getDockBerthMeta(normalizedValue);
    if (directMatch) {
        return directMatch.key;
    }

    const berthMatch = DOCK_BERTHS.find((berth) => (
        normalizedValue === String(berth.label || '').trim().toUpperCase()
        || normalizedValue === `رصيف ${berth.key}`
        || normalizedValue === `BERTH ${berth.key}`
        || (normalizedValue.endsWith(berth.key) && (normalizedValue.includes('رصيف') || normalizedValue.includes('BERTH')))
    ));

    return berthMatch ? berthMatch.key : null;
}

/**
 * الغرض: تحويل نوع الوجهة إلى مفتاح الرصيف المقابل له إن وجد.
 * المدخلات: destinationType نوع الوجهة مثل berth_a أو truck_berth.
 * المخرجات: مفتاح الرصيف مثل A أو TRUCK أو null إذا لم توجد مطابقة.
 * ملاحظات: يعتمد على BERTH_DESTINATION_TYPES فقط ولا يغيّر البيانات.
 * متى يُستخدم: عند ربط وجهة الحاوية ببيانات الرصيف الفعلية.
 */
function getDockBerthKeyFromDestination(destinationType) {
    return BERTH_DESTINATION_TYPES[String(destinationType || '').trim().toLowerCase()] || null;
}

/**
 * الغرض: تحويل مفتاح الرصيف إلى نوع الوجهة المعتمد في النظام.
 * المدخلات: berthKey مفتاح الرصيف الخام أو المطبّع.
 * المخرجات: نوع الوجهة مثل berth_a أو truck_berth أو null إذا لم توجد مطابقة.
 * ملاحظات: يطبّع مفتاح الرصيف أولًا للحفاظ على نفس السلوك الحالي.
 * متى يُستخدم: عند تحويل قرار توزيع على الرصيف إلى قيمة destination_type قابلة للتخزين.
 */
function getDestinationTypeFromDockBerthKey(berthKey) {
    const normalizedBerthKey = normalizeDockBerthKey(berthKey);
    if (!normalizedBerthKey) {
        return null;
    }

    const mappedEntry = Object.entries(BERTH_DESTINATION_TYPES)
        .find(([, mappedBerthKey]) => mappedBerthKey === normalizedBerthKey);

    return mappedEntry?.[0] || null;
}

/**
 * الغرض: توصيف حالة الرصيف الحالية حسب عدد الأماكن المشغولة والإجمالية.
 * المدخلات: occupiedCount عدد الأماكن المشغولة، و totalSlots العدد الإجمالي.
 * المخرجات: نص عربي يصف الحالة مثل فارغ أو ممتلئ أو قيد التشغيل.
 * ملاحظات: الدالة وصفية فقط ولا تحدّث أي سجل في قاعدة البيانات.
 * متى يُستخدم: عند تجهيز بيانات لوحة التحكم أو ملخصات حالة الأرصفة.
 */
function getDockBerthStatus(occupiedCount, totalSlots) {
    if (!occupiedCount) {
        return 'فارغ';
    }

    if (occupiedCount >= totalSlots) {
        return 'ممتلئ';
    }

    return 'قيد التشغيل';
}

module.exports = {
    normalizeMysqlDateTime,
    normalizeDischargePriority,
    normalizeContainerCondition,
    normalizeContainerDestination,
    normalizeCargoType,
    getPriorityRank,
    getDestinationRank,
    getContainerCompletionStatus,
    getDefaultFinalLocation,
    getDockLevelMeta,
    getDockBerthMeta,
    getDockLevelsForBerth,
    normalizeDockBerthKey,
    getDockBerthKeyFromDestination,
    getDestinationTypeFromDockBerthKey,
    getDockBerthStatus
};
