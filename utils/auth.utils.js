/**
 * مسؤولية الملف: تجميع دوال المساعدة العامة المتعلقة بالصلاحيات ومسارات إعادة التوجيه وقراءة الجلسة من الطلب.
 * ملاحظات: الملف يحتوي فقط على دوال آمنة وقابلة لإعادة الاستخدام من دون نقل منطق المصادقة المعقد أو middleware الكامل.
 */

const {
    ROLE_ALIASES,
    STORED_ROLE_NAMES,
    PAGE_ROLE_ACCESS
} = require('../config/constants');

/**
 * الغرض: توحيد اسم الصلاحية إلى مفتاح قياسي داخلي.
 * المدخلات: role قيمة الصلاحية الخام بأي تنسيق نصي.
 * المخرجات: مفتاح الصلاحية بعد التطبيع مثل admin أو dockmanager.
 * ملاحظات: يعتمد على ROLE_ALIASES وقد يعيد القيمة نفسها إذا لم يجد مرادفًا مطابقًا.
 * متى يُستخدم: عند مقارنة الصلاحيات أو تحويل القيم القادمة من قاعدة البيانات أو الطلب.
 */
function normalizeRoleKey(role) {
    const normalizedValue = String(role || '').trim().toLowerCase();
    return ROLE_ALIASES[normalizedValue] || normalizedValue;
}

/**
 * الغرض: إرجاع اسم الصلاحية المخزن بالشكل المعتمد في قاعدة البيانات.
 * المدخلات: role قيمة الصلاحية الخام أو المفتاح الداخلي.
 * المخرجات: الاسم النهائي المطلوب للتخزين أو المقارنة مثل Admin أو Driver.
 * ملاحظات: يستفيد من normalizeRoleKey قبل الرجوع إلى STORED_ROLE_NAMES.
 * متى يُستخدم: عند إنشاء أو تحديث مستخدمين مع الحفاظ على نفس صيغة الأدوار الحالية.
 */
function getStoredRoleName(role) {
    const roleKey = normalizeRoleKey(role);
    return STORED_ROLE_NAMES[roleKey] || String(role || '').trim();
}

/**
 * الغرض: بناء مسار URL مع query parameters من دون إضافة القيم الفارغة.
 * المدخلات: pathname المسار الأساسي، و params كائن يحتوي على القيم المراد إضافتها.
 * المخرجات: رابط نهائي قد يحتوي على query string أو المسار كما هو.
 * ملاحظات: يتجاهل القيم null و undefined والسلاسل الفارغة.
 * متى يُستخدم: عند تجهيز روابط إعادة التوجيه أو التنقل المرتبطة بالجلسة.
 */
function buildPathWithParams(pathname, params = {}) {
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            searchParams.set(key, value);
        }
    });

    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
}

/**
 * الغرض: تحديد صفحة إعادة التوجيه المناسبة بناءً على صلاحية المستخدم.
 * المدخلات: roleKey مفتاح الصلاحية، email البريد الإلكتروني، sessionId معرف الجلسة الحالي.
 * المخرجات: مسار الصفحة المناسبة مع المعاملات المطلوبة.
 * ملاحظات: قد يضيف البريد الإلكتروني أو معرف الجلسة حسب نوع الصفحة المستهدفة.
 * متى يُستخدم: بعد تسجيل الدخول أو عند إعادة التوجيه إلى الصفحة الرئيسية الخاصة بالدور.
 */
function getRoleRedirectPath(roleKey, email, sessionId = '') {
    if (roleKey === 'admin') {
        return buildPathWithParams('/admin.html', { sid: sessionId });
    }

    if (roleKey === 'supervisor') {
        return buildPathWithParams('/supervisor.html', { sid: sessionId });
    }

    if (roleKey === 'mechanic') {
        return buildPathWithParams('/mechanic.html', { sid: sessionId });
    }

    if (roleKey === 'dockmanager') {
        return buildPathWithParams('/dockmanager.html', { sid: sessionId });
    }

    if (roleKey === 'driver') {
        return buildPathWithParams('/driver_profile.html', {
            email,
            sid: sessionId
        });
    }

    return buildPathWithParams('/vehicles2.html', { sid: sessionId });
}

/**
 * الغرض: جلب قائمة الصلاحيات المسموح بها لمسار صفحة معيّن.
 * المدخلات: pathname مسار الصفحة المطلوب فحصه.
 * المخرجات: مصفوفة صلاحيات إذا كان المسار محميًا أو null إذا لم يكن معرفًا.
 * ملاحظات: يعتمد على جدول PAGE_ROLE_ACCESS الثابت.
 * متى يُستخدم: داخل فحص الوصول للصفحات الثابتة المعتمدة على الدور.
 */
function getAllowedRolesForPath(pathname) {
    return PAGE_ROLE_ACCESS[pathname] || null;
}

/**
 * الغرض: تحليل ترويسة cookies القادمة مع الطلب إلى كائن مفتاح/قيمة.
 * المدخلات: req كائن الطلب من Express.
 * المخرجات: كائن يحتوي على جميع الـ cookies المقروءة من الترويسة.
 * ملاحظات: يفك ترميز القيم باستخدام decodeURIComponent ولا يغيّر كائن الطلب نفسه.
 * متى يُستخدم: عند الحاجة لاستخراج session_id أو أي cookie أخرى من الطلب.
 */
function parseCookies(req) {
    const header = req.headers.cookie || '';
    return header.split(';').reduce((cookies, item) => {
        const [rawKey, ...rawValue] = item.split('=');
        const key = String(rawKey || '').trim();

        if (!key) {
            return cookies;
        }

        cookies[key] = decodeURIComponent(rawValue.join('=').trim() || '');
        return cookies;
    }, {});
}

/**
 * الغرض: استخراج معرف الجلسة من الطلب بحسب الأولوية المعتمدة حاليًا.
 * المدخلات: req كائن الطلب من Express.
 * المخرجات: معرف الجلسة كسلسلة نصية أو null إذا لم يوجد.
 * ملاحظات: يفحص أولًا header ثم query ثم cookie بنفس الترتيب الحالي للمشروع.
 * متى يُستخدم: في أي موضع يحتاج الوصول إلى الجلسة الحالية من دون تكرار منطق الاستخراج.
 */
function getSessionIdFromRequest(req) {
    const headerSessionId = String(req.headers['x-session-id'] || '').trim();
    if (headerSessionId) {
        return headerSessionId;
    }

    const querySessionId = String(req.query?.sid || '').trim();
    if (querySessionId) {
        return querySessionId;
    }

    const cookies = parseCookies(req);
    return String(cookies.session_id || '').trim() || null;
}

/**
 * الغرض: منع المتصفح والوسائط الوسيطة من تخزين الاستجابة مؤقتًا.
 * المدخلات: res كائن الاستجابة من Express.
 * المخرجات: لا يعيد قيمة؛ فقط يضبط ترويسات الاستجابة.
 * ملاحظات: يعدّل كائن res مباشرة عبر set، وهو side effect مقصود.
 * متى يُستخدم: قبل إرسال صفحات أو بيانات يجب ألا تُعرض من الكاش بعد تسجيل الخروج أو انتهاء الجلسة.
 */
function setNoStoreHeaders(res) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
}

/**
 * الغرض: تحديد ما إذا كان المسار الحالي عامًا ولا يتطلب جلسة أو صلاحية.
 * المدخلات: pathname مسار الطلب.
 * المخرجات: true إذا كان المسار عامًا، و false خلاف ذلك.
 * ملاحظات: يعتمد على نفس القائمة الحالية للمسارات والملفات العامة.
 * متى يُستخدم: داخل middleware التحقق العام قبل فرض الجلسة على الطلبات.
 */
function isPublicPath(pathname) {
    if (
        pathname === '/' ||
        pathname === '/login' ||
        pathname === '/login.html' ||
        pathname === '/api/login' ||
        pathname === '/api/logout'
    ) {
        return true;
    }

    return (
        pathname.startsWith('/stylesheets/') ||
        pathname.startsWith('/scripts/') ||
        pathname.startsWith('/images/') ||
        pathname.startsWith('/assets/') ||
        pathname.startsWith('/favicon')
    );
}

module.exports = {
    normalizeRoleKey,
    getStoredRoleName,
    buildPathWithParams,
    getRoleRedirectPath,
    getAllowedRolesForPath,
    parseCookies,
    getSessionIdFromRequest,
    setNoStoreHeaders,
    isPublicPath
};
