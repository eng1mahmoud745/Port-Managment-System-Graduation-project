function buildServiceResponse(statusCode, body) {
    return {
        statusCode,
        body
    };
}

function createVesselsService({
    resolveEntityCode,
    normalizeStoredCode,
    findCodeConflict
}) {
    function getReceptionContainerCode(callback) {
        resolveEntityCode({
            submittedCode: '',
            defaultPrefix: 'CNT',
            tableName: 'incoming_vessel_containers',
            codeColumn: 'container_number'
        }, (codeErr, generatedCode) => {
            if (codeErr) {
                console.error('Error generating incoming container code:', codeErr);
                return callback(buildServiceResponse(500, { success: false, message: 'تعذر توليد كود الحاوية تلقائياً.' }));
            }

            return callback(buildServiceResponse(200, {
                success: true,
                code: generatedCode
            }));
        });
    }

    function checkReceptionContainerCode(submittedCode, callback) {
        const normalizedCode = normalizeStoredCode(String(submittedCode || '').trim());

        if (!normalizedCode) {
            return callback(buildServiceResponse(400, { success: false, message: 'رقم الحاوية غير صالح.' }));
        }

        findCodeConflict({
            tableName: 'incoming_vessel_containers',
            codeColumn: 'container_number',
            candidateCode: normalizedCode
        }, (conflictErr, conflict) => {
            if (conflictErr) {
                console.error('Error checking incoming container code conflict:', conflictErr);
                return callback(buildServiceResponse(500, { success: false, message: 'تعذر التحقق من رقم الحاوية.' }));
            }

            return callback(buildServiceResponse(200, {
                success: true,
                code: normalizedCode,
                exists: Boolean(conflict)
            }));
        });
    }

    return {
        getReceptionContainerCode,
        checkReceptionContainerCode
    };
}

module.exports = {
    createVesselsService
};
