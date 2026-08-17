const express = require('express');
const { createInventoryController } = require('../controllers/inventory.controller');
const { createInventoryService } = require('../services/inventory.service');

function createInventoryRoutes({ db, resolveEntityCode, getManagedWarehousesForUser }) {
    const router = express.Router();
    const inventoryService = createInventoryService({
        db,
        resolveEntityCode,
        getManagedWarehousesForUser
    });
    const inventoryController = createInventoryController({ inventoryService });

    router.get('/inventory/items', inventoryController.getInventoryItems);
    router.post('/inventory/receive', inventoryController.receiveInventory);
    router.post('/inventory/issue', inventoryController.issueInventory);
    router.get('/inventory/transactions', inventoryController.getInventoryTransactions);
    router.get('/inventory/transactions/:id', inventoryController.getInventoryTransactionDetails);
    router.post('/inventory/new', inventoryController.createInventoryItem);
    router.post('/inventory/edit/:id', inventoryController.updateInventoryItem);

    return router;
}

module.exports = {
    createInventoryRoutes
};
