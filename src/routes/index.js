const registerAuthRoutes = require('./authRoutes');
const registerAdminRoutes = require('./adminRoutes');
const registerDockRoutes = require('./dockRoutes');
const registerDriverRoutes = require('./driverRoutes');

// Function registerRoutes: Registers all feature route modules on the Express application.
module.exports = function registerRoutes(app, context) {
    registerAuthRoutes(app, context);
    registerAdminRoutes(app, context);
    registerDockRoutes(app, context);
    registerDriverRoutes(app, context);
};
