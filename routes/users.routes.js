/**
 * مسؤولية الملف: تجميع مسارات المستخدمين المطلوبة في هذه المرحلة داخل Router مستقل من دون تغيير منطق العمل الحالي.
 * ملاحظات: هذا الملف يعتمد على الاعتماديات التي يمررها app.js مثل db ودوال الصلاحيات والتقارير، ولا يعيد هندسة المنطق الحالي.
 */

const express = require('express');
const { hashPassword } = require('../utils/password.utils');
const { createAdminUserActivityReportHandler } = require('./admin-user-report.handler');

/**
 * الغرض: إنشاء Router يحتوي فقط على endpoints المستخدمين المطلوبة في هذه المرحلة وربطها بالاعتماديات اللازمة.
 * المدخلات: كائن dependencies ويحتوي على db وrequireRoles وgetUsersIdColumn وtableHasColumn وtableHasColumnAsync وgetStoredRoleName وinvalidateSessionsByEmail وqueryDb وnormalizeRoleKey وescapeReportHtml وformatReportDateTime وcreateHtmlTable.
 * المخرجات: يعيد كائن Express Router جاهزًا للربط داخل app.js على المسار `/api`.
 * الآثار الجانبية: ينشئ handlers ويستخدم الاعتماديات الممررة لتنفيذ قراءات وتعديلات على قاعدة البيانات وإرسال الاستجابات.
 * ملاحظات: المسارات المعرّفة هنا تبقي نفس الـ endpoint paths الحالية بما فيها `/api/admin/users/:userId/report`.
 */
function createUsersRoutes({
    db,
    requireRoles,
    getUsersIdColumn,
    tableHasColumn,
    tableHasColumnAsync,
    getStoredRoleName,
    invalidateSessionsByEmail,
    queryDb,
    normalizeRoleKey,
    escapeReportHtml,
    formatReportDateTime,
    createHtmlTable
}) {
    const router = express.Router();
    const getAdminUserActivityReportHandler = createAdminUserActivityReportHandler({
        getUsersIdColumn,
        tableHasColumnAsync,
        queryDb,
        normalizeRoleKey,
        escapeReportHtml,
        formatReportDateTime,
        createHtmlTable
    });

    /**
     * الغرض: جلب قائمة المستخدمين مع حالة الحساب وفق بنية جدول Users الحالية.
     * المدخلات: req لاستخراج جلسة وصلاحية الأدمن عبر middleware، وres لإرسال قائمة المستخدمين أو الخطأ المناسب.
     * المخرجات: يرسل JSON يحتوي على `{ success, users }` أو رسالة خطأ في حال تعذر قراءة البنية أو تنفيذ الاستعلام.
     * الآثار الجانبية: ينفذ استعلامات قراءة على جدول Users ويكتب الأخطاء إلى console.error عند الفشل.
     * ملاحظات: يعتمد على getUsersIdColumn وtableHasColumn لتحديد عمود المعرف ووجود account_status من دون كسر البيئات القديمة.
     */
    function getUsersHandler(req, res) {
        getUsersIdColumn((columnErr, userIdColumn) => {
            if (columnErr) {
                return res.status(500).json({ success: false, message: 'تعذر قراءة بنية جدول المستخدمين.' });
            }

            tableHasColumn('Users', 'account_status', (statusErr, hasAccountStatusColumn) => {
                if (statusErr) {
                    return res.status(500).json({ success: false, message: 'تعذر قراءة بنية جدول المستخدمين.' });
                }

                const accountStatusSelect = hasAccountStatusColumn
                    ? `COALESCE(account_status, 'active') AS account_status`
                    : `'active' AS account_status`;

                const query = `
                    SELECT 
                        ${userIdColumn} AS user_id, email, role, full_name, ${accountStatusSelect}
                    FROM Users 
                    ORDER BY ${userIdColumn} DESC;
                `;

                db.query(query, (err, results) => {
                    if (err) {
                        console.error('Error fetching users:', err);
                        return res.status(500).json({ success: false, message: 'فشل جلب قائمة المستخدمين من قاعدة البيانات.' });
                    }

                    return res.status(200).json({ success: true, users: results });
                });
            });
        });
    }

    /**
     * الغرض: إنشاء مستخدم جديد بعد التحقق من البريد الإلكتروني وتحويل الدور إلى الاسم المخزن المعتمد.
     * المدخلات: req.body ويحتوي على username وemail وpassword وrole، وres لإرسال نتيجة الإنشاء.
     * المخرجات: يرسل JSON بنتيجة إنشاء المستخدم أو رسالة الخطأ المناسبة مع الحفاظ على نفس الحقول الحالية.
     * الآثار الجانبية: ينفذ SELECT للتحقق من البريد ثم INSERT في جدول users، ويكتب الأخطاء إلى console.error عند الفشل.
     * ملاحظات: يستخدم getStoredRoleName للحفاظ على نفس صيغة الأدوار المخزنة في قاعدة البيانات.
     */
    function createUserHandler(req, res) {
        const { username, email, password, role } = req.body;
        const normalizedRole = getStoredRoleName(role);
        const checkEmailQuery = 'SELECT * FROM Users WHERE email = ?';

        if (!password) {
            return res.status(400).json({ success: false, message: 'الرجاء إدخال كلمة المرور.' });
        }

        db.query(checkEmailQuery, [email], (err, results) => {
            if (err) {
                console.error('Database error during email check:', err);
                return res.status(500).json({ success: false, message: 'خطأ في قاعدة البيانات أثناء التحقق من البريد الإلكتروني.' });
            }

            if (results.length > 0) {
                return res.status(409).json({ success: false, message: 'هذا البريد الإلكتروني مُستخدم بالفعل من قبل مستخدم آخر.' });
            }

            const insertUserQuery = `
                INSERT INTO users 
                (email , password, role , full_name, account_status) 
                VALUES (?, ?, ?, ?, 'active');
            `;

            hashPassword(password)
                .then((hashedPassword) => {
                    db.query(insertUserQuery, [email, hashedPassword, normalizedRole, username], (insertErr, result) => {
                        if (insertErr) {
                            console.error('Database error on user insertion:', insertErr);

                            if (insertErr.code === 'ER_DUP_ENTRY' && insertErr.message.includes('username')) {
                                return res.status(409).json({ success: false, message: 'اسم المستخدم مُستخدم بالفعل.' });
                            }

                            return res.status(500).json({ success: false, message: 'فشل حفظ المستخدم في قاعدة البيانات.' });
                        }

                        return res.status(201).json({
                            success: true,
                            message: 'تم إضافة المستخدم بنجاح. سيتم تحديث القائمة.',
                            userId: result.insertId
                        });
                    });
                })
                .catch((hashErr) => {
                    console.error('Password hashing error during user creation:', hashErr);
                    return res.status(500).json({ success: false, message: 'فشل حفظ المستخدم في قاعدة البيانات.' });
                });
        });
    }

    /**
     * الغرض: حذف مستخدم بالاعتماد على البريد الإلكتروني كما تتوقعه الواجهة الحالية.
     * المدخلات: req.body ويحتوي على email، وres لإرسال نتيجة الحذف.
     * المخرجات: يرسل JSON يوضح نجاح الحذف أو عدم العثور على المستخدم أو حدوث خطأ داخلي.
     * الآثار الجانبية: ينفذ DELETE على جدول Users ويكتب الأخطاء إلى console.error عند الفشل.
     * ملاحظات: يحافظ على endpoint الحالي الذي يعتمد على البريد الإلكتروني بدل معرف المستخدم.
     */
    function deleteUserByEmailHandler(req, res) {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, message: 'الرجاء إرسال البريد الإلكتروني للحذف.' });
        }

        const query = 'DELETE FROM Users WHERE email = ?';

        db.query(query, [email], (err, result) => {
            if (err) {
                console.error(`Error deleting user with email ${email}:`, err);
                return res.status(500).json({ success: false, message: 'فشل حذف المستخدم من قاعدة البيانات.' });
            }

            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, message: `لم يتم العثور على مستخدم بالبريد الإلكتروني: ${email} للحذف.` });
            }

            return res.status(200).json({
                success: true,
                message: 'تم حذف المستخدم بنجاح.'
            });
        });
    }

    /**
     * الغرض: تغيير حالة حساب مستخدم بين active وdisabled مع منع تعديل حالة الأدمن الحالي من نفس الصفحة.
     * المدخلات: req.params.userId لتحديد المستخدم، req.body.accountStatus للحالة الجديدة، وreq.authSession لمعرفة الأدمن الحالي.
     * المخرجات: يرسل JSON برسالة النجاح أو الفشل وفق نفس السلوك الحالي.
     * الآثار الجانبية: ينفذ SELECT وUPDATE على جدول Users، وقد يبطل جلسات المستخدم عبر invalidateSessionsByEmail عند التعطيل.
     * ملاحظات: يعتمد على وجود عمود account_status، ويعيد رسالة 409 واضحة إذا لم تكن البنية مجهزة بعد.
     */
    function updateUserAccountStatusHandler(req, res) {
        const userId = Number(req.params.userId);
        const nextStatus = String(req.body.accountStatus || '').trim().toLowerCase();

        if (!userId || !['active', 'disabled'].includes(nextStatus)) {
            return res.status(400).json({ success: false, message: 'بيانات الحالة الجديدة غير صالحة.' });
        }

        getUsersIdColumn((columnErr, userIdColumn) => {
            if (columnErr) {
                return res.status(500).json({ success: false, message: 'تعذر قراءة بنية جدول المستخدمين.' });
            }

            tableHasColumn('Users', 'account_status', (statusErr, hasAccountStatusColumn) => {
                if (statusErr) {
                    return res.status(500).json({ success: false, message: 'تعذر قراءة بنية جدول المستخدمين.' });
                }

                if (!hasAccountStatusColumn) {
                    return res.status(409).json({
                        success: false,
                        message: 'عمود حالة الحساب غير متوفر بعد في قاعدة البيانات. أعد تشغيل الخادم لتجهيز البنية أولاً.'
                    });
                }

                db.query(
                    `
                        SELECT ${userIdColumn} AS user_id, email, full_name, COALESCE(account_status, 'active') AS account_status
                        FROM Users
                        WHERE ${userIdColumn} = ?
                        LIMIT 1
                    `,
                    [userId],
                    (userErr, userResults) => {
                        if (userErr) {
                            console.error('Error loading user for account status update:', userErr);
                            return res.status(500).json({ success: false, message: 'تعذر تحميل بيانات المستخدم.' });
                        }

                        if (!userResults.length) {
                            return res.status(404).json({ success: false, message: 'المستخدم المطلوب غير موجود.' });
                        }

                        const targetUser = userResults[0];
                        if (String(targetUser.email || '').trim().toLowerCase() === String(req.authSession.email || '').trim().toLowerCase()) {
                            return res.status(409).json({ success: false, message: 'لا يمكن تعطيل أو تفعيل الأدمن الحالي من نفس الصفحة.' });
                        }

                        db.query(
                            `
                                UPDATE Users
                                SET account_status = ?
                                WHERE ${userIdColumn} = ?
                            `,
                            [nextStatus, userId],
                            (updateErr) => {
                                if (updateErr) {
                                    console.error('Error updating user account status:', updateErr);
                                    return res.status(500).json({ success: false, message: 'تعذر تحديث حالة المستخدم.' });
                                }

                                if (nextStatus === 'disabled') {
                                    invalidateSessionsByEmail(targetUser.email);
                                }

                                return res.status(200).json({
                                    success: true,
                                    message: nextStatus === 'disabled'
                                        ? `تم تعطيل المستخدم ${targetUser.full_name || targetUser.email}.`
                                        : `تم تفعيل المستخدم ${targetUser.full_name || targetUser.email}.`
                                });
                            }
                        );
                    }
                );
            });
        });
    }

    /**
     * الغرض: إنشاء تقرير HTML مطبوع لمستخدم واحد مع السجلات المرتبطة به بحسب دوره الحالي.
     * المدخلات: req.params.userId لتحديد المستخدم، req.query.autoprint لتفعيل الطباعة التلقائية، وres لإرجاع HTML التقرير.
     * المخرجات: يرسل مستند HTML جاهز للطباعة أو رسالة نصية عند الخطأ أو عدم العثور على المستخدم.
     * الآثار الجانبية: ينفذ عدة استعلامات قراءة عبر queryDb، ويضبط `Content-Type` على `text/html`، ويكتب الأخطاء إلى console.error عند الفشل.
     * ملاحظات: يعتمد على normalizeRoleKey وcreateHtmlTable وformatReportDateTime وescapeReportHtml، ويحافظ على نفس بنية التقرير الحالية من دون أي تغيير وظيفي.
     */
    async function getAdminUserReportHandler(req, res) {
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

            if (roleKey === 'driver') {
                const [vehicleRows, dockRequests, dischargeTasks] = await Promise.all([
                    queryDb(
                        `
                            SELECT machine_code, machine_name, status, facility_name
                            FROM Machines
                            WHERE driver_user_id = ?
                            LIMIT 1
                        `,
                        [user.user_id]
                    ),
                    queryDb(
                        `
                            SELECT request_id, container_number, slot_code, status, created_at, responded_at, response_note
                            FROM dock_delivery_requests
                            WHERE driver_user_id = ?
                            ORDER BY request_id DESC
                        `,
                        [user.user_id]
                    ),
                    queryDb(
                        `
                            SELECT task_id, container_number, destination_type, status, driver_response_status, driver_response_note, driver_responded_at, actual_unloaded_at, final_location
                            FROM incoming_vessel_discharge_tasks
                            WHERE driver_user_id = ?
                            ORDER BY task_id DESC
                        `,
                        [user.user_id]
                    )
                ]);

                sections.push({
                    title: 'المركبة المرتبطة',
                    html: createHtmlTable(
                        ['الرمز', 'اسم المركبة', 'الحالة', 'المرفق'],
                        vehicleRows.map((row) => [row.machine_code || '-', row.machine_name || '-', row.status || '-', row.facility_name || '-'])
                    )
                });

                sections.push({
                    title: 'طلبات النقل الخاصة بالسائق',
                    html: createHtmlTable(
                        ['رقم الطلب', 'الحاوية', 'الخانة', 'الحالة', 'وقت الإنشاء', 'وقت الرد', 'الملاحظة'],
                        dockRequests.map((row) => [
                            row.request_id,
                            row.container_number || '-',
                            row.slot_code || '-',
                            row.status || '-',
                            formatReportDateTime(row.created_at),
                            formatReportDateTime(row.responded_at),
                            row.response_note || '-'
                        ])
                    )
                });

                sections.push({
                    title: 'مهام تفريغ البواخر الخاصة بالسائق',
                    html: createHtmlTable(
                        ['رقم المهمة', 'الحاوية', 'الوجهة', 'حالة المهمة', 'رد السائق', 'سبب/ملاحظة', 'وقت الرد', 'وقت الإنجاز', 'الموقع النهائي'],
                        dischargeTasks.map((row) => [
                            row.task_id,
                            row.container_number || '-',
                            row.destination_type || '-',
                            row.status || '-',
                            row.driver_response_status || '-',
                            row.driver_response_note || '-',
                            formatReportDateTime(row.driver_responded_at),
                            formatReportDateTime(row.actual_unloaded_at),
                            row.final_location || '-'
                        ])
                    )
                });
            } else if (roleKey === 'dockmanager') {
                const [vessels, plans, requests] = await Promise.all([
                    queryDb(
                        `
                            SELECT vessel_id, vessel_name, voyage_reference, status, expected_arrival, created_at
                            FROM incoming_vessels
                            WHERE created_by_email = ?
                            ORDER BY vessel_id DESC
                        `,
                        [user.email]
                    ),
                    queryDb(
                        `
                            SELECT plan_id, vessel_id, proposed_berth, status, generated_at, started_at, completed_at
                            FROM incoming_vessel_discharge_plans
                            WHERE generated_by_email = ?
                            ORDER BY plan_id DESC
                        `,
                        [user.email]
                    ),
                    queryDb(
                        `
                            SELECT request_id, container_number, slot_code, status, created_at, responded_at
                            FROM dock_delivery_requests
                            WHERE created_by_email = ?
                            ORDER BY request_id DESC
                        `,
                        [user.email]
                    )
                ]);

                sections.push({
                    title: 'البواخر التي سجلها مدير الرصيف',
                    html: createHtmlTable(
                        ['رقم الباخرة', 'الاسم', 'الرحلة/IMO', 'الحالة', 'الوصول المتوقع', 'وقت الإنشاء'],
                        vessels.map((row) => [
                            row.vessel_id,
                            row.vessel_name || '-',
                            row.voyage_reference || '-',
                            row.status || '-',
                            formatReportDateTime(row.expected_arrival),
                            formatReportDateTime(row.created_at)
                        ])
                    )
                });

                sections.push({
                    title: 'خطط التفريغ التي ولدها مدير الرصيف',
                    html: createHtmlTable(
                        ['رقم الخطة', 'رقم الباخرة', 'الرصيف', 'الحالة', 'وقت التوليد', 'وقت البدء', 'وقت الاكتمال'],
                        plans.map((row) => [
                            row.plan_id,
                            row.vessel_id,
                            row.proposed_berth || '-',
                            row.status || '-',
                            formatReportDateTime(row.generated_at),
                            formatReportDateTime(row.started_at),
                            formatReportDateTime(row.completed_at)
                        ])
                    )
                });

                sections.push({
                    title: 'طلبات النقل التي أنشأها مدير الرصيف',
                    html: createHtmlTable(
                        ['رقم الطلب', 'الحاوية', 'الخانة', 'الحالة', 'وقت الإنشاء', 'وقت التنفيذ/الرد'],
                        requests.map((row) => [
                            row.request_id,
                            row.container_number || '-',
                            row.slot_code || '-',
                            row.status || '-',
                            formatReportDateTime(row.created_at),
                            formatReportDateTime(row.responded_at)
                        ])
                    )
                });
            } else {
                sections.push({
                    title: 'ملخص السجلات المرتبطة',
                    html: '<p class="empty-state">لا توجد في قاعدة البيانات الحالية سجلات تشغيلية مرتبطة مباشرة بهذا المستخدم يمكن طباعتها بشكل فردي.</p>'
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
                        .section { margin-top: 26px; }
                        .section h2 { margin: 0 0 12px; font-size: 20px; color: #0f172a; }
                        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
                        th, td { border: 1px solid #dbe4ea; padding: 10px 8px; text-align: right; font-size: 13px; vertical-align: top; }
                        th { background: #e2e8f0; }
                        .toolbar { margin-bottom: 18px; display: flex; gap: 10px; }
                        .toolbar button { padding: 10px 14px; border: 0; border-radius: 10px; cursor: pointer; background: #0f766e; color: #fff; font-weight: 700; }
                        .toolbar .secondary { background: #475569; }
                        .empty-state { padding: 14px; border: 1px dashed #cbd5e1; border-radius: 12px; background: #f8fafc; }
                        @media print {
                            .toolbar { display: none; }
                            body { margin: 10mm; }
                        }
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
    }

    router.get('/users', requireRoles(['admin']), getUsersHandler);
    router.post('/users', requireRoles(['admin']), createUserHandler);
    router.delete('/users/delete-by-email', requireRoles(['admin']), deleteUserByEmailHandler);
    router.post('/users/:userId/account-status', requireRoles(['admin']), updateUserAccountStatusHandler);
    router.get('/admin/users/:userId/report', requireRoles(['admin']), getAdminUserActivityReportHandler);

    return router;
}

module.exports = {
    createUsersRoutes
};
