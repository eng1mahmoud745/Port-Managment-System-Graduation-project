const express = require('express');
const { createPurchasesController } = require('../controllers/purchases.controller');
const { createPurchasesService } = require('../services/purchases.service');

function createPurchasesRoutes({ db }) {
    const router = express.Router();
    const purchasesService = createPurchasesService({ db });
    const purchasesController = createPurchasesController({ purchasesService });

    router.post('/purchases', purchasesController.createPurchase);

    return router;
}

module.exports = {
    createPurchasesRoutes
};
