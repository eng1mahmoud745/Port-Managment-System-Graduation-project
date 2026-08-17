/**
 * مسؤولية الملف: إنشاء وتجهيز اتصال MySQL المركزي للمشروع.
 * ملاحظات: هذا الملف لا يبدأ الاتصال فعليًا بنفسه، بل يوفّر كائن الاتصال ليتم استخدامه كما كان سابقًا من الملف الرئيسي.
 */

const mysql = require('mysql2');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'port_mng_db'
});

module.exports = db;
