/**
 * مسؤولية الملف: إنشاء middleware المصادقة العام المسؤول عن قراءة الجلسة، حماية الصفحات والواجهات، والتحقق من حالة الحساب.
 * ملاحظات: هذا الملف لا يملك الجلسات ولا منطق المستخدمين بنفسه، بل يستقبل الاعتمادات اللازمة من الملف الرئيسي للحفاظ على السلوك الحالي.
 */

const {
    getRoleRedirectPath,
    getAllowedRolesForPath,
    getSessionIdFromRequest,
    setNoStoreHeaders,
    isPublicPath
} = require('../utils/auth.utils');
const { getSessionFromRequest } = require('../utils/session.utils');
const { hasRequiredRole } = require('./role.middleware');

/**
 * الغرض: إنشاء middleware عام يفحص الجلسة الحالية ويطبّق نفس منطق الحماية وإعادة التوجيه الحالي.
 * المدخلات: كائن إعدادات يحتوي على sessions و getUserAccountByEmail و isDisabledAccountStatus.
 * المخرجات: middleware Express جاهز للاستخدام عبر app.use(...).
 * ملاحظات: يحقن req.authSession و req.authUser، وقد يحذف الجلسة ويضبط cookie الحذف عند تعطيل الحساب.
 * متى يُستخدم: مرة واحدة في الملف الرئيسي قبل تعريف الملفات الثابتة والـ routes المحمية.
 */
function createAuthMiddleware({
    sessions,
    getUserAccountByEmail,
    isDisabledAccountStatus
}) {
    return (req, res, next) => {
        const pathname = req.path;
        const session = getSessionFromRequest(req, sessions);
        req.authSession = session;

        const isHtmlRequest = pathname.endsWith('.html') || pathname === '/driver';
        const isApiRequest = pathname.startsWith('/api/');

        if (pathname === '/' || pathname === '/login' || pathname === '/login.html' || isHtmlRequest || isApiRequest) {
            setNoStoreHeaders(res);
        }

        if (isPublicPath(pathname)) {
            return next();
        }

        if (!session && (isHtmlRequest || isApiRequest)) {
            if (isApiRequest) {
                return res.status(401).json({ success: false, message: 'انتهت الجلسة، يرجى تسجيل الدخول من جديد.' });
            }

            return res.redirect('/login.html');
        }

        if (!session || (!isHtmlRequest && !isApiRequest)) {
            const allowedRoles = getAllowedRolesForPath(pathname);
            if (allowedRoles && session && !hasRequiredRole(session, allowedRoles)) {
                return res.redirect(getRoleRedirectPath(session.role, session.email, getSessionIdFromRequest(req)));
            }

            return next();
        }

        return getUserAccountByEmail(session.email, (accountErr, account) => {
            if (accountErr) {
                console.error('Error checking user account status:', accountErr);
                if (isApiRequest) {
                    return res.status(500).json({ success: false, message: 'تعذر التحقق من حالة الحساب.' });
                }

                return res.redirect('/login.html');
            }

            if (!account || isDisabledAccountStatus(account.account_status)) {
                sessions.delete(getSessionIdFromRequest(req));
                res.setHeader('Set-Cookie', 'session_id=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');

                if (isApiRequest) {
                    return res.status(403).json({ success: false, message: 'تم تعطيل هذا الحساب من قبل الإدارة.' });
                }

                return res.redirect('/login.html?error=AccountDisabled');
            }

            req.authUser = account;

            const isSupervisor = String(session.role || '').trim().toLowerCase() === 'supervisor';
            const assignedWarehousesCount = Number(account.assigned_warehouses_count || 0);
            const isSupervisorMissingWarehouse = isSupervisor && assignedWarehousesCount <= 0;

            if (isApiRequest && isSupervisorMissingWarehouse && pathname !== '/api/session-status' && pathname !== '/api/logout') {
                return res.status(403).json({
                    success: false,
                    code: 'SUPERVISOR_WAREHOUSE_REQUIRED',
                    message: 'لا يمكنك استخدام بيانات وصفحة المشرف التشغيلية قبل ربط حسابك بمستودع واحد على الأقل.'
                });
            }

            const allowedRoles = getAllowedRolesForPath(pathname);
            if (allowedRoles && !hasRequiredRole(session, allowedRoles)) {
                return res.redirect(getRoleRedirectPath(session.role, session.email, getSessionIdFromRequest(req)));
            }

            return next();
        });
    };
}

module.exports = {
    createAuthMiddleware
};
