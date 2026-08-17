function createAppDependencies({
    db,
    sessions,
    AUTO_ASSIGNABLE_BERTH_KEYS,
    getUsersIdColumn,
    tableHasColumn,
    normalizeEntityCodeInput,
    escapeRegExp,
    normalizeCodePrefix,
    formatSequentialCode,
    normalizeStoredCode,
    normalizeDockBerthKey,
    getDockBerthKeyFromDestination,
    getDestinationTypeFromDockBerthKey
}) {
    function getUserAccountByEmail(email, callback) {
        getUsersIdColumn((columnErr, userIdColumn) => {
            if (columnErr) {
                return callback(columnErr);
            }

            tableHasColumn('Users', 'account_status', (statusErr, hasAccountStatusColumn) => {
                if (statusErr) {
                    return callback(statusErr);
                }

                tableHasColumn('warehouses', 'manager_user_id', (warehouseColumnErr, hasManagerUserColumn) => {
                    if (warehouseColumnErr) {
                        return callback(warehouseColumnErr);
                    }

                    const accountStatusSelect = hasAccountStatusColumn
                        ? `COALESCE(account_status, 'active') AS account_status`
                        : `'active' AS account_status`;
                    const assignedWarehousesSelect = hasManagerUserColumn
                        ? `(
                            SELECT COUNT(*)
                            FROM warehouses
                            WHERE manager_user_id = Users.${userIdColumn}
                        ) AS assigned_warehouses_count`
                        : '0 AS assigned_warehouses_count';

                    db.query(
                        `
                            SELECT ${userIdColumn} AS user_id, email, role, full_name, ${accountStatusSelect}, ${assignedWarehousesSelect}
                            FROM Users
                            WHERE email = ?
                            LIMIT 1
                        `,
                        [email],
                        (queryErr, results) => {
                            if (queryErr) {
                                return callback(queryErr);
                            }

                            return callback(null, results[0] || null);
                        }
                    );
                });
            });
        });
    }

    function isDisabledAccountStatus(value) {
        return String(value || 'active').trim().toLowerCase() === 'disabled';
    }

    function invalidateSessionsByEmail(email) {
        const normalizedEmail = String(email || '').trim().toLowerCase();
        if (!normalizedEmail) {
            return;
        }

        for (const [sessionId, session] of sessions.entries()) {
            if (String(session?.email || '').trim().toLowerCase() === normalizedEmail) {
                sessions.delete(sessionId);
            }
        }
    }

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

    function generateSequentialCode({
        tableName,
        codeColumn,
        prefix,
        scopeClause = '',
        scopeParams = []
    }, callback) {
        const normalizedPrefix = normalizeCodePrefix(prefix) || 'GEN';
        const scopeSql = scopeClause ? ` AND ${scopeClause}` : '';
        const sql = `
            SELECT ${codeColumn} AS code
            FROM ${tableName}
            WHERE UPPER(${codeColumn}) LIKE ?${scopeSql}
        `;

        db.query(sql, [`${normalizedPrefix}%`, ...scopeParams], (err, results) => {
            if (err) {
                return callback(err);
            }

            const codePattern = new RegExp(`^${escapeRegExp(normalizedPrefix)}-?(\\d+)$`, 'i');
            let maxSequence = 0;

            results.forEach((row) => {
                const currentCode = normalizeEntityCodeInput(row.code);
                const match = currentCode.match(codePattern);

                if (!match) {
                    return;
                }

                const currentSequence = parseInt(match[1], 10);
                if (!Number.isNaN(currentSequence) && currentSequence > maxSequence) {
                    maxSequence = currentSequence;
                }
            });

            callback(null, formatSequentialCode(normalizedPrefix, maxSequence + 1));
        });
    }

    function resolveEntityCode({
        submittedCode,
        defaultPrefix,
        tableName,
        codeColumn,
        scopeClause = '',
        scopeParams = []
    }, callback) {
        const normalizedCode = normalizeEntityCodeInput(submittedCode);

        if (!normalizedCode) {
            return generateSequentialCode({
                tableName,
                codeColumn,
                prefix: defaultPrefix,
                scopeClause,
                scopeParams
            }, callback);
        }

        if (/^[A-Z]+$/.test(normalizedCode)) {
            return generateSequentialCode({
                tableName,
                codeColumn,
                prefix: normalizedCode,
                scopeClause,
                scopeParams
            }, callback);
        }

        callback(null, normalizeStoredCode(normalizedCode));
    }

    function findCodeConflict({
        tableName,
        codeColumn,
        candidateCode,
        scopeClause = '',
        scopeParams = [],
        excludeColumn = '',
        excludeValue = null
    }, callback) {
        let sql = `SELECT * FROM ${tableName} WHERE 1=1`;
        const params = [];

        if (scopeClause) {
            sql += ` AND ${scopeClause}`;
            params.push(...scopeParams);
        }

        if (excludeColumn && excludeValue !== null && excludeValue !== undefined) {
            sql += ` AND ${excludeColumn} <> ?`;
            params.push(excludeValue);
        }

        db.query(sql, params, (err, results) => {
            if (err) {
                return callback(err);
            }

            const normalizedCandidate = normalizeStoredCode(candidateCode);
            const conflict = results.find((row) => normalizeStoredCode(row[codeColumn]) === normalizedCandidate);
            callback(null, conflict || null);
        });
    }

    function mapIncomingVesselRow(row) {
        if (!row) {
            return null;
        }

        return {
            id: row.vessel_id,
            vesselName: row.vessel_name,
            voyageReference: row.voyage_reference,
            expectedArrival: row.expected_arrival,
            arrivalSource: row.arrival_source || row.proposed_berth || null,
            proposedBerth: row.proposed_berth,
            expectedContainerCount: Number(row.expected_container_count || 0),
            arrivalShortageReason: row.arrival_shortage_reason || '',
            cargoType: row.cargo_type,
            dischargePriority: row.discharge_priority,
            notes: row.notes,
            status: row.status,
            createdByEmail: row.created_by_email,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            receivedContainerCount: Number(row.received_container_count || 0)
        };
    }

    function normalizeContainerWeight(value) {
        const parsedValue = Number.parseFloat(String(value || '').trim());
        if (!Number.isFinite(parsedValue) || parsedValue < 0) {
            return null;
        }

        return parsedValue;
    }

    function mapDischargePlanRow(row) {
        if (!row) {
            return null;
        }

        return {
            id: row.plan_id,
            vesselId: row.vessel_id,
            proposedBerth: row.proposed_berth,
            status: row.status,
            generatedByEmail: row.generated_by_email,
            generatedAt: row.generated_at,
            startedAt: row.started_at,
            completedAt: row.completed_at,
            notes: row.notes
        };
    }

    function mapDischargeTaskRow(row) {
        if (!row) {
            return null;
        }

        return {
            id: row.task_id,
            planId: row.plan_id,
            vesselId: row.vessel_id,
            containerId: row.container_id,
            containerNumber: row.container_number,
            destinationType: row.destination_type,
            initialDropLocation: row.initial_drop_location,
            finalLocation: row.final_location,
            driverUserId: row.driver_user_id,
            driverName: row.driver_name_snapshot,
            driverResponseStatus: row.driver_response_status || 'pending',
            driverResponseNote: row.driver_response_note,
            driverRespondedAt: row.driver_responded_at,
            machineId: row.machine_id,
            machineName: row.machine_name_snapshot,
            taskOrder: row.task_order,
            status: row.status,
            actualUnloadedAt: row.actual_unloaded_at,
            actualDriverName: row.actual_driver_name,
            actualMachineName: row.actual_machine_name
        };
    }

    function getAutoAssignableBerthLoads(callback) {
        const placeholders = AUTO_ASSIGNABLE_BERTH_KEYS.map(() => '?').join(', ');
        const query = `
            SELECT
                berth_key,
                COUNT(*) AS total_slots,
                SUM(CASE WHEN container_number IS NOT NULL AND TRIM(container_number) <> '' THEN 1 ELSE 0 END) AS occupied_slots
            FROM dock_slots
            WHERE berth_key IN (${placeholders})
            GROUP BY berth_key
        `;

        db.query(query, AUTO_ASSIGNABLE_BERTH_KEYS, (loadErr, rows) => {
            if (loadErr) {
                return callback(loadErr);
            }

            const loadsByBerth = new Map(
                rows.map((row) => [
                    String(row.berth_key || '').trim().toUpperCase(),
                    {
                        berthKey: String(row.berth_key || '').trim().toUpperCase(),
                        totalSlots: Number(row.total_slots || 0),
                        occupiedSlots: Number(row.occupied_slots || 0)
                    }
                ])
            );

            const loads = AUTO_ASSIGNABLE_BERTH_KEYS.map((berthKey) => {
                const existingLoad = loadsByBerth.get(berthKey);
                return existingLoad || {
                    berthKey,
                    totalSlots: 0,
                    occupiedSlots: 0
                };
            });

            return callback(null, loads);
        });
    }

    function compareAutoAssignableBerthLoads(left, right) {
        if (left.occupiedSlots !== right.occupiedSlots) {
            return left.occupiedSlots - right.occupiedSlots;
        }

        const leftFreeSlots = Math.max(left.totalSlots - left.occupiedSlots, 0);
        const rightFreeSlots = Math.max(right.totalSlots - right.occupiedSlots, 0);
        if (leftFreeSlots !== rightFreeSlots) {
            return rightFreeSlots - leftFreeSlots;
        }

        if (left.totalSlots !== right.totalSlots) {
            return right.totalSlots - left.totalSlots;
        }

        return String(left.berthKey || '').localeCompare(String(right.berthKey || ''));
    }

    function resolveContainersAgainstCurrentBerthLoads(containers, {
        shouldAutoAssign = (container) => !container.destinationType,
        shouldReserveExistingDestination = (container) => Boolean(container.destinationType)
    } = {}, callback) {
        const resolvedContainers = Array.isArray(containers)
            ? containers.map((container) => ({ ...container }))
            : [];

        if (!resolvedContainers.some((container) => shouldAutoAssign(container))) {
            return callback(null, resolvedContainers);
        }

        getAutoAssignableBerthLoads((loadErr, berthLoads) => {
            if (loadErr) {
                return callback(loadErr);
            }

            const loadState = new Map(
                berthLoads.map((load) => [
                    load.berthKey,
                    {
                        berthKey: load.berthKey,
                        totalSlots: Number(load.totalSlots || 0),
                        occupiedSlots: Number(load.occupiedSlots || 0)
                    }
                ])
            );

            resolvedContainers.forEach((container) => {
                if (!shouldReserveExistingDestination(container)) {
                    return;
                }

                const manualBerthKey = getDockBerthKeyFromDestination(container.destinationType);
                if (!manualBerthKey || !loadState.has(manualBerthKey)) {
                    return;
                }

                const load = loadState.get(manualBerthKey);
                load.occupiedSlots += 1;
            });

            for (const container of resolvedContainers) {
                if (!shouldAutoAssign(container)) {
                    continue;
                }

                const bestBerthLoad = Array.from(loadState.values())
                    .filter((load) => load.totalSlots > 0 && load.occupiedSlots < load.totalSlots)
                    .sort(compareAutoAssignableBerthLoads)[0];

                if (!bestBerthLoad) {
                    return callback(new Error('NO_AVAILABLE_AUTO_BERTH'));
                }

                container.destinationType = getDestinationTypeFromDockBerthKey(bestBerthLoad.berthKey);
                bestBerthLoad.occupiedSlots += 1;
            }

            return callback(null, resolvedContainers);
        });
    }

    function assignSmartContainerDestinations(containers, callback) {
        return resolveContainersAgainstCurrentBerthLoads(containers, {}, callback);
    }

    function reassignAutoContainerDestinations(containers, callback) {
        return resolveContainersAgainstCurrentBerthLoads(containers, {
            shouldAutoAssign: (container) => Boolean(container.destinationIsAuto),
            shouldReserveExistingDestination: (container) => Boolean(container.destinationType) && !container.destinationIsAuto
        }, callback);
    }

    function allocateDockSlotForContainer({ berthKey, containerNumber, ownerName, containerType, notes }, callback) {
        const normalizedBerthKey = normalizeDockBerthKey(berthKey);
        if (!normalizedBerthKey) {
            return callback(new Error('INVALID_BERTH'));
        }

        const findAvailableSlotQuery = `
            SELECT id, slot_code
            FROM dock_slots
            WHERE berth_key = ?
              AND (container_number IS NULL OR TRIM(container_number) = '')
            ORDER BY FIELD(level_key, 'lower', 'middle', 'upper'), slot_order ASC
            LIMIT 1
        `;

        db.query(findAvailableSlotQuery, [normalizedBerthKey], (slotErr, slotResults) => {
            if (slotErr) {
                return callback(slotErr);
            }

            if (!slotResults.length) {
                return callback(new Error('NO_AVAILABLE_SLOT'));
            }

            const slot = slotResults[0];
            db.query(
                `
                    UPDATE dock_slots
                    SET container_number = ?, owner_name = ?, container_type = ?, notes = ?
                    WHERE id = ?
                `,
                [containerNumber, ownerName || null, containerType || null, notes || null, slot.id],
                (updateErr) => {
                    if (updateErr) {
                        return callback(updateErr);
                    }

                    return callback(null, slot);
                }
            );
        });
    }

    function getCurrentUserByEmail(email, callback) {
        getUsersIdColumn((columnErr, userIdColumn) => {
            if (columnErr) {
                return callback(columnErr);
            }

            const query = `
                SELECT ${userIdColumn} AS user_id, email, role, full_name
                FROM Users
                WHERE email = ?
                LIMIT 1
            `;

            db.query(query, [email], (userErr, results) => {
                if (userErr) {
                    return callback(userErr);
                }

                return callback(null, results[0] || null);
            });
        });
    }

    function getManagedWarehousesForUser(userId, callback) {
        const parsedUserId = Number.parseInt(userId, 10);
        if (!Number.isInteger(parsedUserId) || parsedUserId <= 0) {
            return callback(null, []);
        }

        db.query(
            `
                SELECT id, code, name, warehouse_type, status
                FROM warehouses
                WHERE manager_user_id = ?
                ORDER BY COALESCE(name, code, '') ASC, id ASC
            `,
            [parsedUserId],
            (warehouseErr, results) => {
                if (warehouseErr) {
                    return callback(warehouseErr);
                }

                return callback(null, results);
            }
        );
    }

    function getDockDrivers(callback) {
        getUsersIdColumn((columnErr, userIdColumn) => {
            if (columnErr) {
                return callback(columnErr);
            }

            const query = `
                SELECT ${userIdColumn} AS user_id, email, full_name, availability_status
                FROM Users
                WHERE LOWER(TRIM(role)) = 'driver'
                ORDER BY COALESCE(full_name, email) ASC
            `;

            db.query(query, (driverErr, results) => {
                if (driverErr) {
                    return callback(driverErr);
                }

                return callback(null, results);
            });
        });
    }

    function getAvailableDockDrivers(options, callback) {
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }

        const ignoreDraftVesselId = Number(options?.ignoreDraftVesselId) || null;

        getUsersIdColumn((columnErr, userIdColumn) => {
            if (columnErr) {
                return callback(columnErr);
            }

            const query = `
                SELECT ${userIdColumn} AS user_id, email, full_name, availability_status
                FROM Users u
                WHERE LOWER(TRIM(u.role)) = 'driver'
                  AND COALESCE(u.availability_status, 'متاح') = 'متاح'
                  AND NOT EXISTS (
                        SELECT 1
                        FROM incoming_vessel_discharge_tasks t
                        JOIN incoming_vessel_discharge_plans p ON p.plan_id = t.plan_id
                        WHERE t.driver_user_id = u.${userIdColumn}
                          AND t.status IN ('planned', 'in_progress')
                          AND (
                                t.status = 'in_progress'
                                OR COALESCE(t.driver_response_status, 'pending') IN ('pending', 'accepted')
                          )
                          AND (
                                p.status = 'active'
                                OR (p.status = 'draft' AND (? IS NULL OR p.vessel_id <> ?))
                          )
                  )
                ORDER BY COALESCE(u.full_name, u.email) ASC
            `;

            db.query(query, [ignoreDraftVesselId, ignoreDraftVesselId], (driverErr, results) => {
                if (driverErr) {
                    return callback(driverErr);
                }

                return callback(null, results);
            });
        });
    }

    function getReadyMachines(options, callback) {
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }

        const ignoreDraftVesselId = Number(options?.ignoreDraftVesselId) || null;

        const query = `
            SELECT machine_id, machine_code, machine_name, category, status
            FROM Machines
            WHERE status = 'جاهزة'
              AND NOT EXISTS (
                    SELECT 1
                    FROM incoming_vessel_discharge_tasks t
                    JOIN incoming_vessel_discharge_plans p ON p.plan_id = t.plan_id
                    WHERE t.machine_id = Machines.machine_id
                      AND t.status IN ('planned', 'in_progress')
                      AND (
                            p.status = 'active'
                            OR (p.status = 'draft' AND (? IS NULL OR p.vessel_id <> ?))
                      )
              )
            ORDER BY machine_name ASC, machine_id ASC
        `;

        db.query(query, [ignoreDraftVesselId, ignoreDraftVesselId], (machineErr, results) => {
            if (machineErr) {
                return callback(machineErr);
            }

            return callback(null, results);
        });
    }

    function getActiveWarehouse(callback) {
        const query = `
            SELECT id, name, warehouse_type, status
            FROM warehouses
            WHERE status = 'نشط'
            ORDER BY id ASC
            LIMIT 1
        `;

        db.query(query, (warehouseErr, results) => {
            if (warehouseErr) {
                return callback(warehouseErr);
            }

            return callback(null, results[0] || null);
        });
    }

    function getLatestDockReleaseRequests(callback, options = {}) {
        const allowedStatuses = Array.isArray(options.statuses) && options.statuses.length
            ? options.statuses
            : ['pending', 'rejected'];
        const placeholders = allowedStatuses.map(() => '?').join(', ');
        const query = `
            SELECT
                r.request_id,
                r.slot_id,
                r.slot_code,
                r.berth_key,
                r.container_number,
                r.owner_name,
                r.customer_name,
                r.customs_broker_name,
                r.vessel_name,
                r.voyage_reference,
                r.bill_of_lading_number,
                r.customs_statement_number,
                r.container_numbers,
                r.container_count,
                r.arrival_date,
                r.clearance_delivery_date,
                r.notes,
                r.status,
                r.created_by_email,
                r.reviewed_by_email,
                r.decision_note,
                r.created_at,
                r.reviewed_at
            FROM dock_release_requests r
            INNER JOIN (
                SELECT slot_id, MAX(request_id) AS latest_request_id
                FROM dock_release_requests
                GROUP BY slot_id
            ) latest ON latest.latest_request_id = r.request_id
            WHERE r.status IN (${placeholders})
            ORDER BY r.created_at DESC, r.request_id DESC
        `;

        db.query(query, allowedStatuses, (requestErr, results) => {
            if (requestErr) {
                return callback(requestErr);
            }

            return callback(null, results);
        });
    }

    return {
        getUserAccountByEmail,
        isDisabledAccountStatus,
        invalidateSessionsByEmail,
        queryDb,
        resolveEntityCode,
        findCodeConflict,
        mapIncomingVesselRow,
        normalizeContainerWeight,
        mapDischargePlanRow,
        mapDischargeTaskRow,
        assignSmartContainerDestinations,
        reassignAutoContainerDestinations,
        allocateDockSlotForContainer,
        getCurrentUserByEmail,
        getManagedWarehousesForUser,
        getDockDrivers,
        getAvailableDockDrivers,
        getReadyMachines,
        getActiveWarehouse,
        getLatestDockReleaseRequests
    };
}

module.exports = {
    createAppDependencies
};
