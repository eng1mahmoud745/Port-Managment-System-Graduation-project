/**
 * مسؤولية الملف: ربط مسارات الموردين بالـ controller الخاص بهم فقط.
 * ملاحظات: هذا الملف لا يحتوي على منطق أعمال أو SQL في هذه المرحلة، وإنما يركّب service ثم controller ثم يربط المسارات.
 */

const express = require('express');
const { errorHandler } = require('../middlewares/error.middleware');
const { createSuppliersController } = require('../controllers/suppliers.controller');
const { createSuppliersService } = require('../services/suppliers.service');

/**
 * الغرض: إنشاء Router خاص بجميع endpoints الموردين وربطه بالـ controller المناسب.
 * المدخلات: كائن dependencies ويحتوي على db لاستخدامه في إنشاء service الموردين.
 * المخرجات: يعيد كائن Express Router جاهزًا للربط في app.js على المسار `/api/suppliers`.
 * الآثار الجانبية: ينشئ instances من service وcontroller ثم يربط المسارات بها داخل الـ router.
 * ملاحظات: يحافظ على نفس أسماء المسارات الحالية مثل `/`, `/:id`, `/:id/history`, و`/edit/:id` من دون تغيير.
 */
function createSuppliersRoutes({ db }) {
    const router = express.Router();
    const suppliersService = createSuppliersService({ db });
    const suppliersController = createSuppliersController({ suppliersService });

    router.get('/', suppliersController.getSuppliers);
    router.post('/', suppliersController.createSupplier);
    router.get('/:id/history', suppliersController.getSupplierHistory);
    router.post('/edit/:id', suppliersController.editSupplierLegacy);
    router.put('/:id', suppliersController.updateSupplier);
    router.get('/:id', suppliersController.getSupplierById);
    router.delete('/:id', suppliersController.deleteSupplier);
    router.use(errorHandler);

    return router;
}

module.exports = {
    createSuppliersRoutes
};
