const { app, env, runtime } = require('./app');

// Function startServer: Bootstraps database initialization and starts the HTTP server listener.
function startServer() {
    runtime.initializeDatabase();

    app.listen(env.port, () => {
        console.log(`Server listening at http://localhost:${env.port}`);
    });
}

module.exports = {
    startServer
};

if (require.main === module) {
    startServer();
}
