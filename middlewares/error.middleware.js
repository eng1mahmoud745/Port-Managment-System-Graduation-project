/**
 * الغرض: تحويل أي خطأ غير متوقع إلى استجابة JSON آمنة ومضغوطة من دون تغيير شكل الردود الناجحة الحالية.
 * المدخلات: err كائن الخطأ، req الطلب الحالي، res الاستجابة الحالية، وnext للتمرير عند الحاجة.
 * المخرجات: يرسل استجابة خطأ JSON إذا لم تكن الاستجابة قد أُرسلت بعد، أو يمرر الخطأ للمرحلة التالية.
 * الآثار الجانبية: يكتب الخطأ إلى console.error عند عدم وجود body جاهز من الطبقات السابقة.
 * ملاحظات: يفضّل body الجاهز القادم من controller/service إذا وُجد، حتى نحافظ على شكل الرد المتوقع قدر الإمكان.
 */
function errorHandler(err, req, res, next) {
    if (res.headersSent) {
        return next(err);
    }

    if (err && err.body && err.statusCode) {
        return res.status(err.statusCode).json(err.body);
    }

    const statusCode = Number(err?.statusCode) || 500;
    const message = String(err?.message || '').trim() || 'حدث خطأ غير متوقع.';

    console.error('Unhandled application error:', err);

    return res.status(statusCode).json({
        success: false,
        message
    });
}

module.exports = {
    errorHandler
};
