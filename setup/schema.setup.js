/**
 * مسؤولية الملف: تجميع دوال تجهيز البنية والـ schema helpers المرتبطة بها في مكان واحد مع الحفاظ على نفس منطق التنفيذ الحالي.
 * ملاحظات: هذا الملف يعتمد على db والثوابت المشتركة، ويحتفظ داخليًا بكاش الأعمدة ومعلومة عمود Users الأساسي كما كان سابقًا في الملف الرئيسي.
 */

const db = require('../config/db');
const {
    DOCK_LEVELS,
    DOCK_BERTHS,
    WAREHOUSE_TYPES
} = require('../config/constants');

let usersIdColumn = null;
const tableColumnsCache = new Map();

/**
 * الغرض: تحديد اسم عمود المعرف الأساسي في جدول Users مع الاحتفاظ به في كاش داخلي.
 * المدخلات: callback دالة استدعاء تستقبل الخطأ أو اسم العمود.
 * المخرجات: لا يعيد قيمة مباشرة؛ يستدعي callback باسم العمود مثل user_id أو id.
 * الاعتمادات: يعتمد على db وعلى متغير usersIdColumn الداخلي للكاش.
 * ملاحظات: يقرأ بنية الجدول من قاعدة البيانات مرة أولى فقط ثم يعيد استخدام النتيجة لاحقًا.
 * متى يُستخدم: قبل أي منطق يحتاج معرفة اسم عمود المعرف الحقيقي في جدول Users.
 */
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

/**
 * الغرض: جلب أعمدة جدول معيّن من قاعدة البيانات مع حفظها في كاش داخلي.
 * المدخلات: tableName اسم الجدول، و callback دالة استدعاء تستقبل الخطأ أو Set الأعمدة.
 * المخرجات: لا يعيد قيمة مباشرة؛ يستدعي callback بمجموعة الأعمدة المطبعة.
 * الاعتمادات: يعتمد على db وعلى tableColumnsCache الداخلي.
 * ملاحظات: يخزن الأعمدة بحروف صغيرة لتسهيل الفحص اللاحق وعدم تكرار الاستعلامات.
 * متى يُستخدم: قبل التحقق من وجود أعمدة اختيارية أو متغيرة في الجداول.
 */
function getTableColumns(tableName, callback) {
    const cacheKey = String(tableName || '').trim().toLowerCase();
    if (!cacheKey) {
        return callback(new Error('Table name is required.'));
    }

    if (tableColumnsCache.has(cacheKey)) {
        return callback(null, tableColumnsCache.get(cacheKey));
    }

    db.query(`SHOW COLUMNS FROM ${tableName}`, (err, columns) => {
        if (err) {
            console.error(`Error reading ${tableName} columns:`, err);
            return callback(err);
        }

        const normalizedColumns = new Set(
            columns.map((column) => String(column.Field || '').trim().toLowerCase()).filter(Boolean)
        );

        tableColumnsCache.set(cacheKey, normalizedColumns);
        return callback(null, normalizedColumns);
    });
}

/**
 * الغرض: التحقق مما إذا كان جدول معيّن يحتوي على عمود محدد.
 * المدخلات: tableName اسم الجدول، columnName اسم العمود، callback دالة استدعاء تستقبل النتيجة.
 * المخرجات: لا يعيد قيمة مباشرة؛ يستدعي callback بقيمة منطقية تدل على وجود العمود.
 * الاعتمادات: يعتمد على getTableColumns للحصول على الأعمدة من الكاش أو من قاعدة البيانات.
 * ملاحظات: يطبّع اسم العمود قبل المقارنة للحفاظ على نفس السلوك الحالي.
 * متى يُستخدم: قبل بناء استعلامات أو قرارات تعتمد على وجود أعمدة اختيارية.
 */
function tableHasColumn(tableName, columnName, callback) {
    getTableColumns(tableName, (err, columns) => {
        if (err) {
            return callback(err);
        }

        return callback(null, columns.has(String(columnName || '').trim().toLowerCase()));
    });
}

/**
 * الغرض: توفير نسخة Promise من التحقق بوجود العمود لتسهيل الاستخدام داخل async/await.
 * المدخلات: tableName اسم الجدول، و columnName اسم العمود.
 * المخرجات: Promise يحل إلى true أو false بحسب وجود العمود.
 * الاعتمادات: يعتمد على tableHasColumn.
 * ملاحظات: لا يغيّر أي حالة خارجية؛ فقط يلف callback في Promise.
 * متى يُستخدم: عند الحاجة لاستخدام التحقق من الأعمدة ضمن Promise.all أو async routes.
 */
function tableHasColumnAsync(tableName, columnName) {
    return new Promise((resolve, reject) => {
        tableHasColumn(tableName, columnName, (err, hasColumn) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(hasColumn);
        });
    });
}

/**
 * الغرض: استنتاج نوع المستودع من الاسم الحالي إذا كانت القيمة المخزنة غير مكتملة.
 * المدخلات: name اسم المستودع، و currentType النوع الحالي إن وجد.
 * المخرجات: نوع مستودع معتمد أو null إذا تعذر الاستنتاج.
 * الاعتمادات: يعتمد على WAREHOUSE_TYPES الثابتة.
 * ملاحظات: لا يحدّث قاعدة البيانات بنفسه؛ فقط يعيد القيمة الأنسب للاستدعاء الخارجي.
 * متى يُستخدم: أثناء backfill لأنواع المستودعات عند تجهيز schema أو أثناء عرض البيانات.
 */
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

/**
 * الغرض: تجهيز عمود account_status في جدول Users إذا لم يكن موجودًا.
 * المدخلات: لا توجد مدخلات مباشرة.
 * المخرجات: لا يعيد قيمة؛ ينفّذ ALTER TABLE ويكتب رسائل السجل فقط.
 * الاعتمادات: يعتمد على db.
 * ملاحظات: يضيف العمود بقيمتي active و disabled مع نفس القيمة الافتراضية الحالية.
 * متى يُستخدم: عند startup لضمان جاهزية حالة الحساب قبل استخدام المصادقة والصلاحيات.
 */
function ensureUserAccountStatusSchema() {
    db.query(
        `
            ALTER TABLE Users
            ADD COLUMN IF NOT EXISTS account_status ENUM('active', 'disabled') NOT NULL DEFAULT 'active'
        `,
        (alterErr) => {
            if (alterErr) {
                console.error('Error ensuring Users.account_status column:', alterErr);
                return;
            }

            console.log('Users account status schema is ready');
        }
    );
}

/**
 * الغرض: توسيع عمود كلمة المرور في جدول Users ليستوعب قيم bcrypt الحالية وأي خوارزميات أحدث لاحقًا.
 * المدخلات: لا توجد مدخلات مباشرة.
 * المخرجات: لا يعيد قيمة؛ ينفّذ ALTER TABLE ويكتب نتيجة التهيئة في السجل.
 * الاعتمادات: يعتمد على db.
 * ملاحظات: بعض النسخ القديمة من قاعدة البيانات كانت تستخدم VARCHAR(50) لكلمة المرور، وهذا لا يكفي لقيمة bcrypt كاملة.
 * متى يُستخدم: عند startup قبل إنشاء المستخدمين الجدد أو محاولة تسجيل الدخول بحسابات مخزنة بكلمات مرور مشفرة.
 */
function ensureUserPasswordSchema() {
    db.query(
        `
            ALTER TABLE Users
            MODIFY COLUMN password VARCHAR(255) NOT NULL
        `,
        (alterErr) => {
            if (alterErr) {
                console.error('Error ensuring Users.password column length:', alterErr);
                return;
            }

            console.log('Users password schema is ready');
        }
    );
}

/**
 * الغرض: تجهيز جدول requests وحقوله الإضافية المرتبطة بسير العمل الحالي.
 * المدخلات: لا توجد مدخلات مباشرة.
 * المخرجات: لا يعيد قيمة؛ ينشئ الجدول ويعدل الأعمدة ويجري backfill بسيط عند الحاجة.
 * الاعتمادات: يعتمد على db.
 * ملاحظات: يضيف الحقول الناقصة ويعدّل ENUM الخاص بالحالة ويحاول تعبئة source_role عند غيابه.
 * متى يُستخدم: عند startup لضمان توافق جدول الطلبات مع workflow المعتمد حاليًا.
 */
function ensureDriverInspectionsSchema() {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS driver_vehicle_inspections (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            driver_id INT NOT NULL,
            vehicle_id INT DEFAULT NULL,
            inspection_type ENUM('daily', 'monthly') NOT NULL,
            inspection_date DATE NOT NULL,
            inspection_month CHAR(7) DEFAULT NULL,
            daily_scope_key VARCHAR(64) NOT NULL,
            monthly_scope_key VARCHAR(64) DEFAULT NULL,
            oil_checked TINYINT(1) NOT NULL DEFAULT 0,
            water_checked TINYINT(1) NOT NULL DEFAULT 0,
            brakes_checked TINYINT(1) NOT NULL DEFAULT 0,
            tires_checked TINYINT(1) NOT NULL DEFAULT 0,
            fuel_checked TINYINT(1) NOT NULL DEFAULT 0,
            battery_checked TINYINT(1) NOT NULL DEFAULT 0,
            lights_checked TINYINT(1) NOT NULL DEFAULT 0,
            leaks_checked TINYINT(1) NOT NULL DEFAULT 0,
            has_issue TINYINT(1) NOT NULL DEFAULT 0,
            needs_periodic_service TINYINT(1) NOT NULL DEFAULT 0,
            notes TEXT DEFAULT NULL,
            mileage BIGINT DEFAULT NULL,
            monthly_checklist TEXT DEFAULT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `;

    const ensureIndex = (keyName, createSql, callback) => {
        db.query(
            `SHOW INDEX FROM driver_vehicle_inspections WHERE Key_name = ?`,
            [keyName],
            (indexErr, indexRows) => {
                if (indexErr) {
                    callback(indexErr);
                    return;
                }

                if (Array.isArray(indexRows) && indexRows.length) {
                    callback(null);
                    return;
                }

                db.query(createSql, (createErr) => {
                    callback(createErr || null);
                });
            }
        );
    };

    db.query(createTableQuery, (tableErr) => {
        if (tableErr) {
            console.error('Error ensuring driver_vehicle_inspections table:', tableErr);
            return;
        }

        db.query(
            `
                ALTER TABLE driver_vehicle_inspections
                ADD COLUMN IF NOT EXISTS driver_id INT NOT NULL,
                ADD COLUMN IF NOT EXISTS vehicle_id INT DEFAULT NULL,
                ADD COLUMN IF NOT EXISTS inspection_type ENUM('daily', 'monthly') NOT NULL,
                ADD COLUMN IF NOT EXISTS inspection_date DATE NOT NULL,
                ADD COLUMN IF NOT EXISTS inspection_month CHAR(7) DEFAULT NULL,
                ADD COLUMN IF NOT EXISTS daily_scope_key VARCHAR(64) NOT NULL,
                ADD COLUMN IF NOT EXISTS monthly_scope_key VARCHAR(64) DEFAULT NULL,
                ADD COLUMN IF NOT EXISTS oil_checked TINYINT(1) NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS water_checked TINYINT(1) NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS brakes_checked TINYINT(1) NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS tires_checked TINYINT(1) NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS fuel_checked TINYINT(1) NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS battery_checked TINYINT(1) NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS lights_checked TINYINT(1) NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS leaks_checked TINYINT(1) NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS has_issue TINYINT(1) NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL,
                ADD COLUMN IF NOT EXISTS mileage BIGINT DEFAULT NULL,
                ADD COLUMN IF NOT EXISTS needs_periodic_service TINYINT(1) NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS monthly_checklist TEXT DEFAULT NULL
            `,
            (alterErr) => {
                if (alterErr) {
                    console.error('Error ensuring driver_vehicle_inspections columns:', alterErr);
                    return;
                }

                db.query(
                    `
                        ALTER TABLE driver_vehicle_inspections
                        MODIFY COLUMN inspection_type ENUM('daily', 'monthly') NOT NULL,
                        MODIFY COLUMN mileage BIGINT DEFAULT NULL,
                        MODIFY COLUMN needs_periodic_service TINYINT(1) NOT NULL DEFAULT 0
                    `,
                    (modifyErr) => {
                        if (modifyErr) {
                            console.error('Error ensuring driver_vehicle_inspections column types:', modifyErr);
                            return;
                        }

                        ensureIndex(
                            'uniq_driver_daily_inspection',
                            `CREATE UNIQUE INDEX uniq_driver_daily_inspection ON driver_vehicle_inspections(inspection_type, daily_scope_key, inspection_date)`,
                            (dailyIndexErr) => {
                                if (dailyIndexErr) {
                                    console.error('Error ensuring daily inspection unique index:', dailyIndexErr);
                                    return;
                                }

                                ensureIndex(
                                    'uniq_driver_monthly_inspection',
                                    `CREATE UNIQUE INDEX uniq_driver_monthly_inspection ON driver_vehicle_inspections(inspection_type, monthly_scope_key, inspection_month)`,
                                    (monthlyIndexErr) => {
                                        if (monthlyIndexErr) {
                                            console.error('Error ensuring monthly inspection unique index:', monthlyIndexErr);
                                            return;
                                        }

                                        ensureIndex(
                                            'idx_driver_vehicle_inspections_driver',
                                            `CREATE INDEX idx_driver_vehicle_inspections_driver ON driver_vehicle_inspections(driver_id)`,
                                            (driverIndexErr) => {
                                                if (driverIndexErr) {
                                                    console.error('Error ensuring driver inspections driver index:', driverIndexErr);
                                                    return;
                                                }

                                                ensureIndex(
                                                    'idx_driver_vehicle_inspections_vehicle',
                                                    `CREATE INDEX idx_driver_vehicle_inspections_vehicle ON driver_vehicle_inspections(vehicle_id)`,
                                                    (vehicleIndexErr) => {
                                                        if (vehicleIndexErr) {
                                                            console.error('Error ensuring driver inspections vehicle index:', vehicleIndexErr);
                                                            return;
                                                        }

                                                        ensureIndex(
                                                            'idx_driver_vehicle_inspections_date',
                                                            `CREATE INDEX idx_driver_vehicle_inspections_date ON driver_vehicle_inspections(inspection_date)`,
                                                            (dateIndexErr) => {
                                                                if (dateIndexErr) {
                                                                    console.error('Error ensuring driver inspections date index:', dateIndexErr);
                                                                    return;
                                                                }

                                                                console.log('Driver inspections schema is ready');
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
                    }
                );
            }
        );
    });
}

function ensureRequestsWorkflowSchema() {
    const createRequestsTableQuery = `
        CREATE TABLE IF NOT EXISTS requests (
            request_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            item_id INT NOT NULL,
            machine_id INT DEFAULT NULL,
            quantity DECIMAL(10,2) NOT NULL,
            requested_by VARCHAR(100) NOT NULL,
            requested_by_email VARCHAR(255) DEFAULT NULL,
            source_role VARCHAR(50) DEFAULT NULL,
            requested_for_date DATE DEFAULT NULL,
            mechanic_decision_by VARCHAR(255) DEFAULT NULL,
            issued_quantity DECIMAL(10,2) DEFAULT NULL,
            fulfilled_at DATETIME DEFAULT NULL,
            fulfilled_by VARCHAR(255) DEFAULT NULL,
            status ENUM('بانتظار مدير الآليات', 'جديد', 'معتمد', 'مرفوض', 'مرفوض من مدير الآليات', 'تم الصرف') NOT NULL DEFAULT 'جديد',
            justification TEXT DEFAULT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `;

    db.query(createRequestsTableQuery, (tableErr) => {
        if (tableErr) {
            console.error('Error ensuring requests table:', tableErr);
            return;
        }

        db.query(
            `
                ALTER TABLE requests
                ADD COLUMN IF NOT EXISTS machine_id INT DEFAULT NULL AFTER item_id,
                ADD COLUMN IF NOT EXISTS requested_by_email VARCHAR(255) DEFAULT NULL AFTER requested_by,
                ADD COLUMN IF NOT EXISTS source_role VARCHAR(50) DEFAULT NULL AFTER requested_by_email,
                ADD COLUMN IF NOT EXISTS requested_for_date DATE DEFAULT NULL AFTER source_role,
                ADD COLUMN IF NOT EXISTS mechanic_decision_by VARCHAR(255) DEFAULT NULL AFTER requested_for_date,
                ADD COLUMN IF NOT EXISTS issued_quantity DECIMAL(10,2) DEFAULT NULL AFTER mechanic_decision_by,
                ADD COLUMN IF NOT EXISTS fulfilled_at DATETIME DEFAULT NULL AFTER issued_quantity,
                ADD COLUMN IF NOT EXISTS fulfilled_by VARCHAR(255) DEFAULT NULL AFTER fulfilled_at
            `,
            (columnsErr) => {
                if (columnsErr) {
                    console.error('Error ensuring requests workflow columns:', columnsErr);
                    return;
                }

                db.query(
                    `
                        ALTER TABLE requests
                        MODIFY COLUMN status ENUM('بانتظار مدير الآليات', 'جديد', 'معتمد', 'مرفوض', 'مرفوض من مدير الآليات', 'تم الصرف')
                        NOT NULL DEFAULT 'جديد'
                    `,
                    (statusErr) => {
                        if (statusErr) {
                            console.error('Error ensuring requests workflow status enum:', statusErr);
                            return;
                        }

                        db.query(
                            `
                                UPDATE requests
                                SET source_role = COALESCE(source_role, 'internal')
                            `,
                            (backfillErr) => {
                                if (backfillErr) {
                                    console.error('Error backfilling requests workflow source_role:', backfillErr);
                                }
                            }
                        );
                    }
                );
            }
        );
    });
}

function ensurePurchaseRequestsSchema() {
    const createPurchaseRequestsTableQuery = `
        CREATE TABLE IF NOT EXISTS purchase_requests (
            request_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            item_id INT DEFAULT NULL,
            warehouse_id INT DEFAULT NULL,
            item_name VARCHAR(255) NOT NULL,
            item_code_snapshot VARCHAR(100) DEFAULT NULL,
            quantity DECIMAL(10,2) NOT NULL,
            supplier_id INT NOT NULL,
            supplier_name_snapshot VARCHAR(150) NOT NULL,
            requested_by VARCHAR(150) NOT NULL,
            requested_by_email VARCHAR(255) DEFAULT NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'new',
            review_note TEXT DEFAULT NULL,
            reviewed_by VARCHAR(255) DEFAULT NULL,
            reviewed_at DATETIME DEFAULT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_purchase_requests_status (status),
            INDEX idx_purchase_requests_supplier (supplier_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `;

    db.query(createPurchaseRequestsTableQuery, (tableErr) => {
        if (tableErr) {
            console.error('Error ensuring purchase_requests table:', tableErr);
            return;
        }

        db.query(
            `
                ALTER TABLE purchase_requests
                ADD COLUMN IF NOT EXISTS item_id INT DEFAULT NULL FIRST,
                ADD COLUMN IF NOT EXISTS warehouse_id INT DEFAULT NULL AFTER item_id,
                ADD COLUMN IF NOT EXISTS supplier_name_snapshot VARCHAR(150) NOT NULL AFTER supplier_id,
                ADD COLUMN IF NOT EXISTS item_code_snapshot VARCHAR(100) DEFAULT NULL AFTER item_name,
                ADD COLUMN IF NOT EXISTS requested_by_email VARCHAR(255) DEFAULT NULL AFTER requested_by,
                ADD COLUMN IF NOT EXISTS review_note TEXT DEFAULT NULL AFTER status,
                ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(255) DEFAULT NULL AFTER review_note,
                ADD COLUMN IF NOT EXISTS reviewed_at DATETIME DEFAULT NULL AFTER reviewed_by
            `,
            (columnsErr) => {
                if (columnsErr) {
                    console.error('Error ensuring purchase_requests columns:', columnsErr);
                    return;
                }

                db.query(
                    `
                        ALTER TABLE purchase_requests
                        MODIFY COLUMN status VARCHAR(50)
                        NOT NULL DEFAULT 'new'
                    `,
                    (statusErr) => {
                        if (statusErr) {
                            console.error('Error ensuring purchase_requests status enum:', statusErr);
                            return;
                        }

                        db.query(
                            `
                                UPDATE purchase_requests pr
                                LEFT JOIN inventory_items i ON i.item_id = pr.item_id
                                LEFT JOIN locations l ON l.id = i.location_id
                                SET pr.warehouse_id = COALESCE(pr.warehouse_id, i.warehouse_id, l.warehouse_id)
                                WHERE pr.warehouse_id IS NULL
                            `,
                            (warehouseBackfillErr) => {
                                if (warehouseBackfillErr) {
                                    console.error('Error backfilling purchase_requests warehouse_id values:', warehouseBackfillErr);
                                    return;
                                }

                                db.query(
                                    `
                                UPDATE purchase_requests
                                SET status = CASE
                                    WHEN status = 'pending' THEN 'new'
                                    WHEN status = 'approved' THEN 'approved'
                                    WHEN status = 'rejected' THEN 'rejected'
                                    ELSE status
                                END
                            `,
                                    (backfillErr) => {
                                        if (backfillErr) {
                                            console.error('Error backfilling purchase_requests statuses:', backfillErr);
                                        }
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

/**
 * الغرض: تجهيز أعمدة بيانات السائقين الأساسية في جدول Users.
 * المدخلات: لا توجد مدخلات مباشرة.
 * المخرجات: لا يعيد قيمة؛ ينفّذ ALTER TABLE ويكتب نتيجة التجهيز في السجل.
 * الاعتمادات: يعتمد على db.
 * ملاحظات: يضيف shift و phone و availability_status إذا لم تكن موجودة.
 * متى يُستخدم: عند startup قبل أي شاشة أو عملية تعتمد على بيانات السائق الموسعة.
 */
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

/**
 * الغرض: تجهيز علاقة السائق بالمعدة داخل جدول Machines وإنشاء الفهرس الفريد الخاص بها.
 * المدخلات: لا توجد مدخلات مباشرة.
 * المخرجات: لا يعيد قيمة؛ ينفّذ ALTER/SHOW INDEX/CREATE INDEX حسب الحاجة.
 * الاعتمادات: يعتمد على db.
 * ملاحظات: لا يعيد إنشاء الفهرس إذا كان موجودًا مسبقًا.
 * متى يُستخدم: عند startup لضمان جاهزية ربط كل سائق بمعدة واحدة وفق المنطق الحالي.
 */
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

/**
 * الغرض: تجهيز عمود warehouse_type وتعبئة القيم المفقودة في جدول warehouses.
 * المدخلات: لا توجد مدخلات مباشرة.
 * المخرجات: لا يعيد قيمة؛ يضيف العمود ويجري backfill لأنواع المستودعات عند الحاجة.
 * الاعتمادات: يعتمد على db وعلى inferWarehouseType.
 * ملاحظات: لا يغيّر القيم الصحيحة الموجودة مسبقًا، بل يحدّث فقط القيم القابلة للاستنتاج.
 * متى يُستخدم: عند startup لضمان جاهزية نوع المستودع قبل استخدامه في الواجهات والعمليات.
 */
function ensureWarehouseSchema() {
    db.query(
        `
            ALTER TABLE warehouses
            ADD COLUMN IF NOT EXISTS warehouse_type VARCHAR(100) NULL AFTER name,
            ADD COLUMN IF NOT EXISTS manager_user_id INT NULL AFTER warehouse_type
        `,
        (alterErr) => {
            if (alterErr) {
                console.error('Error ensuring warehouses schema columns:', alterErr);
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

function ensureInventoryWarehouseSchema() {
    db.query(
        `
            ALTER TABLE inventory_items
            ADD COLUMN IF NOT EXISTS warehouse_id INT NULL AFTER item_name
        `,
        (alterErr) => {
            if (alterErr) {
                console.error('Error ensuring inventory_items.warehouse_id column:', alterErr);
                return;
            }

            db.query(
                `
                    UPDATE inventory_items i
                    JOIN locations l ON l.id = i.location_id
                    SET i.warehouse_id = l.warehouse_id
                    WHERE i.warehouse_id IS NULL
                      AND l.warehouse_id IS NOT NULL
                `,
                (backfillErr) => {
                    if (backfillErr) {
                        console.error('Error backfilling inventory_items.warehouse_id values:', backfillErr);
                        return;
                    }

                    console.log('Inventory warehouse schema is ready');
                }
            );
        }
    );
}

/**
 * الغرض: تجهيز جدول dock_slots وتوحيد أكواد الأماكن القديمة ثم زرع الأماكن الافتراضية للأرصفة.
 * المدخلات: لا توجد مدخلات مباشرة.
 * المخرجات: لا يعيد قيمة؛ ينشئ الجدول ويضيف الأعمدة ويجري backfill وseed حسب الحاجة.
 * الاعتمادات: يعتمد على db وعلى DOCK_LEVELS و DOCK_BERTHS.
 * ملاحظات: يحدّث أكواد الأماكن القديمة وطلبات التسليم المرتبطة بها مع الحفاظ على نفس الترتيب والمنطق الحالي.
 * متى يُستخدم: عند startup لضمان جاهزية بنية أماكن الأرصفة قبل أي عمليات تشغيلية مرتبطة بها.
 */
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

                persistCompletion();
            }
        );
    });
}

/**
 * الغرض: تجهيز جدول dock_delivery_requests وتحديث enum الحالة والحقول الناقصة.
 * المدخلات: لا توجد مدخلات مباشرة.
 * المخرجات: لا يعيد قيمة؛ ينشئ الجدول أو يحدّثه عند الحاجة.
 * الاعتمادات: يعتمد على db.
 * ملاحظات: يحافظ على نفس الحالات الحالية للطلبات الخاصة بتسليم الحاويات من الرصيف.
 * متى يُستخدم: عند startup قبل استخدام طلبات التسليم الخاصة بالـ dock.
 */
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

/**
 * الغرض: تجهيز جدول dock_release_requests وتثبيت enum الحالة الخاصة به.
 * المدخلات: لا توجد مدخلات مباشرة.
 * المخرجات: لا يعيد قيمة؛ ينشئ الجدول أو يعدّل حالته عند الحاجة.
 * الاعتمادات: يعتمد على db.
 * ملاحظات: يحتفظ بنفس الحقول الحالية المستخدمة في طلبات الإفراج عن الحاويات.
 * متى يُستخدم: عند startup قبل استخدام شاشة وعمليات الإفراج عن الأرصفة.
 */
function ensureDockReleaseRequestsSchema() {
    const createDockReleaseRequestsTableQuery = `
        CREATE TABLE IF NOT EXISTS dock_release_requests (
            request_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            slot_id INT NOT NULL,
            slot_code VARCHAR(30) NOT NULL,
            berth_key VARCHAR(10) DEFAULT NULL,
            container_number VARCHAR(100) NOT NULL,
            owner_name VARCHAR(255) DEFAULT NULL,
            customer_name VARCHAR(255) DEFAULT NULL,
            customs_broker_name VARCHAR(255) DEFAULT NULL,
            vessel_name VARCHAR(255) DEFAULT NULL,
            voyage_reference VARCHAR(150) DEFAULT NULL,
            bill_of_lading_number VARCHAR(150) DEFAULT NULL,
            customs_statement_number VARCHAR(150) DEFAULT NULL,
            container_numbers TEXT NOT NULL,
            container_count INT NOT NULL DEFAULT 1,
            arrival_date DATE DEFAULT NULL,
            clearance_delivery_date DATE DEFAULT NULL,
            notes TEXT DEFAULT NULL,
            status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
            created_by_email VARCHAR(255) DEFAULT NULL,
            reviewed_by_email VARCHAR(255) DEFAULT NULL,
            decision_note VARCHAR(255) DEFAULT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            reviewed_at TIMESTAMP NULL DEFAULT NULL,
            INDEX idx_dock_release_requests_slot (slot_id),
            INDEX idx_dock_release_requests_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `;

    db.query(createDockReleaseRequestsTableQuery, (tableErr) => {
        if (tableErr) {
            console.error('Error ensuring dock_release_requests table:', tableErr);
            return;
        }

        db.query(
            `
                ALTER TABLE dock_release_requests
                MODIFY COLUMN status ENUM('pending', 'approved', 'rejected')
                NOT NULL DEFAULT 'pending'
            `,
            (alterErr) => {
                if (alterErr) {
                    console.error('Error updating dock_release_requests status enum:', alterErr);
                    return;
                }

                console.log('Dock release requests schema is ready');
            }
        );
    });
}

/**
 * الغرض: تجهيز جدول incoming_vessels وحقول الوصول والعجز والأولوية والحالة.
 * المدخلات: لا توجد مدخلات مباشرة.
 * المخرجات: لا يعيد قيمة؛ ينشئ الجدول ويضيف الأعمدة الناقصة ويجري backfill عند الحاجة.
 * الاعتمادات: يعتمد على db.
 * ملاحظات: ينسخ proposed_berth إلى arrival_source عند غيابها ويثبت ENUMs الحالية كما هي.
 * متى يُستخدم: عند startup قبل تشغيل استقبال السفن الواردة وخطط التفريغ المرتبطة بها.
 */
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

/**
 * الغرض: تجهيز جدول incoming_vessel_containers وحقول التتبع وENUMs الخاصة به.
 * المدخلات: لا توجد مدخلات مباشرة.
 * المخرجات: لا يعيد قيمة؛ ينشئ الجدول ويضيف الأعمدة الناقصة ويجري backfill للحمولة إن لزم.
 * الاعتمادات: يعتمد على db.
 * ملاحظات: يربط cargo_type بحمولة السفينة عند غيابها ويثبت جميع ENUMs الحالية كما هي.
 * متى يُستخدم: عند startup قبل العمل على الحاويات الواردة ومتابعة تفريغها.
 */
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
            cargo_type VARCHAR(120) DEFAULT NULL,
            contents VARCHAR(255) DEFAULT NULL,
            destination_type ENUM('yard', 'truck', 'warehouse', 'berth_a', 'berth_b', 'berth_c', 'truck_berth', 'train_berth') NOT NULL DEFAULT 'berth_a',
            destination_is_auto TINYINT(1) NOT NULL DEFAULT 0,
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
                ADD COLUMN IF NOT EXISTS container_weight DECIMAL(12,2) DEFAULT NULL,
                ADD COLUMN IF NOT EXISTS cargo_type VARCHAR(120) DEFAULT NULL,
                ADD COLUMN IF NOT EXISTS destination_is_auto TINYINT(1) NOT NULL DEFAULT 0
            `,
            (columnsAlterErr) => {
                if (columnsAlterErr) {
                    console.error('Error ensuring incoming_vessel_containers tracking columns:', columnsAlterErr);
                    return;
                }

                db.query(
                    `
                        UPDATE incoming_vessel_containers c
                        JOIN incoming_vessels v ON v.vessel_id = c.vessel_id
                        SET c.cargo_type = v.cargo_type
                        WHERE (c.cargo_type IS NULL OR TRIM(c.cargo_type) = '')
                          AND v.cargo_type IS NOT NULL
                          AND TRIM(v.cargo_type) <> ''
                    `,
                    (cargoBackfillErr) => {
                        if (cargoBackfillErr) {
                            console.error('Error backfilling incoming_vessel_containers cargo_type values:', cargoBackfillErr);
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
                                        MODIFY COLUMN destination_type ENUM('yard', 'truck', 'warehouse', 'berth_a', 'berth_b', 'berth_c', 'truck_berth', 'train_berth')
                                        NOT NULL DEFAULT 'berth_a'
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
            }
        );
    });
}

/**
 * الغرض: تجهيز جداول خطط ومهام تفريغ السفن الواردة وحقول استجابة السائق.
 * المدخلات: لا توجد مدخلات مباشرة.
 * المخرجات: لا يعيد قيمة؛ ينشئ الجداول ويعدّل الأعمدة والـ ENUMs عند الحاجة.
 * الاعتمادات: يعتمد على db.
 * ملاحظات: يحافظ على نفس بنية الجداول الحالية ونفس حالات استجابة السائق وحالة المهمة.
 * متى يُستخدم: عند startup قبل تشغيل workflow تخطيط وتوزيع وتنفيذ التفريغ.
 */
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
                destination_type ENUM('yard', 'truck', 'warehouse', 'berth_a', 'berth_b', 'berth_c', 'truck_berth', 'train_berth') NOT NULL,
                initial_drop_location VARCHAR(255) DEFAULT NULL,
                final_location VARCHAR(255) DEFAULT NULL,
                driver_user_id INT DEFAULT NULL,
                driver_name_snapshot VARCHAR(255) DEFAULT NULL,
                driver_response_status ENUM('pending', 'accepted', 'busy', 'failed', 'completed') NOT NULL DEFAULT 'pending',
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
                    MODIFY COLUMN destination_type ENUM('yard', 'truck', 'warehouse', 'berth_a', 'berth_b', 'berth_c', 'truck_berth', 'train_berth')
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
                            ADD COLUMN IF NOT EXISTS driver_response_status ENUM('pending', 'accepted', 'busy', 'failed', 'completed')
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
                                    MODIFY COLUMN driver_response_status ENUM('pending', 'accepted', 'busy', 'failed', 'completed')
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

module.exports = {
    getUsersIdColumn,
    getTableColumns,
    tableHasColumn,
    tableHasColumnAsync,
    inferWarehouseType,
    ensureDriverColumns,
    ensureUserPasswordSchema,
    ensureUserAccountStatusSchema,
    ensureMachineDriverSchema,
    ensureWarehouseSchema,
    ensureInventoryWarehouseSchema,
    ensureDockSlotsSchema,
    ensureDockRequestsSchema,
    ensureDockReleaseRequestsSchema,
    ensureIncomingVesselsSchema,
    ensureIncomingVesselContainersSchema,
    ensureIncomingVesselDischargeSchema,
    ensureDriverInspectionsSchema,
    ensureRequestsWorkflowSchema,
    ensurePurchaseRequestsSchema
};
