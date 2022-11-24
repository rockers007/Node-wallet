const express = require('express');
const adminGuard = require('../../adminModules/adminAuthentication/controllers/adminGuardController');
const transactionController = require('../controllers/transactionController');

const router = express.Router();

router.get(
  '/:campaignId/totalReservations',
  transactionController.getAllCampaignReservations
);

router
  .route('/')
  .get(adminGuard.adminProtect, transactionController.getAllTransactions)
  .post(adminGuard.adminProtect, transactionController.createTransaction);

router
  .route('/:id')
  .get(adminGuard.adminProtect, transactionController.getTransaction)
  .patch(adminGuard.adminProtect, transactionController.updateTransaction);

module.exports = router;
