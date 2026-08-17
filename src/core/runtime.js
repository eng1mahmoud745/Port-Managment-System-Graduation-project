const crypto = require('crypto');

let db = null;

let usersIdColumn = null;
const sessions = new Map();
const ROLE_ALIASES = {
    admin: 'admin',
    supervisor: 'supervisor',
    mechanic: 'mechanic',
    driver: 'driver',
    dockmanager: 'dockmanager',
    'dock manager': 'dockmanager',
    'dock_manager': 'dockmanager',
    'مدير رصيف': 'dockmanager'
};
const STORED_ROLE_NAMES = {
    admin: 'Admin',
    supervisor: 'Supervisor',
    mechanic: 'Mechanic',
    driver: 'Driver',
    dockmanager: 'DockManager'
};
const DOCK_LEVELS = [
    { key: 'upper', label: 'المستوى العلوي', prefix: 'UP' },
    { key: 'middle', label: 'المستوى المتوسط', prefix: 'MID' },
    { key: 'lower', label: 'المستوى السفلي', prefix: 'LOW' }
];
const TRUCK_BERTH_LEVELS = [
    { key: 'lower', label: 'المستوى السفلي', prefix: 'LOW', hint: 'رافعة شوكية فقط' }
];
const TRAIN_BERTH_LEVELS = [
    { key: 'lower', label: 'المستوى السفلي', prefix: 'LOW', hint: 'رافعة شوكية فقط' }
];
const DOCK_BERTHS = [
    { key: 'A', label: 'رصيف A', levels: DOCK_LEVELS },
    { key: 'B', label: 'رصيف B', levels: DOCK_LEVELS },
    { key: 'C', label: 'رصيف C', levels: DOCK_LEVELS },
    { key: 'TRUCK', label: 'رصيف الشاحنات', levels: TRUCK_BERTH_LEVELS },
    { key: 'TRAIN', label: 'رصيف القطار', levels: TRAIN_BERTH_LEVELS }
];
const ALL_DOCK_LEVELS = DOCK_LEVELS;
const BERTH_DESTINATION_TYPES = {
    berth_a: 'A',
    berth_b: 'B',
    berth_c: 'C'
};
const WAREHOUSE_TYPES = [
    'مستودع للزيوت والشحوم',
    'مستودع للاطارات',
    'مستودع للقطع الكهربائية',
    'مستودع للقطع الميكانيكية'
];
const PAGE_ROLE_ACCESS = {
    '/admin.html': ['admin'],
    '/mechanic.html': ['mechanic'],
    '/supervisor.html': ['supervisor'],
    '/dockmanager.html': ['dockmanager'],
    '/driver_profile.html': ['driver']
};

// Function normalizeRoleKey: Normalizes role values into a canonical key used by permission checks.
function normalizeRoleKey(role) {
    const normalizedValue = String(role || '').trim().toLowerCase();
    return ROLE_ALIASES[normalizedValue] || normalizedValue;
}

// Function getStoredRoleName: Maps normalized role keys to the persisted role name format.
function getStoredRoleName(role) {
    const roleKey = normalizeRoleKey(role);
    return STORED_ROLE_NAMES[roleKey] || String(role || '').trim();
}

// Function buildPathWithParams: Builds a URL path with query parameters while skipping empty values.
function buildPathWithParams(pathname, params = {}) {
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            searchParams.set(key, value);
        }
    });

    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
}

// Function getRoleRedirectPath: Resolves the post-login redirect path based on user role and session.
function getRoleRedirectPath(roleKey, email, sessionId = '') {
    if (roleKey === 'admin') {
        return buildPathWithParams('/admin.html', { sid: sessionId });
    }

    if (roleKey === 'supervisor') {
        return buildPathWithParams('/supervisor.html', { sid: sessionId });
    }

    if (roleKey === 'mechanic') {
        return buildPathWithParams('/mechanic.html', { sid: sessionId });
    }

    if (roleKey === 'dockmanager') {
        return buildPathWithParams('/dockmanager.html', { sid: sessionId });
    }

    if (roleKey === 'driver') {
        return buildPathWithParams('/driver_profile.html', {
            email,
            sid: sessionId
        });
    }

    return buildPathWithParams('/vehicles2.html', { sid: sessionId });
}

// Function getAllowedRolesForPath: Returns allowed role list for a secured page path.
function getAllowedRolesForPath(pathname) {
    return PAGE_ROLE_ACCESS[pathname] || null;
}

// Function hasRequiredRole: Checks if a session role matches at least one allowed role.
function hasRequiredRole(session, allowedRoles = []) {
    if (!session || !allowedRoles.length) {
        return false;
    }

    return allowedRoles.some((role) => normalizeRoleKey(role) === normalizeRoleKey(session.role));
}

// Function requireRoles: Creates role-based middleware guard for API endpoints.
function requireRoles(allowedRoles = []) {
    return (req, res, next) => {
        const session = req.authSession || getSessionFromRequest(req);

        if (!session) {
            return res.status(401).json({ success: false, message: 'انتهت الجلسة، يرجى تسجيل الدخول من جديد.' });
        }

        if (!hasRequiredRole(session, allowedRoles)) {
            return res.status(403).json({ success: false, message: 'ليست لديك صلاحية للوصول إلى هذه الصفحة.' });
        }

        return next();
    };
}

// Function parseCookies: Parses request cookie header into a key-value object.
function parseCookies(req) {
    const header = req.headers.cookie || '';
    return header.split(';').reduce((cookies, item) => {
        const [rawKey, ...rawValue] = item.split('=');
        const key = String(rawKey || '').trim();

        if (!key) {
            return cookies;
        }

        cookies[key] = decodeURIComponent(rawValue.join('=').trim() || '');
        return cookies;
    }, {});
}

// Function getSessionIdFromRequest: Extracts session id from header, query string, or cookies.
function getSessionIdFromRequest(req) {
    const headerSessionId = String(req.headers['x-session-id'] || '').trim();
    if (headerSessionId) {
        return headerSessionId;
    }

    const querySessionId = String(req.query?.sid || '').trim();
    if (querySessionId) {
        return querySessionId;
    }

    const cookies = parseCookies(req);
    return String(cookies.session_id || '').trim() || null;
}

// Function getSessionFromRequest: Fetches the current in-memory session from request context.
function getSessionFromRequest(req) {
    const sessionId = getSessionIdFromRequest(req);
    if (!sessionId) {
        return null;
    }

    return sessions.get(sessionId) || null;
}

// Function setNoStoreHeaders: Applies no-cache headers for sensitive pages and APIs.
function setNoStoreHeaders(res) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
}

// Function isPublicPath: Determines whether a request path is public and bypasses auth checks.
function isPublicPath(pathname) {
    if (
        pathname === '/' ||
        pathname === '/login' ||
        pathname === '/login.html' ||
        pathname === '/api/login' ||
        pathname === '/api/logout'
    ) {
        return true;
    }

    return (
        pathname.startsWith('/stylesheets/') ||
        pathname.startsWith('/scripts/') ||
        pathname.startsWith('/images/') ||
        pathname.startsWith('/assets/') ||
        pathname.startsWith('/favicon')
    );
}

// Function initializeDatabase: Connects to MySQL and runs all schema/bootstrap ensure routines.
function initializeDatabase() {
    db.connect(err => {
        if (err) {
            console.error('Error connecting to MySQL:', err.stack);
            return;
        }
        console.log('Connected to MySQL as id ' + db.threadId);
        ensureDriverColumns();
        ensureMachineDriverSchema();
        ensureWarehouseSchema();
        ensureDockSlotsSchema();
        ensureDockRequestsSchema();
        ensureIncomingVesselsSchema();
        ensureIncomingVesselContainersSchema();
        ensureIncomingVesselDischargeSchema();
    });
}

// Function getUsersIdColumn: Detects the Users table primary id column name dynamically.
function getUsersIdColumn(callback) {
    if (usersIdColumn) {
        return callback(null, usersIdColumn);
    }

    db.query(`SHOW COLUMNS FROM Users`, (err, columns) => {
        if (err) {
            console.error('Error reading Users columns:', err);
            return callback(err);
        }

        const columnNames = columns.map((column) => String(column.Field || '').toLowerCase());

        if (columnNames.includes('user_id')) {
            usersIdColumn = 'user_id';
        } else if (columnNames.includes('id')) {
            usersIdColumn = 'id';
        } else {
            usersIdColumn = String(columns[0]?.Field || 'user_id');
        }

        callback(null, usersIdColumn);
    });
}

// Function normalizeEntityCodeInput: Normalizes entity code text (trim, uppercase, remove spaces).
function normalizeEntityCodeInput(value) {
    return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

// Function escapeRegExp: Escapes text for safe usage inside RegExp patterns.
function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Function normalizeCodePrefix: Normalizes code prefix and removes trailing dashes.
function normalizeCodePrefix(value) {
    return normalizeEntityCodeInput(value).replace(/-+$/g, '');
}

// Function formatSequentialCode: Formats a sequential code in PREFIX-XX shape.
function formatSequentialCode(prefix, sequence) {
    const normalizedPrefix = normalizeCodePrefix(prefix) || 'GEN';
    const normalizedSequence = Math.max(parseInt(sequence, 10) || 1, 1);
    return `${normalizedPrefix}-${String(normalizedSequence).padStart(2, '0')}`;
}

// Function normalizeStoredCode: Normalizes stored codes to consistent comparable format.
function normalizeStoredCode(value) {
    const normalizedValue = normalizeEntityCodeInput(value);
    const simpleCodeMatch = normalizedValue.match(/^([A-Z]+)-?(\d+)$/);

    if (simpleCodeMatch) {
        return formatSequentialCode(simpleCodeMatch[1], simpleCodeMatch[2]);
    }

    return normalizedValue;
}

// Function inferWarehouseType: Infers warehouse type from warehouse name when type is missing.
function inferWarehouseType(name, currentType = '') {
    if (WAREHOUSE_TYPES.includes(currentType)) {
        return currentType;
    }

    const normalizedName = String(name || '').trim();

    if (/زيوت|شحوم/.test(normalizedName)) {
        return 'مستودع للزيوت والشحوم';
    }

    if (/اطارات|إطارات|كفرات/.test(normalizedName)) {
        return 'مستودع للاطارات';
    }

    if (/كهرب/.test(normalizedName)) {
        return 'مستودع للقطع الكهربائية';
    }

    if (/ميكاني|محركات|مكائن|قطع/.test(normalizedName)) {
        return 'مستودع للقطع الميكانيكية';
    }

    return currentType || null;
}

// Function generateSequentialCode: Generates the next available sequential code for a table scope.
function generateSequentialCode({
    tableName,
    codeColumn,
    prefix,
    scopeClause = '',
    scopeParams = []
}, callback) {
    const normalizedPrefix = normalizeCodePrefix(prefix) || 'GEN';
    const scopeSql = scopeClause ? ` AND ${scopeClause}` : '';
    const sql = `
        SELECT ${codeColumn} AS code
        FROM ${tableName}
        WHERE UPPER(${codeColumn}) LIKE ?${scopeSql}
    `;

    db.query(sql, [`${normalizedPrefix}%`, ...scopeParams], (err, results) => {
        if (err) {
            return callback(err);
        }

        const codePattern = new RegExp(`^${escapeRegExp(normalizedPrefix)}-?(\\d+)$`, 'i');
        let maxSequence = 0;

        results.forEach((row) => {
            const currentCode = normalizeEntityCodeInput(row.code);
            const match = currentCode.match(codePattern);

            if (!match) {
                return;
            }

            const currentSequence = parseInt(match[1], 10);
            if (!Number.isNaN(currentSequence) && currentSequence > maxSequence) {
                maxSequence = currentSequence;
            }
        });

        callback(null, formatSequentialCode(normalizedPrefix, maxSequence + 1));
    });
}

// Function resolveEntityCode: Resolves final entity code from user input or auto-generation rules.
function resolveEntityCode({
    submittedCode,
    defaultPrefix,
    tableName,
    codeColumn,
    scopeClause = '',
    scopeParams = []
}, callback) {
    const normalizedCode = normalizeEntityCodeInput(submittedCode);

    if (!normalizedCode) {
        return generateSequentialCode({
            tableName,
            codeColumn,
            prefix: defaultPrefix,
            scopeClause,
            scopeParams
        }, callback);
    }

    if (/^[A-Z]+$/.test(normalizedCode)) {
        return generateSequentialCode({
            tableName,
            codeColumn,
            prefix: normalizedCode,
            scopeClause,
            scopeParams
        }, callback);
    }

    callback(null, normalizeStoredCode(normalizedCode));
}

// Function findCodeConflict: Checks if a normalized code conflicts with existing records.
function findCodeConflict({
    tableName,
    codeColumn,
    candidateCode,
    scopeClause = '',
    scopeParams = [],
    excludeColumn = '',
    excludeValue = null
}, callback) {
    let sql = `SELECT * FROM ${tableName} WHERE 1=1`;
    const params = [];

    if (scopeClause) {
        sql += ` AND ${scopeClause}`;
        params.push(...scopeParams);
    }

    if (excludeColumn && excludeValue !== null && excludeValue !== undefined) {
        sql += ` AND ${excludeColumn} <> ?`;
        params.push(excludeValue);
    }

    db.query(sql, params, (err, results) => {
        if (err) {
            return callback(err);
        }

        const normalizedCandidate = normalizeStoredCode(candidateCode);
        const conflict = results.find((row) => normalizeStoredCode(row[codeColumn]) === normalizedCandidate);
        callback(null, conflict || null);
    });
}

// Function compareEntityCodes: Compares entity codes lexically and numerically by prefix/sequence.
function compareEntityCodes(a, b) {
    const codeA = normalizeStoredCode(a);
    const codeB = normalizeStoredCode(b);
    const matchA = codeA.match(/^([A-Z]+)-(\d+)$/);
    const matchB = codeB.match(/^([A-Z]+)-(\d+)$/);

    if (matchA && matchB) {
        const prefixComparison = matchA[1].localeCompare(matchB[1]);
        if (prefixComparison !== 0) {
            return prefixComparison;
        }

        return parseInt(matchA[2], 10) - parseInt(matchB[2], 10);
    }

    return codeA.localeCompare(codeB);
}


// Function ensureDriverColumns: Ensures required driver-related columns exist in Users table.
function ensureDriverColumns() {
    const query = `
        ALTER TABLE Users
        ADD COLUMN IF NOT EXISTS shift VARCHAR(100) NULL,
        ADD COLUMN IF NOT EXISTS phone VARCHAR(50) NULL,
        ADD COLUMN IF NOT EXISTS availability_status ENUM('متاح', 'مشغول') NOT NULL DEFAULT 'متاح'
    `;

    db.query(query, (err) => {
        if (err) {
            console.error('Error ensuring driver columns:', err);
            return;
        }
        console.log('Users driver columns are ready');
    });
}

// Function ensureMachineDriverSchema: Ensures machine-to-driver schema and unique driver assignment index.
function ensureMachineDriverSchema() {
    db.query(`ALTER TABLE Machines ADD COLUMN IF NOT EXISTS driver_user_id INT NULL`, (columnErr) => {
        if (columnErr) {
            console.error('Error ensuring Machines.driver_user_id column:', columnErr);
            return;
        }

        db.query(`SHOW INDEX FROM Machines WHERE Key_name = 'uniq_driver_user_id'`, (indexErr, indexResults) => {
            if (indexErr) {
                console.error('Error checking driver assignment index:', indexErr);
                return;
            }

            if (indexResults.length > 0) {
                return;
            }

            db.query(`CREATE UNIQUE INDEX uniq_driver_user_id ON Machines(driver_user_id)`, (createIndexErr) => {
                if (createIndexErr) {
                    console.error('Error creating unique driver assignment index:', createIndexErr);
                    return;
                }

                console.log('Machines driver assignment schema is ready');
            });
        });
    });
}

// Function ensureWarehouseSchema: Ensures warehouse type column exists and backfills missing values.
function ensureWarehouseSchema() {
    db.query(
        `ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS warehouse_type VARCHAR(100) NULL AFTER name`,
        (alterErr) => {
            if (alterErr) {
                console.error('Error ensuring warehouses.warehouse_type column:', alterErr);
                return;
            }

            db.query(`SELECT id, name, warehouse_type FROM warehouses`, (readErr, rows) => {
                if (readErr) {
                    console.error('Error reading warehouses for type backfill:', readErr);
                    return;
                }

                rows.forEach((warehouse) => {
                    const inferredType = inferWarehouseType(warehouse.name, warehouse.warehouse_type);
                    if (!inferredType || inferredType === warehouse.warehouse_type) {
                        return;
                    }

                    db.query(
                        `UPDATE warehouses SET warehouse_type = ? WHERE id = ?`,
                        [inferredType, warehouse.id],
                        (updateErr) => {
                            if (updateErr) {
                                console.error(`Error backfilling warehouse_type for warehouse ${warehouse.id}:`, updateErr);
                            }
                        }
                    );
                });

                console.log('Warehouses schema is ready');
            });
        }
    );
}

// Function ensureDockSlotsSchema: Creates/updates dock slots schema and seeds slot data.
function ensureDockSlotsSchema() {
    const createDockSlotsTableQuery = `
        CREATE TABLE IF NOT EXISTS dock_slots (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            berth_key VARCHAR(10) NOT NULL DEFAULT 'A',
            level_key VARCHAR(20) NOT NULL,
            slot_code VARCHAR(30) NOT NULL,
            slot_order INT NOT NULL,
            container_number VARCHAR(100) DEFAULT NULL,
            owner_name VARCHAR(255) DEFAULT NULL,
            container_type VARCHAR(50) DEFAULT NULL,
            notes VARCHAR(255) DEFAULT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_dock_slot_code (slot_code)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `;

    db.query(createDockSlotsTableQuery, (tableErr) => {
        if (tableErr) {
            console.error('Error ensuring dock_slots table:', tableErr);
            return;
        }

        db.query(
            `ALTER TABLE dock_slots ADD COLUMN IF NOT EXISTS owner_name VARCHAR(255) DEFAULT NULL AFTER container_number`,
            (alterErr) => {
                if (alterErr) {
                    console.error('Error ensuring dock_slots.owner_name column:', alterErr);
                    return;
                }

                const persistCompletion = () => db.query(
                    `ALTER TABLE dock_slots ADD COLUMN IF NOT EXISTS berth_key VARCHAR(10) NOT NULL DEFAULT 'A' AFTER id`,
                    (berthAlterErr) => {
                        if (berthAlterErr) {
                            console.error('Error ensuring dock_slots.berth_key column:', berthAlterErr);
                            return;
                        }

                        db.query(
                            `UPDATE dock_slots SET berth_key = 'A' WHERE berth_key IS NULL OR TRIM(berth_key) = ''`,
                            (backfillBerthErr) => {
                                if (backfillBerthErr) {
                                    console.error('Error backfilling dock_slots.berth_key values:', backfillBerthErr);
                                    return;
                                }

                                const legacyUpdates = [];
                                DOCK_LEVELS.forEach((level) => {
                                    for (let index = 1; index <= 9; index += 1) {
                                        const suffix = String(index).padStart(2, '0');
                                        legacyUpdates.push([
                                            `A-${level.prefix}-${suffix}`,
                                            level.key,
                                            `${level.prefix}-${suffix}`
                                        ]);
                                    }
                                });

                                for (let index = 1; index <= 9; index += 1) {
                                    const suffix = String(index).padStart(2, '0');
                                    legacyUpdates.push(['TRUCK-LOW-' + suffix, 'lower', 'TRUCK-TRK-' + suffix, 'TRUCK']);
                                    legacyUpdates.push(['TRAIN-LOW-' + suffix, 'lower', 'TRAIN-TRN-' + suffix, 'TRAIN']);
                                }

                                const updateLegacySlotCodes = (legacyIndex = 0) => {
                                    if (legacyIndex >= legacyUpdates.length) {
                                        db.query(
                                            `
                                                UPDATE dock_delivery_requests
                                                SET slot_code = CONCAT('A-', slot_code)
                                                WHERE slot_code REGEXP '^(UP|MID|LOW)-[0-9]{2}$'
                                            `,
                                            (requestBackfillErr) => {
                                                if (requestBackfillErr && requestBackfillErr.code !== 'ER_NO_SUCH_TABLE') {
                                                    console.error('Error backfilling dock_delivery_requests.slot_code values:', requestBackfillErr);
                                                    return;
                                                }

                                                db.query(
                                                    `
                                                        UPDATE dock_delivery_requests
                                                        SET slot_code = REPLACE(slot_code, 'TRUCK-TRK-', 'TRUCK-LOW-')
                                                        WHERE slot_code LIKE 'TRUCK-TRK-%'
                                                    `,
                                                    (truckRequestBackfillErr) => {
                                                        if (truckRequestBackfillErr && truckRequestBackfillErr.code !== 'ER_NO_SUCH_TABLE') {
                                                            console.error('Error backfilling truck request slot codes:', truckRequestBackfillErr);
                                                            return;
                                                        }

                                                        db.query(
                                                            `
                                                                UPDATE dock_delivery_requests
                                                                SET slot_code = REPLACE(slot_code, 'TRAIN-TRN-', 'TRAIN-LOW-')
                                                                WHERE slot_code LIKE 'TRAIN-TRN-%'
                                                            `,
                                                            (trainRequestBackfillErr) => {
                                                                if (trainRequestBackfillErr && trainRequestBackfillErr.code !== 'ER_NO_SUCH_TABLE') {
                                                                    console.error('Error backfilling train request slot codes:', trainRequestBackfillErr);
                                                                    return;
                                                                }

                                                                const seedValues = [];
                                                                DOCK_BERTHS.forEach((berth) => {
                                                                    const berthLevels = Array.isArray(berth.levels) && berth.levels.length
                                                                        ? berth.levels
                                                                        : DOCK_LEVELS;

                                                                    berthLevels.forEach((level) => {
                                                                        for (let index = 1; index <= 9; index += 1) {
                                                                            seedValues.push([
                                                                                berth.key,
                                                                                level.key,
                                                                                `${berth.key}-${level.prefix}-${String(index).padStart(2, '0')}`,
                                                                                index
                                                                            ]);
                                                                        }
                                                                    });
                                                                });

                                                                db.query(
                                                                    `
                                                                        INSERT IGNORE INTO dock_slots (berth_key, level_key, slot_code, slot_order)
                                                                        VALUES ?
                                                                    `,
                                                                    [seedValues],
                                                                    (seedErr) => {
                                                                        if (seedErr) {
                                                                            console.error('Error seeding dock slots:', seedErr);
                                                                            return;
                                                                        }

                                                                        console.log('Dock slots schema is ready');
                                                                    }
                                                                );
                                                            }
                                                        );
                                                    }
                                                );
                                            }
                                        );

                                        return;
                                    }

                                    const [newSlotCode, levelKey, legacySlotCode, berthKey = 'A'] = legacyUpdates[legacyIndex];
                                    db.query(
                                        `
                                            UPDATE dock_slots
                                            SET slot_code = ?, level_key = ?
                                            WHERE berth_key = ?
                                              AND slot_code = ?
                                        `,
                                        [newSlotCode, levelKey, berthKey, legacySlotCode],
                                        (updateErr) => {
                                            if (updateErr) {
                                                console.error(`Error backfilling dock slot code ${legacySlotCode}:`, updateErr);
                                                return;
                                            }

                                            updateLegacySlotCodes(legacyIndex + 1);
                                        }
                                    );
                                };

                                updateLegacySlotCodes();
                            }
                        );
                    }
                );
            }
        );
    });
}

// Function ensureDockRequestsSchema: Creates/updates dock delivery requests schema.
function ensureDockRequestsSchema() {
    const createDockRequestsTableQuery = `
        CREATE TABLE IF NOT EXISTS dock_delivery_requests (
            request_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            slot_id INT NOT NULL,
            container_number VARCHAR(100) NOT NULL,
            slot_code VARCHAR(30) NOT NULL,
            owner_name VARCHAR(255) DEFAULT NULL,
            driver_user_id INT NOT NULL,
            status ENUM('pending', 'approved', 'unavailable', 'completed', 'failed', 'delivered') NOT NULL DEFAULT 'pending',
            response_note VARCHAR(255) DEFAULT NULL,
            created_by_email VARCHAR(255) DEFAULT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            responded_at TIMESTAMP NULL DEFAULT NULL,
            delivered_at TIMESTAMP NULL DEFAULT NULL,
            INDEX idx_dock_requests_slot (slot_id),
            INDEX idx_dock_requests_driver (driver_user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `;

    db.query(createDockRequestsTableQuery, (tableErr) => {
        if (tableErr) {
            console.error('Error ensuring dock_delivery_requests table:', tableErr);
            return;
        }

        db.query(
            `ALTER TABLE dock_delivery_requests ADD COLUMN IF NOT EXISTS owner_name VARCHAR(255) DEFAULT NULL AFTER slot_code`,
            (ownerAlterErr) => {
                if (ownerAlterErr) {
                    console.error('Error ensuring dock_delivery_requests.owner_name column:', ownerAlterErr);
                    return;
                }

                db.query(
                    `
                        ALTER TABLE dock_delivery_requests
                        MODIFY COLUMN status ENUM('pending', 'approved', 'unavailable', 'completed', 'failed', 'delivered')
                        NOT NULL DEFAULT 'pending'
                    `,
                    (alterErr) => {
                        if (alterErr) {
                            console.error('Error updating dock request status enum:', alterErr);
                            return;
                        }

                        console.log('Dock delivery requests schema is ready');
                    }
                );
            }
        );
    });
}

// Function ensureIncomingVesselsSchema: Creates/updates incoming vessels table schema.
function ensureIncomingVesselsSchema() {
    const createIncomingVesselsTableQuery = `
        CREATE TABLE IF NOT EXISTS incoming_vessels (
            vessel_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            vessel_name VARCHAR(255) NOT NULL,
            voyage_reference VARCHAR(100) NOT NULL,
            expected_arrival DATETIME NOT NULL,
            proposed_berth VARCHAR(100) DEFAULT NULL,
            arrival_source VARCHAR(255) DEFAULT NULL,
            expected_container_count INT NOT NULL DEFAULT 0,
            arrival_shortage_reason TEXT DEFAULT NULL,
            cargo_type VARCHAR(120) DEFAULT NULL,
            discharge_priority ENUM('low', 'normal', 'high', 'urgent') NOT NULL DEFAULT 'normal',
            notes TEXT DEFAULT NULL,
            status ENUM('arriving', 'containers_added', 'discharge_planned', 'discharging', 'completed', 'cancelled', 'archived') NOT NULL DEFAULT 'arriving',
            created_by_email VARCHAR(255) DEFAULT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_incoming_vessels_status (status),
            INDEX idx_incoming_vessels_arrival (expected_arrival)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `;

    db.query(createIncomingVesselsTableQuery, (tableErr) => {
        if (tableErr) {
            console.error('Error ensuring incoming_vessels table:', tableErr);
            return;
        }

        db.query(
            `
                ALTER TABLE incoming_vessels
                ADD COLUMN IF NOT EXISTS arrival_source VARCHAR(255) DEFAULT NULL AFTER proposed_berth
            `,
            (arrivalSourceAlterErr) => {
                if (arrivalSourceAlterErr) {
                    console.error('Error ensuring incoming_vessels arrival_source column:', arrivalSourceAlterErr);
                    return;
                }

                db.query(
                    `
                        UPDATE incoming_vessels
                        SET arrival_source = proposed_berth
                        WHERE (arrival_source IS NULL OR TRIM(arrival_source) = '')
                          AND proposed_berth IS NOT NULL
                          AND TRIM(proposed_berth) <> ''
                    `,
                    (arrivalSourceBackfillErr) => {
                        if (arrivalSourceBackfillErr) {
                            console.error('Error backfilling incoming_vessels arrival_source values:', arrivalSourceBackfillErr);
                            return;
                        }

                        db.query(
                            `
                                ALTER TABLE incoming_vessels
                                ADD COLUMN IF NOT EXISTS arrival_shortage_reason TEXT DEFAULT NULL AFTER expected_container_count
                            `,
                            (shortageReasonAlterErr) => {
                                if (shortageReasonAlterErr) {
                                    console.error('Error ensuring incoming_vessels arrival_shortage_reason column:', shortageReasonAlterErr);
                                    return;
                                }

                                db.query(
                            `
                ALTER TABLE incoming_vessels
                MODIFY COLUMN discharge_priority ENUM('low', 'normal', 'high', 'urgent')
                NOT NULL DEFAULT 'normal'
            `,
                            (alterErr) => {
                                if (alterErr) {
                                    console.error('Error ensuring incoming_vessels discharge_priority enum:', alterErr);
                                    return;
                                }

                                db.query(
                                    `
                        ALTER TABLE incoming_vessels
                        MODIFY COLUMN status ENUM('arriving', 'containers_added', 'discharge_planned', 'discharging', 'completed', 'cancelled', 'archived')
                        NOT NULL DEFAULT 'arriving'
                    `,
                                    (statusAlterErr) => {
                                        if (statusAlterErr) {
                                            console.error('Error ensuring incoming_vessels status enum:', statusAlterErr);
                                            return;
                                        }

                                        console.log('Incoming vessels schema is ready');
                                    }
                                );
                            }
                        );
                            }
                        );
                    }
                );
            }
        );
    });
}

// Function ensureIncomingVesselContainersSchema: Creates/updates incoming vessel containers schema.
function ensureIncomingVesselContainersSchema() {
    const createIncomingVesselContainersTableQuery = `
        CREATE TABLE IF NOT EXISTS incoming_vessel_containers (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            vessel_id INT NOT NULL,
            container_number VARCHAR(100) NOT NULL,
            container_type VARCHAR(100) DEFAULT NULL,
            container_size ENUM('20', '40') NOT NULL,
            container_condition ENUM('sound', 'damaged', 'inspection') NOT NULL DEFAULT 'sound',
            owner_name VARCHAR(255) DEFAULT NULL,
            container_weight DECIMAL(12,2) DEFAULT NULL,
            contents VARCHAR(255) DEFAULT NULL,
            destination_type ENUM('yard', 'truck', 'warehouse', 'berth_a', 'berth_b', 'berth_c') NOT NULL DEFAULT 'yard',
            discharge_priority ENUM('low', 'normal', 'high', 'urgent') NOT NULL DEFAULT 'normal',
            status ENUM('arrived', 'scheduled', 'discharging', 'stored', 'loaded_truck', 'warehoused') NOT NULL DEFAULT 'arrived',
            final_location VARCHAR(255) DEFAULT NULL,
            actual_unloaded_at DATETIME DEFAULT NULL,
            unloaded_by_driver_name VARCHAR(255) DEFAULT NULL,
            unloaded_by_machine_name VARCHAR(255) DEFAULT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_incoming_vessel_containers_vessel (vessel_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `;

    db.query(createIncomingVesselContainersTableQuery, (tableErr) => {
        if (tableErr) {
            console.error('Error ensuring incoming_vessel_containers table:', tableErr);
            return;
        }

        db.query(
            `
                ALTER TABLE incoming_vessel_containers
                ADD COLUMN IF NOT EXISTS final_location VARCHAR(255) DEFAULT NULL,
                ADD COLUMN IF NOT EXISTS actual_unloaded_at DATETIME DEFAULT NULL,
                ADD COLUMN IF NOT EXISTS unloaded_by_driver_name VARCHAR(255) DEFAULT NULL,
                ADD COLUMN IF NOT EXISTS unloaded_by_machine_name VARCHAR(255) DEFAULT NULL,
                ADD COLUMN IF NOT EXISTS owner_name VARCHAR(255) DEFAULT NULL,
                ADD COLUMN IF NOT EXISTS container_weight DECIMAL(12,2) DEFAULT NULL
            `,
            (columnsAlterErr) => {
                if (columnsAlterErr) {
                    console.error('Error ensuring incoming_vessel_containers tracking columns:', columnsAlterErr);
                    return;
                }

                db.query(
                    `
                        ALTER TABLE incoming_vessel_containers
                        MODIFY COLUMN container_condition ENUM('sound', 'damaged', 'inspection')
                        NOT NULL DEFAULT 'sound'
                    `,
                    (conditionAlterErr) => {
                        if (conditionAlterErr) {
                            console.error('Error ensuring incoming_vessel_containers container_condition enum:', conditionAlterErr);
                            return;
                        }

                            db.query(
                                `
                                ALTER TABLE incoming_vessel_containers
                                MODIFY COLUMN destination_type ENUM('yard', 'truck', 'warehouse', 'berth_a', 'berth_b', 'berth_c')
                                NOT NULL DEFAULT 'yard'
                            `,
                                (destinationAlterErr) => {
                                if (destinationAlterErr) {
                                    console.error('Error ensuring incoming_vessel_containers destination_type enum:', destinationAlterErr);
                                    return;
                                }

                                db.query(
                                    `
                                        ALTER TABLE incoming_vessel_containers
                                        MODIFY COLUMN discharge_priority ENUM('low', 'normal', 'high', 'urgent')
                                        NOT NULL DEFAULT 'normal'
                                    `,
                                    (priorityAlterErr) => {
                                        if (priorityAlterErr) {
                                            console.error('Error ensuring incoming_vessel_containers discharge_priority enum:', priorityAlterErr);
                                            return;
                                        }

                                        db.query(
                                            `
                                                ALTER TABLE incoming_vessel_containers
                                                MODIFY COLUMN status ENUM('arrived', 'scheduled', 'discharging', 'stored', 'loaded_truck', 'warehoused')
                                                NOT NULL DEFAULT 'arrived'
                                            `,
                                            (statusAlterErr) => {
                                                if (statusAlterErr) {
                                                    console.error('Error ensuring incoming_vessel_containers status enum:', statusAlterErr);
                                                    return;
                                                }

                                                console.log('Incoming vessel containers schema is ready');
                                            }
                                        );
                                    }
                                );
                            }
                        );
                    }
                );
            }
        );
    });
}

// Function ensureIncomingVesselDischargeSchema: Creates/updates discharge plans/tasks schema for incoming vessels.
function ensureIncomingVesselDischargeSchema() {
    const createPlansTableQuery = `
        CREATE TABLE IF NOT EXISTS incoming_vessel_discharge_plans (
            plan_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            vessel_id INT NOT NULL,
            proposed_berth VARCHAR(100) DEFAULT NULL,
            status ENUM('draft', 'active', 'completed', 'cancelled') NOT NULL DEFAULT 'draft',
            generated_by_email VARCHAR(255) DEFAULT NULL,
            generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            started_at DATETIME DEFAULT NULL,
            completed_at DATETIME DEFAULT NULL,
            notes TEXT DEFAULT NULL,
            INDEX idx_discharge_plans_vessel (vessel_id),
            INDEX idx_discharge_plans_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `;

    db.query(createPlansTableQuery, (plansErr) => {
        if (plansErr) {
            console.error('Error ensuring incoming_vessel_discharge_plans table:', plansErr);
            return;
        }

        const createTasksTableQuery = `
            CREATE TABLE IF NOT EXISTS incoming_vessel_discharge_tasks (
                task_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                plan_id INT NOT NULL,
                vessel_id INT NOT NULL,
                container_id INT NOT NULL,
                container_number VARCHAR(100) NOT NULL,
                destination_type ENUM('yard', 'truck', 'warehouse', 'berth_a', 'berth_b', 'berth_c') NOT NULL,
                initial_drop_location VARCHAR(255) DEFAULT NULL,
                final_location VARCHAR(255) DEFAULT NULL,
                driver_user_id INT DEFAULT NULL,
                driver_name_snapshot VARCHAR(255) DEFAULT NULL,
                driver_response_status ENUM('pending', 'accepted', 'busy', 'failed') NOT NULL DEFAULT 'pending',
                driver_response_note VARCHAR(255) DEFAULT NULL,
                driver_responded_at DATETIME DEFAULT NULL,
                machine_id INT DEFAULT NULL,
                machine_name_snapshot VARCHAR(255) DEFAULT NULL,
                task_order INT NOT NULL DEFAULT 1,
                status ENUM('planned', 'in_progress', 'completed', 'cancelled') NOT NULL DEFAULT 'planned',
                actual_unloaded_at DATETIME DEFAULT NULL,
                actual_driver_name VARCHAR(255) DEFAULT NULL,
                actual_machine_name VARCHAR(255) DEFAULT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_discharge_tasks_plan (plan_id),
                INDEX idx_discharge_tasks_vessel (vessel_id),
                INDEX idx_discharge_tasks_container (container_id),
                INDEX idx_discharge_tasks_driver (driver_user_id),
                INDEX idx_discharge_tasks_machine (machine_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
        `;

        db.query(createTasksTableQuery, (tasksErr) => {
            if (tasksErr) {
                console.error('Error ensuring incoming_vessel_discharge_tasks table:', tasksErr);
                return;
            }

            db.query(
                `
                    ALTER TABLE incoming_vessel_discharge_tasks
                    MODIFY COLUMN destination_type ENUM('yard', 'truck', 'warehouse', 'berth_a', 'berth_b', 'berth_c')
                    NOT NULL
                `,
                (destinationAlterErr) => {
                    if (destinationAlterErr) {
                        console.error('Error ensuring incoming_vessel_discharge_tasks destination_type enum:', destinationAlterErr);
                        return;
                    }

                    db.query(
                        `
                            ALTER TABLE incoming_vessel_discharge_tasks
                            ADD COLUMN IF NOT EXISTS driver_response_status ENUM('pending', 'accepted', 'busy', 'failed')
                            NOT NULL DEFAULT 'pending' AFTER driver_name_snapshot
                        `,
                        (responseStatusErr) => {
                            if (responseStatusErr) {
                                console.error('Error ensuring incoming_vessel_discharge_tasks.driver_response_status column:', responseStatusErr);
                                return;
                            }

                            db.query(
                                `
                                    ALTER TABLE incoming_vessel_discharge_tasks
                                    MODIFY COLUMN driver_response_status ENUM('pending', 'accepted', 'busy', 'failed')
                                    NOT NULL DEFAULT 'pending'
                                `,
                                (responseStatusModifyErr) => {
                                    if (responseStatusModifyErr) {
                                        console.error('Error updating incoming_vessel_discharge_tasks.driver_response_status enum:', responseStatusModifyErr);
                                        return;
                                    }

                                    db.query(
                                        `
                                    ALTER TABLE incoming_vessel_discharge_tasks
                                    ADD COLUMN IF NOT EXISTS driver_response_note VARCHAR(255) DEFAULT NULL AFTER driver_response_status
                                `,
                                        (responseNoteErr) => {
                                            if (responseNoteErr) {
                                                console.error('Error ensuring incoming_vessel_discharge_tasks.driver_response_note column:', responseNoteErr);
                                                return;
                                            }

                                            db.query(
                                                `
                                                    ALTER TABLE incoming_vessel_discharge_tasks
                                                    ADD COLUMN IF NOT EXISTS driver_responded_at DATETIME DEFAULT NULL AFTER driver_response_note
                                                `,
                                                (respondedAtErr) => {
                                                    if (respondedAtErr) {
                                                        console.error('Error ensuring incoming_vessel_discharge_tasks.driver_responded_at column:', respondedAtErr);
                                                        return;
                                                    }

                                                    console.log('Incoming vessel discharge schema is ready');
                                                }
                                            );
                                        }
                                    );
                                }
                            );
                        }
                    );
                }
            );
        });
    });
}

// Function normalizeMysqlDateTime: Normalizes datetime input into MySQL-compatible datetime string.
function normalizeMysqlDateTime(value) {
    const normalizedValue = String(value || '').trim().replace('T', ' ');

    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalizedValue)) {
        return `${normalizedValue}:00`;
    }

    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(normalizedValue)) {
        return normalizedValue;
    }

    return null;
}

// Function normalizeDischargePriority: Validates and normalizes discharge priority value.
function normalizeDischargePriority(value) {
    const normalizedValue = String(value || '').trim().toLowerCase();
    const allowedPriorities = ['low', 'normal', 'high', 'urgent'];
    return allowedPriorities.includes(normalizedValue) ? normalizedValue : null;
}

// Function normalizeContainerCondition: Validates and normalizes container condition value.
function normalizeContainerCondition(value) {
    const normalizedValue = String(value || '').trim().toLowerCase();
    const allowedConditions = ['sound', 'damaged', 'inspection'];
    return allowedConditions.includes(normalizedValue) ? normalizedValue : null;
}

// Function normalizeContainerDestination: Normalizes container destination to supported internal value.
function normalizeContainerDestination(value) {
    const normalizedValue = String(value || '').trim().toLowerCase();
    const berthKey = normalizeDockBerthKey(value);
    if (berthKey) {
        return `berth_${berthKey.toLowerCase()}`;
    }

    const allowedDestinations = ['yard', 'truck', 'warehouse', 'berth_a', 'berth_b', 'berth_c'];
    return allowedDestinations.includes(normalizedValue) ? normalizedValue : null;
}

// Function getPriorityRank: Returns sortable rank for discharge priority.
function getPriorityRank(priority) {
    return {
        urgent: 0,
        high: 1,
        normal: 2,
        low: 3
    }[String(priority || '').trim().toLowerCase()] ?? 9;
}

// Function getDestinationRank: Returns sortable rank for destination type.
function getDestinationRank(destinationType) {
    return {
        truck: 0,
        warehouse: 1,
        berth_a: 2,
        berth_b: 2,
        berth_c: 2,
        yard: 3
    }[String(destinationType || '').trim().toLowerCase()] ?? 9;
}

// Function getContainerCompletionStatus: Maps destination type to final completion status.
function getContainerCompletionStatus(destinationType) {
    const normalizedValue = String(destinationType || '').trim().toLowerCase();

    if (normalizedValue === 'truck') {
        return 'loaded_truck';
    }

    if (normalizedValue === 'warehouse') {
        return 'warehoused';
    }

    return 'stored';
}

// Function getDefaultFinalLocation: Builds default final location label based on destination context.
function getDefaultFinalLocation(destinationType, proposedBerth, activeWarehouseName = '') {
    const normalizedValue = String(destinationType || '').trim().toLowerCase();
    const berthLabel = String(proposedBerth || '').trim();
    const destinationBerthKey = BERTH_DESTINATION_TYPES[normalizedValue];

    if (destinationBerthKey) {
        return `رصيف ${destinationBerthKey}`;
    }

    if (normalizedValue === 'truck') {
        return berthLabel ? `منطقة تحميل الشاحنات - ${berthLabel}` : 'منطقة تحميل الشاحنات';
    }

    if (normalizedValue === 'warehouse') {
        return activeWarehouseName || 'المستودع التشغيلي';
    }

    return berthLabel ? `ساحة الحاويات - ${berthLabel}` : 'ساحة الحاويات';
}

// Function mapIncomingVesselRow: Maps incoming vessel DB row to API response model.
function mapIncomingVesselRow(row) {
    if (!row) {
        return null;
    }

    return {
        id: row.vessel_id,
        vesselName: row.vessel_name,
        voyageReference: row.voyage_reference,
        expectedArrival: row.expected_arrival,
        arrivalSource: row.arrival_source || row.proposed_berth || null,
        proposedBerth: row.proposed_berth,
        expectedContainerCount: Number(row.expected_container_count || 0),
        arrivalShortageReason: row.arrival_shortage_reason || '',
        cargoType: row.cargo_type,
        dischargePriority: row.discharge_priority,
        notes: row.notes,
        status: row.status,
        createdByEmail: row.created_by_email,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        receivedContainerCount: Number(row.received_container_count || 0)
    };
}

// Function normalizeContainerWeight: Parses and validates container weight as non-negative number.
function normalizeContainerWeight(value) {
    const parsedValue = Number.parseFloat(String(value || '').trim());
    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
        return null;
    }

    return parsedValue;
}

// Function mapDischargePlanRow: Maps discharge plan DB row to API response model.
function mapDischargePlanRow(row) {
    if (!row) {
        return null;
    }

    return {
        id: row.plan_id,
        vesselId: row.vessel_id,
        proposedBerth: row.proposed_berth,
        status: row.status,
        generatedByEmail: row.generated_by_email,
        generatedAt: row.generated_at,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        notes: row.notes
    };
}

// Function mapDischargeTaskRow: Maps discharge task DB row to API response model.
function mapDischargeTaskRow(row) {
    if (!row) {
        return null;
    }

    return {
        id: row.task_id,
        planId: row.plan_id,
        vesselId: row.vessel_id,
        containerId: row.container_id,
        containerNumber: row.container_number,
        destinationType: row.destination_type,
        initialDropLocation: row.initial_drop_location,
        finalLocation: row.final_location,
        driverUserId: row.driver_user_id,
        driverName: row.driver_name_snapshot,
        driverResponseStatus: row.driver_response_status || 'pending',
        driverResponseNote: row.driver_response_note,
        driverRespondedAt: row.driver_responded_at,
        machineId: row.machine_id,
        machineName: row.machine_name_snapshot,
        taskOrder: row.task_order,
        status: row.status,
        actualUnloadedAt: row.actual_unloaded_at,
        actualDriverName: row.actual_driver_name,
        actualMachineName: row.actual_machine_name
    };
}

// Function getDockLevelMeta: Fetches dock level metadata by level key.
function getDockLevelMeta(levelKey) {
    return ALL_DOCK_LEVELS.find((level) => level.key === levelKey) || null;
}

// Function getDockBerthMeta: Fetches dock berth metadata by berth key.
function getDockBerthMeta(berthKey) {
    return DOCK_BERTHS.find((berth) => berth.key === berthKey) || null;
}

// Function getDockLevelsForBerth: Returns available levels for the provided berth.
function getDockLevelsForBerth(berthKey) {
    const berthMeta = getDockBerthMeta(berthKey);
    return berthMeta?.levels?.length ? berthMeta.levels : DOCK_LEVELS;
}

// Function normalizeDockBerthKey: Normalizes berth input to canonical berth key.
function normalizeDockBerthKey(value) {
    const normalizedValue = String(value || '').trim().toUpperCase();
    if (!normalizedValue) {
        return null;
    }

    const directMatch = getDockBerthMeta(normalizedValue);
    if (directMatch) {
        return directMatch.key;
    }

    const berthMatch = DOCK_BERTHS.find((berth) => (
        normalizedValue === String(berth.label || '').trim().toUpperCase()
        || normalizedValue === `رصيف ${berth.key}`
        || normalizedValue === `BERTH ${berth.key}`
        || (normalizedValue.endsWith(berth.key) && (normalizedValue.includes('رصيف') || normalizedValue.includes('BERTH')))
    ));

    return berthMatch ? berthMatch.key : null;
}

// Function getDockBerthKeyFromDestination: Maps destination type to related dock berth key.
function getDockBerthKeyFromDestination(destinationType) {
    return BERTH_DESTINATION_TYPES[String(destinationType || '').trim().toLowerCase()] || null;
}

// Function allocateDockSlotForContainer: Allocates first free dock slot and writes container occupancy details.
function allocateDockSlotForContainer({ berthKey, containerNumber, ownerName, containerType, notes }, callback) {
    const normalizedBerthKey = normalizeDockBerthKey(berthKey);
    if (!normalizedBerthKey) {
        return callback(new Error('INVALID_BERTH'));
    }

    const findAvailableSlotQuery = `
        SELECT id, slot_code
        FROM dock_slots
        WHERE berth_key = ?
          AND (container_number IS NULL OR TRIM(container_number) = '')
        ORDER BY FIELD(level_key, 'lower', 'middle', 'upper'), slot_order ASC
        LIMIT 1
    `;

    db.query(findAvailableSlotQuery, [normalizedBerthKey], (slotErr, slotResults) => {
        if (slotErr) {
            return callback(slotErr);
        }

        if (!slotResults.length) {
            return callback(new Error('NO_AVAILABLE_SLOT'));
        }

        const slot = slotResults[0];
        db.query(
            `
                UPDATE dock_slots
                SET container_number = ?, owner_name = ?, container_type = ?, notes = ?
                WHERE id = ?
            `,
            [containerNumber, ownerName || null, containerType || null, notes || null, slot.id],
            (updateErr) => {
                if (updateErr) {
                    return callback(updateErr);
                }

                return callback(null, slot);
            }
        );
    });
}

// Function getDockBerthStatus: Returns berth status label based on occupancy numbers.
function getDockBerthStatus(occupiedCount, totalSlots) {
    if (!occupiedCount) {
        return 'فارغ';
    }

    if (occupiedCount >= totalSlots) {
        return 'ممتلئ';
    }

    return 'قيد التشغيل';
}

// Function getCurrentUserByEmail: Loads current user profile by email.
function getCurrentUserByEmail(email, callback) {
    getUsersIdColumn((columnErr, userIdColumn) => {
        if (columnErr) {
            return callback(columnErr);
        }

        const query = `
            SELECT ${userIdColumn} AS user_id, email, role, full_name
            FROM Users
            WHERE email = ?
            LIMIT 1
        `;

        db.query(query, [email], (userErr, results) => {
            if (userErr) {
                return callback(userErr);
            }

            return callback(null, results[0] || null);
        });
    });
}

// Function getDockDrivers: Fetches all dock-capable drivers.
function getDockDrivers(callback) {
    getUsersIdColumn((columnErr, userIdColumn) => {
        if (columnErr) {
            return callback(columnErr);
        }

        const query = `
            SELECT ${userIdColumn} AS user_id, email, full_name, availability_status
            FROM Users
            WHERE LOWER(TRIM(role)) = 'driver'
            ORDER BY COALESCE(full_name, email) ASC
        `;

        db.query(query, (driverErr, results) => {
            if (driverErr) {
                return callback(driverErr);
            }

            return callback(null, results);
        });
    });
}

// Function getAvailableDockDrivers: Fetches currently available drivers not assigned to active tasks.
function getAvailableDockDrivers(options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }

    const ignoreDraftVesselId = Number(options?.ignoreDraftVesselId) || null;

    getUsersIdColumn((columnErr, userIdColumn) => {
        if (columnErr) {
            return callback(columnErr);
        }

        const query = `
            SELECT ${userIdColumn} AS user_id, email, full_name, availability_status
            FROM Users u
            WHERE LOWER(TRIM(u.role)) = 'driver'
              AND COALESCE(u.availability_status, 'متاح') = 'متاح'
              AND NOT EXISTS (
                    SELECT 1
                    FROM incoming_vessel_discharge_tasks t
                    JOIN incoming_vessel_discharge_plans p ON p.plan_id = t.plan_id
                    WHERE t.driver_user_id = u.${userIdColumn}
                      AND t.status IN ('planned', 'in_progress')
                      AND (
                            t.status = 'in_progress'
                            OR COALESCE(t.driver_response_status, 'pending') IN ('pending', 'accepted')
                      )
                      AND (
                            p.status = 'active'
                            OR (p.status = 'draft' AND (? IS NULL OR p.vessel_id <> ?))
                      )
              )
            ORDER BY COALESCE(u.full_name, u.email) ASC
        `;

        db.query(query, [ignoreDraftVesselId, ignoreDraftVesselId], (driverErr, results) => {
            if (driverErr) {
                return callback(driverErr);
            }

            return callback(null, results);
        });
    });
}

// Function getReadyMachines: Fetches ready machines not locked by active discharge tasks.
function getReadyMachines(options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }

    const ignoreDraftVesselId = Number(options?.ignoreDraftVesselId) || null;

    const query = `
        SELECT machine_id, machine_code, machine_name, category, status
        FROM Machines
        WHERE status = 'جاهزة'
          AND NOT EXISTS (
                SELECT 1
                FROM incoming_vessel_discharge_tasks t
                JOIN incoming_vessel_discharge_plans p ON p.plan_id = t.plan_id
                WHERE t.machine_id = Machines.machine_id
                  AND t.status IN ('planned', 'in_progress')
                  AND (
                        p.status = 'active'
                        OR (p.status = 'draft' AND (? IS NULL OR p.vessel_id <> ?))
                  )
          )
        ORDER BY machine_name ASC, machine_id ASC
    `;

    db.query(query, [ignoreDraftVesselId, ignoreDraftVesselId], (machineErr, results) => {
        if (machineErr) {
            return callback(machineErr);
        }

        return callback(null, results);
    });
}

// Function getActiveWarehouse: Fetches the active warehouse used by operations.
function getActiveWarehouse(callback) {
    const query = `
        SELECT id, name, warehouse_type, status
        FROM warehouses
        WHERE status = 'نشط'
        ORDER BY id ASC
        LIMIT 1
    `;

    db.query(query, (warehouseErr, results) => {
        if (warehouseErr) {
            return callback(warehouseErr);
        }

        return callback(null, results[0] || null);
    });
}

// Function getActiveDockRequests: Fetches latest active dock delivery requests with driver linkage.
function getActiveDockRequests(callback) {
    getUsersIdColumn((columnErr, userIdColumn) => {
        if (columnErr) {
            return callback(columnErr);
        }

        const query = `
            SELECT
                r.request_id,
                r.slot_id,
                r.container_number,
                r.slot_code,
                r.driver_user_id,
                r.status,
                r.response_note,
                r.created_at,
                r.responded_at,
                u.${userIdColumn} AS linked_driver_id,
                u.email AS driver_email,
                u.full_name AS driver_name
            FROM dock_delivery_requests r
            LEFT JOIN Users u ON u.${userIdColumn} = r.driver_user_id
            INNER JOIN (
                SELECT slot_id, MAX(request_id) AS latest_request_id
                FROM dock_delivery_requests
                GROUP BY slot_id
            ) latest ON latest.latest_request_id = r.request_id
            WHERE r.status IN ('pending', 'approved', 'unavailable', 'failed')
            ORDER BY r.created_at DESC
        `;

        db.query(query, (requestErr, results) => {
            if (requestErr) {
                return callback(requestErr);
            }

            return callback(null, results);
        });
    });
}

// Function setDatabase: Injects MySQL connection into runtime helpers.
function setDatabase(connection) {
    db = connection;
}

module.exports = {
    crypto,
    sessions,
    ROLE_ALIASES,
    STORED_ROLE_NAMES,
    DOCK_LEVELS,
    TRUCK_BERTH_LEVELS,
    TRAIN_BERTH_LEVELS,
    DOCK_BERTHS,
    ALL_DOCK_LEVELS,
    BERTH_DESTINATION_TYPES,
    WAREHOUSE_TYPES,
    PAGE_ROLE_ACCESS,
    setDatabase,
    initializeDatabase,
    normalizeRoleKey,
    getStoredRoleName,
    buildPathWithParams,
    getRoleRedirectPath,
    getAllowedRolesForPath,
    hasRequiredRole,
    requireRoles,
    parseCookies,
    getSessionIdFromRequest,
    getSessionFromRequest,
    setNoStoreHeaders,
    isPublicPath,
    getUsersIdColumn,
    normalizeEntityCodeInput,
    escapeRegExp,
    normalizeCodePrefix,
    formatSequentialCode,
    normalizeStoredCode,
    inferWarehouseType,
    generateSequentialCode,
    resolveEntityCode,
    findCodeConflict,
    compareEntityCodes,
    ensureDriverColumns,
    ensureMachineDriverSchema,
    ensureWarehouseSchema,
    ensureDockSlotsSchema,
    ensureDockRequestsSchema,
    ensureIncomingVesselsSchema,
    ensureIncomingVesselContainersSchema,
    ensureIncomingVesselDischargeSchema,
    normalizeMysqlDateTime,
    normalizeDischargePriority,
    normalizeContainerCondition,
    normalizeContainerDestination,
    getPriorityRank,
    getDestinationRank,
    getContainerCompletionStatus,
    getDefaultFinalLocation,
    mapIncomingVesselRow,
    normalizeContainerWeight,
    mapDischargePlanRow,
    mapDischargeTaskRow,
    getDockLevelMeta,
    getDockBerthMeta,
    getDockLevelsForBerth,
    normalizeDockBerthKey,
    getDockBerthKeyFromDestination,
    allocateDockSlotForContainer,
    getDockBerthStatus,
    getCurrentUserByEmail,
    getDockDrivers,
    getAvailableDockDrivers,
    getReadyMachines,
    getActiveWarehouse,
    getActiveDockRequests
};
