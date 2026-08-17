/**
 * مسؤولية الملف: تجميع منطق المستودعات واستعلامات SQL الخاصة بها داخل service مستقل.
 */

function buildServiceResponse(statusCode, body) {
    return {
        statusCode,
        body
    };
}

function createWarehousesService({
    db,
    WAREHOUSE_TYPES,
    inferWarehouseType,
    normalizeStoredCode,
    compareEntityCodes,
    resolveEntityCode,
    findCodeConflict,
    getUsersIdColumn,
    getManagedWarehousesForUser
}) {
    function parseManagerUserId(value) {
        const parsedValue = Number.parseInt(value, 10);
        return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
    }

    function withUsersIdColumn(callback) {
        getUsersIdColumn((columnErr, userIdColumn) => {
            if (columnErr) {
                return callback(columnErr);
            }

            return callback(null, userIdColumn);
        });
    }

    function getSupervisorById(managerUserId, callback) {
        withUsersIdColumn((columnErr, userIdColumn) => {
            if (columnErr) {
                return callback(columnErr);
            }

            db.query(
                `
                    SELECT ${userIdColumn} AS user_id, role, full_name, email
                    FROM Users
                    WHERE ${userIdColumn} = ?
                    LIMIT 1
                `,
                [managerUserId],
                (queryErr, results) => {
                    if (queryErr) {
                        return callback(queryErr);
                    }

                    const supervisor = results[0] || null;
                    if (!supervisor || String(supervisor.role || '').trim().toLowerCase() !== 'supervisor') {
                        return callback(null, null);
                    }

                    return callback(null, supervisor);
                }
            );
        });
    }

    function getWarehouses(filters, callback) {
        const { search, status, warehouse_type } = filters;

        withUsersIdColumn((columnErr, userIdColumn) => {
            if (columnErr) {
                return callback(buildServiceResponse(500, {
                    success: false,
                    message: 'تعذر قراءة بنية جدول المستخدمين.'
                }));
            }

            let query = `
                SELECT
                    warehouses.id,
                    warehouses.code,
                    warehouses.name,
                    warehouses.warehouse_type,
                    warehouses.manager_user_id,
                    warehouses.location,
                    warehouses.status,
                    users.full_name AS manager_name,
                    users.email AS manager_email,
                    DATE_FORMAT(warehouses.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
                FROM warehouses
                LEFT JOIN Users AS users
                    ON warehouses.manager_user_id = users.${userIdColumn}
                WHERE 1=1
            `;
            const params = [];

            if (search) {
                query += `
                    AND (
                        warehouses.name LIKE ?
                        OR warehouses.code LIKE ?
                        OR warehouses.location LIKE ?
                        OR warehouses.warehouse_type LIKE ?
                        OR users.full_name LIKE ?
                        OR users.email LIKE ?
                    )
                `;
                const searchTerm = `%${search}%`;
                params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
            }

            if (status) {
                query += ` AND warehouses.status = ?`;
                params.push(status);
            }

            if (warehouse_type) {
                query += ` AND warehouses.warehouse_type = ?`;
                params.push(warehouse_type);
            }

            query += ` ORDER BY warehouses.code ASC;`;

            db.query(query, params, (err, results) => {
                if (err) {
                    console.error('Error fetching warehouses:', err);
                    return callback(buildServiceResponse(500, {
                        success: false,
                        message: 'فشل جلب قائمة المستودعات من قاعدة البيانات.'
                    }));
                }

                const warehouses = results
                    .map((warehouse) => ({
                        ...warehouse,
                        code: normalizeStoredCode(warehouse.code),
                        warehouse_type: inferWarehouseType(warehouse.name, warehouse.warehouse_type)
                    }))
                    .sort((left, right) => compareEntityCodes(left.code, right.code));

                return callback(buildServiceResponse(200, {
                    success: true,
                    warehouses
                }));
            });
        });
    }

    function getSupervisors(callback) {
        withUsersIdColumn((columnErr, userIdColumn) => {
            if (columnErr) {
                return callback(buildServiceResponse(500, {
                    success: false,
                    message: 'تعذر قراءة بنية جدول المستخدمين.'
                }));
            }

            db.query(
                `
                    SELECT ${userIdColumn} AS user_id, full_name, email
                    FROM Users
                    WHERE LOWER(role) = 'supervisor'
                    ORDER BY COALESCE(full_name, email) ASC, email ASC
                `,
                (queryErr, results) => {
                    if (queryErr) {
                        console.error('Error fetching supervisors for warehouses:', queryErr);
                        return callback(buildServiceResponse(500, {
                            success: false,
                            message: 'تعذر تحميل قائمة المشرفين.'
                        }));
                    }

                    return callback(buildServiceResponse(200, {
                        success: true,
                        supervisors: results
                    }));
                }
            );
        });
    }

    function getManagedWarehouses(authUser, callback) {
        const parsedUserId = Number.parseInt(authUser?.user_id, 10);
        const normalizedRole = String(authUser?.role || '').trim().toLowerCase();

        if (normalizedRole !== 'supervisor') {
            return callback(buildServiceResponse(200, {
                success: true,
                warehouses: []
            }));
        }

        if (!Number.isInteger(parsedUserId) || parsedUserId <= 0) {
            return callback(buildServiceResponse(400, {
                success: false,
                message: 'تعذر تحديد المشرف الحالي.'
            }));
        }

        getManagedWarehousesForUser(parsedUserId, (queryErr, warehouses) => {
            if (queryErr) {
                console.error('Error fetching managed warehouses for supervisor:', queryErr);
                return callback(buildServiceResponse(500, {
                    success: false,
                    message: 'تعذر تحميل المستودعات المرتبطة بالمشرف الحالي.'
                }));
            }

            return callback(buildServiceResponse(200, {
                success: true,
                warehouses
            }));
        });
    }

    function createWarehouse(warehouseData, callback) {
        const { code, name, warehouse_type, manager_user_id, location, status } = warehouseData;
        const parsedManagerUserId = parseManagerUserId(manager_user_id);

        if (!name || !warehouse_type || !parsedManagerUserId) {
            return callback(buildServiceResponse(400, {
                success: false,
                message: 'الرجاء توفير اسم المستودع ونوعه واختيار مشرف المستودع.'
            }));
        }

        if (!WAREHOUSE_TYPES.includes(warehouse_type)) {
            return callback(buildServiceResponse(400, {
                success: false,
                message: 'نوع المستودع غير صالح.'
            }));
        }

        getSupervisorById(parsedManagerUserId, (supervisorErr, supervisor) => {
            if (supervisorErr) {
                console.error('Database error while validating warehouse supervisor:', supervisorErr);
                return callback(buildServiceResponse(500, {
                    success: false,
                    message: 'تعذر التحقق من مشرف المستودع المختار.'
                }));
            }

            if (!supervisor) {
                return callback(buildServiceResponse(400, {
                    success: false,
                    message: 'المستخدم المختار ليس مشرفًا صالحًا لإدارة المستودع.'
                }));
            }

            resolveEntityCode({
                submittedCode: code,
                defaultPrefix: 'WH',
                tableName: 'warehouses',
                codeColumn: 'code'
            }, (codeErr, resolvedCode) => {
                if (codeErr) {
                    console.error('Database error during warehouse code generation:', codeErr);
                    return callback(buildServiceResponse(500, {
                        success: false,
                        message: 'خطأ في قاعدة البيانات أثناء توليد رمز المستودع.'
                    }));
                }

                findCodeConflict({
                    tableName: 'warehouses',
                    codeColumn: 'code',
                    candidateCode: resolvedCode
                }, (checkErr, conflictRow) => {
                    if (checkErr) {
                        console.error('Database error during warehouse code check:', checkErr);
                        return callback(buildServiceResponse(500, {
                            success: false,
                            message: 'خطأ في قاعدة البيانات أثناء التحقق من رمز المستودع.'
                        }));
                    }

                    if (conflictRow) {
                        return callback(buildServiceResponse(409, {
                            success: false,
                            message: 'رمز المستودع (Code) مُستخدم بالفعل. الرجاء اختيار رمز آخر.'
                        }));
                    }

                    db.query(
                        `
                            INSERT INTO warehouses
                            (code, name, warehouse_type, manager_user_id, location, status)
                            VALUES (?, ?, ?, ?, ?, ?)
                        `,
                        [resolvedCode, name, warehouse_type, parsedManagerUserId, location || null, status || 'نشط'],
                        (insertErr, result) => {
                            if (insertErr) {
                                console.error('Database error on warehouse insertion:', insertErr);
                                return callback(buildServiceResponse(500, {
                                    success: false,
                                    message: 'فشل حفظ المستودع في قاعدة البيانات.'
                                }));
                            }

                            return callback(buildServiceResponse(201, {
                                success: true,
                                message: 'تم إضافة المستودع بنجاح.',
                                id: result.insertId,
                                code: resolvedCode
                            }));
                        }
                    );
                });
            });
        });
    }

    function updateWarehouse(warehouseId, warehouseData, callback) {
        const { code, name, warehouse_type, manager_user_id, location, status } = warehouseData;
        const normalizedCode = normalizeStoredCode(code);
        const parsedManagerUserId = parseManagerUserId(manager_user_id);

        if (!warehouseId || !normalizedCode || !name || !warehouse_type || !parsedManagerUserId) {
            return callback(buildServiceResponse(400, {
                success: false,
                message: 'بيانات التحديث غير كاملة (المعرف، الرمز، الاسم، النوع، والمشرف مطلوبة).'
            }));
        }

        if (!WAREHOUSE_TYPES.includes(warehouse_type)) {
            return callback(buildServiceResponse(400, {
                success: false,
                message: 'نوع المستودع غير صالح.'
            }));
        }

        getSupervisorById(parsedManagerUserId, (supervisorErr, supervisor) => {
            if (supervisorErr) {
                console.error('Database error while validating warehouse supervisor on update:', supervisorErr);
                return callback(buildServiceResponse(500, {
                    success: false,
                    message: 'تعذر التحقق من مشرف المستودع المختار.'
                }));
            }

            if (!supervisor) {
                return callback(buildServiceResponse(400, {
                    success: false,
                    message: 'المستخدم المختار ليس مشرفًا صالحًا لإدارة المستودع.'
                }));
            }

            findCodeConflict({
                tableName: 'warehouses',
                codeColumn: 'code',
                candidateCode: normalizedCode,
                excludeColumn: 'id',
                excludeValue: warehouseId
            }, (checkErr, conflictRow) => {
                if (checkErr) {
                    console.error('Database error on warehouse update code check:', checkErr);
                    return callback(buildServiceResponse(500, {
                        success: false,
                        message: 'خطأ في قاعدة البيانات أثناء التحقق من رمز المستودع.'
                    }));
                }

                if (conflictRow) {
                    return callback(buildServiceResponse(409, {
                        success: false,
                        message: 'رمز المستودع (Code) مُستخدم بالفعل من قبل مستودع آخر.'
                    }));
                }

                db.query(
                    `
                        UPDATE warehouses
                        SET
                            code = ?,
                            name = ?,
                            warehouse_type = ?,
                            manager_user_id = ?,
                            location = ?,
                            status = ?
                        WHERE id = ?
                    `,
                    [normalizedCode, name, warehouse_type, parsedManagerUserId, location || null, status || 'نشط', warehouseId],
                    (err, result) => {
                        if (err) {
                            console.error('Database error on warehouse update:', err);

                            if (err.code === 'ER_DUP_ENTRY') {
                                return callback(buildServiceResponse(409, {
                                    success: false,
                                    message: 'رمز المستودع (Code) مُستخدم بالفعل من قبل مستودع آخر.'
                                }));
                            }

                            return callback(buildServiceResponse(500, {
                                success: false,
                                message: 'فشل خادم داخلي أثناء تحديث المستودع.'
                            }));
                        }

                        if (result.affectedRows === 0) {
                            return callback(buildServiceResponse(404, {
                                success: false,
                                message: 'المستودع المطلوب تعديله غير موجود.'
                            }));
                        }

                        return callback(buildServiceResponse(200, {
                            success: true,
                            message: `تم تحديث المستودع ID ${warehouseId} بنجاح.`
                        }));
                    }
                );
            });
        });
    }

    function deleteWarehouse(warehouseId, callback) {
        db.query(
            `
                DELETE FROM warehouses
                WHERE id = ?
            `,
            [warehouseId],
            (err, result) => {
                if (err) {
                    console.error('Database error on warehouse deletion:', err);
                    return callback(buildServiceResponse(500, {
                        success: false,
                        message: 'فشل خادم داخلي أثناء حذف المستودع.'
                    }));
                }

                if (result.affectedRows === 0) {
                    return callback(buildServiceResponse(404, {
                        success: false,
                        message: 'المستودع المطلوب حذفه غير موجود.'
                    }));
                }

                return callback(buildServiceResponse(200, {
                    success: true,
                    message: `تم حذف المستودع ID ${warehouseId} وجميع المواقع التابعة له بنجاح.`
                }));
            }
        );
    }

    return {
        getWarehouses,
        getSupervisors,
        getManagedWarehouses,
        createWarehouse,
        updateWarehouse,
        deleteWarehouse
    };
}

module.exports = {
    createWarehousesService
};
