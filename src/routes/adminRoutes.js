// Function registerAdminRoutes: Registers admin-side endpoints for users, suppliers, inventory, and operations.
module.exports = function registerAdminRoutes(app, context) {
    const {
        db,
        WAREHOUSE_TYPES,
        getStoredRoleName,
        getUsersIdColumn,
        normalizeStoredCode,
        inferWarehouseType,
        resolveEntityCode,
        findCodeConflict,
        compareEntityCodes
    } = context;

// Route handler [GET] /api/users: Fetches the users list from database with normalized user id field.
app.get('/api/users', (req, res) => {
    getUsersIdColumn((columnErr, userIdColumn) => {
        if (columnErr) {
            return res.status(500).json({ success: false, message: 'تعذر قراءة بنية جدول المستخدمين.' });
        }

        const query = `
            SELECT 
                ${userIdColumn} AS user_id, email, role, full_name
            FROM Users 
            ORDER BY ${userIdColumn} DESC;
        `;

        db.query(query, (err, results) => {
            if (err) {
                console.error('Error fetching users:', err);
                return res.status(500).json({ success: false, message: 'فشل جلب قائمة المستخدمين من قاعدة البيانات.' });
            }

            res.status(200).json({ success: true, users: results });
        });
    });
});

// Route handler [POST] /api/users: Creates a new user after validating uniqueness constraints.
app.post('/api/users', (req, res) => {
    const { username , email, password, role } = req.body;
    const normalizedRole = getStoredRoleName(role);
    const checkEmailQuery = 'SELECT * FROM Users WHERE email = ?';
    db.query(checkEmailQuery, [email], (err, results) => {
        if (err) {
            console.error('Database error during email check:', err);
            return res.status(500).json({ success: false, message: 'خطأ في قاعدة البيانات أثناء التحقق من البريد الإلكتروني.' });
        }

        if (results.length > 0) {
            return res.status(409).json({ success: false, message: 'هذا البريد الإلكتروني مُستخدم بالفعل من قبل مستخدم آخر.' });
        }
                
        const insertUserQuery = `
            INSERT INTO users 
            (email , password, role , full_name) 
            VALUES (?, ?, ?, ?);
        `;
        
        db.query(insertUserQuery, [ email, password, normalizedRole , username ], (err, result) => {
            if (err) {
                console.error('Database error on user insertion:', err);
                
                if (err.code === 'ER_DUP_ENTRY' && err.message.includes('username')) {
                     return res.status(409).json({ success: false, message: 'اسم المستخدم مُستخدم بالفعل.' });
                }
                
                return res.status(500).json({ success: false, message: 'فشل حفظ المستخدم في قاعدة البيانات.' });
            }

            res.status(201).json({ 
                success: true, 
                message: 'تم إضافة المستخدم بنجاح. سيتم تحديث القائمة.',
                userId: result.insertId 
            });
        });
    });
    
    
    
 });
// Route handler [DELETE] /api/users/delete-by-email: Deletes a user record by email address.
app.delete('/api/users/delete-by-email', (req, res) => {
    const { email } = req.body; 

    if (!email) {
        return res.status(400).json({ success: false, message: 'الرجاء إرسال البريد الإلكتروني للحذف.' });
    }

    const query = 'DELETE FROM Users WHERE email = ?';

    db.query(query, [email], (err, result) => {
        if (err) {
            console.error(`Error deleting user with email ${email}:`, err);
            return res.status(500).json({ success: false, message: 'فشل حذف المستخدم من قاعدة البيانات.' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: `لم يتم العثور على مستخدم بالبريد الإلكتروني: ${email} للحذف.` });
        }

        res.status(200).json({ 
            success: true, 
            message: 'تم حذف المستخدم بنجاح.' 
        });
    });
});

// Route handler [GET] /api/suppliers: Returns suppliers list with optional filters and search criteria.
app.get('/api/suppliers', (req, res) => {

    const { search, category, min_rating, status } = req.query;

    let query = `
        SELECT 
            supplier_id AS id, name, specialization, category, rating, 
            primary_phone, secondary_phone, email, address, commercial_reg, 
            tax_number, payment_terms, currency, status, transactions, total_value
        FROM suppliers 
        WHERE 1=1
    `;
    const params = [];

    if (search) {
        query += ` AND (name LIKE ? OR specialization LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`);
    }

    if (category) {
        query += ` AND category = ?`;
        params.push(category);
    }

    if (min_rating && !isNaN(parseInt(min_rating))) {
        query += ` AND rating >= ?`;
        params.push(parseInt(min_rating));
    }

    if (status) {
        query += ` AND status = ?`; 
        params.push(status);
    }

    query += ` ORDER BY code ASC;`;

    db.query(query, params, (err, results) => {
        if (err) {
            console.error('Error fetching suppliers:', err);

            return res.status(500).json({ 
                success: false, 
                message: 'فشل جلب قائمة الموردين من قاعدة البيانات.' 
            });
        }

        res.status(200).json({ 
            success: true, 
            suppliers: results // النتائج تحتوي على حقل 'id' بدلاً من 'supplier_id'
        });
    });
});

// Route handler [POST] /api/suppliers: Creates a new supplier record after validating required supplier data.
app.post('/api/suppliers', (req, res) => {

    const { 
        name, 
        specialization, 
        category, 
        rating, 
        contact_person, 
        primary_phone, 
        secondary_phone, 
        email, 
        address, 
        commercial_reg, 
        tax_number, 
        payment_terms, 
        currency 
    } = req.body;

    if (!name || !primary_phone || !contact_person || rating === undefined || rating < 1 || rating > 5) {
        return res.status(400).json({ 
            success: false, 
            message: 'الرجاء تزويدنا بالاسم، الشخص المسؤول، الهاتف الرئيسي، والتقييم (1-5).' 
        });
    }

    const insertSupplierQuery = `
        INSERT INTO suppliers (
            name, specialization, category, rating, contact_person, 
            primary_phone, secondary_phone, email, address, commercial_reg, 
            tax_number, payment_terms, currency, status, transactions, total_value
        ) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, 0)
    `;

    const values = [
        name, specialization, category, rating, contact_person,
        primary_phone, secondary_phone, email, address, commercial_reg,
        tax_number, payment_terms, currency
    ];

    db.query(insertSupplierQuery, values, (err, result) => {
        if (err) {
            console.error('Database error on supplier insertion:', err);

            if (err.code === 'ER_DUP_ENTRY') {
                 return res.status(409).json({ success: false, message: 'هذا المورد موجود بالفعل في قاعدة البيانات.' });
            }

            return res.status(500).json({ 
                success: false, 
                message: 'فشل حفظ المورد في قاعدة البيانات.',
                error: err.sqlMessage
            });
        }

        res.status(201).json({ 
            success: true, 
            message: 'تم إضافة المورد بنجاح.',
            supplierId: result.insertId 
        });
    });
});

// Route handler [PUT] /api/suppliers/:id: Updates supplier details by supplier id.
app.put('/api/suppliers/:id', (req, res) => {

    const supplierId = req.params.id;

    const { 
        name, 
        specialization, 
        category, 
        rating, 
        contact_person, 
        primary_phone, 
        secondary_phone, 
        email, 
        address, 
        commercial_reg, 
        tax_number, 
        payment_terms, 
        currency 
    } = req.body;

    if (!supplierId || !name || rating === undefined || rating < 1 || rating > 5) {
        return res.status(400).json({ 
            success: false, 
            message: 'بيانات التحديث غير كاملة أو غير صالحة (الاسم والتقييم مطلوبان).' 
        });
    }

    const updateSupplierQuery = `
        UPDATE suppliers 
        SET 
            name = ?, 
            specialization = ?, 
            category = ?, 
            rating = ?, 
            contact_person = ?, 
            primary_phone = ?, 
            secondary_phone = ?, 
            email = ?, 
            address = ?, 
            commercial_reg = ?, 
            tax_number = ?, 
            payment_terms = ?, 
            currency = ?
        WHERE supplier_id = ? 
    `;

    const values = [
        name, specialization, category, rating, contact_person,
        primary_phone, secondary_phone, email, address, commercial_reg,
        tax_number, payment_terms, currency,
        supplierId // الـ ID يوضع في النهاية للاستخدام في شرط WHERE
    ];

    db.query(updateSupplierQuery, values, (err, result) => {
        if (err) {
            console.error('Database error on supplier update:', err);
            return res.status(500).json({ 
                success: false, 
                message: 'فشل خادم داخلي أثناء تحديث المورد.',
                error: err.sqlMessage
            });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'المورد المطلوب تعديله غير موجود.' });
        }

        res.status(200).json({ 
            success: true, 
            message: `تم تحديث المورد ID ${supplierId} بنجاح.`
        });
    });
});

// Route handler [GET] /api/suppliers/:id: Returns full supplier details by supplier id.
app.get('/api/suppliers/:id', (req, res) => {

    const supplierId = req.params.id;

    const query = `
        SELECT 
            supplier_id AS id, 
            name, 
            specialization, 
            category, 
            rating, 
            contact_person, 
            primary_phone, 
            secondary_phone, 
            email, 
            address, 
            commercial_reg, 
            tax_number, 
            payment_terms, 
            currency
        FROM suppliers
        WHERE supplier_id = ?
    `;

    db.query(query, [supplierId], (err, results) => {
        if (err) {
            console.error('Database error on fetching single supplier:', err);
            return res.status(500).json({ 
                success: false, 
                message: 'فشل خادم داخلي أثناء جلب بيانات المورد.' 
            });
        }

        if (results.length === 0) {
            return res.status(404).json({ success: false, message: 'المورد غير موجود.' });
        }

        res.status(200).json(results[0]); 
    });
});

// Route handler [DELETE] /api/suppliers/:id: Deletes supplier record by id with DB constraint handling.
app.delete('/api/suppliers/:id', (req, res) => {

    const supplierId = req.params.id;

    const deleteSupplierQuery = `
        DELETE FROM suppliers 
        WHERE supplier_id = ?
    `;

    db.query(deleteSupplierQuery, [supplierId], (err, result) => {
        if (err) {
            console.error('Database error on supplier deletion:', err);

            if (err.code === 'ER_ROW_IS_REFERENCED_2') {
                return res.status(409).json({
                    success: false,
                    message: 'لا يمكن حذف المورد لوجود سجلات مرتبطة به (مثل طلبيات أو منتجات). يفضل تعطيل المورد بدلاً من حذفه.'
                });
            }
            return res.status(500).json({
                success: false,
                message: 'فشل خادم داخلي أثناء حذف المورد.'
            });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'المورد المطلوب حذفه غير موجود.' });
        }

        res.status(200).json({
            success: true,
            message: `تم حذف المورد ID ${supplierId} بنجاح.`
        });
    });
});
// Route handler [GET] /api/machines: Fetches machines list with related operational metadata.
app.get('/api/machines', (req, res) => {
    const { search, category, status, sort } = req.query;

    getUsersIdColumn((columnErr, userIdColumn) => {
        if (columnErr) {
            return res.status(500).json({
                success: false,
                message: 'تعذر قراءة بنية جدول المستخدمين.'
            });
        }

        let query = `
            SELECT 
                m.machine_id,
                m.machine_code,
                m.machine_name,
                m.category,
                m.location_id,
                m.status,
                m.operating_hours,
                m.last_maintenance_date,
                m.next_maintenance_date,
                m.supplier_id,
                m.driver_user_id,
                s.name AS supplier_name,
                u.full_name AS driver_name
            FROM Machines m
            LEFT JOIN Suppliers s ON m.supplier_id = s.supplier_id
            LEFT JOIN Users u ON m.driver_user_id = u.${userIdColumn}
            WHERE 1=1
        `;
        const values = [];

        if (search) {
            const searchTerm = `%${search}%`;
            query += ` AND (m.machine_name LIKE ? OR m.machine_code LIKE ?)`;
            values.push(searchTerm, searchTerm);
        }

        if (category) {
            query += ` AND m.category = ?`;
            values.push(category);
        }

        if (status) {
            query += ` AND m.status = ?`;
            values.push(status);
        }

        if (sort) {
            const [field, dir] = sort.split(':');
            const allowedFields = ['machine_name', 'machine_code', 'next_maintenance_date', 'operating_hours'];
            const direction = dir && dir.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

            if (allowedFields.includes(field)) {
                query += ` ORDER BY m.${field} ${direction}`;
            } else {
                query += ` ORDER BY m.machine_name ASC`;
            }
        } else {
            query += ` ORDER BY m.machine_name ASC`;
        }

        db.query(query, values, (err, results) => {
            if (err) {
                console.error('Database error on fetching machines:', err);
                return res.status(500).json({
                    success: false,
                    message: 'فشل الخادم أثناء جلب قائمة الآليات.'
                });
            }

            res.status(200).json(results);
        });
    });
});

// Route handler [POST] /api/machines: Creates a new machine entry after validating machine fields.
app.post('/api/machines', (req, res) => {

    const { 
        machine_code, machine_name, category, location_id, status, 
        operating_hours, purchase_date, last_maintenance_date, 
        next_maintenance_date, supplier_id, facility_name, notes, driver_user_id 
    } = req.body;

    if (!machine_name || !status) {
        return res.status(400).json({ 
            success: false, 
            message: 'الرجاء إدخال اسم الآلية وحالتها التشغيلية.' 
        });
    }

    resolveEntityCode({
        submittedCode: machine_code,
        defaultPrefix: 'MCH',
        tableName: 'machines',
        codeColumn: 'machine_code'
    }, (codeErr, resolvedMachineCode) => {
        if (codeErr) {
            console.error('Database error during machine code generation:', codeErr);
            return res.status(500).json({ success: false, message: 'خطأ في قاعدة البيانات أثناء توليد رمز الآلية.' });
        }

        const query = `
            INSERT INTO Machines (
                machine_code, machine_name, category, location_id, status, 
                operating_hours, purchase_date, last_maintenance_date, 
                next_maintenance_date, supplier_id, facility_name, notes, driver_user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
            resolvedMachineCode, 
            machine_name, 
            category || null, 
            location_id || null, 
            status,
            operating_hours || 0, 
            purchase_date || null, 
            last_maintenance_date || null, 
            next_maintenance_date || null, 
            supplier_id || null, // مهم: إرسال القيمة NULL إذا لم يتم إرسال معرف مورد
            facility_name || null, 
            notes || null,
            driver_user_id || null
        ];

        db.query(query, values, (err, result) => {
            if (err) {
                console.error('Database error on adding new machine:', err);

                if (err.code === 'ER_DUP_ENTRY') {
                    if (String(err.message || '').includes('uniq_driver_user_id')) {
                        return res.status(409).json({ success: false, message: 'هذا السائق مرتبط بالفعل بآلية أخرى.' });
                    }
                    return res.status(409).json({ success: false, message: 'رمز الآلية مُستخدم بالفعل.' });
                }
                return res.status(500).json({ 
                    success: false, 
                    message: 'فشل خادم داخلي أثناء إضافة الآلية.' 
                });
            }

            res.status(201).json({ 
                success: true, 
                message: 'تم إضافة الآلية بنجاح.', 
                machine_id: result.insertId,
                machine_code: resolvedMachineCode 
            });
        });
    });
});

// Route handler [PUT] /api/machines/:id: Updates an existing machine entry by id.
app.put('/api/machines/:id', (req, res) => {

    const machineId = req.params.id;

    const { 
        machine_code, machine_name, category, location_id, status, 
        purchase_date, last_maintenance_date, next_maintenance_date, 
        operating_hours, supplier_id, facility_name, notes, driver_user_id 
    } = req.body;

    if (!machine_code || !machine_name || !status) {
        return res.status(400).json({ success: false, message: 'الرجاء توفير رمز واسم وحالة الآلية.' });
    }

    const sql = `UPDATE machines SET 
        machine_code = ?, 
        machine_name = ?, 
        category = ?, 
        location_id = ?, 
        status = ?, 
        purchase_date = ?, 
        last_maintenance_date = ?, 
        next_maintenance_date = ?, 
        operating_hours = ?, 
        supplier_id = ?, 
        facility_name = ?, 
        notes = ?,
        driver_user_id = ?
        WHERE machine_id = ?`;

    const values = [
        machine_code, machine_name, category, location_id, status,
        purchase_date, last_maintenance_date, next_maintenance_date,
        operating_hours, supplier_id || null, // يمكن أن يكون supplier_id فارغًا (null)
        facility_name, notes, driver_user_id || null, machineId
    ];

    db.query(sql, values, (err, result) => {
        if (err) {
            console.error('Database error during machine update:', err);
            if (err.code === 'ER_DUP_ENTRY' && String(err.message || '').includes('uniq_driver_user_id')) {
                return res.status(409).json({ success: false, message: 'هذا السائق مرتبط بالفعل بآلية أخرى.' });
            }
            return res.status(500).json({ success: false, message: 'فشل في تحديث بيانات الآلية. تحقق من الـ Console الخاص بالخادم لمعرفة التفاصيل.' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'الآلية غير موجودة أو لم تتغير البيانات.' });
        }

        res.json({ success: true, message: 'تم تحديث بيانات الآلية بنجاح.' });
    });
});

// Route handler [DELETE] /api/machines/:id: Deletes a machine by id with safe error handling.
app.delete('/api/machines/:id', (req, res) => {

    const machineId = req.params.id;

    const sql = `DELETE FROM machines WHERE machine_id = ?`;

    db.query(sql, [machineId], (err, result) => {
        if (err) {
            console.error('Database error during machine deletion:', err);

            return res.status(500).json({ success: false, message: 'فشل في حذف الآلية من قاعدة البيانات.' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'الآلية غير موجودة.' });
        }

        res.json({ success: true, message: 'تم حذف الآلية بنجاح.' });
    });
});

// Route handler [GET] /api/warehouses: Fetches warehouses list with filtering/search support.
app.get('/api/warehouses', (req, res) => {

    const { search, status, warehouse_type } = req.query;

    let query = `
        SELECT 
            id, code, name, warehouse_type, location, status, 
            DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
        FROM warehouses 
        WHERE 1=1
    `;
    const params = [];

    if (search) {
        query += ` AND (name LIKE ? OR code LIKE ? OR location LIKE ? OR warehouse_type LIKE ?)`;
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (status) {
        query += ` AND status = ?`;
        params.push(status);
    }

    if (warehouse_type) {
        query += ` AND warehouse_type = ?`;
        params.push(warehouse_type);
    }

    query += ` ORDER BY code ASC;`;

    db.query(query, params, (err, results) => {
        if (err) {
            console.error('Error fetching warehouses:', err);

            return res.status(500).json({ 
                success: false, 
                message: 'فشل جلب قائمة المستودعات من قاعدة البيانات.' 
            });
        }
      
        const warehouses = results
            .map((warehouse) => ({
                ...warehouse,
                code: normalizeStoredCode(warehouse.code),
                warehouse_type: inferWarehouseType(warehouse.name, warehouse.warehouse_type)
            }))
            .sort((left, right) => compareEntityCodes(left.code, right.code));

        res.status(200).json({ 
            success: true, 
            warehouses // إرجاع مصفوفة المستودعات
        });
    });
});

// Route handler [POST] /api/warehouses: Creates a warehouse and resolves consistent warehouse code/type values.
app.post('/api/warehouses', (req, res) => {

    const { code, name, warehouse_type, location, status } = req.body;

    if (!name || !warehouse_type) {
        return res.status(400).json({ 
            success: false, 
            message: 'الرجاء توفير اسم المستودع ونوعه.' 
        });
    }

    if (!WAREHOUSE_TYPES.includes(warehouse_type)) {
        return res.status(400).json({
            success: false,
            message: 'نوع المستودع غير صالح.'
        });
    }

    resolveEntityCode({
        submittedCode: code,
        defaultPrefix: 'WH',
        tableName: 'warehouses',
        codeColumn: 'code'
    }, (codeErr, resolvedCode) => {
        if (codeErr) {
            console.error('Database error during warehouse code generation:', codeErr);
            return res.status(500).json({ success: false, message: 'خطأ في قاعدة البيانات أثناء توليد رمز المستودع.' });
        }

        findCodeConflict({
            tableName: 'warehouses',
            codeColumn: 'code',
            candidateCode: resolvedCode
        }, (err, conflictRow) => {
            if (err) {
                console.error('Database error during warehouse code check:', err);
                return res.status(500).json({ success: false, message: 'خطأ في قاعدة البيانات أثناء التحقق من رمز المستودع.' });
            }

            if (conflictRow) {
                return res.status(409).json({ success: false, message: 'رمز المستودع (Code) مُستخدم بالفعل. الرجاء اختيار رمز آخر.' });
            }

            const insertQuery = `
                INSERT INTO warehouses 
                (code, name, warehouse_type, location, status) 
                VALUES (?, ?, ?, ?, ?);
            `;

            db.query(insertQuery, [ resolvedCode, name, warehouse_type, location || null, status || 'نشط' ], (err, result) => {
                if (err) {
                    console.error('Database error on warehouse insertion:', err);

                    return res.status(500).json({ success: false, message: 'فشل حفظ المستودع في قاعدة البيانات.' });
                }

                res.status(201).json({ 
                    success: true, 
                    message: 'تم إضافة المستودع بنجاح.',
                    id: result.insertId, // إرجاع المعرف الجديد
                    code: resolvedCode
                });
            });
        });
    });
});

// Route handler [PUT] /api/warehouses/:id: Updates warehouse details by id.
app.put('/api/warehouses/:id', (req, res) => {

    const warehouseId = req.params.id;

    const { code, name, warehouse_type, location, status } = req.body;
    const normalizedCode = normalizeStoredCode(code);

    if (!warehouseId || !normalizedCode || !name || !warehouse_type) {
        return res.status(400).json({ 
            success: false, 
            message: 'بيانات التحديث غير كاملة (المعرف، الرمز، الاسم، والنوع مطلوبة).' 
        });
    }

    if (!WAREHOUSE_TYPES.includes(warehouse_type)) {
        return res.status(400).json({
            success: false,
            message: 'نوع المستودع غير صالح.'
        });
    }

    findCodeConflict({
        tableName: 'warehouses',
        codeColumn: 'code',
        candidateCode: normalizedCode,
        excludeColumn: 'id',
        excludeValue: warehouseId
    }, (checkErr, conflictRow) => {
        if (checkErr) {
            console.error('Database error on warehouse update code check:', checkErr);
            return res.status(500).json({ success: false, message: 'خطأ في قاعدة البيانات أثناء التحقق من رمز المستودع.' });
        }

        if (conflictRow) {
            return res.status(409).json({ success: false, message: 'رمز المستودع (Code) مُستخدم بالفعل من قبل مستودع آخر.' });
        }

        const updateQuery = `
            UPDATE warehouses 
            SET 
                code = ?, 
                name = ?, 
                warehouse_type = ?,
                location = ?, 
                status = ?
            WHERE id = ? 
        `;

        const values = [
            normalizedCode, name, warehouse_type, location || null, status || 'نشط',
            warehouseId // الـ ID يوضع في النهاية للاستخدام في شرط WHERE
        ];

        db.query(updateQuery, values, (err, result) => {
            if (err) {
                console.error('Database error on warehouse update:', err);

                if (err.code === 'ER_DUP_ENTRY') {
                     return res.status(409).json({ success: false, message: 'رمز المستودع (Code) مُستخدم بالفعل من قبل مستودع آخر.' });
                }

                return res.status(500).json({ 
                    success: false, 
                    message: 'فشل خادم داخلي أثناء تحديث المستودع.'
                });
            }

            if (result.affectedRows === 0) {

                return res.status(404).json({ success: false, message: 'المستودع المطلوب تعديله غير موجود.' });
            }

            res.status(200).json({ 
                success: true, 
                message: `تم تحديث المستودع ID ${warehouseId} بنجاح.`
            });
        });
    });
});

// Route handler [DELETE] /api/warehouses/:id: Deletes warehouse record by id.
app.delete('/api/warehouses/:id', (req, res) => {

    const warehouseId = req.params.id;

    const deleteQuery = `
        DELETE FROM warehouses 
        WHERE id = ?
    `;

    db.query(deleteQuery, [warehouseId], (err, result) => {
        if (err) {
            console.error('Database error on warehouse deletion:', err);

            return res.status(500).json({
                success: false,
                message: 'فشل خادم داخلي أثناء حذف المستودع.'
            });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'المستودع المطلوب حذفه غير موجود.' });
        }

        res.status(200).json({
            success: true,
            message: `تم حذف المستودع ID ${warehouseId} وجميع المواقع التابعة له بنجاح.`
        });
    });
});

// Route handler [GET] /api/locations: Fetches storage locations with optional warehouse/status filters.
app.get('/api/locations', (req, res) => {

    const { search, warehouseId, status } = req.query;

    let query = `
        SELECT 
            l.id, l.code, l.rack, l.aisle, l.level, l.capacity, l.status,
            l.warehouse_id, 
            w.name AS warehouse_name, 
            w.code AS warehouse_code
        FROM locations l
        JOIN warehouses w ON l.warehouse_id = w.id
        WHERE 1=1
    `;
    const params = [];

    if (warehouseId) {
        query += ` AND l.warehouse_id = ?`;
        params.push(warehouseId);
    }

    if (status) {
        query += ` AND l.status = ?`;
        params.push(status);
    }

    if (search) {
        query += ` AND (l.code LIKE ? OR l.rack LIKE ? OR l.aisle LIKE ? OR l.level LIKE ?)`;
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    query += ` ORDER BY l.code ASC;`;

    db.query(query, params, (err, results) => {
        if (err) {
            console.error('Error fetching locations:', err);
            return res.status(500).json({ 
                success: false, 
                message: 'فشل جلب قائمة المواقع من قاعدة البيانات.' 
            });
        }

        res.status(200).json({ 
            success: true, 
            locations: results // إرجاع مصفوفة المواقع
        });
    });
});

// Route handler [POST] /api/locations: Creates a new storage location with uniqueness checks.
app.post('/api/locations', (req, res) => {

    const { code, warehouseId, rack, aisle, level, capacity, status } = req.body;

    if (!warehouseId) {
        return res.status(400).json({ 
            success: false, 
            message: 'الرجاء توفير معرف المستودع التابع.' 
        });
    }

    resolveEntityCode({
        submittedCode: code,
        defaultPrefix: 'LOC',
        tableName: 'locations',
        codeColumn: 'code',
        scopeClause: 'warehouse_id = ?',
        scopeParams: [warehouseId]
    }, (codeErr, resolvedCode) => {
        if (codeErr) {
            console.error('Database error during location code generation:', codeErr);
            return res.status(500).json({ success: false, message: 'خطأ في قاعدة البيانات أثناء توليد رمز الموقع.' });
        }

        const checkQuery = 'SELECT id FROM locations WHERE warehouse_id = ? AND code = ?';
        db.query(checkQuery, [warehouseId, resolvedCode], (err, results) => {
            if (err) {
                console.error('Database error during location code check:', err);
                return res.status(500).json({ success: false, message: 'خطأ في قاعدة البيانات أثناء التحقق من رمز الموقع.' });
            }

            if (results.length > 0) {
                return res.status(409).json({ success: false, message: `رمز الموقع "${resolvedCode}" مُستخدم بالفعل في المستودع المحدد.` });
            }

            const insertQuery = `
                INSERT INTO locations 
                (code, warehouse_id, rack, aisle, level, capacity, status) 
                VALUES (?, ?, ?, ?, ?, ?, ?);
            `;

            const values = [ 
                resolvedCode, 
                warehouseId, 
                rack || null, 
                aisle || null, 
                level || null, 
                capacity || null, 
                status || 'حر' 
            ];

            db.query(insertQuery, values, (err, result) => {
                if (err) {
                    console.error('Database error on location insertion:', err);

                    if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') {
                        return res.status(400).json({ success: false, message: 'المستودع التابع غير موجود.' });
                    }

                    return res.status(500).json({ success: false, message: 'فشل حفظ الموقع في قاعدة البيانات.' });
                }

                res.status(201).json({ 
                    success: true, 
                    message: 'تم إضافة الموقع بنجاح.',
                    id: result.insertId,
                    code: resolvedCode
                });
            });
        });
    });
});

// Route handler [PUT] /api/locations/:id: Updates location details by id.
app.put('/api/locations/:id', (req, res) => {

    const locationId = req.params.id;

    const { code, warehouseId, rack, aisle, level, capacity, status } = req.body;

    if (!locationId || !code || !warehouseId) {
        return res.status(400).json({ 
            success: false, 
            message: 'بيانات التحديث غير كاملة (المعرف، الرمز، ومعرف المستودع مطلوبان).' 
        });
    }

    const updateQuery = `
        UPDATE locations 
        SET 
            code = ?, 
            warehouse_id = ?, 
            rack = ?, 
            aisle = ?, 
            level = ?, 
            capacity = ?, 
            status = ?
        WHERE id = ? 
    `;

    const values = [
        code, 
        warehouseId, 
        rack || null, 
        aisle || null, 
        level || null, 
        capacity || null, 
        status || 'حر',
        locationId // الـ ID يوضع في النهاية للاستخدام في شرط WHERE
    ];

    db.query(updateQuery, values, (err, result) => {
        if (err) {
            console.error('Database error on location update:', err);

            if (err.code === 'ER_DUP_ENTRY') {
                 return res.status(409).json({ success: false, message: `رمز الموقع "${code}" مُستخدم بالفعل في المستودع المحدد.` });
            }

            if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') {
                return res.status(400).json({ success: false, message: 'المستودع التابع غير موجود.' });
            }

            return res.status(500).json({ 
                success: false, 
                message: 'فشل خادم داخلي أثناء تحديث الموقع.'
            });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'الموقع المطلوب تعديله غير موجود.' });
        }

        res.status(200).json({ 
            success: true, 
            message: `تم تحديث الموقع ID ${locationId} بنجاح.`
        });
    });
});

// Route handler [DELETE] /api/locations/:id: Deletes location record by id.
app.delete('/api/locations/:id', (req, res) => {

    const locationId = req.params.id;

    const deleteQuery = `
        DELETE FROM locations 
        WHERE id = ?
    `;

    db.query(deleteQuery, [locationId], (err, result) => {
        if (err) {
            console.error('Database error on location deletion:', err);

            return res.status(500).json({
                success: false,
                message: 'فشل خادم داخلي أثناء حذف الموقع.'
            });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'الموقع المطلوب حذفه غير موجود.' });
        }

        res.status(200).json({
            success: true,
            message: `تم حذف الموقع ID ${locationId} بنجاح.`
        });
    });
});

// Route handler [GET] /api/suppliers/:id/history: Returns supplier profile with historical purchases and summary stats.
app.get('/api/suppliers/:id/history', (req, res) => {

    const supplierId = req.params.id;

    if (!supplierId) {
        return res.status(400).json({ success: false, message: 'لم يتم تحديد معرف المورد.' });
    }

    const summaryQuery = `
        SELECT 
            s.name,
            COUNT(p.id) AS total_transactions,
            IFNULL(SUM(p.quantity * p.unit_price), 0) AS total_value,
            MAX(p.transaction_date) AS last_purchase
        FROM suppliers s
        LEFT JOIN purchases p ON s.supplier_id = p.supplier_id -- الربط بـ supplier_id
        WHERE s.supplier_id = ?
        GROUP BY s.supplier_id, s.name;
    `;

    db.query(summaryQuery, [supplierId], (err, summaryResults) => {
        if (err) {
            console.error('Database error during supplier history summary fetch:', err);
            return res.status(500).json({ success: false, message: 'فشل جلب ملخص تاريخ المورد.' });
        }

        if (summaryResults.length === 0) {
            return res.status(404).json({ success: false, message: 'المورد المطلوب غير موجود.' });
        }
        
        const summary = summaryResults[0];

        const transactionsQuery = `
            SELECT
                DATE_FORMAT(transaction_date, '%Y-%m-%d') AS date,
                product_name AS product,
                quantity,
                unit_price,
                (quantity * unit_price) AS total,
                YEAR(transaction_date) AS year,
                notes
            FROM purchases
            WHERE supplier_id = ?
            ORDER BY transaction_date DESC;
        `;

        db.query(transactionsQuery, [supplierId], (err, transactionsResults) => {
            if (err) {
                console.error('Database error during supplier transactions fetch:', err);
                return res.status(500).json({ success: false, message: 'فشل جلب تفاصيل التعاملات.' });
            }

            const lastPurchaseDate = summary.last_purchase ? new Date(summary.last_purchase).toISOString().substring(0, 10) : '-';

            const avgTransaction = summary.total_transactions > 0 
                ? (summary.total_value / summary.total_transactions) 
                : 0;
            
            const historyData = {
                name: summary.name,
                total_transactions: parseInt(summary.total_transactions),
                total_value: parseFloat(summary.total_value),
                last_purchase: lastPurchaseDate,
                avg_transaction_value: parseFloat(avgTransaction),
                transactions: transactionsResults
            };

            res.status(200).json({ 
                success: true, 
                history: historyData 
            });
        });
    });
});

// Route handler [POST] /api/purchases: Registers a purchase transaction and updates supplier aggregates.
app.post('/api/purchases', (req, res) => {

    const { 
        supplier_id, 
        transaction_date, 
        product_name, 
        quantity, 
        unit_price, 
        notes 
    } = req.body;

    if (!supplier_id || !transaction_date || !product_name || !quantity || !unit_price) {
        return res.status(400).json({ success: false, message: 'الرجاء تزويد جميع الحقول المطلوبة (المورد، التاريخ، المنتج، الكمية، السعر).' });
    }

    const purchaseValue = parseFloat(quantity) * parseFloat(unit_price);

    const insertPurchaseSql = `
        INSERT INTO purchases 
        (supplier_id, transaction_date, product_name, quantity, unit_price, notes) 
        VALUES (?, ?, ?, ?, ?, ?)
    `;
    const insertValues = [supplier_id, transaction_date, product_name, quantity, unit_price, notes];

    db.query(insertPurchaseSql, insertValues, (err, result) => {
        if (err) {
            console.error('Database error during purchase insert:', err);
            return res.status(500).json({ success: false, message: 'فشل إدراج التعامل في قاعدة البيانات.' });
        }

        const updateSupplierSql = `
            UPDATE suppliers 
            SET 
                transactions = transactions + 1,
                total_value = total_value + ? 
            WHERE supplier_id = ?
        `;
        const updateValues = [purchaseValue, supplier_id];

        db.query(updateSupplierSql, updateValues, (err, updateResult) => {
            if (err) {

                console.error('Database error during supplier statistics update:', err);
                return res.status(500).json({ success: false, message: 'تم إدراج التعامل، لكن فشل تحديث إحصائيات المورد.' });
            }

            if (updateResult.affectedRows === 0) {

                 return res.status(404).json({ success: false, message: 'فشل تحديث الإحصائيات، ربما المورد غير موجود.' });
            }

            res.json({ 
                success: true, 
                message: 'تم تسجيل عملية الشراء وتحديث إحصائيات المورد بنجاح.',
                purchase_id: result.insertId 
            });
        });
    });
});

// Route handler [GET] /api/inventory/items: Returns inventory items joined with warehouse/location context.
app.get('/api/inventory/items', (req, res) => {

    const sql = `
        SELECT 
            i.item_id, 
            i.item_code, 
            i.item_name, 
            i.current_qty, 
            i.unit,
            i.min_stock, 
            i.images,
            w.name AS warehouse_name,
            l.rack,
            l.code AS location_code
        FROM inventory_items i
        LEFT JOIN locations l ON i.location_id = l.id
        LEFT JOIN warehouses w ON l.warehouse_id = w.id
        ORDER BY i.item_name ASC;
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error('Database error fetching inventory items:', err);
            return res.status(500).json({ success: false, message: 'فشل في جلب بيانات المخزون.' });
        }

        const items = results.map(item => ({
            ...item,

            images: item.images ? JSON.parse(item.images) : []
        }));

        res.json({ success: true, items });
    });
});

// Route handler [POST] /api/inventory/receive: Increases item quantity and writes receive transaction log entry.
app.post('/api/inventory/receive', (req, res) => {

    const { item_id, qty, reference, user, attachment_paths } = req.body;

    if (!item_id || !qty || parseFloat(qty) <= 0) {
        return res.status(400).json({ success: false, message: 'الرجاء تزويد معرف المادة item_id والكمية qty الموجبة.' });
    }

    const quantity = parseFloat(qty);
    const itemID = parseInt(item_id);

    db.beginTransaction(err => {
        if (err) {
            console.error('Transaction start error:', err);
            return res.status(500).json({ success: false, message: 'فشل بدء عملية قاعدة البيانات.' });
        }

        const updateItemSql = `
            UPDATE inventory_items
            SET current_qty = current_qty + ?
            WHERE item_id = ?;
        `;
        
        db.query(updateItemSql, [quantity, itemID], (err, result) => {
            if (err) {

                return db.rollback(() => {
                    console.error('Error updating inventory quantity:', err);
                    res.status(500).json({ success: false, message: 'فشل في تحديث كمية المخزون.' });
                });
            }

            if (result.affectedRows === 0) {
                 return db.rollback(() => {
                    res.status(404).json({ success: false, message: 'المادة غير موجودة في المخزون (item_id غير صحيح).' });
                });
            }

            const insertTransactionSql = `
                INSERT INTO transaction_log
                (item_id, type, qty_change, reference, user, attachment_paths)
                VALUES (?, 'استلام', ?, ?, ?, ?);
            `;
            const logValues = [
                itemID, 
                quantity, 
                reference || 'استلام داخلي', 
                user || 'مشرف النظام', 
                attachment_paths || null
            ];

            db.query(insertTransactionSql, logValues, (err, transactionResult) => {
                if (err) {

                    return db.rollback(() => {
                        console.error('Error inserting transaction log:', err);
                        res.status(500).json({ success: false, message: 'فشل في تسجيل الحركة في السجل.' });
                    });
                }

                db.commit(err => {
                    if (err) {
                        return db.rollback(() => {
                            console.error('Transaction commit error:', err);
                            res.status(500).json({ success: false, message: 'فشل في إنهاء عملية قاعدة البيانات.' });
                        });
                    }
                    res.json({ success: true, message: 'تم استلام المادة وتسجيل الحركة بنجاح.', transaction_id: transactionResult.insertId });
                });
            });
        });
    });
});

// Route handler [POST] /api/inventory/issue: Decreases item quantity and writes issue transaction log entry.
app.post('/api/inventory/issue', (req, res) => {

    const { item_id, qty, reference, user, attachment_paths } = req.body;

    if (!item_id || !qty || parseFloat(qty) <= 0) {
        return res.status(400).json({ success: false, message: 'الرجاء تزويد معرف المادة item_id والكمية qty الموجبة المراد صرفها.' });
    }

    const quantity = parseFloat(qty);
    const itemID = parseInt(item_id);
    const negativeQuantity = -quantity; // الكمية المستخدمة في سجل الحركات يجب أن تكون سالبة للصرف

    db.beginTransaction(err => {
        if (err) {
            console.error('Transaction start error:', err);
            return res.status(500).json({ success: false, message: 'فشل بدء عملية قاعدة البيانات.' });
        }

        const updateItemSql = `
            UPDATE inventory_items
            SET current_qty = current_qty - ?
            WHERE item_id = ?;
        `;
        
        db.query(updateItemSql, [quantity, itemID], (err, result) => {
            if (err) {

                return db.rollback(() => {
                    console.error('Error updating inventory quantity for issue:', err);
                    res.status(500).json({ success: false, message: 'فشل في تحديث كمية المخزون.' });
                });
            }

            if (result.affectedRows === 0) {
                 return db.rollback(() => {
                    res.status(404).json({ success: false, message: 'المادة غير موجودة في المخزون (item_id غير صحيح).' });
                });
            }

            const insertTransactionSql = `
                INSERT INTO transaction_log
                (item_id, type, qty_change, reference, user, attachment_paths)
                VALUES (?, 'صرف', ?, ?, ?, ?);
            `;
            const logValues = [
                itemID, 
                negativeQuantity, // تسجيل القيمة سالبة لتمثل صرفاً
                reference || 'صرف داخلي', 
                user || 'مشرف النظام', 
                attachment_paths || null
            ];

            db.query(insertTransactionSql, logValues, (err, transactionResult) => {
                if (err) {

                    return db.rollback(() => {
                        console.error('Error inserting transaction log for issue:', err);
                        res.status(500).json({ success: false, message: 'فشل في تسجيل الحركة في السجل.' });
                    });
                }

                db.commit(err => {
                    if (err) {
                        return db.rollback(() => {
                            console.error('Transaction commit error:', err);
                            res.status(500).json({ success: false, message: 'فشل في إنهاء عملية قاعدة البيانات.' });
                        });
                    }
                    res.json({ success: true, message: 'تم صرف المادة وتسجيل الحركة بنجاح.', transaction_id: transactionResult.insertId });
                });
            });
        });
    });
});

// Route handler [GET] /api/inventory/transactions: Returns unified inventory transaction history.
app.get('/api/inventory/transactions', (req, res) => {

    const sql = `
        SELECT 
            t.transaction_id AS id, 
            t.type, 
            t.qty_change AS qty,
            t.reference,
            t.user,
            t.created_at AS date,
            i.item_name AS itemName,
            i.item_code AS itemCode,
            t.attachment_paths
        FROM transaction_log t
        JOIN inventory_items i ON t.item_id = i.item_id
        ORDER BY t.created_at DESC; -- الأحدث أولاً
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error('Database error fetching transaction log:', err);
            return res.status(500).json({ success: false, message: 'فشل في جلب سجل الحركات.' });
        }

        const transactions = results.map(t => ({
            ...t,

            attachments: t.attachment_paths ? JSON.parse(t.attachment_paths) : []
        }));

        res.json({ success: true, transactions });
    });
});

// Route handler [POST] /api/requests: Creates a new inventory request entry.
app.post('/api/requests', (req, res) => {

    const { item_id, quantity, requested_by, justification } = req.body;

    if (!item_id || !quantity || parseFloat(quantity) <= 0 || !requested_by) {
        return res.status(400).json({ success: false, message: 'الرجاء تزويد معرف المادة item_id، الكمية المطلوبة، واسم الطالب.' });
    }

    const sql = `
        INSERT INTO requests
        (item_id, quantity, requested_by, justification, status)
        VALUES (?, ?, ?, ?, 'جديد');
    `;
    const values = [
        parseInt(item_id), 
        parseFloat(quantity), 
        requested_by, 
        justification || null
    ];

    db.query(sql, values, (err, result) => {
        if (err) {
            console.error('Database error during request creation:', err);
            return res.status(500).json({ success: false, message: 'فشل في إنشاء طلب المادة.' });
        }
        
        res.json({ 
            success: true, 
            message: 'تم إنشاء طلب المادة بنجاح بانتظار الاعتماد.', 
            request_id: result.insertId 
        });
    });
});

// Route handler [GET] /api/requests: Returns inventory requests list with item context.
app.get('/api/requests', (req, res) => {

    const sql = `
        SELECT 
            r.request_id AS id, 
            r.quantity AS qty,
            r.requested_by,
            r.status,
            r.justification,
            r.created_at AS date,
            i.item_name AS itemName,
            i.item_code AS itemCode
        FROM requests r
        JOIN inventory_items i ON r.item_id = i.item_id
        ORDER BY r.created_at DESC; -- الأحدث أولاً
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error('Database error fetching requests:', err);
            return res.status(500).json({ success: false, message: 'فشل في جلب قائمة الطلبات.' });
        }
        
        res.json({ success: true, requests: results });
    });
});

// Route handler [POST] /api/requests/approve/:id: Approves request, applies stock movement, and updates request status atomically.
app.post('/api/requests/approve/:id', (req, res) => {
    const requestID = parseInt(req.params.id);
    const approvingUser = req.body.user || 'مشرف النظام'; // اسم المستخدم الذي اعتمد الطلب

    if (isNaN(requestID)) {
        return res.status(400).json({ success: false, message: 'معرف الطلب غير صحيح.' });
    }

    db.beginTransaction(err => {
        if (err) {
            console.error('Transaction start error:', err);
            return res.status(500).json({ success: false, message: 'فشل بدء عملية قاعدة البيانات.' });
        }

        const getRequestSql = `
            SELECT 
                r.item_id, 
                r.quantity AS requested_qty, 
                r.requested_by,
                r.status,
                i.item_name,
                i.current_qty AS available_qty
            FROM requests r
            JOIN inventory_items i ON r.item_id = i.item_id
            WHERE r.request_id = ? AND r.status = 'جديد';
        `;

        db.query(getRequestSql, [requestID], (err, results) => {
            if (err) {
                return db.rollback(() => {
                    console.error('Error fetching request details:', err);
                    res.status(500).json({ success: false, message: 'فشل في جلب تفاصيل الطلب.' });
                });
            }

            if (results.length === 0) {
                return db.rollback(() => {
                    res.status(404).json({ success: false, message: 'الطلب غير موجود أو تم اعتماده مسبقاً.' });
                });
            }

            const request = results[0];
            const itemID = request.item_id;
            const requestedQty = parseFloat(request.requested_qty);
            const availableQty = parseFloat(request.available_qty);
            let issuedQty = requestedQty; // الكمية التي سيتم صرفها

            if (availableQty < requestedQty) {

                issuedQty = Math.max(0, availableQty); 

                if (issuedQty === 0) {
                     return db.rollback(() => {
                        res.status(400).json({ success: false, message: 'المخزون المتوفر صفر ولا يمكن صرف المادة.' });
                    });
                }
            }

            const negativeIssuedQty = -issuedQty; // الكمية سالبة لـ transaction_log

            const updateItemSql = `
                UPDATE inventory_items
                SET current_qty = current_qty + ?
                WHERE item_id = ?;
            `;

            db.query(updateItemSql, [negativeIssuedQty, itemID], (err, result) => {
                if (err || result.affectedRows === 0) {
                    return db.rollback(() => {
                        console.error('Error updating inventory quantity for issue:', err);
                        res.status(500).json({ success: false, message: 'فشل في تحديث كمية المخزون بعد الصرف.' });
                    });
                }

                const insertTransactionSql = `
                    INSERT INTO transaction_log
                    (item_id, type, qty_change, reference, user)
                    VALUES (?, 'صرف', ?, ?, ?);
                `;
                const logValues = [
                    itemID, 
                    negativeIssuedQty,
                    `طلب#${requestID} - ${request.requested_by}`, 
                    approvingUser
                ];

                db.query(insertTransactionSql, logValues, (err, transactionResult) => {
                    if (err) {
                        return db.rollback(() => {
                            console.error('Error inserting transaction log:', err);
                            res.status(500).json({ success: false, message: 'فشل في تسجيل الحركة في السجل.' });
                        });
                    }

                    const updateRequestSql = `
                        UPDATE requests
                        SET status = 'تم الصرف'
                        WHERE request_id = ?;
                    `;
                    db.query(updateRequestSql, [requestID], (err, updateResult) => {
                        if (err || updateResult.affectedRows === 0) {
                            return db.rollback(() => {
                                console.error('Error updating request status:', err);
                                res.status(500).json({ success: false, message: 'فشل في تحديث حالة الطلب.' });
                            });
                        }

                        db.commit(err => {
                            if (err) {
                                return db.rollback(() => {
                                    console.error('Transaction commit error:', err);
                                    res.status(500).json({ success: false, message: 'فشل في إنهاء عملية قاعدة البيانات.' });
                                });
                            }
                            res.json({ 
                                success: true, 
                                message: `تم اعتماد الطلب وصرف كمية ${issuedQty} من المادة ${request.item_name}.`
                            });
                        });
                    });
                });
            });
        });
    });
});

// Route handler [POST] /api/suppliers/edit/:id: Applies partial supplier edits used by edit workflow.
app.post('/api/suppliers/edit/:id', (req, res) => {

    const supplierId = req.params.id;

    const { 
        name, 
        primary_phone, // يتوافق مع 'phone' في الواجهة الأمامية
        contact_person, // يتوافق مع 'contact' في الواجهة الأمامية
        address 

    } = req.body;

    const sql = `
        UPDATE suppliers
        SET 
            name = COALESCE(?, name),
            primary_phone = COALESCE(?, primary_phone),
            contact_person = COALESCE(?, contact_person),
            address = COALESCE(?, address),
            updated_at = CURRENT_TIMESTAMP()
        WHERE supplier_id = ?;
    `;

    const values = [
        name,
        primary_phone,
        contact_person,
        address,
        supplierId
    ];

    db.query(sql, values, (err, result) => {
        if (err) {
            console.error('Database error during supplier update:', err);
            return res.status(500).json({ success: false, message: 'فشل في تحديث بيانات المورد.' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'المورد غير موجود أو لم تتغير البيانات.' });
        }

        res.json({ success: true, message: 'تم تحديث بيانات المورد بنجاح.' });
    });
});

// Route handler [POST] /api/inventory/new: Creates a new inventory item and optional initial receive movement.
app.post('/api/inventory/new', (req, res) => {

    const { 
        code, 
        name, 
        qty, 
        min, 
        unit, 
        images, // يفترض أن الصور يتم إرسالها كسلسلة نصية (JSON string) لمساراتها أو DataURLs
        user 
    } = req.body;

    if (!name || !unit) {
        return res.status(400).json({ success: false, message: 'الرجاء تزويد اسم ووحدة المادة.' });
    }

    const initialQty = parseFloat(qty) || 0.00;
    const minStock = parseFloat(min) || 5.00;
    const itemUser = user || 'مشرف النظام';

    resolveEntityCode({
        submittedCode: code,
        defaultPrefix: 'ITM',
        tableName: 'inventory_items',
        codeColumn: 'item_code'
    }, (codeErr, resolvedItemCode) => {
        if (codeErr) {
            console.error('Database error during item code generation:', codeErr);
            return res.status(500).json({ success: false, message: 'خطأ في قاعدة البيانات أثناء توليد كود المادة.' });
        }

        db.beginTransaction(err => {
            if (err) {
                console.error('Transaction start error:', err);
                return res.status(500).json({ success: false, message: 'فشل بدء عملية قاعدة البيانات.' });
            }

            const insertItemSql = `
                INSERT INTO inventory_items
                (item_code, item_name, unit, min_stock, current_qty, images, location_id)
                VALUES (?, ?, ?, ?, ?, ?, NULL); -- يتم تعيين location_id على NULL مبدئياً
            `;
            const itemValues = [
                resolvedItemCode, 
                name, 
                unit, 
                minStock, 
                initialQty, 
                images || null
            ];

            db.query(insertItemSql, itemValues, (err, result) => {
                if (err) {

                    if (err.code === 'ER_DUP_ENTRY') {
                        return db.rollback(() => {
                            res.status(409).json({ success: false, message: 'الكود المدخل موجود مسبقاً لمادة أخرى.' });
                        });
                    }
                    return db.rollback(() => {
                        console.error('Error inserting new item:', err);
                        res.status(500).json({ success: false, message: 'فشل في إدراج المادة الجديدة.' });
                    });
                }

                const newItemId = result.insertId;

                if (initialQty > 0) {
                    const insertTransactionSql = `
                        INSERT INTO transaction_log
                        (item_id, type, qty_change, reference, user, attachment_paths)
                        VALUES (?, 'استلام', ?, ?, ?, ?);
                    `;
                    const logValues = [
                        newItemId, 
                        initialQty, 
                        `استلام أولي عند الإضافة`, 
                        itemUser, 
                        images || null
                    ];

                    db.query(insertTransactionSql, logValues, (err, transactionResult) => {
                        if (err) {
                            return db.rollback(() => {
                                console.error('Error inserting transaction log for new item:', err);
                                res.status(500).json({ success: false, message: 'تم إدراج المادة، لكن فشل تسجيل الحركة الأولية.' });
                            });
                        }

                        db.commit(err => {
                            if (err) {
                                return db.rollback(() => {
                                    console.error('Transaction commit error:', err);
                                    res.status(500).json({ success: false, message: 'فشل في إنهاء عملية قاعدة البيانات.' });
                                });
                            }
                            res.json({ 
                                success: true, 
                                message: 'تم إضافة المادة وتسجيل الاستلام الأولي بنجاح.', 
                                item_id: newItemId,
                                item_code: resolvedItemCode 
                            });
                        });
                    });
                } else {

                    db.commit(err => {
                        if (err) {
                            return db.rollback(() => {
                                console.error('Transaction commit error:', err);
                                res.status(500).json({ success: false, message: 'فشل في إنهاء عملية قاعدة البيانات.' });
                            });
                        }
                        res.json({ 
                            success: true, 
                            message: 'تم إضافة المادة بنجاح (كمية المخزون صفر).', 
                            item_id: newItemId,
                            item_code: resolvedItemCode 
                        });
                    });
                }
            });
        });
    });
});

// Route handler [POST] /api/inventory/edit/:id: Updates editable inventory item fields including image metadata.
app.post('/api/inventory/edit/:id', (req, res) => {
    const itemId = req.params.id;
    const { 
        code, 
        name, 
        min_stock, 
        unit, 
        location_id,
        new_images // JSON string of new image paths/DataURLs
    } = req.body;

    if (!itemId) {
        return res.status(400).json({ success: false, message: 'معرف المادة غير صحيح.' });
    }

    const getCurrentDataSql = 'SELECT images FROM inventory_items WHERE item_id = ?';
    
    db.query(getCurrentDataSql, [itemId], (err, currentResults) => {
        if (err) {
            console.error('Database error on fetching current item data:', err);
            return res.status(500).json({ success: false, message: 'فشل في جلب بيانات المادة الحالية.' });
        }
        
        if (currentResults.length === 0) {
            return res.status(404).json({ success: false, message: 'المادة غير موجودة.' });
        }
        
        const currentItem = currentResults[0];
        let existingImages = [];

        try {
            if (currentItem.images) {
                existingImages = JSON.parse(currentItem.images);
            }
        } catch (e) {
            console.warn('Could not parse existing images JSON:', currentItem.images);

        }

        let finalImages = existingImages;
        if (new_images) {
            try {
                const newImagesArray = JSON.parse(new_images);

                finalImages = newImagesArray; 
            } catch (e) {
                return res.status(400).json({ success: false, message: 'صيغة JSON لمسارات الصور الجديدة غير صالحة.' });
            }
        }
        
        const finalImagesJson = finalImages.length > 0 ? JSON.stringify(finalImages) : null;

        const updateSql = `
            UPDATE inventory_items
            SET 
                item_code = COALESCE(?, item_code),
                item_name = COALESCE(?, item_name),
                min_stock = COALESCE(?, min_stock),
                unit = COALESCE(?, unit),
                location_id = ?,
                images = ?
            WHERE item_id = ?;
        `;

        const values = [
            code,
            name,
            min_stock,
            unit,
            location_id || null, // يمكن أن يكون NULL
            finalImagesJson,
            itemId
        ];

        db.query(updateSql, values, (err, result) => {
            if (err) {
                console.error('Database error during item update:', err);
                return res.status(500).json({ success: false, message: 'فشل في تحديث بيانات المادة.' });
            }

            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, message: 'المادة غير موجودة أو لم تتغير البيانات.' });
            }

            res.json({ success: true, message: 'تم تحديث بيانات المادة بنجاح.' });
        });
    });
});

// Route handler [GET] /api/inventory/transactions/:id: Returns details for a specific inventory transaction.
app.get('/api/inventory/transactions/:id', (req, res) => {
    const transactionId = req.params.id;

    const sql = `
        SELECT 
            t.transaction_id AS id, 
            t.type, 
            t.qty_change AS qty, 
            t.reference, 
            t.user, 
            t.created_at AS date, 
            t.attachment_paths,
            i.item_name,
            i.item_code,
            i.unit
        FROM transaction_log t
        JOIN inventory_items i ON t.item_id = i.item_id
        WHERE t.transaction_id = ?;
    `;

    db.query(sql, [transactionId], (err, results) => {
        if (err) {
            console.error('Database error fetching transaction details:', err);
            return res.status(500).json({ success: false, message: 'فشل في جلب تفاصيل الحركة.' });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ success: false, message: 'الحركة غير موجودة.' });
        }

        res.json({ success: true, transaction: results[0] });
    });
});

};
