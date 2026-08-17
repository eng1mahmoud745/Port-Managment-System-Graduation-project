/**
 * مسؤولية الملف: تجميع دوال المساعدة البسيطة الخاصة باسترجاع الجلسة من الطلب بالاعتماد على مخزن الجلسات الحالي.
 * ملاحظات: هذا الملف لا يملك مخزن الجلسات بنفسه، بل يستقبل sessions Map من الخارج لتقليل المخاطر والحفاظ على السلوك الحالي.
 */

const { getSessionIdFromRequest } = require('./auth.utils');

/**
 * الغرض: جلب الجلسة الحالية من الطلب بالاعتماد على معرف الجلسة ومخزن الجلسات الحالي.
 * المدخلات: req كائن الطلب من Express، و sessions مخزن الجلسات من نوع Map.
 * المخرجات: كائن الجلسة إذا وُجد، أو null إذا لم يوجد معرف جلسة أو لم تكن الجلسة موجودة.
 * ملاحظات: لا ينشئ جلسة جديدة ولا يعدّل مخزن الجلسات؛ فقط يقرأ منه باستخدام نفس طريقة استخراج session id الحالية.
 * متى يُستخدم: في middleware المصادقة أو في فحص الصلاحيات عند الحاجة للوصول إلى req.authSession أو إعادة بنائها.
 */
function getSessionFromRequest(req, sessions) {
    const sessionId = getSessionIdFromRequest(req);
    if (!sessionId || !sessions || typeof sessions.get !== 'function') {
        return null;
    }

    return sessions.get(sessionId) || null;
}

module.exports = {
    getSessionFromRequest
};
