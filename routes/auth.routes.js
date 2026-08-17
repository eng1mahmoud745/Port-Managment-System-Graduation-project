const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { hashPassword, comparePassword } = require('../utils/password.utils');

function createAuthRoutes({
    db,
    sessions,
    tableHasColumn,
    normalizeRoleKey,
    getRoleRedirectPath,
    getSessionIdFromRequest,
    setNoStoreHeaders,
    isDisabledAccountStatus,
    publicDir
}) {
    const router = express.Router();

    function getRootPageHandler(req, res) {
        res.sendFile(path.join(publicDir, 'login.html'));
    }

    function getLoginPageHandler(req, res) {
        res.sendFile(path.join(publicDir, 'login.html'));
    }

    function getDriverPageHandler(req, res) {
        res.sendFile(path.join(publicDir, 'driver.html'));
    }

/**
 * الغرض: تنفيذ تسجيل الدخول باستخدام البريد الإلكتروني فقط ثم التحقق الآمن من كلمة المرور مع دعم lazy migration للمستخدمين القدامى.
 * المدخلات: req.body ويحتوي على email وpassword، وres لإرجاع redirect مناسب بحسب النتيجة.
 * المخرجات: يعيد التوجيه إلى صفحة الدور المناسبة عند النجاح أو إلى صفحة login مع error query عند الفشل.
 * الآثار الجانبية: قد يضيف جلسة جديدة إلى sessions، وقد يحدّث كلمة المرور القديمة في قاعدة البيانات إلى bcrypt hash بعد أول دخول ناجح.
 * ملاحظات: يحافظ على نفس منطق account status وsessions وrole redirects الحالي من دون استخدام مقارنة SQL مباشرة على password.
 */
    function loginHandler(req, res) {
        const { email, password } = req.body;

        tableHasColumn('Users', 'account_status', (statusErr, hasAccountStatusColumn) => {
            if (statusErr) {
                console.error(statusErr);
                return res.redirect('/login.html?error=DatabaseError');
            }

            const accountStatusSelect = hasAccountStatusColumn
                ? `COALESCE(account_status, 'active') AS account_status`
                : `'active' AS account_status`;

            const query = `
                SELECT role, password, ${accountStatusSelect}
                FROM Users
                WHERE email = ?
                LIMIT 1
            `;

            db.query(query, [email], async (err, results) => {
                if (err) {
                    console.error(err);
                    return res.redirect('/login.html?error=DatabaseError');
                }

                if (!results.length) {
                    return res.redirect('/login.html?error=InvalidCredentials');
                }

                if (isDisabledAccountStatus(results[0].account_status)) {
                    return res.redirect('/login.html?error=AccountDisabled');
                }

                try {
                    const passwordCheck = await comparePassword(password, results[0].password);
                    if (!passwordCheck.isMatch) {
                        return res.redirect('/login.html?error=InvalidCredentials');
                    }

                    if (passwordCheck.needsRehash) {
                        try {
                            const hashedPassword = await hashPassword(password);
                            db.query(
                                `
                                    UPDATE Users
                                    SET password = ?
                                    WHERE email = ?
                                `,
                                [hashedPassword, email],
                                (updateErr) => {
                                    if (updateErr) {
                                        console.error('Lazy migration password update error:', updateErr);
                                    }
                                }
                            );
                        } catch (migrationErr) {
                            console.error('Lazy migration password hashing error:', migrationErr);
                        }
                    }

                    const userRole = normalizeRoleKey(results[0].role);
                    const sessionId = crypto.randomUUID();
                    sessions.set(sessionId, {
                        email,
                        role: userRole,
                        createdAt: Date.now()
                    });
                    res.setHeader('Set-Cookie', `session_id=${sessionId}; HttpOnly; Path=/; SameSite=Lax`);

                    return res.redirect(getRoleRedirectPath(userRole, email, sessionId));
                } catch (compareErr) {
                    console.error(compareErr);
                    return res.redirect('/login.html?error=DatabaseError');
                }
            });
        });
    }

    function logoutHandler(req, res) {
        const sessionId = getSessionIdFromRequest(req);

        if (sessionId) {
            sessions.delete(sessionId);
        }

        setNoStoreHeaders(res);
        res.setHeader('Set-Cookie', 'session_id=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
        return res.status(200).json({ success: true });
    }

    function getSessionStatusHandler(req, res) {
        if (!req.authSession) {
            return res.status(401).json({ success: false, authenticated: false });
        }

        const assignedWarehousesCount = Number(req.authUser?.assigned_warehouses_count || 0);
        const hasWarehouseAssignment = req.authSession.role !== 'supervisor' || assignedWarehousesCount > 0;

        return res.status(200).json({
            success: true,
            authenticated: true,
            session: {
                email: req.authSession.email,
                role: req.authSession.role,
                sid: getSessionIdFromRequest(req),
                assignedWarehousesCount,
                hasWarehouseAssignment
            }
        });
    }

    router.get('/', getRootPageHandler);
    router.get('/login', getLoginPageHandler);
    router.get('/driver', getDriverPageHandler);
    router.post('/api/login', loginHandler);
    router.post('/api/logout', logoutHandler);
    router.get('/api/session-status', getSessionStatusHandler);

    return router;
}

module.exports = {
    createAuthRoutes
};
