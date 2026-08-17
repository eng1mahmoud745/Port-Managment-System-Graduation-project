const { successResponse, errorResponse } = require('../utils/response.utils');

function sendServiceResponse(res, serviceResponse) {
    if (serviceResponse.statusCode >= 400) {
        return errorResponse(res, serviceResponse.statusCode, serviceResponse.body);
    }

    return successResponse(res, serviceResponse.statusCode, serviceResponse.body);
}

function createPurchasesController({ purchasesService }) {
    function createPurchase(req, res) {
        purchasesService.createPurchase(req.body, (serviceResponse) => {
            sendServiceResponse(res, serviceResponse);
        });
    }

    return {
        createPurchase
    };
}

module.exports = {
    createPurchasesController
};
