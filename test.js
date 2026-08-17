
const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 3000;

const db = mysql.createConnection({
   host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 61001, // <=== هذا هو التعديل الضروري!
    waitForConnections: true,
    connectionLimit: 10,
    connectTimeout: 20000 // يفضل لإطالة مهلة الانتظار
});

db.connect(err => {
    if (err) {
        console.error('Error connecting to MySQL:', err.stack);
        return;
    }
    console.log('Connected to MySQL as id ' + db.threadId);
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/login.html');
});


app.get('/login', (req, res) => {
    res.sendFile(__dirname + '/public/login.html');
});


app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    const query = 'SELECT role FROM users WHERE email = ? AND password = ?';

    db.query(query, [email, password], (err, results) => {
        if (err) {
            console.error(err);
            return res.redirect('/login.html?error=DatabaseError');
        }

        if (results.length > 0) {
            const userRole = results[0].role;

            if (userRole === 'Admin') {
                return res.redirect('/admin.html');
            } else if (userRole === 'Supervisor') {
                return res.redirect('/supervisor.html');
            }
            else 
                 return res.redirect('/vehicles2.html');
        }

        return res.redirect('/login.html?error=InvalidCredentials');
    });
});


app.get('/api/users', (req, res) => {

    const query = `
        SELECT 
            user_id, email, role, full_name
        FROM users 
        ORDER BY user_id DESC;
    `;


    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching users:', err);
            return res.status(500).json({ success: false, message: 'فشل جلب قائمة المستخدمين من قاعدة البيانات.' });
        }

        res.status(200).json({ success: true, users: results });
    });
});

app.post('/api/users', async (req, res) => {
    const { username , email, password, role } = req.body;
    const checkEmailQuery = 'SELECT * FROM users WHERE email = ?';
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
        
        db.query(insertUserQuery, [ email, password, role , username ], (err, result) => {
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
app.delete('/api/users/delete-by-email', (req, res) => {
    const { email } = req.body; 

    if (!email) {
        return res.status(400).json({ success: false, message: 'الرجاء إرسال البريد الإلكتروني للحذف.' });
    }

    const query = 'DELETE FROM users WHERE email = ?';

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


// GET /api/suppliers - جلب الموردين مع دعم التصفية والبحث
app.get('/api/suppliers', (req, res) => {
    
    // 1. استخراج معلمات الاستعلام (Query Parameters)
    const { search, category, min_rating, status } = req.query;
   
    // 2. بناء استعلام SQL أساسي
    let query = `
        SELECT 
            supplier_id AS id, name, specialization, category, rating, 
            primary_phone, secondary_phone, email, address, commercial_reg, 
            tax_number, payment_terms, currency, status, transactions, total_value
        FROM suppliers 
        WHERE 1=1
    `;
    const params = [];

    // 3. تطبيق شروط التصفية ديناميكياً
    
    // البحث بالاسم أو التخصص
    if (search) {
        query += ` AND (name LIKE ? OR specialization LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`);
    }

    // التصفية بالتصنيف
    if (category) {
        query += ` AND category = ?`;
        params.push(category);
    }

    // التصفية بالحد الأدنى للتقييم
    if (min_rating && !isNaN(parseInt(min_rating))) {
        query += ` AND rating >= ?`;
        params.push(parseInt(min_rating));
    }

    // التصفية بحالة النشاط
    if (status) {
        query += ` AND status = ?`; 
        params.push(status);
    }

    // الترتيب الافتراضي
    query += ` ORDER BY name ASC;`;

    // 4. تنفيذ الاستعلام باستخدام Callback
    db.query(query, params, (err, results) => {
        if (err) {
            console.error('Error fetching suppliers:', err);
            // إرجاع رسالة خطأ قياسية
            return res.status(500).json({ 
                success: false, 
                message: 'فشل جلب قائمة الموردين من قاعدة البيانات.' 
            });
        }
      
        // 5. إرسال البيانات
        res.status(200).json({ 
            success: true, 
            suppliers: results // النتائج تحتوي على حقل 'id' بدلاً من 'supplier_id'
        });
    });
});

// في ملف Express.js/app.js الخاص بك
// ------------------------------------------------------------------

app.post('/api/suppliers', (req, res) => {
    // 1. استخراج البيانات من جسم الطلب (req.body)
    // نستخدم نمط snake_case
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

    // 2. التحقق الأساسي من صحة البيانات (ضروري)
    if (!name || !primary_phone || !contact_person || rating === undefined || rating < 1 || rating > 5) {
        return res.status(400).json({ 
            success: false, 
            message: 'الرجاء تزويدنا بالاسم، الشخص المسؤول، الهاتف الرئيسي، والتقييم (1-5).' 
        });
    }

    // 3. بناء استعلام الإدراج (INSERT)
    const insertSupplierQuery = `
        INSERT INTO suppliers (
            name, specialization, category, rating, contact_person, 
            primary_phone, secondary_phone, email, address, commercial_reg, 
            tax_number, payment_terms, currency, status, transactions, total_value
        ) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, 0)
    `;
    
    // 4. ترتيب القيم المتغيرة
    const values = [
        name, specialization, category, rating, contact_person,
        primary_phone, secondary_phone, email, address, commercial_reg,
        tax_number, payment_terms, currency
    ];

    // 5. تنفيذ الاستعلام باستخدام db.query مع Callback
    db.query(insertSupplierQuery, values, (err, result) => {
        if (err) {
            console.error('Database error on supplier insertion:', err);
            
            // التعامل مع خطأ تكرار القيد (إذا كان لديك قيد فريد على الاسم مثلاً)
            if (err.code === 'ER_DUP_ENTRY') {
                 return res.status(409).json({ success: false, message: 'هذا المورد موجود بالفعل في قاعدة البيانات.' });
            }
            // التعامل مع أي خطأ آخر في قاعدة البيانات
            return res.status(500).json({ 
                success: false, 
                message: 'فشل حفظ المورد في قاعدة البيانات.',
                error: err.sqlMessage
            });
        }

        // 6. إرسال استجابة النجاح بعد اكتمال الحفظ بنجاح
        res.status(201).json({ 
            success: true, 
            message: 'تم إضافة المورد بنجاح.',
            supplierId: result.insertId 
        });
    });
});
// ------------------------------------------------------------------
// في ملف Express.js/app.js الخاص بك
// ------------------------------------------------------------------

app.put('/api/suppliers/:id', (req, res) => {
    // 1. استخراج الـ ID من المسار (URL)
    const supplierId = req.params.id;

    // 2. استخراج البيانات المُعدلة من جسم الطلب (req.body)
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

    // 3. التحقق الأساسي من الـ ID وصحة البيانات
    if (!supplierId || !name || rating === undefined || rating < 1 || rating > 5) {
        return res.status(400).json({ 
            success: false, 
            message: 'بيانات التحديث غير كاملة أو غير صالحة (الاسم والتقييم مطلوبان).' 
        });
    }

    // 4. بناء استعلام التحديث (UPDATE)
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
    
    // 5. ترتيب القيم المتغيرة (يجب أن يكون الـ ID آخر قيمة)
    const values = [
        name, specialization, category, rating, contact_person,
        primary_phone, secondary_phone, email, address, commercial_reg,
        tax_number, payment_terms, currency,
        supplierId // الـ ID يوضع في النهاية للاستخدام في شرط WHERE
    ];

    // 6. تنفيذ الاستعلام باستخدام db.query مع Callback
    db.query(updateSupplierQuery, values, (err, result) => {
        if (err) {
            console.error('Database error on supplier update:', err);
            return res.status(500).json({ 
                success: false, 
                message: 'فشل خادم داخلي أثناء تحديث المورد.',
                error: err.sqlMessage
            });
        }

        // التحقق مما إذا كان قد تم تعديل أي صف (أي إذا كان الـ ID موجوداً)
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'المورد المطلوب تعديله غير موجود.' });
        }

        // 7. إرسال استجابة النجاح بعد اكتمال التحديث
        res.status(200).json({ 
            success: true, 
            message: `تم تحديث المورد ID ${supplierId} بنجاح.`
        });
    });
});
// ------------------------------------------------------------------
// في ملف Express.js/app.js الخاص بك
// ------------------------------------------------------------------

app.get('/api/suppliers/:id', (req, res) => {
    // 1. استخراج الـ ID من المسار (URL)
    const supplierId = req.params.id;

    // 2. بناء استعلام الجلب (SELECT)
    // ملاحظة: نستخدم الـ AS لضمان تطابق أسماء الأعمدة مع ما يتوقعه الفرونت إند (snake_case)
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

    // 3. تنفيذ الاستعلام باستخدام db.query مع Callback
    db.query(query, [supplierId], (err, results) => {
        if (err) {
            console.error('Database error on fetching single supplier:', err);
            return res.status(500).json({ 
                success: false, 
                message: 'فشل خادم داخلي أثناء جلب بيانات المورد.' 
            });
        }

        // 4. التحقق مما إذا تم العثور على المورد
        if (results.length === 0) {
            return res.status(404).json({ success: false, message: 'المورد غير موجود.' });
        }

        // 5. إرسال بيانات المورد (الصف الأول)
        // يجب أن تكون الاستجابة هي كائن المورد مباشرة لتتمكن واجهة المستخدم من ملء النموذج
        res.status(200).json(results[0]); 
    });
});
// ------------------------------------------------------------------
// في ملف Express.js/app.js الخاص بك
// ------------------------------------------------------------------

app.delete('/api/suppliers/:id', (req, res) => {
    // 1. استخراج الـ ID من المسار (URL)
    const supplierId = req.params.id;

    // 2. بناء استعلام الحذف (DELETE)
    // نستخدم WHERE supplier_id = ? لحذف مورد محدد فقط
    const deleteSupplierQuery = `
        DELETE FROM suppliers 
        WHERE supplier_id = ?
    `;

    // 3. تنفيذ الاستعلام باستخدام db.query مع Callback
    db.query(deleteSupplierQuery, [supplierId], (err, result) => {
        if (err) {
            console.error('Database error on supplier deletion:', err);
            // قد يكون خطأ مفتاح خارجي (Foreign Key) يمنع الحذف
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

        // 4. التحقق مما إذا كان قد تم حذف أي صف
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'المورد المطلوب حذفه غير موجود.' });
        }

        // 5. إرسال استجابة النجاح بعد اكتمال الحذف
        res.status(200).json({
            success: true,
            message: `تم حذف المورد ID ${supplierId} بنجاح.`
        });
    });
});
// في ملف Express.js/app.js الخاص بك
// ------------------------------------------------------------------

app.get('/api/machines', (req, res) => {
    // 1. استخراج معاملات الاستعلام (Query Parameters)
    const { search, category, status, sort } = req.query;
    
    // 2. بناء الاستعلام الأساسي مع الربط لاسم المورد
    let query = `
        SELECT 
            m.*, 
            s.name AS supplier_name 
        FROM Machines m
        LEFT JOIN suppliers s ON m.supplier_id = s.supplier_id
        WHERE 1=1
    `;
    let values = [];

    // 3. إضافة شرط البحث (Search)
    if (search) {
        const searchTerm = `%${search}%`;
        query += ` AND (m.machine_name LIKE ? OR m.machine_code LIKE ?)`;
        values.push(searchTerm, searchTerm);
    }

    // 4. إضافة شروط التصفية (Filtering)
    if (category) {
        query += ` AND m.category = ?`;
        values.push(category);
    }
    if (status) {
        query += ` AND m.status = ?`;
        values.push(status);
    }

    // 5. إضافة شرط الفرز (Sorting)
    if (sort) {
        // فحص قيم الفرز لضمان عدم وجود حقن SQL (SQL Injection)
        const [field, dir] = sort.split(':');
        const allowedFields = ['machine_name', 'machine_code', 'next_maintenance_date', 'operating_hours'];
        const direction = dir.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
        
        if (allowedFields.includes(field)) {
            query += ` ORDER BY m.${field} ${direction}`;
        }
    } else {
        // فرز افتراضي
        query += ` ORDER BY m.machine_name ASC`;
    }

    // 6. تنفيذ الاستعلام باستخدام db.query مع Callback
    db.query(query, values, (err, results) => {
        if (err) {
            console.error('Database error on fetching machines:', err);
            return res.status(500).json({ 
                success: false, 
                message: 'فشل خادم داخلي أثناء جلب قائمة الآليات.' 
            });
        }

        // 7. إرسال قائمة الآليات
        res.status(200).json(results);
    });
});
// ------------------------------------------------------------------
// في ملف Express.js/app.js الخاص بك
// ------------------------------------------------------------------

app.post('/api/machines', (req, res) => {
    // 1. استخراج البيانات من جسم الطلب
    const { 
        machine_code, machine_name, category, location_id, status, 
        operating_hours, purchase_date, last_maintenance_date, 
        next_maintenance_date, supplier_id, facility_name, notes 
    } = req.body;

    // 2. التحقق من البيانات المطلوبة (الحد الأدنى)
    if (!machine_code || !machine_name || !status) {
        return res.status(400).json({ 
            success: false, 
            message: 'الرجاء إدخال رمز واسم الآلية وحالتها التشغيلية.' 
        });
    }

    // 3. بناء استعلام INSERT INTO
    const query = `
        INSERT INTO machines (
            machine_code, machine_name, category, location_id, status, 
            operating_hours, purchase_date, last_maintenance_date, 
            next_maintenance_date, supplier_id, facility_name, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    // 4. ترتيب القيم
    const values = [
        machine_code, 
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
        notes || null
    ];

    // 5. تنفيذ الاستعلام
    db.query(query, values, (err, result) => {
        if (err) {
            console.error('Database error on adding new machine:', err);
            // قد يكون خطأ في الـ Unique Constraint (مثل تكرار machine_code)
            if (err.code === 'ER_DUP_ENTRY') {
                 return res.status(409).json({ success: false, message: 'رمز الآلية مُستخدم بالفعل.' });
            }
            return res.status(500).json({ 
                success: false, 
                message: 'فشل خادم داخلي أثناء إضافة الآلية.' 
            });
        }
        
        // 6. الرد بنجاح
        res.status(201).json({ 
            success: true, 
            message: 'تم إضافة الآلية بنجاح.', 
            machine_id: result.insertId 
        });
    });
});

// PUT /api/machines/:id لتعديل بيانات آلية موجودة
app.put('/api/machines/:id', (req, res) => {
    // 1. استخراج معرف الآلية من البارامترات
    const machineId = req.params.id;
    
    // 2. استخراج البيانات من جسم الطلب
    const { 
        machine_code, machine_name, category, location_id, status, 
        purchase_date, last_maintenance_date, next_maintenance_date, 
        operating_hours, supplier_id, facility_name, notes 
    } = req.body;

    // 3. التحقق من صحة البيانات الأساسية
    if (!machine_code || !machine_name || !status) {
        return res.status(400).json({ success: false, message: 'الرجاء توفير رمز واسم وحالة الآلية.' });
    }

    // 4. جملة SQL للتحديث
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
        notes = ?
        WHERE machine_id = ?`;

    // 5. مصفوفة القيم
    const values = [
        machine_code, machine_name, category, location_id, status,
        purchase_date, last_maintenance_date, next_maintenance_date,
        operating_hours, supplier_id || null, // يمكن أن يكون supplier_id فارغًا (null)
        facility_name, notes, machineId
    ];

    // 6. تنفيذ التحديث باستخدام db.query
    db.query(sql, values, (err, result) => {
        if (err) {
            console.error('Database error during machine update:', err);
            return res.status(500).json({ success: false, message: 'فشل في تحديث بيانات الآلية. تحقق من الـ Console الخاص بالخادم لمعرفة التفاصيل.' });
        }

        // 7. التحقق من عدد الصفوف التي تأثرت
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'الآلية غير موجودة أو لم تتغير البيانات.' });
        }

        res.json({ success: true, message: 'تم تحديث بيانات الآلية بنجاح.' });
    });
});
// DELETE /api/machines/:id لحذف آلية
app.delete('/api/machines/:id', (req, res) => {
    // 1. استخراج معرف الآلية من البارامترات
    const machineId = req.params.id;

    // 2. جملة SQL للحذف
    const sql = `DELETE FROM machines WHERE machine_id = ?`;

    // 3. تنفيذ الحذف باستخدام db.query
    db.query(sql, [machineId], (err, result) => {
        if (err) {
            console.error('Database error during machine deletion:', err);
            // قد يكون خطأ مفتاح خارجي إذا لم يكن ON DELETE CASCADE فعالاً أو لسبب آخر
            return res.status(500).json({ success: false, message: 'فشل في حذف الآلية من قاعدة البيانات.' });
        }

        // 4. التحقق من عدد الصفوف التي تأثرت
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'الآلية غير موجودة.' });
        }

        // 5. إرجاع رسالة نجاح
        // affectedRows سيكون 1 (للآلية نفسها)، والـ CASCADE يتكفل بالبقية.
        res.json({ success: true, message: 'تم حذف الآلية بنجاح.' });
    });
});
// GET /api/warehouses - جلب المستودعات مع دعم التصفية والبحث
app.get('/api/warehouses', (req, res) => {
    // 1. استخراج معلمات الاستعلام (Query Parameters)
    const { search, status } = req.query;
   
    // 2. بناء استعلام SQL أساسي
    let query = `
        SELECT 
            id, code, name, location, status, 
            DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
        FROM warehouses 
        WHERE 1=1
    `;
    const params = [];

    // 3. تطبيق شروط التصفية ديناميكياً
    
    // البحث بالاسم أو الرمز أو الموقع
    if (search) {
        query += ` AND (name LIKE ? OR code LIKE ? OR location LIKE ?)`;
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
    }

    // التصفية بالحالة
    if (status) {
        query += ` AND status = ?`;
        params.push(status);
    }

    // الترتيب الافتراضي
    query += ` ORDER BY name ASC;`;

    // 4. تنفيذ الاستعلام 
    db.query(query, params, (err, results) => {
        if (err) {
            console.error('Error fetching warehouses:', err);
            // إرجاع رسالة خطأ قياسية
            return res.status(500).json({ 
                success: false, 
                message: 'فشل جلب قائمة المستودعات من قاعدة البيانات.' 
            });
        }
      
        // 5. إرسال البيانات
        res.status(200).json({ 
            success: true, 
            warehouses: results // إرجاع مصفوفة المستودعات
        });
    });
});
// POST /api/warehouses - إضافة مستودع جديد
app.post('/api/warehouses', (req, res) => {
    // 1. استخراج البيانات من جسم الطلب (req.body)
    const { code, name, location, status } = req.body;

    // 2. التحقق الأساسي من صحة البيانات
    if (!code || !name) {
        return res.status(400).json({ 
            success: false, 
            message: 'الرجاء توفير رمز واسم المستودع.' 
        });
    }

    // 3. التحقق من تكرار رمز المستودع (UNIQUE constraint)
    const checkCodeQuery = 'SELECT id FROM warehouses WHERE code = ?';
    db.query(checkCodeQuery, [code], (err, results) => {
        if (err) {
            console.error('Database error during warehouse code check:', err);
            return res.status(500).json({ success: false, message: 'خطأ في قاعدة البيانات أثناء التحقق من رمز المستودع.' });
        }

        if (results.length > 0) {
            return res.status(409).json({ success: false, message: 'رمز المستودع (Code) مُستخدم بالفعل. الرجاء اختيار رمز آخر.' });
        }
                
        // 4. بناء استعلام الإدراج (INSERT)
        const insertQuery = `
            INSERT INTO warehouses 
            (code, name, location, status) 
            VALUES (?, ?, ?, ?);
        `;
        
        // 5. تنفيذ استعلام الإدراج
        db.query(insertQuery, [ code, name, location || null, status || 'نشط' ], (err, result) => {
            if (err) {
                console.error('Database error on warehouse insertion:', err);
                
                // في حالة فشل الإدراج لسبب آخر
                return res.status(500).json({ success: false, message: 'فشل حفظ المستودع في قاعدة البيانات.' });
            }

            // 6. إرسال استجابة النجاح
            res.status(201).json({ 
                success: true, 
                message: 'تم إضافة المستودع بنجاح.',
                id: result.insertId, // إرجاع المعرف الجديد
                code: code
            });
        });
    });
});
// PUT /api/warehouses/:id - تعديل بيانات مستودع موجود
app.put('/api/warehouses/:id', (req, res) => {
    // 1. استخراج الـ ID من المسار
    const warehouseId = req.params.id;

    // 2. استخراج البيانات المُعدلة من جسم الطلب
    const { code, name, location, status } = req.body;

    // 3. التحقق الأساسي من الـ ID وصحة البيانات
    if (!warehouseId || !code || !name) {
        return res.status(400).json({ 
            success: false, 
            message: 'بيانات التحديث غير كاملة (المعرف، الرمز، والاسم مطلوبان).' 
        });
    }

    // 4. بناء استعلام التحديث (UPDATE)
    // ملاحظة: لا حاجة للتحقق من تكرار الـ code هنا لأن MySQL سيتعامل مع الـ UNIQUE constraint، 
    // ولكن يجب إضافة آلية للتعامل مع خطأ 'ER_DUP_ENTRY' لاحقًا.
    const updateQuery = `
        UPDATE warehouses 
        SET 
            code = ?, 
            name = ?, 
            location = ?, 
            status = ?
        WHERE id = ? 
    `;
    
    // 5. ترتيب القيم المتغيرة
    const values = [
        code, name, location || null, status || 'نشط',
        warehouseId // الـ ID يوضع في النهاية للاستخدام في شرط WHERE
    ];

    // 6. تنفيذ الاستعلام
    db.query(updateQuery, values, (err, result) => {
        if (err) {
            console.error('Database error on warehouse update:', err);
            
            // التعامل مع خطأ تكرار رمز المستودع
            if (err.code === 'ER_DUP_ENTRY') {
                 return res.status(409).json({ success: false, message: 'رمز المستودع (Code) مُستخدم بالفعل من قبل مستودع آخر.' });
            }

            return res.status(500).json({ 
                success: false, 
                message: 'فشل خادم داخلي أثناء تحديث المستودع.'
            });
        }

        // 7. التحقق مما إذا كان قد تم تعديل أي صف 
        if (result.affectedRows === 0) {
            // ملاحظة: قد يعني هذا أن المستودع غير موجود أو لم يتم تغيير البيانات
            return res.status(404).json({ success: false, message: 'المستودع المطلوب تعديله غير موجود.' });
        }

        // 8. إرسال استجابة النجاح
        res.status(200).json({ 
            success: true, 
            message: `تم تحديث المستودع ID ${warehouseId} بنجاح.`
        });
    });
});
// DELETE /api/warehouses/:id - حذف مستودع
app.delete('/api/warehouses/:id', (req, res) => {
    // 1. استخراج الـ ID من المسار
    const warehouseId = req.params.id;

    // 2. بناء استعلام الحذف (DELETE)
    const deleteQuery = `
        DELETE FROM warehouses 
        WHERE id = ?
    `;

    // 3. تنفيذ الاستعلام
    db.query(deleteQuery, [warehouseId], (err, result) => {
        if (err) {
            console.error('Database error on warehouse deletion:', err);
            
            // في حالة وجود خطأ غير متوقع في قاعدة البيانات
            return res.status(500).json({
                success: false,
                message: 'فشل خادم داخلي أثناء حذف المستودع.'
            });
        }

        // 4. التحقق مما إذا كان قد تم حذف أي صف
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'المستودع المطلوب حذفه غير موجود.' });
        }

        // 5. إرسال استجابة النجاح
        // ملاحظة: الـ CASCADE هو من تكفل بحذف المواقع التابعة له.
        res.status(200).json({
            success: true,
            message: `تم حذف المستودع ID ${warehouseId} وجميع المواقع التابعة له بنجاح.`
        });
    });
});
// GET /api/locations - جلب المواقع مع دعم التصفية والبحث
app.get('/api/locations', (req, res) => {
    // 1. استخراج معلمات الاستعلام (Query Parameters)
    const { search, warehouseId, status } = req.query;
   
    // 2. بناء استعلام SQL أساسي مع الربط بجدول warehouses
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

    // 3. تطبيق شروط التصفية ديناميكياً
    
    // التصفية بمعرف المستودع
    if (warehouseId) {
        query += ` AND l.warehouse_id = ?`;
        params.push(warehouseId);
    }

    // التصفية بالحالة
    if (status) {
        query += ` AND l.status = ?`;
        params.push(status);
    }
    
    // البحث برمز الموقع أو الرف أو الممر أو المستوى
    if (search) {
        query += ` AND (l.code LIKE ? OR l.rack LIKE ? OR l.aisle LIKE ? OR l.level LIKE ?)`;
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // الترتيب الافتراضي
    query += ` ORDER BY l.code ASC;`;

    // 4. تنفيذ الاستعلام 
    db.query(query, params, (err, results) => {
        if (err) {
            console.error('Error fetching locations:', err);
            return res.status(500).json({ 
                success: false, 
                message: 'فشل جلب قائمة المواقع من قاعدة البيانات.' 
            });
        }
      
        // 5. إرسال البيانات
        res.status(200).json({ 
            success: true, 
            locations: results // إرجاع مصفوفة المواقع
        });
    });
});
// POST /api/locations - إضافة موقع جديد
app.post('/api/locations', (req, res) => {
    // 1. استخراج البيانات من جسم الطلب
    const { code, warehouseId, rack, aisle, level, capacity, status } = req.body;

    // 2. التحقق الأساسي من صحة البيانات
    if (!code || !warehouseId) {
        return res.status(400).json({ 
            success: false, 
            message: 'الرجاء توفير رمز الموقع ومعرف المستودع التابع.' 
        });
    }

    // 3. التحقق من تكرار رمز الموقع (UNIQUE KEY: warehouse_id, code)
    const checkQuery = 'SELECT id FROM locations WHERE warehouse_id = ? AND code = ?';
    db.query(checkQuery, [warehouseId, code], (err, results) => {
        if (err) {
            console.error('Database error during location code check:', err);
            return res.status(500).json({ success: false, message: 'خطأ في قاعدة البيانات أثناء التحقق من رمز الموقع.' });
        }

        if (results.length > 0) {
            return res.status(409).json({ success: false, message: `رمز الموقع "${code}" مُستخدم بالفعل في المستودع المحدد.` });
        }
                
        // 4. بناء استعلام الإدراج (INSERT)
        const insertQuery = `
            INSERT INTO locations 
            (code, warehouse_id, rack, aisle, level, capacity, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?);
        `;
        
        // 5. ترتيب القيم المتغيرة
        const values = [ 
            code, 
            warehouseId, 
            rack || null, 
            aisle || null, 
            level || null, 
            capacity || null, 
            status || 'حر' 
        ];

        // 6. تنفيذ استعلام الإدراج
        db.query(insertQuery, values, (err, result) => {
            if (err) {
                console.error('Database error on location insertion:', err);
                
                // التعامل مع خطأ المفتاح الخارجي (إذا كان warehouseId غير موجود)
                if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') {
                    return res.status(400).json({ success: false, message: 'المستودع التابع غير موجود.' });
                }

                return res.status(500).json({ success: false, message: 'فشل حفظ الموقع في قاعدة البيانات.' });
            }

            // 7. إرسال استجابة النجاح
            res.status(201).json({ 
                success: true, 
                message: 'تم إضافة الموقع بنجاح.',
                id: result.insertId
            });
        });
    });
});
// PUT /api/locations/:id - تعديل بيانات موقع موجود
app.put('/api/locations/:id', (req, res) => {
    // 1. استخراج الـ ID من المسار
    const locationId = req.params.id;

    // 2. استخراج البيانات المُعدلة من جسم الطلب
    const { code, warehouseId, rack, aisle, level, capacity, status } = req.body;

    // 3. التحقق الأساسي من الـ ID وصحة البيانات
    if (!locationId || !code || !warehouseId) {
        return res.status(400).json({ 
            success: false, 
            message: 'بيانات التحديث غير كاملة (المعرف، الرمز، ومعرف المستودع مطلوبان).' 
        });
    }

    // 4. بناء استعلام التحديث (UPDATE)
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
    
    // 5. ترتيب القيم المتغيرة
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

    // 6. تنفيذ الاستعلام
    db.query(updateQuery, values, (err, result) => {
        if (err) {
            console.error('Database error on location update:', err);
            
            // التعامل مع خطأ تكرار رمز الموقع ضمن نفس المستودع
            if (err.code === 'ER_DUP_ENTRY') {
                 return res.status(409).json({ success: false, message: `رمز الموقع "${code}" مُستخدم بالفعل في المستودع المحدد.` });
            }
            // التعامل مع خطأ المفتاح الخارجي (إذا كان warehouseId غير موجود)
            if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') {
                return res.status(400).json({ success: false, message: 'المستودع التابع غير موجود.' });
            }

            return res.status(500).json({ 
                success: false, 
                message: 'فشل خادم داخلي أثناء تحديث الموقع.'
            });
        }

        // 7. التحقق مما إذا كان قد تم تعديل أي صف 
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'الموقع المطلوب تعديله غير موجود.' });
        }

        // 8. إرسال استجابة النجاح
        res.status(200).json({ 
            success: true, 
            message: `تم تحديث الموقع ID ${locationId} بنجاح.`
        });
    });
});
// DELETE /api/locations/:id - حذف موقع
app.delete('/api/locations/:id', (req, res) => {
    // 1. استخراج الـ ID من المسار
    const locationId = req.params.id;

    // 2. بناء استعلام الحذف (DELETE)
    const deleteQuery = `
        DELETE FROM locations 
        WHERE id = ?
    `;

    // 3. تنفيذ الاستعلام
    db.query(deleteQuery, [locationId], (err, result) => {
        if (err) {
            console.error('Database error on location deletion:', err);
            
            // في حالة وجود خطأ غير متوقع في قاعدة البيانات
            // ملاحظة: من المفترض ألا يكون هناك خطأ مفتاح خارجي هنا ما لم يتم ربط الموقع بجدول ثالث.
            return res.status(500).json({
                success: false,
                message: 'فشل خادم داخلي أثناء حذف الموقع.'
            });
        }

        // 4. التحقق مما إذا كان قد تم حذف أي صف
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'الموقع المطلوب حذفه غير موجود.' });
        }

        // 5. إرسال استجابة النجاح
        res.status(200).json({
            success: true,
            message: `تم حذف الموقع ID ${locationId} بنجاح.`
        });
    });
});

// يُضاف هذا الكود إلى ملف app.js

// GET /api/suppliers/:id/history - جلب تاريخ المورد وتفاصيل التعاملات
app.get('/api/suppliers/:id/history', (req, res) => {
    // نستخدم supplier_id حسب بنية الجدول
    const supplierId = req.params.id;

    // 1. التحقق من وجود المعرف
    if (!supplierId) {
        return res.status(400).json({ success: false, message: 'لم يتم تحديد معرف المورد.' });
    }

    // 2. الاستعلام الأول: جلب معلومات المورد والإحصائيات الملخصة
    // نستخدم الحقول transactions و total_value الموجودة بالفعل في جدول suppliers (في حال تم تحديثها من قبل النظام)
    // أو نستخدم JOIN لحسابها مباشرةً. سنستخدم JOIN للحساب في الوقت الفعلي وضمان الدقة.
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
        
        // 3. الاستعلام الثاني: جلب تفاصيل التعاملات
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

            // 4. تجميع البيانات وإرسالها
            const lastPurchaseDate = summary.last_purchase ? new Date(summary.last_purchase).toISOString().substring(0, 10) : '-';
            
            // حساب متوسط قيمة التعامل
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
// يُضاف هذا الكود إلى ملف app.js في قسم مسارات API

// POST /api/purchases - تسجيل عملية شراء جديدة
app.post('/api/purchases', (req, res) => {
    // 1. استخراج البيانات من جسم الطلب
    const { 
        supplier_id, 
        transaction_date, 
        product_name, 
        quantity, 
        unit_price, 
        notes 
    } = req.body;

    // 2. التحقق من البيانات الأساسية
    if (!supplier_id || !transaction_date || !product_name || !quantity || !unit_price) {
        return res.status(400).json({ success: false, message: 'الرجاء تزويد جميع الحقول المطلوبة (المورد، التاريخ، المنتج، الكمية، السعر).' });
    }

    // 3. حساب قيمة التعامل
    const purchaseValue = parseFloat(quantity) * parseFloat(unit_price);

    // 4. جملة SQL للإدراج في جدول purchases
    const insertPurchaseSql = `
        INSERT INTO purchases 
        (supplier_id, transaction_date, product_name, quantity, unit_price, notes) 
        VALUES (?, ?, ?, ?, ?, ?)
    `;
    const insertValues = [supplier_id, transaction_date, product_name, quantity, unit_price, notes];

    // 5. تنفيذ إدراج التعامل
    db.query(insertPurchaseSql, insertValues, (err, result) => {
        if (err) {
            console.error('Database error during purchase insert:', err);
            return res.status(500).json({ success: false, message: 'فشل إدراج التعامل في قاعدة البيانات.' });
        }

        // 6. جملة SQL للتحديث في جدول suppliers (تحديث الإحصائيات)
        const updateSupplierSql = `
            UPDATE suppliers 
            SET 
                transactions = transactions + 1,
                total_value = total_value + ? 
            WHERE supplier_id = ?
        `;
        const updateValues = [purchaseValue, supplier_id];

        // 7. تنفيذ تحديث المورد
        db.query(updateSupplierSql, updateValues, (err, updateResult) => {
            if (err) {
                // ملاحظة: في بيئة إنتاج حقيقية، ستحتاج إلى "التراجع" (Rollback) عن الإدراج إذا فشل التحديث.
                console.error('Database error during supplier statistics update:', err);
                return res.status(500).json({ success: false, message: 'تم إدراج التعامل، لكن فشل تحديث إحصائيات المورد.' });
            }

            if (updateResult.affectedRows === 0) {
                 // إذا لم يتأثر أي صف، فهذا يعني أن المورد لم يعد موجوداً، وهذا خطأ كبير.
                 return res.status(404).json({ success: false, message: 'فشل تحديث الإحصائيات، ربما المورد غير موجود.' });
            }

            // 8. إرسال استجابة النجاح النهائية
            res.json({ 
                success: true, 
                message: 'تم تسجيل عملية الشراء وتحديث إحصائيات المورد بنجاح.',
                purchase_id: result.insertId 
            });
        });
    });
});
// يُضاف هذا المسار إلى ملف app.js في قسم مسارات API

// GET /api/inventory/items - جلب قائمة المخزون بالتفاصيل
app.get('/api/inventory/items', (req, res) => {
    // الاستعلام يستخدم LEFT JOIN لضمان جلب المادة حتى لو لم يكن لها موقع محدد
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
        
        // تعديل البيانات قبل إرسالها لتتوافق مع الواجهة الأمامية (images عبارة عن مصفوفة)
        const items = results.map(item => ({
            ...item,
            // Images مخزنة كـ JSON string في قاعدة البيانات، يجب تحويلها إلى مصفوفة
            images: item.images ? JSON.parse(item.images) : []
        }));

        res.json({ success: true, items });
    });
});
// يُضاف هذا المسار إلى ملف app.js

// POST /api/inventory/receive - تسجيل استلام/إضافة كمية مادة موجودة
app.post('/api/inventory/receive', (req, res) => {
    // يتوقع item_id، الكمية qty، و reference (مرجع الفاتورة/السند)
    const { item_id, qty, reference, user, attachment_paths } = req.body;

    // التحقق الأساسي
    if (!item_id || !qty || parseFloat(qty) <= 0) {
        return res.status(400).json({ success: false, message: 'الرجاء تزويد معرف المادة item_id والكمية qty الموجبة.' });
    }

    const quantity = parseFloat(qty);
    const itemID = parseInt(item_id);

    // بدء المعاملة لضمان تنفيذ التحديث والتسجيل معاً
    db.beginTransaction(err => {
        if (err) {
            console.error('Transaction start error:', err);
            return res.status(500).json({ success: false, message: 'فشل بدء عملية قاعدة البيانات.' });
        }

        // 1. تحديث كمية المخزون (inventory_items)
        const updateItemSql = `
            UPDATE inventory_items
            SET current_qty = current_qty + ?
            WHERE item_id = ?;
        `;
        
        db.query(updateItemSql, [quantity, itemID], (err, result) => {
            if (err) {
                // إذا فشل تحديث المخزون، نلغي العملية بالكامل
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
            
            // 2. تسجيل الحركة في transaction_log
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
                    // إذا فشل التسجيل، نلغي عملية تحديث المخزون
                    return db.rollback(() => {
                        console.error('Error inserting transaction log:', err);
                        res.status(500).json({ success: false, message: 'فشل في تسجيل الحركة في السجل.' });
                    });
                }

                // 3. تأكيد المعاملة (النجاح النهائي)
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
// يُضاف هذا المسار إلى ملف app.js

// POST /api/inventory/issue - تسجيل صرف مادة من المخزون
app.post('/api/inventory/issue', (req, res) => {
    // يتوقع item_id، الكمية qty (يجب أن تكون موجبة)، و reference (مرجع الطلب/السند)
    const { item_id, qty, reference, user, attachment_paths } = req.body;

    // التحقق الأساسي: يجب أن تكون الكمية موجبة
    if (!item_id || !qty || parseFloat(qty) <= 0) {
        return res.status(400).json({ success: false, message: 'الرجاء تزويد معرف المادة item_id والكمية qty الموجبة المراد صرفها.' });
    }

    const quantity = parseFloat(qty);
    const itemID = parseInt(item_id);
    const negativeQuantity = -quantity; // الكمية المستخدمة في سجل الحركات يجب أن تكون سالبة للصرف

    // 1. بدء المعاملة لضمان تنفيذ التحديث والتسجيل معاً
    db.beginTransaction(err => {
        if (err) {
            console.error('Transaction start error:', err);
            return res.status(500).json({ success: false, message: 'فشل بدء عملية قاعدة البيانات.' });
        }

        // 2. تحديث كمية المخزون (inventory_items) بإنقاص الكمية
        const updateItemSql = `
            UPDATE inventory_items
            SET current_qty = current_qty - ?
            WHERE item_id = ?;
        `;
        
        db.query(updateItemSql, [quantity, itemID], (err, result) => {
            if (err) {
                // إذا فشل تحديث المخزون، نلغي العملية بالكامل
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
            
            // 3. تسجيل الحركة في transaction_log كـ "صرف"
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
                    // إذا فشل التسجيل، نلغي عملية تحديث المخزون
                    return db.rollback(() => {
                        console.error('Error inserting transaction log for issue:', err);
                        res.status(500).json({ success: false, message: 'فشل في تسجيل الحركة في السجل.' });
                    });
                }

                // 4. تأكيد المعاملة (النجاح النهائي)
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
// يُضاف هذا المسار إلى ملف app.js

// GET /api/inventory/transactions - جلب سجل الحركات الموحد
app.get('/api/inventory/transactions', (req, res) => {
    // الاستعلام يربط transaction_log بـ inventory_items لجلب اسم المادة
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
        
        // تجهيز البيانات لتتوافق مع الواجهة الأمامية
        const transactions = results.map(t => ({
            ...t,
            // تحويل مسارات المرفقات من سلسلة نصية إلى مصفوفة (إذا كانت مخزنة كـ JSON string)
            attachments: t.attachment_paths ? JSON.parse(t.attachment_paths) : []
        }));

        res.json({ success: true, transactions });
    });
});
// يُضاف هذا المسار إلى ملف app.js

// POST /api/requests - إنشاء طلب مادة جديد
app.post('/api/requests', (req, res) => {
    // يتوقع item_id، الكمية quantity، و requested_by (اسم الطالب)
    const { item_id, quantity, requested_by, justification } = req.body;

    // التحقق الأساسي
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
// يُضاف هذا المسار إلى ملف app.js

// GET /api/requests - جلب قائمة طلبات المواد
app.get('/api/requests', (req, res) => {
    // الاستعلام يربط جدول requests بـ inventory_items لجلب اسم المادة
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
// يُضاف هذا المسار إلى ملف app.js

// POST /api/requests/approve/:id - اعتماد الطلب وتحديث المخزون
app.post('/api/requests/approve/:id', (req, res) => {
    const requestID = parseInt(req.params.id);
    const approvingUser = req.body.user || 'مشرف النظام'; // اسم المستخدم الذي اعتمد الطلب

    if (isNaN(requestID)) {
        return res.status(400).json({ success: false, message: 'معرف الطلب غير صحيح.' });
    }

    // 1. بدء المعاملة لضمان تنفيذ جميع الخطوات معاً
    db.beginTransaction(err => {
        if (err) {
            console.error('Transaction start error:', err);
            return res.status(500).json({ success: false, message: 'فشل بدء عملية قاعدة البيانات.' });
        }

        // 2. جلب تفاصيل الطلب والمخزون الحالي للمادة
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

            // التحقق من المخزون الكافي
            if (availableQty < requestedQty) {
                // في الواجهة الأمامية، يتم عرض تحذير في حال النقص. هنا نعتمد صرف الكمية المتاحة (صفر إذا كانت سالبة)
                issuedQty = Math.max(0, availableQty); 

                if (issuedQty === 0) {
                     return db.rollback(() => {
                        res.status(400).json({ success: false, message: 'المخزون المتوفر صفر ولا يمكن صرف المادة.' });
                    });
                }
            }

            const negativeIssuedQty = -issuedQty; // الكمية سالبة لـ transaction_log

            // 3. تحديث كمية المخزون (inventory_items) بإنقاص الكمية المصروفة
            const updateItemSql = `
                UPDATE inventory_items
                SET current_qty = current_qty + ?
                WHERE item_id = ?;
            `;
            // نستخدم negativeIssuedQty هنا لتقوم بعملية طرح
            db.query(updateItemSql, [negativeIssuedQty, itemID], (err, result) => {
                if (err || result.affectedRows === 0) {
                    return db.rollback(() => {
                        console.error('Error updating inventory quantity for issue:', err);
                        res.status(500).json({ success: false, message: 'فشل في تحديث كمية المخزون بعد الصرف.' });
                    });
                }

                // 4. تسجيل الحركة في transaction_log كـ "صرف"
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

                    // 5. تحديث حالة الطلب إلى "تم الصرف"
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

                        // 6. تأكيد المعاملة (النجاح النهائي)
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
// يُضاف هذا المسار إلى ملف app.js

// POST /api/suppliers/edit/:id - تعديل بيانات مورد موجود
app.post('/api/suppliers/edit/:id', (req, res) => {
    // 1. استخراج معرف المورد من البارامترات
    const supplierId = req.params.id;

    // 2. استخراج البيانات القابلة للتعديل من جسم الطلب (req.body)
    const { 
        name, 
        primary_phone, // يتوافق مع 'phone' في الواجهة الأمامية
        contact_person, // يتوافق مع 'contact' في الواجهة الأمامية
        address 
        // يمكن إضافة المزيد من الحقول هنا مثل: email, specialization, إلخ.
    } = req.body;

    // 3. جملة SQL لتحديث البيانات
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
    
    // 4. القيم التي سيتم تمريرها للاستعلام
    const values = [
        name,
        primary_phone,
        contact_person,
        address,
        supplierId
    ];

    // 5. تنفيذ استعلام التحديث
    db.query(sql, values, (err, result) => {
        if (err) {
            console.error('Database error during supplier update:', err);
            return res.status(500).json({ success: false, message: 'فشل في تحديث بيانات المورد.' });
        }

        // 6. التحقق من عدد الصفوف التي تأثرت
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'المورد غير موجود أو لم تتغير البيانات.' });
        }

        res.json({ success: true, message: 'تم تحديث بيانات المورد بنجاح.' });
    });
});
// يُضاف هذا المسار إلى ملف app.js

// POST /api/inventory/new - إضافة مادة جديدة بالكامل إلى المخزون
app.post('/api/inventory/new', (req, res) => {
    // يتوقع: code, name, qty (الكمية الأولية), min (الحد الأدنى), unit, images (JSON string), user (المشرف)
    const { 
        code, 
        name, 
        qty, 
        min, 
        unit, 
        images, // يفترض أن الصور يتم إرسالها كسلسلة نصية (JSON string) لمساراتها أو DataURLs
        user 
    } = req.body;

    // التحقق الأساسي
    if (!name || !code || !unit) {
        return res.status(400).json({ success: false, message: 'الرجاء تزويد كود واسم ووحدة المادة.' });
    }

    const initialQty = parseFloat(qty) || 0.00;
    const minStock = parseFloat(min) || 5.00;
    const itemUser = user || 'مشرف النظام';

    // 1. بدء المعاملة
    db.beginTransaction(err => {
        if (err) {
            console.error('Transaction start error:', err);
            return res.status(500).json({ success: false, message: 'فشل بدء عملية قاعدة البيانات.' });
        }

        // 2. إدراج المادة الجديدة في inventory_items
        const insertItemSql = `
            INSERT INTO inventory_items
            (item_code, item_name, unit, min_stock, current_qty, images, location_id)
            VALUES (?, ?, ?, ?, ?, ?, NULL); -- يتم تعيين location_id على NULL مبدئياً
        `;
        const itemValues = [
            code, 
            name, 
            unit, 
            minStock, 
            initialQty, 
            images || null
        ];

        db.query(insertItemSql, itemValues, (err, result) => {
            if (err) {
                // إذا كان الخطأ بسبب تكرار الكود
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

            // 3. إذا كانت هناك كمية أولية (qty > 0)، نسجل حركة "استلام"
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

                    // 4. تأكيد المعاملة (النجاح النهائي)
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
                            item_id: newItemId 
                        });
                    });
                });
            } else {
                // 4. إذا لم تكن هناك كمية أولية، نؤكد الإدراج فقط
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
                        item_id: newItemId 
                    });
                });
            }
        });
    });
});
// يُضاف هذا المسار إلى ملف app.js

// POST /api/inventory/edit/:id - لتعديل البيانات الوصفية للمادة (الاسم، الكود، الحد الأدنى، الصور)
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

    // 1. استخراج البيانات الحالية للمادة للتحقق من الصور القديمة
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
        
        // محاولة تحليل الصور القديمة
        try {
            if (currentItem.images) {
                existingImages = JSON.parse(currentItem.images);
            }
        } catch (e) {
            console.warn('Could not parse existing images JSON:', currentItem.images);
            // قد نحتاج لمعالجة الصور القديمة في الواجهة الأمامية إذا كانت معطوبة
        }
        
        // 2. دمج الصور الجديدة مع القديمة
        let finalImages = existingImages;
        if (new_images) {
            try {
                const newImagesArray = JSON.parse(new_images);
                // يتم استبدال القائمة بالجديدة في هذا السيناريو لتبسيط العملية
                // في التطبيقات الحقيقية: يتم دمج أو تحديد الصور التي تبقى
                finalImages = newImagesArray; 
            } catch (e) {
                return res.status(400).json({ success: false, message: 'صيغة JSON لمسارات الصور الجديدة غير صالحة.' });
            }
        }
        
        const finalImagesJson = finalImages.length > 0 ? JSON.stringify(finalImages) : null;

        // 3. بناء جملة التحديث
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

        // 4. تنفيذ التحديث
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
// يُضاف هذا المسار إلى ملف app.js

// GET /api/inventory/transactions/:id - جلب تفاصيل حركة واحدة
app.get('/api/inventory/transactions/:id', (req, res) => {
    const transactionId = req.params.id;

    // استعلام لجلب تفاصيل الحركة مع اسم وكود ووحدة المادة
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

        // إرجاع النتيجة الأولى فقط
        res.json({ success: true, transaction: results[0] });
    });
});
app.listen(port, () => {
    console.log(`Server listening at ${port}`);

});


