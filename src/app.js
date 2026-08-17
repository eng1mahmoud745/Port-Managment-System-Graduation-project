const express = require('express');
const path = require('path');
const db = require('./config/database');
const env = require('./config/env');
const runtime = require('./core/runtime');
const createAuthGuard = require('./middlewares/authGuard');
const registerRoutes = require('./routes');

runtime.setDatabase(db);

const app = express();
const publicDir = path.resolve(__dirname, '..', 'public');

const context = {
    ...runtime,
    db,
    publicDir
};

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(createAuthGuard(context));
app.use(express.static(publicDir));

registerRoutes(app, context);

module.exports = {
    app,
    env,
    runtime
};
