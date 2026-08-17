/**
 * مسؤولية الملف: ربط مسارات المواقع بالـ controller الخاص بها فقط.
 * ملاحظات: هذا الملف لا يحتوي على منطق أعمال أو SQL في هذه المرحلة، وإنما يركّب service ثم controller ثم يربط المسارات.
 */

const express = require('express');
const { errorHandler } = require('../middlewares/error.middleware');
const { blockSupervisorWarehouseLocationMutation } = require('../middlewares/supervisor-guard.middleware');
const { createLocationsController } = require('../controllers/locations.controller');
const { createLocationsService } = require('../services/locations.service');

/**
 * الغرض: إنشاء Router خاص بجميع endpoints المواقع وربطه بالـ controller المناسب.
 * المدخلات: كائن dependencies ويحتوي على db وresolveEntityCode لاستخدامهما في إنشاء service المواقع.
 * المخرجات: يعيد كائن Express Router جاهزًا للربط في app.js على المسار `/api/locations`.
 * الآثار الجانبية: ينشئ instances من service وcontroller ثم يربط المسارات بها داخل الـ router.
 * ملاحظات: يحافظ على نفس المسارات الحالية دون تغيير، مع نقل منطق الأعمال وSQL إلى service.
 */
function createLocationsRoutes({ db, resolveEntityCode }) {
    const router = express.Router();
    const locationsService = createLocationsService({
        db,
        resolveEntityCode
    });
    const locationsController = createLocationsController({ locationsService });

    router.get('/', locationsController.getLocations);
    router.post('/', blockSupervisorWarehouseLocationMutation, locationsController.createLocation);
    router.put('/:id', blockSupervisorWarehouseLocationMutation, locationsController.updateLocation);
    router.delete('/:id', blockSupervisorWarehouseLocationMutation, locationsController.deleteLocation);
    router.use(errorHandler);

    return router;
}

module.exports = {
    createLocationsRoutes
};
