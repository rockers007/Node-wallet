const User = require('../../authentication/models/userModel');
const Equity = require('../../campaigns/equity/models/equityModel');
const InvestorProfile = require('../../InvestorProfiles/models/InvestorProfileModel');
const InvestmentProcess = require('../../campaignInvests/models/investmentProcessModel');
const Transaction = require('../models/transactionModel');
const Currency = require('../../adminModules/currencies/models/currencyModel');
const Wallet = require('../../wallets/models/WalletModel');
const WalletTransaction = require('../../wallets/models/WalletTransactionModel');
const factory = require('../../helpers/handlerFactory');
const transactionService = require('../services/transactionService');

exports.getAllCampaignReservations = transactionService.getAllCampaignReservations(Transaction);
exports.getAllTransactions = transactionService.getAllTransactions(Transaction, Currency);
exports.getTransaction = factory.getOne(Transaction);
exports.createTransaction = transactionService.createTransaction(Equity, User, InvestorProfile, InvestmentProcess, Transaction);
exports.updateTransaction = transactionService.updateTransaction(Transaction, InvestmentProcess, Wallet, WalletTransaction);
