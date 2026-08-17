/**
 * مسؤولية الملف: ربط مسارات المستودعات بالـ controller الخاص بها فقط.
 * ملاحظات: هذا الملف لا يحتوي على منطق أعمال أو SQL في هذه المرحلة، وإنما يركّب service ثم controller ثم يربط المسارات.
 */

const express = require('express');
const { errorHandler } = require('../middlewares/error.middleware');
const { blockSupervisorWarehouseLocationMutation } = require('../middlewares/supervisor-guard.middleware');
const { createWarehousesController } = require('../controllers/warehouses.controller');
const { createWarehousesService } = require('../services/warehouses.service');

/**
 * الغرض: إنشاء Router خاص بجميع endpoints المستودعات وربطه بالـ controller المناسب.
 * المدخلات: كائن dependencies ويحتوي على db وWAREHOUSE_TYPES وinferWarehouseType وnormalizeStoredCode وcompareEntityCodes وresolveEntityCode وfindCodeConflict.
 * المخرجات: يعيد كائن Express Router جاهزًا للربط في app.js على المسار `/api/warehouses`.
 * الآثار الجانبية: ينشئ instances من service وcontroller ثم يربط المسارات بها داخل الـ router.
 * ملاحظات: يحافظ على نفس المسارات الحالية دون تغيير، مع نقل منطق الأعمال وSQL إلى service.
 */
function createWarehousesRoutes({
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
    const router = express.Router();
    const warehousesService = createWarehousesService({
        db,
        WAREHOUSE_TYPES,
        inferWarehouseType,
        normalizeStoredCode,
        compareEntityCodes,
        resolveEntityCode,
        findCodeConflict,
        getUsersIdColumn,
        getManagedWarehousesForUser
    });
    const warehousesController = createWarehousesController({ warehousesService });

    router.get('/', warehousesController.getWarehouses);
    router.get('/supervisors', warehousesController.getSupervisors);
    router.get('/managed', warehousesController.getManagedWarehouses);
    router.post('/', blockSupervisorWarehouseLocationMutation, warehousesController.createWarehouse);
    router.put('/:id', blockSupervisorWarehouseLocationMutation, warehousesController.updateWarehouse);
    router.delete('/:id', blockSupervisorWarehouseLocationMutation, warehousesController.deleteWarehouse);
    router.use(errorHandler);

    return router;
}

module.exports = {
    createWarehousesRoutes
};
