const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: true,
    },
    campaignId: {
      type: mongoose.Schema.ObjectId,
      ref: 'Equity',
    },
    hostIp: {
      type: Number,
      trim: true,
    },
    currencyId: {
      type: mongoose.Schema.ObjectId,
      ref: 'Currency',
    },
    amount: {
      type: Number,
      required: true,
    },
    earnedFee: {
      type: Number,
      default: 0,
    },
    earnedFeeDetail: {
      earnedFeesPercentage: {
        type: Number,
        default: 0,
      },
      earnedFlatFees: {
        type: Number,
        default: 0,
      },
    },
    preapprovalTotalAmount: {
      type: Number,
      required: true,
    },
    preapprovalStatus: {
      type: String,
      enum: ['PENDING', 'SUCCESS', 'FAIL', 'REFUNDED'],
      default: 'PENDING',
    },
    preapprovalKey: {
      type: String,
      required: true,
    },
    transactionKey: {
      type: String,
      required: true,
    },
    doneFrom: {
      type: String,
      enum: ['FRONT', 'ADMIN'],
      default: 'FRONT',
    },
    doneFromWallet: {
      type: String,
      enum: ['full', 'partial', 'no'],
      default: 'no',
    },
    gatewayId: {
      type: mongoose.Schema.ObjectId,
      ref: 'PaymentGateway',
    },
    feesDetails: {
      feesPercentage: {
        type: Number,
        default: 0,
      },
      flatFees: {
        type: Number,
        default: 0,
      },
      transactionFees: {
        type: Number,
        default: 0,
      },
    },
    paymentConfirmationId: String,
    paymentStatus: {
      type: Number,
      default: 0,
    },
    refundReason: String,
    /* createdAt: {
      type: Date,
      default: Date.now(),
    }, */
  },
  { timestamps: true },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

TransactionSchema.index({ user: 1 });
TransactionSchema.index({ campaignId: 1 });

TransactionSchema.pre(/^find/, function (next) {
  this.populate({
    path: 'user',
    select: 'firstName lastName email slug photo achCustomerId achAccountId',
  })
    .populate({
      path: 'campaignId',
      select: '-__v',
    })
    .populate({
      path: 'currencyId',
      select: '-__v',
    })
    .populate({
      path: 'gatewayId',
      select: '-__v',
    });
  next();
});

const Transaction = mongoose.model('Transaction', TransactionSchema);
module.exports = Transaction;
