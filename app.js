const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const db = require('./config/db');
const {
    DOCK_BERTHS,
    AUTO_ASSIGNABLE_BERTH_KEYS,
    WAREHOUSE_TYPES
} = require('./config/constants');
const {
    normalizeRoleKey,
    getStoredRoleName,
    getRoleRedirectPath,
    getSessionIdFromRequest,
    setNoStoreHeaders
} = require('./utils/auth.utils');
const {
    normalizeEntityCodeInput,
    escapeRegExp,
    normalizeCodePrefix,
    formatSequentialCode,
    normalizeStoredCode,
    compareEntityCodes
} = require('./utils/code.utils');
const {
    escapeReportHtml,
    formatReportDateTime,
    createHtmlTable
} = require('./utils/report.utils');
const {
    normalizeMysqlDateTime,
    normalizeDischargePriority,
    normalizeContainerCondition,
    normalizeContainerDestination,
    normalizeCargoType,
    getPriorityRank,
    getDestinationRank,
    getContainerCompletionStatus,
    getDefaultFinalLocation,
    getDockLevelMeta,
    getDockBerthMeta,
    getDockLevelsForBerth,
    normalizeDockBerthKey,
    getDockBerthKeyFromDestination,
    getDestinationTypeFromDockBerthKey,
    getDockBerthStatus
} = require('./utils/dock.utils');
const { createRequireRoles } = require('./middlewares/role.middleware');
const { createAuthMiddleware } = require('./middlewares/auth.middleware');
const {
    getUsersIdColumn,
    tableHasColumn,
    tableHasColumnAsync,
    inferWarehouseType,
    ensureDriverColumns,
    ensureUserPasswordSchema,
    ensureUserAccountStatusSchema,
    ensureMachineDriverSchema,
    ensureWarehouseSchema,
    ensureInventoryWarehouseSchema,
    ensureDockSlotsSchema,
    ensureDockRequestsSchema,
    ensureDockReleaseRequestsSchema,
    ensureIncomingVesselsSchema,
    ensureIncomingVesselContainersSchema,
    ensureIncomingVesselDischargeSchema,
    ensureDriverInspectionsSchema,
    ensureRequestsWorkflowSchema,
    ensurePurchaseRequestsSchema
} = require('./setup/schema.setup');
const { createAppDependencies } = require('./services/app-dependencies.service');
const { createAuthRoutes } = require('./routes/auth.routes');
const { createSuppliersRoutes } = require('./routes/suppliers.routes');
const { createWarehousesRoutes } = require('./routes/warehouses.routes');
const { createLocationsRoutes } = require('./routes/locations.routes');
const { createUsersRoutes } = require('./routes/users.routes');
const { createMachinesRoutes } = require('./routes/machines.routes');
const { createDriversRoutes } = require('./routes/drivers.routes');
const { createPurchasesRoutes } = require('./routes/purchases.routes');
const { createInventoryRoutes } = require('./routes/inventory.routes');
const { createRequestsRoutes } = require('./routes/requests.routes');
const { createPurchaseRequestsRoutes } = require('./routes/purchase-requests.routes');
const { createMaintenanceRoutes } = require('./routes/maintenance.routes');
const { createDockRoutes } = require('./routes/dock.routes');
const { createAdminDockRoutes } = require('./routes/admin-dock.routes');
const { createVesselsRoutes } = require('./routes/vessels.routes');
const { createDischargeRoutes } = require('./routes/discharge.routes');
const { createDriverRoutes } = require('./routes/driver.routes');

/* قسم إنشاء التطبيق والثوابت العامة */
const app = express();
const port = 3000;
const publicDir = path.join(__dirname, 'public');
const sessions = new Map();

/* قسم إنشاء أدوات الصلاحيات والاعتماديات المشتركة */
const requireRoles = createRequireRoles(sessions);
const {
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
} = createAppDependencies({
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
});

/* قسم تهيئة الاتصال بقاعدة البيانات وتجهيز الـ schema عند الإقلاع */
db.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err.stack);
        return;
    }

    console.log('Connected to MySQL as id ' + db.threadId);
    ensureDriverColumns();
    ensureUserPasswordSchema();
    ensureUserAccountStatusSchema();
    ensureMachineDriverSchema();
    ensureWarehouseSchema();
    ensureInventoryWarehouseSchema();
    ensureDockSlotsSchema();
    ensureDockRequestsSchema();
    ensureDockReleaseRequestsSchema();
    ensureIncomingVesselsSchema();
    ensureIncomingVesselContainersSchema();
    ensureIncomingVesselDischargeSchema();
    ensureDriverInspectionsSchema();
    ensureRequestsWorkflowSchema();
    ensurePurchaseRequestsSchema();
});

/* قسم body parsers العامة */
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

/* قسم الـ middlewares العامة */
app.use(createAuthMiddleware({
    sessions,
    getUserAccountByEmail,
    isDisabledAccountStatus
}));

/* قسم الملفات الثابتة */
app.use(express.static(publicDir));

/* قسم ربط مسارات الصفحات العامة والمصادقة */
app.use('/', createAuthRoutes({
    db,
    sessions,
    tableHasColumn,
    normalizeRoleKey,
    getRoleRedirectPath,
    getSessionIdFromRequest,
    setNoStoreHeaders,
    isDisabledAccountStatus,
    publicDir
}));

/* قسم ربط مسارات الوحدات الإدارية والبيانات الأساسية */
app.use('/api/suppliers', createSuppliersRoutes({ db }));
app.use('/api/warehouses', createWarehousesRoutes({
    db,
    WAREHOUSE_TYPES,
    inferWarehouseType,
    normalizeStoredCode,
    compareEntityCodes,
    resolveEntityCode,
    findCodeConflict,
    getUsersIdColumn,
    getManagedWarehousesForUser
}));
app.use('/api/locations', createLocationsRoutes({
    db,
    resolveEntityCode
}));
app.use('/api', createUsersRoutes({
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
}));
app.use('/api', createMachinesRoutes({
    db,
    getUsersIdColumn,
    tableHasColumn,
    resolveEntityCode
}));
app.use('/api', createDriversRoutes({
    db,
    getUsersIdColumn
}));
app.use('/api', createPurchasesRoutes({ db }));
app.use('/api', createInventoryRoutes({
    db,
    resolveEntityCode,
    getManagedWarehousesForUser
}));
app.use('/api', createRequestsRoutes({
    db,
    getManagedWarehousesForUser
}));
app.use('/api', createPurchaseRequestsRoutes({
    db,
    getManagedWarehousesForUser
}));
app.use('/api', createMaintenanceRoutes({
    db,
    requireRoles,
    getUsersIdColumn
}));

/* قسم ربط مسارات الرصيف والاستقبال والتفريغ */
app.use('/api', createDockRoutes({
    db,
    requireRoles,
    DOCK_BERTHS,
    getUsersIdColumn,
    getCurrentUserByEmail,
    getDockDrivers,
    getLatestDockReleaseRequests,
    normalizeDockBerthKey,
    getDockBerthStatus,
    getDockLevelsForBerth,
    getDockLevelMeta,
    getDockBerthMeta
}));
app.use('/api', createAdminDockRoutes({
    db,
    requireRoles
}));
app.use('/api', createVesselsRoutes({
    db,
    requireRoles,
    normalizeMysqlDateTime,
    normalizeDischargePriority,
    normalizeContainerCondition,
    normalizeContainerWeight,
    normalizeCargoType,
    normalizeContainerDestination,
    normalizeStoredCode,
    mapIncomingVesselRow,
    mapDischargePlanRow,
    mapDischargeTaskRow,
    assignSmartContainerDestinations,
    resolveEntityCode,
    findCodeConflict
}));
app.use('/api', createDischargeRoutes({
    db,
    requireRoles,
    getReadyMachines,
    getActiveWarehouse,
    getPriorityRank,
    getDestinationRank,
    getUsersIdColumn,
    reassignAutoContainerDestinations,
    allocateDockSlotForContainer,
    getDefaultFinalLocation,
    getDockBerthKeyFromDestination,
    getContainerCompletionStatus,
    getCurrentUserByEmail,
    getAvailableDockDrivers,
    mapDischargeTaskRow
}));
app.use('/api', createDriverRoutes({
    db,
    requireRoles,
    getCurrentUserByEmail,
    getUsersIdColumn
}));

/* قسم تشغيل الخادم */
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});
