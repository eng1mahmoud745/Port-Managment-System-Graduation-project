const { successResponse, errorResponse } = require('../utils/response.utils');

function sendServiceResponse(res, serviceResponse) {
    if (serviceResponse.statusCode >= 400) {
        return errorResponse(res, serviceResponse.statusCode, serviceResponse.body);
    }

    return successResponse(res, serviceResponse.statusCode, serviceResponse.body);
}

function createPurchaseRequestsController({ purchaseRequestsService }) {
    function createPurchaseRequest(req, res) {
        purchaseRequestsService.createPurchaseRequest(req.body, req.authUser, (serviceResponse) => {
            sendServiceResponse(res, serviceResponse);
        });
    }

    function getPurchaseRequests(req, res) {
        purchaseRequestsService.getPurchaseRequests(req.query, req.authUser, (serviceResponse) => {
            sendServiceResponse(res, serviceResponse);
        });
    }

    function decidePurchaseRequest(req, res) {
        purchaseRequestsService.decidePurchaseRequest(
            req.params.id,
            req.body.decision,
            req.body,
            (serviceResponse) => {
                sendServiceResponse(res, serviceResponse);
            }
        );
    }

    function updatePurchaseRequestStatus(req, res) {
        purchaseRequestsService.updatePurchaseRequestStatus(
            req.params.id,
            req.body.status,
            req.body,
            (serviceResponse) => {
                sendServiceResponse(res, serviceResponse);
            }
        );
    }

    return {
        createPurchaseRequest,
        getPurchaseRequests,
        decidePurchaseRequest,
        updatePurchaseRequestStatus
    };
}

module.exports = {
    createPurchaseRequestsController
};
