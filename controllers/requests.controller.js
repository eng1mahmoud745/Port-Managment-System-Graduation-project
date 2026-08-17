const { successResponse, errorResponse } = require('../utils/response.utils');

function sendServiceResponse(res, serviceResponse) {
    if (serviceResponse.statusCode >= 400) {
        return errorResponse(res, serviceResponse.statusCode, serviceResponse.body);
    }

    return successResponse(res, serviceResponse.statusCode, serviceResponse.body);
}

function createRequestsController({ requestsService }) {
    function createRequest(req, res) {
        requestsService.createRequest(req.body, req.authUser, (serviceResponse) => {
            sendServiceResponse(res, serviceResponse);
        });
    }

    function getRequests(req, res) {
        requestsService.getRequests(req.query, req.authUser, (serviceResponse) => {
            sendServiceResponse(res, serviceResponse);
        });
    }

    function approveRequest(req, res) {
        requestsService.approveRequest(req.params.id, req.body.user, req.body, req.authUser, (serviceResponse) => {
            sendServiceResponse(res, serviceResponse);
        });
    }

    return {
        createRequest,
        getRequests,
        approveRequest
    };
}

module.exports = {
    createRequestsController
};
