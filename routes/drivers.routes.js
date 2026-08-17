/**
 * مسؤولية الملف: تجميع مسارات السائقين المطلوبة في هذه المرحلة داخل Router مستقل مع الحفاظ على نفس المنطق الحالي.
 * ملاحظات: يعتمد هذا الملف على db وgetUsersIdColumn فقط، ولم يتم إدخال طبقات إضافية أو إعادة تصميم أوسع.
 */

const express = require('express');

/**
 * الغرض: إنشاء Router خاص بمسارات السائقين المطلوبة وربطه بالاعتماديات اللازمة.
 * المدخلات: كائن dependencies ويحتوي على db وgetUsersIdColumn.
 * المخرجات: يعيد كائن Express Router جاهزًا للربط داخل app.js على المسار `/api`.
 * الآثار الجانبية: ينشئ handlers تنفذ استعلامات قراءة وتعديل على جداول Users وMachines وترسل الاستجابات الحالية.
 * ملاحظات: يحافظ على نفس endpoint paths الحالية `GET /api/drivers` و`PUT /api/drivers/:userId`.
 */
function createDriversRoutes({
    db,
    getUsersIdColumn
}) {
    const router = express.Router();

    /**
     * الغرض: جلب قائمة السائقين مع معلومات الآلية المرتبطة بكل سائق إن وجدت.
     * المدخلات: req غير مستخدم عمليًا هنا إلا كطلب Express، وres لإرجاع قائمة السائقين أو الخطأ المناسب.
     * المخرجات: يرسل JSON يحتوي على `{ success, drivers }` أو رسالة خطأ عند الفشل.
     * الآثار الجانبية: ينفذ SELECT على Users وMachines ويكتب الأخطاء إلى console.error عند الفشل.
     * ملاحظات: يعتمد على getUsersIdColumn للحفاظ على التوافق مع اختلاف اسم عمود المعرف في جدول Users.
     */
    function getDriversHandler(req, res) {
        getUsersIdColumn((columnErr, userIdColumn) => {
            if (columnErr) {
                return res.status(500).json({
                    success: false,
                    message: 'تعذر قراءة بنية جدول المستخدمين.'
                });
            }

            const query = `
                SELECT u.${userIdColumn} AS user_id, u.email, u.role, u.full_name, u.shift, u.phone,
                       m.machine_id AS assigned_machine_id,
                       m.machine_name AS assigned_machine_name
                FROM Users u
                LEFT JOIN Machines m ON m.driver_user_id = u.${userIdColumn}
                WHERE LOWER(TRIM(u.role)) = 'driver'
                ORDER BY u.full_name ASC, u.${userIdColumn} ASC
            `;

            db.query(query, (err, results) => {
                if (err) {
                    console.error('Database error on fetching drivers:', err);
                    return res.status(500).json({
                        success: false,
                        message: 'تعذر جلب قائمة السائقين.'
                    });
                }

                return res.status(200).json({
                    success: true,
                    drivers: results
                });
            });
        });
    }

    /**
     * الغرض: تحديث بيانات السائق الأساسية وتحديث بيانات المركبة المرتبطة به إذا تم العثور عليها.
     * المدخلات: req.params.userId لتحديد السائق، req.body لحقول full_name وphone وshift وvehicle_location وvehicle_status، وres لإرجاع النتيجة.
     * المخرجات: يرسل JSON يوضح نجاح التحديث الجزئي أو الكامل أو سبب الفشل مع الحفاظ على نفس الرسائل الحالية.
     * الآثار الجانبية: ينفذ UPDATE على جدول Users، وقد ينفذ SELECT وUPDATE إضافيين على جدول Machines بحسب المركبة المرتبطة.
     * ملاحظات: يحافظ على نفس منطق البحث عن المركبة بواسطة driver_user_id أو البريد أو الاسم السابق، ونفس allowedStatuses الحالية.
     */
    function updateDriverHandler(req, res) {
        const userId = Number(req.params.userId);
        const { full_name, phone, shift, vehicle_location, vehicle_status } = req.body;

        if (!userId) {
            return res.status(400).json({ success: false, message: 'معرف السائق غير صالح.' });
        }

        const normalizedFullName = String(full_name || '').trim() || null;
        const normalizedPhone = String(phone || '').trim() || null;
        const normalizedShift = String(shift || '').trim() || null;
        const normalizedLocation = String(vehicle_location || '').trim() || null;
        const normalizedStatus = String(vehicle_status || '').trim() || null;

        const allowedStatuses = ['جاهزة', 'تحت الصيانة', 'متوقفة', 'في الخدمة'];
        if (normalizedStatus && !allowedStatuses.includes(normalizedStatus)) {
            return res.status(400).json({ success: false, message: 'حالة المركبة غير صالحة.' });
        }

        getUsersIdColumn((columnErr, userIdColumn) => {
            if (columnErr) {
                return res.status(500).json({ success: false, message: 'تعذر قراءة بنية جدول المستخدمين.' });
            }

            const fetchUserQuery = `
                SELECT ${userIdColumn} AS user_id, email, full_name
                FROM Users
                WHERE ${userIdColumn} = ? AND LOWER(TRIM(role)) = 'driver'
                LIMIT 1
            `;

            db.query(fetchUserQuery, [userId], (userErr, userResults) => {
                if (userErr) {
                    console.error('Database error on fetching driver before update:', userErr);
                    return res.status(500).json({ success: false, message: 'تعذر تحديث بيانات السائق.' });
                }

                if (!userResults.length) {
                    return res.status(404).json({ success: false, message: 'لم يتم العثور على السائق.' });
                }

                const user = userResults[0];
                const previousFullName = String(user.full_name || '').trim();
                const updateUserQuery = `UPDATE Users SET full_name = ?, phone = ?, shift = ? WHERE ${userIdColumn} = ?`;

                db.query(updateUserQuery, [normalizedFullName, normalizedPhone, normalizedShift, userId], (updateUserErr) => {
                    if (updateUserErr) {
                        console.error('Database error on updating driver fields:', updateUserErr);
                        return res.status(500).json({ success: false, message: 'تعذر تحديث بيانات السائق.' });
                    }

                    const machineParams = [userId, user.email];
                    let machineQuery = `
                        SELECT machine_id
                        FROM Machines
                        WHERE driver_user_id = ?
                           OR LOWER(COALESCE(notes, '')) LIKE CONCAT('%', LOWER(?), '%')
                    `;

                    if (previousFullName) {
                        machineQuery += ` OR LOWER(COALESCE(facility_name, '')) = LOWER(?) OR LOWER(COALESCE(notes, '')) LIKE CONCAT('%', LOWER(?), '%')`;
                        machineParams.push(previousFullName, previousFullName);
                    }

                    machineQuery += `
                        ORDER BY
                            CASE
                                WHEN driver_user_id = ? THEN 0
                                ELSE 1
                            END,
                            machine_id ASC
                        LIMIT 1
                    `;
                    machineParams.push(userId);

                    db.query(machineQuery, machineParams, (machineErr, machineResults) => {
                        if (machineErr) {
                            console.error('Database error on fetching related machine for driver update:', machineErr);
                            return res.status(500).json({ success: false, message: 'تم تحديث بيانات السائق لكن تعذر الوصول إلى المركبة.' });
                        }

                        if (!machineResults.length) {
                            return res.status(200).json({
                                success: true,
                                message: 'تم تحديث بيانات السائق. لا توجد مركبة مرتبطة لتحديثها.'
                            });
                        }

                        const machineId = machineResults[0].machine_id;
                        const updateMachineQuery = `
                            UPDATE Machines
                            SET location_id = COALESCE(?, location_id),
                                status = COALESCE(?, status),
                                facility_name = CASE
                                    WHEN ? IS NOT NULL AND ? <> '' AND LOWER(COALESCE(facility_name, '')) = LOWER(?)
                                        THEN ?
                                    ELSE facility_name
                                END
                            WHERE machine_id = ?
                        `;

                        db.query(
                            updateMachineQuery,
                            [normalizedLocation, normalizedStatus, normalizedFullName, normalizedFullName, previousFullName, normalizedFullName, machineId],
                            (updateMachineErr) => {
                                if (updateMachineErr) {
                                    console.error('Database error on updating driver machine:', updateMachineErr);
                                    return res.status(500).json({ success: false, message: 'تم تحديث بيانات السائق لكن تعذر تحديث بيانات المركبة.' });
                                }

                                return res.status(200).json({
                                    success: true,
                                    message: 'تم تحديث بيانات السائق والمركبة بنجاح.'
                                });
                            }
                        );
                    });
                });
            });
        });
    }

    router.get('/drivers', getDriversHandler);
    router.put('/drivers/:userId', updateDriverHandler);

    return router;
}

module.exports = {
    createDriversRoutes
};
