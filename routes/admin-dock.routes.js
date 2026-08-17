/**
 * مسؤولية الملف: تجميع مسارات إدارة طلبات تسليم الرصيف الخاصة بالأدمن في Router مستقل دون تغيير منطق العمل الحالي.
 * ملاحظات: يعتمد هذا الملف على db وrequireRoles الممررين من app.js ويحافظ على نفس endpoints الحالية تحت `/api/admin/dock-release-requests`.
 */

const express = require('express');

/**
 * الغرض: إنشاء Router خاص بمسارات أدمن تسليم الرصيف وربطه بالاعتماديات اللازمة.
 * المدخلات: كائن dependencies ويحتوي على db وrequireRoles.
 * المخرجات: يعيد كائن Express Router جاهزًا للربط داخل app.js على المسار `/api`.
 * الآثار الجانبية: ينشئ handlers تنفذ قراءات وتحديثات ومعاملات على جداول dock_release_requests وdock_slots.
 * ملاحظات: يحافظ على نفس منطق transaction الحالي في مسار الاعتماد دون أي refactor عميق.
 */
function createAdminDockRoutes({
    db,
    requireRoles
}) {
    const router = express.Router();

    /**
     * الغرض: جلب قائمة طلبات تسليم الرصيف للأدمن مع ترتيبها الحالي وعدد الطلبات المعلقة.
     * المدخلات: req غير مستخدم وظيفيًا داخل handler، وres لإرجاع القائمة أو رسالة الخطأ.
     * المخرجات: يعيد JSON يحوي `{ success, pendingCount, requests }` أو رسالة خطأ مطابقة للسلوك الحالي.
     * الآثار الجانبية: ينفذ استعلام قراءة على جدول dock_release_requests ويكتب الأخطاء إلى console.error عند الفشل.
     * ملاحظات: يحافظ على نفس ORDER BY الحالي الذي يقدّم الطلبات pending ثم rejected ثم الباقي.
     */
    function getAdminDockReleaseRequestsHandler(req, res) {
        const query = `
            SELECT
                request_id,
                slot_id,
                slot_code,
                berth_key,
                container_number,
                owner_name,
                customer_name,
                customs_broker_name,
                vessel_name,
                voyage_reference,
                bill_of_lading_number,
                customs_statement_number,
                container_numbers,
                container_count,
                arrival_date,
                clearance_delivery_date,
                notes,
                status,
                created_by_email,
                reviewed_by_email,
                decision_note,
                created_at,
                reviewed_at
            FROM dock_release_requests
            ORDER BY
                CASE status
                    WHEN 'pending' THEN 0
                    WHEN 'rejected' THEN 1
                    ELSE 2
                END,
                created_at DESC,
                request_id DESC
        `;

        db.query(query, (queryErr, results) => {
            if (queryErr) {
                console.error('Error fetching admin dock release requests:', queryErr);
                return res.status(500).json({ success: false, message: 'تعذر تحميل طلبات تسليم الرصيف.' });
            }

            return res.status(200).json({
                success: true,
                pendingCount: results.filter((row) => row.status === 'pending').length,
                requests: results
            });
        });
    }

    /**
     * الغرض: اعتماد طلب تسليم رصيف ثم تحرير الخانة المرتبطة وتحديث حالة الطلب ضمن معاملة واحدة.
     * المدخلات: req.params.requestId لتحديد الطلب، وreq.body.note للملاحظة الاختيارية، وreq.authSession.email لتسجيل جهة الاعتماد.
     * المخرجات: يعيد JSON بنتيجة الاعتماد أو رسالة خطأ مطابقة للسلوك الحالي.
     * الآثار الجانبية: يبدأ transaction ثم يقرأ الطلب والخانة ويحدّث dock_slots وdock_release_requests ثم commit أو rollback.
     * ملاحظات: يحافظ على نفس جميع فحوصات التوافق الحالية، بما فيها التحقق من مطابقة الحاوية الموجودة فعليًا مع بيانات الطلب.
     */
    function approveAdminDockReleaseRequestHandler(req, res) {
        const requestId = Number(req.params.requestId);
        const decisionNote = String(req.body.note || '').trim() || null;

        if (!requestId) {
            return res.status(400).json({ success: false, message: 'معرف الطلب غير صالح.' });
        }

        db.beginTransaction((transactionErr) => {
            if (transactionErr) {
                console.error('Error starting dock release approval transaction:', transactionErr);
                return res.status(500).json({ success: false, message: 'تعذر بدء اعتماد الطلب.' });
            }

            const requestQuery = `
                SELECT request_id, slot_id, slot_code, container_number, status
                FROM dock_release_requests
                WHERE request_id = ?
                LIMIT 1
            `;

            db.query(requestQuery, [requestId], (requestErr, requestResults) => {
                if (requestErr) {
                    return db.rollback(() => {
                        console.error('Error loading dock release request for approval:', requestErr);
                        return res.status(500).json({ success: false, message: 'تعذر تحميل طلب التسليم.' });
                    });
                }

                if (!requestResults.length) {
                    return db.rollback(() => res.status(404).json({ success: false, message: 'طلب التسليم غير موجود.' }));
                }

                const request = requestResults[0];
                if (request.status !== 'pending') {
                    return db.rollback(() => res.status(409).json({ success: false, message: 'تمت معالجة هذا الطلب مسبقاً.' }));
                }

                db.query(
                    `
                        SELECT id, slot_code, container_number
                        FROM dock_slots
                        WHERE id = ?
                        LIMIT 1
                    `,
                    [request.slot_id],
                    (slotErr, slotResults) => {
                        if (slotErr) {
                            return db.rollback(() => {
                                console.error('Error loading dock slot for approval:', slotErr);
                                return res.status(500).json({ success: false, message: 'تعذر تحميل خانة الرصيف.' });
                            });
                        }

                        if (!slotResults.length) {
                            return db.rollback(() => res.status(404).json({ success: false, message: 'خانة الرصيف المرتبطة غير موجودة.' }));
                        }

                        const slot = slotResults[0];
                        if (!String(slot.container_number || '').trim()) {
                            return db.rollback(() => res.status(409).json({ success: false, message: 'الخانة مرتبطة بطلب قديم لكنها فارغة حالياً.' }));
                        }

                        if (String(slot.container_number || '').trim().toUpperCase() !== String(request.container_number || '').trim().toUpperCase()) {
                            return db.rollback(() => res.status(409).json({ success: false, message: 'رقم الحاوية الحالي في الخانة لا يطابق بيانات الطلب.' }));
                        }

                        db.query(
                            `
                                UPDATE dock_slots
                                SET container_number = NULL, owner_name = NULL, container_type = NULL, notes = NULL
                                WHERE id = ?
                            `,
                            [request.slot_id],
                            (clearErr) => {
                                if (clearErr) {
                                    return db.rollback(() => {
                                        console.error('Error clearing dock slot after admin approval:', clearErr);
                                        return res.status(500).json({ success: false, message: 'تعذر تحرير موقع الحاوية.' });
                                    });
                                }

                                db.query(
                                    `
                                        UPDATE dock_release_requests
                                        SET
                                            status = 'approved',
                                            reviewed_by_email = ?,
                                            decision_note = ?,
                                            reviewed_at = NOW()
                                        WHERE request_id = ?
                                    `,
                                    [req.authSession.email, decisionNote, requestId],
                                    (updateErr) => {
                                        if (updateErr) {
                                            return db.rollback(() => {
                                                console.error('Error updating dock release request to approved:', updateErr);
                                                return res.status(500).json({ success: false, message: 'تعذر اعتماد الطلب.' });
                                            });
                                        }

                                        db.commit((commitErr) => {
                                            if (commitErr) {
                                                return db.rollback(() => {
                                                    console.error('Error committing dock release approval:', commitErr);
                                                    return res.status(500).json({ success: false, message: 'تعذر إتمام اعتماد الطلب.' });
                                                });
                                            }

                                            return res.status(200).json({
                                                success: true,
                                                message: `تمت الموافقة على طلب تسليم الحاوية ${request.container_number} وتحرير الخانة ${request.slot_code}.`
                                            });
                                        });
                                    }
                                );
                            }
                        );
                    }
                );
            });
        });
    }

    /**
     * الغرض: رفض طلب تسليم الرصيف مع تثبيت قرار الرفض وتسجيل جهة المراجعة كما هو معمول به حاليًا.
     * المدخلات: req.params.requestId لتحديد الطلب، وreq.body.note للملاحظة الاختيارية، وreq.authSession.email لتسجيل جهة الرفض.
     * المخرجات: يعيد JSON بنتيجة الرفض أو رسالة خطأ مطابقة للسلوك الحالي.
     * الآثار الجانبية: ينفذ UPDATE على جدول dock_release_requests لتغيير الحالة إلى rejected وتحديث بيانات المراجعة.
     * ملاحظات: يحافظ على نفس شرط التحديث الحالي الذي يقبل فقط الطلبات pending.
     */
    function rejectAdminDockReleaseRequestHandler(req, res) {
        const requestId = Number(req.params.requestId);
        const decisionNote = String(req.body.note || '').trim() || null;

        if (!requestId) {
            return res.status(400).json({ success: false, message: 'معرف الطلب غير صالح.' });
        }

        db.query(
            `
                UPDATE dock_release_requests
                SET
                    status = 'rejected',
                    reviewed_by_email = ?,
                    decision_note = ?,
                    reviewed_at = NOW()
                WHERE request_id = ?
                  AND status = 'pending'
            `,
            [req.authSession.email, decisionNote, requestId],
            (updateErr, updateResult) => {
                if (updateErr) {
                    console.error('Error rejecting dock release request:', updateErr);
                    return res.status(500).json({ success: false, message: 'تعذر رفض الطلب.' });
                }

                if (!updateResult.affectedRows) {
                    return res.status(409).json({ success: false, message: 'تمت معالجة هذا الطلب مسبقاً أو أنه غير موجود.' });
                }

                return res.status(200).json({
                    success: true,
                    message: 'تم رفض طلب تسليم الحاوية وإبقاؤها في موقعها الحالي.'
                });
            }
        );
    }

    router.get('/admin/dock-release-requests', requireRoles(['admin']), getAdminDockReleaseRequestsHandler);
    router.post('/admin/dock-release-requests/:requestId/approve', requireRoles(['admin']), approveAdminDockReleaseRequestHandler);
    router.post('/admin/dock-release-requests/:requestId/reject', requireRoles(['admin']), rejectAdminDockReleaseRequestHandler);

    return router;
}

module.exports = {
    createAdminDockRoutes
};
