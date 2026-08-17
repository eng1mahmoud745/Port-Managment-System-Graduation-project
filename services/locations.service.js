function buildServiceResponse(statusCode, body) {
    return {
        statusCode,
        body
    };
}

const ALLOWED_LOCATION_STATUSES = new Set(['حر', 'مشغول', 'محجوز']);

function normalizeLocationData(locationData = {}) {
    return {
        code: String(locationData.code || '').trim(),
        warehouseId: String(locationData.warehouseId || '').trim(),
        rack: String(locationData.rack || '').trim(),
        aisle: String(locationData.aisle || '').trim(),
        level: String(locationData.level || '').trim(),
        capacity: String(locationData.capacity || '').trim(),
        status: String(locationData.status || '').trim()
    };
}

function validateLocationData(locationData, {
    requireLocationId = false,
    requireCode = false,
    requireRack = false
} = {}) {
    const missingFields = [];

    if (requireLocationId && !String(locationData.locationId || '').trim()) {
        return 'معرف الموقع المطلوب للتحديث غير متوفر.';
    }

    if (requireCode && !locationData.code) missingFields.push('رمز الموقع');
    if (!locationData.warehouseId) missingFields.push('المستودع التابع');
    if (requireRack && !locationData.rack) missingFields.push('الرف');
    if (!locationData.aisle) missingFields.push('الممر');
    if (!locationData.level) missingFields.push('المستوى');
    if (!locationData.capacity) missingFields.push('السعة');
    if (!locationData.status) missingFields.push('الحالة');

    if (missingFields.length > 0) {
        return `جميع بيانات الموقع مطلوبة: ${missingFields.join('، ')}.`;
    }

    const capacityValue = Number(locationData.capacity);
    if (!Number.isFinite(capacityValue) || capacityValue <= 0) {
        return 'السعة يجب أن تكون رقمًا أكبر من صفر.';
    }

    if (!ALLOWED_LOCATION_STATUSES.has(locationData.status)) {
        return 'حالة الموقع غير صالحة.';
    }

    return null;
}

function createLocationsService({ db, resolveEntityCode }) {
    function findGlobalLocationConflict({ code, rack, excludeLocationId = null }, callback) {
        const checks = [];
        const params = [];

        if (String(code || '').trim()) {
            checks.push('code = ?');
            params.push(String(code).trim());
        }

        if (String(rack || '').trim()) {
            checks.push('rack = ?');
            params.push(String(rack).trim());
        }

        if (!checks.length) {
            return callback(null, null);
        }

        let sql = `
            SELECT id, code, rack, warehouse_id
            FROM locations
            WHERE (${checks.join(' OR ')})
        `;

        if (excludeLocationId) {
            sql += ' AND id <> ?';
            params.push(excludeLocationId);
        }

        sql += ' LIMIT 1';

        db.query(sql, params, (err, results) => {
            if (err) {
                return callback(err);
            }

            return callback(null, results[0] || null);
        });
    }

    function getLocations(filters, callback) {
        const { search, warehouseId, status } = filters;

        let query = `
            SELECT
                l.id,
                l.code,
                l.rack,
                l.aisle,
                l.level,
                l.capacity,
                CASE
                    WHEN l.status = 'محجوز' THEN 'محجوز'
                    WHEN CAST(COALESCE(NULLIF(l.capacity, ''), '0') AS DECIMAL(10,2)) > 0
                        AND COALESCE(SUM(CASE WHEN COALESCE(i.current_qty, 0) > 0 THEN i.current_qty ELSE 0 END), 0)
                            >= CAST(COALESCE(NULLIF(l.capacity, ''), '0') AS DECIMAL(10,2))
                        THEN 'مشغول'
                    ELSE 'حر'
                END AS status,
                l.status AS stored_status,
                l.warehouse_id,
                w.name AS warehouse_name,
                w.code AS warehouse_code,
                COALESCE(SUM(CASE WHEN COALESCE(i.current_qty, 0) > 0 THEN i.current_qty ELSE 0 END), 0) AS used_capacity,
                COUNT(CASE WHEN COALESCE(i.current_qty, 0) > 0 THEN 1 ELSE NULL END) AS items_count,
                GROUP_CONCAT(
                    CASE
                        WHEN COALESCE(i.current_qty, 0) > 0 THEN CONCAT(i.item_name, ' (', i.current_qty, ')')
                        ELSE NULL
                    END
                    SEPARATOR '، '
                ) AS stored_items
            FROM locations l
            JOIN warehouses w ON l.warehouse_id = w.id
            LEFT JOIN inventory_items i ON i.location_id = l.id
            WHERE 1=1
        `;
        const params = [];

        if (warehouseId) {
            query += ' AND l.warehouse_id = ?';
            params.push(warehouseId);
        }

        if (search) {
            query += ' AND (l.code LIKE ? OR l.rack LIKE ? OR l.aisle LIKE ? OR l.level LIKE ?)';
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        query += `
            GROUP BY
                l.id, l.code, l.rack, l.aisle, l.level, l.capacity, l.status,
                l.warehouse_id, w.name, w.code
        `;

        if (status) {
            query += ' HAVING status = ?';
            params.push(status);
        }

        query += ' ORDER BY l.code ASC;';

        db.query(query, params, (err, results) => {
            if (err) {
                console.error('Error fetching locations:', err);
                return callback(buildServiceResponse(500, {
                    success: false,
                    message: 'فشل جلب قائمة المواقع من قاعدة البيانات.'
                }));
            }

            return callback(buildServiceResponse(200, {
                success: true,
                locations: results
            }));
        });
    }

    function createLocation(locationData, callback) {
        const normalizedLocationData = normalizeLocationData(locationData);
        const validationMessage = validateLocationData(normalizedLocationData);
        const { code, warehouseId, rack, aisle, level, capacity, status } = normalizedLocationData;

        if (validationMessage) {
            return callback(buildServiceResponse(400, {
                success: false,
                message: validationMessage
            }));
        }

        if (!warehouseId) {
            return callback(buildServiceResponse(400, {
                success: false,
                message: 'الرجاء توفير معرف المستودع التابع.'
            }));
        }

        resolveEntityCode({
            submittedCode: code,
            defaultPrefix: 'LOC',
            tableName: 'locations',
            codeColumn: 'code'
        }, (codeErr, resolvedCode) => {
            if (codeErr) {
                console.error('Database error during location code generation:', codeErr);
                return callback(buildServiceResponse(500, {
                    success: false,
                    message: 'خطأ في قاعدة البيانات أثناء توليد رمز الموقع.'
                }));
            }

            resolveEntityCode({
                submittedCode: rack,
                defaultPrefix: 'RACK',
                tableName: 'locations',
                codeColumn: 'rack'
            }, (rackErr, resolvedRack) => {
                if (rackErr) {
                    console.error('Database error during location rack generation:', rackErr);
                    return callback(buildServiceResponse(500, {
                        success: false,
                        message: 'خطأ في قاعدة البيانات أثناء توليد الرف.'
                    }));
                }

                findGlobalLocationConflict({
                    code: resolvedCode,
                    rack: resolvedRack
                }, (conflictErr, conflict) => {
                    if (conflictErr) {
                        console.error('Database error during location uniqueness check:', conflictErr);
                        return callback(buildServiceResponse(500, {
                            success: false,
                            message: 'خطأ في قاعدة البيانات أثناء التحقق من تفرد رمز الموقع أو الرف.'
                        }));
                    }

                    if (conflict) {
                        const isCodeConflict = String(conflict.code || '').trim() === String(resolvedCode || '').trim();
                        return callback(buildServiceResponse(409, {
                            success: false,
                            message: isCodeConflict
                                ? `رمز الموقع "${resolvedCode}" مستخدم بالفعل في النظام، حتى لو كان ضمن مستودع آخر.`
                                : `الرف "${resolvedRack}" مستخدم بالفعل في النظام، حتى لو كان ضمن مستودع آخر.`
                        }));
                    }

                    const insertQuery = `
                        INSERT INTO locations
                        (code, warehouse_id, rack, aisle, level, capacity, status)
                        VALUES (?, ?, ?, ?, ?, ?, ?);
                    `;

                    const values = [
                        resolvedCode,
                        warehouseId,
                        resolvedRack || null,
                        aisle || null,
                        level || null,
                        capacity || null,
                        status || 'حر'
                    ];

                    db.query(insertQuery, values, (insertErr, result) => {
                        if (insertErr) {
                            console.error('Database error on location insertion:', insertErr);

                            if (insertErr.code === 'ER_DUP_ENTRY') {
                                return callback(buildServiceResponse(409, {
                                    success: false,
                                    message: 'رمز الموقع أو الرف مستخدم بالفعل في النظام. يرجى اختيار قيمة أخرى.'
                                }));
                            }

                            if (insertErr.code === 'ER_NO_REFERENCED_ROW_2' || insertErr.code === 'ER_NO_REFERENCED_ROW') {
                                return callback(buildServiceResponse(400, {
                                    success: false,
                                    message: 'المستودع التابع غير موجود.'
                                }));
                            }

                            return callback(buildServiceResponse(500, {
                                success: false,
                                message: 'فشل حفظ الموقع في قاعدة البيانات.'
                            }));
                        }

                        return callback(buildServiceResponse(201, {
                            success: true,
                            message: 'تم إضافة الموقع بنجاح.',
                            id: result.insertId,
                            code: resolvedCode,
                            rack: resolvedRack
                        }));
                    });
                });
            });
        });
    }

    function updateLocation(locationId, locationData, callback) {
        const normalizedLocationId = String(locationId || '').trim();
        const normalizedLocationData = normalizeLocationData(locationData);
        const validationMessage = validateLocationData({
            ...normalizedLocationData,
            locationId: normalizedLocationId
        }, {
            requireLocationId: true,
            requireCode: true,
            requireRack: true
        });
        const { code, warehouseId, rack, aisle, level, capacity, status } = normalizedLocationData;

        if (validationMessage) {
            return callback(buildServiceResponse(400, {
                success: false,
                message: validationMessage
            }));
        }

        if (!locationId || !code || !warehouseId) {
            return callback(buildServiceResponse(400, {
                success: false,
                message: 'بيانات التحديث غير كاملة (المعرف، الرمز، ومعرف المستودع مطلوبة).'
            }));
        }

        findGlobalLocationConflict({
            code,
            rack,
            excludeLocationId: locationId
        }, (conflictErr, conflict) => {
            if (conflictErr) {
                console.error('Database error during location uniqueness check on update:', conflictErr);
                return callback(buildServiceResponse(500, {
                    success: false,
                    message: 'خطأ في قاعدة البيانات أثناء التحقق من تفرد رمز الموقع أو الرف.'
                }));
            }

            if (conflict) {
                const isCodeConflict = String(conflict.code || '').trim() === String(code || '').trim();
                return callback(buildServiceResponse(409, {
                    success: false,
                    message: isCodeConflict
                        ? `رمز الموقع "${code}" مستخدم بالفعل في النظام، حتى لو كان ضمن مستودع آخر.`
                        : `الرف "${rack}" مستخدم بالفعل في النظام، حتى لو كان ضمن مستودع آخر.`
                }));
            }

            const updateQuery = `
                UPDATE locations
                SET
                    code = ?,
                    warehouse_id = ?,
                    rack = ?,
                    aisle = ?,
                    level = ?,
                    capacity = ?,
                    status = ?
                WHERE id = ?
            `;

            const values = [
                code,
                warehouseId,
                rack || null,
                aisle || null,
                level || null,
                capacity || null,
                status || 'حر',
                locationId
            ];

            db.query(updateQuery, values, (err, result) => {
                if (err) {
                    console.error('Database error on location update:', err);

                    if (err.code === 'ER_DUP_ENTRY') {
                        return callback(buildServiceResponse(409, {
                            success: false,
                            message: 'رمز الموقع أو الرف مستخدم بالفعل في النظام. يرجى اختيار قيمة أخرى.'
                        }));
                    }

                    if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') {
                        return callback(buildServiceResponse(400, {
                            success: false,
                            message: 'المستودع التابع غير موجود.'
                        }));
                    }

                    return callback(buildServiceResponse(500, {
                        success: false,
                        message: 'فشل خادم داخلي أثناء تحديث الموقع.'
                    }));
                }

                if (result.affectedRows === 0) {
                    return callback(buildServiceResponse(404, {
                        success: false,
                        message: 'الموقع المطلوب تعديله غير موجود.'
                    }));
                }

                return callback(buildServiceResponse(200, {
                    success: true,
                    message: `تم تحديث الموقع ID ${locationId} بنجاح.`
                }));
            });
        });
    }

    function deleteLocation(locationId, callback) {
        const deleteQuery = `
            DELETE FROM locations
            WHERE id = ?
        `;

        db.query(deleteQuery, [locationId], (err, result) => {
            if (err) {
                console.error('Database error on location deletion:', err);
                return callback(buildServiceResponse(500, {
                    success: false,
                    message: 'فشل خادم داخلي أثناء حذف الموقع.'
                }));
            }

            if (result.affectedRows === 0) {
                return callback(buildServiceResponse(404, {
                    success: false,
                    message: 'الموقع المطلوب حذفه غير موجود.'
                }));
            }

            return callback(buildServiceResponse(200, {
                success: true,
                message: `تم حذف الموقع ID ${locationId} بنجاح.`
            }));
        });
    }

    return {
        getLocations,
        createLocation,
        updateLocation,
        deleteLocation
    };
}

module.exports = {
    createLocationsService
};
