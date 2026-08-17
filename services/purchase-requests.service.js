const { createWarehouseAccessResolver, parseWarehouseId } = require('../utils/warehouse-access.utils');

function buildServiceResponse(statusCode, body) {
    return { statusCode, body };
}

function createPurchaseRequestsService({ db, getManagedWarehousesForUser }) {
    const { resolveWarehouseScope } = createWarehouseAccessResolver({ getManagedWarehousesForUser });

    function normalizePurchaseRequestStatus(status) {
        const normalized = String(status || '').trim().toLowerCase();
        if (normalized === 'pending') return 'new';
        return normalized;
    }

    function resolvePurchaseScope(authUser, requestedWarehouseId, callback) {
        resolveWarehouseScope(authUser, requestedWarehouseId, (scopeErr, scope) => {
            if (scopeErr) {
                console.error('Warehouse access resolution error for purchase requests:', scopeErr);
                const statusCode = scopeErr.message === 'WAREHOUSE_ACCESS_DENIED' ? 403 : 500;
                const message = scopeErr.message === 'WAREHOUSE_ACCESS_DENIED'
                    ? 'لا يمكنك الوصول إلى طلبات شراء هذا المستودع.'
                    : 'تعذر التحقق من صلاحية الوصول إلى المستودع.';
                return callback(buildServiceResponse(statusCode, { success: false, message }));
            }

            if (scope?.isSupervisor && scope?.missingSelection) {
                return callback(buildServiceResponse(400, {
                    success: false,
                    message: 'يرجى اختيار المستودع المطلوب أولاً.'
                }));
            }

            return callback(null, scope);
        });
    }

    function createPurchaseRequest(payload, authUser, callback) {
        const itemId = parseInt(payload.item_id, 10);
        const quantity = parseFloat(payload.quantity);
        const supplierId = parseInt(payload.supplier_id, 10);
        const authFullName = String(authUser?.full_name || '').trim();
        const authEmail = String(authUser?.email || '').trim();
        const requestedBy = authFullName || String(payload.requested_by || '').trim() || 'مشرف النظام';
        const requestedByEmail = authEmail || String(payload.requested_by_email || '').trim() || null;
        const customItemName = String(payload.item_name || '').trim();

        if ((!Number.isInteger(itemId) && !customItemName) || !Number.isFinite(quantity) || quantity <= 0 || Number.isNaN(supplierId)) {
            return callback(buildServiceResponse(400, {
                success: false,
                message: 'يرجى اختيار مادة من المخزون أو كتابة اسم قطعة أخرى مع الكمية والمورد المقترح.'
            }));
        }

        resolvePurchaseScope(authUser, payload?.warehouse_id, (scopeResponse, scope) => {
            if (scopeResponse) {
                return callback(scopeResponse);
            }

            const targetWarehouseId = scope?.warehouseId || parseWarehouseId(payload?.warehouse_id) || null;

            db.query(
                `SELECT supplier_id, name FROM suppliers WHERE supplier_id = ? LIMIT 1`,
                [supplierId],
                (supplierErr, supplierRows) => {
                    if (supplierErr) {
                        console.error('Database error fetching supplier for purchase request:', supplierErr);
                        return callback(buildServiceResponse(500, {
                            success: false,
                            message: 'تعذر التحقق من المورد المقترح.'
                        }));
                    }

                    if (!supplierRows.length) {
                        return callback(buildServiceResponse(404, {
                            success: false,
                            message: 'المورد المقترح غير موجود.'
                        }));
                    }

                    const supplier = supplierRows[0];

                    if (!Number.isInteger(itemId)) {
                        db.query(
                            `
                                INSERT INTO purchase_requests
                                (item_id, warehouse_id, item_name, item_code_snapshot, quantity, supplier_id, supplier_name_snapshot, requested_by, requested_by_email, status)
                                VALUES (NULL, ?, ?, NULL, ?, ?, ?, ?, ?, 'new')
                            `,
                            [targetWarehouseId, customItemName, quantity, supplier.supplier_id, supplier.name, requestedBy, requestedByEmail],
                            (insertErr, result) => {
                                if (insertErr) {
                                    console.error('Database error creating custom purchase request:', insertErr);
                                    return callback(buildServiceResponse(500, {
                                        success: false,
                                        message: 'فشل في إنشاء طلب الشراء.'
                                    }));
                                }

                                return callback(buildServiceResponse(200, {
                                    success: true,
                                    message: 'تم إرسال طلب الشراء إلى الأدمن بانتظار المراجعة.',
                                    request_id: result.insertId
                                }));
                            }
                        );
                        return;
                    }

                    let itemSql = `
                        SELECT i.item_id, i.item_name, i.item_code, COALESCE(i.warehouse_id, l.warehouse_id) AS warehouse_id
                        FROM inventory_items i
                        LEFT JOIN locations l ON l.id = i.location_id
                        WHERE i.item_id = ?
                    `;
                    const itemParams = [itemId];

                    if (targetWarehouseId) {
                        itemSql += ' AND COALESCE(i.warehouse_id, l.warehouse_id) = ?';
                        itemParams.push(targetWarehouseId);
                    }

                    itemSql += ' LIMIT 1';

                    db.query(itemSql, itemParams, (itemErr, itemRows) => {
                        if (itemErr) {
                            console.error('Database error fetching item for purchase request:', itemErr);
                            return callback(buildServiceResponse(500, {
                                success: false,
                                message: 'تعذر التحقق من المادة المطلوبة.'
                            }));
                        }

                        if (!itemRows.length) {
                            return callback(buildServiceResponse(404, {
                                success: false,
                                message: 'المادة المطلوبة غير موجودة ضمن المستودع المحدد.'
                            }));
                        }

                        const item = itemRows[0];
                        db.query(
                            `
                                INSERT INTO purchase_requests
                                (item_id, warehouse_id, item_name, item_code_snapshot, quantity, supplier_id, supplier_name_snapshot, requested_by, requested_by_email, status)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')
                            `,
                            [item.item_id, item.warehouse_id || targetWarehouseId, item.item_name, item.item_code || null, quantity, supplier.supplier_id, supplier.name, requestedBy, requestedByEmail],
                            (insertErr, result) => {
                                if (insertErr) {
                                    console.error('Database error creating purchase request:', insertErr);
                                    return callback(buildServiceResponse(500, {
                                        success: false,
                                        message: 'فشل في إنشاء طلب الشراء.'
                                    }));
                                }

                                return callback(buildServiceResponse(200, {
                                    success: true,
                                    message: 'تم إرسال طلب الشراء إلى الأدمن بانتظار المراجعة.',
                                    request_id: result.insertId
                                }));
                            }
                        );
                    });
                }
            );
        });
    }

    function getPurchaseRequests(filters, authUser, callback) {
        resolvePurchaseScope(authUser, filters?.warehouse_id, (scopeResponse, scope) => {
            if (scopeResponse) {
                return callback(scopeResponse);
            }

            let sql = `
                SELECT
                    pr.request_id,
                    pr.item_id,
                    pr.item_name,
                    pr.item_code_snapshot,
                    pr.quantity,
                    pr.supplier_id,
                    COALESCE(pr.supplier_name_snapshot, s.name, '-') AS supplier_name,
                    pr.requested_by,
                    pr.requested_by_email,
                    pr.status,
                    pr.review_note,
                    pr.reviewed_by,
                    pr.reviewed_at,
                    pr.created_at
                FROM purchase_requests pr
                LEFT JOIN suppliers s ON s.supplier_id = pr.supplier_id
                LEFT JOIN inventory_items i ON i.item_id = pr.item_id
                LEFT JOIN locations l ON l.id = i.location_id
                WHERE 1=1
            `;
            const params = [];
            const targetWarehouseId = scope?.warehouseId || parseWarehouseId(filters?.warehouse_id);

            if (targetWarehouseId) {
                sql += ' AND COALESCE(pr.warehouse_id, i.warehouse_id, l.warehouse_id) = ?';
                params.push(targetWarehouseId);
            }

            sql += `
                ORDER BY
                    CASE pr.status
                        WHEN 'pending' THEN 0
                        WHEN 'approved' THEN 1
                        ELSE 2
                    END,
                    pr.created_at DESC
            `;

            db.query(sql, params, (err, results) => {
                if (err) {
                    console.error('Database error fetching purchase requests:', err);
                    return callback(buildServiceResponse(500, {
                        success: false,
                        message: 'تعذر تحميل طلبات الشراء.'
                    }));
                }

                return callback(buildServiceResponse(200, {
                    success: true,
                    requests: results
                }));
            });
        });
    }

    function decidePurchaseRequest(requestId, decision, payload, callback) {
        const parsedId = parseInt(requestId, 10);
        const normalizedDecision = String(decision || '').trim().toLowerCase();
        const normalizedStatus = normalizedDecision === 'approve'
            ? 'approved'
            : normalizedDecision === 'reject'
                ? 'rejected'
                : '';
        const reviewedBy = String(payload.user || '').trim() || 'admin';
        const reviewNote = String(payload.note || '').trim() || null;

        if (Number.isNaN(parsedId) || !normalizedStatus) {
            return callback(buildServiceResponse(400, {
                success: false,
                message: 'قرار الطلب غير صالح.'
            }));
        }

        db.query(
            `SELECT request_id, item_name, quantity, supplier_name_snapshot, status FROM purchase_requests WHERE request_id = ? LIMIT 1`,
            [parsedId],
            (fetchErr, rows) => {
                if (fetchErr) {
                    console.error('Database error fetching purchase request:', fetchErr);
                    return callback(buildServiceResponse(500, {
                        success: false,
                        message: 'تعذر جلب طلب الشراء المطلوب.'
                    }));
                }

                if (!rows.length) {
                    return callback(buildServiceResponse(404, {
                        success: false,
                        message: 'طلب الشراء غير موجود.'
                    }));
                }

                const request = rows[0];
                const currentStatus = normalizePurchaseRequestStatus(request.status);
                if (!['new', 'pending_admin_review'].includes(currentStatus)) {
                    return callback(buildServiceResponse(400, {
                        success: false,
                        message: 'تمت معالجة طلب الشراء مسبقاً.'
                    }));
                }

                db.query(
                    `UPDATE purchase_requests SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = NOW() WHERE request_id = ?`,
                    [normalizedStatus, reviewNote, reviewedBy, parsedId],
                    (updateErr, updateResult) => {
                        if (updateErr) {
                            console.error('Database error updating purchase request:', updateErr);
                            return callback(buildServiceResponse(500, {
                                success: false,
                                message: 'تعذر تحديث حالة طلب الشراء.'
                            }));
                        }

                        if (!updateResult.affectedRows) {
                            return callback(buildServiceResponse(409, {
                                success: false,
                                message: 'تعذر اعتماد قرار طلب الشراء.'
                            }));
                        }

                        const actionLabel = normalizedStatus === 'approved' ? 'تمت الموافقة على' : 'تم رفض';
                        return callback(buildServiceResponse(200, {
                            success: true,
                            message: `${actionLabel} طلب شراء القطعة ${request.item_name}.`
                        }));
                    }
                );
            }
        );
    }

    function updatePurchaseRequestStatus(requestId, nextStatus, payload, callback) {
        const parsedId = parseInt(requestId, 10);
        const normalizedNextStatus = normalizePurchaseRequestStatus(nextStatus);
        const allowedStatuses = new Set(['new', 'pending_admin_review', 'approved', 'rejected', 'printed', 'purchased', 'received']);

        if (Number.isNaN(parsedId) || !allowedStatuses.has(normalizedNextStatus)) {
            return callback(buildServiceResponse(400, {
                success: false,
                message: 'الحالة المطلوبة غير صالحة.'
            }));
        }

        db.query(
            `SELECT request_id, item_name, status FROM purchase_requests WHERE request_id = ? LIMIT 1`,
            [parsedId],
            (fetchErr, rows) => {
                if (fetchErr) {
                    console.error('Database error fetching purchase request for status update:', fetchErr);
                    return callback(buildServiceResponse(500, {
                        success: false,
                        message: 'تعذر جلب طلب الشراء.'
                    }));
                }

                if (!rows.length) {
                    return callback(buildServiceResponse(404, {
                        success: false,
                        message: 'طلب الشراء غير موجود.'
                    }));
                }

                const request = rows[0];
                const currentStatus = normalizePurchaseRequestStatus(request.status);
                const allowedTransitions = {
                    new: ['approved', 'rejected'],
                    pending_admin_review: ['approved', 'rejected'],
                    approved: ['printed'],
                    printed: ['purchased'],
                    purchased: ['received'],
                    received: [],
                    rejected: []
                };

                if (!allowedTransitions[currentStatus]?.includes(normalizedNextStatus)) {
                    return callback(buildServiceResponse(400, {
                        success: false,
                        message: 'لا يمكن تنفيذ هذا الانتقال على حالة الطلب الحالية.'
                    }));
                }

                db.query(
                    `UPDATE purchase_requests SET status = ? WHERE request_id = ?`,
                    [normalizedNextStatus, parsedId],
                    (updateErr, updateResult) => {
                        if (updateErr) {
                            console.error('Database error updating purchase request status:', updateErr);
                            return callback(buildServiceResponse(500, {
                                success: false,
                                message: 'تعذر تحديث حالة طلب الشراء.'
                            }));
                        }

                        if (!updateResult.affectedRows) {
                            return callback(buildServiceResponse(409, {
                                success: false,
                                message: 'تعذر تحديث حالة طلب الشراء.'
                            }));
                        }

                        return callback(buildServiceResponse(200, {
                            success: true,
                            message: `تم تحديث حالة طلب شراء ${request.item_name}.`,
                            status: normalizedNextStatus
                        }));
                    }
                );
            }
        );
    }

    return {
        createPurchaseRequest,
        getPurchaseRequests,
        decidePurchaseRequest,
        updatePurchaseRequestStatus
    };
}

module.exports = {
    createPurchaseRequestsService
};
