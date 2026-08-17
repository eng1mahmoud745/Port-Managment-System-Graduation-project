const bcrypt = require('bcryptjs');

const PASSWORD_SALT_ROUNDS = 10;

/**
 * الغرض: تحديد ما إذا كانت القيمة المخزنة لكلمة المرور تبدو كـ bcrypt hash.
 * المدخلات: storedPassword القيمة المخزنة الحالية في قاعدة البيانات.
 * المخرجات: يعيد true إذا كانت القيمة تبدأ بمقدمة bcrypt المعتمدة، وfalse خلاف ذلك.
 * الآثار الجانبية: لا توجد آثار جانبية؛ التابع ينفذ فحصًا نصيًا فقط.
 * ملاحظات: يعتمد على البادئات `$2a$` و`$2b$` و`$2y$` كما هو مطلوب للتوافق مع البيانات الحالية.
 */
function isBcryptHash(storedPassword) {
    return /^\$2[aby]\$/.test(String(storedPassword || '').trim());
}

/**
 * الغرض: إنشاء bcrypt hash آمن لكلمة مرور نصية قبل تخزينها في قاعدة البيانات.
 * المدخلات: plainPassword كلمة المرور النصية الخام المراد تشفيرها.
 * المخرجات: يعيد Promise يحتوي على الـ hash النهائي الجاهز للتخزين.
 * الآثار الجانبية: لا يعدّل قاعدة البيانات مباشرة؛ فقط ينفذ عملية hashing داخل الذاكرة.
 * ملاحظات: يستخدم عدد salt rounds ثابت يساوي 10 لتحقيق توازن مناسب بين الأمان والأداء.
 */
function hashPassword(plainPassword) {
    return bcrypt.hash(String(plainPassword || ''), PASSWORD_SALT_ROUNDS);
}

/**
 * الغرض: مقارنة كلمة المرور المدخلة مع القيمة المخزنة مع دعم bcrypt والقيم النصية القديمة مؤقتًا.
 * المدخلات: plainPassword كلمة المرور المدخلة من المستخدم، وstoredPassword القيمة الحالية المخزنة في قاعدة البيانات.
 * المخرجات: يعيد Promise يحتوي على كائن يحدد نجاح المطابقة وهل تحتاج الكلمة إلى إعادة تشفير.
 * الآثار الجانبية: لا يعدّل قاعدة البيانات مباشرة؛ فقط ينفذ المقارنة المناسبة بحسب نوع القيمة المخزنة.
 * ملاحظات: إذا كانت القيمة القديمة plain text وتطابقت، يعيد `needsRehash: true` لدعم lazy migration أثناء تسجيل الدخول.
 */
async function comparePassword(plainPassword, storedPassword) {
    const normalizedPlainPassword = String(plainPassword || '');
    const normalizedStoredPassword = String(storedPassword || '');

    if (isBcryptHash(normalizedStoredPassword)) {
        const isMatch = await bcrypt.compare(normalizedPlainPassword, normalizedStoredPassword);
        return { isMatch, needsRehash: false };
    }

    const isMatch = normalizedPlainPassword === normalizedStoredPassword;
    return { isMatch, needsRehash: isMatch };
}

module.exports = {
    hashPassword,
    comparePassword,
    isBcryptHash
};
