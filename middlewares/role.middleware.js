/**
 * مسؤولية الملف: تجميع middleware ودوال فحص الصلاحيات المعتمدة على الجلسة الحالية من دون المساس بمنطق الأعمال أو الاستعلامات.
 * ملاحظات: الملف يعتمد على مخزن الجلسات الذي يتم تمريره من الملف الرئيسي حتى تبقى إدارة الجلسات في مكانها الحالي.
 */

const { normalizeRoleKey } = require('../utils/auth.utils');
const { getSessionFromRequest } = require('../utils/session.utils');

/**
 * الغرض: التحقق مما إذا كانت الجلسة الحالية تحمل واحدة من الصلاحيات المطلوبة.
 * المدخلات: session كائن الجلسة الحالي، و allowedRoles مصفوفة الصلاحيات المسموح بها.
 * المخرجات: true إذا كانت الجلسة تملك صلاحية مطلوبة، و false خلاف ذلك.
 * ملاحظات: يطبّع الصلاحيات قبل المقارنة للحفاظ على نفس السلوك الحالي في المشروع.
 * متى يُستخدم: قبل السماح بالوصول إلى route أو صفحة تتطلب صلاحيات محددة.
 */
function hasRequiredRole(session, allowedRoles = []) {
    if (!session || !allowedRoles.length) {
        return false;
    }

    return allowedRoles.some((role) => normalizeRoleKey(role) === normalizeRoleKey(session.role));
}

/**
 * الغرض: إنشاء middleware يتحقق من وجود الجلسة ومن امتلاك المستخدم للصلاحيات المطلوبة.
 * المدخلات: sessions مخزن الجلسات الحالي من نوع Map.
 * المخرجات: تابع requireRoles مطابق للاستعمال الحالي داخل app.js والـ routes.
 * ملاحظات: يعيد نفس استجابات JSON الحالية ولا يغيّر طريقة قراءة الجلسة من الطلب.
 * متى يُستخدم: مرة واحدة في الملف الرئيسي لإنشاء requireRoles ثم استخدامه على الـ routes المحمية كما هو.
 */
function createRequireRoles(sessions) {
    /**
     * الغرض: بناء middleware صلاحيات لRoute معيّن باستخدام قائمة صلاحيات مسموحة.
     * المدخلات: allowedRoles مصفوفة الصلاحيات المسموح بها لهذا المسار.
     * المخرجات: middleware Express يفحص الجلسة والصلاحية ثم يكمل أو يعيد خطأ.
     * ملاحظات: يعتمد على req.authSession إذا كانت موجودة، وإلا يعيد قراءة الجلسة من الطلب.
     * متى يُستخدم: مباشرة في تعريفات routes مثل requireRoles(['admin']).
     */
    return function requireRoles(allowedRoles = []) {
        return (req, res, next) => {
            const session = req.authSession || getSessionFromRequest(req, sessions);

            if (!session) {
                return res.status(401).json({ success: false, message: 'انتهت الجلسة، يرجى تسجيل الدخول من جديد.' });
            }

            if (!hasRequiredRole(session, allowedRoles)) {
                return res.status(403).json({ success: false, message: 'ليست لديك صلاحية للوصول إلى هذه الصفحة.' });
            }

            return next();
        };
    };
}

module.exports = {
    hasRequiredRole,
    createRequireRoles
};
