const express = require('express');
const { createRequestsController } = require('../controllers/requests.controller');
const { createRequestsService } = require('../services/requests.service');

function createRequestsRoutes({ db, getManagedWarehousesForUser }) {
    const router = express.Router();
    const requestsService = createRequestsService({
        db,
        getManagedWarehousesForUser
    });
    const requestsController = createRequestsController({ requestsService });

    router.post('/requests', requestsController.createRequest);
    router.get('/requests', requestsController.getRequests);
    router.post('/requests/approve/:id', requestsController.approveRequest);

    return router;
}

module.exports = {
    createRequestsRoutes
};
