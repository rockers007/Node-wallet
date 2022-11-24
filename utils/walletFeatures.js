const crypto = require('crypto');
const GeneralSettings = require('./generalSettings');
const User = require('../authentication/models/userModel');
const Wallet = require('../wallets/models/WalletModel');
const WalletTransactionModel = require('../wallets/models/WalletTransactionModel');

module.exports = class walletFeatures {
  async createNewWallet(user, currencyId = '', walletId = '') {
    // Step 1: Check currency Id
    if (currencyId == '') {
      const defaultCurrencyId =
        await new GeneralSettings().getgeneralSettings();
      currencyId = defaultCurrencyId.currencyId;
    }

    // Step 2: Check walletId
    if (walletId == '') {
      walletId = `${crypto.randomBytes(5).toString('hex')}-${crypto
        .randomBytes(5)
        .toString('hex')}-${crypto.randomBytes(5).toString('hex')}`;
    }

    //Step 3: Wallet id Update on user Table
    await User.findByIdAndUpdate(user, { walletId: walletId });

    // Step 4: Wallet table update
    const walletData = {
      user: user,
      walletId: walletId,
      currencyId: currencyId,
    };

    await Wallet.create(walletData);

    return true;
  }

  async checkAndCreateWallet(user, currencyId = '') {
    if (currencyId == '') {
      const defaultCurrencyId =
        await new GeneralSettings().getgeneralSettings();
      currencyId = defaultCurrencyId.currencyId;
    }

    let userData = await User.findById(user).populate('userType');
    if (userData.userType && userData.userType.slug != 'campaign-owner') {
      if (userData.walletId == '') {
        await this.createNewWallet(user, currencyId);
      } else {
        let walletData = await Wallet.find({
          user: user,
          walletId: userData.walletId,
          currencyId: currencyId,
        });
        if (walletData.length == 0) {
          await this.createNewWallet(user, currencyId, userData.walletId);
        }
      }
    }
  }

  async updateCurrentWallet(user, currencyId) {
    let amount = 0;
    let walletTransData = await WalletTransactionModel.find({
      user: user,
      currencyId: currencyId,
      status: { $ne: 3 },
    });

    for (const walletData of walletTransData) {
      if (walletData.walletType == 'CREDIT') {
        if (walletData.status == 2) {
          amount = amount + walletData.amount;
        }
      } else {
        amount = amount - walletData.amount;
      }
    }

    amount = amount > 0 ? amount : 0;
    await Wallet.findOneAndUpdate(
      { user: user, currencyId: currencyId },
      {
        walletAmount: amount,
      },
      {
        new: true,
      }
    );
  }
  async walletBalance(user, currencyId = '') {
    let balance = 0;
    if (currencyId == '') {
      const defaultCurrencyId =
        await new GeneralSettings().getgeneralSettings();
      currencyId = defaultCurrencyId.currencyId;
    }

    let walletData = await Wallet.findOne({
      user: user,
      currencyId: currencyId,
    }).select('walletAmount');
    balance = walletData ? walletData.walletAmount : 0;
    return balance;
  }

  async getAllAggregatedWalletStatus(
    showCount,
    filter = '',
    transactionType = '',
    walletType = '',
    transactionNumber = '',
    limit
  ) {
    let aggregateFilter = [
      {
        $project: {
          id: '$_id',
          user: 1,
          walletId: 1,
          transactionNumber: 1,
          transactionId: 1,
          currencyId: 1,
          amount: 1,
          feesDetails: 1,
          walletType: 1,
          gatewayId: 1,
          status: 1,
          description: 1,
          acknowledgeDocument: 1,
          accountType: 1,
          bankName: 1,
          accountNumber: 1,
          routingNumber: 1,
          ipAddress: 1,
          campaignId: 1,
          rejectReason: 1,
          investorId: 1,
          transactionType: 1,
          createdAt: 1,
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          pipeline: [
            {
              $project: {
                slug: 1,
                photo: 1,
                email: 1,
                fullName: { $concat: ['$firstName', ' ', '$lastName'] },
              },
            },
          ],
          as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $lookup: {
          from: 'currencies',
          localField: 'currencyId',
          foreignField: '_id',
          pipeline: [{ $project: { code: 1, symbol: 1 } }],
          as: 'currencyId',
        },
      },
      { $unwind: '$currencyId' },
      {
        $lookup: {
          from: 'paymentgateways',
          localField: 'gatewayId',
          foreignField: '_id',
          pipeline: [{ $project: { _id: 0, title: 1 } }],
          as: 'gatewayId',
        },
      },
      {
        $unwind: {
          path: '$gatewayId',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: 'equities',
          localField: 'campaignId',
          foreignField: '_id',
          pipeline: [
            {
              $project: {
                companyId: 1,
                equityCurrencyCode: 1,
                equityCurrencySymbol: 1,
              },
            },
          ],
          as: 'campaignId',
        },
      },
      {
        $unwind: {
          path: '$campaignId',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: 'companyprofiles',
          localField: 'campaignId.companyId',
          foreignField: '_id',
          pipeline: [
            { $project: { companyName: 1, companyLogo: 1, companySlug: 1 } },
          ],
          as: 'campaignId.companyId',
        },
      },
      {
        $unwind: {
          path: '$campaignId.companyId',
          preserveNullAndEmptyArrays: true,
        },
      },
      { $sort: { createdAt: -1 } },
    ];

    let mainFilter = [];

    if (filter) {
      mainFilter.push({ status: { $in: filter } });
    }
    if (transactionType) {
      mainFilter.push({ transactionType: transactionType });
    }

    if (walletType) {
      mainFilter.push({ walletType: walletType });
    }

    if (transactionNumber) {
      mainFilter.push({ transactionNumber: transactionNumber });
    }

    if (mainFilter.length > 0) {
      if (mainFilter.length == 1) {
        aggregateFilter.push({ $match: mainFilter[0] });
      } else {
        aggregateFilter.push({ $match: { $and: mainFilter } });
      }
    }

    if (showCount == 'no') {
      aggregateFilter = [...aggregateFilter, { $limit: limit }];
    }
    const res = await WalletTransactionModel.aggregate(aggregateFilter);

    return showCount == 'no' ? res : res.length;
  }
};
