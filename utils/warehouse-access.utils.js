function normalizeRole(value) {
    return String(value || '').trim().toLowerCase();
}

function parseWarehouseId(value) {
    const parsedValue = Number.parseInt(value, 10);
    return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
}

function createWarehouseAccessResolver({ getManagedWarehousesForUser }) {
    function resolveWarehouseScope(authUser, requestedWarehouseId, callback) {
        const role = normalizeRole(authUser?.role);
        const parsedRequestedWarehouseId = parseWarehouseId(requestedWarehouseId);

        if (role !== 'supervisor') {
            return callback(null, {
                role,
                isSupervisor: false,
                warehouseId: parsedRequestedWarehouseId,
                managedWarehouses: [],
                managedWarehouseIds: []
            });
        }

        const supervisorUserId = Number.parseInt(authUser?.user_id, 10);
        if (!Number.isInteger(supervisorUserId) || supervisorUserId <= 0) {
            return callback(new Error('INVALID_SUPERVISOR_USER'));
        }

        getManagedWarehousesForUser(supervisorUserId, (managedErr, managedWarehouses) => {
            if (managedErr) {
                return callback(managedErr);
            }

            const warehouses = Array.isArray(managedWarehouses) ? managedWarehouses : [];
            const managedWarehouseIds = warehouses
                .map((warehouse) => Number.parseInt(warehouse?.id, 10))
                .filter((warehouseId) => Number.isInteger(warehouseId) && warehouseId > 0);

            if (!managedWarehouseIds.length) {
                return callback(null, {
                    role,
                    isSupervisor: true,
                    warehouseId: null,
                    managedWarehouses: warehouses,
                    managedWarehouseIds,
                    missingSelection: false
                });
            }

            const resolvedWarehouseId = parsedRequestedWarehouseId || (managedWarehouseIds.length === 1 ? managedWarehouseIds[0] : null);

            if (!resolvedWarehouseId) {
                return callback(null, {
                    role,
                    isSupervisor: true,
                    warehouseId: null,
                    managedWarehouses: warehouses,
                    managedWarehouseIds,
                    missingSelection: true
                });
            }

            if (!managedWarehouseIds.includes(resolvedWarehouseId)) {
                return callback(new Error('WAREHOUSE_ACCESS_DENIED'));
            }

            return callback(null, {
                role,
                isSupervisor: true,
                warehouseId: resolvedWarehouseId,
                managedWarehouses: warehouses,
                managedWarehouseIds,
                missingSelection: false
            });
        });
    }

    return {
        resolveWarehouseScope
    };
}

module.exports = {
    normalizeRole,
    parseWarehouseId,
    createWarehouseAccessResolver
};
