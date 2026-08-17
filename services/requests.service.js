const { createWarehouseAccessResolver, parseWarehouseId } = require('../utils/warehouse-access.utils');

function buildServiceResponse(statusCode, body) {
    return { statusCode, body };
}

function createRequestsService({ db, getManagedWarehousesForUser }) {
    const { resolveWarehouseScope } = createWarehouseAccessResolver({ getManagedWarehousesForUser });

    function resolveRequestScope(authUser, requestedWarehouseId, callback) {
        resolveWarehouseScope(authUser, requestedWarehouseId, (scopeErr, scope) => {
            if (scopeErr) {
                console.error('Warehouse access resolution error for requests:', scopeErr);
                const statusCode = scopeErr.message === 'WAREHOUSE_ACCESS_DENIED' ? 403 : 500;
                const message = scopeErr.message === 'WAREHOUSE_ACCESS_DENIED'
                    ? 'لا يمكنك الوصول إلى طلبات هذا المستودع.'
                    : 'تعذر التحقق من صلاحية الوصول إلى المستودع.';
                return callback(buildServiceResponse(statusCode, { success: false, message }));
            }

            if (scope?.isSupervisor && scope?.missingSelection) {
                return callback(buildServiceResponse(400, {
                    success: false,
                    message: 'يرجى اختيار المستودع المطلوب عرضه أولاً.'
                }));
            }

            return callback(null, scope);
        });
    }

    function getScopedRequest(requestId, scope, callback) {
        const parsedRequestId = Number.parseInt(requestId, 10);
        if (!Number.isInteger(parsedRequestId) || parsedRequestId <= 0) {
            return callback(buildServiceResponse(400, { success: false, message: 'معرف الطلب غير صالح.' }));
        }

        let sql = `
            SELECT
                r.request_id,
                r.item_id,
                r.machine_id,
                r.quantity AS requested_qty,
                r.requested_by,
                r.source_role,
                r.mechanic_decision_by,
                r.status,
                i.item_name,
                i.current_qty AS available_qty,
                COALESCE(i.warehouse_id, l.warehouse_id) AS warehouse_id
            FROM requests r
            JOIN inventory_items i ON r.item_id = i.item_id
            LEFT JOIN locations l ON l.id = i.location_id
            WHERE r.request_id = ?
        `;
        const params = [parsedRequestId];

        if (scope?.warehouseId) {
            sql += ' AND COALESCE(i.warehouse_id, l.warehouse_id) = ?';
            params.push(scope.warehouseId);
        }

        sql += ' LIMIT 1';

        db.query(sql, params, (err, results) => {
            if (err) {
                console.error('Database error fetching scoped request:', err);
                return callback(buildServiceResponse(500, { success: false, message: 'فشل في جلب تفاصيل الطلب.' }));
            }

            if (!results.length) {
                return callback(buildServiceResponse(404, {
                    success: false,
                    message: 'الطلب غير موجود ضمن المستودع المحدد.'
                }));
            }

            return callback(null, results[0]);
        });
    }

    function createRequest(payload, authUser, callback) {
        const { item_id, quantity, requested_by, justification } = payload;

        if (!item_id || !quantity || parseFloat(quantity) <= 0 || !requested_by) {
            return callback(buildServiceResponse(400, {
                success: false,
                message: 'الرجاء تزويد معرف المادة item_id، الكمية المطلوبة، واسم الطالب.'
            }));
        }

        resolveRequestScope(authUser, payload?.warehouse_id, (scopeResponse, scope) => {
            if (scopeResponse) {
                return callback(scopeResponse);
            }

            let itemSql = `
                SELECT i.item_id
                FROM inventory_items i
                LEFT JOIN locations l ON l.id = i.location_id
                WHERE i.item_id = ?
            `;
            const params = [Number.parseInt(item_id, 10)];
            const targetWarehouseId = scope?.warehouseId || parseWarehouseId(payload?.warehouse_id);

            if (targetWarehouseId) {
                itemSql += ' AND COALESCE(i.warehouse_id, l.warehouse_id) = ?';
                params.push(targetWarehouseId);
            }

            itemSql += ' LIMIT 1';

            db.query(itemSql, params, (itemErr, itemRows) => {
                if (itemErr) {
                    console.error('Database error validating request item:', itemErr);
                    return callback(buildServiceResponse(500, { success: false, message: 'تعذر التحقق من المادة المطلوبة.' }));
                }

                if (!itemRows.length) {
                    return callback(buildServiceResponse(404, {
                        success: false,
                        message: 'المادة المطلوبة غير موجودة ضمن المستودع المحدد.'
                    }));
                }

                db.query(
                    `
                        INSERT INTO requests
                        (item_id, quantity, requested_by, justification, status)
                        VALUES (?, ?, ?, ?, 'جديد')
                    `,
                    [Number.parseInt(item_id, 10), parseFloat(quantity), requested_by, justification || null],
                    (err, result) => {
                        if (err) {
                            console.error('Database error during request creation:', err);
                            return callback(buildServiceResponse(500, { success: false, message: 'فشل في إنشاء طلب المادة.' }));
                        }

                        return callback(buildServiceResponse(200, {
                            success: true,
                            message: 'تم إنشاء طلب المادة بنجاح بانتظار الاعتماد.',
                            request_id: result.insertId
                        }));
                    }
                );
            });
        });
    }

    function getRequests(filters, authUser, callback) {
        resolveRequestScope(authUser, filters?.warehouse_id, (scopeResponse, scope) => {
            if (scopeResponse) {
                return callback(scopeResponse);
            }

            let sql = `
                SELECT
                    r.request_id AS id,
                    r.quantity AS qty,
                    r.requested_by,
                    r.requested_by_email,
                    r.requested_for_date,
                    r.status,
                    r.justification,
                    r.created_at AS date,
                    i.item_name AS itemName,
                    i.item_code AS itemCode
                FROM requests r
                JOIN inventory_items i ON r.item_id = i.item_id
                LEFT JOIN locations l ON l.id = i.location_id
                WHERE 1=1
            `;
            const params = [];
            const targetWarehouseId = scope?.warehouseId || parseWarehouseId(filters?.warehouse_id);

            if (targetWarehouseId) {
                sql += ' AND COALESCE(i.warehouse_id, l.warehouse_id) = ?';
                params.push(targetWarehouseId);
            }

            sql += ' ORDER BY r.created_at DESC';

            db.query(sql, params, (err, results) => {
                if (err) {
                    console.error('Database error fetching requests:', err);
                    return callback(buildServiceResponse(500, { success: false, message: 'فشل في جلب قائمة الطلبات.' }));
                }

                return callback(buildServiceResponse(200, { success: true, requests: results }));
            });
        });
    }

    function approveRequest(requestId, user, payload, authUser, callback) {
        const approvingUser = user || 'مشرف النظام';

        resolveRequestScope(authUser, payload?.warehouse_id, (scopeResponse, scope) => {
            if (scopeResponse) {
                return callback(scopeResponse);
            }

            getScopedRequest(requestId, scope, (requestResponse, request) => {
                if (requestResponse) {
                    return callback(requestResponse);
                }

                if (request.status !== 'جديد') {
                    return callback(buildServiceResponse(404, {
                        success: false,
                        message: 'الطلب غير موجود أو تم اعتماده مسبقاً.'
                    }));
                }

                const requestedQty = parseFloat(request.requested_qty);
                const availableQty = parseFloat(request.available_qty);
                let issuedQty = requestedQty;

                if (availableQty < requestedQty) {
                    issuedQty = Math.max(0, availableQty);
                    if (issuedQty === 0) {
                        return callback(buildServiceResponse(400, {
                            success: false,
                            message: 'المخزون المتوفر صفر ولا يمكن صرف المادة.'
                        }));
                    }
                }

                const negativeIssuedQty = -issuedQty;

                db.beginTransaction((err) => {
                    if (err) {
                        console.error('Transaction start error:', err);
                        return callback(buildServiceResponse(500, { success: false, message: 'فشل بدء عملية قاعدة البيانات.' }));
                    }

                    db.query(
                        'UPDATE inventory_items SET current_qty = current_qty + ? WHERE item_id = ?',
                        [negativeIssuedQty, request.item_id],
                        (updateErr, result) => {
                            if (updateErr || !result.affectedRows) {
                                return db.rollback(() => callback(buildServiceResponse(500, {
                                    success: false,
                                    message: 'فشل في تحديث كمية المخزون بعد الصرف.'
                                })));
                            }

                            db.query(
                                `INSERT INTO transaction_log (item_id, type, qty_change, reference, user) VALUES (?, 'صرف', ?, ?, ?)`,
                                [request.item_id, negativeIssuedQty, `طلب#${request.request_id} - ${request.requested_by}`, approvingUser],
                                (transactionErr) => {
                                    if (transactionErr) {
                                        return db.rollback(() => callback(buildServiceResponse(500, { success: false, message: 'فشل في تسجيل الحركة في السجل.' })));
                                    }

                                    db.query(
                                        `
                                            UPDATE requests
                                            SET status = 'تم الصرف',
                                                issued_quantity = ?,
                                                fulfilled_at = NOW(),
                                                fulfilled_by = ?
                                            WHERE request_id = ?
                                        `,
                                        [issuedQty, approvingUser, request.request_id],
                                        (requestUpdateErr, updateResult) => {
                                            if (requestUpdateErr || !updateResult.affectedRows) {
                                                return db.rollback(() => callback(buildServiceResponse(500, { success: false, message: 'فشل في تحديث حالة الطلب.' })));
                                            }

                                            db.commit((commitErr) => {
                                                if (commitErr) {
                                                    return db.rollback(() => callback(buildServiceResponse(500, { success: false, message: 'فشل في إنهاء عملية قاعدة البيانات.' })));
                                                }

                                                return callback(buildServiceResponse(200, {
                                                    success: true,
                                                    message: `تم اعتماد الطلب وصرف كمية ${issuedQty} من المادة ${request.item_name}.`
                                                }));
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
    }

    return {
        createRequest,
        getRequests,
        approveRequest
    };
}

module.exports = {
    createRequestsService
};
