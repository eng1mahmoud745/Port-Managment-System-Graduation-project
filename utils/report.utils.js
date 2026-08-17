/**
 * مسؤولية الملف: توفير دوال آمنة لتنسيق وعرض التقارير النصية وHTML من دون لمس منطق الاستعلامات.
 * ملاحظات: الدوال هنا تركز على التهيئة والعرض فقط، وليس جلب البيانات أو تغييرها.
 */

/**
 * الغرض: تهريب النصوص قبل إدراجها داخل HTML لمنع كسر البنية أو حقن وسوم غير مرغوبة.
 * المدخلات: value أي قيمة قابلة للتحويل إلى نص.
 * المخرجات: نص آمن للعرض داخل HTML.
 * ملاحظات: يستبدل الرموز الحساسة بكيانات HTML ويعيد سلسلة فارغة عند غياب القيمة.
 * متى يُستخدم: عند إنشاء تقارير HTML أو جداول تعرض بيانات قادمة من قاعدة البيانات أو المستخدم.
 */
function escapeReportHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * الغرض: تنسيق التاريخ والوقت بالشكل المحلي العربي المستخدم حاليًا في المشروع.
 * المدخلات: value قيمة تاريخ يمكن تمريرها إلى Date.
 * المخرجات: تاريخ منسق كنص، أو '-' إذا لم توجد قيمة، أو القيمة الأصلية إذا تعذر تفسيرها.
 * ملاحظات: لا يعدل المنطقة الزمنية يدويًا بل يعتمد على toLocaleString('ar-SA') كما هو.
 * متى يُستخدم: داخل التقارير الإدارية والجداول الزمنية المعروضة للمستخدم.
 */
function formatReportDateTime(value) {
    if (!value) {
        return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleString('ar-SA');
}

/**
 * الغرض: إنشاء جدول HTML كامل أو رسالة حالة فارغة اعتمادًا على البيانات المدخلة.
 * المدخلات: headers مصفوفة عناوين الأعمدة، و rows مصفوفة الصفوف.
 * المخرجات: نص HTML جاهز للإدراج داخل صفحة التقرير.
 * ملاحظات: يهرب العناوين والخلايا باستخدام escapeReportHtml ويحافظ على الرسالة الحالية عند غياب البيانات.
 * متى يُستخدم: عند بناء أقسام التقارير الإدارية التي تعرض جداول متنوعة.
 */
function createHtmlTable(headers, rows) {
    if (!Array.isArray(rows) || !rows.length) {
        return '<p class="empty-state">لا توجد بيانات مرتبطة بهذا القسم.</p>';
    }

    return `
        <table>
            <thead>
                <tr>${headers.map((header) => `<th>${escapeReportHtml(header)}</th>`).join('')}</tr>
            </thead>
            <tbody>
                ${rows.map((row) => `
                    <tr>
                        ${row.map((cell) => `<td>${escapeReportHtml(cell)}</td>`).join('')}
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

module.exports = {
    escapeReportHtml,
    formatReportDateTime,
    createHtmlTable
};
