/**
 * مسؤولية الملف: تجميع مسارات خطط التفريغ وتشغيلها المطلوبة في هذه المرحلة داخل Router مستقل مع الحفاظ على نفس منطق العمل الحالي.
 * ملاحظات: يعتمد هذا الملف على الاعتماديات الممررة من app.js مثل db وrequireRoles وHelpers التفريغ والسائقين والمعدات، دون إعادة تصميم أعمق للبنية.
 */

const express = require('express');

/**
 * الغرض: إنشاء Router خاص بمسارات خطط التفريغ وتشغيلها وربطه بالاعتماديات اللازمة.
 * المدخلات: كائن dependencies ويحتوي على db وrequireRoles وHelpers القراءة والتحديث والتحقق اللازمة لهذه المسارات.
 * المخرجات: يعيد كائن Express Router جاهزًا للربط داخل app.js على المسار `/api`.
 * الآثار الجانبية: ينشئ handlers تنفذ قراءات وتحديثات ومعاملات على جداول خطط ومهام التفريغ والحاويات والبواخر والسائقين والمعدات.
 * ملاحظات: تم نقل المسارات المطلوبة فقط في هذه المرحلة مع الحفاظ على منطق الـ transactions والتسلسل الحالي للعمليات دون تغيير.
 */
function createDischargeRoutes({
    db,
    requireRoles,
    getReadyMachines,
    getActiveWarehouse,
    getPriorityRank,
    getDestinationRank,
    getUsersIdColumn,
    reassignAutoContainerDestinations,
    allocateDockSlotForContainer,
    getDefaultFinalLocation,
    getDockBerthKeyFromDestination,
    getContainerCompletionStatus,
    getCurrentUserByEmail,
    getAvailableDockDrivers,
    mapDischargeTaskRow
}) {
    const router = express.Router();

    /**
     * الغرض: توليد خطة تفريغ جديدة لباخرة محددة بعد التحقق من حالة الباخرة والحاويات وربط المعدات المتاحة كما هو معمول به حاليًا.
     * المدخلات: req.params.vesselId لتحديد الباخرة، وreq.authSession.email لتسجيل المستخدم الذي ولد الخطة، وres لإرجاع نتيجة العملية.
     * المخرجات: يعيد JSON بنتيجة توليد الخطة أو رسالة خطأ مطابقة للسلوك الحالي.
     * الآثار الجانبية: ينفذ قراءات تحقق ثم beginTransaction ثم يلغي مسودات سابقة ويضيف خطة ومهام تفريغ ويحدّث حالات الحاويات والباخرة ثم commit أو rollback.
     * ملاحظات: يحافظ على نفس منطق الترتيب بحسب الأولوية والوجهة ونفس رسائل التحقق الخاصة بفروق عدد الحاويات وأسباب النقص أو الزيادة.
     */
    function generateDischargePlanHandler(req, res) {
        const vesselId = Number(req.params.vesselId);

        if (!vesselId) {
            return res.status(400).json({ success: false, message: 'معرف الباخرة غير صالح.' });
        }

        const vesselQuery = `
            SELECT
                v.vessel_id,
                v.vessel_name,
                v.proposed_berth,
                v.arrival_source,
                v.status,
                v.expected_container_count,
                v.arrival_shortage_reason,
                COUNT(c.id) AS received_container_count
            FROM incoming_vessels v
            LEFT JOIN incoming_vessel_containers c ON c.vessel_id = v.vessel_id
            WHERE v.vessel_id = ?
            GROUP BY
                v.vessel_id,
                v.vessel_name,
                v.proposed_berth,
                v.arrival_source,
                v.status,
                v.expected_container_count,
                v.arrival_shortage_reason
            LIMIT 1
        `;

        db.query(vesselQuery, [vesselId], (vesselErr, vesselResults) => {
            if (vesselErr) {
                console.error('Error loading vessel for plan generation:', vesselErr);
                return res.status(500).json({ success: false, message: 'تعذر تحميل بيانات الباخرة.' });
            }

            if (!vesselResults.length) {
                return res.status(404).json({ success: false, message: 'الباخرة المحددة غير موجودة.' });
            }

            const vessel = vesselResults[0];
            if (['discharging', 'completed', 'cancelled'].includes(vessel.status)) {
                return res.status(409).json({ success: false, message: 'لا يمكن توليد خطة جديدة لهذه الباخرة في حالتها الحالية.' });
            }

            const expectedCount = Number(vessel.expected_container_count || 0);
            const receivedCount = Number(vessel.received_container_count || 0);
            const shortageReason = String(vessel.arrival_shortage_reason || '').trim();
            const hasDiscrepancy = receivedCount !== expectedCount;
            const hasExtra = receivedCount > expectedCount;

            if (hasDiscrepancy && !shortageReason) {
                return res.status(409).json({
                    success: false,
                    message: hasExtra
                        ? 'أضف سبب الحاويات الزائدة أولاً قبل توليد خطة التفريغ.'
                        : 'أضف سبب الحاويات التي لم تصل أولاً قبل توليد خطة التفريغ.'
                });
            }

            const containersQuery = `
                SELECT id, container_number, destination_type, destination_is_auto, discharge_priority, status
                FROM incoming_vessel_containers
                WHERE vessel_id = ?
                  AND status IN ('arrived', 'scheduled')
                ORDER BY id ASC
            `;

            db.query(containersQuery, [vesselId], (containersErr, containerResults) => {
                if (containersErr) {
                    console.error('Error loading vessel containers for plan generation:', containersErr);
                    return res.status(500).json({ success: false, message: 'تعذر تحميل حاويات الباخرة.' });
                }

                if (!containerResults.length) {
                    return res.status(400).json({ success: false, message: 'أضف حاويات الباخرة أولاً قبل توليد خطة التفريغ.' });
                }

                getReadyMachines({ ignoreDraftVesselId: vesselId }, (machinesErr, machines) => {
                    if (machinesErr) {
                        console.error('Error loading ready machines:', machinesErr);
                        return res.status(500).json({ success: false, message: 'تعذر تحميل المعدات الجاهزة.' });
                    }

                    getActiveWarehouse((warehouseErr, activeWarehouse) => {
                        if (warehouseErr) {
                            console.error('Error loading active warehouse for plan generation:', warehouseErr);
                            return res.status(500).json({ success: false, message: 'تعذر تحميل بيانات المستودع.' });
                        }

                        const planningContainers = containerResults.map((container) => ({
                            id: container.id,
                            containerNumber: container.container_number,
                            destinationType: container.destination_type,
                            destinationIsAuto: Boolean(container.destination_is_auto),
                            dischargePriority: container.discharge_priority,
                            status: container.status
                        }));

                        return reassignAutoContainerDestinations(planningContainers, (assignmentErr, resolvedContainers) => {
                            if (assignmentErr) {
                                if (assignmentErr.message === 'NO_AVAILABLE_AUTO_BERTH') {
                                    return res.status(409).json({
                                        success: false,
                                        message: 'لا توجد أرصفة تخزين فارغة حاليًا لتطبيق الوجهة التلقائية أثناء توليد خطة التفريغ.'
                                    });
                                }

                                console.error('Error reassigning auto container destinations during plan generation:', assignmentErr);
                                return res.status(500).json({ success: false, message: 'تعذر تحديث الوجهات التلقائية قبل توليد خطة التفريغ.' });
                            }

                            const sortedContainers = [...resolvedContainers].sort((left, right) => {
                                const priorityDiff = getPriorityRank(left.dischargePriority) - getPriorityRank(right.dischargePriority);
                                if (priorityDiff !== 0) {
                                    return priorityDiff;
                                }

                                const destinationDiff = getDestinationRank(left.destinationType) - getDestinationRank(right.destinationType);
                                if (destinationDiff !== 0) {
                                    return destinationDiff;
                                }

                                return String(left.containerNumber).localeCompare(String(right.containerNumber));
                            });

                            const generatedPlanNote = machines.length
                                ? `تم توليد الخطة تلقائيًا باستخدام ${machines.length} معدة بانتظار تعيين السائقين من مدير الآليات.`
                                : 'تم توليد الخطة تلقائيًا دون ربط معدات حاليًا، ويمكن متابعة تشغيلها عند توفر المعدة المناسبة.';

                            const taskRows = sortedContainers.map((container, index) => {
                                const assignedMachine = machines.length ? machines[index % machines.length] : null;
                                const initialDropLocation = String(vessel.vessel_name || '').trim() || 'الباخرة';

                                return [
                                    vesselId,
                                    container.id,
                                    container.containerNumber,
                                    container.destinationType,
                                    initialDropLocation,
                                    initialDropLocation,
                                    null,
                                    null,
                                    assignedMachine?.machine_id || null,
                                    assignedMachine?.machine_name || null,
                                    index + 1,
                                    'planned'
                                ];
                            });

                            const autoContainersToPersist = resolvedContainers.filter((container) => container.destinationIsAuto);

                            void activeWarehouse;

                            db.beginTransaction((transactionErr) => {
                                if (transactionErr) {
                                    console.error('Error starting generate discharge plan transaction:', transactionErr);
                                    return res.status(500).json({ success: false, message: 'تعذر بدء توليد خطة التفريغ.' });
                                }

                                const persistResolvedAutoDestinations = (persistCallback) => {
                                    if (!autoContainersToPersist.length) {
                                        return persistCallback(null);
                                    }

                                    const updates = autoContainersToPersist.map((container) => new Promise((resolve, reject) => {
                                        db.query(
                                            `
                                                UPDATE incoming_vessel_containers
                                                SET destination_type = ?
                                                WHERE id = ?
                                            `,
                                            [container.destinationType, container.id],
                                            (updateErr) => {
                                                if (updateErr) {
                                                    reject(updateErr);
                                                    return;
                                                }

                                                resolve();
                                            }
                                        );
                                    }));

                                    Promise.all(updates)
                                        .then(() => persistCallback(null))
                                        .catch((persistErr) => persistCallback(persistErr));
                                };

                                return persistResolvedAutoDestinations((persistErr) => {
                                    if (persistErr) {
                                        return db.rollback(() => {
                                            console.error('Error persisting auto container destinations before plan generation:', persistErr);
                                            return res.status(500).json({ success: false, message: 'تعذر حفظ الوجهات التلقائية المحدّثة قبل توليد الخطة.' });
                                        });
                                    }

                                    db.query(
                                        `
                                            UPDATE incoming_vessel_discharge_tasks
                                            SET status = 'cancelled'
                                            WHERE vessel_id = ?
                                              AND plan_id IN (
                                                    SELECT plan_id
                                                    FROM incoming_vessel_discharge_plans
                                                    WHERE vessel_id = ?
                                                      AND status = 'draft'
                                              )
                                        `,
                                        [vesselId, vesselId],
                                        (cancelTasksErr) => {
                                            if (cancelTasksErr) {
                                                return db.rollback(() => {
                                                    console.error('Error cancelling previous draft tasks:', cancelTasksErr);
                                                    return res.status(500).json({ success: false, message: 'تعذر تحديث مسودة الخطة السابقة.' });
                                                });
                                            }

                                            db.query(
                                                `
                                                    UPDATE incoming_vessel_discharge_plans
                                                    SET status = 'cancelled'
                                                    WHERE vessel_id = ?
                                                      AND status = 'draft'
                                                `,
                                                [vesselId],
                                                (cancelPlansErr) => {
                                                    if (cancelPlansErr) {
                                                        return db.rollback(() => {
                                                            console.error('Error cancelling previous draft plans:', cancelPlansErr);
                                                            return res.status(500).json({ success: false, message: 'تعذر تحديث خطة التفريغ السابقة.' });
                                                        });
                                                    }

                                                    db.query(
                                                        `
                                                            INSERT INTO incoming_vessel_discharge_plans (
                                                                vessel_id,
                                                                proposed_berth,
                                                                status,
                                                                generated_by_email,
                                                                notes
                                                            )
                                                            VALUES (?, ?, 'draft', ?, ?)
                                                        `,
                                                        [
                                                            vesselId,
                                                            vessel.proposed_berth,
                                                            req.authSession.email,
                                                            generatedPlanNote
                                                        ],
                                                        (planInsertErr, planInsertResult) => {
                                                            if (planInsertErr) {
                                                                return db.rollback(() => {
                                                                    console.error('Error inserting discharge plan:', planInsertErr);
                                                                    return res.status(500).json({ success: false, message: 'تعذر حفظ خطة التفريغ.' });
                                                                });
                                                            }

                                                            const planId = planInsertResult.insertId;
                                                            const taskValues = taskRows.map((row) => [planId, ...row]);

                                                            db.query(
                                                                `
                                                                    INSERT INTO incoming_vessel_discharge_tasks (
                                                                        plan_id,
                                                                        vessel_id,
                                                                        container_id,
                                                                        container_number,
                                                                        destination_type,
                                                                        initial_drop_location,
                                                                        final_location,
                                                                        driver_user_id,
                                                                        driver_name_snapshot,
                                                                        machine_id,
                                                                        machine_name_snapshot,
                                                                        task_order,
                                                                        status
                                                                    )
                                                                    VALUES ?
                                                                `,
                                                                [taskValues],
                                                                (tasksInsertErr) => {
                                                                    if (tasksInsertErr) {
                                                                        return db.rollback(() => {
                                                                            console.error('Error inserting discharge tasks:', tasksInsertErr);
                                                                            return res.status(500).json({ success: false, message: 'تعذر حفظ مهام خطة التفريغ.' });
                                                                        });
                                                                    }

                                                                    db.query(
                                                                        `
                                                                            UPDATE incoming_vessel_containers
                                                                            SET status = 'scheduled'
                                                                            WHERE vessel_id = ?
                                                                              AND id IN (${sortedContainers.map(() => '?').join(', ')})
                                                                        `,
                                                                        [vesselId, ...sortedContainers.map((container) => container.id)],
                                                                        (updateContainersErr) => {
                                                                            if (updateContainersErr) {
                                                                                return db.rollback(() => {
                                                                                    console.error('Error updating containers to scheduled:', updateContainersErr);
                                                                                    return res.status(500).json({ success: false, message: 'تم إنشاء بعض البيانات لكن تعذر تحديث حالة الحاويات.' });
                                                                                });
                                                                            }

                                                                            db.query(
                                                                                `
                                                                                    UPDATE incoming_vessels
                                                                                    SET status = 'discharge_planned'
                                                                                    WHERE vessel_id = ?
                                                                                `,
                                                                                [vesselId],
                                                                                (updateVesselErr) => {
                                                                                    if (updateVesselErr) {
                                                                                        return db.rollback(() => {
                                                                                            console.error('Error updating vessel to discharge planned:', updateVesselErr);
                                                                                            return res.status(500).json({ success: false, message: 'تم إنشاء الخطة لكن تعذر تحديث حالة الباخرة.' });
                                                                                        });
                                                                                    }

                                                                                    return db.commit((commitErr) => {
                                                                                        if (commitErr) {
                                                                                            return db.rollback(() => {
                                                                                                console.error('Error committing discharge plan generation:', commitErr);
                                                                                                return res.status(500).json({ success: false, message: 'تعذر إتمام توليد خطة التفريغ.' });
                                                                                            });
                                                                                        }

                                                                                        return res.status(201).json({
                                                                                            success: true,
                                                                                            message: machines.length
                                                                                                ? `تم توليد خطة تفريغ للباخرة ${vessel.vessel_name} وإرسال مهامها إلى مدير الآليات لتعيين السائقين.`
                                                                                                : `تم توليد خطة تفريغ للباخرة ${vessel.vessel_name} دون ربط معدات حاليًا.`
                                                                                        });
                                                                                    });
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
                            });
                        });

                    });
                });
            });
        });
    }

    /**
     * الغرض: تشغيل خطة تفريغ موجودة بعد التحقق من تعيين السائقين وموافقتهم وتحديث حالات الخطة والمهام والحاويات والسائقين والمعدات.
     * المدخلات: req.params.planId لتحديد الخطة، وres لإرجاع نتيجة التشغيل.
     * المخرجات: يعيد JSON بنتيجة بدء الخطة أو رسالة خطأ مطابقة للسلوك الحالي.
     * الآثار الجانبية: ينفذ beginTransaction ثم يحدّث incoming_vessel_discharge_plans وincoming_vessel_discharge_tasks وincoming_vessel_containers وincoming_vessels وUsers وMachines ثم commit أو rollback.
     * ملاحظات: يحافظ على نفس شروط التحقق الحالية قبل البدء، خصوصًا تعيين سائق لكل مهمة وموافقة جميع السائقين.
     */
    function startDischargePlanHandler(req, res) {
        const planId = Number(req.params.planId);

        if (!planId) {
            return res.status(400).json({ success: false, message: 'معرف الخطة غير صالح.' });
        }

        const planQuery = `
            SELECT plan_id, vessel_id, status
            FROM incoming_vessel_discharge_plans
            WHERE plan_id = ?
            LIMIT 1
        `;

        db.query(planQuery, [planId], (planErr, planResults) => {
            if (planErr) {
                console.error('Error loading plan for start:', planErr);
                return res.status(500).json({ success: false, message: 'تعذر تحميل خطة التفريغ.' });
            }

            if (!planResults.length) {
                return res.status(404).json({ success: false, message: 'خطة التفريغ غير موجودة.' });
            }

            const plan = planResults[0];
            if (plan.status !== 'draft') {
                return res.status(409).json({ success: false, message: 'لا يمكن بدء التنزيل إلا من خطة بحالة مسودة.' });
            }

            const tasksQuery = `
                SELECT task_id, container_id, driver_user_id, machine_id, driver_response_status
                FROM incoming_vessel_discharge_tasks
                WHERE plan_id = ?
                  AND status = 'planned'
            `;

            db.query(tasksQuery, [planId], (tasksErr, taskResults) => {
                if (tasksErr) {
                    console.error('Error loading plan tasks for start:', tasksErr);
                    return res.status(500).json({ success: false, message: 'تعذر تحميل مهام الخطة.' });
                }

                if (!taskResults.length) {
                    return res.status(400).json({ success: false, message: 'لا توجد مهام مجدولة داخل هذه الخطة.' });
                }

                const unassignedTasksCount = taskResults.filter((task) => !task.driver_user_id).length;
                if (unassignedTasksCount > 0) {
                    return res.status(409).json({ success: false, message: 'لا يمكن بدء التنزيل قبل أن يعيّن مدير الآليات سائقاً لكل المهام.' });
                }

                const unacceptedTasksCount = taskResults.filter((task) => String(task.driver_response_status || 'pending') !== 'accepted').length;
                if (unacceptedTasksCount > 0) {
                    return res.status(409).json({ success: false, message: 'لا يمكن بدء التنزيل قبل أن يوافق كل سائق على مهمته.' });
                }

                const uniqueDriverIds = [...new Set(taskResults.map((task) => task.driver_user_id).filter(Boolean))];
                const uniqueMachineIds = [...new Set(taskResults.map((task) => task.machine_id).filter(Boolean))];
                const containerIds = taskResults.map((task) => task.container_id);

                getUsersIdColumn((columnErr, userIdColumn) => {
                    if (columnErr) {
                        return res.status(500).json({ success: false, message: 'تعذر قراءة بيانات السائقين.' });
                    }

                    db.beginTransaction((transactionErr) => {
                        if (transactionErr) {
                            console.error('Error starting discharge plan activation transaction:', transactionErr);
                            return res.status(500).json({ success: false, message: 'تعذر بدء تشغيل خطة التفريغ.' });
                        }

                        db.query(
                            `
                                UPDATE incoming_vessel_discharge_plans
                                SET status = 'active', started_at = NOW()
                                WHERE plan_id = ?
                            `,
                            [planId],
                            (updatePlanErr) => {
                                if (updatePlanErr) {
                                    return db.rollback(() => {
                                        console.error('Error updating discharge plan to active:', updatePlanErr);
                                        return res.status(500).json({ success: false, message: 'تعذر تحديث حالة خطة التفريغ.' });
                                    });
                                }

                                db.query(
                                    `
                                        UPDATE incoming_vessel_discharge_tasks
                                        SET status = 'in_progress'
                                        WHERE plan_id = ?
                                          AND status = 'planned'
                                    `,
                                    [planId],
                                    (updateTasksErr) => {
                                        if (updateTasksErr) {
                                            return db.rollback(() => {
                                                console.error('Error updating discharge tasks to in progress:', updateTasksErr);
                                                return res.status(500).json({ success: false, message: 'تعذر تحديث مهام التنزيل.' });
                                            });
                                        }

                                        db.query(
                                            `
                                                UPDATE incoming_vessel_containers
                                                SET status = 'discharging'
                                                WHERE id IN (${containerIds.map(() => '?').join(', ')})
                                            `,
                                            containerIds,
                                            (updateContainersErr) => {
                                                if (updateContainersErr) {
                                                    return db.rollback(() => {
                                                        console.error('Error updating containers to discharging:', updateContainersErr);
                                                        return res.status(500).json({ success: false, message: 'تعذر تحديث حالة الحاويات المجدولة.' });
                                                    });
                                                }

                                                db.query(
                                                    `
                                                        UPDATE incoming_vessels
                                                        SET status = 'discharging'
                                                        WHERE vessel_id = ?
                                                    `,
                                                    [plan.vessel_id],
                                                    (updateVesselErr) => {
                                                        if (updateVesselErr) {
                                                            return db.rollback(() => {
                                                                console.error('Error updating vessel to discharging:', updateVesselErr);
                                                                return res.status(500).json({ success: false, message: 'تعذر تحديث حالة الباخرة.' });
                                                            });
                                                        }

                                                        const updateDriversQuery = uniqueDriverIds.length
                                                            ? `
                                                                UPDATE Users
                                                                SET availability_status = 'مشغول'
                                                                WHERE ${userIdColumn} IN (${uniqueDriverIds.map(() => '?').join(', ')})
                                                            `
                                                            : null;

                                                        const updateDrivers = (callback) => {
                                                            if (!updateDriversQuery) {
                                                                return callback(null);
                                                            }

                                                            db.query(updateDriversQuery, uniqueDriverIds, callback);
                                                        };

                                                        updateDrivers((driversUpdateErr) => {
                                                            if (driversUpdateErr) {
                                                                return db.rollback(() => {
                                                                    console.error('Error updating drivers to busy:', driversUpdateErr);
                                                                    return res.status(500).json({ success: false, message: 'تعذر تحديث حالة السائقين.' });
                                                                });
                                                            }

                                                            const updateMachinesQuery = uniqueMachineIds.length
                                                                ? `
                                                                    UPDATE Machines
                                                                    SET status = 'في الخدمة'
                                                                    WHERE machine_id IN (${uniqueMachineIds.map(() => '?').join(', ')})
                                                                `
                                                                : null;

                                                            const updateMachines = (callback) => {
                                                                if (!updateMachinesQuery) {
                                                                    return callback(null);
                                                                }

                                                                db.query(updateMachinesQuery, uniqueMachineIds, callback);
                                                            };

                                                            updateMachines((machinesUpdateErr) => {
                                                                if (machinesUpdateErr) {
                                                                    return db.rollback(() => {
                                                                        console.error('Error updating machines to in service:', machinesUpdateErr);
                                                                        return res.status(500).json({ success: false, message: 'تعذر تحديث حالة المعدات.' });
                                                                    });
                                                                }

                                                                db.commit((commitErr) => {
                                                                    if (commitErr) {
                                                                        return db.rollback(() => {
                                                                            console.error('Error committing discharge plan activation:', commitErr);
                                                                            return res.status(500).json({ success: false, message: 'تعذر إتمام بدء التنزيل.' });
                                                                        });
                                                                    }

                                                                    return res.status(200).json({
                                                                        success: true,
                                                                        message: 'تم بدء التنزيل وتحديث حالات الباخرة والحاويات والسائقين والمعدات.'
                                                                    });
                                                                });
                                                            });
                                                        });
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
            });
        });
    }

    /**
     * الغرض: تأكيد اكتمال مهمة تفريغ حاوية من طرف السائق أو مدير الرصيف مع تحديث الحاوية والخطة والباخرة والسائق والمعدة حسب التسلسل الحالي.
     * المدخلات: req.params.taskId لتحديد المهمة، وreq.body.finalLocation للموقع النهائي عند الحاجة، وreq.authSession.role وreq.authSession.email لتحديد مسار التنفيذ، وres لإرجاع النتيجة.
     * المخرجات: يعيد JSON بنتيجة تسجيل الإنجاز أو التأكيد النهائي أو رسالة خطأ مطابقة للسلوك الحالي.
     * الآثار الجانبية: قد ينفذ تحديثًا أوليًا لرد السائق فقط، أو beginTransaction كاملًا يحدّث مهام التفريغ والحاويات والخطة والباخرة وحالات السائق والمعدة ثم commit أو rollback.
     * ملاحظات: يحافظ على نفس التفريق الحالي بين دور السائق ودور مدير الرصيف، وعلى نفس منطق تخصيص خانة الرصيف عند الوجهات المرتبطة ببرثات التخزين.
     */
    function completeDischargeTaskHandler(req, res) {
        const taskId = Number(req.params.taskId);
        const finalLocation = String(req.body.finalLocation || '').trim();

        if (!taskId) {
            return res.status(400).json({ success: false, message: 'معرف المهمة غير صالح.' });
        }

        const taskQuery = `
            SELECT
                t.task_id,
                t.plan_id,
                t.vessel_id,
                t.container_id,
                t.container_number,
                t.destination_type,
                t.initial_drop_location,
                t.driver_user_id,
                t.driver_name_snapshot,
                t.driver_response_status,
                t.machine_id,
                t.machine_name_snapshot,
                c.container_type,
                c.owner_name,
                t.status AS task_status,
                p.status AS plan_status
            FROM incoming_vessel_discharge_tasks t
            JOIN incoming_vessel_discharge_plans p ON p.plan_id = t.plan_id
            JOIN incoming_vessel_containers c ON c.id = t.container_id
            WHERE t.task_id = ?
            LIMIT 1
        `;

        db.query(taskQuery, [taskId], (taskErr, taskResults) => {
            if (taskErr) {
                console.error('Error loading discharge task for completion:', taskErr);
                return res.status(500).json({ success: false, message: 'تعذر تحميل مهمة التنزيل.' });
            }

            if (!taskResults.length) {
                return res.status(404).json({ success: false, message: 'مهمة التنزيل غير موجودة.' });
            }

            const task = taskResults[0];
            const proceedWithCompletion = () => {
                if (task.plan_status !== 'active' || task.task_status === 'completed') {
                    return res.status(409).json({ success: false, message: 'لا يمكن تأكيد هذه المهمة في حالتها الحالية.' });
                }

                let resolvedFinalLocation = finalLocation || task.initial_drop_location || getDefaultFinalLocation(task.destination_type, '');
                const destinationBerthKey = getDockBerthKeyFromDestination(task.destination_type);
                const containerFinalStatus = getContainerCompletionStatus(task.destination_type);

                getUsersIdColumn((columnErr, userIdColumn) => {
                    if (columnErr) {
                        return res.status(500).json({ success: false, message: 'تعذر قراءة بيانات السائقين.' });
                    }

                    db.beginTransaction((transactionErr) => {
                        if (transactionErr) {
                            console.error('Error starting complete discharge task transaction:', transactionErr);
                            return res.status(500).json({ success: false, message: 'تعذر بدء تأكيد تنزيل الحاوية.' });
                        }

                        const persistCompletion = () => db.query(
                            `
                                UPDATE incoming_vessel_discharge_tasks
                                SET
                                    status = 'completed',
                                    final_location = ?,
                                    actual_unloaded_at = NOW(),
                                    actual_driver_name = driver_name_snapshot,
                                    actual_machine_name = machine_name_snapshot
                                WHERE task_id = ?
                            `,
                            [resolvedFinalLocation, taskId],
                            (updateTaskErr) => {
                                if (updateTaskErr) {
                                    return db.rollback(() => {
                                        console.error('Error updating discharge task to completed:', updateTaskErr);
                                        return res.status(500).json({ success: false, message: 'تعذر تحديث مهمة التنزيل.' });
                                    });
                                }

                                db.query(
                                    `
                                        UPDATE incoming_vessel_containers
                                        SET
                                            status = ?,
                                            final_location = ?,
                                            actual_unloaded_at = NOW(),
                                            unloaded_by_driver_name = ?,
                                            unloaded_by_machine_name = ?
                                        WHERE id = ?
                                    `,
                                    [
                                        containerFinalStatus,
                                        resolvedFinalLocation,
                                        task.driver_name_snapshot || null,
                                        task.machine_name_snapshot || null,
                                        task.container_id
                                    ],
                                    (updateContainerErr) => {
                                        if (updateContainerErr) {
                                            return db.rollback(() => {
                                                console.error('Error updating incoming container after unload:', updateContainerErr);
                                                return res.status(500).json({ success: false, message: 'تعذر تحديث حالة الحاوية بعد التنزيل.' });
                                            });
                                        }

                                        db.query(
                                            `
                                                SELECT COUNT(*) AS remaining_count
                                                FROM incoming_vessel_discharge_tasks
                                                WHERE plan_id = ?
                                                  AND status <> 'completed'
                                            `,
                                            [task.plan_id],
                                            (remainingErr, remainingResults) => {
                                                if (remainingErr) {
                                                    return db.rollback(() => {
                                                        console.error('Error checking remaining discharge tasks:', remainingErr);
                                                        return res.status(500).json({ success: false, message: 'تعذر تحديث حالة الخطة بعد التنزيل.' });
                                                    });
                                                }

                                                const remainingCount = Number(remainingResults[0]?.remaining_count || 0);

                                                const finalizePlanAndVessel = (callback) => {
                                                    if (remainingCount > 0) {
                                                        return callback(null);
                                                    }

                                                    db.query(
                                                        `
                                                            UPDATE incoming_vessel_discharge_plans
                                                            SET status = 'completed', completed_at = NOW()
                                                            WHERE plan_id = ?
                                                        `,
                                                        [task.plan_id],
                                                        (planUpdateErr) => {
                                                            if (planUpdateErr) {
                                                                return callback(planUpdateErr);
                                                            }

                                                            db.query(
                                                                `
                                                                    UPDATE incoming_vessels
                                                                    SET status = 'completed'
                                                                    WHERE vessel_id = ?
                                                                `,
                                                                [task.vessel_id],
                                                                callback
                                                            );
                                                        }
                                                    );
                                                };

                                                finalizePlanAndVessel((finalizeErr) => {
                                                    if (finalizeErr) {
                                                        return db.rollback(() => {
                                                            console.error('Error finalizing discharge plan/vessel:', finalizeErr);
                                                            return res.status(500).json({ success: false, message: 'تم تحديث الحاوية لكن تعذر إكمال تحديث الخطة.' });
                                                        });
                                                    }

                                                    const releaseDriver = (callback) => {
                                                        if (!task.driver_user_id) {
                                                            return callback(null);
                                                        }

                                                        db.query(
                                                            `
                                                                SELECT COUNT(*) AS active_count
                                                                FROM incoming_vessel_discharge_tasks t
                                                                JOIN incoming_vessel_discharge_plans p ON p.plan_id = t.plan_id
                                                                WHERE t.driver_user_id = ?
                                                                  AND p.status = 'active'
                                                                  AND t.status <> 'completed'
                                                            `,
                                                            [task.driver_user_id],
                                                            (driverCheckErr, driverCheckResults) => {
                                                                if (driverCheckErr) {
                                                                    return callback(driverCheckErr);
                                                                }

                                                                const activeCount = Number(driverCheckResults[0]?.active_count || 0);
                                                                if (activeCount > 0) {
                                                                    return callback(null);
                                                                }

                                                                db.query(
                                                                    `
                                                                        UPDATE Users
                                                                        SET availability_status = 'متاح'
                                                                        WHERE ${userIdColumn} = ?
                                                                    `,
                                                                    [task.driver_user_id],
                                                                    callback
                                                                );
                                                            }
                                                        );
                                                    };

                                                    const releaseMachine = (callback) => {
                                                        if (!task.machine_id) {
                                                            return callback(null);
                                                        }

                                                        db.query(
                                                            `
                                                                SELECT COUNT(*) AS active_count
                                                                FROM incoming_vessel_discharge_tasks t
                                                                JOIN incoming_vessel_discharge_plans p ON p.plan_id = t.plan_id
                                                                WHERE t.machine_id = ?
                                                                  AND p.status = 'active'
                                                                  AND t.status <> 'completed'
                                                            `,
                                                            [task.machine_id],
                                                            (machineCheckErr, machineCheckResults) => {
                                                                if (machineCheckErr) {
                                                                    return callback(machineCheckErr);
                                                                }

                                                                const activeCount = Number(machineCheckResults[0]?.active_count || 0);
                                                                if (activeCount > 0) {
                                                                    return callback(null);
                                                                }

                                                                db.query(
                                                                    `
                                                                        UPDATE Machines
                                                                        SET status = 'جاهزة'
                                                                        WHERE machine_id = ?
                                                                    `,
                                                                    [task.machine_id],
                                                                    callback
                                                                );
                                                            }
                                                        );
                                                    };

                                                    releaseDriver((driverReleaseErr) => {
                                                        if (driverReleaseErr) {
                                                            return db.rollback(() => {
                                                                console.error('Error releasing driver after unload:', driverReleaseErr);
                                                                return res.status(500).json({ success: false, message: 'تم تحديث الحاوية لكن تعذر تحديث حالة السائق.' });
                                                            });
                                                        }

                                                        releaseMachine((machineReleaseErr) => {
                                                            if (machineReleaseErr) {
                                                                return db.rollback(() => {
                                                                    console.error('Error releasing machine after unload:', machineReleaseErr);
                                                                    return res.status(500).json({ success: false, message: 'تم تحديث الحاوية لكن تعذر تحديث حالة المعدة.' });
                                                                });
                                                            }

                                                            db.commit((commitErr) => {
                                                                if (commitErr) {
                                                                    return db.rollback(() => {
                                                                        console.error('Error committing discharge task completion:', commitErr);
                                                                        return res.status(500).json({ success: false, message: 'تعذر إتمام تأكيد تنزيل الحاوية.' });
                                                                    });
                                                                }

                                                                return res.status(200).json({
                                                                    success: true,
                                                                    message: `تم تأكيد تنزيل الحاوية ${task.container_number} وتحديث موقعها النهائي.`
                                                                });
                                                            });
                                                        });
                                                    });
                                                });
                                            }
                                        );
                                    }
                                );
                            }
                        );

                        if (destinationBerthKey) {
                            allocateDockSlotForContainer(
                                {
                                    berthKey: destinationBerthKey,
                                    containerNumber: task.container_number,
                                    ownerName: task.owner_name,
                                    containerType: task.container_type,
                                    notes: `تم تنزيل الحاوية من الباخرة إلى رصيف ${destinationBerthKey}`
                                },
                                (slotErr, slot) => {
                                    if (slotErr) {
                                        return db.rollback(() => {
                                            const slotMessage = slotErr.message === 'NO_AVAILABLE_SLOT'
                                                ? `لا توجد خانات فارغة حالياً في رصيف ${destinationBerthKey}.`
                                                : 'تعذر تخصيص خانة داخل الرصيف للحاوية.';
                                            console.error('Error allocating berth slot for discharge completion:', slotErr);
                                            return res.status(500).json({ success: false, message: slotMessage });
                                        });
                                    }

                                    resolvedFinalLocation = slot.slot_code;
                                    persistCompletion();
                                }
                            );
                            return;
                        }

                        if (!resolvedFinalLocation.trim()) {
                            return db.rollback(() => res.status(400).json({ success: false, message: 'يجب إدخال الموقع النهائي قبل تأكيد التنزيل.' }));
                        }

                        persistCompletion();
                    });
                });
            };

            if (req.authSession.role !== 'driver') {
                if (String(task.driver_response_status || 'pending') !== 'completed') {
                    return res.status(409).json({ success: false, message: 'يجب أن يؤكد السائق اكتمال التنزيل أولاً.' });
                }
                return proceedWithCompletion();
            }

            getCurrentUserByEmail(req.authSession.email, (userErr, user) => {
                if (userErr) {
                    console.error('Error loading current driver for discharge completion:', userErr);
                    return res.status(500).json({ success: false, message: 'تعذر تحميل بيانات السائق.' });
                }

                if (!user) {
                    return res.status(404).json({ success: false, message: 'السائق الحالي غير موجود.' });
                }

                if (Number(task.driver_user_id) !== Number(user.user_id)) {
                    return res.status(403).json({ success: false, message: 'هذه المهمة غير مخصصة لك.' });
                }

                if (String(task.driver_response_status || 'pending') !== 'accepted') {
                    return res.status(409).json({ success: false, message: 'يجب أن توافق على المهمة أولاً قبل إنهائها.' });
                }

                db.query(
                    `
                        UPDATE incoming_vessel_discharge_tasks
                        SET
                            driver_response_status = 'completed',
                            driver_response_note = NULL,
                            driver_responded_at = NOW()
                        WHERE task_id = ?
                    `,
                    [taskId],
                    (updateDriverCompletionErr) => {
                        if (updateDriverCompletionErr) {
                            console.error('Error marking discharge task as driver-completed:', updateDriverCompletionErr);
                            return res.status(500).json({ success: false, message: 'تعذر تسجيل اكتمال المهمة.' });
                        }

                        return res.status(200).json({
                            success: true,
                            message: `تم تسجيل إنجاز مهمة الحاوية ${task.container_number} وبانتظار تأكيد مدير الرصيف.`
                        });
                    }
                );
            });
        });
    }

    /**
     * الغرض: جلب مهام التفريغ الحالية لمدير الآليات مع قائمة السائقين المتاحين لإسناد المهام.
     * المدخلات: req غير مستخدم وظيفيًا داخل handler، وres لإرجاع المهام والسائقين أو رسالة الخطأ.
     * المخرجات: يعيد JSON يحوي `{ success, availableDrivers, tasks }` بنفس الشكل الحالي المستخدم في الواجهة.
     * الآثار الجانبية: ينفذ استعلامات قراءة على Users ومهام وخطط وبواخر التفريغ، ويكتب الأخطاء إلى console.error عند الفشل.
     * ملاحظات: يحافظ على نفس ترتيب المهام الحالي وعلى نفس تشكيل بيانات السائقين والمهام المرسلة للواجهة.
     */
    function getMechanicDischargeTasksHandler(req, res) {
        getAvailableDockDrivers((driversErr, availableDrivers) => {
            if (driversErr) {
                console.error('Error loading available drivers for mechanic tasks:', driversErr);
                return res.status(500).json({ success: false, message: 'تعذر تحميل السائقين المتاحين.' });
            }

            const tasksQuery = `
                SELECT
                    t.task_id,
                    t.plan_id,
                    t.vessel_id,
                    t.container_id,
                    t.container_number,
                    t.destination_type,
                    t.initial_drop_location,
                    t.final_location,
                    t.driver_user_id,
                    t.driver_name_snapshot,
                    t.driver_response_status,
                    t.driver_response_note,
                    t.driver_responded_at,
                    t.machine_id,
                    t.machine_name_snapshot,
                    t.task_order,
                    t.status,
                    t.actual_unloaded_at,
                    t.actual_driver_name,
                    t.actual_machine_name,
                    p.status AS plan_status,
                    p.proposed_berth,
                    v.vessel_name,
                    v.voyage_reference
                FROM incoming_vessel_discharge_tasks t
                JOIN incoming_vessel_discharge_plans p ON p.plan_id = t.plan_id
                JOIN incoming_vessels v ON v.vessel_id = t.vessel_id
                WHERE p.status IN ('draft', 'active')
                  AND t.status IN ('planned', 'in_progress')
                ORDER BY
                    CASE WHEN p.status = 'draft' THEN 0 ELSE 1 END,
                    t.task_order ASC,
                    t.task_id ASC
            `;

            db.query(tasksQuery, (tasksErr, taskResults) => {
                if (tasksErr) {
                    console.error('Error loading mechanic discharge tasks:', tasksErr);
                    return res.status(500).json({ success: false, message: 'تعذر تحميل مهام التفريغ لمدير الآليات.' });
                }

                return res.status(200).json({
                    success: true,
                    availableDrivers: availableDrivers.map((driver) => ({
                        id: driver.user_id,
                        name: driver.full_name || driver.email,
                        email: driver.email
                    })),
                    tasks: taskResults.map((task) => ({
                        ...mapDischargeTaskRow(task),
                        planStatus: task.plan_status,
                        proposedBerth: task.proposed_berth,
                        vesselName: task.vessel_name,
                        voyageReference: task.voyage_reference
                    }))
                });
            });
        });
    }

    /**
     * الغرض: إسناد مهمة تفريغ إلى سائق محدد بعد التحقق من حالة المهمة وتوفر السائق وعدم تعارضه مع مهام أخرى.
     * المدخلات: req.params.taskId لتحديد المهمة، وreq.body.driverUserId لتحديد السائق، وres لإرجاع نتيجة الإسناد.
     * المخرجات: يعيد JSON بنتيجة الإسناد أو رسالة خطأ مطابقة للسلوك الحالي.
     * الآثار الجانبية: ينفذ قراءات تحقق ثم UPDATE على incoming_vessel_discharge_tasks لتحديث بيانات السائق وحالة الرد.
     * ملاحظات: يحافظ على نفس منطق السماح بإعادة إسناد نفس السائق إذا كان الرد السابق `failed`.
     */
    function assignDriverToDischargeTaskHandler(req, res) {
        const taskId = Number(req.params.taskId);
        const driverUserId = Number(req.body.driverUserId);

        if (!taskId || !driverUserId) {
            return res.status(400).json({ success: false, message: 'يرجى اختيار المهمة والسائق.' });
        }

        getUsersIdColumn((columnErr, userIdColumn) => {
            if (columnErr) {
                return res.status(500).json({ success: false, message: 'تعذر قراءة بيانات السائقين.' });
            }

            const taskQuery = `
                SELECT t.task_id, t.plan_id, t.driver_user_id, t.driver_response_status, t.status, p.status AS plan_status
                FROM incoming_vessel_discharge_tasks t
                JOIN incoming_vessel_discharge_plans p ON p.plan_id = t.plan_id
                WHERE t.task_id = ?
                LIMIT 1
            `;

            db.query(taskQuery, [taskId], (taskErr, taskResults) => {
                if (taskErr) {
                    console.error('Error loading mechanic discharge task for assignment:', taskErr);
                    return res.status(500).json({ success: false, message: 'تعذر تحميل المهمة المطلوبة.' });
                }

                if (!taskResults.length) {
                    return res.status(404).json({ success: false, message: 'المهمة المطلوبة غير موجودة.' });
                }

                const task = taskResults[0];
                if (!['draft', 'active'].includes(task.plan_status) || task.status !== 'planned') {
                    return res.status(409).json({ success: false, message: 'لا يمكن تعيين سائق لهذه المهمة في حالتها الحالية.' });
                }

                const driverQuery = `
                    SELECT ${userIdColumn} AS user_id, email, full_name, availability_status
                    FROM Users u
                    WHERE ${userIdColumn} = ?
                      AND LOWER(TRIM(u.role)) = 'driver'
                    LIMIT 1
                `;

                db.query(driverQuery, [driverUserId], (driverErr, driverResults) => {
                    if (driverErr) {
                        console.error('Error loading driver for mechanic assignment:', driverErr);
                        return res.status(500).json({ success: false, message: 'تعذر تحميل بيانات السائق.' });
                    }

                    if (!driverResults.length) {
                        return res.status(404).json({ success: false, message: 'السائق المحدد غير موجود.' });
                    }

                    const driver = driverResults[0];
                    const conflictQuery = `
                        SELECT t.task_id
                        FROM incoming_vessel_discharge_tasks t
                        JOIN incoming_vessel_discharge_plans p ON p.plan_id = t.plan_id
                        WHERE t.driver_user_id = ?
                          AND t.task_id <> ?
                          AND p.status IN ('draft', 'active')
                          AND t.status IN ('planned', 'in_progress')
                          AND (
                                t.status = 'in_progress'
                                OR COALESCE(t.driver_response_status, 'pending') IN ('pending', 'accepted')
                          )
                        LIMIT 1
                    `;

                    db.query(conflictQuery, [driverUserId, taskId], (conflictErr, conflictResults) => {
                        if (conflictErr) {
                            console.error('Error checking driver assignment conflict:', conflictErr);
                            return res.status(500).json({ success: false, message: 'تعذر التحقق من توفر السائق.' });
                        }

                        const isRetryingSameFailedDriver = Number(task.driver_user_id) === Number(driverUserId)
                            && String(task.driver_response_status || 'pending') === 'failed';

                        if (conflictResults.length) {
                            return res.status(409).json({ success: false, message: 'هذا السائق غير متاح حالياً لمهمة تفريغ جديدة.' });
                        }

                        if (driver.availability_status === 'مشغول' && !isRetryingSameFailedDriver) {
                            return res.status(409).json({ success: false, message: 'هذا السائق غير متاح حالياً لمهمة تفريغ جديدة.' });
                        }

                        db.query(
                            `
                                UPDATE incoming_vessel_discharge_tasks
                                SET
                                    driver_user_id = ?,
                                    driver_name_snapshot = ?,
                                    driver_response_status = 'pending',
                                    driver_response_note = NULL,
                                    driver_responded_at = NULL
                                WHERE task_id = ?
                            `,
                            [driverUserId, driver.full_name || driver.email, taskId],
                            (assignErr) => {
                                if (assignErr) {
                                    console.error('Error assigning driver to discharge task:', assignErr);
                                    return res.status(500).json({ success: false, message: 'تعذر إسناد المهمة إلى السائق.' });
                                }

                                return res.status(200).json({
                                    success: true,
                                    message: `تم إسناد مهمة التفريغ إلى السائق ${driver.full_name || driver.email}.`
                                });
                            }
                        );
                    });
                });
            });
        });
    }

    /**
     * الغرض: معالجة رد السائق على مهمة التفريغ سواء بالموافقة أو الإبلاغ عن الانشغال مع الحفاظ على نفس تسلسل التحديثات الحالي.
     * المدخلات: req.params.taskId لتحديد المهمة، وreq.body.decision وreq.body.note لقرار السائق وملاحظته، وreq.authSession.email لتحديد السائق الحالي، وres لإرجاع النتيجة.
     * المخرجات: يعيد JSON بنتيجة الرد أو رسالة خطأ مطابقة للسلوك الحالي.
     * الآثار الجانبية: قد ينفذ UPDATE بسيط لتسجيل الانشغال، أو beginTransaction يحدّث المهمة والخطة والحاوية والباخرة والسائق والمعدة عند قبول المهمة.
     * ملاحظات: يحافظ على نفس منطق قبول المهمة الذي ينقلها إلى `in_progress` ويحوّل الخطة إلى `active` إن لزم.
     */
    function respondToDischargeTaskHandler(req, res) {
        const taskId = Number(req.params.taskId);
        const decision = String(req.body.decision || '').trim().toLowerCase();
        const note = String(req.body.note || '').trim();
        const allowedDecisions = ['accepted', 'busy'];

        if (!taskId || !allowedDecisions.includes(decision)) {
            return res.status(400).json({ success: false, message: 'قرار الرد غير صالح.' });
        }

        if (decision === 'busy' && !note) {
            return res.status(400).json({ success: false, message: 'يرجى كتابة سبب الانشغال قبل إرسال الرد.' });
        }

        getCurrentUserByEmail(req.authSession.email, (userErr, user) => {
            if (userErr) {
                console.error('Error loading current driver for discharge response:', userErr);
                return res.status(500).json({ success: false, message: 'تعذر تحميل بيانات السائق.' });
            }

            if (!user) {
                return res.status(404).json({ success: false, message: 'السائق الحالي غير موجود.' });
            }

            const taskQuery = `
                SELECT
                    t.task_id,
                    t.plan_id,
                    t.vessel_id,
                    t.container_id,
                    t.machine_id,
                    t.driver_user_id,
                    t.driver_response_status,
                    t.status,
                    t.container_number,
                    p.status AS plan_status
                FROM incoming_vessel_discharge_tasks t
                JOIN incoming_vessel_discharge_plans p ON p.plan_id = t.plan_id
                WHERE t.task_id = ?
                LIMIT 1
            `;

            db.query(taskQuery, [taskId], (taskErr, taskResults) => {
                if (taskErr) {
                    console.error('Error loading discharge task for driver response:', taskErr);
                    return res.status(500).json({ success: false, message: 'تعذر تحميل المهمة.' });
                }

                if (!taskResults.length) {
                    return res.status(404).json({ success: false, message: 'المهمة غير موجودة.' });
                }

                const task = taskResults[0];
                if (Number(task.driver_user_id) !== Number(user.user_id)) {
                    return res.status(403).json({ success: false, message: 'هذه المهمة غير مخصصة لك.' });
                }

                if (!['draft', 'active'].includes(task.plan_status) || task.status !== 'planned') {
                    return res.status(409).json({ success: false, message: 'لا يمكن الرد على هذه المهمة في حالتها الحالية.' });
                }

                if (String(task.driver_response_status || 'pending') !== 'pending') {
                    return res.status(409).json({ success: false, message: 'تم الرد على هذه المهمة مسبقاً.' });
                }

                if (decision !== 'accepted') {
                    db.query(
                        `
                            UPDATE incoming_vessel_discharge_tasks
                            SET
                                driver_response_status = ?,
                                driver_response_note = ?,
                                driver_responded_at = NOW()
                            WHERE task_id = ?
                        `,
                        [decision, note || null, taskId],
                        (updateErr) => {
                            if (updateErr) {
                                console.error('Error saving driver discharge response:', updateErr);
                                return res.status(500).json({ success: false, message: 'تعذر حفظ رد السائق.' });
                            }

                            return res.status(200).json({
                                success: true,
                                message: `تم إرسال إشعار الانشغال لمهمة الحاوية ${task.container_number} إلى مدير الآليات.`
                            });
                        }
                    );
                    return;
                }

                getUsersIdColumn((columnErr, userIdColumn) => {
                    if (columnErr) {
                        return res.status(500).json({ success: false, message: 'تعذر قراءة بيانات السائقين.' });
                    }

                    db.beginTransaction((transactionErr) => {
                        if (transactionErr) {
                            console.error('Error starting discharge accept transaction:', transactionErr);
                            return res.status(500).json({ success: false, message: 'تعذر بدء استلام مهمة التفريغ.' });
                        }

                        db.query(
                            `
                                UPDATE incoming_vessel_discharge_tasks
                                SET
                                    driver_response_status = 'accepted',
                                    driver_response_note = NULL,
                                    driver_responded_at = NOW(),
                                    status = 'in_progress'
                                WHERE task_id = ?
                            `,
                            [taskId],
                            (updateTaskErr) => {
                                if (updateTaskErr) {
                                    return db.rollback(() => {
                                        console.error('Error updating discharge task to accepted/in progress:', updateTaskErr);
                                        return res.status(500).json({ success: false, message: 'تعذر تحديث حالة المهمة.' });
                                    });
                                }

                                db.query(
                                    `
                                        UPDATE incoming_vessel_discharge_plans
                                        SET
                                            status = 'active',
                                            started_at = COALESCE(started_at, NOW())
                                        WHERE plan_id = ?
                                    `,
                                    [task.plan_id],
                                    (updatePlanErr) => {
                                        if (updatePlanErr) {
                                            return db.rollback(() => {
                                                console.error('Error activating discharge plan after driver acceptance:', updatePlanErr);
                                                return res.status(500).json({ success: false, message: 'تعذر تحديث حالة خطة التفريغ.' });
                                            });
                                        }

                                        db.query(
                                            `
                                                UPDATE incoming_vessel_containers
                                                SET status = 'discharging'
                                                WHERE id = ?
                                            `,
                                            [task.container_id],
                                            (updateContainerErr) => {
                                                if (updateContainerErr) {
                                                    return db.rollback(() => {
                                                        console.error('Error updating container to discharging after driver acceptance:', updateContainerErr);
                                                        return res.status(500).json({ success: false, message: 'تعذر تحديث حالة الحاوية.' });
                                                    });
                                                }

                                                db.query(
                                                    `
                                                        UPDATE incoming_vessels
                                                        SET status = 'discharging'
                                                        WHERE vessel_id = ?
                                                    `,
                                                    [task.vessel_id],
                                                    (updateVesselErr) => {
                                                        if (updateVesselErr) {
                                                            return db.rollback(() => {
                                                                console.error('Error updating vessel to discharging after driver acceptance:', updateVesselErr);
                                                                return res.status(500).json({ success: false, message: 'تعذر تحديث حالة الباخرة.' });
                                                            });
                                                        }

                                                        db.query(
                                                            `
                                                                UPDATE Users
                                                                SET availability_status = 'مشغول'
                                                                WHERE ${userIdColumn} = ?
                                                            `,
                                                            [user.user_id],
                                                            (updateDriverErr) => {
                                                                if (updateDriverErr) {
                                                                    return db.rollback(() => {
                                                                        console.error('Error updating driver availability after discharge acceptance:', updateDriverErr);
                                                                        return res.status(500).json({ success: false, message: 'تعذر تحديث حالة السائق.' });
                                                                    });
                                                                }

                                                                const updateMachine = (callback) => {
                                                                    if (!task.machine_id) {
                                                                        return callback(null);
                                                                    }

                                                                    db.query(
                                                                        `
                                                                            UPDATE Machines
                                                                            SET status = 'في الخدمة'
                                                                            WHERE machine_id = ?
                                                                        `,
                                                                        [task.machine_id],
                                                                        callback
                                                                    );
                                                                };

                                                                updateMachine((updateMachineErr) => {
                                                                    if (updateMachineErr) {
                                                                        return db.rollback(() => {
                                                                            console.error('Error updating machine status after discharge acceptance:', updateMachineErr);
                                                                            return res.status(500).json({ success: false, message: 'تعذر تحديث حالة المعدة.' });
                                                                        });
                                                                    }

                                                                    db.commit((commitErr) => {
                                                                        if (commitErr) {
                                                                            return db.rollback(() => {
                                                                                console.error('Error committing discharge acceptance transaction:', commitErr);
                                                                                return res.status(500).json({ success: false, message: 'تعذر إتمام استلام المهمة.' });
                                                                            });
                                                                        }

                                                                        return res.status(200).json({
                                                                            success: true,
                                                                            message: `تم استلام مهمة تفريغ الحاوية ${task.container_number} ويمكنك الآن إنهاؤها أو الإبلاغ عن تعذر الإنجاز.`
                                                                        });
                                                                    });
                                                                });
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
            });
        });
    }

    /**
     * الغرض: تسجيل تعذر إنجاز مهمة تفريغ من قبل السائق وإعادة المهمة لمدير الآليات لإعادة الإسناد مع تحرير السائق أو المعدة إذا لزم.
     * المدخلات: req.params.taskId لتحديد المهمة، وreq.body.note لسبب التعذر، وreq.authSession.email لتحديد السائق الحالي، وres لإرجاع النتيجة.
     * المخرجات: يعيد JSON بنتيجة تسجيل التعذر أو رسالة خطأ مطابقة للسلوك الحالي.
     * الآثار الجانبية: ينفذ beginTransaction ثم يحدّث المهمة والحاوية ويعيد تقييم حالات السائق والمعدة ثم commit أو rollback.
     * ملاحظات: يحافظ على نفس التسلسل الحالي لإرجاع المهمة إلى حالة planned وتغيير driver_response_status إلى failed.
     */
    function failDischargeTaskHandler(req, res) {
        const taskId = Number(req.params.taskId);
        const note = String(req.body.note || '').trim();

        if (!taskId) {
            return res.status(400).json({ success: false, message: 'معرف المهمة غير صالح.' });
        }

        if (!note) {
            return res.status(400).json({ success: false, message: 'يرجى كتابة سبب تعذر إنجاز المهمة.' });
        }

        getCurrentUserByEmail(req.authSession.email, (userErr, user) => {
            if (userErr) {
                console.error('Error loading current driver for discharge failure:', userErr);
                return res.status(500).json({ success: false, message: 'تعذر تحميل بيانات السائق.' });
            }

            if (!user) {
                return res.status(404).json({ success: false, message: 'السائق الحالي غير موجود.' });
            }

            const taskQuery = `
                SELECT
                    t.task_id,
                    t.plan_id,
                    t.vessel_id,
                    t.container_id,
                    t.machine_id,
                    t.driver_user_id,
                    t.driver_response_status,
                    t.status,
                    t.container_number
                FROM incoming_vessel_discharge_tasks t
                WHERE t.task_id = ?
                LIMIT 1
            `;

            db.query(taskQuery, [taskId], (taskErr, taskResults) => {
                if (taskErr) {
                    console.error('Error loading discharge task for failure:', taskErr);
                    return res.status(500).json({ success: false, message: 'تعذر تحميل المهمة.' });
                }

                if (!taskResults.length) {
                    return res.status(404).json({ success: false, message: 'المهمة غير موجودة.' });
                }

                const task = taskResults[0];
                if (Number(task.driver_user_id) !== Number(user.user_id)) {
                    return res.status(403).json({ success: false, message: 'هذه المهمة غير مخصصة لك.' });
                }

                if (String(task.driver_response_status || 'pending') !== 'accepted' || task.status !== 'in_progress') {
                    return res.status(409).json({ success: false, message: 'لا يمكن تسجيل التعذر لهذه المهمة في حالتها الحالية.' });
                }

                getUsersIdColumn((columnErr, userIdColumn) => {
                    if (columnErr) {
                        return res.status(500).json({ success: false, message: 'تعذر قراءة بيانات السائقين.' });
                    }

                    db.beginTransaction((transactionErr) => {
                        if (transactionErr) {
                            console.error('Error starting discharge failure transaction:', transactionErr);
                            return res.status(500).json({ success: false, message: 'تعذر بدء تسجيل التعذر.' });
                        }

                        db.query(
                            `
                                UPDATE incoming_vessel_discharge_tasks
                                SET
                                    status = 'planned',
                                    driver_response_status = 'failed',
                                    driver_response_note = ?,
                                    driver_responded_at = NOW()
                                WHERE task_id = ?
                            `,
                            [note, taskId],
                            (updateTaskErr) => {
                                if (updateTaskErr) {
                                    return db.rollback(() => {
                                        console.error('Error updating discharge task to failed:', updateTaskErr);
                                        return res.status(500).json({ success: false, message: 'تعذر تحديث حالة المهمة.' });
                                    });
                                }

                                db.query(
                                    `
                                        UPDATE incoming_vessel_containers
                                        SET status = 'scheduled'
                                        WHERE id = ?
                                    `,
                                    [task.container_id],
                                    (updateContainerErr) => {
                                        if (updateContainerErr) {
                                            return db.rollback(() => {
                                                console.error('Error updating container after discharge failure:', updateContainerErr);
                                                return res.status(500).json({ success: false, message: 'تعذر تحديث حالة الحاوية.' });
                                            });
                                        }

                                        db.query(
                                            `
                                                SELECT COUNT(*) AS active_count
                                                FROM incoming_vessel_discharge_tasks t
                                                JOIN incoming_vessel_discharge_plans p ON p.plan_id = t.plan_id
                                                WHERE t.driver_user_id = ?
                                                  AND p.status = 'active'
                                                  AND t.task_id <> ?
                                                  AND (
                                                        t.status = 'in_progress'
                                                        OR (t.status = 'planned' AND COALESCE(t.driver_response_status, 'pending') IN ('pending', 'accepted'))
                                                  )
                                            `,
                                            [user.user_id, taskId],
                                            (driverCheckErr, driverCheckResults) => {
                                                if (driverCheckErr) {
                                                    return db.rollback(() => {
                                                        console.error('Error checking driver tasks after discharge failure:', driverCheckErr);
                                                        return res.status(500).json({ success: false, message: 'تعذر تحديث حالة السائق.' });
                                                    });
                                                }

                                                const driverActiveCount = Number(driverCheckResults[0]?.active_count || 0);
                                                const releaseDriver = (callback) => {
                                                    if (driverActiveCount > 0) {
                                                        return callback(null);
                                                    }

                                                    db.query(
                                                        `
                                                            UPDATE Users
                                                            SET availability_status = 'متاح'
                                                            WHERE ${userIdColumn} = ?
                                                        `,
                                                        [user.user_id],
                                                        callback
                                                    );
                                                };

                                                releaseDriver((releaseDriverErr) => {
                                                    if (releaseDriverErr) {
                                                        return db.rollback(() => {
                                                            console.error('Error releasing driver after discharge failure:', releaseDriverErr);
                                                            return res.status(500).json({ success: false, message: 'تعذر تحديث حالة السائق.' });
                                                        });
                                                    }

                                                    const releaseMachine = (callback) => {
                                                        if (!task.machine_id) {
                                                            return callback(null);
                                                        }

                                                        db.query(
                                                            `
                                                                SELECT COUNT(*) AS active_count
                                                                FROM incoming_vessel_discharge_tasks t
                                                                JOIN incoming_vessel_discharge_plans p ON p.plan_id = t.plan_id
                                                                WHERE t.machine_id = ?
                                                                  AND p.status = 'active'
                                                                  AND t.task_id <> ?
                                                                  AND (
                                                                        t.status = 'in_progress'
                                                                        OR (t.status = 'planned' AND COALESCE(t.driver_response_status, 'pending') = 'accepted')
                                                                  )
                                                            `,
                                                            [task.machine_id, taskId],
                                                            (machineCheckErr, machineCheckResults) => {
                                                                if (machineCheckErr) {
                                                                    return callback(machineCheckErr);
                                                                }

                                                                const machineActiveCount = Number(machineCheckResults[0]?.active_count || 0);
                                                                if (machineActiveCount > 0) {
                                                                    return callback(null);
                                                                }

                                                                db.query(
                                                                    `
                                                                        UPDATE Machines
                                                                        SET status = 'جاهزة'
                                                                        WHERE machine_id = ?
                                                                    `,
                                                                    [task.machine_id],
                                                                    callback
                                                                );
                                                            }
                                                        );
                                                    };

                                                    releaseMachine((releaseMachineErr) => {
                                                        if (releaseMachineErr) {
                                                            return db.rollback(() => {
                                                                console.error('Error releasing machine after discharge failure:', releaseMachineErr);
                                                                return res.status(500).json({ success: false, message: 'تعذر تحديث حالة المعدة.' });
                                                            });
                                                        }

                                                        db.commit((commitErr) => {
                                                            if (commitErr) {
                                                                return db.rollback(() => {
                                                                    console.error('Error committing discharge failure transaction:', commitErr);
                                                                    return res.status(500).json({ success: false, message: 'تعذر إتمام تسجيل التعذر.' });
                                                                });
                                                            }

                                                            return res.status(200).json({
                                                                success: true,
                                                                message: `تم تسجيل تعذر إنجاز مهمة الحاوية ${task.container_number} وإعادتها لمدير الآليات لإعادة الإسناد.`
                                                            });
                                                        });
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
            });
        });
    }

    router.post('/dockmanager/reception/vessels/:vesselId/generate-plan', requireRoles(['dockmanager']), generateDischargePlanHandler);
    router.post('/dockmanager/reception/plans/:planId/start', requireRoles(['dockmanager']), startDischargePlanHandler);
    router.post('/dockmanager/reception/tasks/:taskId/complete', requireRoles(['dockmanager', 'driver']), completeDischargeTaskHandler);
    router.get('/mechanic/discharge-tasks', requireRoles(['mechanic']), getMechanicDischargeTasksHandler);
    router.post('/mechanic/discharge-tasks/:taskId/assign-driver', requireRoles(['mechanic']), assignDriverToDischargeTaskHandler);
    router.post('/driver/discharge-tasks/:taskId/respond', requireRoles(['driver']), respondToDischargeTaskHandler);
    router.post('/driver/discharge-tasks/:taskId/fail', requireRoles(['driver']), failDischargeTaskHandler);

    return router;
}

module.exports = {
    createDischargeRoutes
};
