const express = require('express');
const { createPurchaseRequestsController } = require('../controllers/purchase-requests.controller');
const { createPurchaseRequestsService } = require('../services/purchase-requests.service');

function createPurchaseRequestsRoutes({ db, getManagedWarehousesForUser }) {
    const router = express.Router();
    const purchaseRequestsService = createPurchaseRequestsService({
        db,
        getManagedWarehousesForUser
    });
    const purchaseRequestsController = createPurchaseRequestsController({ purchaseRequestsService });

    router.post('/purchase-requests', purchaseRequestsController.createPurchaseRequest);
    router.get('/purchase-requests', purchaseRequestsController.getPurchaseRequests);
    router.post('/purchase-requests/:id/decision', purchaseRequestsController.decidePurchaseRequest);
    router.post('/purchase-requests/:id/status', purchaseRequestsController.updatePurchaseRequestStatus);

    return router;
}

module.exports = {
    createPurchaseRequestsRoutes
};
