/**
 * مسؤولية الملف: تجميع مسارات الآليات المطلوبة في هذه المرحلة داخل Router مستقل من دون تغيير منطق العمل الحالي.
 * ملاحظات: يعتمد هذا الملف على الاعتماديات الممررة من app.js مثل db وgetUsersIdColumn وtableHasColumn وresolveEntityCode فقط.
 */

const express = require('express');

/**
 * الغرض: إنشاء Router خاص بمسارات الآليات المطلوبة وربطها بالاعتماديات اللازمة لتنفيذ نفس السلوك الحالي.
 * المدخلات: كائن dependencies ويحتوي على db وgetUsersIdColumn وtableHasColumn وresolveEntityCode.
 * المخرجات: يعيد كائن Express Router جاهزًا للربط داخل app.js على المسار `/api`.
 * الآثار الجانبية: ينشئ handlers تنفذ استعلامات قراءة وتعديل وحذف وإضافة على جداول Machines وUsers وSuppliers.
 * ملاحظات: يحافظ على نفس endpoint paths الحالية ونفس شكل الاستجابات وSQL.
 */
function createMachinesRoutes({
    db,
    getUsersIdColumn,
    tableHasColumn,
    resolveEntityCode
}) {
    const router = express.Router();

    /**
     * الغرض: جلب قائمة الآليات مع البحث والتصفية وربط السائق والمورد وفق بنية الجداول الحالية.
     * المدخلات: req.query لاستخراج search وcategory وstatus وsort، وres لإرجاع القائمة أو الخطأ.
     * المخرجات: يرسل نفس الاستجابة الحالية وهي مصفوفة الآليات مباشرة أو رسالة خطأ JSON.
     * الآثار الجانبية: ينفذ استعلامات قراءة على Users وMachines وSuppliers ويكتب الأخطاء إلى console.error عند الفشل.
     * ملاحظات: يعتمد على getUsersIdColumn وtableHasColumn لتحديد إمكانية استخدام عمود driver_user_id من دون كسر البيئات القديمة.
     */
    function getMachinesHandler(req, res) {
        const { search, category, status, sort } = req.query;

        getUsersIdColumn((columnErr, userIdColumn) => {
            if (columnErr) {
                return res.status(500).json({
                    success: false,
                    message: 'تعذر قراءة بنية جدول المستخدمين.'
                });
            }

            tableHasColumn('Machines', 'driver_user_id', (driverColumnErr, hasDriverUserIdColumn) => {
                if (driverColumnErr) {
                    return res.status(500).json({
                        success: false,
                        message: 'تعذر قراءة بنية جدول الآليات.'
                    });
                }

                const driverIdSelect = hasDriverUserIdColumn ? 'm.driver_user_id' : 'NULL AS driver_user_id';
                const driverNameSelect = hasDriverUserIdColumn ? 'u.full_name AS driver_name' : 'NULL AS driver_name';
                const driverJoin = hasDriverUserIdColumn
                    ? `LEFT JOIN Users u ON m.driver_user_id = u.${userIdColumn}`
                    : '';

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
                        ${driverIdSelect},
                        s.name AS supplier_name,
                        ${driverNameSelect}
                    FROM Machines m
                    LEFT JOIN Suppliers s ON m.supplier_id = s.supplier_id
                    ${driverJoin}
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

                    return res.status(200).json(results);
                });
            });
        });
    }

    /**
     * الغرض: إنشاء آلية جديدة بعد التحقق من الحقول الأساسية وتوليد كود الآلية عند الحاجة.
     * المدخلات: req.body ويحتوي على حقول الآلية مثل machine_code وmachine_name وstatus وغيرها، وres لإرجاع النتيجة.
     * المخرجات: يرسل JSON بنتيجة الإضافة مع machine_id وmachine_code أو رسالة خطأ مناسبة.
     * الآثار الجانبية: ينفذ INSERT على جدول Machines، وقد يولد كودًا جديدًا ويكتب الأخطاء إلى console.error عند الفشل.
     * ملاحظات: يعتمد على resolveEntityCode ويحافظ على نفس معالجة ER_DUP_ENTRY الحالية بما فيها تعارض السائق أو كود الآلية.
     */
    function createMachineHandler(req, res) {
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
                supplier_id || null,
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

                return res.status(201).json({
                    success: true,
                    message: 'تم إضافة الآلية بنجاح.',
                    machine_id: result.insertId,
                    machine_code: resolvedMachineCode
                });
            });
        });
    }

    /**
     * الغرض: تحديث بيانات آلية موجودة اعتمادًا على معرفها والحقول المرسلة من الواجهة.
     * المدخلات: req.params.id لتحديد الآلية، وreq.body لحقول التحديث، وres لإرجاع النتيجة.
     * المخرجات: يرسل JSON بنتيجة التحديث أو سبب الفشل مع الحفاظ على نفس الرسائل الحالية.
     * الآثار الجانبية: ينفذ UPDATE على جدول machines ويكتب الأخطاء إلى console.error عند الفشل.
     * ملاحظات: يحافظ على نفس شرط التحقق من الحقول الأساسية ونفس التعامل مع تعارض uniq_driver_user_id.
     */
    function updateMachineHandler(req, res) {
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
            operating_hours, supplier_id || null,
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

            return res.json({ success: true, message: 'تم تحديث بيانات الآلية بنجاح.' });
        });
    }

    function getMachineMaintenanceHistoryHandler(req, res) {
        const machineId = Number.parseInt(req.params.id, 10);
        if (!Number.isInteger(machineId) || machineId <= 0) {
            return res.status(400).json({ success: false, message: 'معرف الآلية غير صالح.' });
        }

        const sql = `
            SELECT
                r.request_id AS id,
                r.item_id,
                r.machine_id,
                r.quantity AS requested_qty,
                COALESCE(r.issued_quantity, r.quantity) AS issued_qty,
                r.requested_by,
                r.requested_for_date,
                r.justification,
                r.mechanic_decision_by,
                r.fulfilled_by,
                r.fulfilled_at,
                r.created_at,
                COALESCE(i.item_name, CONCAT('مادة #', r.item_id)) AS item_name,
                i.item_code
            FROM requests r
            LEFT JOIN inventory_items i ON r.item_id = i.item_id
            WHERE r.machine_id = ?
              AND r.status = 'تم الصرف'
              AND COALESCE(r.source_role, 'internal') = 'driver'
            ORDER BY COALESCE(r.fulfilled_at, r.created_at) DESC, r.request_id DESC
        `;

        db.query(sql, [machineId], (err, results) => {
            if (err) {
                console.error('Database error fetching machine maintenance history:', err);
                return res.status(500).json({
                    success: false,
                    message: 'تعذر تحميل سجل الصيانة لهذه الآلية.'
                });
            }

            return res.status(200).json({
                success: true,
                history: results
            });
        });
    }

    /**
     * الغرض: حذف آلية موجودة بالاعتماد على معرفها مع الإبقاء على نفس رسالة النجاح والفشل الحالية.
     * المدخلات: req.params.id لتحديد الآلية، وres لإرسال الاستجابة النهائية.
     * المخرجات: يرسل JSON يوضح نجاح الحذف أو عدم العثور على الآلية أو حدوث خطأ داخلي.
     * الآثار الجانبية: ينفذ DELETE على جدول machines وقد يزيل السجلات التابعة عبر القيود المعرفة في قاعدة البيانات.
     * ملاحظات: يبقي نفس السلوك الحالي الذي يعيد رسالة عامة عند فشل الحذف بسبب خطأ قاعدة بيانات.
     */
    function deleteMachineHandler(req, res) {
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

            return res.json({ success: true, message: 'تم حذف الآلية بنجاح.' });
        });
    }

    router.get('/machines', getMachinesHandler);
    router.get('/machines/:id/maintenance-history', getMachineMaintenanceHistoryHandler);
    router.post('/machines', createMachineHandler);
    router.put('/machines/:id', updateMachineHandler);
    router.delete('/machines/:id', deleteMachineHandler);

    return router;
}

module.exports = {
    createMachinesRoutes
};
