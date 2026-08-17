/**
 * مسؤولية الملف: استقبال طلبات الموردين من الـ routes وتمريرها إلى service ثم إعادة الاستجابة المناسبة.
 * ملاحظات: هذا الملف يتعامل مع req و res فقط، بينما يبقى منطق الأعمال وSQL داخل service الموردين.
 */

const { successResponse, errorResponse } = require('../utils/response.utils');

/**
 * الغرض: تحويل ناتج service الموحد إلى استجابة Express بنفس كود الحالة والجسم.
 * المدخلات: res كائن الاستجابة من Express، serviceResponse كائن يحتوي على statusCode وbody.
 * المخرجات: يرسل الاستجابة للعميل ويعيد كائن الاستجابة الناتج من Express.
 * الآثار الجانبية: يكتب مباشرة إلى الاستجابة الحالية، ويقرر استخدام successResponse أو errorResponse حسب كود الحالة.
 * ملاحظات: يعتمد على أن service تعيد دائمًا كائنًا بالشكل `{ statusCode, body }`، ولا يغيّر محتوى body نفسه.
 */
function sendServiceResponse(res, serviceResponse) {
    if (serviceResponse.statusCode >= 400) {
        return errorResponse(res, serviceResponse.statusCode, serviceResponse.body);
    }

    return successResponse(res, serviceResponse.statusCode, serviceResponse.body);
}

/**
 * الغرض: إنشاء controller خاص بعمليات الموردين وربط كل action بدالة من service الموردين.
 * المدخلات: كائن dependencies ويحتوي على suppliersService المستخدم لتنفيذ منطق الموردين.
 * المخرجات: يعيد كائنًا يحتوي على handlers جاهزة للربط داخل routes الموردين.
 * الآثار الجانبية: لا ينفذ SQL أو يعدل قاعدة البيانات بنفسه، لكنه يرسل الاستجابات النهائية للعميل عبر Express.
 * ملاحظات: أي تحقق أو منطق أعمال أو SQL يجب أن يبقى داخل suppliersService وليس داخل هذا الملف.
 */
function createSuppliersController({ suppliersService }) {
    /**
     * الغرض: معالجة طلب جلب قائمة الموردين وتمرير فلاتر query كما هي إلى service.
     * المدخلات: req لاستخراج req.query، وres لإرسال الاستجابة النهائية.
     * المخرجات: يرسل JSON يحتوي على الموردين أو رسالة خطأ بحسب نتيجة service.
     * الآثار الجانبية: يكتب إلى الاستجابة الحالية فقط، ولا يغيّر البيانات أو الجلسات بنفسه.
     * ملاحظات: يعتمد على أن service تتعامل مع البحث والتصفية وتعيد نفس شكل الاستجابة الحالي.
     */
    function getSuppliers(req, res, next) {
        try {
            suppliersService.getSuppliers(req.query, (serviceResponse) => {
                sendServiceResponse(res, serviceResponse);
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * الغرض: معالجة طلب إنشاء مورد جديد وتمرير body القادم من الواجهة إلى service.
     * المدخلات: req لاستخراج req.body، وres لإرسال النتيجة النهائية.
     * المخرجات: يرسل JSON بنتيجة إنشاء المورد أو سبب الفشل.
     * الآثار الجانبية: يرسل الاستجابة فقط، بينما تعديل قاعدة البيانات يتم داخل service.
     * ملاحظات: لا يجري أي تحقق محلي داخل controller حتى تبقى قواعد الإدخال في مكان واحد داخل service.
     */
    function createSupplier(req, res, next) {
        try {
            suppliersService.createSupplier(req.body, (serviceResponse) => {
                sendServiceResponse(res, serviceResponse);
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * الغرض: معالجة طلب جلب تاريخ المورد وتفاصيل تعاملاته حسب المعرف.
     * المدخلات: req لاستخراج req.params.id، وres لإرسال الاستجابة.
     * المخرجات: يرسل JSON يحتوي على history أو رسالة الخطأ المناسبة.
     * الآثار الجانبية: يكتب إلى الاستجابة الحالية فقط، بينما القراءة من قاعدة البيانات تتم داخل service.
     * ملاحظات: يعتمد على endpoint الحالي `/api/suppliers/:id/history` من دون أي تغيير في الشكل أو المسار.
     */
    function getSupplierHistory(req, res, next) {
        try {
            suppliersService.getSupplierHistory(req.params.id, (serviceResponse) => {
                sendServiceResponse(res, serviceResponse);
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * الغرض: معالجة المسار القديم للتعديل الجزئي على المورد والمحافظة على توافق الشاشات القديمة.
     * المدخلات: req لاستخراج req.params.id وreq.body، وres لإرسال الاستجابة.
     * المخرجات: يرسل JSON بنتيجة التعديل الجزئي أو رسالة الخطأ.
     * الآثار الجانبية: يرسل الاستجابة فقط، بينما تحديث قاعدة البيانات يتم داخل service.
     * ملاحظات: هذا handler يبقي endpoint القديم `/api/suppliers/edit/:id` كما هو لتجنب كسر أي واجهة تعتمد عليه.
     */
    function editSupplierLegacy(req, res, next) {
        try {
            suppliersService.editSupplierLegacy(req.params.id, req.body, (serviceResponse) => {
                sendServiceResponse(res, serviceResponse);
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * الغرض: معالجة طلب تحديث المورد الكامل بناءً على المعرف والبيانات الجديدة.
     * المدخلات: req لاستخراج req.params.id وreq.body، وres لإرسال الاستجابة.
     * المخرجات: يرسل JSON بنتيجة التحديث أو الخطأ المناسب.
     * الآثار الجانبية: يكتب إلى الاستجابة الحالية فقط، بينما التعديل الفعلي على قاعدة البيانات يتم داخل service.
     * ملاحظات: يحافظ على endpoint الحالي `PUT /api/suppliers/:id` وعلى نفس رسائل النجاح والخطأ.
     */
    function updateSupplier(req, res, next) {
        try {
            suppliersService.updateSupplier(req.params.id, req.body, (serviceResponse) => {
                sendServiceResponse(res, serviceResponse);
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * الغرض: معالجة طلب جلب مورد واحد حسب المعرف وإعادة الكائن بنفس الصيغة التي تتوقعها الواجهة.
     * المدخلات: req لاستخراج req.params.id، وres لإرسال الاستجابة.
     * المخرجات: يرسل كائن المورد مباشرة أو رسالة خطأ إذا لم يوجد أو حدثت مشكلة.
     * الآثار الجانبية: يكتب إلى الاستجابة الحالية فقط، ولا يغيّر أي بيانات.
     * ملاحظات: service تعيد body النهائي كما هو، لذلك لا يضيف هذا handler أي تغليف إضافي حول بيانات المورد.
     */
    function getSupplierById(req, res, next) {
        try {
            suppliersService.getSupplierById(req.params.id, (serviceResponse) => {
                sendServiceResponse(res, serviceResponse);
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * الغرض: معالجة طلب حذف مورد حسب المعرف وإرجاع النتيجة النهائية للواجهة.
     * المدخلات: req لاستخراج req.params.id، وres لإرسال الاستجابة.
     * المخرجات: يرسل JSON يوضح نجاح الحذف أو سبب الفشل.
     * الآثار الجانبية: يكتب إلى الاستجابة الحالية فقط، بينما الحذف الفعلي من قاعدة البيانات يتم داخل service.
     * ملاحظات: يعتمد على service للتعامل مع أخطاء القيود الخارجية مثل ER_ROW_IS_REFERENCED_2 مع الحفاظ على الرسائل الحالية.
     */
    function deleteSupplier(req, res, next) {
        try {
            suppliersService.deleteSupplier(req.params.id, (serviceResponse) => {
                sendServiceResponse(res, serviceResponse);
            });
        } catch (error) {
            next(error);
        }
    }

    return {
        getSuppliers,
        createSupplier,
        getSupplierHistory,
        editSupplierLegacy,
        updateSupplier,
        getSupplierById,
        deleteSupplier
    };
}

module.exports = {
    createSuppliersController
};
