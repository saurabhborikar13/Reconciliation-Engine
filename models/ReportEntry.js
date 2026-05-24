const mongoose = require('mongoose');

const ReportEntrySchema = new mongoose.Schema({
  runId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ReconciliationRun',
    required: true
  },
  category: {
    type: String,
    enum: ['Matched', 'Conflicting', 'Unmatched (User only)', 'Unmatched (Exchange only)'],
    required: true
  },
  reason: { type: String, required: true },
  userTransaction: { type: mongoose.Schema.Types.Mixed, default: null },
  exchangeTransaction: { type: mongoose.Schema.Types.Mixed, default: null }
}, { timestamps: true });

ReportEntrySchema.index({ runId: 1, category: 1 });

module.exports = mongoose.model('ReportEntry', ReportEntrySchema);