// Function registerDriverRoutes: Registers driver endpoints for dashboard, task actions, and profile updates.
module.exports = function registerDriverRoutes(app, context) {
    const {
        db,
        getUsersIdColumn
    } = context;

// Route handler [GET] /api/driver-dashboard: Builds driver dashboard payload including user, machine, and active tasks context.
app.get('/api/driver-dashboard', (req, res, next) => {
    const email = String(req.query.email || '').trim();

    if (!email) {
        return res.status(400).json({ success: false, message: 'البريد الإلكتروني مطلوب.' });
    }

    getUsersIdColumn((columnErr, userIdColumn) => {
        if (columnErr) {
            return res.status(500).json({ success: false, message: 'تعذر قراءة بنية جدول المستخدمين.' });
        }

        const userQuery = `
            SELECT ${userIdColumn} AS user_id, email, role, full_name, shift, phone
            FROM Users
            WHERE email = ?
            LIMIT 1
        `;

        db.query(userQuery, [email], (userErr, userResults) => {
            if (userErr) {
                console.error('Database error on fetching driver user:', userErr);
                return res.status(500).json({ success: false, message: 'تعذر جلب بيانات السائق.' });
            }

            if (!userResults.length) {
                return res.status(404).json({ success: false, message: 'لم يتم العثور على السائق.' });
            }

            const user = userResults[0];
            const userName = String(user.full_name || '').trim();
            const machineParams = [user.user_id, email];
            let machineQuery = `
                SELECT
                    machine_id,
                    machine_code,
                    machine_name,
                    category,
                    location_id,
                    status,
                    operating_hours,
                    purchase_date,
                    last_maintenance_date,
                    next_maintenance_date,
                    facility_name,
                    notes
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
                    CASE
                        WHEN driver_user_id = ? THEN 0
                        ELSE 1
                    END,
                    CASE
                        WHEN status = 'في الخدمة' THEN 0
                        WHEN status = 'جاهزة' THEN 1
                        WHEN status = 'تحت الصيانة' THEN 2
                        ELSE 3
                    END,
                    machine_id ASC
                LIMIT 1
            `;
            machineParams.push(user.user_id);

            db.query(machineQuery, machineParams, (machineErr, machineResults) => {
                if (machineErr) {
                    console.error('Database error on fetching driver machine:', machineErr);
                    return res.status(500).json({ success: false, message: 'تعذر جلب بيانات المركبة.' });
                }

                const machine = machineResults[0] || null;
                const now = new Date();
                const fallbackShift = now.getHours() < 14 ? 'الصباحية' : 'المسائية';
                const initialsSource = userName || email;
                const initials = initialsSource
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((part) => part.charAt(0).toUpperCase())
                    .join(' ') || 'س';

                let statusText = 'بانتظار مهمة جديدة';
                let statusClass = 'status-waiting';
                let note = 'لا توجد مهام حالية مرسلة من مدير الرصيف.';

                if (machine) {
                    if (machine.status === 'في الخدمة' || machine.status === 'جاهزة') {
                        statusText = 'جاهز للتنفيذ';
                        statusClass = 'status-ready';
                    } else if (machine.status === 'تحت الصيانة') {
                        statusText = 'المركبة تحت الصيانة';
                        statusClass = 'status-alert';
                    } else {
                        statusText = machine.status || 'حالة غير محددة';
                        statusClass = 'status-waiting';
                    }

                    note = machine.notes || `المركبة ${machine.machine_name} جاهزة عند وجود طلب جديد من مدير الرصيف.`;
                }

                const dockRequestQuery = `
                    SELECT request_id, container_number, slot_code, status, created_at, response_note
                    FROM dock_delivery_requests
                    WHERE driver_user_id = ?
                      AND status IN ('pending', 'approved')
                    ORDER BY
                        CASE
                            WHEN status = 'pending' THEN 0
                            WHEN status = 'approved' THEN 1
                            ELSE 3
                        END,
                        created_at DESC
                `;

                db.query(dockRequestQuery, [user.user_id], (dockRequestErr, dockRequestResults) => {
                    if (dockRequestErr) {
                        console.error('Database error on fetching dock requests for driver:', dockRequestErr);
                        return res.status(500).json({ success: false, message: 'تعذر تحميل طلبات الرصيف.' });
                    }

                    const dockTasks = dockRequestResults.map((request) => ({
                        id: `DOCK-${request.request_id}`,
                        cargo: `نقل الحاوية ${request.container_number}`,
                        pickup: `الخانة ${request.slot_code}`,
                        destination: 'خارج الرصيف',
                        time: new Date(request.created_at).toLocaleString('ar-SA'),
                        priority: 'عالية',
                        priorityClass: 'priority-high',
                        status: request.status === 'pending' ? 'بانتظار ردك' : 'بانتظار التنفيذ',
                        statusClass: request.status === 'pending' ? 'status-waiting' : 'status-ready',
                        actions: request.status === 'pending'
                            ? [
                                { label: 'موافق', decision: 'approved', className: 'table-action approve', stage: 'respond' },
                                { label: 'غير متاح', decision: 'unavailable', className: 'table-action unavailable', stage: 'respond' }
                            ]
                            : [
                                { label: 'تم التنفيذ', decision: 'completed', className: 'table-action complete', stage: 'finish' },
                                { label: 'تعذر الاكتمال', decision: 'failed', className: 'table-action fail', stage: 'finish' }
                            ],
                        requestId: request.request_id,
                        taskKind: 'dock'
                    }));

                    const dischargeTasksQuery = `
                        SELECT
                            t.task_id,
                            t.container_number,
                            t.destination_type,
                            t.initial_drop_location,
                            t.final_location,
                            t.status,
                            t.driver_response_status,
                            t.driver_response_note,
                            t.driver_responded_at,
                            t.created_at,
                            v.vessel_name,
                            p.status AS plan_status
                        FROM incoming_vessel_discharge_tasks t
                        JOIN incoming_vessels v ON v.vessel_id = t.vessel_id
                        JOIN incoming_vessel_discharge_plans p ON p.plan_id = t.plan_id
                        WHERE t.driver_user_id = ?
                          AND p.status IN ('draft', 'active')
                          AND t.status IN ('planned', 'in_progress')
                          AND COALESCE(t.driver_response_status, 'pending') NOT IN ('busy', 'failed')
                        ORDER BY
                            CASE WHEN p.status = 'active' THEN 0 ELSE 1 END,
                            t.task_order ASC,
                            t.task_id ASC
                    `;

                    db.query(dischargeTasksQuery, [user.user_id], (dischargeErr, dischargeResults) => {
                        if (dischargeErr) {
                            console.error('Database error on fetching discharge tasks for driver:', dischargeErr);
                            return res.status(500).json({ success: false, message: 'تعذر تحميل مهام تفريغ البواخر.' });
                        }

                        const dischargeTasks = dischargeResults.map((task) => {
                            const responseStatus = String(task.driver_response_status || 'pending');
                            const isAccepted = responseStatus === 'accepted';
                            const isActiveTask = task.status === 'in_progress';

                            let status = 'بانتظار ردك';
                            let statusClass = 'status-waiting';
                            let actions = [
                                { label: 'موافق', decision: 'accepted', className: 'table-action approve', stage: 'respond' },
                                { label: 'مشغول الآن', decision: 'busy', className: 'table-action unavailable', stage: 'respond' }
                            ];

                            if (isAccepted && isActiveTask) {
                                status = 'قيد التنفيذ';
                                statusClass = 'status-ready';
                                actions = [
                                    { label: 'تم الإنجاز', decision: 'completed', className: 'table-action complete', stage: 'finish' },
                                    { label: 'تعذر إنجاز المهمة', decision: 'failed', className: 'table-action fail', stage: 'finish' }
                                ];
                            }

                            return {
                                id: `DSG-${task.task_id}`,
                                cargo: `تفريغ الحاوية ${task.container_number}`,
                                pickup: `الباخرة ${task.vessel_name}`,
                                destination: task.final_location || task.initial_drop_location || 'موقع تشغيلي',
                                time: new Date(task.created_at).toLocaleString('ar-SA'),
                                priority: 'عالية',
                                priorityClass: 'priority-high',
                                status,
                                statusClass,
                                actions,
                                requestId: task.task_id,
                                taskKind: 'discharge',
                                responseNote: task.driver_response_note,
                                respondedAt: task.driver_responded_at
                            };
                        });

                        const tasks = [...dockTasks, ...dischargeTasks];
                        const hasDischargeTask = dischargeTasks.length > 0;

                        return res.status(200).json({
                            success: true,
                            profile: {
                                id: user.user_id,
                                email: user.email,
                                name: user.full_name || user.email,
                                role: 'سائق',
                                shift: user.shift || fallbackShift,
                                status: hasDischargeTask ? 'لديه مهمة تفريغ' : statusText,
                                statusClass: hasDischargeTask ? 'status-ready' : statusClass,
                                initials,
                                phone: user.phone || 'غير مضاف',
                                note: hasDischargeTask ? 'تم إسناد مهمة تفريغ لك من مدير الآليات.' : note
                            },
                            vehicle: machine ? {
                                id: machine.machine_id,
                                code: machine.machine_code,
                                name: machine.machine_name,
                                category: machine.category || 'غير محددة',
                                location: machine.location_id || 'غير محدد',
                                status: machine.status || 'غير محددة',
                                hours: Number(machine.operating_hours || 0),
                                purchaseDate: machine.purchase_date,
                                lastMaintenanceDate: machine.last_maintenance_date,
                                nextMaintenanceDate: machine.next_maintenance_date,
                                facility: machine.facility_name || 'غير محدد'
                            } : null,
                            tasks
                        });
                    });
                });
            });
        });
    });
});
// Route handler [GET] /api/drivers: Returns drivers list with assignment and availability attributes.
app.get('/api/drivers', (req, res) => {
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

            res.status(200).json({
                success: true,
                drivers: results
            });
        });
    });
});

// Route handler [PUT] /api/drivers/:userId: Updates driver profile and synchronizes linked machine details when needed.
app.put('/api/drivers/:userId', (req, res) => {
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
});

};
