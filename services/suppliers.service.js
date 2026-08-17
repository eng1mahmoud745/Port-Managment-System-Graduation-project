/**
 * مسؤولية الملف: تجميع منطق الموردين واستعلامات SQL الخاصة بهم داخل service مستقل.
 * ملاحظات: هذا الملف لا يتعامل مع req أو res مباشرة، وإنما يعيد ناتجًا موحدًا للـ controller مع الحفاظ على نفس السلوك الحالي.
 */

/**
 * الغرض: بناء كائن استجابة موحد بين service وcontroller لتمرير كود الحالة والجسم النهائي معًا.
 * المدخلات: statusCode كود HTTP المطلوب، body الجسم النهائي الذي يجب أن يخرج للواجهة كما هو.
 * المخرجات: يعيد كائنًا بالشكل `{ statusCode, body }`.
 * الآثار الجانبية: لا توجد آثار جانبية؛ الدالة تنشئ كائنًا جديدًا فقط في الذاكرة.
 * ملاحظات: يستخدمها جميع توابع الخدمة حتى تبقى طبقة controller بسيطة ولا تعيد صياغة الردود.
 */
function buildServiceResponse(statusCode, body) {
    return {
        statusCode,
        body
    };
}

function normalizeSupplierSpecialization(value) {
    return String(value || '').trim();
}

/**
 * الغرض: إنشاء service خاص بجميع عمليات الموردين المعتمدة على قاعدة البيانات.
 * المدخلات: كائن dependencies ويحتوي على db المستخدم لتنفيذ استعلامات MySQL.
 * المخرجات: يعيد كائنًا يحتوي على توابع خدمة الموردين الجاهزة للاستخدام من قبل controller.
 * الآثار الجانبية: لا توجد آثار مباشرة عند الإنشاء، لكن التوابع التي يعيدها قد تقرأ أو تعدل قاعدة البيانات.
 * ملاحظات: هذه الطبقة تحتوي منطق الأعمال وSQL في هذه المرحلة، ولم يتم إدخال repository layer بعد.
 */
function createSuppliersService({ db }) {
    function getAllowedSupplierSpecializations(callback) {
        db.query(
            `
                SELECT DISTINCT TRIM(warehouse_type) AS warehouse_type
                FROM warehouses
                WHERE warehouse_type IS NOT NULL
                  AND TRIM(warehouse_type) <> ''
                ORDER BY warehouse_type ASC
            `,
            (err, results) => {
                if (err) {
                    return callback(err);
                }

                const specializations = results
                    .map((row) => normalizeSupplierSpecialization(row.warehouse_type))
                    .filter(Boolean);

                return callback(null, specializations);
            }
        );
    }

    function validateSupplierSpecialization(specialization, callback) {
        const normalizedSpecialization = normalizeSupplierSpecialization(specialization);

        if (!normalizedSpecialization) {
            return callback(buildServiceResponse(400, {
                success: false,
                message: 'الرجاء اختيار تخصص المورد من أنواع المستودعات المتاحة.'
            }));
        }

        getAllowedSupplierSpecializations((err, allowedSpecializations) => {
            if (err) {
                console.error('Error validating supplier specialization against warehouses:', err);
                return callback(buildServiceResponse(500, {
                    success: false,
                    message: 'تعذر التحقق من تخصص المورد اعتمادًا على أنواع المستودعات الحالية.'
                }));
            }

            if (!allowedSpecializations.length) {
                return callback(buildServiceResponse(400, {
                    success: false,
                    message: 'لا توجد أنواع مستودعات معتمدة حاليًا لاستخدامها كتخصص للمورد.'
                }));
            }

            if (!allowedSpecializations.includes(normalizedSpecialization)) {
                return callback(buildServiceResponse(400, {
                    success: false,
                    message: 'يجب أن يكون تخصص المورد مطابقًا فقط لأنواع المستودعات الموجودة.'
                }));
            }

            return callback(null, normalizedSpecialization);
        });
    }

    /**
     * الغرض: جلب قائمة الموردين مع تطبيق فلاتر البحث والتصنيف والتقييم والحالة الحالية.
     * المدخلات: filters كائن يحتوي على search وcategory وmin_rating وstatus، وcallback لاستلام النتيجة.
     * المخرجات: يستدعي callback بكائن استجابة موحد يحتوي على قائمة الموردين أو رسالة الخطأ.
     * الآثار الجانبية: ينفذ استعلام SELECT على جدول suppliers ويكتب أخطاء التنفيذ إلى console.error عند الفشل.
     * ملاحظات: يحافظ على نفس SQL الحالي ونفس شكل الاستجابة `{ success, suppliers }`.
     */
    function getSuppliers(filters, callback) {
        const { search, category, min_rating, status } = filters;

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

        if (min_rating && !isNaN(parseInt(min_rating, 10))) {
            query += ` AND rating >= ?`;
            params.push(parseInt(min_rating, 10));
        }

        if (status) {
            query += ` AND status = ?`;
            params.push(status);
        }

        query += ` ORDER BY supplier_id ASC;`;

        db.query(query, params, (err, results) => {
            if (err) {
                console.error('Error fetching suppliers:', err);
                return callback(buildServiceResponse(500, {
                    success: false,
                    message: 'فشل جلب قائمة الموردين من قاعدة البيانات.'
                }));
            }

            return callback(buildServiceResponse(200, {
                success: true,
                suppliers: results
            }));
        });
    }

    /**
     * الغرض: إنشاء مورد جديد بعد التحقق من الحقول الأساسية والتقييم قبل الإدراج في قاعدة البيانات.
     * المدخلات: supplierData كائن بيانات المورد القادم من الطلب، وcallback لاستلام نتيجة العملية.
     * المخرجات: يستدعي callback باستجابة نجاح تحتوي على supplierId أو استجابة خطأ مناسبة.
     * الآثار الجانبية: ينفذ INSERT على جدول suppliers، وقد يكتب أخطاء قاعدة البيانات إلى console.error.
     * ملاحظات: يحافظ على نفس شروط التحقق الحالية ونفس رسائل الأخطاء وحقول الاستجابة المستخدمة في الواجهة.
     */
    function createSupplier(supplierData, callback) {
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
        } = supplierData;

        if (!name || !primary_phone || !contact_person || rating === undefined || rating < 1 || rating > 5) {
            return callback(buildServiceResponse(400, {
                success: false,
                message: 'الرجاء تزويدنا بالاسم، الشخص المسؤول، الهاتف الرئيسي، والتقييم (1-5).'
            }));
        }

        validateSupplierSpecialization(specialization, (validationError, normalizedSpecialization) => {
            if (validationError) {
                return callback(validationError);
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
                name, normalizedSpecialization, category, rating, contact_person,
                primary_phone, secondary_phone, email, address, commercial_reg,
                tax_number, payment_terms, currency
            ];

            db.query(insertSupplierQuery, values, (err, result) => {
                if (err) {
                    console.error('Database error on supplier insertion:', err);

                    if (err.code === 'ER_DUP_ENTRY') {
                        return callback(buildServiceResponse(409, {
                            success: false,
                            message: 'هذا المورد موجود بالفعل في قاعدة البيانات.'
                        }));
                    }

                    return callback(buildServiceResponse(500, {
                        success: false,
                        message: 'فشل حفظ المورد في قاعدة البيانات.',
                        error: err.sqlMessage
                    }));
                }

                return callback(buildServiceResponse(201, {
                    success: true,
                    message: 'تم إضافة المورد بنجاح.',
                    supplierId: result.insertId
                }));
            });
        });
    }

    /**
     * الغرض: جلب ملخص تاريخ المورد وتفاصيل تعاملاته الشرائية بالاعتماد على معرف المورد.
     * المدخلات: supplierId معرف المورد المطلوب، وcallback لاستلام الملخص والتعاملات أو الخطأ.
     * المخرجات: يستدعي callback باستجابة تحتوي على `history` أو رسالة خطأ مناسبة.
     * الآثار الجانبية: ينفذ استعلامين SELECT على suppliers وpurchases، ويكتب الأخطاء إلى console.error عند الفشل.
     * ملاحظات: يحافظ على نفس شكل history الحالي بما في ذلك `avg_transaction_value` و`last_purchase`.
     */
    function getSupplierHistory(supplierId, callback) {
        if (!supplierId) {
            return callback(buildServiceResponse(400, {
                success: false,
                message: 'لم يتم تحديد معرف المورد.'
            }));
        }

        const summaryQuery = `
            SELECT 
                s.name,
                COUNT(p.id) AS total_transactions,
                IFNULL(SUM(p.quantity * p.unit_price), 0) AS total_value,
                MAX(p.transaction_date) AS last_purchase
            FROM suppliers s
            LEFT JOIN purchases p ON s.supplier_id = p.supplier_id
            WHERE s.supplier_id = ?
            GROUP BY s.supplier_id, s.name;
        `;

        db.query(summaryQuery, [supplierId], (err, summaryResults) => {
            if (err) {
                console.error('Database error during supplier history summary fetch:', err);
                return callback(buildServiceResponse(500, {
                    success: false,
                    message: 'فشل جلب ملخص تاريخ المورد.'
                }));
            }

            if (summaryResults.length === 0) {
                return callback(buildServiceResponse(404, {
                    success: false,
                    message: 'المورد المطلوب غير موجود.'
                }));
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

            db.query(transactionsQuery, [supplierId], (transactionsErr, transactionsResults) => {
                if (transactionsErr) {
                    console.error('Database error during supplier transactions fetch:', transactionsErr);
                    return callback(buildServiceResponse(500, {
                        success: false,
                        message: 'فشل جلب تفاصيل التعاملات.'
                    }));
                }

                const lastPurchaseDate = summary.last_purchase ? new Date(summary.last_purchase).toISOString().substring(0, 10) : '-';
                const avgTransaction = summary.total_transactions > 0
                    ? (summary.total_value / summary.total_transactions)
                    : 0;

                return callback(buildServiceResponse(200, {
                    success: true,
                    history: {
                        name: summary.name,
                        total_transactions: parseInt(summary.total_transactions, 10),
                        total_value: parseFloat(summary.total_value),
                        last_purchase: lastPurchaseDate,
                        avg_transaction_value: parseFloat(avgTransaction),
                        transactions: transactionsResults
                    }
                }));
            });
        });
    }

    /**
     * الغرض: تحديث جزء من بيانات المورد عبر الـ endpoint القديم المستخدم في بعض الواجهات القديمة.
     * المدخلات: supplierId معرف المورد، updateData كائن الحقول الجزئية مثل name وprimary_phone وcontact_person وaddress، وcallback للنتيجة.
     * المخرجات: يستدعي callback باستجابة نجاح أو فشل بحسب نتيجة التحديث.
     * الآثار الجانبية: ينفذ UPDATE على جدول suppliers، ويحدث `updated_at`، ويكتب الأخطاء إلى console.error عند الفشل.
     * ملاحظات: يبقي SQL والمسار القديم كما هما للحفاظ على التوافق مع أي شاشة ما زالت تعتمد عليه.
     */
    function editSupplierLegacy(supplierId, updateData, callback) {
        const {
            name,
            primary_phone,
            contact_person,
            address
        } = updateData;

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

        const values = [name, primary_phone, contact_person, address, supplierId];

        db.query(sql, values, (err, result) => {
            if (err) {
                console.error('Database error during supplier update:', err);
                return callback(buildServiceResponse(500, {
                    success: false,
                    message: 'فشل في تحديث بيانات المورد.'
                }));
            }

            if (result.affectedRows === 0) {
                return callback(buildServiceResponse(404, {
                    success: false,
                    message: 'المورد غير موجود أو لم تتغير البيانات.'
                }));
            }

            return callback(buildServiceResponse(200, {
                success: true,
                message: 'تم تحديث بيانات المورد بنجاح.'
            }));
        });
    }

    /**
     * الغرض: تحديث بيانات المورد الكاملة باستخدام نفس التحقق والقواعد الحالية قبل تنفيذ التعديل.
     * المدخلات: supplierId معرف المورد، supplierData كائن البيانات الجديدة، وcallback لاستلام النتيجة.
     * المخرجات: يستدعي callback باستجابة نجاح أو خطأ حسب نتيجة التحديث.
     * الآثار الجانبية: ينفذ UPDATE على جدول suppliers، وقد يكتب أخطاء قاعدة البيانات إلى console.error.
     * ملاحظات: يحافظ على نفس شروط التحقق الحالية للتقييم والاسم ونفس رسائل الخطأ ونجاح التحديث.
     */
    function updateSupplier(supplierId, supplierData, callback) {
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
        } = supplierData;

        if (!supplierId || !name || rating === undefined || rating < 1 || rating > 5) {
            return callback(buildServiceResponse(400, {
                success: false,
                message: 'بيانات التحديث غير كاملة أو غير صالحة (الاسم والتقييم مطلوبان).'
            }));
        }

        validateSupplierSpecialization(specialization, (validationError, normalizedSpecialization) => {
            if (validationError) {
                return callback(validationError);
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
                name, normalizedSpecialization, category, rating, contact_person,
                primary_phone, secondary_phone, email, address, commercial_reg,
                tax_number, payment_terms, currency,
                supplierId
            ];

            db.query(updateSupplierQuery, values, (err, result) => {
                if (err) {
                    console.error('Database error on supplier update:', err);
                    return callback(buildServiceResponse(500, {
                        success: false,
                        message: 'فشل خادم داخلي أثناء تحديث المورد.',
                        error: err.sqlMessage
                    }));
                }

                if (result.affectedRows === 0) {
                    return callback(buildServiceResponse(404, {
                        success: false,
                        message: 'المورد المطلوب تعديله غير موجود.'
                    }));
                }

                return callback(buildServiceResponse(200, {
                    success: true,
                    message: `تم تحديث المورد ID ${supplierId} بنجاح.`
                }));
            });
        });
    }

    /**
     * الغرض: جلب بيانات مورد واحد بالاعتماد على معرفه وإرجاعها بنفس الصيغة التي تتوقعها الواجهة.
     * المدخلات: supplierId معرف المورد المطلوب، وcallback لاستلام بيانات المورد أو الخطأ.
     * المخرجات: يستدعي callback بكائن المورد مباشرة أو برسالة خطأ مناسبة.
     * الآثار الجانبية: ينفذ SELECT على جدول suppliers، ويكتب الأخطاء إلى console.error عند فشل الاستعلام.
     * ملاحظات: يعيد body ككائن المورد مباشرة من دون تغليف إضافي للحفاظ على التوافق مع الفرونت الحالي.
     */
    function getSupplierById(supplierId, callback) {
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
                return callback(buildServiceResponse(500, {
                    success: false,
                    message: 'فشل خادم داخلي أثناء جلب بيانات المورد.'
                }));
            }

            if (results.length === 0) {
                return callback(buildServiceResponse(404, {
                    success: false,
                    message: 'المورد غير موجود.'
                }));
            }

            return callback(buildServiceResponse(200, results[0]));
        });
    }

    /**
     * الغرض: حذف مورد من قاعدة البيانات مع التعامل مع حالة السجلات المرتبطة به كما هو معمول حاليًا.
     * المدخلات: supplierId معرف المورد المطلوب حذفه، وcallback لاستلام نتيجة الحذف.
     * المخرجات: يستدعي callback باستجابة نجاح أو برسالة خطأ مناسبة إذا فشل الحذف.
     * الآثار الجانبية: ينفذ DELETE على جدول suppliers، وقد يمنع الحذف عند وجود سجلات مرتبطة ويكتب الأخطاء إلى console.error.
     * ملاحظات: يحافظ على الرسالة الخاصة بحالة ER_ROW_IS_REFERENCED_2 لأنها مستخدمة فعليًا في الواجهة.
     */
    function deleteSupplier(supplierId, callback) {
        const deleteSupplierQuery = `
            DELETE FROM suppliers 
            WHERE supplier_id = ?
        `;

        db.query(deleteSupplierQuery, [supplierId], (err, result) => {
            if (err) {
                console.error('Database error on supplier deletion:', err);

                if (err.code === 'ER_ROW_IS_REFERENCED_2') {
                    return callback(buildServiceResponse(409, {
                        success: false,
                        message: 'لا يمكن حذف المورد لوجود سجلات مرتبطة به (مثل طلبيات أو منتجات). يفضل تعطيل المورد بدلاً من حذفه.'
                    }));
                }

                return callback(buildServiceResponse(500, {
                    success: false,
                    message: 'فشل خادم داخلي أثناء حذف المورد.'
                }));
            }

            if (result.affectedRows === 0) {
                return callback(buildServiceResponse(404, {
                    success: false,
                    message: 'المورد المطلوب حذفه غير موجود.'
                }));
            }

            return callback(buildServiceResponse(200, {
                success: true,
                message: `تم حذف المورد ID ${supplierId} بنجاح.`
            }));
        });
    }

    return {
        getSuppliers,
        createSupplier,
        getSupplierHistory,
        editSupplierLegacy,
        updateSupplier,
        getSupplierById,
        deleteSupplier
    };
}

module.exports = {
    createSuppliersService
};
