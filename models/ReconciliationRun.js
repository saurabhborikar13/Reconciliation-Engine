const mongoose = require('mongoose');

const ReconciliationRunSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['processing', 'completed', 'failed'],
    default: 'processing'
  },
  config: {
    timestampToleranceSeconds: Number,
    quantityTolerancePct: Number
  },
  summary: {
    matched: { type: Number, default: 0 },
    conflicting: { type: Number, default: 0 },
    unmatchedUser: { type: Number, default: 0 },
    unmatchedExchange: { type: Number, default: 0 }
  },
  error: { type: String, required: false }
}, { timestamps: true });

module.exports = mongoose.model('ReconciliationRun', ReconciliationRunSchema);