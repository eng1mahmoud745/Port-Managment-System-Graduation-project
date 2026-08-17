/**
 * مسؤولية الملف: تجميع مسارات استقبال البواخر والحاويات المطلوبة في هذه المرحلة داخل Router مستقل مع الحفاظ على نفس منطق العمل الحالي.
 * ملاحظات: يعتمد هذا الملف على الاعتماديات الممررة من app.js مثل db وrequireRoles وHelpers الاستقبال، دون إعادة تصميم أعمق للبنية.
 */

const express = require('express');
const { createVesselsService } = require('../services/vessels.service');

/**
 * الغرض: إنشاء Router خاص بمسارات استقبال البواخر والحاويات وربطه بالاعتماديات اللازمة.
 * المدخلات: كائن dependencies ويحتوي على db وrequireRoles وHelpers التطبيع والقراءة والتحقق والتوزيع المطلوبة لهذه المسارات.
 * المخرجات: يعيد كائن Express Router جاهزًا للربط داخل app.js على المسار `/api`.
 * الآثار الجانبية: ينشئ handlers تنفذ قراءات وإدراجات وتحديثات ومعاملات على جداول incoming_vessels وincoming_vessel_containers وخطط ومهام التفريغ.
 * ملاحظات: تم نقل مسارات الاستقبال المطلوبة فقط في هذه المرحلة، مع إبقاء مسارات التخطيط والتفريغ خارج النطاق كما هي.
 */
function createVesselsRoutes({
    db,
    requireRoles,
    normalizeMysqlDateTime,
    normalizeDischargePriority,
    normalizeContainerCondition,
    normalizeContainerWeight,
    normalizeCargoType,
    normalizeContainerDestination,
    normalizeStoredCode,
    mapIncomingVesselRow,
    mapDischargePlanRow,
    mapDischargeTaskRow,
    assignSmartContainerDestinations,
    resolveEntityCode,
    findCodeConflict
}) {
    const router = express.Router();
    const vesselsService = createVesselsService({
        resolveEntityCode,
        normalizeStoredCode,
        findCodeConflict
    });

    /**
     * الغرض: جلب قائمة البواخر الواصلة مع عدد الحاويات المرتبطة بكل باخرة وآخر خطة تفريغ ومهامها إن وجدت.
     * المدخلات: req غير مستخدم وظيفيًا داخل handler، وres لإرجاع قائمة البواخر أو رسالة الخطأ.
     * المخرجات: يعيد JSON يحوي `{ success, vessels }` بنفس الشكل الحالي المستخدم في الواجهة.
     * الآثار الجانبية: ينفذ عدة استعلامات قراءة على incoming_vessels وincoming_vessel_containers وخطط ومهام التفريغ، ويكتب الأخطاء إلى console.error عند الفشل.
     * ملاحظات: يحافظ على نفس منطق تحميل أحدث خطة لكل باخرة وربط المهام بها دون أي تعديل سلوكي.
     */
    function getReceptionVesselsHandler(req, res) {
        const query = `
            SELECT
                v.vessel_id,
                v.vessel_name,
                v.voyage_reference,
                v.expected_arrival,
                v.proposed_berth,
                v.arrival_source,
                v.expected_container_count,
                v.arrival_shortage_reason,
                v.cargo_type,
                v.discharge_priority,
                v.notes,
                v.status,
                v.created_by_email,
                v.created_at,
                v.updated_at,
                COUNT(c.id) AS received_container_count
            FROM incoming_vessels v
            LEFT JOIN incoming_vessel_containers c ON c.vessel_id = v.vessel_id
            GROUP BY
                v.vessel_id,
                v.vessel_name,
                v.voyage_reference,
                v.expected_arrival,
                v.proposed_berth,
                v.arrival_source,
                v.expected_container_count,
                v.arrival_shortage_reason,
                v.cargo_type,
                v.discharge_priority,
                v.notes,
                v.status,
                v.created_by_email,
                v.created_at,
                v.updated_at
            ORDER BY
                v.created_at DESC,
                v.vessel_id DESC
        `;

        db.query(query, (queryErr, results) => {
            if (queryErr) {
                console.error('Error fetching incoming vessels list:', queryErr);
                return res.status(500).json({ success: false, message: 'تعذر تحميل قائمة البواخر.' });
            }

            const vessels = results.map(mapIncomingVesselRow);
            if (!vessels.length) {
                return res.status(200).json({ success: true, vessels: [] });
            }

            const vesselIds = vessels.map((vessel) => vessel.id);
            const placeholders = vesselIds.map(() => '?').join(', ');
            const plansQuery = `
                SELECT p.*
                FROM incoming_vessel_discharge_plans p
                INNER JOIN (
                    SELECT vessel_id, MAX(plan_id) AS latest_plan_id
                    FROM incoming_vessel_discharge_plans
                    WHERE vessel_id IN (${placeholders})
                    GROUP BY vessel_id
                ) latest ON latest.latest_plan_id = p.plan_id
                ORDER BY p.plan_id DESC
            `;

            db.query(plansQuery, vesselIds, (plansErr, planResults) => {
                if (plansErr) {
                    console.error('Error fetching discharge plans list:', plansErr);
                    return res.status(500).json({ success: false, message: 'تعذر تحميل خطط التفريغ.' });
                }

                const plansByVesselId = planResults.reduce((accumulator, planRow) => {
                    accumulator[planRow.vessel_id] = mapDischargePlanRow(planRow);
                    return accumulator;
                }, {});

                const planIds = planResults.map((plan) => plan.plan_id);
                if (!planIds.length) {
                    return res.status(200).json({
                        success: true,
                        vessels: vessels.map((vessel) => ({
                            ...vessel,
                            currentPlan: null,
                            tasks: []
                        }))
                    });
                }

                const taskPlaceholders = planIds.map(() => '?').join(', ');
                const tasksQuery = `
                    SELECT
                        task_id,
                        plan_id,
                        vessel_id,
                        container_id,
                        container_number,
                        destination_type,
                        initial_drop_location,
                        final_location,
                        driver_user_id,
                        driver_name_snapshot,
                        driver_response_status,
                        driver_response_note,
                        driver_responded_at,
                        machine_id,
                        machine_name_snapshot,
                        task_order,
                        status,
                        actual_unloaded_at,
                        actual_driver_name,
                        actual_machine_name
                    FROM incoming_vessel_discharge_tasks
                    WHERE plan_id IN (${taskPlaceholders})
                    ORDER BY task_order ASC, task_id ASC
                `;

                db.query(tasksQuery, planIds, (tasksErr, taskResults) => {
                    if (tasksErr) {
                        console.error('Error fetching discharge tasks list:', tasksErr);
                        return res.status(500).json({ success: false, message: 'تعذر تحميل مهام التفريغ.' });
                    }

                    const tasksByPlanId = taskResults.reduce((accumulator, taskRow) => {
                        const planId = taskRow.plan_id;
                        if (!accumulator[planId]) {
                            accumulator[planId] = [];
                        }

                        accumulator[planId].push(mapDischargeTaskRow(taskRow));
                        return accumulator;
                    }, {});

                    return res.status(200).json({
                        success: true,
                        vessels: vessels.map((vessel) => {
                            const currentPlan = plansByVesselId[vessel.id] || null;
                            return {
                                ...vessel,
                                currentPlan,
                                tasks: currentPlan ? (tasksByPlanId[currentPlan.id] || []) : []
                            };
                        })
                    });
                });
            });
        });
    }

    /**
     * الغرض: تسجيل باخرة جديدة بحالة قيد الوصول مع بياناتها الأساسية كما هي مطلوبة حاليًا.
     * المدخلات: req.body ويحتوي على vesselName وvoyageReference وexpectedArrival وarrivalSource وexpectedContainerCount وdischargePriority وnotes، وreq.authSession.email لتسجيل المنشئ.
     * المخرجات: يعيد JSON بنتيجة الإنشاء مع بيانات الباخرة الجديدة أو معرفها عند نجاح القراءة الجزئية.
     * الآثار الجانبية: ينفذ INSERT في جدول incoming_vessels ثم يقرأ السجل الجديد، ويكتب الأخطاء إلى console.error عند الفشل.
     * ملاحظات: يحافظ على نفس التحقق الحالي وعلى نفس الحالة الابتدائية `arriving` دون أي تغيير.
     */
    function createReceptionVesselHandler(req, res) {
        const vesselName = String(req.body.vesselName || '').trim();
        const voyageReference = String(req.body.voyageReference || '').trim().toUpperCase();
        const expectedArrival = normalizeMysqlDateTime(req.body.expectedArrival);
        const arrivalSource = String(req.body.arrivalSource || '').trim() || null;
        const expectedContainerCount = Math.max(0, Number.parseInt(req.body.expectedContainerCount, 10) || 0);
        const cargoType = null;
        const dischargePriority = normalizeDischargePriority(req.body.dischargePriority);
        const notes = String(req.body.notes || '').trim() || null;

        if (!vesselName || !voyageReference || !expectedArrival || !dischargePriority) {
            return res.status(400).json({
                success: false,
                message: 'يرجى تعبئة اسم الباخرة ورقم الرحلة أو IMO ووقت الوصول المتوقع وأولوية التفريغ.'
            });
        }

        const insertQuery = `
            INSERT INTO incoming_vessels (
                vessel_name,
                voyage_reference,
                expected_arrival,
                proposed_berth,
                arrival_source,
                expected_container_count,
                cargo_type,
                discharge_priority,
                notes,
                status,
                created_by_email
            )
            VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, 'arriving', ?)
        `;

        db.query(
            insertQuery,
            [
                vesselName,
                voyageReference,
                expectedArrival,
                arrivalSource,
                expectedContainerCount,
                cargoType,
                dischargePriority,
                notes,
                req.authSession.email
            ],
            (insertErr, insertResult) => {
                if (insertErr) {
                    console.error('Error creating incoming vessel:', insertErr);
                    return res.status(500).json({ success: false, message: 'تعذر حفظ الباخرة الواصلة.' });
                }

                const readQuery = `
                    SELECT
                        vessel_id,
                        vessel_name,
                        voyage_reference,
                        expected_arrival,
                        proposed_berth,
                        arrival_source,
                        expected_container_count,
                        cargo_type,
                        discharge_priority,
                        notes,
                        status,
                        created_by_email,
                        created_at,
                        updated_at,
                        0 AS received_container_count
                    FROM incoming_vessels
                    WHERE vessel_id = ?
                    LIMIT 1
                `;

                db.query(readQuery, [insertResult.insertId], (readErr, results) => {
                    if (readErr) {
                        console.error('Error reading created incoming vessel:', readErr);
                        return res.status(201).json({
                            success: true,
                            message: `تم تسجيل الباخرة ${vesselName} بحالة قيد الوصول.`,
                            vessel: { id: insertResult.insertId }
                        });
                    }

                    return res.status(201).json({
                        success: true,
                        message: `تم تسجيل الباخرة ${vesselName} بحالة قيد الوصول.`,
                        vessel: results.length ? mapIncomingVesselRow(results[0]) : { id: insertResult.insertId }
                    });
                });
            }
        );
    }

    /**
     * الغرض: ربط مجموعة حاويات بباخرة موجودة بعد التحقق من البيانات ومنع التكرار وتطبيق التوزيع التلقائي عند الحاجة.
     * المدخلات: req.params.vesselId لتحديد الباخرة، وreq.body.containers كمصفوفة بيانات الحاويات، وres لإرجاع نتيجة الربط.
     * المخرجات: يعيد JSON بنتيجة العملية أو رسالة خطأ مطابقة للسلوك الحالي.
     * الآثار الجانبية: ينفذ قراءات تحقق ثم beginTransaction ثم INSERT في incoming_vessel_containers ثم UPDATE لحالة الباخرة ثم commit أو rollback.
     * ملاحظات: يحافظ على نفس منطق التطبيع والتحقق ورسائل الأخطاء ومنطق التوزيع الذكي كما هو.
     */
    function addReceptionVesselContainersHandler(req, res) {
        const vesselId = Number(req.params.vesselId);
        const containers = Array.isArray(req.body.containers) ? req.body.containers : [];

        if (!vesselId || !containers.length) {
            return res.status(400).json({ success: false, message: 'يرجى اختيار الباخرة وإضافة حاوية واحدة على الأقل.' });
        }

        const seenContainerNumbers = new Set();
        const normalizedContainers = [];

        for (let index = 0; index < containers.length; index += 1) {
            const row = containers[index] || {};
            const rowNumber = index + 1;
            const containerNumber = String(row.containerNumber || '').trim().toUpperCase();
            const containerType = String(row.containerType || '').trim() || null;
            const containerSize = String(row.containerSize || '').trim();
            const containerCondition = normalizeContainerCondition(row.containerCondition);
            const ownerName = String(row.ownerName || '').trim() || null;
            const containerWeight = normalizeContainerWeight(row.containerWeight);
            const cargoType = normalizeCargoType(row.cargoType);
            const contents = String(row.contents || '').trim() || null;
            const destinationType = normalizeContainerDestination(row.destinationType);

            if (!containerNumber || !containerSize || !containerCondition || !ownerName || containerWeight === null) {
                return res.status(400).json({
                    success: false,
                    message: `بيانات الحاوية في الصف ${rowNumber} غير مكتملة.`
                });
            }

            if (!['20', '40'].includes(containerSize)) {
                return res.status(400).json({
                    success: false,
                    message: `حجم الحاوية في الصف ${rowNumber} يجب أن يكون 20 أو 40 قدم.`
                });
            }

            if (String(row.cargoType || '').trim() && !cargoType) {
                return res.status(400).json({
                    success: false,
                    message: `نوع الحمولة في الصف ${rowNumber} غير صالح.`
                });
            }

            if (seenContainerNumbers.has(containerNumber)) {
                return res.status(409).json({
                    success: false,
                    message: `رقم الحاوية ${containerNumber} مكرر داخل النموذج.`
                });
            }

            seenContainerNumbers.add(containerNumber);
            normalizedContainers.push({
                vesselId,
                containerNumber,
                containerType,
                containerSize,
                containerCondition,
                ownerName,
                containerWeight,
                cargoType,
                contents,
                destinationType,
                destinationIsAuto: !destinationType,
                dischargePriority: 'normal',
                status: 'arrived'
            });
        }

        const vesselQuery = `
            SELECT vessel_id, vessel_name, status
            FROM incoming_vessels
            WHERE vessel_id = ?
            LIMIT 1
        `;

        db.query(vesselQuery, [vesselId], (vesselErr, vesselResults) => {
            if (vesselErr) {
                console.error('Error loading vessel for reception containers:', vesselErr);
                return res.status(500).json({ success: false, message: 'تعذر تحميل بيانات الباخرة.' });
            }

            if (!vesselResults.length) {
                return res.status(404).json({ success: false, message: 'الباخرة المحددة غير موجودة.' });
            }

            const vessel = vesselResults[0];
            if (!['arriving', 'containers_added'].includes(vessel.status)) {
                return res.status(409).json({ success: false, message: 'لا يمكن إضافة حاويات لهذه الباخرة في حالتها الحالية.' });
            }

            const duplicatePlaceholders = normalizedContainers.map(() => '?').join(', ');
            const duplicateQuery = `
                SELECT container_number
                FROM incoming_vessel_containers
                WHERE UPPER(container_number) IN (${duplicatePlaceholders})
            `;

            db.query(
                duplicateQuery,
                [...normalizedContainers.map((row) => row.containerNumber)],
                (duplicateErr, duplicateResults) => {
                    if (duplicateErr) {
                        console.error('Error checking duplicate vessel containers:', duplicateErr);
                        return res.status(500).json({ success: false, message: 'تعذر التحقق من أرقام الحاويات.' });
                    }

                    if (duplicateResults.length) {
                        return res.status(409).json({
                            success: false,
                            message: `رقم الحاوية ${duplicateResults[0].container_number} مسجل مسبقاً في النظام ولا يمكن تكراره.`
                        });
                    }

                    const autoAssignedCount = normalizedContainers.filter((container) => !container.destinationType).length;
                    assignSmartContainerDestinations(normalizedContainers, (assignmentErr, resolvedContainers) => {
                        if (assignmentErr) {
                            if (assignmentErr.message === 'NO_AVAILABLE_AUTO_BERTH') {
                                return res.status(409).json({
                                    success: false,
                                    message: 'لا توجد أرصفة تخزين فارغة حاليًا لتطبيق التوزيع التلقائي.'
                                });
                            }

                            console.error('Error assigning smart container destinations:', assignmentErr);
                            return res.status(500).json({ success: false, message: 'تعذر تحديد وجهة الحاويات تلقائيًا.' });
                        }

                        const insertValues = resolvedContainers.map((container) => [
                            container.vesselId,
                            container.containerNumber,
                            container.containerType,
                            container.containerSize,
                            container.containerCondition,
                            container.ownerName,
                            container.containerWeight,
                            container.cargoType,
                            container.contents,
                            container.destinationType,
                            Number(Boolean(container.destinationIsAuto)),
                            container.dischargePriority,
                            container.status
                        ]);

                        db.beginTransaction((transactionErr) => {
                            if (transactionErr) {
                                console.error('Error starting vessel containers transaction:', transactionErr);
                                return res.status(500).json({ success: false, message: 'تعذر بدء حفظ الحاويات.' });
                            }

                            db.query(
                                `
                                    INSERT INTO incoming_vessel_containers (
                                        vessel_id,
                                        container_number,
                                        container_type,
                                        container_size,
                                        container_condition,
                                        owner_name,
                                        container_weight,
                                        cargo_type,
                                        contents,
                                        destination_type,
                                        destination_is_auto,
                                        discharge_priority,
                                        status
                                    )
                                    VALUES ?
                                `,
                                [insertValues],
                                (insertErr) => {
                                    if (insertErr) {
                                        return db.rollback(() => {
                                            console.error('Error inserting vessel containers:', insertErr);
                                            return res.status(500).json({ success: false, message: 'تعذر حفظ حاويات الباخرة.' });
                                        });
                                    }

                                    db.query(
                                        `
                                            UPDATE incoming_vessels
                                            SET status = 'containers_added'
                                            WHERE vessel_id = ?
                                        `,
                                        [vesselId],
                                        (updateErr) => {
                                            if (updateErr) {
                                                return db.rollback(() => {
                                                    console.error('Error updating vessel status after containers insert:', updateErr);
                                                    return res.status(500).json({ success: false, message: 'تم حفظ بعض البيانات لكن تعذر تحديث حالة الباخرة.' });
                                                });
                                            }

                                            db.commit((commitErr) => {
                                                if (commitErr) {
                                                    return db.rollback(() => {
                                                        console.error('Error committing vessel containers transaction:', commitErr);
                                                        return res.status(500).json({ success: false, message: 'تعذر إتمام حفظ حاويات الباخرة.' });
                                                    });
                                                }

                                                const autoAssignmentSuffix = autoAssignedCount > 0
                                                    ? ` وتم توزيع ${autoAssignedCount} حاوية تلقائياً على الأرصفة الأقل إشغالاً.`
                                                    : '';

                                                return res.status(201).json({
                                                    success: true,
                                                    message: `تم ربط ${resolvedContainers.length} حاوية بالباخرة ${vessel.vessel_name} وتحديث حالتها إلى واصلة.${autoAssignmentSuffix}`
                                                });
                                            });
                                        }
                                    );
                                }
                            );
                        });
                    });
                }
            );
        });
    }

    /**
     * الغرض: توليد رقم حاوية جديد تلقائيًا باستخدام نفس آلية الأكواد الحالية.
     * المدخلات: req غير مستخدم وظيفيًا هنا، وres لإرجاع الكود المولد أو رسالة الخطأ.
     * المخرجات: يعيد JSON يحوي `{ success, code }` أو رسالة خطأ مطابقة للسلوك الحالي.
     * الآثار الجانبية: ينفذ قراءة على قاعدة البيانات عبر resolveEntityCode لتحديد التسلسل التالي.
     * ملاحظات: يحافظ على نفس الـ prefix الحالي `CNT` ونفس جدول وأعمدة البحث.
     */
    function getReceptionContainerCodeHandler(req, res) {
        vesselsService.getReceptionContainerCode((serviceResponse) => {
            return res.status(serviceResponse.statusCode).json(serviceResponse.body);
        });
    }

    /**
     * الغرض: التحقق مما إذا كان رقم الحاوية المقترح موجودًا مسبقًا في النظام بعد تطبيع قيمته.
     * المدخلات: req.query.code لرقم الحاوية المراد التحقق منه، وres لإرجاع نتيجة الفحص.
     * المخرجات: يعيد JSON يحوي `{ success, code, exists }` أو رسالة خطأ مطابقة للسلوك الحالي.
     * الآثار الجانبية: ينفذ قراءة تحقق على جدول incoming_vessel_containers ويكتب الأخطاء إلى console.error عند الفشل.
     * ملاحظات: يحافظ على نفس أسلوب التطبيع الحالي عبر normalizeStoredCode ونفس منطق المقارنة.
     */
    function checkReceptionContainerCodeHandler(req, res) {
        vesselsService.checkReceptionContainerCode(req.query.code, (serviceResponse) => {
            return res.status(serviceResponse.statusCode).json(serviceResponse.body);
        });
    }

    /**
     * الغرض: حفظ سبب فرق عدد الحاويات الواصلة لباخرة محددة عند وجود عجز أو زيادة مقارنة بالعدد المتوقع.
     * المدخلات: req.params.vesselId لتحديد الباخرة، وreq.body.reason لسبب الفرق، وres لإرجاع نتيجة الحفظ.
     * المخرجات: يعيد JSON بنتيجة الحفظ أو رسالة خطأ مطابقة للسلوك الحالي.
     * الآثار الجانبية: ينفذ قراءة لحساب الفرق ثم UPDATE على جدول incoming_vessels لحفظ arrival_shortage_reason.
     * ملاحظات: يحافظ على نفس منطق التفريق بين العجز والزيادة ونفس الرسائل العربية الحالية.
     */
    function saveArrivalShortageReasonHandler(req, res) {
        const vesselId = Number(req.params.vesselId);
        const shortageReason = String(req.body.reason || '').trim();

        if (!vesselId) {
            return res.status(400).json({ success: false, message: 'معرف الباخرة غير صالح.' });
        }

        const vesselQuery = `
            SELECT
                v.vessel_id,
                v.vessel_name,
                v.expected_container_count,
                COUNT(c.id) AS received_container_count
            FROM incoming_vessels v
            LEFT JOIN incoming_vessel_containers c ON c.vessel_id = v.vessel_id
            WHERE v.vessel_id = ?
            GROUP BY v.vessel_id, v.vessel_name, v.expected_container_count
            LIMIT 1
        `;

        db.query(vesselQuery, [vesselId], (vesselErr, vesselResults) => {
            if (vesselErr) {
                console.error('Error loading vessel for shortage reason update:', vesselErr);
                return res.status(500).json({ success: false, message: 'تعذر تحميل بيانات الباخرة.' });
            }

            if (!vesselResults.length) {
                return res.status(404).json({ success: false, message: 'الباخرة المحددة غير موجودة.' });
            }

            const vessel = vesselResults[0];
            const expectedCount = Number(vessel.expected_container_count || 0);
            const receivedCount = Number(vessel.received_container_count || 0);
            const hasShortage = receivedCount < expectedCount;
            const hasExtra = receivedCount > expectedCount;

            if (!hasShortage && !hasExtra) {
                return res.status(409).json({ success: false, message: 'يمكن إضافة سبب فقط عند وجود فرق بين عدد الحاويات المتوقع والمسجل.' });
            }

            if (!shortageReason) {
                return res.status(400).json({
                    success: false,
                    message: hasExtra ? 'يرجى كتابة سبب الحاويات الزائدة.' : 'يرجى كتابة سبب الحاويات التي لم تصل.'
                });
            }

            db.query(
                `
                    UPDATE incoming_vessels
                    SET arrival_shortage_reason = ?
                    WHERE vessel_id = ?
                `,
                [shortageReason, vesselId],
                (updateErr) => {
                    if (updateErr) {
                        console.error('Error updating vessel shortage reason:', updateErr);
                        return res.status(500).json({ success: false, message: 'تعذر حفظ سبب عدم الوصول.' });
                    }

                    return res.status(200).json({
                        success: true,
                        message: hasExtra
                            ? `تم حفظ سبب الحاويات الزائدة للباخرة ${vessel.vessel_name}.`
                            : `تم حفظ سبب الحاويات التي لم تصل للباخرة ${vessel.vessel_name}.`
                    });
                }
            );
        });
    }

    router.get('/dockmanager/reception/vessels', requireRoles(['dockmanager']), getReceptionVesselsHandler);
    router.post('/dockmanager/reception/vessels', requireRoles(['dockmanager']), createReceptionVesselHandler);
    router.post('/dockmanager/reception/vessels/:vesselId/containers', requireRoles(['dockmanager']), addReceptionVesselContainersHandler);
    router.get('/dockmanager/reception/container-code', requireRoles(['dockmanager']), getReceptionContainerCodeHandler);
    router.get('/dockmanager/reception/container-code/check', requireRoles(['dockmanager']), checkReceptionContainerCodeHandler);
    router.post('/dockmanager/reception/vessels/:vesselId/arrival-shortage-reason', requireRoles(['dockmanager']), saveArrivalShortageReasonHandler);

    return router;
}

module.exports = {
    createVesselsRoutes
};
