function createAdminUserActivityReportHandler({
    getUsersIdColumn,
    tableHasColumnAsync,
    queryDb,
    normalizeRoleKey,
    escapeReportHtml,
    formatReportDateTime,
    createHtmlTable
}) {
    const formatQty = (value) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
            return '-';
        }

        return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(2).replace(/\.?0+$/, '');
    };

    const formatStatusLabel = (value) => {
        const normalizedValue = String(value || '').trim();
        if (!normalizedValue) {
            return '-';
        }

        const labels = {
            pending: 'قيد الانتظار',
            approved: 'تمت الموافقة',
            unavailable: 'غير متاح',
            completed: 'مكتمل',
            failed: 'متعذر',
            delivered: 'تم التسليم',
            accepted: 'مقبول',
            busy: 'مشغول',
            rejected: 'مرفوض',
            printed: 'تمت الطباعة',
            purchased: 'تم الشراء',
            received: 'تم الاستلام',
            driver: 'سائق',
            internal: 'داخلي',
            new: 'جديد'
        };

        return labels[normalizedValue] || normalizedValue;
    };

    const buildOperationDetails = (...parts) => parts
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join(' | ');

    return async function getAdminUserActivityReportHandler(req, res) {
        const userId = Number(req.params.userId);
        const autoPrint = String(req.query.autoprint || '').trim() === '1';

        if (!userId) {
            return res.status(400).send('معرف المستخدم غير صالح.');
        }

        try {
            const userIdColumn = await new Promise((resolve, reject) => {
                getUsersIdColumn((err, column) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    resolve(column);
                });
            });

            const [hasUserPhoneColumn, hasUserShiftColumn, hasAccountStatusColumn] = await Promise.all([
                tableHasColumnAsync('Users', 'phone'),
                tableHasColumnAsync('Users', 'shift'),
                tableHasColumnAsync('Users', 'account_status')
            ]);

            const phoneSelect = hasUserPhoneColumn ? 'phone' : 'NULL AS phone';
            const shiftSelect = hasUserShiftColumn ? 'shift' : 'NULL AS shift';
            const accountStatusSelect = hasAccountStatusColumn
                ? `COALESCE(account_status, 'active') AS account_status`
                : `'active' AS account_status`;

            const users = await queryDb(
                `
                    SELECT ${userIdColumn} AS user_id, email, role, full_name, ${phoneSelect}, ${shiftSelect}, ${accountStatusSelect}
                    FROM Users
                    WHERE ${userIdColumn} = ?
                    LIMIT 1
                `,
                [userId]
            );

            const user = users[0];
            if (!user) {
                return res.status(404).send('المستخدم المطلوب غير موجود.');
            }

            const roleKey = normalizeRoleKey(user.role);
            const sections = [];
            const normalizedEmail = String(user.email || '').trim().toLowerCase();
            const normalizedFullName = String(user.full_name || '').trim().toLowerCase();

            const buildMatchClause = (columns) => {
                const clauses = [];
                const params = [];

                Array.from(new Set((columns || []).filter(Boolean))).forEach((column) => {
                    if (normalizedEmail) {
                        clauses.push(`LOWER(TRIM(COALESCE(${column}, ''))) = ?`);
                        params.push(normalizedEmail);
                    }

                    if (normalizedFullName && normalizedFullName !== normalizedEmail) {
                        clauses.push(`LOWER(TRIM(COALESCE(${column}, ''))) = ?`);
                        params.push(normalizedFullName);
                    }
                });

                return { clause: clauses.length ? `(${clauses.join(' OR ')})` : '(1 = 0)', params };
            };

            const queryOptionalRows = async (sql, params = []) => {
                try {
                    return await queryDb(sql, params);
                } catch (error) {
                    if (error?.code === 'ER_NO_SUCH_TABLE' || error?.code === 'ER_BAD_FIELD_ERROR') {
                        return [];
                    }

                    throw error;
                }
            };

            const addOperation = (collection, row) => collection.push({
                ...row,
                sortValue: row.date ? Date.parse(row.date) || -1 : -1
            });

            const requestCreatorMatch = buildMatchClause(['r.requested_by_email', 'r.requested_by']);
            const mechanicDecisionMatch = buildMatchClause(['r.mechanic_decision_by']);
            const requestFulfillmentMatch = buildMatchClause(['r.fulfilled_by']);
            const purchaseActorMatch = buildMatchClause(['pr.requested_by_email', 'pr.requested_by', 'pr.reviewed_by']);
            const dockReleaseActorMatch = buildMatchClause(['r.created_by_email', 'r.reviewed_by_email']);
            const dockDeliveryCreatorMatch = buildMatchClause(['r.created_by_email']);
            const vesselCreatorMatch = buildMatchClause(['v.created_by_email']);
            const dischargePlanMatch = buildMatchClause(['p.generated_by_email']);
            const transactionUserMatch = buildMatchClause(['t.user']);

            const [requestCreations, mechanicActions, requestFulfillments, purchaseRequests, dockReleaseRequests, dockDeliveryCreations, driverDockRequests, vessels, dischargePlans, dischargeTasks, transactionLogs] = await Promise.all([
                queryOptionalRows(`SELECT r.request_id, r.quantity, r.issued_quantity, r.status, r.justification, r.source_role, r.requested_for_date, r.created_at, i.item_name, i.item_code, m.machine_name, m.machine_code FROM requests r LEFT JOIN inventory_items i ON i.item_id = r.item_id LEFT JOIN Machines m ON m.machine_id = r.machine_id WHERE ${requestCreatorMatch.clause} ORDER BY r.request_id DESC`, requestCreatorMatch.params),
                queryOptionalRows(`SELECT r.request_id, r.quantity, r.status, i.item_name, i.item_code, m.machine_name, m.machine_code FROM requests r LEFT JOIN inventory_items i ON i.item_id = r.item_id LEFT JOIN Machines m ON m.machine_id = r.machine_id WHERE ${mechanicDecisionMatch.clause} ORDER BY r.request_id DESC`, mechanicDecisionMatch.params),
                queryOptionalRows(`SELECT r.request_id, r.quantity, r.issued_quantity, r.status, r.fulfilled_at, i.item_name, i.item_code FROM requests r LEFT JOIN inventory_items i ON i.item_id = r.item_id WHERE ${requestFulfillmentMatch.clause} ORDER BY r.request_id DESC`, requestFulfillmentMatch.params),
                queryOptionalRows(`SELECT pr.request_id, pr.item_name, pr.item_code_snapshot, pr.quantity, pr.supplier_name_snapshot, pr.requested_by, pr.requested_by_email, pr.reviewed_by, pr.status, pr.review_note, pr.reviewed_at, pr.created_at FROM purchase_requests pr WHERE ${purchaseActorMatch.clause} ORDER BY pr.request_id DESC`, purchaseActorMatch.params),
                queryOptionalRows(`SELECT r.request_id, r.container_number, r.slot_code, r.status, r.created_by_email, r.reviewed_by_email, r.decision_note, r.created_at, r.reviewed_at FROM dock_release_requests r WHERE ${dockReleaseActorMatch.clause} ORDER BY r.request_id DESC`, dockReleaseActorMatch.params),
                queryOptionalRows(`SELECT r.request_id, r.container_number, r.slot_code, r.status, r.created_at, r.responded_at FROM dock_delivery_requests r WHERE ${dockDeliveryCreatorMatch.clause} ORDER BY r.request_id DESC`, dockDeliveryCreatorMatch.params),
                queryOptionalRows(`SELECT request_id, container_number, slot_code, status, created_at, responded_at, response_note, delivered_at FROM dock_delivery_requests WHERE driver_user_id = ? ORDER BY request_id DESC`, [user.user_id]),
                queryOptionalRows(`SELECT vessel_id, vessel_name, voyage_reference, status, expected_arrival, created_at FROM incoming_vessels v WHERE ${vesselCreatorMatch.clause} ORDER BY vessel_id DESC`, vesselCreatorMatch.params),
                queryOptionalRows(`SELECT plan_id, vessel_id, proposed_berth, status, generated_at, started_at, completed_at FROM incoming_vessel_discharge_plans p WHERE ${dischargePlanMatch.clause} ORDER BY plan_id DESC`, dischargePlanMatch.params),
                queryOptionalRows(`SELECT task_id, container_number, destination_type, status, driver_response_status, driver_response_note, driver_responded_at, actual_unloaded_at, final_location FROM incoming_vessel_discharge_tasks WHERE driver_user_id = ? ORDER BY task_id DESC`, [user.user_id]),
                queryOptionalRows(`SELECT t.transaction_id, t.type, t.qty_change, t.reference, t.created_at, i.item_name, i.item_code FROM transaction_log t LEFT JOIN inventory_items i ON i.item_id = t.item_id WHERE ${transactionUserMatch.clause} ORDER BY t.transaction_id DESC`, transactionUserMatch.params)
            ]);

            const operations = [];

            requestCreations.forEach((row) => {
                const isMaintenance = String(row.source_role || 'internal') === 'driver';
                addOperation(operations, {
                    date: row.created_at,
                    area: isMaintenance ? 'الصيانة' : 'المستودع',
                    action: isMaintenance ? 'إنشاء طلب صيانة' : 'إنشاء طلب مادة',
                    details: buildOperationDetails(
                        `المادة: ${buildOperationDetails(row.item_name || '-', row.item_code ? `الكود: ${row.item_code}` : '')}`,
                        `الكمية: ${formatQty(row.quantity)}`,
                        row.machine_name || row.machine_code ? `المركبة: ${buildOperationDetails(row.machine_name || '', row.machine_code || '')}` : '',
                        row.requested_for_date ? `التاريخ المطلوب: ${formatReportDateTime(row.requested_for_date)}` : '',
                        row.justification ? `الملاحظة: ${row.justification}` : ''
                    ),
                    status: formatStatusLabel(row.status),
                    reference: `طلب #${row.request_id}`
                });
            });

            mechanicActions.forEach((row) => {
                addOperation(operations, {
                    date: null,
                    area: 'الصيانة',
                    action: 'اتخاذ قرار على طلب صيانة',
                    details: buildOperationDetails(
                        `المادة: ${buildOperationDetails(row.item_name || '-', row.item_code ? `الكود: ${row.item_code}` : '')}`,
                        `الكمية: ${formatQty(row.quantity)}`,
                        row.machine_name || row.machine_code ? `المركبة: ${buildOperationDetails(row.machine_name || '', row.machine_code || '')}` : '',
                        'وقت القرار غير محفوظ بشكل مستقل في قاعدة البيانات الحالية'
                    ),
                    status: formatStatusLabel(row.status),
                    reference: `طلب #${row.request_id}`
                });
            });

            requestFulfillments.forEach((row) => {
                addOperation(operations, {
                    date: row.fulfilled_at,
                    area: 'المستودع',
                    action: 'صرف طلب مادة',
                    details: buildOperationDetails(
                        `المادة: ${buildOperationDetails(row.item_name || '-', row.item_code ? `الكود: ${row.item_code}` : '')}`,
                        `المطلوب: ${formatQty(row.quantity)}`,
                        `المصروف: ${formatQty(row.issued_quantity)}`
                    ),
                    status: formatStatusLabel(row.status),
                    reference: `طلب #${row.request_id}`
                });
            });

            purchaseRequests.forEach((row) => {
                const requesterTokens = [String(row.requested_by_email || '').trim().toLowerCase(), String(row.requested_by || '').trim().toLowerCase()];
                const reviewerTokens = [String(row.reviewed_by || '').trim().toLowerCase()];
                const itemLabel = buildOperationDetails(row.item_name || '-', row.item_code_snapshot ? `الكود: ${row.item_code_snapshot}` : '');

                if (requesterTokens.includes(normalizedEmail) || requesterTokens.includes(normalizedFullName)) {
                    addOperation(operations, {
                        date: row.created_at,
                        area: 'الشراء',
                        action: 'إنشاء طلب شراء',
                        details: buildOperationDetails(`المادة: ${itemLabel}`, `الكمية: ${formatQty(row.quantity)}`, `المورد: ${row.supplier_name_snapshot || '-'}`),
                        status: formatStatusLabel(row.status),
                        reference: `طلب شراء #${row.request_id}`
                    });
                }

                if (reviewerTokens.includes(normalizedEmail) || reviewerTokens.includes(normalizedFullName)) {
                    addOperation(operations, {
                        date: row.reviewed_at,
                        area: 'الشراء',
                        action: 'مراجعة طلب شراء',
                        details: buildOperationDetails(`المادة: ${itemLabel}`, `الكمية: ${formatQty(row.quantity)}`, row.review_note ? `ملاحظة المراجعة: ${row.review_note}` : ''),
                        status: formatStatusLabel(row.status),
                        reference: `طلب شراء #${row.request_id}`
                    });
                }
            });

            dockReleaseRequests.forEach((row) => {
                const creatorTokens = [String(row.created_by_email || '').trim().toLowerCase()];
                const reviewerTokens = [String(row.reviewed_by_email || '').trim().toLowerCase()];

                if (creatorTokens.includes(normalizedEmail) || creatorTokens.includes(normalizedFullName)) {
                    addOperation(operations, {
                        date: row.created_at,
                        area: 'الرصيف',
                        action: 'إنشاء طلب إفراج',
                        details: buildOperationDetails(`الحاوية: ${row.container_number || '-'}`, `الموقع: ${row.slot_code || '-'}`, row.decision_note ? `ملاحظة: ${row.decision_note}` : ''),
                        status: formatStatusLabel(row.status),
                        reference: `إفراج #${row.request_id}`
                    });
                }

                if (reviewerTokens.includes(normalizedEmail) || reviewerTokens.includes(normalizedFullName)) {
                    addOperation(operations, {
                        date: row.reviewed_at,
                        area: 'الرصيف',
                        action: 'مراجعة طلب إفراج',
                        details: buildOperationDetails(`الحاوية: ${row.container_number || '-'}`, `الموقع: ${row.slot_code || '-'}`, row.decision_note ? `قرار المراجعة: ${row.decision_note}` : ''),
                        status: formatStatusLabel(row.status),
                        reference: `إفراج #${row.request_id}`
                    });
                }
            });

            dockDeliveryCreations.forEach((row) => {
                addOperation(operations, {
                    date: row.created_at,
                    area: 'الرصيف',
                    action: 'إنشاء طلب نقل حاوية',
                    details: buildOperationDetails(`الحاوية: ${row.container_number || '-'}`, `الموقع: ${row.slot_code || '-'}`),
                    status: formatStatusLabel(row.status),
                    reference: `نقل #${row.request_id}`
                });
            });

            driverDockRequests.forEach((row) => {
                if (!row.responded_at && String(row.status || '').trim() === 'pending') {
                    return;
                }

                addOperation(operations, {
                    date: row.responded_at || row.delivered_at,
                    area: 'الرصيف',
                    action: ['completed', 'failed'].includes(String(row.status || '').trim()) ? 'إنهاء مهمة نقل حاوية' : 'الرد على طلب نقل حاوية',
                    details: buildOperationDetails(`الحاوية: ${row.container_number || '-'}`, `الموقع: ${row.slot_code || '-'}`, row.response_note ? `ملاحظة: ${row.response_note}` : ''),
                    status: formatStatusLabel(row.status),
                    reference: `نقل #${row.request_id}`
                });
            });

            vessels.forEach((row) => {
                addOperation(operations, {
                    date: row.created_at,
                    area: 'الرصيف',
                    action: 'تسجيل باخرة',
                    details: buildOperationDetails(`اسم الباخرة: ${row.vessel_name || '-'}`, `الرحلة/IMO: ${row.voyage_reference || '-'}`, row.expected_arrival ? `الوصول المتوقع: ${formatReportDateTime(row.expected_arrival)}` : ''),
                    status: formatStatusLabel(row.status),
                    reference: `باخرة #${row.vessel_id}`
                });
            });

            dischargePlans.forEach((row) => {
                addOperation(operations, {
                    date: row.generated_at,
                    area: 'الرصيف',
                    action: 'إنشاء خطة تفريغ',
                    details: buildOperationDetails(`الباخرة: #${row.vessel_id}`, `الرصيف: ${row.proposed_berth || '-'}`, row.started_at ? `بدأت: ${formatReportDateTime(row.started_at)}` : '', row.completed_at ? `اكتملت: ${formatReportDateTime(row.completed_at)}` : ''),
                    status: formatStatusLabel(row.status),
                    reference: `خطة #${row.plan_id}`
                });
            });

            dischargeTasks.forEach((row) => {
                if (row.driver_responded_at || String(row.driver_response_status || '').trim() !== 'pending') {
                    addOperation(operations, {
                        date: row.driver_responded_at,
                        area: 'الرصيف',
                        action: 'الرد على مهمة تفريغ',
                        details: buildOperationDetails(`الحاوية: ${row.container_number || '-'}`, `الوجهة: ${row.destination_type || '-'}`, row.driver_response_note ? `ملاحظة: ${row.driver_response_note}` : ''),
                        status: formatStatusLabel(row.driver_response_status),
                        reference: `مهمة #${row.task_id}`
                    });
                }

                if (row.actual_unloaded_at) {
                    addOperation(operations, {
                        date: row.actual_unloaded_at,
                        area: 'الرصيف',
                        action: 'إتمام تفريغ حاوية',
                        details: buildOperationDetails(`الحاوية: ${row.container_number || '-'}`, `الوجهة: ${row.destination_type || '-'}`, row.final_location ? `الموقع النهائي: ${row.final_location}` : ''),
                        status: formatStatusLabel(row.status),
                        reference: `مهمة #${row.task_id}`
                    });
                }
            });

            transactionLogs.forEach((row) => {
                addOperation(operations, {
                    date: row.created_at,
                    area: 'المستودع',
                    action: `حركة مخزنية: ${formatStatusLabel(row.type)}`,
                    details: buildOperationDetails(`المادة: ${buildOperationDetails(row.item_name || '-', row.item_code ? `الكود: ${row.item_code}` : '')}`, `الكمية: ${formatQty(row.qty_change)}`, row.reference ? `المرجع التفصيلي: ${row.reference}` : ''),
                    status: formatStatusLabel(row.type),
                    reference: `حركة #${row.transaction_id}`
                });
            });

            operations.sort((left, right) => right.sortValue - left.sortValue);
            const activityAreas = Array.from(new Set(operations.map((row) => row.area).filter(Boolean)));
            const latestOperation = operations[0] || null;

            sections.push({
                title: 'ملخص النشاط',
                html: `
                    <div class="summary-grid">
                        <div class="summary-card"><strong>إجمالي العمليات</strong><span>${escapeReportHtml(String(operations.length))}</span></div>
                        <div class="summary-card"><strong>آخر عملية</strong><span>${escapeReportHtml(latestOperation ? latestOperation.action : 'لا توجد عمليات')}</span></div>
                        <div class="summary-card"><strong>آخر تحديث</strong><span>${escapeReportHtml(latestOperation ? formatReportDateTime(latestOperation.date) : '-')}</span></div>
                        <div class="summary-card"><strong>الأقسام النشطة</strong><span>${escapeReportHtml(activityAreas.length ? activityAreas.join('، ') : '-')}</span></div>
                    </div>
                `
            });

            sections.push({
                title: 'سجل العمليات الكامل',
                html: operations.length
                    ? createHtmlTable(
                        ['الوقت', 'القسم', 'العملية', 'التفاصيل', 'الحالة', 'المرجع'],
                        operations.map((row) => [formatReportDateTime(row.date), row.area || '-', row.action || '-', row.details || '-', row.status || '-', row.reference || '-'])
                    )
                    : '<p class="empty-state">لا توجد عمليات تشغيلية مرتبطة بهذا المستخدم يمكن طباعتها حاليًا.</p>'
            });

            if (roleKey === 'driver') {
                const vehicleRows = await queryOptionalRows(`SELECT machine_code, machine_name, status, facility_name FROM Machines WHERE driver_user_id = ? LIMIT 1`, [user.user_id]);
                sections.push({
                    title: 'المركبة المرتبطة',
                    html: createHtmlTable(['الرمز', 'اسم المركبة', 'الحالة', 'المرفق'], vehicleRows.map((row) => [row.machine_code || '-', row.machine_name || '-', row.status || '-', row.facility_name || '-']))
                });
            } else if (roleKey === 'dockmanager') {
                sections.push({
                    title: 'البواخر التي سجلها مدير الرصيف',
                    html: createHtmlTable(['رقم الباخرة', 'الاسم', 'الرحلة/IMO', 'الحالة', 'الوصول المتوقع', 'وقت الإنشاء'], vessels.map((row) => [row.vessel_id, row.vessel_name || '-', row.voyage_reference || '-', formatStatusLabel(row.status), formatReportDateTime(row.expected_arrival), formatReportDateTime(row.created_at)]))
                });
            }

            const html = `
                <!doctype html>
                <html lang="ar" dir="rtl">
                <head>
                    <meta charset="utf-8">
                    <title>تقرير المستخدم ${escapeReportHtml(user.full_name || user.email)}</title>
                    <style>
                        body { font-family: Tahoma, Arial, sans-serif; margin: 24px; color: #0f172a; background: #fff; }
                        .report-header { margin-bottom: 24px; border-bottom: 2px solid #dbe4ea; padding-bottom: 16px; }
                        .report-header h1 { margin: 0 0 8px; font-size: 28px; }
                        .meta-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 14px; }
                        .meta-card { border: 1px solid #dbe4ea; border-radius: 12px; padding: 12px; background: #f8fafc; }
                        .meta-card strong { display: block; margin-bottom: 6px; color: #334155; font-size: 13px; }
                        .summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
                        .summary-card { border: 1px solid #cbd5e1; border-radius: 12px; padding: 14px; background: linear-gradient(180deg, #f8fafc 0%, #eef6ff 100%); }
                        .summary-card strong { display: block; margin-bottom: 8px; color: #334155; font-size: 13px; }
                        .summary-card span { font-size: 16px; font-weight: 700; color: #0f172a; }
                        .section { margin-top: 26px; }
                        .section h2 { margin: 0 0 12px; font-size: 20px; color: #0f172a; }
                        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
                        th, td { border: 1px solid #dbe4ea; padding: 10px 8px; text-align: right; font-size: 13px; vertical-align: top; }
                        th { background: #e2e8f0; }
                        .toolbar { margin-bottom: 18px; display: flex; gap: 10px; }
                        .toolbar button { padding: 10px 14px; border: 0; border-radius: 10px; cursor: pointer; background: #0f766e; color: #fff; font-weight: 700; }
                        .toolbar .secondary { background: #475569; }
                        .empty-state { padding: 14px; border: 1px dashed #cbd5e1; border-radius: 12px; background: #f8fafc; }
                        @media print { .toolbar { display: none; } body { margin: 10mm; } }
                    </style>
                </head>
                <body>
                    <div class="toolbar">
                        <button type="button" onclick="window.print()">طباعة / حفظ PDF</button>
                        <button type="button" class="secondary" onclick="window.close()">إغلاق</button>
                    </div>
                    <header class="report-header">
                        <h1>تقرير المستخدم</h1>
                        <div class="meta-grid">
                            <div class="meta-card"><strong>الاسم</strong>${escapeReportHtml(user.full_name || '-')}</div>
                            <div class="meta-card"><strong>البريد الإلكتروني</strong>${escapeReportHtml(user.email || '-')}</div>
                            <div class="meta-card"><strong>الصلاحية</strong>${escapeReportHtml(user.role || '-')}</div>
                            <div class="meta-card"><strong>حالة الحساب</strong>${escapeReportHtml(user.account_status === 'disabled' ? 'معطل' : 'نشط')}</div>
                        </div>
                    </header>
                    ${sections.map((section) => `<section class="section"><h2>${escapeReportHtml(section.title)}</h2>${section.html}</section>`).join('')}
                    ${autoPrint ? '<script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 250); });</script>' : ''}
                </body>
                </html>
            `;

            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(200).send(html);
        } catch (error) {
            console.error('Error generating admin user report:', error);
            return res.status(500).send('تعذر إنشاء تقرير المستخدم.');
        }
    };
}

module.exports = {
    createAdminUserActivityReportHandler
};
