/**
 * مسؤولية الملف: تجميع مسارات طلبات الصيانة الخاصة بالسائق والميكانيكي المطلوبة في هذه المرحلة داخل Router مستقل.
 * ملاحظات: يعتمد هذا الملف على db وrequireRoles الممررين من app.js ويحافظ على نفس المسارات الحالية دون تغيير منطق العمل.
 */

const express = require('express');

/**
 * الغرض: إنشاء Router خاص بمسارات طلبات الصيانة وربطه بالاعتماديات اللازمة.
 * المدخلات: كائن dependencies ويحتوي على db وrequireRoles.
 * المخرجات: يعيد كائن Express Router جاهزًا للربط داخل app.js على المسار `/api`.
 * الآثار الجانبية: ينشئ handlers تنفذ إدراجات وتحديثات وقراءات على جدول requests المرتبط بطلبات الصيانة.
 * ملاحظات: يحافظ على نفس قيود الأدوار الحالية ونفس رسائل النجاح والفشل دون refactor عميق.
 */
function createMaintenanceRoutes({
    db,
    requireRoles,
    getUsersIdColumn
}) {
    const router = express.Router();

    function resolveDriverMachineByEmail(email, callback) {
        const normalizedEmail = String(email || '').trim().toLowerCase();
        if (!normalizedEmail) {
            callback(null, null);
            return;
        }

        getUsersIdColumn((columnErr, userIdColumn) => {
            if (columnErr) {
                callback(columnErr);
                return;
            }

            db.query(
                `
                    SELECT ${userIdColumn} AS user_id, full_name
                    FROM Users
                    WHERE LOWER(email) = ?
                    LIMIT 1
                `,
                [normalizedEmail],
                (userErr, userRows) => {
                    if (userErr) {
                        callback(userErr);
                        return;
                    }

                    const user = userRows[0] || null;
                    if (!user) {
                        callback(null, null);
                        return;
                    }

                    const userName = String(user.full_name || '').trim();
                    const machineParams = [user.user_id, normalizedEmail];
                    let machineQuery = `
                        SELECT machine_id, machine_name, machine_code
                        FROM Machines
                        WHERE driver_user_id = ?
                           OR LOWER(COALESCE(notes, '')) LIKE CONCAT('%', LOWER(?), '%')
                    `;

                    if (userName) {
                        machineQuery += ` OR LOWER(COALESCE(facility_name, '')) = LOWER(?) OR LOWER(COALESCE(notes, '')) LIKE CONCAT('%', LOWER(?), '%')`;
                        machineParams.push(userName, userName);
                    }

                    machineQuery += `
                        ORDER BY
                            CASE WHEN driver_user_id = ? THEN 0 ELSE 1 END,
                            machine_id ASC
                        LIMIT 1
                    `;
                    machineParams.push(user.user_id);

                    db.query(machineQuery, machineParams, (machineErr, machineRows) => {
                        if (machineErr) {
                            callback(machineErr);
                            return;
                        }

                        callback(null, machineRows[0] || null);
                    });
                }
            );
        });
    }

    /**
     * الغرض: إنشاء طلب صيانة من السائق وتحويله للحالة المبدئية الحالية الخاصة بمسار الصيانة.
     * المدخلات: req.body ويحتوي على item_id وquantity وjustification وrequestedDate، إضافة إلى req.authUser وreq.authSession لاستخراج بيانات مقدم الطلب.
     * المخرجات: يعيد JSON بنتيجة الإنشاء مع request_id عند النجاح أو رسالة خطأ مطابقة للسلوك الحالي.
     * الآثار الجانبية: ينفذ INSERT في جدول requests مع source_role = 'driver' ويكتب الأخطاء إلى console.error عند الفشل.
     * ملاحظات: يبقي الاعتماد على بيانات الجلسة الحالية كما هو دون أي تغيير في آلية التحقق.
     */
    function createDriverMaintenanceRequestHandler(req, res) {
        const { item_id, quantity, justification, requestedDate } = req.body;
        const requesterName = String(req.authUser?.full_name || req.authSession?.email || '').trim();
        const requesterEmail = String(req.authSession?.email || '').trim().toLowerCase();

        if (!item_id || !quantity || parseFloat(quantity) <= 0 || !requesterName || !requesterEmail) {
            return res.status(400).json({ success: false, message: 'بيانات طلب الصيانة غير مكتملة.' });
        }

        resolveDriverMachineByEmail(requesterEmail, (machineErr, machine) => {
            if (machineErr) {
                console.error('Database error resolving driver machine for maintenance request:', machineErr);
                return res.status(500).json({ success: false, message: 'تعذر تحديد الآلية المرتبطة بطلب الصيانة.' });
            }

            if (!machine) {
                return res.status(400).json({ success: false, message: 'لا يمكن إنشاء طلب صيانة قبل ربط مركبة بهذا السائق.' });
            }

            const sql = `
                INSERT INTO requests
                (item_id, machine_id, quantity, requested_by, requested_by_email, source_role, requested_for_date, justification, status)
                VALUES (?, ?, ?, ?, ?, 'driver', ?, ?, 'بانتظار مدير الآليات');
            `;

            db.query(
                sql,
                [
                    parseInt(item_id, 10),
                    machine?.machine_id || null,
                    parseFloat(quantity),
                    requesterName,
                    requesterEmail,
                    requestedDate || null,
                    justification || null
                ],
                (err, result) => {
                    if (err) {
                        console.error('Database error during driver maintenance request creation:', err);
                        return res.status(500).json({ success: false, message: 'تعذر إنشاء طلب الصيانة.' });
                    }

                    return res.status(201).json({
                        success: true,
                        message: 'تم إرسال طلب الصيانة إلى مدير الآليات.',
                        request_id: result.insertId
                    });
                }
            );
        });
    }

    /**
     * الغرض: جلب طلبات الصيانة الخاصة بالسائق الحالي فقط اعتمادًا على البريد الإلكتروني في الجلسة.
     * المدخلات: req.authSession لاستخراج البريد الإلكتروني الحالي، وres لإرجاع القائمة أو رسالة الخطأ.
     * المخرجات: يعيد JSON يحوي `{ success, requests }` أو رسالة خطأ مطابقة للسلوك الحالي.
     * الآثار الجانبية: ينفذ استعلام قراءة على requests وinventory_items ويكتب الأخطاء إلى console.error عند الفشل.
     * ملاحظات: يبقي التصفية على source_role = 'driver' كما هي دون تعديل.
     */
    function getDriverMaintenanceRequestsHandler(req, res) {
        const requesterEmail = String(req.authSession?.email || '').trim().toLowerCase();

        resolveDriverMachineByEmail(requesterEmail, (machineErr, machine) => {
            if (machineErr) {
                console.error('Database error resolving driver machine for maintenance requests:', machineErr);
                return res.status(500).json({ success: false, message: 'تعذر التحقق من المركبة المرتبطة بالسائق.' });
            }

            if (!machine) {
                return res.json({ success: true, hasAssignedVehicle: false, requests: [] });
            }

            const sql = `
                SELECT
                    r.request_id AS id,
                    r.quantity AS qty,
                    r.requested_by,
                    r.requested_by_email,
                    r.requested_for_date,
                    r.status,
                    r.justification,
                    r.machine_id,
                    r.created_at AS date,
                    m.machine_name AS machineName,
                    m.machine_code AS machineCode,
                    i.item_name AS itemName,
                    i.item_code AS itemCode
                FROM requests r
                JOIN inventory_items i ON r.item_id = i.item_id
                LEFT JOIN Machines m ON r.machine_id = m.machine_id
                WHERE LOWER(COALESCE(r.requested_by_email, '')) = ?
                  AND COALESCE(r.source_role, 'internal') = 'driver'
                ORDER BY r.created_at DESC
            `;

            db.query(sql, [requesterEmail], (err, results) => {
                if (err) {
                    console.error('Database error fetching driver maintenance requests:', err);
                    return res.status(500).json({ success: false, message: 'تعذر تحميل طلبات الصيانة الخاصة بالسائق.' });
                }

                return res.json({ success: true, hasAssignedVehicle: true, requests: results });
            });
        });
    }

    /**
     * الغرض: جلب طلبات الصيانة المنتظرة لقرار الميكانيكي مع بيانات المادة المرتبطة بها.
     * المدخلات: req غير مستخدم وظيفيًا داخل handler، وres لإرجاع القائمة أو رسالة الخطأ.
     * المخرجات: يعيد JSON يحوي `{ success, requests }` أو رسالة خطأ مطابقة للسلوك الحالي.
     * الآثار الجانبية: ينفذ استعلام قراءة على requests وinventory_items ويكتب الأخطاء إلى console.error عند الفشل.
     * ملاحظات: يبقي التصفية على الحالة `بانتظار مدير الآليات` وعلى source_role = 'driver' كما هي.
     */
    function getMechanicMaintenanceRequestsHandler(req, res) {
        const sql = `
            SELECT
                r.request_id AS id,
                r.quantity AS qty,
                r.requested_by,
                r.requested_by_email,
                r.requested_for_date,
                r.status,
                r.justification,
                r.machine_id,
                r.created_at AS date,
                m.machine_name AS machineName,
                m.machine_code AS machineCode,
                i.item_name AS itemName,
                i.item_code AS itemCode
            FROM requests r
            JOIN inventory_items i ON r.item_id = i.item_id
            LEFT JOIN Machines m ON r.machine_id = m.machine_id
            WHERE r.status = 'بانتظار مدير الآليات'
              AND COALESCE(r.source_role, 'internal') = 'driver'
            ORDER BY r.created_at DESC
        `;

        db.query(sql, (err, results) => {
            if (err) {
                console.error('Database error fetching mechanic maintenance requests:', err);
                return res.status(500).json({ success: false, message: 'تعذر تحميل إشعارات طلبات الصيانة.' });
            }

            return res.json({ success: true, requests: results });
        });
    }

    /**
     * الغرض: اعتماد طلب صيانة من الميكانيكي ونقله إلى الحالة التالية المعتمدة حاليًا.
     * المدخلات: req.params.id لتحديد الطلب، وreq.authSession لاستخراج بريد الميكانيكي، وres لإرجاع نتيجة القرار.
     * المخرجات: يعيد JSON بنتيجة الاعتماد أو رسالة خطأ مطابقة للسلوك الحالي.
     * الآثار الجانبية: ينفذ UPDATE على جدول requests لتغيير status وتسجيل mechanic_decision_by.
     * ملاحظات: يحافظ على شرط أن الطلب يجب أن يكون بحالة `بانتظار مدير الآليات` ومن نوع source_role = 'driver'.
     */
    function approveMechanicMaintenanceRequestHandler(req, res) {
        const requestId = Number(req.params.id);
        const mechanicEmail = String(req.authSession?.email || '').trim().toLowerCase();

        if (!requestId) {
            return res.status(400).json({ success: false, message: 'معرف الطلب غير صالح.' });
        }

        const sql = `
            UPDATE requests
            SET status = 'جديد',
                mechanic_decision_by = ?
            WHERE request_id = ?
              AND status = 'بانتظار مدير الآليات'
              AND COALESCE(source_role, 'internal') = 'driver'
        `;

        db.query(sql, [mechanicEmail, requestId], (err, result) => {
            if (err) {
                console.error('Database error approving maintenance request by mechanic:', err);
                return res.status(500).json({ success: false, message: 'تعذر اعتماد طلب الصيانة.' });
            }

            if (!result.affectedRows) {
                return res.status(404).json({ success: false, message: 'الطلب غير موجود أو تم التعامل معه مسبقًا.' });
            }

            return res.json({ success: true, message: 'تمت الموافقة وإرسال الطلب إلى مدير المستودع.' });
        });
    }

    /**
     * الغرض: رفض طلب صيانة من الميكانيكي وتثبيت حالة الرفض الحالية كما هي.
     * المدخلات: req.params.id لتحديد الطلب، وreq.authSession لاستخراج بريد الميكانيكي، وres لإرجاع نتيجة القرار.
     * المخرجات: يعيد JSON بنتيجة الرفض أو رسالة خطأ مطابقة للسلوك الحالي.
     * الآثار الجانبية: ينفذ UPDATE على جدول requests لتغيير status وتسجيل mechanic_decision_by.
     * ملاحظات: يحافظ على نفس شرط التحديث الحالي حتى لا يتغير behavior عند معالجة الطلبات المكررة.
     */
    function rejectMechanicMaintenanceRequestHandler(req, res) {
        const requestId = Number(req.params.id);
        const mechanicEmail = String(req.authSession?.email || '').trim().toLowerCase();

        if (!requestId) {
            return res.status(400).json({ success: false, message: 'معرف الطلب غير صالح.' });
        }

        const sql = `
            UPDATE requests
            SET status = 'مرفوض من مدير الآليات',
                mechanic_decision_by = ?
            WHERE request_id = ?
              AND status = 'بانتظار مدير الآليات'
              AND COALESCE(source_role, 'internal') = 'driver'
        `;

        db.query(sql, [mechanicEmail, requestId], (err, result) => {
            if (err) {
                console.error('Database error rejecting maintenance request by mechanic:', err);
                return res.status(500).json({ success: false, message: 'تعذر رفض طلب الصيانة.' });
            }

            if (!result.affectedRows) {
                return res.status(404).json({ success: false, message: 'الطلب غير موجود أو تم التعامل معه مسبقًا.' });
            }

            return res.json({ success: true, message: 'تم رفض طلب الصيانة.' });
        });
    }

    router.post('/driver/maintenance-requests', requireRoles(['driver']), createDriverMaintenanceRequestHandler);
    router.get('/driver/maintenance-requests', requireRoles(['driver']), getDriverMaintenanceRequestsHandler);
    router.get('/mechanic/maintenance-requests', requireRoles(['mechanic']), getMechanicMaintenanceRequestsHandler);
    router.post('/mechanic/maintenance-requests/:id/approve', requireRoles(['mechanic']), approveMechanicMaintenanceRequestHandler);
    router.post('/mechanic/maintenance-requests/:id/reject', requireRoles(['mechanic']), rejectMechanicMaintenanceRequestHandler);

    return router;
}

module.exports = {
    createMaintenanceRoutes
};
