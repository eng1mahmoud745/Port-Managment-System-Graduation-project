const express = require('express');

const DAILY_INSPECTION_FIELDS = [
    'oil_checked',
    'water_checked',
    'brakes_checked',
    'tires_checked',
    'fuel_checked',
    'battery_checked',
    'lights_checked',
    'leaks_checked'
];

const DAILY_INSPECTION_FIELD_LABELS = {
    oil_checked: 'الزيت',
    water_checked: 'الماء',
    brakes_checked: 'الفرامل',
    tires_checked: 'الإطارات',
    fuel_checked: 'الوقود',
    battery_checked: 'البطارية',
    lights_checked: 'الأضواء',
    leaks_checked: 'عدم وجود تسريب ظاهر'
};

const MONTHLY_INSPECTION_FIELDS = [
    { key: 'engine_condition', label: 'حالة المحرك' },
    { key: 'transmission_condition', label: 'حالة ناقل الحركة' },
    { key: 'cooling_system_condition', label: 'حالة نظام التبريد' },
    { key: 'oil_filters_condition', label: 'حالة الزيوت والفلاتر' },
    { key: 'brakes_condition', label: 'حالة الفرامل' },
    { key: 'tires_wear_condition', label: 'حالة الإطارات والتآكل' },
    { key: 'battery_condition', label: 'حالة البطارية' },
    { key: 'electrical_system_condition', label: 'حالة النظام الكهربائي' },
    { key: 'hydraulic_system_condition', label: 'حالة النظام الهيدروليكي' },
    { key: 'safety_tools_condition', label: 'حالة أدوات السلامة' },
    { key: 'body_condition', label: 'حالة الهيكل الخارجي' },
    { key: 'lights_signals_condition', label: 'حالة الإضاءة والإشارات' }
];

const MONTHLY_STATUS_LABELS = {
    ok: 'سليم',
    follow_up: 'يحتاج متابعة',
    needs_service: 'يحتاج صيانة',
    unfit: 'غير صالح'
};

const SERIOUS_MONTHLY_STATUS_VALUES = new Set(['needs_service', 'unfit']);

function createDriverRoutes({
    db,
    requireRoles,
    getCurrentUserByEmail,
    getUsersIdColumn
}) {
    const router = express.Router();

    function queryDb(sql, params = []) {
        return new Promise((resolve, reject) => {
            db.query(sql, params, (err, results) => {
                if (err) {
                    reject(err);
                    return;
                }

                resolve(results);
            });
        });
    }

    function getUsersIdColumnAsync() {
        return new Promise((resolve, reject) => {
            getUsersIdColumn((err, columnName) => {
                if (err) {
                    reject(err);
                    return;
                }

                resolve(columnName);
            });
        });
    }

    function parseBoolean(value) {
        if (typeof value === 'boolean') {
            return value;
        }

        if (typeof value === 'number') {
            return value === 1;
        }

        return ['1', 'true', 'yes', 'on', 'checked'].includes(String(value || '').trim().toLowerCase());
    }

    function getRiyadhDateParts(date = new Date()) {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Riyadh',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });

        return formatter
            .formatToParts(date)
            .reduce((accumulator, part) => {
                if (part.type !== 'literal') {
                    accumulator[part.type] = part.value;
                }

                return accumulator;
            }, {});
    }

    function getTodayKey() {
        const parts = getRiyadhDateParts();
        return `${parts.year}-${parts.month}-${parts.day}`;
    }

    function getCurrentMonthKey() {
        const parts = getRiyadhDateParts();
        return `${parts.year}-${parts.month}`;
    }

    function getDailyFailedInspectionItems(source) {
        return DAILY_INSPECTION_FIELDS
            .filter((fieldName) => !parseBoolean(source?.[fieldName]))
            .map((fieldName) => ({
                key: fieldName,
                label: DAILY_INSPECTION_FIELD_LABELS[fieldName]
            }));
    }

    function parseMonthlyChecklist(rawValue) {
        if (!rawValue) {
            return {};
        }

        if (typeof rawValue === 'object') {
            return rawValue;
        }

        try {
            const parsedValue = JSON.parse(String(rawValue || '{}'));
            return parsedValue && typeof parsedValue === 'object' ? parsedValue : {};
        } catch (error) {
            return {};
        }
    }

    function getMonthlyIssueItems(monthlyChecklist, options = {}) {
        const seriousOnly = Boolean(options.seriousOnly);

        return MONTHLY_INSPECTION_FIELDS
            .map((field) => {
                const status = String(monthlyChecklist?.[field.key] || '').trim();
                if (!status || status === 'ok') {
                    return null;
                }

                if (seriousOnly && !SERIOUS_MONTHLY_STATUS_VALUES.has(status)) {
                    return null;
                }

                return {
                    key: field.key,
                    label: field.label,
                    status,
                    statusLabel: MONTHLY_STATUS_LABELS[status] || status
                };
            })
            .filter(Boolean);
    }

    function buildInspectionRecord(row) {
        if (!row) {
            return null;
        }

        const isMonthlyInspection = row.inspection_type === 'monthly';
        const checklist = isMonthlyInspection
            ? null
            : DAILY_INSPECTION_FIELDS.reduce((accumulator, fieldName) => {
                accumulator[fieldName] = parseBoolean(row[fieldName]);
                return accumulator;
            }, {});
        const monthlyChecklist = isMonthlyInspection ? parseMonthlyChecklist(row.monthly_checklist) : null;
        const issueItems = isMonthlyInspection
            ? getMonthlyIssueItems(monthlyChecklist)
            : getDailyFailedInspectionItems(checklist);
        const seriousIssueItems = isMonthlyInspection
            ? getMonthlyIssueItems(monthlyChecklist, { seriousOnly: true })
            : issueItems;
        const needsPeriodicService = parseBoolean(row.needs_periodic_service);
        const maintenanceActionRequired = isMonthlyInspection
            ? parseBoolean(row.has_issue) || needsPeriodicService || seriousIssueItems.length > 0
            : parseBoolean(row.has_issue) || issueItems.length > 0;

        return {
            id: row.id,
            type: row.inspection_type,
            date: row.inspection_date,
            month: row.inspection_month,
            driverId: Number(row.driver_id),
            vehicleId: row.vehicle_id == null ? null : Number(row.vehicle_id),
            mileage: row.mileage == null ? null : Number(row.mileage),
            hasIssue: parseBoolean(row.has_issue),
            needsPeriodicService,
            notes: String(row.notes || '').trim(),
            checklist,
            monthlyChecklist,
            issueItems,
            seriousIssueItems,
            failedItems: issueItems,
            maintenanceActionRequired,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }

    function buildMaintenanceRequestContext(inspectionRecord) {
        if (!inspectionRecord || !inspectionRecord.maintenanceActionRequired) {
            return null;
        }

        const sourceLabel = inspectionRecord.type === 'monthly' ? 'نتيجة فحص شهري' : 'نتيجة فحص يومي';
        const justificationLines = [sourceLabel];

        if (inspectionRecord.type === 'monthly') {
            if (inspectionRecord.needsPeriodicService) {
                justificationLines.push('تم تحديد أن المركبة تحتاج إلى صيانة دورية.');
            }

            if (inspectionRecord.seriousIssueItems.length) {
                justificationLines.push(
                    `الحالات التي تحتاج صيانة: ${inspectionRecord.seriousIssueItems
                        .map((item) => `${item.label} (${item.statusLabel})`)
                        .join('، ')}`
                );
            } else if (inspectionRecord.issueItems.length) {
                justificationLines.push(
                    `نتائج الفحص الفني: ${inspectionRecord.issueItems
                        .map((item) => `${item.label} (${item.statusLabel})`)
                        .join('، ')}`
                );
            }
        } else if (inspectionRecord.failedItems.length) {
            justificationLines.push(`العناصر غير السليمة: ${inspectionRecord.failedItems.map((item) => item.label).join('، ')}`);
        }

        if (inspectionRecord.mileage != null) {
            justificationLines.push(`ممشى المركبة: ${inspectionRecord.mileage}`);
        }

        if (inspectionRecord.notes) {
            justificationLines.push(`ملاحظات السائق: ${inspectionRecord.notes}`);
        }

        return {
            showButton: true,
            source: inspectionRecord.type,
            sourceLabel,
            inspectionId: inspectionRecord.id,
            failedItems: inspectionRecord.failedItems.map((item) => item.label),
            prefilledJustification: justificationLines.join('\n'),
            title: inspectionRecord.type === 'monthly'
                ? 'تم رصد ملاحظة في الفحص الشهري'
                : 'تم رصد ملاحظة في الفحص اليومي'
        };
    }

    function getDailyScopeKey(user) {
        return `driver:${user.user_id}`;
    }

    function getMonthlyScopeKey(user, machine) {
        return machine?.machine_id ? `vehicle:${machine.machine_id}` : `driver:${user.user_id}`;
    }

    function normalizeDailyInspectionChecklist(body) {
        return DAILY_INSPECTION_FIELDS.reduce((accumulator, fieldName) => {
            accumulator[fieldName] = parseBoolean(body[fieldName]);
            return accumulator;
        }, {});
    }

    function normalizeMonthlyInspectionChecklist(body) {
        const details = {};

        for (const field of MONTHLY_INSPECTION_FIELDS) {
            const normalizedValue = String(body?.[field.key] || '').trim();
            if (!normalizedValue) {
                return {
                    error: `حقل "${field.label}" مطلوب في الفحص الشهري.`
                };
            }

            if (!Object.prototype.hasOwnProperty.call(MONTHLY_STATUS_LABELS, normalizedValue)) {
                return {
                    error: `قيمة "${field.label}" غير صالحة.`
                };
            }

            details[field.key] = normalizedValue;
        }

        return { value: details };
    }

    function normalizeMileage(rawMileage, isRequired) {
        const normalizedValue = String(rawMileage ?? '').trim();
        if (!normalizedValue) {
            return isRequired ? { error: 'ممشى المركبة مطلوب في الفحص الشهري.' } : { value: null };
        }

        if (!/^\d+$/.test(normalizedValue)) {
            return { error: 'ممشى المركبة يجب أن يكون رقمًا صحيحًا فقط.' };
        }

        const parsedMileage = Number.parseInt(normalizedValue, 10);
        if (!Number.isInteger(parsedMileage) || parsedMileage < 0) {
            return { error: 'ممشى المركبة يجب أن يكون رقمًا صحيحًا غير سالب.' };
        }

        return { value: parsedMileage };
    }

    async function getDriverContextByEmail(email) {
        const userIdColumn = await getUsersIdColumnAsync();
        const userResults = await queryDb(
            `
                SELECT ${userIdColumn} AS user_id, email, role, full_name, shift, phone
                FROM Users
                WHERE email = ?
                LIMIT 1
            `,
            [email]
        );
        const user = userResults[0] || null;

        if (!user) {
            return { user: null, machine: null };
        }

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
                CASE WHEN driver_user_id = ? THEN 0 ELSE 1 END,
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

        const machineResults = await queryDb(machineQuery, machineParams);
        return { user, machine: machineResults[0] || null };
    }

    async function getLatestMonthlyInspection(monthlyScopeKey) {
        const monthlyRows = await queryDb(
            `
                SELECT *
                FROM driver_vehicle_inspections
                WHERE inspection_type = 'monthly'
                  AND monthly_scope_key = ?
                ORDER BY inspection_month DESC, inspection_date DESC, id DESC
                LIMIT 1
            `,
            [monthlyScopeKey]
        );

        return buildInspectionRecord(monthlyRows[0] || null);
    }

    async function buildInspectionStatus(user, machine) {
        if (!machine) {
            return {
                hasAssignedVehicle: false,
                dailyCompleted: false,
                dailyRequired: false,
                monthlyCompleted: false,
                monthlyRequired: false,
                lastMonthlyMileage: null,
                showMaintenanceRequest: false,
                maintenanceRequestContext: null,
                dailyInspection: null,
                monthlyInspection: null,
                history: [],
                vehicle: null,
                message: 'لا يمكن عرض الفحص أو الصيانة قبل ربط مركبة بهذا السائق.'
            };
        }

        const todayKey = getTodayKey();
        const currentMonthKey = getCurrentMonthKey();
        const dailyScopeKey = getDailyScopeKey(user);
        const monthlyScopeKey = getMonthlyScopeKey(user, machine);

        const [dailyRows, monthlyRows, latestMonthly, historyRows] = await Promise.all([
            queryDb(
                `
                    SELECT *
                    FROM driver_vehicle_inspections
                    WHERE inspection_type = 'daily'
                      AND daily_scope_key = ?
                      AND inspection_date = ?
                    ORDER BY id DESC
                    LIMIT 1
                `,
                [dailyScopeKey, todayKey]
            ),
            queryDb(
                `
                    SELECT *
                    FROM driver_vehicle_inspections
                    WHERE inspection_type = 'monthly'
                      AND monthly_scope_key = ?
                      AND inspection_month = ?
                    ORDER BY id DESC
                    LIMIT 1
                `,
                [monthlyScopeKey, currentMonthKey]
            ),
            getLatestMonthlyInspection(monthlyScopeKey),
            queryDb(
                `
                    SELECT *
                    FROM driver_vehicle_inspections
                    WHERE driver_id = ?
                    ORDER BY inspection_date DESC, id DESC
                    LIMIT 6
                `,
                [user.user_id]
            )
        ]);

        const dailyInspection = buildInspectionRecord(dailyRows[0] || null);
        const monthlyInspection = buildInspectionRecord(monthlyRows[0] || null);
        const maintenanceRequestContext = buildMaintenanceRequestContext(dailyInspection)
            || buildMaintenanceRequestContext(monthlyInspection);

        return {
            hasAssignedVehicle: true,
            dailyCompleted: Boolean(dailyInspection),
            dailyRequired: !dailyInspection,
            monthlyCompleted: Boolean(monthlyInspection),
            monthlyRequired: !monthlyInspection,
            lastMonthlyMileage: latestMonthly?.mileage ?? null,
            showMaintenanceRequest: Boolean(maintenanceRequestContext),
            maintenanceRequestContext,
            dailyInspection,
            monthlyInspection,
            history: historyRows.map((row) => buildInspectionRecord(row)),
            vehicle: machine ? {
                id: machine.machine_id,
                code: machine.machine_code,
                name: machine.machine_name,
                status: machine.status
            } : null
        };
    }

    async function getAuthenticatedDriverContext(req, res) {
        const currentEmail = String(req.authSession?.email || '').trim();
        if (!currentEmail) {
            res.status(401).json({ success: false, message: 'انتهت الجلسة، يرجى تسجيل الدخول من جديد.' });
            return null;
        }

        const context = await getDriverContextByEmail(currentEmail);
        if (!context.user) {
            res.status(404).json({ success: false, message: 'تعذر العثور على بيانات السائق الحالي.' });
            return null;
        }

        return context;
    }

    async function createInspectionRecord(req, res, inspectionType) {
        try {
            const context = await getAuthenticatedDriverContext(req, res);
            if (!context) {
                return;
            }

            const { user, machine } = context;
            if (!machine) {
                res.status(400).json({ success: false, message: 'لا يمكن تسجيل الفحص قبل ربط مركبة بهذا السائق.' });
                return;
            }

            const checklist = inspectionType === 'daily'
                ? normalizeDailyInspectionChecklist(req.body || {})
                : null;
            let monthlyChecklist = null;
            const notes = String(req.body?.notes || '').trim();
            const hasIssue = parseBoolean(req.body?.has_issue) || parseBoolean(req.body?.hasIssue);
            const needsPeriodicService = inspectionType === 'monthly'
                ? (parseBoolean(req.body?.needs_periodic_service) || parseBoolean(req.body?.needsPeriodicService))
                : false;
            const todayKey = getTodayKey();
            const currentMonthKey = getCurrentMonthKey();
            const dailyScopeKey = getDailyScopeKey(user);
            const monthlyScopeKey = getMonthlyScopeKey(user, machine);
            let mileage = null;

            if (inspectionType === 'daily') {
                const existingDailyRows = await queryDb(
                    `
                        SELECT id
                        FROM driver_vehicle_inspections
                        WHERE inspection_type = 'daily'
                          AND daily_scope_key = ?
                          AND inspection_date = ?
                        LIMIT 1
                    `,
                    [dailyScopeKey, todayKey]
                );

                if (existingDailyRows.length) {
                    res.status(409).json({ success: false, message: 'تم تسجيل الفحص اليومي لهذا اليوم بالفعل.' });
                    return;
                }
            }

            if (inspectionType === 'monthly') {
                const normalizedMonthlyChecklist = normalizeMonthlyInspectionChecklist(req.body || {});
                if (normalizedMonthlyChecklist.error) {
                    res.status(400).json({ success: false, message: normalizedMonthlyChecklist.error });
                    return;
                }

                monthlyChecklist = normalizedMonthlyChecklist.value;
                const normalizedMileage = normalizeMileage(req.body?.mileage, true);
                if (normalizedMileage.error) {
                    res.status(400).json({ success: false, message: normalizedMileage.error });
                    return;
                }

                mileage = normalizedMileage.value;
                const existingMonthlyRows = await queryDb(
                    `
                        SELECT id
                        FROM driver_vehicle_inspections
                        WHERE inspection_type = 'monthly'
                          AND monthly_scope_key = ?
                          AND inspection_month = ?
                        LIMIT 1
                    `,
                    [monthlyScopeKey, currentMonthKey]
                );

                if (existingMonthlyRows.length) {
                    res.status(409).json({ success: false, message: 'تم تسجيل الفحص الشهري لهذا الشهر بالفعل.' });
                    return;
                }

                const latestMonthlyInspection = await getLatestMonthlyInspection(monthlyScopeKey);
                if (latestMonthlyInspection?.mileage != null && mileage < latestMonthlyInspection.mileage) {
                    res.status(400).json({
                        success: false,
                        message: `ممشى المركبة لا يمكن أن يكون أقل من آخر ممشى شهري مسجل (${latestMonthlyInspection.mileage}).`
                    });
                    return;
                }
            }

            const insertResult = await queryDb(
                `
                    INSERT INTO driver_vehicle_inspections (
                        driver_id,
                        vehicle_id,
                        inspection_type,
                        inspection_date,
                        inspection_month,
                        daily_scope_key,
                        monthly_scope_key,
                        oil_checked,
                        water_checked,
                        brakes_checked,
                        tires_checked,
                        fuel_checked,
                        battery_checked,
                        lights_checked,
                        leaks_checked,
                        has_issue,
                        needs_periodic_service,
                        notes,
                        mileage,
                        monthly_checklist
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
                [
                    user.user_id,
                    machine?.machine_id || null,
                    inspectionType,
                    todayKey,
                    inspectionType === 'monthly' ? currentMonthKey : null,
                    dailyScopeKey,
                    inspectionType === 'monthly' ? monthlyScopeKey : null,
                    checklist?.oil_checked ? 1 : 0,
                    checklist?.water_checked ? 1 : 0,
                    checklist?.brakes_checked ? 1 : 0,
                    checklist?.tires_checked ? 1 : 0,
                    checklist?.fuel_checked ? 1 : 0,
                    checklist?.battery_checked ? 1 : 0,
                    checklist?.lights_checked ? 1 : 0,
                    checklist?.leaks_checked ? 1 : 0,
                    hasIssue ? 1 : 0,
                    needsPeriodicService ? 1 : 0,
                    notes || null,
                    mileage,
                    monthlyChecklist ? JSON.stringify(monthlyChecklist) : null
                ]
            );

            const createdRows = await queryDb(`SELECT * FROM driver_vehicle_inspections WHERE id = ? LIMIT 1`, [insertResult.insertId]);
            const inspectionRecord = buildInspectionRecord(createdRows[0] || null);
            const inspectionStatus = await buildInspectionStatus(user, machine);

            res.status(201).json({
                success: true,
                message: inspectionType === 'monthly' ? 'تم حفظ الفحص الشهري بنجاح.' : 'تم حفظ الفحص اليومي بنجاح.',
                inspection: inspectionRecord,
                maintenanceActionRequired: Boolean(inspectionRecord?.maintenanceActionRequired),
                maintenanceRequestContext: buildMaintenanceRequestContext(inspectionRecord),
                status: inspectionStatus
            });
        } catch (error) {
            if (error?.code === 'ER_DUP_ENTRY') {
                res.status(409).json({
                    success: false,
                    message: inspectionType === 'monthly'
                        ? 'تم تسجيل الفحص الشهري لهذا الشهر بالفعل.'
                        : 'تم تسجيل الفحص اليومي لهذا اليوم بالفعل.'
                });
                return;
            }

            console.error(`Error creating ${inspectionType} inspection:`, error);
            res.status(500).json({ success: false, message: 'تعذر حفظ الفحص في الوقت الحالي.' });
        }
    }

    function respondToDriverDockRequestHandler(req, res) {
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
                    return res.status(409).json({ success: false, message: 'تم الرد على هذا الطلب مسبقًا.' });
                }

                db.query(
                    `
                        UPDATE dock_delivery_requests
                        SET status = ?, responded_at = NOW()
                        WHERE request_id = ?
                    `,
                    [decision, requestId],
                    (updateErr) => {
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
                    }
                );
            });
        });
    }

    function finishDriverDockRequestHandler(req, res) {
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

                db.query(
                    `
                        UPDATE dock_delivery_requests
                        SET status = ?, response_note = ?, responded_at = COALESCE(responded_at, NOW())
                        WHERE request_id = ?
                    `,
                    [outcome, note || 'تم تنفيذ المهمة', requestId],
                    (updateErr) => {
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

                        db.query(
                            `
                                UPDATE dock_slots
                                SET container_number = NULL, owner_name = NULL, container_type = NULL, notes = NULL
                                WHERE id = ?
                            `,
                            [request.slot_id],
                            (clearErr) => {
                                if (clearErr) {
                                    console.error('Error clearing dock slot after completion:', clearErr);
                                    return res.status(500).json({ success: false, message: 'تم حفظ النتيجة لكن تعذر تحديث خانة الرصيف.' });
                                }

                                return res.status(200).json({
                                    success: true,
                                    message: `تم إرسال إشعار تنفيذ مهمة الحاوية ${request.container_number} إلى مدير الرصيف.`
                                });
                            }
                        );
                    }
                );
            });
        });
    }

    async function getDriverInspectionStatusHandler(req, res) {
        try {
            const context = await getAuthenticatedDriverContext(req, res);
            if (!context) {
                return;
            }

            const status = await buildInspectionStatus(context.user, context.machine);
            return res.status(200).json({ success: true, ...status });
        } catch (error) {
            console.error('Error loading driver inspection status:', error);
            return res.status(500).json({ success: false, message: 'تعذر تحميل حالة الفحص الحالية.' });
        }
    }

    async function createDailyInspectionHandler(req, res) {
        return createInspectionRecord(req, res, 'daily');
    }

    async function createMonthlyInspectionHandler(req, res) {
        return createInspectionRecord(req, res, 'monthly');
    }

    async function getDriverInspectionHistoryHandler(req, res) {
        try {
            const context = await getAuthenticatedDriverContext(req, res);
            if (!context) {
                return;
            }

            const historyRows = await queryDb(
                `
                    SELECT *
                    FROM driver_vehicle_inspections
                    WHERE driver_id = ?
                    ORDER BY inspection_date DESC, id DESC
                    LIMIT 20
                `,
                [context.user.user_id]
            );

            return res.status(200).json({
                success: true,
                history: historyRows.map((row) => buildInspectionRecord(row))
            });
        } catch (error) {
            console.error('Error loading driver inspection history:', error);
            return res.status(500).json({ success: false, message: 'تعذر تحميل سجل الفحوصات.' });
        }
    }

    function getDriverDashboardHandler(req, res) {
        const email = String(req.query.email || '').trim();

        if (!email) {
            return res.status(400).json({ success: false, message: 'البريد الإلكتروني مطلوب.' });
        }

        getUsersIdColumn((columnErr, userIdColumn) => {
            if (columnErr) {
                return res.status(500).json({ success: false, message: 'تعذر قراءة بنية جدول المستخدمين.' });
            }

            db.query(
                `
                    SELECT ${userIdColumn} AS user_id, email, role, full_name, shift, phone
                    FROM Users
                    WHERE email = ?
                    LIMIT 1
                `,
                [email],
                (userErr, userResults) => {
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
                            CASE WHEN driver_user_id = ? THEN 0 ELSE 1 END,
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

                        db.query(
                            `
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
                            `,
                            [user.user_id],
                            (dockRequestErr, dockRequestResults) => {
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

                                db.query(
                                    `
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
                                          AND COALESCE(t.driver_response_status, 'pending') NOT IN ('busy', 'failed', 'completed')
                                        ORDER BY
                                            CASE WHEN p.status = 'active' THEN 0 ELSE 1 END,
                                            t.task_order ASC,
                                            t.task_id ASC
                                    `,
                                    [user.user_id],
                                    (dischargeErr, dischargeResults) => {
                                        if (dischargeErr) {
                                            console.error('Database error on fetching discharge tasks for driver:', dischargeErr);
                                            return res.status(500).json({ success: false, message: 'تعذر تحميل مهام تفريغ البواخر.' });
                                        }

                                        const dischargeTasks = dischargeResults.map((task) => {
                                            const responseStatus = String(task.driver_response_status || 'pending');
                                            const isAccepted = responseStatus === 'accepted';
                                            const isActiveTask = task.status === 'in_progress';

                                            let taskStatus = 'بانتظار ردك';
                                            let taskStatusClass = 'status-waiting';
                                            let actions = [
                                                { label: 'موافق', decision: 'accepted', className: 'table-action approve', stage: 'respond' },
                                                { label: 'مشغول الآن', decision: 'busy', className: 'table-action unavailable', stage: 'respond' }
                                            ];

                                            if (isAccepted && isActiveTask) {
                                                taskStatus = 'قيد التنفيذ';
                                                taskStatusClass = 'status-ready';
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
                                                status: taskStatus,
                                                statusClass: taskStatusClass,
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
                                    }
                                );
                            }
                        );
                    });
                }
            );
        });
    }

    router.post('/driver/dock-requests/:requestId/respond', requireRoles(['driver']), respondToDriverDockRequestHandler);
    router.post('/driver/dock-requests/:requestId/finish', requireRoles(['driver']), finishDriverDockRequestHandler);
    router.get('/driver/inspection/status', requireRoles(['driver']), getDriverInspectionStatusHandler);
    router.post('/driver/inspection/daily', requireRoles(['driver']), createDailyInspectionHandler);
    router.post('/driver/inspection/monthly', requireRoles(['driver']), createMonthlyInspectionHandler);
    router.get('/driver/inspection/history', requireRoles(['driver']), getDriverInspectionHistoryHandler);
    router.get('/driver-dashboard', getDriverDashboardHandler);

    return router;
}

module.exports = {
    createDriverRoutes
};
