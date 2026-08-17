/**
 * مسؤولية الملف: تجميع دوال المساعدة العامة الخاصة بتطبيع الأكواد النصية ومقارنتها وصياغتها.
 * ملاحظات: الملف لا ينفذ أي استعلامات مباشرة، بل يوفّر دوال نقية يمكن استدعاؤها من منطق الأعمال الحالي.
 */

/**
 * الغرض: تنظيف كود الكيان وتحويله لصيغة موحدة قابلة للمقارنة.
 * المدخلات: value قيمة الكود الخام.
 * المخرجات: كود بالحروف الكبيرة ومن دون فراغات داخلية.
 * ملاحظات: لا يتحقق من وجود الكود في قاعدة البيانات.
 * متى يُستخدم: قبل إنشاء الأكواد أو فحص التعارض أو التطبيع العام.
 */
function normalizeEntityCodeInput(value) {
    return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * الغرض: تهريب الأحرف الخاصة في النص قبل استخدامه داخل تعبير RegExp.
 * المدخلات: value النص المراد تهريبه.
 * المخرجات: نص صالح للاستخدام الحرفي داخل تعبير منتظم.
 * ملاحظات: لا يغير المعنى التجاري للنص، فقط يمنع تفسير الرموز الخاصة.
 * متى يُستخدم: عند بناء RegExp ديناميكي اعتمادًا على قيمة يزوّدها المستخدم أو النظام.
 */
function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * الغرض: تطبيع بادئة الكود وإزالة الشرطات الزائدة في نهايتها.
 * المدخلات: value البادئة الخام.
 * المخرجات: بادئة موحدة بالحروف الكبيرة وجاهزة لتكوين كود تسلسلي.
 * ملاحظات: يعتمد على normalizeEntityCodeInput للحفاظ على نفس أسلوب التطبيع الحالي.
 * متى يُستخدم: قبل إنشاء كود تسلسلي جديد أو مقارنة البوادئ.
 */
function normalizeCodePrefix(value) {
    return normalizeEntityCodeInput(value).replace(/-+$/g, '');
}

/**
 * الغرض: إنشاء كود تسلسلي قياسي من بادئة ورقم تسلسل.
 * المدخلات: prefix بادئة الكود، و sequence رقم التسلسل.
 * المخرجات: كود بصيغة PREFIX-01 أو ما يعادلها.
 * ملاحظات: يضمن حدًا أدنى للتسلسل ويسند البادئة الافتراضية GEN عند غيابها.
 * متى يُستخدم: عند توليد أكواد جديدة أو إعادة صياغة أكواد مخزنة.
 */
function formatSequentialCode(prefix, sequence) {
    const normalizedPrefix = normalizeCodePrefix(prefix) || 'GEN';
    const normalizedSequence = Math.max(parseInt(sequence, 10) || 1, 1);
    return `${normalizedPrefix}-${String(normalizedSequence).padStart(2, '0')}`;
}

/**
 * الغرض: تحويل الكود المخزن أو المدخل إلى الصيغة القياسية المعتمدة للمشروع.
 * المدخلات: value الكود الخام أو المخزن سابقًا.
 * المخرجات: كود موحّد إن أمكن أو القيمة المطبعة مباشرة.
 * ملاحظات: يعيد صياغة الأكواد البسيطة مثل ABC1 إلى ABC-01 مع الحفاظ على السلوك الحالي.
 * متى يُستخدم: قبل المقارنة أو الفرز أو التحقق من التعارض بين الأكواد.
 */
function normalizeStoredCode(value) {
    const normalizedValue = normalizeEntityCodeInput(value);
    const simpleCodeMatch = normalizedValue.match(/^([A-Z]+)-?(\d+)$/);

    if (simpleCodeMatch) {
        return formatSequentialCode(simpleCodeMatch[1], simpleCodeMatch[2]);
    }

    return normalizedValue;
}

/**
 * الغرض: مقارنة كودين حسب البادئة ثم الرقم التسلسلي عند الإمكان.
 * المدخلات: a الكود الأول، و b الكود الثاني.
 * المخرجات: رقم سالب أو صفر أو موجب بحسب قواعد الفرز القياسية في JavaScript.
 * ملاحظات: يطبع الكودين أولًا بنفس منطق المشروع الحالي قبل المقارنة.
 * متى يُستخدم: عند فرز القوائم التي تحتوي على أكواد مستودعات أو كيانات مشابهة.
 */
function compareEntityCodes(a, b) {
    const codeA = normalizeStoredCode(a);
    const codeB = normalizeStoredCode(b);
    const matchA = codeA.match(/^([A-Z]+)-(\d+)$/);
    const matchB = codeB.match(/^([A-Z]+)-(\d+)$/);

    if (matchA && matchB) {
        const prefixComparison = matchA[1].localeCompare(matchB[1]);
        if (prefixComparison !== 0) {
            return prefixComparison;
        }

        return parseInt(matchA[2], 10) - parseInt(matchB[2], 10);
    }

    return codeA.localeCompare(codeB);
}

module.exports = {
    normalizeEntityCodeInput,
    escapeRegExp,
    normalizeCodePrefix,
    formatSequentialCode,
    normalizeStoredCode,
    compareEntityCodes
};
