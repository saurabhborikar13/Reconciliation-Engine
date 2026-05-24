const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  runId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ReconciliationRun',
    required: true
  },
  source: {
    type: String,
    enum: ['user', 'exchange'],
    required: true
  },
  transaction_id: { type: String, required: false },
  timestamp: { type: String, required: false },
  parsedTimestamp: { type: Date, required: false },
  type: { type: String, required: false },
  asset: { type: String, required: false },
  quantity: { type: Number, required: false },
  price_usd: { type: Number, required: false },
  fee: { type: Number, required: false },
  note: { type: String, required: false },
  isValid: { type: Boolean, default: true },
  validationErrors: { type: [String], default: [] }
}, { timestamps: true });

TransactionSchema.index({ runId: 1, source: 1, isValid: 1 });

module.exports = mongoose.model('Transaction', TransactionSchema);