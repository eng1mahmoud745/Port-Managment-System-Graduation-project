function buildServiceResponse(statusCode, body) {
    return {
        statusCode,
        body
    };
}

function createDockService({
    db,
    DOCK_BERTHS,
    getCurrentUserByEmail,
    getDockDrivers,
    getLatestDockReleaseRequests,
    normalizeDockBerthKey,
    getDockBerthStatus,
    getDockLevelsForBerth
}) {
    function getDockManagerDashboard(session, callback) {
        const slotsQuery = `
            SELECT id, berth_key, level_key, slot_code, slot_order, container_number, owner_name, container_type, notes, updated_at
            FROM dock_slots
            ORDER BY FIELD(berth_key, 'A', 'B', 'C', 'TRUCK', 'TRAIN'), FIELD(level_key, 'upper', 'middle', 'lower', 'truck', 'rail'), slot_order ASC
        `;

        db.query(slotsQuery, (dockErr, slotResults) => {
            if (dockErr) {
                console.error('Error fetching dock manager dashboard:', dockErr);
                return callback(buildServiceResponse(500, { success: false, message: 'تعذر تحميل بيانات الرصيف.' }));
            }

            getCurrentUserByEmail(session.email, (userErr, user) => {
                if (userErr) {
                    console.error('Error fetching dock manager user:', userErr);
                    return callback(buildServiceResponse(500, { success: false, message: 'تعذر تحميل بيانات المستخدم.' }));
                }

                getDockDrivers((driversErr, drivers) => {
                    if (driversErr) {
                        console.error('Error fetching dock drivers:', driversErr);
                        return callback(buildServiceResponse(500, { success: false, message: 'تعذر تحميل قائمة السائقين.' }));
                    }

                    getLatestDockReleaseRequests((requestsErr, requests) => {
                        if (requestsErr) {
                            console.error('Error fetching dock requests:', requestsErr);
                            return callback(buildServiceResponse(500, { success: false, message: 'تعذر تحميل طلبات النقل.' }));
                        }

                        const requestsBySlotId = requests.reduce((accumulator, request) => {
                            accumulator[request.slot_id] = {
                                id: request.request_id,
                                containerNumber: request.container_number,
                                status: request.status,
                                customerName: request.customer_name,
                                reviewedByEmail: request.reviewed_by_email,
                                responseNote: request.decision_note,
                                createdAt: request.created_at,
                                respondedAt: request.reviewed_at
                            };
                            return accumulator;
                        }, {});

                        const berths = DOCK_BERTHS.map((berth) => {
                            const berthSlots = slotResults.filter((slot) => normalizeDockBerthKey(slot.berth_key) === berth.key);
                            const occupiedCount = berthSlots.filter((slot) => String(slot.container_number || '').trim()).length;
                            const totalSlots = berthSlots.length;
                            const berthStatus = getDockBerthStatus(occupiedCount, totalSlots);

                            return {
                                key: berth.key,
                                label: berth.label,
                                summary: {
                                    occupiedCount,
                                    totalSlots,
                                    berthStatus
                                },
                                levels: getDockLevelsForBerth(berth.key).map((level) => ({
                                    key: level.key,
                                    label: level.label,
                                    hint: level.hint || '',
                                    slots: berthSlots
                                        .filter((slot) => slot.level_key === level.key)
                                        .map((slot) => {
                                            const currentContainerNumber = String(slot.container_number || '').trim();
                                            const slotRequest = requestsBySlotId[slot.id] || null;
                                            const requestMatchesCurrentContainer = slotRequest
                                                && String(slotRequest.containerNumber || '').trim()
                                                && String(slotRequest.containerNumber || '').trim().toUpperCase() === currentContainerNumber.toUpperCase();

                                            return {
                                                id: slot.id,
                                                code: slot.slot_code,
                                                order: slot.slot_order,
                                                berthKey: berth.key,
                                                containerNumber: slot.container_number,
                                                ownerName: slot.owner_name,
                                                containerType: slot.container_type,
                                                notes: slot.notes,
                                                occupied: Boolean(currentContainerNumber),
                                                updatedAt: slot.updated_at,
                                                request: requestMatchesCurrentContainer ? slotRequest : null
                                            };
                                        })
                                }))
                            };
                        });

                        const occupiedCount = berths.reduce((total, berth) => total + Number(berth.summary.occupiedCount || 0), 0);
                        const totalSlots = berths.reduce((total, berth) => total + Number(berth.summary.totalSlots || 0), 0);

                        return callback(buildServiceResponse(200, {
                            success: true,
                            manager: {
                                name: String(user?.full_name || session.email || 'مدير الرصيف').trim(),
                                email: session.email,
                                role: session.role
                            },
                            summary: {
                                occupiedCount,
                                totalSlots,
                                berthStatus: getDockBerthStatus(occupiedCount, totalSlots)
                            },
                            drivers: drivers.map((driver) => ({
                                id: driver.user_id,
                                name: driver.full_name || driver.email,
                                email: driver.email,
                                availabilityStatus: driver.availability_status || 'متاح'
                            })),
                            berths
                        }));
                    });
                });
            });
        });
    }

    function getCompletedContainers(callback) {
        const query = `
            SELECT
                request_id,
                container_number,
                container_numbers,
                slot_code,
                owner_name,
                customer_name,
                reviewed_by_email,
                reviewed_at,
                created_at
            FROM dock_release_requests
            WHERE status = 'approved'
            ORDER BY COALESCE(reviewed_at, created_at) DESC, request_id DESC
        `;

        db.query(query, (queryErr, results) => {
            if (queryErr) {
                console.error('Error fetching completed dock containers:', queryErr);
                return callback(buildServiceResponse(500, { success: false, message: 'تعذر تحميل الحاويات المسلمة.' }));
            }

            return callback(buildServiceResponse(200, {
                success: true,
                containers: results.map((row) => ({
                    id: row.request_id,
                    containerNumber: row.container_numbers || row.container_number,
                    previousSlot: row.slot_code,
                    ownerName: row.customer_name || row.owner_name,
                    driverName: row.reviewed_by_email || 'اعتماد الإدارة',
                    completedAt: row.reviewed_at
                }))
            }));
        });
    }

    function getDockReleaseRequestContext(slotId, callback) {
        const numericSlotId = Number(slotId);

        if (!numericSlotId) {
            return callback(buildServiceResponse(400, { success: false, message: 'معرف الخانة غير صالح.' }));
        }

        const query = `
            SELECT
                s.id,
                s.slot_code,
                s.container_number,
                s.owner_name AS slot_owner_name,
                c.owner_name AS container_owner_name,
                v.vessel_name,
                v.voyage_reference,
                v.expected_arrival
            FROM dock_slots s
            LEFT JOIN incoming_vessel_containers c
                ON UPPER(TRIM(c.container_number)) = UPPER(TRIM(s.container_number))
            LEFT JOIN incoming_vessels v
                ON v.vessel_id = c.vessel_id
            WHERE s.id = ?
            ORDER BY c.id DESC
            LIMIT 1
        `;

        db.query(query, [numericSlotId], (queryErr, results) => {
            if (queryErr) {
                console.error('Error loading dock release request context:', queryErr);
                return callback(buildServiceResponse(500, { success: false, message: 'تعذر تحميل بيانات الحاوية.' }));
            }

            if (!results.length || !String(results[0].container_number || '').trim()) {
                return callback(buildServiceResponse(404, { success: false, message: 'الخانة المحددة فارغة أو غير موجودة.' }));
            }

            const row = results[0];
            return callback(buildServiceResponse(200, {
                success: true,
                context: {
                    slotId: row.id,
                    slotCode: row.slot_code,
                    containerNumber: row.container_number,
                    ownerName: row.container_owner_name || row.slot_owner_name || '',
                    vesselName: row.vessel_name || '',
                    voyageReference: row.voyage_reference || '',
                    arrivalDate: row.expected_arrival || null
                }
            }));
        });
    }

    return {
        getDockManagerDashboard,
        getCompletedContainers,
        getDockReleaseRequestContext
    };
}

module.exports = {
    createDockService
};
