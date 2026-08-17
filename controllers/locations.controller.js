/**
 * مسؤولية الملف: استقبال طلبات المواقع من الـ routes وتمريرها إلى service ثم إعادة الاستجابة المناسبة.
 * ملاحظات: هذا الملف يتعامل مع req و res فقط، بينما يبقى منطق الأعمال وSQL داخل service المواقع.
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
 * الغرض: إنشاء controller خاص بعمليات المواقع وربط كل action بدالة من service المواقع.
 * المدخلات: كائن dependencies ويحتوي على locationsService المستخدم لتنفيذ منطق المواقع.
 * المخرجات: يعيد كائنًا يحتوي على handlers جاهزة للربط داخل routes المواقع.
 * الآثار الجانبية: لا ينفذ SQL أو يعدل قاعدة البيانات بنفسه، لكنه يرسل الاستجابات النهائية للعميل عبر Express.
 * ملاحظات: أي تحقق أو منطق أعمال أو SQL يجب أن يبقى داخل locationsService وليس داخل هذا الملف.
 */
function createLocationsController({ locationsService }) {
    /**
     * الغرض: معالجة طلب جلب قائمة المواقع وتمرير فلاتر البحث والتصفية كما هي إلى service.
     * المدخلات: req لاستخراج req.query، وres لإرسال الاستجابة النهائية.
     * المخرجات: يرسل JSON يحتوي على المواقع أو رسالة خطأ بحسب نتيجة service.
     * الآثار الجانبية: يكتب إلى الاستجابة الحالية فقط، ولا يغيّر البيانات أو الجلسات بنفسه.
     * ملاحظات: service هي المسؤولة عن تنفيذ JOIN الحالي والحفاظ على ترتيب النتائج وشكلها.
     */
    function getLocations(req, res, next) {
        try {
            locationsService.getLocations(req.query, (serviceResponse) => {
                sendServiceResponse(res, serviceResponse);
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * الغرض: معالجة طلب إنشاء موقع جديد وتمرير body القادم من الواجهة إلى service.
     * المدخلات: req لاستخراج req.body، وres لإرسال النتيجة النهائية.
     * المخرجات: يرسل JSON بنتيجة إنشاء الموقع أو سبب الفشل.
     * الآثار الجانبية: يرسل الاستجابة فقط، بينما تعديل قاعدة البيانات يتم داخل service.
     * ملاحظات: لا يجري أي تحقق محلي داخل controller حتى تبقى قواعد الإدخال في مكان واحد داخل service.
     */
    function createLocation(req, res, next) {
        try {
            locationsService.createLocation(req.body, (serviceResponse) => {
                sendServiceResponse(res, serviceResponse);
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * الغرض: معالجة طلب تحديث الموقع الكامل بناءً على المعرف والبيانات الجديدة.
     * المدخلات: req لاستخراج req.params.id وreq.body، وres لإرسال الاستجابة.
     * المخرجات: يرسل JSON بنتيجة التحديث أو الخطأ المناسب.
     * الآثار الجانبية: يكتب إلى الاستجابة الحالية فقط، بينما التعديل الفعلي على قاعدة البيانات يتم داخل service.
     * ملاحظات: يحافظ على endpoint الحالي `PUT /api/locations/:id` وعلى نفس رسائل النجاح والخطأ.
     */
    function updateLocation(req, res, next) {
        try {
            locationsService.updateLocation(req.params.id, req.body, (serviceResponse) => {
                sendServiceResponse(res, serviceResponse);
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * الغرض: معالجة طلب حذف موقع حسب المعرف وإرجاع النتيجة النهائية للواجهة.
     * المدخلات: req لاستخراج req.params.id، وres لإرسال الاستجابة.
     * المخرجات: يرسل JSON يوضح نجاح الحذف أو سبب الفشل.
     * الآثار الجانبية: يكتب إلى الاستجابة الحالية فقط، بينما الحذف الفعلي من قاعدة البيانات يتم داخل service.
     * ملاحظات: يعتمد على service للحفاظ على نفس رسائل الحذف الحالية دون تغيير.
     */
    function deleteLocation(req, res, next) {
        try {
            locationsService.deleteLocation(req.params.id, (serviceResponse) => {
                sendServiceResponse(res, serviceResponse);
            });
        } catch (error) {
            next(error);
        }
    }

    return {
        getLocations,
        createLocation,
        updateLocation,
        deleteLocation
    };
}

module.exports = {
    createLocationsController
};
