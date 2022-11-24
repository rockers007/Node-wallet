const mongoose = require('mongoose');
const braintree = require('braintree');
const { StatusCodes } = require('http-status-codes');
const catcheAsync = require('../../utils/catcheAsync');
const sendResponse = require('../../utils/sendResponse');
const AppError = require('../../utils/appError');
const GeneralSettings = require('../../utils/generalSettings');
const campiagnActivities = require('../../utils/campiagnActivities');
const userActivities = require('../../utils/userActivities');
const adminActivities = require('../../utils/adminActivities');
const WalletFeatures = require('../../utils/walletFeatures');
const Email = require('../../utils/email');

exports.getAllCampaignReservations = (Model) =>
  catcheAsync(async (req, res, next) => {
    let totalReservations = 0;

    let equityInvestmentTotal = await Model.find({
      campaignId: req.params.campaignId,
      preapprovalStatus: 'SUCCESS',
    });

    equityInvestmentTotal.forEach((arg) => {
      totalReservations += arg.amount;
    });

    sendResponse.responseSuccess(
      totalReservations,
      StatusCodes.OK,
      req.i18n.t('common.success'),
      res
    );
  });

exports.getAllTransactions = (Model1, Model2) =>
  catcheAsync(async (req, res, next) => {
    let displayLoadMore = true;

    //Initialize basic feature
    let companyPipeline = [{ $project: { companyName: 1, companySlug: 1 } }];
    let userPipeline = [
      {
        $project: {
          firstName: 1,
          lastName: 1,
          slug: 1,
          fullName: { $concat: ['$firstName', ' ', '$lastName'] },
        },
      },
    ];
    let transactionPipeline = {
      $project: {
        user: 1,
        campaignId: 1,
        gatewayId: 1,
        createdAt: 1,
        amount: 1,
        earnedFee: 1,
        earnedFeeDetail: 1,
        createdAt: 1,
        transactionKey: 1,
        preapprovalKey: 1,
        preapprovalStatus: 1,
        paymentStatus: 1,
        paymentConfirmationId: 1,
        currencyId: 1,
      },
    };

    //Adding Filters
    if (req.query.campaign) {
      companyPipeline.push({
        $match: { companyName: { $regex: req.query.campaign, $options: 'i' } },
      });
    }
    if (req.query.user) {
      userPipeline.push({
        $match: { fullName: { $regex: req.query.user, $options: 'i' } },
      });
    }
    if (req.query.minAmount && req.query.maxAmount) {
      transactionPipeline = {
        $project: {
          user: 1,
          campaignId: 1,
          gatewayId: 1,
          createdAt: 1,
          amount: 1,
          earnedFee: 1,
          earnedFeeDetail: 1,
          createdAt: 1,
          transactionKey: 1,
          preapprovalKey: 1,
          preapprovalStatus: 1,
          paymentStatus: 1,
          paymentConfirmationId: 1,
          currencyId: 1,
          minInvested: {
            $cond: {
              if: { $gte: ['$amount', parseFloat(req.query.minAmount)] },
              then: 'Y',
              else: 'N',
            },
          },
          maxInvested: {
            $cond: {
              if: { $lte: ['$amount', parseFloat(req.query.maxAmount)] },
              then: 'Y',
              else: 'N',
            },
          },
        },
      };
    } else if (req.query.minAmount) {
      transactionPipeline = {
        $project: {
          user: 1,
          campaignId: 1,
          gatewayId: 1,
          createdAt: 1,
          amount: 1,
          earnedFee: 1,
          earnedFeeDetail: 1,
          createdAt: 1,
          transactionKey: 1,
          preapprovalKey: 1,
          preapprovalStatus: 1,
          paymentStatus: 1,
          paymentConfirmationId: 1,
          currencyId: 1,
          minInvested: {
            $cond: {
              if: { $gte: ['$amount', parseFloat(req.query.minAmount)] },
              then: 'Y',
              else: 'N',
            },
          },
        },
      };
    } else if (req.query.maxAmount) {
      transactionPipeline = {
        $project: {
          user: 1,
          campaignId: 1,
          gatewayId: 1,
          createdAt: 1,
          amount: 1,
          earnedFee: 1,
          earnedFeeDetail: 1,
          createdAt: 1,
          transactionKey: 1,
          preapprovalKey: 1,
          preapprovalStatus: 1,
          paymentStatus: 1,
          paymentConfirmationId: 1,
          currencyId: 1,
          maxInvested: {
            $cond: {
              if: { $lte: ['$amount', parseFloat(req.query.maxAmount)] },
              then: 'Y',
              else: 'N',
            },
          },
        },
      };
    }

    let limit = req.query.limit ? parseInt(req.query.limit) : 10;
    let mainAggregateFilter = [
      transactionPipeline,
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          pipeline: userPipeline,
          as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $lookup: {
          from: 'equities',
          localField: 'campaignId',
          foreignField: '_id',
          pipeline: [
            {
              $project: {
                companyId: 1,
                propertyName: 1,
                equityCurrencyCode: 1,
                equityCurrencySymbol: 1,
                status: 1,
              },
            },
          ],
          as: 'campaignId',
        },
      },
      { $unwind: '$campaignId' },
      {
        $lookup: {
          from: 'companyprofiles',
          localField: 'campaignId.companyId',
          foreignField: '_id',
          pipeline: companyPipeline,
          as: 'companyId',
        },
      },
      { $unwind: '$companyId' },
      {
        $lookup: {
          from: 'paymentgateways',
          localField: 'gatewayId',
          foreignField: '_id',
          pipeline: [{ $project: { title: 1 } }],
          as: 'gatewayId',
        },
      },
      { $unwind: '$gatewayId' },
      { $sort: { createdAt: -1 } },
    ];

    let mainFilter = [];
    if (req.query.minAmount) {
      mainFilter.push({ minInvested: 'Y' });
    }
    if (req.query.maxAmount) {
      mainFilter.push({ maxInvested: 'Y' });
    }
    if (req.query.transaction) {
      mainFilter.push({ transactionKey: req.query.transaction });
    }
    if (req.query.preapprovalStatus) {
      mainFilter.push({ preapprovalStatus: req.query.preapprovalStatus });
    }

    if (mainFilter.length > 0) {
      if (mainFilter.length == 1) {
        mainAggregateFilter.push({ $match: mainFilter[0] });
      } else {
        mainAggregateFilter.push({ $match: { $and: mainFilter } });
      }
    }

    let countAggregateFilter = [...mainAggregateFilter];
    countAggregateFilter.push({ $group: { _id: null, count: { $sum: 1 } } });
    const countDocs = await Model1.aggregate(countAggregateFilter);
    const totalCount = countDocs.length > 0 ? countDocs[0].count : 0;

    let findAggregateFilter = [...mainAggregateFilter];
    findAggregateFilter.push({ $limit: limit });
    const docs = await Model1.aggregate(findAggregateFilter);
    const len = docs.length;

    if (totalCount <= len) {
      displayLoadMore = false;
    }

    let totalAmountWiseDetail = [];
    const currencyData = await Model2.find({ status: true }).select(
      'id code symbol'
    );

    await Promise.all(
      currencyData.map(async (cd) => {
        let totalAggregateFilter = [...mainAggregateFilter];
        totalAggregateFilter.push({
          $match: {
            $and: [
              { preapprovalStatus: 'SUCCESS' },
              { currencyId: mongoose.Types.ObjectId(cd.id) },
            ],
          },
        });
        totalAggregateFilter.push({
          $group: {
            _id: null,
            totalAmt: { $sum: '$amount' },
            totalearnedFee: { $sum: '$earnedFee' },
          },
        });
        const totalAmount = await Model1.aggregate(totalAggregateFilter);
        const len = totalAmount.length;
        if (len > 0) {
          const tempTotalAmount = {
            code: cd.code,
            symbol: cd.symbol,
            totalAmount: parseFloat(totalAmount[0].totalAmt).toFixed(2),
            totalearnedFee: parseFloat(totalAmount[0].totalearnedFee).toFixed(
              2
            ),
          };
          totalAmountWiseDetail.push(tempTotalAmount);
        }
      })
    );

    sendResponse.responseSuccess(
      {
        totalAmountWiseDetail,
        totalCount,
        docs,
        displayLoadMore,
      },
      StatusCodes.OK,
      req.i18n.t('common.success'),
      res
    );
  });

exports.createTransaction = (Model1, Model2, Model3, Model4, Model5) =>
  catcheAsync(async (req, res, next) => {
    const campaignDetail = await Model1.findById(req.body.campaignId).select(
      'id currencyId termsId availableShares equityCurrencySymbol equityCurrencyCode companyId user campaignImageURL'
    );
    const investorDetail = await Model2.findById(req.body.user).select(
      'id firstName lastName'
    );
    const investorProfileData = await Model3.findOne({
      user: req.body.user,
    }).select('id');
    const offlineGatewayData =
      await new GeneralSettings().getpaymentGatewayDetail('offline');

    req.body.investorId = investorProfileData.id;
    req.body.currencyId = campaignDetail.currencyId.id;
    req.body.gatewayId = offlineGatewayData.id;
    req.body.preapprovalStatus = 'SUCCESS';
    req.body.status = 1;
    req.body.paymentStatus = 1;
    req.body.doneFrom = 'ADMIN';
    const newCampaignInvestment = await Model4.create(req.body);

    if (campaignDetail.termsId.slug == 'equity') {
      let availableShares = parseInt(campaignDetail.availableShares);
      let actualPurchasedShares = parseInt(req.body.purchasedShares);
      const newAvailableShares = availableShares - actualPurchasedShares;
      await Model1.findByIdAndUpdate(
        newCampaignInvestment.campaignId,
        { availableShares: newAvailableShares },
        {
          new: true,
          runValidators: true,
        }
      );
    }

    let randomNumber = Math.random().toString(20).substr(2, 10);

    let transactionData = {
      user: newCampaignInvestment.user,
      campaignId: newCampaignInvestment.campaignId,
      currencyId: req.body.currencyId,
      amount: req.body.amount,
      paymentConfirmationId: req.body.paymentConfirmationId,
      preapprovalTotalAmount: req.body.amount,
      preapprovalStatus: req.body.preapprovalStatus,
      preapprovalKey: randomNumber,
      transactionKey: randomNumber,
      gatewayId: newCampaignInvestment.gatewayId,
      status: req.body.status,
      doneFrom: req.body.doneFrom,
      paymentStatus: req.body.paymentStatus,
      feesDetails: {
        feesPercentage: 0,
        flatFees: 0,
        transactionFees: 0,
      },
    };

    const newTransaction = await Model5.create(transactionData);

    //Update transactionId in Campaign Investment
    const finalInvestmentProcessData = {
      transactionId: newTransaction.id,
    };

    await Model4.findByIdAndUpdate(
      newCampaignInvestment.id,
      finalInvestmentProcessData,
      {
        new: true,
        runValidators: true,
      }
    );

    const investmentAmount = parseFloat(newCampaignInvestment.amount);
    const totalAmount =
      campaignDetail.equityCurrencySymbol +
      investmentAmount.toFixed(2) +
      ' ' +
      campaignDetail.equityCurrencyCode;
    const url = `${process.env.SITE_URL}campaign-detail-page/${campaignDetail.companyId.companySlug}/`;

    //Notifications for Investor
    let investorActivityData = {
      user: req.body.user,
      module: 'campaign',
      action: 'investment added',
      campaignId: campaignDetail.id,
      textToReplace: {
        val1: `${req.admin.firstName} ${req.admin.lastName}`,
        val2: `${investorDetail.firstName} ${investorDetail.lastName}`,
        val3: `${totalAmount}`,
        val4: `${campaignDetail.companyId.companyName}`,
      },
      languageText: 'activityLog.campaign_investment_added_by_user',
    };

    if (campaignDetail.campaignImageURL) {
      investorActivityData.thumbnail = `${campaignDetail.campaignImageURL}`;
    }
    await new campiagnActivities().addCampaignActivity(investorActivityData);
    await new userActivities().addUserActivity(investorActivityData);
    await new Email().sendInvestmentAddedToInvestorByAdmin(
      req.admin,
      campaignDetail,
      investorDetail,
      totalAmount,
      url
    );

    //Notifications for Campaign Owner
    let campaignOwnerActivityData = {
      user: campaignDetail.user.id,
      module: 'campaign',
      action: 'user investmented',
      campaignId: campaignDetail.id,
      textToReplace: {
        val1: `${req.admin.firstName} ${req.admin.lastName}`,
        val2: `${investorDetail.firstName} ${investorDetail.lastName}`,
        val3: `${totalAmount}`,
        val4: `${campaignDetail.companyId.companyName}`,
      },
      languageText: 'activityLog.campaign_owner_investmented',
    };

    if (campaignDetail.campaignImageURL) {
      campaignOwnerActivityData.thumbnail = `${campaignDetail.campaignImageURL}`;
    }
    await new userActivities().addUserActivity(campaignOwnerActivityData);
    await new Email().sendInvestmentAddedToOwnerByAdmin(
      req.admin,
      campaignDetail,
      investorDetail,
      totalAmount,
      url
    );

    const campaignId = req.body.campaignId;
    await new campiagnActivities().updateCampaignCompletion(campaignId);

    sendResponse.responseSuccess(
      newTransaction,
      StatusCodes.OK,
      req.i18n.t('common.success'),
      res
    );
  });

exports.updateTransaction = (Model1, Model2, Model3, Model4) =>
  catcheAsync(async (req, res, next) => {
    const doc = await Model1.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!doc) {
      return next(
        new AppError(
          req.i18n.t('errors.no_document_found'),
          StatusCodes.NOT_FOUND
        )
      );
    }

    const aggregateFilter = [
      { $match: { transactionId: mongoose.Types.ObjectId(req.params.id) } },
      { $project: { id: 1, gatewayId: 1 } },
      {
        $lookup: {
          from: 'paymentgateways',
          localField: 'gatewayId',
          foreignField: '_id',
          pipeline: [{ $project: { title: 1 } }],
          as: 'gatewayId',
        },
      },
      { $unwind: '$gatewayId' },
    ];

    const investmentData = await Model2.aggregate(aggregateFilter);
    if (investmentData) {
      const investmentId = investmentData[0]._id;

      if (req.body.preapprovalStatus == 'REFUNDED') {
        await new WalletFeatures().checkAndCreateWallet(
          doc.user.id,
          doc.currencyId.id
        );
        const siteSetting = await new GeneralSettings().getgeneralSettings();
        if (siteSetting.walletModule == 'yes') {
          const walletData = await Model3.findOne({
            user: doc.user.id,
            currencyId: doc.currencyId.id,
          });

          const walletTransactionData = {
            user: doc.user.id,
            walletId: walletData.walletId,
            transactionNumber: `REF-${doc.preapprovalKey}`,
            transactionId: req.params.id,
            currencyId: doc.currencyId.id,
            amount: doc.amount,
            walletType: 'CREDIT',
            description: 'Amount is Refunded By Admin.',
            transactionType: 3,
            campaignId: doc.campaignId.id,
            status: 2,
            createdAt: req.body.createdAt,
          };
          await Model4.create(walletTransactionData);
          await new WalletFeatures().updateCurrentWallet(
            doc.user.id,
            doc.campaignId.currencyId
          );
        } else {
          const stripeGatewayData =
            await new GeneralSettings().getpaymentGatewayDetail('stripe');
          const stripe_secret_key =
            stripeGatewayData.paymentMode == 'sandbox'
              ? stripeGatewayData.applicationTestSecret
              : stripeGatewayData.applicationLiveSecret;
          const stripe = require('stripe')(stripe_secret_key);

          const achGatewayData =
            await new GeneralSettings().getpaymentGatewayDetail('ach');
          const ach_secret_key =
            achGatewayData.paymentMode == 'sandbox'
              ? achGatewayData.sandboxStripeSecretKey
              : achGatewayData.liveStripeSecretKey;
          const ach = require('stripe')(ach_secret_key);

          const paypalGatewayData =
            await new GeneralSettings().getpaymentGatewayDetail('paypal');
          const paymentGateway = new braintree.BraintreeGateway({
            environment:
              paypalGatewayData.paymentMode == 'sandbox'
                ? braintree.Environment.Sandbox
                : braintree.Environment.Production,
            merchantId: paypalGatewayData.applicationID,
            publicKey:
              paypalGatewayData.paymentMode == 'sandbox'
                ? paypalGatewayData.applicationTestKey
                : paypalGatewayData.applicationLiveKey,
            privateKey:
              paypalGatewayData.paymentMode == 'sandbox'
                ? paypalGatewayData.applicationTestSecret
                : paypalGatewayData.applicationLiveSecret,
          });
          const voidStatuses = [
            'authorized',
            'submitted_for_settlement',
            'settlement_pending',
          ];

          const paymentGatewayTitle = investmentData[0].gatewayId.title;
          const paymentConfirmationId = doc.paymentConfirmationId;
          const amount = doc.amount;

          if (paymentGatewayTitle == 'Stripe') {
            await stripe.refunds.create({
              amount: parseFloat(amount * 100),
              payment_intent: paymentConfirmationId,
            });
          } else if (paymentGatewayTitle == 'ACH') {
            await ach.refunds.create({
              charge: paymentConfirmationId,
            });
          } else if (paymentGatewayTitle == 'PayPal') {
            await paymentGateway.transaction.find(
              paymentConfirmationId,
              (err, result) => {
                const transactionStatus = result['status'];
                if (transactionStatus != 'settling') {
                  if (voidStatuses.includes(transactionStatus)) {
                    paymentGateway.transaction.void(
                      paymentConfirmationId,
                      (err, result) => {}
                    );
                  } else {
                    paymentGateway.transaction.refund(
                      paymentConfirmationId,
                      (err, result) => {}
                    );
                  }
                }
              }
            );
          }
        }
      }

      const updateInvestment = {
        status: req.body.paymentStatus,
      };

      await Model2.findByIdAndUpdate(investmentId, updateInvestment, {
        new: true,
        runValidators: true,
      });
    }

    const campaignId = doc.campaignId.id;
    await new campiagnActivities().updateCampaignCompletion(campaignId);

    sendResponse.responseSuccess(
      doc,
      StatusCodes.OK,
      req.i18n.t('common.success'),
      res
    );
  });
