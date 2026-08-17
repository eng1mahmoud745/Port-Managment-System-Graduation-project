// Function createAuthGuard: Builds the authentication and authorization middleware for protected routes.
module.exports = function createAuthGuard(context) {
    const {
        getSessionFromRequest,
        setNoStoreHeaders,
        isPublicPath,
        getAllowedRolesForPath,
        hasRequiredRole,
        getRoleRedirectPath,
        getSessionIdFromRequest
    } = context;

    return (req, res, next) => {
        const pathname = req.path;
        const session = getSessionFromRequest(req);
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
                return res.status(401).json({ success: false, message: '????? ??????? ???? ????? ?????? ?? ????.' });
            }

            return res.redirect('/login.html');
        }

        const allowedRoles = getAllowedRolesForPath(pathname);
        if (allowedRoles && session && !hasRequiredRole(session, allowedRoles)) {
            return res.redirect(getRoleRedirectPath(session.role, session.email, getSessionIdFromRequest(req)));
        }

        return next();
    };
};
