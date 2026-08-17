function buildServiceResponse(statusCode, body) {
    return {
        statusCode,
        body
    };
}

function createPurchasesService({ db }) {
    function createPurchase(payload, callback) {
        const {
            supplier_id,
            transaction_date,
            product_name,
            quantity,
            unit_price,
            notes
        } = payload;

        if (!supplier_id || !transaction_date || !product_name || !quantity || !unit_price) {
            return callback(buildServiceResponse(400, {
                success: false,
                message: 'الرجاء تزويد جميع الحقول المطلوبة (المورد، التاريخ، المنتج، الكمية، السعر).'
            }));
        }

        const purchaseValue = parseFloat(quantity) * parseFloat(unit_price);

        const insertPurchaseSql = `
            INSERT INTO purchases
            (supplier_id, transaction_date, product_name, quantity, unit_price, notes)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        const insertValues = [supplier_id, transaction_date, product_name, quantity, unit_price, notes];

        db.query(insertPurchaseSql, insertValues, (err, result) => {
            if (err) {
                console.error('Database error during purchase insert:', err);
                return callback(buildServiceResponse(500, {
                    success: false,
                    message: 'فشل إدراج التعامل في قاعدة البيانات.'
                }));
            }

            const updateSupplierSql = `
                UPDATE suppliers
                SET
                    transactions = transactions + 1,
                    total_value = total_value + ?
                WHERE supplier_id = ?
            `;
            const updateValues = [purchaseValue, supplier_id];

            db.query(updateSupplierSql, updateValues, (updateErr, updateResult) => {
                if (updateErr) {
                    console.error('Database error during supplier statistics update:', updateErr);
                    return callback(buildServiceResponse(500, {
                        success: false,
                        message: 'تم إدراج التعامل، لكن فشل تحديث إحصائيات المورد.'
                    }));
                }

                if (updateResult.affectedRows === 0) {
                    return callback(buildServiceResponse(404, {
                        success: false,
                        message: 'فشل تحديث الإحصائيات، ربما المورد غير موجود.'
                    }));
                }

                return callback(buildServiceResponse(200, {
                    success: true,
                    message: 'تم تسجيل عملية الشراء وتحديث إحصائيات المورد بنجاح.',
                    purchase_id: result.insertId
                }));
            });
        });
    }

    return {
        createPurchase
    };
}

module.exports = {
    createPurchasesService
};
