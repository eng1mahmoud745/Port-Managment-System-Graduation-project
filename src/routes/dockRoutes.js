// Function registerDockRoutes: Registers dock manager endpoints for reception, discharge planning, and delivery requests.
module.exports = function registerDockRoutes(app, context) {
    const {
        db,
        DOCK_BERTHS,
        requireRoles,
        getUsersIdColumn,
        normalizeStoredCode,
        resolveEntityCode,
        findCodeConflict,
        normalizeMysqlDateTime,
        normalizeDischargePriority,
        normalizeContainerCondition,
        normalizeContainerDestination,
        getPriorityRank,
        getDestinationRank,
        getContainerCompletionStatus,
        getDefaultFinalLocation,
        mapIncomingVesselRow,
        normalizeContainerWeight,
        mapDischargePlanRow,
        mapDischargeTaskRow,
        getDockLevelMeta,
        getDockBerthMeta,
        getDockLevelsForBerth,
        normalizeDockBerthKey,
        getDockBerthKeyFromDestination,
        allocateDockSlotForContainer,
        getDockBerthStatus,
        getCurrentUserByEmail,
        getDockDrivers,
        getAvailableDockDrivers,
        getReadyMachines,
        getActiveWarehouse,
        getActiveDockRequests
    } = context;

// Route handler [GET] /api/dockmanager/reception/vessels: Returns incoming vessels with latest discharge plan/task snapshots. Protected route.
app.get('/api/dockmanager/reception/vessels', requireRoles(['dockmanager']), (req, res) => {
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
});

// Route handler [POST] /api/dockmanager/reception/vessels: Creates a new incoming vessel reception record. Protected route.
app.post('/api/dockmanager/reception/vessels', requireRoles(['dockmanager']), (req, res) => {
    const vesselName = String(req.body.vesselName || '').trim();
    const voyageReference = String(req.body.voyageReference || '').trim().toUpperCase();
    const expectedArrival = normalizeMysqlDateTime(req.body.expectedArrival);
    const arrivalSource = String(req.body.arrivalSource || '').trim() || null;
    const expectedContainerCount = Math.max(0, Number.parseInt(req.body.expectedContainerCount, 10) || 0);
    const cargoType = String(req.body.cargoType || '').trim() || null;
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
});

// Route handler [POST] /api/dockmanager/reception/vessels/:vesselId/containers: Registers received containers under a specific incoming vessel. Protected route.
app.post('/api/dockmanager/reception/vessels/:vesselId/containers', requireRoles(['dockmanager']), (req, res) => {
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
        const contents = String(row.contents || '').trim() || null;
        const destinationType = normalizeContainerDestination(row.destinationType);

        if (!containerNumber || !containerSize || !containerCondition || !ownerName || containerWeight === null || !destinationType) {
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

        if (seenContainerNumbers.has(containerNumber)) {
            return res.status(409).json({
                success: false,
                message: `رقم الحاوية ${containerNumber} مكرر داخل النموذج.`
            });
        }

        seenContainerNumbers.add(containerNumber);
        normalizedContainers.push([
            vesselId,
            containerNumber,
            containerType,
            containerSize,
            containerCondition,
            ownerName,
            containerWeight,
            contents,
            destinationType,
            'normal',
            'arrived'
        ]);
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
            [...normalizedContainers.map((row) => row[1])],
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
                                contents,
                                destination_type,
                                discharge_priority,
                                status
                            )
                            VALUES ?
                        `,
                        [normalizedContainers],
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

                                        return res.status(201).json({
                                            success: true,
                                            message: `تم ربط ${normalizedContainers.length} حاوية بالباخرة ${vessel.vessel_name} وتحديث حالتها إلى واصلة.`
                                        });
                                    });
                                }
                            );
                        }
                    );
                });
            }
        );
    });
});

// Route handler [GET] /api/dockmanager/reception/container-code: Generates the next available container code suggestion. Protected route.
app.get('/api/dockmanager/reception/container-code', requireRoles(['dockmanager']), (req, res) => {
    resolveEntityCode({
        submittedCode: '',
        defaultPrefix: 'CNT',
        tableName: 'incoming_vessel_containers',
        codeColumn: 'container_number'
    }, (codeErr, generatedCode) => {
        if (codeErr) {
            console.error('Error generating incoming container code:', codeErr);
            return res.status(500).json({ success: false, message: 'تعذر توليد كود الحاوية تلقائياً.' });
        }

        return res.status(200).json({
            success: true,
            code: generatedCode
        });
    });
});

// Route handler [GET] /api/dockmanager/reception/container-code/check: Checks whether a container code is available/valid. Protected route.
app.get('/api/dockmanager/reception/container-code/check', requireRoles(['dockmanager']), (req, res) => {
    const submittedCode = String(req.query.code || '').trim();
    const normalizedCode = normalizeStoredCode(submittedCode);

    if (!normalizedCode) {
        return res.status(400).json({ success: false, message: 'رقم الحاوية غير صالح.' });
    }

    findCodeConflict({
        tableName: 'incoming_vessel_containers',
        codeColumn: 'container_number',
        candidateCode: normalizedCode
    }, (conflictErr, conflict) => {
        if (conflictErr) {
            console.error('Error checking incoming container code conflict:', conflictErr);
            return res.status(500).json({ success: false, message: 'تعذر التحقق من رقم الحاوية.' });
        }

        return res.status(200).json({
            success: true,
            code: normalizedCode,
            exists: Boolean(conflict)
        });
    });
});

// Route handler [POST] /api/dockmanager/reception/vessels/:vesselId/arrival-shortage-reason: Updates arrival shortage reason for a vessel reception. Protected route.
app.post('/api/dockmanager/reception/vessels/:vesselId/arrival-shortage-reason', requireRoles(['dockmanager']), (req, res) => {
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

        if (receivedCount >= expectedCount) {
            return res.status(409).json({ success: false, message: 'يمكن إضافة سبب فقط عندما يكون عدد الحاويات الواصلة أقل من المتوقع.' });
        }

        if (!shortageReason) {
            return res.status(400).json({ success: false, message: 'يرجى كتابة سبب الحاويات التي لم تصل.' });
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
                    message: `تم حفظ سبب الحاويات التي لم تصل للباخرة ${vessel.vessel_name}.`
                });
            }
        );
    });
});

// Route handler [POST] /api/dockmanager/reception/vessels/:vesselId/generate-plan: Generates discharge plan and task allocation for a vessel. Protected route.
app.post('/api/dockmanager/reception/vessels/:vesselId/generate-plan', requireRoles(['dockmanager']), (req, res) => {
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

        if (receivedCount < expectedCount && !shortageReason) {
            return res.status(409).json({
                success: false,
                message: 'أضف سبب الحاويات التي لم تصل أولاً قبل توليد خطة التفريغ.'
            });
        }

        const containersQuery = `
            SELECT id, container_number, destination_type, discharge_priority, status
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

            getAvailableDockDrivers({ ignoreDraftVesselId: vesselId }, (driversErr, drivers) => {
                if (driversErr) {
                    console.error('Error loading available drivers:', driversErr);
                    return res.status(500).json({ success: false, message: 'تعذر تحميل السائقين المتاحين.' });
                }

                if (!drivers.length) {
                    return res.status(409).json({ success: false, message: 'لا يوجد سائقون متاحون حالياً لتوليد الخطة.' });
                }

                getReadyMachines({ ignoreDraftVesselId: vesselId }, (machinesErr, machines) => {
                    if (machinesErr) {
                        console.error('Error loading ready machines:', machinesErr);
                        return res.status(500).json({ success: false, message: 'تعذر تحميل المعدات الجاهزة.' });
                    }

                    if (!machines.length) {
                        return res.status(409).json({ success: false, message: 'لا توجد معدات جاهزة حالياً لتوليد الخطة.' });
                    }

                    getActiveWarehouse((warehouseErr, activeWarehouse) => {
                        if (warehouseErr) {
                            console.error('Error loading active warehouse for plan generation:', warehouseErr);
                            return res.status(500).json({ success: false, message: 'تعذر تحميل بيانات المستودع.' });
                        }

                        const sortedContainers = [...containerResults].sort((left, right) => {
                            const priorityDiff = getPriorityRank(left.discharge_priority) - getPriorityRank(right.discharge_priority);
                            if (priorityDiff !== 0) {
                                return priorityDiff;
                            }

                            const destinationDiff = getDestinationRank(left.destination_type) - getDestinationRank(right.destination_type);
                            if (destinationDiff !== 0) {
                                return destinationDiff;
                            }

                            return String(left.container_number).localeCompare(String(right.container_number));
                        });

                        const taskRows = sortedContainers.map((container, index) => {
                            const assignedMachine = machines[index % machines.length];
                            const initialDropLocation = getDefaultFinalLocation(
                                container.destination_type,
                                vessel.proposed_berth,
                                activeWarehouse?.name || ''
                            );

                            return [
                                vesselId,
                                container.id,
                                container.container_number,
                                container.destination_type,
                                initialDropLocation,
                                initialDropLocation,
                                null,
                                null,
                                assignedMachine.machine_id,
                                assignedMachine.machine_name,
                                index + 1,
                                'planned'
                            ];
                        });

                        db.beginTransaction((transactionErr) => {
                            if (transactionErr) {
                                console.error('Error starting generate discharge plan transaction:', transactionErr);
                                return res.status(500).json({ success: false, message: 'تعذر بدء توليد خطة التفريغ.' });
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
                                                    `تم توليد الخطة تلقائياً باستخدام ${machines.length} معدة بانتظار تعيين السائقين من مدير الآليات.`
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

                                                                            db.commit((commitErr) => {
                                                                                if (commitErr) {
                                                                                    return db.rollback(() => {
                                                                                        console.error('Error committing discharge plan generation:', commitErr);
                                                                                        return res.status(500).json({ success: false, message: 'تعذر إتمام توليد خطة التفريغ.' });
                                                                                    });
                                                                                }

                                                                                return res.status(201).json({
                                                                                    success: true,
                                                                                    message: `تم توليد خطة تفريغ للباخرة ${vessel.vessel_name} وإرسال مهامها إلى مدير الآليات لتعيين السائقين.`
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

// Route handler [POST] /api/dockmanager/reception/plans/:planId/start: Transitions a discharge plan from draft/planned to active execution. Protected route.
app.post('/api/dockmanager/reception/plans/:planId/start', requireRoles(['dockmanager']), (req, res) => {
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
});

// Route handler [POST] /api/dockmanager/reception/tasks/:taskId/complete: Completes a discharge task and updates container/resulting state. Protected route.
app.post('/api/dockmanager/reception/tasks/:taskId/complete', requireRoles(['dockmanager', 'driver']), (req, res) => {
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

            return proceedWithCompletion();
        });
    });
});

// Route handler [GET] /api/mechanic/discharge-tasks: Returns mechanic view of discharge tasks requiring machine-side actions. Protected route.
app.get('/api/mechanic/discharge-tasks', requireRoles(['mechanic']), (req, res) => {
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
});

// Route handler [POST] /api/mechanic/discharge-tasks/:taskId/assign-driver: Assigns or updates driver assignment for a mechanic task. Protected route.
app.post('/api/mechanic/discharge-tasks/:taskId/assign-driver', requireRoles(['mechanic']), (req, res) => {
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

                    if (conflictResults.length || driver.availability_status === 'مشغول') {
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
});

// Route handler [GET] /api/dockmanager/dashboard: Returns dock manager dashboard aggregates and live operational counters. Protected route.
app.get('/api/dockmanager/dashboard', requireRoles(['dockmanager']), (req, res) => {
    const session = req.authSession;
    const slotsQuery = `
        SELECT id, berth_key, level_key, slot_code, slot_order, container_number, owner_name, container_type, notes, updated_at
        FROM dock_slots
        ORDER BY FIELD(berth_key, 'A', 'B', 'C', 'TRUCK', 'TRAIN'), FIELD(level_key, 'upper', 'middle', 'lower', 'truck', 'rail'), slot_order ASC
    `;

    db.query(slotsQuery, (dockErr, slotResults) => {
        if (dockErr) {
            console.error('Error fetching dock manager dashboard:', dockErr);
            return res.status(500).json({ success: false, message: 'تعذر تحميل بيانات الرصيف.' });
        }

        getCurrentUserByEmail(session.email, (userErr, user) => {
            if (userErr) {
                console.error('Error fetching dock manager user:', userErr);
                return res.status(500).json({ success: false, message: 'تعذر تحميل بيانات المستخدم.' });
            }

            getDockDrivers((driversErr, drivers) => {
                if (driversErr) {
                    console.error('Error fetching dock drivers:', driversErr);
                    return res.status(500).json({ success: false, message: 'تعذر تحميل قائمة السائقين.' });
                }

                getActiveDockRequests((requestsErr, requests) => {
                    if (requestsErr) {
                        console.error('Error fetching dock requests:', requestsErr);
                        return res.status(500).json({ success: false, message: 'تعذر تحميل طلبات النقل.' });
                    }

                    const requestsBySlotId = requests.reduce((accumulator, request) => {
                        accumulator[request.slot_id] = {
                            id: request.request_id,
                            containerNumber: request.container_number,
                            status: request.status,
                            driverId: request.driver_user_id,
                            driverName: request.driver_name || request.driver_email || 'سائق',
                            driverEmail: request.driver_email,
                            responseNote: request.response_note,
                            createdAt: request.created_at,
                            respondedAt: request.responded_at
                        };
                        return accumulator;
                    }, {});

                    const berths = DOCK_BERTHS.map((berth) => {
                        const berthSlots = slotResults.filter((slot) => normalizeDockBerthKey(slot.berth_key) === berth.key);
                        const occupiedCount = berthSlots.filter((slot) => String(slot.container_number || '').trim()).length;
                        const totalSlots = berthSlots.length;
                        const berthStatus = getDockBerthStatus(occupiedCount, totalSlots);

                        return {
                            key: berth.key,
                            label: berth.label,
                            summary: {
                                occupiedCount,
                                totalSlots,
                                berthStatus
                            },
                            levels: getDockLevelsForBerth(berth.key).map((level) => ({
                                key: level.key,
                                label: level.label,
                                hint: level.hint || '',
                                slots: berthSlots
                                    .filter((slot) => slot.level_key === level.key)
                                    .map((slot) => {
                                        const currentContainerNumber = String(slot.container_number || '').trim();
                                        const slotRequest = requestsBySlotId[slot.id] || null;
                                        const requestMatchesCurrentContainer = slotRequest
                                            && String(slotRequest.containerNumber || '').trim()
                                            && String(slotRequest.containerNumber || '').trim().toUpperCase() === currentContainerNumber.toUpperCase();

                                        return {
                                            id: slot.id,
                                            code: slot.slot_code,
                                            order: slot.slot_order,
                                            berthKey: berth.key,
                                            containerNumber: slot.container_number,
                                            ownerName: slot.owner_name,
                                            containerType: slot.container_type,
                                            notes: slot.notes,
                                            occupied: Boolean(currentContainerNumber),
                                            updatedAt: slot.updated_at,
                                            request: requestMatchesCurrentContainer ? slotRequest : null
                                        };
                                    })
                            }))
                        };
                    });

                    const occupiedCount = berths.reduce((total, berth) => total + Number(berth.summary.occupiedCount || 0), 0);
                    const totalSlots = berths.reduce((total, berth) => total + Number(berth.summary.totalSlots || 0), 0);

                    return res.status(200).json({
                        success: true,
                        manager: {
                            name: String(user?.full_name || session.email || 'مدير الرصيف').trim(),
                            email: session.email,
                            role: session.role
                        },
                        summary: {
                            occupiedCount,
                            totalSlots,
                            berthStatus: getDockBerthStatus(occupiedCount, totalSlots)
                        },
                        drivers: drivers.map((driver) => ({
                            id: driver.user_id,
                            name: driver.full_name || driver.email,
                            email: driver.email,
                            availabilityStatus: driver.availability_status || 'متاح'
                        })),
                        berths
                    });
                });
            });
        });
    });
});

// Route handler [GET] /api/dockmanager/completed-containers: Returns completed container operations history. Protected route.
app.get('/api/dockmanager/completed-containers', requireRoles(['dockmanager']), (req, res) => {
    getUsersIdColumn((columnErr, userIdColumn) => {
        if (columnErr) {
            return res.status(500).json({ success: false, message: 'تعذر قراءة بيانات السائقين.' });
        }

        const query = `
            SELECT
                r.request_id,
                r.container_number,
                r.slot_code,
                r.owner_name,
                r.responded_at,
                u.${userIdColumn} AS driver_id,
                u.email AS driver_email,
                u.full_name AS driver_name
            FROM dock_delivery_requests r
            LEFT JOIN Users u ON u.${userIdColumn} = r.driver_user_id
            WHERE r.status = 'completed'
            ORDER BY COALESCE(r.responded_at, r.created_at) DESC, r.request_id DESC
        `;

        db.query(query, (queryErr, results) => {
            if (queryErr) {
                console.error('Error fetching completed dock containers:', queryErr);
                return res.status(500).json({ success: false, message: 'تعذر تحميل الحاويات المسلمة.' });
            }

            return res.status(200).json({
                success: true,
                containers: results.map((row) => ({
                    id: row.request_id,
                    containerNumber: row.container_number,
                    previousSlot: row.slot_code,
                    ownerName: row.owner_name,
                    driverName: row.driver_name || row.driver_email || 'سائق',
                    completedAt: row.responded_at
                }))
            });
        });
    });
});

// Route handler [POST] /api/dockmanager/containers: Creates direct dock container record entry from manager workflow. Protected route.
app.post('/api/dockmanager/containers', requireRoles(['dockmanager']), (req, res) => {
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
});

// Route handler [POST] /api/dockmanager/requests: Creates dock delivery request for a target slot/container. Protected route.
app.post('/api/dockmanager/requests', requireRoles(['dockmanager']), (req, res) => {
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
});

// Route handler [POST] /api/dockmanager/containers/deliver: Marks container delivery operation and updates slot/request state. Protected route.
app.post('/api/dockmanager/containers/deliver', requireRoles(['dockmanager']), (req, res) => {
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
});

// Route handler [POST] /api/driver/dock-requests/:requestId/respond: Records driver response to a dock delivery request. Protected route.
app.post('/api/driver/dock-requests/:requestId/respond', requireRoles(['driver']), (req, res) => {
    const requestId = Number(req.params.requestId);
    const decision = String(req.body.decision || '').trim().toLowerCase();
    const allowedDecisions = ['approved', 'unavailable'];

    if (!requestId || !allowedDecisions.includes(decision)) {
        return res.status(400).json({ success: false, message: 'قرار الرد غير صالح.' });
    }

    getCurrentUserByEmail(req.authSession.email, (userErr, user) => {
        if (userErr) {
            console.error('Error loading current driver for dock response:', userErr);
            return res.status(500).json({ success: false, message: 'تعذر تحميل بيانات السائق.' });
        }

        if (!user) {
            return res.status(404).json({ success: false, message: 'السائق الحالي غير موجود.' });
        }

        const requestQuery = `
            SELECT request_id, slot_id, driver_user_id, status, container_number
            FROM dock_delivery_requests
            WHERE request_id = ?
            LIMIT 1
        `;

        db.query(requestQuery, [requestId], (requestErr, results) => {
            if (requestErr) {
                console.error('Error fetching dock request for response:', requestErr);
                return res.status(500).json({ success: false, message: 'تعذر تحميل الطلب.' });
            }

            if (!results.length) {
                return res.status(404).json({ success: false, message: 'الطلب غير موجود.' });
            }

            const request = results[0];
            if (Number(request.driver_user_id) !== Number(user.user_id)) {
                return res.status(403).json({ success: false, message: 'هذا الطلب غير مخصص لك.' });
            }

            if (request.status !== 'pending') {
                return res.status(409).json({ success: false, message: 'تم الرد على هذا الطلب مسبقاً.' });
            }

            const updateQuery = `
                UPDATE dock_delivery_requests
                SET status = ?, responded_at = NOW()
                WHERE request_id = ?
            `;

            db.query(updateQuery, [decision, requestId], (updateErr) => {
                if (updateErr) {
                    console.error('Error updating dock request response:', updateErr);
                    return res.status(500).json({ success: false, message: 'تعذر حفظ رد السائق.' });
                }

                return res.status(200).json({
                    success: true,
                    message: decision === 'approved'
                        ? `تمت الموافقة على طلب نقل الحاوية ${request.container_number}.`
                        : `تم إرسال رد "غير متاح" للحاوية ${request.container_number}.`
                });
            });
        });
    });
});

// Route handler [POST] /api/driver/discharge-tasks/:taskId/respond: Records driver response to assigned discharge task. Protected route.
app.post('/api/driver/discharge-tasks/:taskId/respond', requireRoles(['driver']), (req, res) => {
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
});

// Route handler [POST] /api/driver/discharge-tasks/:taskId/fail: Marks discharge task as failed with reason and state updates. Protected route.
app.post('/api/driver/discharge-tasks/:taskId/fail', requireRoles(['driver']), (req, res) => {
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
});

// Route handler [POST] /api/driver/dock-requests/:requestId/finish: Marks dock request as completed by driver confirmation. Protected route.
app.post('/api/driver/dock-requests/:requestId/finish', requireRoles(['driver']), (req, res) => {
    const requestId = Number(req.params.requestId);
    const outcome = String(req.body.outcome || '').trim().toLowerCase();
    const note = String(req.body.note || '').trim();
    const allowedOutcomes = ['completed', 'failed'];

    if (!requestId || !allowedOutcomes.includes(outcome)) {
        return res.status(400).json({ success: false, message: 'نتيجة المهمة غير صالحة.' });
    }

    if (outcome === 'failed' && !note) {
        return res.status(400).json({ success: false, message: 'يرجى كتابة سبب تعذر اكتمال المهمة.' });
    }

    getCurrentUserByEmail(req.authSession.email, (userErr, user) => {
        if (userErr) {
            console.error('Error loading current driver for dock finish:', userErr);
            return res.status(500).json({ success: false, message: 'تعذر تحميل بيانات السائق.' });
        }

        if (!user) {
            return res.status(404).json({ success: false, message: 'السائق الحالي غير موجود.' });
        }

        const requestQuery = `
            SELECT request_id, slot_id, driver_user_id, status, container_number
            FROM dock_delivery_requests
            WHERE request_id = ?
            LIMIT 1
        `;

        db.query(requestQuery, [requestId], (requestErr, results) => {
            if (requestErr) {
                console.error('Error fetching dock request for finish:', requestErr);
                return res.status(500).json({ success: false, message: 'تعذر تحميل المهمة.' });
            }

            if (!results.length) {
                return res.status(404).json({ success: false, message: 'المهمة غير موجودة.' });
            }

            const request = results[0];
            if (Number(request.driver_user_id) !== Number(user.user_id)) {
                return res.status(403).json({ success: false, message: 'هذه المهمة غير مخصصة لك.' });
            }

            if (request.status !== 'approved') {
                return res.status(409).json({ success: false, message: 'لا يمكن إنهاء هذه المهمة قبل الموافقة عليها.' });
            }

            const updateQuery = `
                UPDATE dock_delivery_requests
                SET status = ?, response_note = ?, responded_at = COALESCE(responded_at, NOW())
                WHERE request_id = ?
            `;

            db.query(updateQuery, [outcome, note || 'تم تنفيذ المهمة', requestId], (updateErr) => {
                if (updateErr) {
                    console.error('Error finishing dock request:', updateErr);
                    return res.status(500).json({ success: false, message: 'تعذر حفظ نتيجة المهمة.' });
                }

                if (outcome !== 'completed') {
                    return res.status(200).json({
                        success: true,
                        message: `تم إرسال إشعار تعذر اكتمال مهمة الحاوية ${request.container_number}.`
                    });
                }

                const clearSlotQuery = `
                    UPDATE dock_slots
                    SET container_number = NULL, owner_name = NULL, container_type = NULL, notes = NULL
                    WHERE id = ?
                `;

                db.query(clearSlotQuery, [request.slot_id], (clearErr) => {
                    if (clearErr) {
                        console.error('Error clearing dock slot after completion:', clearErr);
                        return res.status(500).json({ success: false, message: 'تم حفظ النتيجة لكن تعذر تحديث خانة الرصيف.' });
                    }

                    return res.status(200).json({
                        success: true,
                        message: `تم إرسال إشعار تنفيذ مهمة الحاوية ${request.container_number} إلى مدير الرصيف.`
                    });
                });
            });
        });
    });
});

};
