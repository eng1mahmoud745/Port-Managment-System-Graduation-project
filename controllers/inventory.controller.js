const { successResponse, errorResponse } = require('../utils/response.utils');

function sendServiceResponse(res, serviceResponse) {
    if (serviceResponse.statusCode >= 400) {
        return errorResponse(res, serviceResponse.statusCode, serviceResponse.body);
    }

    return successResponse(res, serviceResponse.statusCode, serviceResponse.body);
}

function createInventoryController({ inventoryService }) {
    function getInventoryItems(req, res) {
        inventoryService.getInventoryItems(req.query, req.authUser, (serviceResponse) => {
            sendServiceResponse(res, serviceResponse);
        });
    }

    function receiveInventory(req, res) {
        inventoryService.receiveInventory(req.body, req.authUser, (serviceResponse) => {
            sendServiceResponse(res, serviceResponse);
        });
    }

    function issueInventory(req, res) {
        inventoryService.issueInventory(req.body, req.authUser, (serviceResponse) => {
            sendServiceResponse(res, serviceResponse);
        });
    }

    function getInventoryTransactions(req, res) {
        inventoryService.getInventoryTransactions(req.query, req.authUser, (serviceResponse) => {
            sendServiceResponse(res, serviceResponse);
        });
    }

    function getInventoryTransactionDetails(req, res) {
        inventoryService.getInventoryTransactionDetails(req.params.id, req.query, req.authUser, (serviceResponse) => {
            sendServiceResponse(res, serviceResponse);
        });
    }

    function createInventoryItem(req, res) {
        inventoryService.createInventoryItem(req.body, req.authUser, (serviceResponse) => {
            sendServiceResponse(res, serviceResponse);
        });
    }

    function updateInventoryItem(req, res) {
        inventoryService.updateInventoryItem(req.params.id, req.body, req.authUser, (serviceResponse) => {
            sendServiceResponse(res, serviceResponse);
        });
    }

    return {
        getInventoryItems,
        receiveInventory,
        issueInventory,
        getInventoryTransactions,
        getInventoryTransactionDetails,
        createInventoryItem,
        updateInventoryItem
    };
}

module.exports = {
    createInventoryController
};
