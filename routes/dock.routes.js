/**
 * مسؤولية الملف: تجميع مسارات إدارة الرصيف الأساسية المطلوبة في هذه المرحلة داخل Router مستقل مع الحفاظ على نفس منطق العمل الحالي.
 * ملاحظات: يعتمد هذا الملف على الاعتماديات الممررة من app.js مثل db وrequireRoles وHelpers الرصيف، دون إعادة تصميم أعمق للبنية.
 */

const express = require('express');
const { createDockService } = require('../services/dock.service');

/**
 * الغرض: إنشاء Router خاص بمسارات مدير الرصيف الأساسية وربطه بالاعتماديات اللازمة.
 * المدخلات: كائن dependencies ويحتوي على db وrequireRoles وDOCK_BERTHS وHelpers القراءة والتطبيع الخاصة بالرصيف والسائقين.
 * المخرجات: يعيد كائن Express Router جاهزًا للربط داخل app.js على المسار `/api`.
 * الآثار الجانبية: ينشئ handlers تنفذ قراءات وتحديثات وإدراجات على جداول dock_slots وdock_release_requests وdock_delivery_requests وUsers.
 * ملاحظات: تم نقل المسارات المطلوبة فقط في هذه المرحلة، مع الإبقاء على الأجزاء الأعلى تعقيدًا خارج النطاق كما هي.
 */
function createDockRoutes({
    db,
    requireRoles,
    DOCK_BERTHS,
    getUsersIdColumn,
    getCurrentUserByEmail,
    getDockDrivers,
    getLatestDockReleaseRequests,
    normalizeDockBerthKey,
    getDockBerthStatus,
    getDockLevelsForBerth,
    getDockLevelMeta,
    getDockBerthMeta
}) {
    const router = express.Router();
    const dockService = createDockService({
        db,
        DOCK_BERTHS,
        getCurrentUserByEmail,
        getDockDrivers,
        getLatestDockReleaseRequests,
        normalizeDockBerthKey,
        getDockBerthStatus,
        getDockLevelsForBerth
    });

    /**
     * الغرض: تحميل بيانات لوحة مدير الرصيف بما يشمل الخانات والسائقين والطلبات الحديثة وملخص الإشغال.
     * المدخلات: req.authSession لاستخراج بيانات المدير الحالي، وres لإرجاع بيانات اللوحة أو رسالة الخطأ.
     * المخرجات: يعيد JSON يحوي manager وsummary وdrivers وberths بنفس الشكل الحالي للواجهة.
     * الآثار الجانبية: ينفذ عدة استعلامات قراءة عبر db وHelpers مساعدة، ويكتب الأخطاء إلى console.error عند الفشل.
     * ملاحظات: يحافظ على نفس منطق ربط آخر طلب بكل خانة وعلى نفس حسابات الإشغال والبرثات دون تغيير.
     */
    function getDockManagerDashboardHandler(req, res) {
        dockService.getDockManagerDashboard(req.authSession, (serviceResponse) => {
            return res.status(serviceResponse.statusCode).json(serviceResponse.body);
        });
    }

    /**
     * الغرض: جلب الحاويات التي اكتمل تسليمها من الرصيف لعرضها في شاشة المدير.
     * المدخلات: req غير مستخدم وظيفيًا داخل handler، وres لإرجاع القائمة أو رسالة الخطأ.
     * المخرجات: يعيد JSON يحوي `{ success, containers }` بنفس الشكل الحالي.
     * الآثار الجانبية: ينفذ استعلام قراءة على dock_release_requests ويكتب الأخطاء إلى console.error عند الفشل.
     * ملاحظات: يحافظ على نفس تشكيل الاسم السابق للحاوية والسائق ووقت الإكمال كما هو مستخدم حاليًا.
     */
    function getCompletedContainersHandler(req, res) {
        dockService.getCompletedContainers((serviceResponse) => {
            return res.status(serviceResponse.statusCode).json(serviceResponse.body);
        });
    }

    /**
     * الغرض: تسجيل حاوية جديدة داخل خانة متاحة في الرصيف بعد التحقق من عدم تكرار رقم الحاوية.
     * المدخلات: req.body ويحتوي على berthKey وlevel وcontainerNumber وownerName وcontainerType وnotes، وres لإرجاع نتيجة التسجيل.
     * المخرجات: يعيد JSON بنتيجة التسجيل أو رسالة خطأ مطابقة للسلوك الحالي.
     * الآثار الجانبية: ينفذ قراءات وتحديثًا على جدول dock_slots لتخصيص الخانة للحاوية الجديدة.
     * ملاحظات: يحافظ على نفس منطق اختيار أول خانة فارغة بحسب slot_order داخل المستوى المحدد.
     */
    function createDockContainerHandler(req, res) {
        const berthKey = normalizeDockBerthKey(req.body.berthKey) || 'A';
        const levelKey = String(req.body.level || '').trim().toLowerCase();
        const containerNumber = String(req.body.containerNumber || '').trim().toUpperCase();
        const ownerName = String(req.body.ownerName || '').trim();
        const containerType = String(req.body.containerType || '').trim() || null;
        const notes = String(req.body.notes || '').trim() || null;
        const levelMeta = getDockLevelMeta(levelKey);
        const berthMeta = getDockBerthMeta(berthKey);

        if (!berthMeta || !levelMeta || !containerNumber || !ownerName) {
            return res.status(400).json({ success: false, message: 'يرجى اختيار الرصيف والمستوى وإدخال رقم الحاوية واسم المالك.' });
        }

        const duplicateQuery = `
            SELECT id, slot_code
            FROM dock_slots
            WHERE UPPER(container_number) = ?
            LIMIT 1
        `;

        db.query(duplicateQuery, [containerNumber], (duplicateErr, duplicateResults) => {
            if (duplicateErr) {
                console.error('Error checking duplicate dock container:', duplicateErr);
                return res.status(500).json({ success: false, message: 'تعذر التحقق من رقم الحاوية.' });
            }

            if (duplicateResults.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: `الحاوية ${containerNumber} موجودة بالفعل في الخانة ${duplicateResults[0].slot_code}.`
                });
            }

            const availableSlotQuery = `
                SELECT id, slot_code
                FROM dock_slots
                WHERE berth_key = ?
                  AND level_key = ?
                  AND (container_number IS NULL OR TRIM(container_number) = '')
                ORDER BY slot_order ASC
                LIMIT 1
            `;

            db.query(availableSlotQuery, [berthKey, levelKey], (slotErr, slotResults) => {
                if (slotErr) {
                    console.error('Error finding available dock slot:', slotErr);
                    return res.status(500).json({ success: false, message: 'تعذر العثور على خانة متاحة.' });
                }

                if (!slotResults.length) {
                    return res.status(409).json({
                        success: false,
                        message: `لا توجد خانات فارغة حالياً في ${berthMeta.label} - ${levelMeta.label}.`
                    });
                }

                const slot = slotResults[0];
                const updateSlotQuery = `
                    UPDATE dock_slots
                    SET container_number = ?, owner_name = ?, container_type = ?, notes = ?
                    WHERE id = ?
                `;

                db.query(updateSlotQuery, [containerNumber, ownerName, containerType, notes, slot.id], (updateErr) => {
                    if (updateErr) {
                        console.error('Error assigning dock slot:', updateErr);
                        return res.status(500).json({ success: false, message: 'تعذر تسجيل الحاوية في الرصيف.' });
                    }

                    return res.status(201).json({
                        success: true,
                        message: `تم تسجيل الحاوية ${containerNumber} في الخانة ${slot.slot_code}.`
                    });
                });
            });
        });
    }

    /**
     * الغرض: تحميل بيانات سياق طلب تسليم رصيف لخانة محددة قبل إنشاء الطلب من الواجهة.
     * المدخلات: req.params.slotId لتحديد الخانة، وres لإرجاع context أو رسالة الخطأ.
     * المخرجات: يعيد JSON يحوي `{ success, context }` أو رسالة خطأ مطابقة للسلوك الحالي.
     * الآثار الجانبية: ينفذ استعلام قراءة على dock_slots وincoming_vessel_containers وincoming_vessels ويكتب الأخطاء إلى console.error عند الفشل.
     * ملاحظات: يحافظ على نفس أولوية بيانات المالك بين بيانات الحاوية وبيانات الخانة الحالية.
     */
    function getDockReleaseRequestContextHandler(req, res) {
        dockService.getDockReleaseRequestContext(req.params.slotId, (serviceResponse) => {
            return res.status(serviceResponse.statusCode).json(serviceResponse.body);
        });
    }

    /**
     * الغرض: إنشاء طلب تسليم رصيف جديد للخانة المحددة بعد التحقق من اكتمال البيانات وعدم وجود طلب pending سابق.
     * المدخلات: req.body ويحتوي على بيانات الطلب كاملة مثل slotId وcustomerName وcontainerNumbers وغيرها، وreq.authSession.email لتسجيل منشئ الطلب.
     * المخرجات: يعيد JSON بنتيجة الإنشاء أو رسالة خطأ مطابقة للسلوك الحالي.
     * الآثار الجانبية: يقرأ بيانات الخانة الحالية ثم ينفذ INSERT في جدول dock_release_requests.
     * ملاحظات: يحافظ على نفس شرط منع وجود طلب pending مفتوح مسبقًا للخانة نفسها.
     */
    function createDockReleaseRequestHandler(req, res) {
        const slotId = Number(req.body.slotId);
        const customerName = String(req.body.customerName || '').trim();
        const customsBrokerName = String(req.body.customsBrokerName || '').trim();
        const vesselName = String(req.body.vesselName || '').trim();
        const voyageReference = String(req.body.voyageReference || '').trim();
        const billOfLadingNumber = String(req.body.billOfLadingNumber || '').trim();
        const customsStatementNumber = String(req.body.customsStatementNumber || '').trim();
        const containerNumbers = String(req.body.containerNumbers || '').trim();
        const containerCount = Math.max(1, Number.parseInt(req.body.containerCount, 10) || 0);
        const arrivalDate = String(req.body.arrivalDate || '').trim() || null;
        const clearanceDeliveryDate = String(req.body.clearanceDeliveryDate || '').trim() || null;
        const notes = String(req.body.notes || '').trim() || null;

        if (
            !slotId
            || !customerName
            || !customsBrokerName
            || !vesselName
            || !voyageReference
            || !billOfLadingNumber
            || !customsStatementNumber
            || !containerNumbers
            || !arrivalDate
            || !clearanceDeliveryDate
        ) {
            return res.status(400).json({ success: false, message: 'يرجى تعبئة جميع بيانات طلب التسليم قبل الإرسال.' });
        }

        const slotQuery = `
            SELECT id, slot_code, berth_key, container_number, owner_name
            FROM dock_slots
            WHERE id = ?
            LIMIT 1
        `;

        db.query(slotQuery, [slotId], (slotErr, slotResults) => {
            if (slotErr) {
                console.error('Error loading dock slot for release request:', slotErr);
                return res.status(500).json({ success: false, message: 'تعذر تحميل بيانات الخانة.' });
            }

            if (!slotResults.length || !String(slotResults[0].container_number || '').trim()) {
                return res.status(404).json({ success: false, message: 'الخانة المحددة فارغة أو غير موجودة.' });
            }

            const slot = slotResults[0];
            const pendingRequestQuery = `
                SELECT request_id
                FROM dock_release_requests
                WHERE slot_id = ?
                  AND status = 'pending'
                ORDER BY request_id DESC
                LIMIT 1
            `;

            db.query(pendingRequestQuery, [slotId], (requestErr, requestResults) => {
                if (requestErr) {
                    console.error('Error checking pending dock release request:', requestErr);
                    return res.status(500).json({ success: false, message: 'تعذر التحقق من الطلب الحالي.' });
                }

                if (requestResults.length) {
                    return res.status(409).json({
                        success: false,
                        message: 'يوجد طلب تسليم مفتوح بالفعل لهذه الخانة بانتظار قرار الأدمن.'
                    });
                }

                const insertQuery = `
                    INSERT INTO dock_release_requests (
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
                        created_by_email
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
                `;

                db.query(
                    insertQuery,
                    [
                        slot.id,
                        slot.slot_code,
                        slot.berth_key || null,
                        slot.container_number,
                        slot.owner_name || null,
                        customerName,
                        customsBrokerName,
                        vesselName,
                        voyageReference,
                        billOfLadingNumber,
                        customsStatementNumber,
                        containerNumbers,
                        containerCount,
                        arrivalDate,
                        clearanceDeliveryDate,
                        notes,
                        req.authSession.email
                    ],
                    (insertErr) => {
                        if (insertErr) {
                            console.error('Error creating dock release request:', insertErr);
                            return res.status(500).json({ success: false, message: 'تعذر إرسال طلب التسليم إلى الإدارة.' });
                        }

                        return res.status(201).json({
                            success: true,
                            message: `تم إرسال طلب تسليم الحاوية ${slot.container_number} إلى الإدارة للمراجعة.`
                        });
                    }
                );
            });
        });
    }

    /**
     * الغرض: إنشاء طلب نقل حاوية إلى سائق محدد بعد التحقق من وجود الخانة والسائق وعدم وجود طلب مفتوح سابق.
     * المدخلات: req.body ويحتوي على slotId وdriverUserId، وreq.authSession.email لتسجيل منشئ الطلب.
     * المخرجات: يعيد JSON بنتيجة الإنشاء أو رسالة خطأ مطابقة للسلوك الحالي.
     * الآثار الجانبية: يقرأ بيانات الخانة والسائق ثم ينفذ INSERT في جدول dock_delivery_requests.
     * ملاحظات: يحافظ على نفس شرط منع الطلبات المفتوحة بحالات pending وapproved للخانة نفسها.
     */
    function createDockDeliveryRequestHandler(req, res) {
        const slotId = Number(req.body.slotId);
        const driverUserId = Number(req.body.driverUserId);

        if (!slotId || !driverUserId) {
            return res.status(400).json({ success: false, message: 'يرجى اختيار الخانة والسائق.' });
        }

        getUsersIdColumn((columnErr, userIdColumn) => {
            if (columnErr) {
                return res.status(500).json({ success: false, message: 'تعذر قراءة بيانات السائقين.' });
            }

            const slotQuery = `
                SELECT id, slot_code, container_number, owner_name
                FROM dock_slots
                WHERE id = ?
                LIMIT 1
            `;

            db.query(slotQuery, [slotId], (slotErr, slotResults) => {
                if (slotErr) {
                    console.error('Error fetching dock slot for request:', slotErr);
                    return res.status(500).json({ success: false, message: 'تعذر تحميل بيانات الخانة.' });
                }

                if (!slotResults.length || !String(slotResults[0].container_number || '').trim()) {
                    return res.status(404).json({ success: false, message: 'الخانة المحددة فارغة أو غير موجودة.' });
                }

                const slot = slotResults[0];
                const driverQuery = `
                    SELECT ${userIdColumn} AS user_id, email, full_name
                    FROM Users
                    WHERE ${userIdColumn} = ? AND LOWER(TRIM(role)) = 'driver'
                    LIMIT 1
                `;

                db.query(driverQuery, [driverUserId], (driverErr, driverResults) => {
                    if (driverErr) {
                        console.error('Error fetching driver for dock request:', driverErr);
                        return res.status(500).json({ success: false, message: 'تعذر تحميل بيانات السائق.' });
                    }

                    if (!driverResults.length) {
                        return res.status(404).json({ success: false, message: 'السائق المحدد غير موجود.' });
                    }

                    const pendingRequestQuery = `
                        SELECT request_id
                        FROM dock_delivery_requests
                        WHERE slot_id = ?
                          AND status IN ('pending', 'approved')
                        ORDER BY request_id DESC
                        LIMIT 1
                    `;

                    db.query(pendingRequestQuery, [slotId], (requestErr, requestResults) => {
                        if (requestErr) {
                            console.error('Error checking pending dock request:', requestErr);
                            return res.status(500).json({ success: false, message: 'تعذر التحقق من الطلب الحالي.' });
                        }

                        if (requestResults.length) {
                            return res.status(409).json({
                                success: false,
                                message: 'يوجد طلب مفتوح بالفعل لهذه الخانة بانتظار التنفيذ أو الرد.'
                            });
                        }

                        const driver = driverResults[0];
                        const insertRequestQuery = `
                            INSERT INTO dock_delivery_requests (
                                slot_id,
                                container_number,
                                slot_code,
                                owner_name,
                                driver_user_id,
                                status,
                                created_by_email
                            )
                            VALUES (?, ?, ?, ?, ?, 'pending', ?)
                        `;

                        db.query(
                            insertRequestQuery,
                            [slotId, slot.container_number, slot.slot_code, slot.owner_name || null, driver.user_id, req.authSession.email],
                            (insertErr) => {
                                if (insertErr) {
                                    console.error('Error creating dock request:', insertErr);
                                    return res.status(500).json({ success: false, message: 'تعذر إرسال الطلب إلى السائق.' });
                                }

                                return res.status(201).json({
                                    success: true,
                                    message: `تم إرسال طلب نقل الحاوية ${slot.container_number} إلى السائق ${driver.full_name || driver.email}.`
                                });
                            }
                        );
                    });
                });
            });
        });
    }

    /**
     * الغرض: تسليم حاوية مباشرة من الرصيف عبر تفريغ الخانة وإغلاق طلبات النقل المفتوحة المرتبطة بها.
     * المدخلات: req.body.containerNumber لتحديد الحاوية، وres لإرجاع نتيجة التسليم.
     * المخرجات: يعيد JSON بنتيجة التسليم أو رسالة خطأ مطابقة للسلوك الحالي.
     * الآثار الجانبية: يحدّث dock_slots لمسح بيانات الحاوية ويحدّث dock_delivery_requests لتغيير حالتها إلى delivered.
     * ملاحظات: يبقي سلوك تجاهل فشل تحديث طلبات النقل بعد التفريغ كما هو، مع تسجيل الخطأ فقط في console.error.
     */
    function deliverDockContainerHandler(req, res) {
        const containerNumber = String(req.body.containerNumber || '').trim().toUpperCase();

        if (!containerNumber) {
            return res.status(400).json({ success: false, message: 'يرجى إدخال رقم الحاوية.' });
        }

        const findContainerQuery = `
            SELECT id, slot_code
            FROM dock_slots
            WHERE UPPER(container_number) = ?
            LIMIT 1
        `;

        db.query(findContainerQuery, [containerNumber], (findErr, results) => {
            if (findErr) {
                console.error('Error finding container in dock slots:', findErr);
                return res.status(500).json({ success: false, message: 'تعذر البحث عن الحاوية.' });
            }

            if (!results.length) {
                return res.status(404).json({ success: false, message: 'هذه الحاوية غير موجودة حالياً داخل الرصيف.' });
            }

            const slot = results[0];
            const clearSlotQuery = `
                UPDATE dock_slots
                SET container_number = NULL, owner_name = NULL, container_type = NULL, notes = NULL
                WHERE id = ?
            `;

            db.query(clearSlotQuery, [slot.id], (clearErr) => {
                if (clearErr) {
                    console.error('Error clearing dock slot:', clearErr);
                    return res.status(500).json({ success: false, message: 'تعذر تسليم الحاوية من الرصيف.' });
                }

                db.query(
                    `
                        UPDATE dock_delivery_requests
                        SET status = 'delivered', delivered_at = NOW()
                        WHERE slot_id = ?
                          AND status IN ('pending', 'approved', 'unavailable')
                    `,
                    [slot.id],
                    (requestUpdateErr) => {
                        if (requestUpdateErr) {
                            console.error('Error closing dock requests after delivery:', requestUpdateErr);
                        }

                        return res.status(200).json({
                            success: true,
                            message: `تم تسليم الحاوية ${containerNumber} وتفريغ الخانة ${slot.slot_code}.`
                        });
                    }
                );
            });
        });
    }

    router.get('/dockmanager/dashboard', requireRoles(['dockmanager']), getDockManagerDashboardHandler);
    router.get('/dockmanager/completed-containers', requireRoles(['dockmanager']), getCompletedContainersHandler);
    router.post('/dockmanager/containers', requireRoles(['dockmanager']), createDockContainerHandler);
    router.get('/dockmanager/release-requests/context/:slotId', requireRoles(['dockmanager']), getDockReleaseRequestContextHandler);
    router.post('/dockmanager/release-requests', requireRoles(['dockmanager']), createDockReleaseRequestHandler);
    router.post('/dockmanager/requests', requireRoles(['dockmanager']), createDockDeliveryRequestHandler);
    router.post('/dockmanager/containers/deliver', requireRoles(['dockmanager']), deliverDockContainerHandler);

    return router;
}

module.exports = {
    createDockRoutes
};
