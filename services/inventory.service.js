const { createWarehouseAccessResolver, parseWarehouseId } = require('../utils/warehouse-access.utils');

function buildServiceResponse(statusCode, body) {
    return { statusCode, body };
}

function createInventoryService({ db, resolveEntityCode, getManagedWarehousesForUser }) {
    const { resolveWarehouseScope } = createWarehouseAccessResolver({ getManagedWarehousesForUser });

    function parseNumericValue(value) {
        const parsedValue = Number.parseFloat(String(value ?? '').trim());
        return Number.isFinite(parsedValue) ? parsedValue : 0;
    }

    function resolveInventoryScope(authUser, requestedWarehouseId, callback) {
        resolveWarehouseScope(authUser, requestedWarehouseId, (scopeErr, scope) => {
            if (scopeErr) {
                console.error('Warehouse access resolution error for inventory:', scopeErr);
                const statusCode = scopeErr.message === 'WAREHOUSE_ACCESS_DENIED' ? 403 : 500;
                const message = scopeErr.message === 'WAREHOUSE_ACCESS_DENIED'
                    ? 'ظ„ط§ ظٹظ…ظƒظ†ظƒ ط§ظ„ظˆطµظˆظ„ ط¥ظ„ظ‰ ط¨ظٹط§ظ†ط§طھ ظ‡ط°ط§ ط§ظ„ظ…ط³طھظˆط¯ط¹.'
                    : 'طھط¹ط°ط± ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† طµظ„ط§ط­ظٹط© ط§ظ„ظˆطµظˆظ„ ط¥ظ„ظ‰ ط§ظ„ظ…ط³طھظˆط¯ط¹.';
                return callback(buildServiceResponse(statusCode, { success: false, message }));
            }

            if (scope?.isSupervisor && scope?.missingSelection) {
                return callback(buildServiceResponse(400, {
                    success: false,
                    message: 'ظٹط±ط¬ظ‰ ط§ط®طھظٹط§ط± ط§ظ„ظ…ط³طھظˆط¯ط¹ ط§ظ„ظ…ط·ظ„ظˆط¨ ط¹ط±ط¶ظ‡ ط£ظˆظ„ط§ظ‹.'
                }));
            }

            return callback(null, scope);
        });
    }

    function getLocationWarehouseId(locationId, callback) {
        const parsedLocationId = Number.parseInt(locationId, 10);
        if (!Number.isInteger(parsedLocationId) || parsedLocationId <= 0) {
            return callback(null, null);
        }

        db.query(
            'SELECT warehouse_id FROM locations WHERE id = ? LIMIT 1',
            [parsedLocationId],
            (locationErr, results) => {
                if (locationErr) {
                    return callback(locationErr);
                }

                if (!results.length) {
                    return callback(new Error('LOCATION_NOT_FOUND'));
                }

                return callback(null, Number.parseInt(results[0].warehouse_id, 10) || null);
            }
        );
    }

    function getLocationWithUsage(locationId, warehouseId, callback) {
        const parsedLocationId = Number.parseInt(locationId, 10);
        const parsedWarehouseId = Number.parseInt(warehouseId, 10);

        if (!Number.isInteger(parsedLocationId) || parsedLocationId <= 0) {
            return callback(null, null);
        }

        db.query(
            `
                SELECT
                    l.id,
                    l.code,
                    l.rack,
                    l.aisle,
                    l.level,
                    l.capacity,
                    l.status,
                    l.warehouse_id,
                    COALESCE(SUM(CASE WHEN COALESCE(i.current_qty, 0) > 0 THEN i.current_qty ELSE 0 END), 0) AS used_capacity
                FROM locations l
                LEFT JOIN inventory_items i ON i.location_id = l.id
                WHERE l.id = ?
                  AND l.warehouse_id = ?
                GROUP BY l.id, l.code, l.rack, l.aisle, l.level, l.capacity, l.status, l.warehouse_id
                LIMIT 1
            `,
            [parsedLocationId, parsedWarehouseId],
            (locationErr, results) => {
                if (locationErr) {
                    return callback(locationErr);
                }

                return callback(null, results[0] || null);
            }
        );
    }

    function findSuitableLocation(warehouseId, requiredQty, callback) {
        const parsedWarehouseId = Number.parseInt(warehouseId, 10);
        const requiredCapacity = parseNumericValue(requiredQty);

        if (!Number.isInteger(parsedWarehouseId) || parsedWarehouseId <= 0 || requiredCapacity <= 0) {
            return callback(null, null);
        }

        db.query(
            `
                SELECT
                    candidate.id,
                    candidate.code,
                    candidate.rack,
                    candidate.aisle,
                    candidate.level,
                    candidate.capacity,
                    candidate.status,
                    candidate.warehouse_id,
                    candidate.used_capacity,
                    candidate.remaining_capacity
                FROM (
                    SELECT
                        l.id,
                        l.code,
                        l.rack,
                        l.aisle,
                        l.level,
                        l.capacity,
                        l.status,
                        l.warehouse_id,
                        COALESCE(SUM(CASE WHEN COALESCE(i.current_qty, 0) > 0 THEN i.current_qty ELSE 0 END), 0) AS used_capacity,
                        CAST(COALESCE(NULLIF(l.capacity, ''), '0') AS DECIMAL(10,2))
                            - COALESCE(SUM(CASE WHEN COALESCE(i.current_qty, 0) > 0 THEN i.current_qty ELSE 0 END), 0) AS remaining_capacity
                    FROM locations l
                    LEFT JOIN inventory_items i ON i.location_id = l.id
                    WHERE l.warehouse_id = ?
                      AND COALESCE(NULLIF(l.status, ''), 'ط­ط±') <> 'ظ…ط­ط¬ظˆط²'
                    GROUP BY l.id, l.code, l.rack, l.aisle, l.level, l.capacity, l.status, l.warehouse_id
                ) AS candidate
                WHERE candidate.remaining_capacity >= ?
                ORDER BY candidate.remaining_capacity ASC, candidate.id ASC
                LIMIT 1
            `,
            [parsedWarehouseId, requiredCapacity],
            (locationErr, results) => {
                if (locationErr) {
                    return callback(locationErr);
                }

                return callback(null, results[0] || null);
            }
        );
    }

    function buildLocationLabel(locationRow) {
        if (!locationRow) {
            return '';
        }

        const parts = [
            String(locationRow.rack || '').trim(),
            String(locationRow.code || '').trim()
        ].filter(Boolean);

        return parts.join(' / ');
    }

    function syncLocationStatus(locationId, callback) {
        const parsedLocationId = Number.parseInt(locationId, 10);
        if (!Number.isInteger(parsedLocationId) || parsedLocationId <= 0) {
            return callback(null);
        }

        db.query(
            `
                SELECT
                    l.id,
                    l.status AS current_status,
                    l.capacity,
                    COALESCE(SUM(CASE WHEN COALESCE(i.current_qty, 0) > 0 THEN i.current_qty ELSE 0 END), 0) AS used_capacity
                FROM locations l
                LEFT JOIN inventory_items i ON i.location_id = l.id
                WHERE l.id = ?
                GROUP BY l.id, l.status, l.capacity
                LIMIT 1
            `,
            [parsedLocationId],
            (locationErr, results) => {
                if (locationErr) {
                    return callback(locationErr);
                }

                const location = results[0] || null;
                if (!location) {
                    return callback(null);
                }

                const currentStatus = String(location.current_status || '').trim();
                const capacity = parseNumericValue(location.capacity);
                const usedCapacity = parseNumericValue(location.used_capacity);
                const nextStatus = currentStatus === 'محجوز'
                        ? 'محجوز'
                        : capacity > 0 && usedCapacity >= capacity
                            ? 'مشغول'
                            : 'حر';

                if (nextStatus === currentStatus) {
                    return callback(null, nextStatus);
                }

                db.query(
                    `UPDATE locations SET status = ? WHERE id = ?`,
                    [nextStatus, parsedLocationId],
                    (updateErr) => {
                        if (updateErr) {
                            return callback(updateErr);
                        }

                        return callback(null, nextStatus);
                    }
                );
            }
        );
    }

    function syncLocationStatuses(locationIds, callback) {
        const uniqueLocationIds = [...new Set(
            (Array.isArray(locationIds) ? locationIds : [locationIds])
                .map((locationId) => Number.parseInt(locationId, 10))
                .filter((locationId) => Number.isInteger(locationId) && locationId > 0)
        )];

        if (!uniqueLocationIds.length) {
            return callback(null);
        }

        let currentIndex = 0;
        function processNext() {
            if (currentIndex >= uniqueLocationIds.length) {
                return callback(null);
            }

            const locationId = uniqueLocationIds[currentIndex];
            currentIndex += 1;

            return syncLocationStatus(locationId, (syncErr) => {
                if (syncErr) {
                    return callback(syncErr);
                }

                return processNext();
            });
        }

        return processNext();
    }

    function getAccessibleItem(itemId, scope, callback) {
        const parsedItemId = Number.parseInt(itemId, 10);
        if (!Number.isInteger(parsedItemId) || parsedItemId <= 0) {
            return callback(buildServiceResponse(400, { success: false, message: 'ظ…ط¹ط±ظپ ط§ظ„ظ…ط§ط¯ط© ط؛ظٹط± طµط§ظ„ط­.' }));
        }

        let sql = `
            SELECT
                i.item_id,
                i.item_code,
                i.item_name,
                i.current_qty,
                i.unit,
                i.min_stock,
                i.images,
                i.location_id,
                COALESCE(i.warehouse_id, l.warehouse_id) AS warehouse_id
            FROM inventory_items i
            LEFT JOIN locations l ON l.id = i.location_id
            WHERE i.item_id = ?
        `;
        const params = [parsedItemId];

        if (scope?.warehouseId) {
            sql += ' AND COALESCE(i.warehouse_id, l.warehouse_id) = ?';
            params.push(scope.warehouseId);
        }

        sql += ' LIMIT 1';

        db.query(sql, params, (itemErr, results) => {
            if (itemErr) {
                console.error('Database error while fetching inventory item:', itemErr);
                return callback(buildServiceResponse(500, { success: false, message: 'طھط¹ط°ط± ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† ط§ظ„ظ…ط§ط¯ط© ط§ظ„ظ…ط·ظ„ظˆط¨ط©.' }));
            }

            if (!results.length) {
                return callback(buildServiceResponse(404, {
                    success: false,
                    message: 'ط§ظ„ظ…ط§ط¯ط© ط§ظ„ظ…ط·ظ„ظˆط¨ط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط© ط¶ظ…ظ† ط§ظ„ظ…ط³طھظˆط¯ط¹ ط§ظ„ظ…ط­ط¯ط¯.'
                }));
            }

            return callback(null, results[0]);
        });
    }

    function getInventoryItems(filters, authUser, callback) {
        resolveInventoryScope(authUser, filters?.warehouse_id, (scopeResponse, scope) => {
            if (scopeResponse) {
                return callback(scopeResponse);
            }

            let sql = `
                SELECT
                    i.item_id,
                    i.item_code,
                    i.item_name,
                    i.current_qty,
                    i.unit,
                    i.min_stock,
                    i.images,
                    COALESCE(i.warehouse_id, l.warehouse_id) AS warehouse_id,
                    w.name AS warehouse_name,
                    l.rack,
                    l.code AS location_code
                FROM inventory_items i
                LEFT JOIN locations l ON i.location_id = l.id
                LEFT JOIN warehouses w ON COALESCE(i.warehouse_id, l.warehouse_id) = w.id
                WHERE 1=1
            `;
            const params = [];
            const targetWarehouseId = scope?.warehouseId || parseWarehouseId(filters?.warehouse_id);

            if (targetWarehouseId) {
                sql += ' AND COALESCE(i.warehouse_id, l.warehouse_id) = ?';
                params.push(targetWarehouseId);
            }

            sql += ' ORDER BY i.item_name ASC';

            db.query(sql, params, (err, results) => {
                if (err) {
                    console.error('Database error fetching inventory items:', err);
                    return callback(buildServiceResponse(500, { success: false, message: 'ظپط´ظ„ ظپظٹ ط¬ظ„ط¨ ط¨ظٹط§ظ†ط§طھ ط§ظ„ظ…ط®ط²ظˆظ†.' }));
                }

                const items = results.map((item) => ({
                    ...item,
                    images: item.images ? JSON.parse(item.images) : []
                }));

                return callback(buildServiceResponse(200, { success: true, items }));
            });
        });
    }

    function receiveInventory(payload, authUser, callback) {
        const { item_id, qty, reference, user, attachment_paths } = payload;

        if (!item_id || !qty || parseFloat(qty) <= 0) {
            return callback(buildServiceResponse(400, {
                success: false,
                message: 'ط§ظ„ط±ط¬ط§ط، طھط²ظˆظٹط¯ ظ…ط¹ط±ظپ ط§ظ„ظ…ط§ط¯ط© item_id ظˆط§ظ„ظƒظ…ظٹط© qty ط§ظ„ظ…ظˆط¬ط¨ط©.'
            }));
        }

        resolveInventoryScope(authUser, payload?.warehouse_id, (scopeResponse, scope) => {
            if (scopeResponse) {
                return callback(scopeResponse);
            }

            getAccessibleItem(item_id, scope, (itemResponse, item) => {
                if (itemResponse) {
                    return callback(itemResponse);
                }

                const quantity = parseFloat(qty);
                db.beginTransaction((err) => {
                    if (err) {
                        console.error('Transaction start error:', err);
                        return callback(buildServiceResponse(500, { success: false, message: 'ظپط´ظ„ ط¨ط¯ط، ط¹ظ…ظ„ظٹط© ظ‚ط§ط¹ط¯ط© ط§ظ„ط¨ظٹط§ظ†ط§طھ.' }));
                    }

                    db.query('UPDATE inventory_items SET current_qty = current_qty + ? WHERE item_id = ?', [quantity, item.item_id], (updateErr, result) => {
                        if (updateErr) {
                            return db.rollback(() => callback(buildServiceResponse(500, { success: false, message: 'ظپط´ظ„ ظپظٹ طھط­ط¯ظٹط« ظƒظ…ظٹط© ط§ظ„ظ…ط®ط²ظˆظ†.' })));
                        }

                        if (!result.affectedRows) {
                            return db.rollback(() => callback(buildServiceResponse(404, { success: false, message: 'ط§ظ„ظ…ط§ط¯ط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط© ظپظٹ ط§ظ„ظ…ط®ط²ظˆظ†.' })));
                        }

                        db.query(
                            `INSERT INTO transaction_log (item_id, type, qty_change, reference, user, attachment_paths) VALUES (?, 'ط§ط³طھظ„ط§ظ…', ?, ?, ?, ?)`,
                            [item.item_id, quantity, reference || 'ط§ط³طھظ„ط§ظ… ط¯ط§ط®ظ„ظٹ', user || 'ظ…ط´ط±ظپ ط§ظ„ظ†ط¸ط§ظ…', attachment_paths || null],
                            (transactionErr, transactionResult) => {
                                if (transactionErr) {
                                    return db.rollback(() => callback(buildServiceResponse(500, { success: false, message: 'ظپط´ظ„ ظپظٹ طھط³ط¬ظٹظ„ ط§ظ„ط­ط±ظƒط© ظپظٹ ط§ظ„ط³ط¬ظ„.' })));
                                }

                                return syncLocationStatuses([item.location_id], (syncErr) => {
                                    if (syncErr) {
                                        return db.rollback(() => callback(buildServiceResponse(500, {
                                            success: false,
                                            message: 'تم تحديث كمية المادة، لكن تعذر مزامنة حالة موقع التخزين.'
                                        })));
                                    }

                                    db.commit((commitErr) => {
                                        if (commitErr) {
                                            return db.rollback(() => callback(buildServiceResponse(500, { success: false, message: 'ظپط´ظ„ ظپظٹ ط¥ظ†ظ‡ط§ط، ط¹ظ…ظ„ظٹط© ظ‚ط§ط¹ط¯ط© ط§ظ„ط¨ظٹط§ظ†ط§طھ.' })));
                                        }

                                        return callback(buildServiceResponse(200, {
                                            success: true,
                                            message: 'طھظ… ط§ط³طھظ„ط§ظ… ط§ظ„ظ…ط§ط¯ط© ظˆطھط³ط¬ظٹظ„ ط§ظ„ط­ط±ظƒط© ط¨ظ†ط¬ط§ط­.',
                                            transaction_id: transactionResult.insertId
                                        }));
                                    });
                                });
                            }
                        );
                    });
                });
            });
        });
    }

    function issueInventory(payload, authUser, callback) {
        const { item_id, qty, reference, user, attachment_paths } = payload;

        if (!item_id || !qty || parseFloat(qty) <= 0) {
            return callback(buildServiceResponse(400, {
                success: false,
                message: 'ط§ظ„ط±ط¬ط§ط، طھط²ظˆظٹط¯ ظ…ط¹ط±ظپ ط§ظ„ظ…ط§ط¯ط© item_id ظˆط§ظ„ظƒظ…ظٹط© qty ط§ظ„ظ…ظˆط¬ط¨ط© ط§ظ„ظ…ط±ط§ط¯ طµط±ظپظ‡ط§.'
            }));
        }

        resolveInventoryScope(authUser, payload?.warehouse_id, (scopeResponse, scope) => {
            if (scopeResponse) {
                return callback(scopeResponse);
            }

            getAccessibleItem(item_id, scope, (itemResponse, item) => {
                if (itemResponse) {
                    return callback(itemResponse);
                }

                const quantity = parseFloat(qty);
                const negativeQuantity = -quantity;
                db.beginTransaction((err) => {
                    if (err) {
                        console.error('Transaction start error:', err);
                        return callback(buildServiceResponse(500, { success: false, message: 'ظپط´ظ„ ط¨ط¯ط، ط¹ظ…ظ„ظٹط© ظ‚ط§ط¹ط¯ط© ط§ظ„ط¨ظٹط§ظ†ط§طھ.' }));
                    }

                    db.query('UPDATE inventory_items SET current_qty = current_qty - ? WHERE item_id = ?', [quantity, item.item_id], (updateErr, result) => {
                        if (updateErr) {
                            return db.rollback(() => callback(buildServiceResponse(500, { success: false, message: 'ظپط´ظ„ ظپظٹ طھط­ط¯ظٹط« ظƒظ…ظٹط© ط§ظ„ظ…ط®ط²ظˆظ†.' })));
                        }

                        if (!result.affectedRows) {
                            return db.rollback(() => callback(buildServiceResponse(404, { success: false, message: 'ط§ظ„ظ…ط§ط¯ط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط© ظپظٹ ط§ظ„ظ…ط®ط²ظˆظ†.' })));
                        }

                        db.query(
                            `INSERT INTO transaction_log (item_id, type, qty_change, reference, user, attachment_paths) VALUES (?, 'طµط±ظپ', ?, ?, ?, ?)`,
                            [item.item_id, negativeQuantity, reference || 'طµط±ظپ ط¯ط§ط®ظ„ظٹ', user || 'ظ…ط´ط±ظپ ط§ظ„ظ†ط¸ط§ظ…', attachment_paths || null],
                            (transactionErr, transactionResult) => {
                                if (transactionErr) {
                                    return db.rollback(() => callback(buildServiceResponse(500, { success: false, message: 'ظپط´ظ„ ظپظٹ طھط³ط¬ظٹظ„ ط§ظ„ط­ط±ظƒط© ظپظٹ ط§ظ„ط³ط¬ظ„.' })));
                                }

                                return syncLocationStatuses([item.location_id], (syncErr) => {
                                    if (syncErr) {
                                        return db.rollback(() => callback(buildServiceResponse(500, {
                                            success: false,
                                            message: 'تم تحديث كمية المادة، لكن تعذر مزامنة حالة موقع التخزين.'
                                        })));
                                    }

                                    db.commit((commitErr) => {
                                        if (commitErr) {
                                            return db.rollback(() => callback(buildServiceResponse(500, { success: false, message: 'ظپط´ظ„ ظپظٹ ط¥ظ†ظ‡ط§ط، ط¹ظ…ظ„ظٹط© ظ‚ط§ط¹ط¯ط© ط§ظ„ط¨ظٹط§ظ†ط§طھ.' })));
                                        }

                                        return callback(buildServiceResponse(200, {
                                            success: true,
                                            message: 'طھظ… طµط±ظپ ط§ظ„ظ…ط§ط¯ط© ظˆطھط³ط¬ظٹظ„ ط§ظ„ط­ط±ظƒط© ط¨ظ†ط¬ط§ط­.',
                                            transaction_id: transactionResult.insertId
                                        }));
                                    });
                                });
                            }
                        );
                    });
                });
            });
        });
    }

    function getInventoryTransactions(filters, authUser, callback) {
        resolveInventoryScope(authUser, filters?.warehouse_id, (scopeResponse, scope) => {
            if (scopeResponse) {
                return callback(scopeResponse);
            }

            let sql = `
                SELECT
                    t.transaction_id AS id,
                    t.type,
                    t.qty_change AS qty,
                    t.reference,
                    t.user,
                    t.created_at AS date,
                    i.item_name AS itemName,
                    i.item_code AS itemCode,
                    t.attachment_paths
                FROM transaction_log t
                JOIN inventory_items i ON t.item_id = i.item_id
                LEFT JOIN locations l ON l.id = i.location_id
                WHERE 1=1
            `;
            const params = [];
            const targetWarehouseId = scope?.warehouseId || parseWarehouseId(filters?.warehouse_id);

            if (targetWarehouseId) {
                sql += ' AND COALESCE(i.warehouse_id, l.warehouse_id) = ?';
                params.push(targetWarehouseId);
            }

            sql += ' ORDER BY t.created_at DESC';

            db.query(sql, params, (err, results) => {
                if (err) {
                    console.error('Database error fetching transaction log:', err);
                    return callback(buildServiceResponse(500, { success: false, message: 'ظپط´ظ„ ظپظٹ ط¬ظ„ط¨ ط³ط¬ظ„ ط§ظ„ط­ط±ظƒط§طھ.' }));
                }

                const transactions = results.map((transaction) => ({
                    ...transaction,
                    attachments: transaction.attachment_paths ? JSON.parse(transaction.attachment_paths) : []
                }));

                return callback(buildServiceResponse(200, { success: true, transactions }));
            });
        });
    }

    function getInventoryTransactionDetails(transactionId, filters, authUser, callback) {
        resolveInventoryScope(authUser, filters?.warehouse_id, (scopeResponse, scope) => {
            if (scopeResponse) {
                return callback(scopeResponse);
            }

            let sql = `
                SELECT
                    t.transaction_id AS id,
                    t.type,
                    t.qty_change AS qty,
                    t.reference,
                    t.user,
                    t.created_at AS date,
                    t.attachment_paths,
                    i.item_name,
                    i.item_code,
                    i.unit
                FROM transaction_log t
                JOIN inventory_items i ON t.item_id = i.item_id
                LEFT JOIN locations l ON l.id = i.location_id
                WHERE t.transaction_id = ?
            `;
            const params = [transactionId];
            const targetWarehouseId = scope?.warehouseId || parseWarehouseId(filters?.warehouse_id);

            if (targetWarehouseId) {
                sql += ' AND COALESCE(i.warehouse_id, l.warehouse_id) = ?';
                params.push(targetWarehouseId);
            }

            sql += ' LIMIT 1';

            db.query(sql, params, (err, results) => {
                if (err) {
                    console.error('Database error fetching transaction details:', err);
                    return callback(buildServiceResponse(500, { success: false, message: 'ظپط´ظ„ ظپظٹ ط¬ظ„ط¨ طھظپط§طµظٹظ„ ط§ظ„ط­ط±ظƒط©.' }));
                }

                if (!results.length) {
                    return callback(buildServiceResponse(404, { success: false, message: 'ط§ظ„ط­ط±ظƒط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط©.' }));
                }

                return callback(buildServiceResponse(200, { success: true, transaction: results[0] }));
            });
        });
    }

    function createInventoryItem(payload, authUser, callback) {
        const { code, name, qty, min, unit, images, user, location_id } = payload;

        if (!name || !unit) {
            return callback(buildServiceResponse(400, { success: false, message: 'الرجاء تزويد اسم ووحدة المادة.' }));
        }

        resolveInventoryScope(authUser, payload?.warehouse_id, (scopeResponse, scope) => {
            if (scopeResponse) {
                return callback(scopeResponse);
            }

            const requestedWarehouseId = parseWarehouseId(payload?.warehouse_id);
            const initialQty = parseNumericValue(qty);
            const minStock = parseNumericValue(min) || 5;
            const itemUser = user || 'مشرف النظام';
            const finalWarehouseId = scope?.warehouseId || requestedWarehouseId || null;

            if (scope?.isSupervisor && !finalWarehouseId) {
                return callback(buildServiceResponse(400, {
                    success: false,
                    message: 'يجب اختيار المستودع النشط قبل إضافة مادة جديدة.'
                }));
            }

            getLocationWarehouseId(location_id, (locationErr, locationWarehouseId) => {
                if (locationErr) {
                    if (locationErr.message === 'LOCATION_NOT_FOUND') {
                        return callback(buildServiceResponse(404, { success: false, message: 'الموقع المحدد غير موجود.' }));
                    }

                    console.error('Database error while validating location for new item:', locationErr);
                    return callback(buildServiceResponse(500, { success: false, message: 'تعذر التحقق من موقع التخزين المحدد.' }));
                }

                if (locationWarehouseId && finalWarehouseId && locationWarehouseId !== finalWarehouseId) {
                    return callback(buildServiceResponse(400, {
                        success: false,
                        message: 'الموقع المختار لا يتبع للمستودع النشط.'
                    }));
                }

                const resolvedWarehouseId = finalWarehouseId || locationWarehouseId || null;
                if (!resolvedWarehouseId) {
                    return callback(buildServiceResponse(400, {
                        success: false,
                        message: 'تعذر تحديد المستودع المطلوب لإضافة المادة.'
                    }));
                }

                resolveEntityCode({
                    submittedCode: code,
                    defaultPrefix: 'ITM',
                    tableName: 'inventory_items',
                    codeColumn: 'item_code'
                }, (codeErr, resolvedItemCode) => {
                    if (codeErr) {
                        console.error('Database error during item code generation:', codeErr);
                        return callback(buildServiceResponse(500, { success: false, message: 'خطأ في قاعدة البيانات أثناء توليد كود المادة.' }));
                    }

                    db.beginTransaction((err) => {
                        if (err) {
                            console.error('Transaction start error:', err);
                            return callback(buildServiceResponse(500, { success: false, message: 'فشل بدء عملية قاعدة البيانات.' }));
                        }

                        const continueWithLocation = (selectedLocation) => {
                            const selectedLocationId = Number.parseInt(selectedLocation?.id, 10) || null;

                            db.query(
                                `
                                    INSERT INTO inventory_items
                                    (item_code, item_name, warehouse_id, unit, min_stock, current_qty, images, location_id)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                                `,
                                [resolvedItemCode, name, resolvedWarehouseId, unit, minStock, initialQty, images || null, selectedLocationId],
                                (insertErr, result) => {
                                    if (insertErr) {
                                        if (insertErr.code === 'ER_DUP_ENTRY') {
                                            return db.rollback(() => callback(buildServiceResponse(409, {
                                                success: false,
                                                message: 'الكود المدخل موجود مسبقًا لمادة أخرى.'
                                            })));
                                        }

                                        return db.rollback(() => callback(buildServiceResponse(500, { success: false, message: 'فشل في إدراج المادة الجديدة.' })));
                                    }

                                    const finalizeSuccess = () => db.commit((commitErr) => {
                                        if (commitErr) {
                                            return db.rollback(() => callback(buildServiceResponse(500, { success: false, message: 'فشل في إنهاء عملية قاعدة البيانات.' })));
                                        }

                                        return callback(buildServiceResponse(200, {
                                            success: true,
                                            message: initialQty > 0
                                                ? 'تمت إضافة المادة وتسجيل الاستلام الأولي بنجاح.'
                                                : 'تمت إضافة المادة بنجاح (كمية المخزون صفر).',
                                            item_id: result.insertId,
                                            item_code: resolvedItemCode,
                                            location_id: selectedLocationId,
                                            location_code: selectedLocation?.code || null,
                                            location_rack: selectedLocation?.rack || null,
                                            location_label: buildLocationLabel(selectedLocation)
                                        }));
                                    });

                                    const updateLocationStatusIfNeeded = (done) => {
                                        if (!selectedLocationId || initialQty <= 0) {
                                            return done();
                                        }

                                        return syncLocationStatus(selectedLocationId, (statusErr) => {
                                            if (statusErr) {
                                                return db.rollback(() => callback(buildServiceResponse(500, {
                                                    success: false,
                                                    message: 'تم إدراج المادة، لكن تعذر تحديث حالة موقع التخزين.'
                                                })));
                                            }

                                            return done();
                                        });
                                    };

                                    if (initialQty > 0) {
                                        return db.query(
                                            `
                                                INSERT INTO transaction_log
                                                (item_id, type, qty_change, reference, user, attachment_paths)
                                                VALUES (?, 'استلام', ?, ?, ?, ?)
                                            `,
                                            [result.insertId, initialQty, 'استلام أولي عند الإضافة', itemUser, images || null],
                                            (transactionErr) => {
                                                if (transactionErr) {
                                                    return db.rollback(() => callback(buildServiceResponse(500, {
                                                        success: false,
                                                        message: 'تم إدراج المادة، لكن فشل تسجيل الحركة الأولية.'
                                                    })));
                                                }

                                                return updateLocationStatusIfNeeded(finalizeSuccess);
                                            }
                                        );
                                    }

                                    return finalizeSuccess();
                                }
                            );
                        };

                        if (location_id) {
                            return getLocationWithUsage(location_id, resolvedWarehouseId, (selectedLocationErr, selectedLocation) => {
                                if (selectedLocationErr) {
                                    console.error('Database error while loading selected location capacity:', selectedLocationErr);
                                    return db.rollback(() => callback(buildServiceResponse(500, {
                                        success: false,
                                        message: 'تعذر التحقق من سعة الموقع المحدد.'
                                    })));
                                }

                                if (!selectedLocation) {
                                    return db.rollback(() => callback(buildServiceResponse(404, {
                                        success: false,
                                        message: 'الموقع المحدد غير موجود ضمن المستودع النشط.'
                                    })));
                                }

                                if (String(selectedLocation.status || '').trim() === 'محجوز') {
                                    return db.rollback(() => callback(buildServiceResponse(400, {
                                        success: false,
                                        message: 'الموقع المحدد محجوز ولا يمكن التخزين فيه.'
                                    })));
                                }

                                const remainingCapacity = parseNumericValue(selectedLocation.capacity) - parseNumericValue(selectedLocation.used_capacity);
                                if (initialQty > 0 && remainingCapacity < initialQty) {
                                    return db.rollback(() => callback(buildServiceResponse(400, {
                                        success: false,
                                        message: 'سعة الموقع المحدد لا تكفي للكمية الأولية المطلوبة.'
                                    })));
                                }

                                return continueWithLocation(selectedLocation);
                            });
                        }

                        if (initialQty > 0) {
                            return findSuitableLocation(resolvedWarehouseId, initialQty, (autoLocationErr, autoLocation) => {
                                if (autoLocationErr) {
                                    console.error('Database error while auto-selecting item location:', autoLocationErr);
                                    return db.rollback(() => callback(buildServiceResponse(500, {
                                        success: false,
                                        message: 'تعذر تحديد موقع تخزين مناسب تلقائيًا.'
                                    })));
                                }

                                if (!autoLocation) {
                                    return db.rollback(() => callback(buildServiceResponse(400, {
                                        success: false,
                                        message: 'لا يوجد موقع متاح في المستودع النشط سعته تكفي لهذه الكمية.'
                                    })));
                                }

                                return continueWithLocation(autoLocation);
                            });
                        }

                        return continueWithLocation(null);
                    });
                });
            });
        });
    }
    function updateInventoryItem(itemId, payload, authUser, callback) {
        const { code, name, min_stock, unit, location_id, new_images } = payload;

        resolveInventoryScope(authUser, payload?.warehouse_id, (scopeResponse, scope) => {
            if (scopeResponse) {
                return callback(scopeResponse);
            }

            getAccessibleItem(itemId, scope, (itemResponse, currentItem) => {
                if (itemResponse) {
                    return callback(itemResponse);
                }

                let finalImages = [];
                try {
                    finalImages = currentItem.images ? JSON.parse(currentItem.images) : [];
                } catch (parseErr) {
                    finalImages = [];
                }

                if (new_images) {
                    try {
                        finalImages = JSON.parse(new_images);
                    } catch (parseErr) {
                        return callback(buildServiceResponse(400, { success: false, message: 'طµظٹط؛ط© JSON ظ„ظ…ط³ط§ط±ط§طھ ط§ظ„طµظˆط± ط§ظ„ط¬ط¯ظٹط¯ط© ط؛ظٹط± طµط§ظ„ط­ط©.' }));
                    }
                }

                getLocationWarehouseId(location_id, (locationErr, locationWarehouseId) => {
                    if (locationErr) {
                        if (locationErr.message === 'LOCATION_NOT_FOUND') {
                            return callback(buildServiceResponse(404, { success: false, message: 'ط§ظ„ظ…ظˆظ‚ط¹ ط§ظ„ظ…ط­ط¯ط¯ ط؛ظٹط± ظ…ظˆط¬ظˆط¯.' }));
                        }

                        console.error('Database error while validating location for item update:', locationErr);
                        return callback(buildServiceResponse(500, { success: false, message: 'طھط¹ط°ط± ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† ظ…ظˆظ‚ط¹ ط§ظ„طھط®ط²ظٹظ† ط§ظ„ظ…ط­ط¯ط¯.' }));
                    }

                    const targetWarehouseId = scope?.warehouseId
                        || parseWarehouseId(payload?.warehouse_id)
                        || Number.parseInt(currentItem.warehouse_id, 10)
                        || locationWarehouseId
                        || null;

                    if (locationWarehouseId && targetWarehouseId && locationWarehouseId !== targetWarehouseId) {
                        return callback(buildServiceResponse(400, {
                            success: false,
                            message: 'ط§ظ„ظ…ظˆظ‚ط¹ ط§ظ„ظ…ط®طھط§ط± ظ„ط§ ظٹطھط¨ط¹ ظ„ظ„ظ…ط³طھظˆط¯ط¹ ط§ظ„ظ…ط­ط¯ط¯ ظ„ظ‡ط°ظ‡ ط§ظ„ظ…ط§ط¯ط©.'
                        }));
                    }

                    db.query(
                        `
                            UPDATE inventory_items
                            SET
                                item_code = COALESCE(?, item_code),
                                item_name = COALESCE(?, item_name),
                                warehouse_id = ?,
                                min_stock = COALESCE(?, min_stock),
                                unit = COALESCE(?, unit),
                                location_id = ?,
                                images = ?
                            WHERE item_id = ?
                        `,
                        [code, name, targetWarehouseId, min_stock, unit, location_id || null, finalImages.length ? JSON.stringify(finalImages) : null, itemId],
                        (updateErr, result) => {
                            if (updateErr) {
                                console.error('Database error during item update:', updateErr);
                                return callback(buildServiceResponse(500, { success: false, message: 'ظپط´ظ„ ظپظٹ طھط­ط¯ظٹط« ط¨ظٹط§ظ†ط§طھ ط§ظ„ظ…ط§ط¯ط©.' }));
                            }

                            if (!result.affectedRows) {
                                return callback(buildServiceResponse(404, {
                                    success: false,
                                    message: 'ط§ظ„ظ…ط§ط¯ط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط© ط£ظˆ ظ„ظ… طھطھط؛ظٹط± ط§ظ„ط¨ظٹط§ظ†ط§طھ.'
                                }));
                            }

                            return syncLocationStatuses([currentItem.location_id, location_id], (syncErr) => {
                                if (syncErr) {
                                    return callback(buildServiceResponse(500, {
                                        success: false,
                                        message: 'تم تحديث بيانات المادة، لكن تعذر مزامنة حالة موقع التخزين.'
                                    }));
                                }

                                return callback(buildServiceResponse(200, { success: true, message: 'طھظ… طھط­ط¯ظٹط« ط¨ظٹط§ظ†ط§طھ ط§ظ„ظ…ط§ط¯ط© ط¨ظ†ط¬ط§ط­.' }));
                            });
                        }
                    );
                });
            });
        });
    }

    return {
        getInventoryItems,
        receiveInventory,
        issueInventory,
        getInventoryTransactions,
        getInventoryTransactionDetails,
        createInventoryItem,
        updateInventoryItem
    };
}

module.exports = {
    createInventoryService
};
