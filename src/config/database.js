const mysql = require('mysql2');
const env = require('./env');

const dbConfig = { ...env.db };
if (!Number.isFinite(dbConfig.port)) {
    delete dbConfig.port;
}

const db = mysql.createConnection(dbConfig);

module.exports = db;
