const mongoose = require('mongoose');
const User = require('../authentication/models/userModel');
const Equity = require('../campaigns/equity/models/equityModel');
const AchAccount = require('../transactions/models/achAccountsModel');
const Transaction = require('../transactions/models/transactionModel');
const CampaignRepayment = require('../adminModules/campaignRepayment/models/campaignRepaymentModel');
const CampaignDistribution = require('../adminModules/campaignDistribution/models/campaignDistributionModel');
const DistributionDetail = require('../adminModules/campaignDistribution/models/distributionDetailModel');
const Revenue = require('../adminModules/revenueSetting/models/revenueSettingModel');
const achPaymentProcess = require('../utils/achPaymentProcess');

module.exports = class distribution {
  async calculateDistributionFromCampaignId(campaignId, totalDistributionCount){
    const getCampaignInfo = await Equity.findById(campaignId);

    let totalInvestedAmount = 0;
    let interestRate = parseFloat(getCampaignInfo.interestRate);
    let termCount = parseInt(getCampaignInfo.termLength);

    const getInvestmentProcess = await Transaction.find({
      campaignId: campaignId,
      preapprovalStatus: 'SUCCESS',
      paymentStatus: 1
    });

    getInvestmentProcess.forEach((arg) => {
      totalInvestedAmount += parseFloat(arg.preapprovalTotalAmount);
    });

    let totalInterstPayment = (totalInvestedAmount*interestRate)/100;
    let tempNextDistribution = (totalInvestedAmount + totalInterstPayment)/termCount;
    let nextDistribution = 0;

    if(totalDistributionCount !=  termCount) {
      if((totalDistributionCount+1) == termCount){
        let distributionDifference = (totalInvestedAmount + totalInterstPayment) - (parseFloat(tempNextDistribution).toFixed(2)*termCount);
        nextDistribution = tempNextDistribution + distributionDifference;
      }
      else{ nextDistribution = tempNextDistribution; }
    }
    return parseFloat(nextDistribution.toFixed(2));
  }

  async getNextDistributionDate(campaignId, totalDistributionCount){
    const getCampaignInfo = await Equity.findById(campaignId);
    let termFrequency = getCampaignInfo.investFrequency;
    let termCount = parseInt(getCampaignInfo.termLength);
    let nextDistributionDate = '';

    if(totalDistributionCount == 0)
    {
      let distributionDate = getCampaignInfo.maturityDate;
      let lastPendingPeriodEndDate = 1;

      const repaymentAggregateFilter = [
        {
          $lookup: {
            from: "campaigndistributions",
            localField:"transactionKey",
            foreignField:"campaigndistributions.transactionKey",
            as: "campaigndistributions"
          }
        },
        {
          $unwind: {
            path: "$campaigndistributions",
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $match: {
            $and: [
              { "campaigndistributions": { $in: [null, []] } },
              { "paymentStatus": "SUCCESS" },
              { "campaignId": mongoose.Types.ObjectId(campaignId) }
            ]
          }
        },
        { $sort: { "repaymentCount": 1 } },
        { $limit: 1 }
      ];
      const getLatestCampaignRepayment = await CampaignRepayment.aggregate(repaymentAggregateFilter).then(result=>{ return (result.length == 0) ? 0 : result[0]; });

      if(getLatestCampaignRepayment){
        distributionDate = getLatestCampaignRepayment.periodEndDate;
      }

      let month = new Date(distributionDate).getMonth() + 1;
      let year = new Date(distributionDate).getFullYear();
      nextDistributionDate = `${month}-${year}`;
    }
    else
    {
      if(totalDistributionCount !=  termCount) {
        const getLatestDistributionInfo = await CampaignRepayment.findOne({campaignId: campaignId})
        .sort({'createdAt': -1});
        let latestDate = new Date(getLatestDistributionInfo.createdAt);
        switch(termFrequency) {
          case 'Yearly':
            latestDate.setFullYear(latestDate.getFullYear() + 1);
            break;
          case 'Quarterly':
            latestDate.setMonth(latestDate.getMonth() + 3);
            break;
          case 'Monthly':
            latestDate.setMonth(latestDate.getMonth() + 1);
            break;
          case 'Days':
            latestDate.setDate(latestDate.getDate() + 1);
            break;
        }
        nextDistributionDate = latestDate;
      }
    }
    return nextDistributionDate;
  }

  async createDistributionDetail(DistributionData, achDistributionData = new Object()){
    // const getCampaignInfo = await Equity.findById(DistributionData.campaignId);
    let campaignId = DistributionData.campaignId;
    let totalDistributedAmount = parseFloat(DistributionData.amount);
    let distributionKey = DistributionData.distributionKey;
    let createdAt = DistributionData.createdAt;
    let distributionCount = DistributionData.distributionCount;

    const getInvestmentProcess = await Transaction.find({
      campaignId: DistributionData.campaignId,
      preapprovalStatus: "SUCCESS",
      paymentStatus: 1
    });
    let repaymentTransferCount = 0;
    await Promise.all(getInvestmentProcess.map(async (el) => {
      let transactionKey = el.transactionKey;
      let totalraisedAmount = parseFloat(el.campaignId.totalraisedAmount);
      let user = el.user._id;
      let investedAmount = parseFloat(el.amount);
      let ownership = parseFloat((investedAmount*100)/totalraisedAmount);
      let adjustmentAmount = parseFloat(0);
      let systemCalculatedAmount = parseFloat((totalDistributedAmount*ownership)/100);
      let {totalDistributionAmount, investorFees, feesDetail} = await this.getInvestorFees(systemCalculatedAmount,adjustmentAmount);
      let inProgressAmount = parseFloat(totalDistributionAmount - investorFees);
      let pastDistribution = await this.getPastDistributionByUser(user, campaignId, transactionKey, distributionCount);
      let distributionStatus = "PENDING";
      let stripeChargeId = "";

      if(Object.keys(achDistributionData).length > 0){
        let achAccountId = el.user.achAccountId;
        let achAccountDetail = await AchAccount.findById(achAccountId);
        if(achAccountDetail){
          let distributorAccountId = achAccountDetail.accountId;
          let description = `${el.user.firstName} ${el.user.lastName} have received repayment distribution of ${achDistributionData.equityCurrencySymbol}${parseFloat(inProgressAmount.toFixed(2))} for ${achDistributionData.companyName}`;
          // ACH Payment Process
          const stripeBankAccountToken = achDistributionData.achBankToken;
          let customerId = '';
          if(el.user.achCustomerId){
            customerId = el.user.achCustomerId;
          }
          else{
            const customerIdResponse = await new achPaymentProcess().createCustomer(el.user.email, stripeBankAccountToken);
            if(customerIdResponse.msg == "fail"){
              sendResponse.responseSuccess(
                req.i18n.t('achPayment.bank_account_token_invalid_expired'),
                StatusCodes.UNAUTHORIZED,
                req.i18n.t('common.fail'),
                res
              );
            }

            customerId = customerIdResponse.customerId;
            await User.findByIdAndUpdate(req.user.id,{ achCustomerId: customerId });
            // customerId = "cus_Lq3Mkhp99RKnGc";
          }
          const tokenConnectionData = {
            campaignOwnerAccountId: distributorAccountId,
            customerId
          }
          const customerConnectedTokenResponse = await new achPaymentProcess().getCustomerConnectedToken(tokenConnectionData);
          const newCustomerId = customerConnectedTokenResponse.customerId;

          const chargeData = {
            campaignOwnerAccountId:distributorAccountId,
            payoutAmount: parseFloat(inProgressAmount.toFixed(2)),
            equityCurrencyCode: achDistributionData.equityCurrencyCode,
            newCustomerId,
            description
          }
          const transactionResponse = await new achPaymentProcess().processPayout(chargeData);

          distributionStatus = "SUCCESS";
          stripeChargeId = transactionResponse.id;
          repaymentTransferCount++;
        }
      }

      let detailData = {
        campaignId,
        user,
        distributionKey,
        transactionKey,
        pastDistribution: pastDistribution.toFixed(2),
        investedAmount: investedAmount.toFixed(2),
        ownership: ownership.toFixed(2),
        systemCalculatedAmount: systemCalculatedAmount.toFixed(2),
        adjustmentAmount: adjustmentAmount.toFixed(2),
        investorFees: investorFees.toFixed(2),
        inProgressAmount: inProgressAmount.toFixed(2),
        feesDetail,
        distributionCount,
        createdAt,
        distributionStatus,
        stripeChargeId
      }
      await DistributionDetail.create(detailData);
      await this.updateAllPastDistributions(user, campaignId, transactionKey, distributionCount);
    }));

    return (getInvestmentProcess.length == repaymentTransferCount) ? 0 : 1;
    
  }

  async updateDistributionDetail(distributionDetailId, adjustmentAmount){
    const distributionDetailData = await DistributionDetail.findById(distributionDetailId);
    let oldAdjustmentAmount = parseFloat(distributionDetailData.adjustmentAmount);
    let newAdjustmentAmount = oldAdjustmentAmount + adjustmentAmount;
    let inProgressAmount = parseFloat(parseFloat(distributionDetailData.inProgressAmount) + adjustmentAmount);
    return {
      adjustmentAmount: newAdjustmentAmount.toFixed(2),
      inProgressAmount: inProgressAmount.toFixed(2),
    }
  }

  async getInvestorFees(systemCalculatedAmount, adjustmentAmount){
    let totalDistributionAmount = (parseFloat(systemCalculatedAmount)+parseFloat(adjustmentAmount));
    const revenueData = await Revenue.findOne().sort({ createdAt: -1, });
    let feesPercentage = parseFloat(revenueData.percentageInvestmentFees);
    let flatFees = parseFloat(revenueData.fixedInvestmentFees);

    let percentageCalculatedAmount = (totalDistributionAmount*feesPercentage)/100;
    let investorFees = (parseFloat(percentageCalculatedAmount)+parseFloat(flatFees));
    let feesDetail = {
      feesPercentage: feesPercentage.toFixed(2),
      flatFees: flatFees.toFixed(2),
      transactionFees: investorFees.toFixed(2)
    };
    return {
      totalDistributionAmount,
      investorFees,
      feesDetail
    };
  }

  async getPastDistributionByUser(userId, campaignId, transactionKey, distributionCount){
    const getSuccessfullDistribution = await DistributionDetail.find({
      user: userId,
      campaignId: campaignId,
      transactionKey: transactionKey,
      distributionStatus: "SUCCESS",
      distributionCount: {
        $lt: distributionCount
      }
    });
    let totalPastDistribution = parseFloat(0);
    await Promise.all(getSuccessfullDistribution.map(async (el) => {
      totalPastDistribution += parseFloat(el.inProgressAmount);
    }));
    return totalPastDistribution;
  }

  async updateAllPastDistributions(userId, campaignId, transactionKey, distributionCount){
    const getAllDistributions = await DistributionDetail.find({
      user: userId,
      campaignId: campaignId,
      transactionKey: transactionKey,
      distributionCount: {
        $gt: distributionCount
      }
    });
    await Promise.all(getAllDistributions.map(async (el) => {
      let pastDistribution = await this.getPastDistributionByUser(userId, campaignId, transactionKey, el.distributionCount);
      const doc = await DistributionDetail.findByIdAndUpdate(
        el.id,
        { pastDistribution: pastDistribution.toFixed(2) },
        {
          new: true,
          runValidators: true,
        }
      );
    }));
  }  
}