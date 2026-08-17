const path = require('path');
// Function registerAuthRoutes: Registers authentication/session endpoints such as login, logout, and session status.
module.exports = function registerAuthRoutes(app, context) {
    const {
        db,
        crypto,
        sessions,
        normalizeRoleKey,
        getRoleRedirectPath,
        getSessionIdFromRequest,
        setNoStoreHeaders,
        publicDir
    } = context;

// Route handler [GET] /: Serves the login page as the default app entry.
app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'login.html'));
});

// Route handler [GET] /login: Serves the login page explicitly.
app.get('/login', (req, res) => {
    res.sendFile(path.join(publicDir, 'login.html'));
});

// Route handler [GET] /driver: Serves the driver page shell.
app.get('/driver', (req, res) => {
    res.sendFile(path.join(publicDir, 'driver.html'));
});

// Route handler [POST] /api/login: Authenticates user credentials, creates session state, and redirects by role.
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    const query = 'SELECT role FROM Users WHERE email = ? AND password = ?';

    db.query(query, [email, password], (err, results) => {
        if (err) {
            console.error(err);
            return res.redirect('/login.html?error=DatabaseError');
        }

        if (results.length > 0) {
            const userRole = normalizeRoleKey(results[0].role);
            const sessionId = crypto.randomUUID();
            sessions.set(sessionId, {
                email,
                role: userRole,
                createdAt: Date.now()
            });
            res.setHeader('Set-Cookie', `session_id=${sessionId}; HttpOnly; Path=/; SameSite=Lax`);

            return res.redirect(getRoleRedirectPath(userRole, email, sessionId));
        }

        return res.redirect('/login.html?error=InvalidCredentials');
    });
});

// Route handler [POST] /api/logout: Clears current session and authentication cookie.
app.post('/api/logout', (req, res) => {
    const sessionId = getSessionIdFromRequest(req);

    if (sessionId) {
        sessions.delete(sessionId);
    }

    setNoStoreHeaders(res);
    res.setHeader('Set-Cookie', 'session_id=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
    return res.status(200).json({ success: true });
});

// Route handler [GET] /api/session-status: Returns current authentication/session status for the client.
app.get('/api/session-status', (req, res) => {
    if (!req.authSession) {
        return res.status(401).json({ success: false, authenticated: false });
    }

    return res.status(200).json({
        success: true,
        authenticated: true,
        session: {
            email: req.authSession.email,
            role: req.authSession.role,
            sid: getSessionIdFromRequest(req)
        }
    });
});

};
