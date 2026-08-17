const dotenv = require('dotenv');

dotenv.config();

const useEnvDatabaseConfig = String(process.env.DB_USE_ENV || '').trim().toLowerCase() === 'true';

const legacyDatabaseConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'port_mng_db'
};

const environmentDatabaseConfig = {
    host: process.env.DB_HOST || legacyDatabaseConfig.host,
    user: process.env.DB_USER || legacyDatabaseConfig.user,
    password: process.env.DB_PASSWORD || legacyDatabaseConfig.password,
    database: process.env.DB_NAME || legacyDatabaseConfig.database,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined
};

module.exports = {
    port: Number(process.env.PORT || 3000),
    db: useEnvDatabaseConfig ? environmentDatabaseConfig : legacyDatabaseConfig
};
