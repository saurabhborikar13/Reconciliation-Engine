const ReconciliationRun = require('../models/ReconciliationRun');
const Transaction = require('../models/Transaction');
const ReportEntry = require('../models/ReportEntry');
const { parseCSV } = require('../utils/csvParser');
const { runMatchingEngine } = require('../utils/matcher');

const parseToCsvString = (entries) => {
  const headers = [
    'category', 'reason',
    'user_transaction_id', 'user_timestamp', 'user_type', 'user_asset', 'user_quantity', 'user_price_usd', 'user_fee', 'user_note',
    'exchange_transaction_id', 'exchange_timestamp', 'exchange_type', 'exchange_asset', 'exchange_quantity', 'exchange_price_usd', 'exchange_fee', 'exchange_note'
  ];

  const lines = entries.map(e => {
    const u = e.userTransaction || {};
    const ex = e.exchangeTransaction || {};
    return [
      e.category,
      `"${(e.reason || '').replace(/"/g, '""')}"`,
      u.transaction_id || '', u.timestamp || '', u.type || '', u.asset || '', u.quantity ?? '', u.price_usd ?? '', u.fee ?? '', u.note ? `"${u.note.replace(/"/g, '""')}"` : '',
      ex.transaction_id || '', ex.timestamp || '', ex.type || '', ex.asset || '', ex.quantity ?? '', ex.price_usd ?? '', ex.fee ?? '', ex.note ? `"${ex.note.replace(/"/g, '""')}"` : ''
    ].join(',');
  });
  return [headers.join(','), ...lines].join('\n');
};

exports.reconcile = async (req, res) => {
  let runRecord = null;
  try {
    if (!req.files || !req.files.user_file || !req.files.exchange_file) {
      return res.status(400).json({ error: 'Multipart attachment fields user_file and exchange_file required.' });
    }

    const timestampToleranceSeconds = parseInt(req.body.TIMESTAMP_TOLERANCE_SECONDS) || parseInt(process.env.TIMESTAMP_TOLERANCE_SECONDS) || 300;
    const quantityTolerancePct = parseFloat(req.body.QUANTITY_TOLERANCE_PCT) || parseFloat(process.env.QUANTITY_TOLERANCE_PCT) || 0.01;

    runRecord = await ReconciliationRun.create({
      status: 'processing',
      config: { timestampToleranceSeconds, quantityTolerancePct }
    });

    const userRows = await parseCSV(req.files.user_file[0].path, 'user');
    const exchangeRows = await parseCSV(req.files.exchange_file[0].path, 'exchange');

    const userDocs = await Transaction.insertMany(userRows.map(r => ({ ...r, runId: runRecord._id })));
    const exchangeDocs = await Transaction.insertMany(exchangeRows.map(r => ({ ...r, runId: runRecord._id })));

    const { reportEntries, summary } = runMatchingEngine(userDocs, exchangeDocs, { timestampToleranceSeconds, quantityTolerancePct });

    await ReportEntry.insertMany(reportEntries.map(e => ({ ...e, runId: runRecord._id })));

    runRecord.status = 'completed';
    runRecord.summary = summary;
    await runRecord.save();

    return res.status(201).json({ runId: runRecord._id, config: runRecord.config, summary: runRecord.summary });
  } catch (err) {
    if (runRecord) {
      runRecord.status = 'failed';
      runRecord.error = err.message;
      await runRecord.save();
    }
    return res.status(500).json({ error: 'Execution processing error.', details: err.message });
  }
};

exports.getReport = async (req, res) => {
  try {
    const run = await ReconciliationRun.findById(req.params.runId);
    if (!run) return res.status(404).json({ error: 'Record execution tracking tag missing.' });

    const entries = await ReportEntry.find({ runId: req.params.runId }).lean();
    if (req.query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=report_${req.params.runId}.csv`);
      return res.status(200).send(parseToCsvString(entries));
    }
    return res.status(200).json({ runId: req.params.runId, summary: run.summary, report: entries });
  } catch (err) {
    return res.status(500).json({ error: 'Fetch failed.', details: err.message });
  }
};

exports.getSummary = async (req, res) => {
  try {
    const run = await ReconciliationRun.findById(req.params.runId);
    if (!run) return res.status(404).json({ error: 'Run metadata entry missing.' });
    return res.status(200).json({ runId: run._id, status: run.status, summary: run.summary });
  } catch (err) {
    return res.status(500).json({ error: 'Fetch failed.', details: err.message });
  }
};

exports.getUnmatched = async (req, res) => {
  try {
    const items = await ReportEntry.find({
      runId: req.params.runId,
      category: { $in: ['Unmatched (User only)', 'Unmatched (Exchange only)'] }
    }).lean();
    return res.status(200).json({ runId: req.params.runId, count: items.length, unmatched: items });
  } catch (err) {
    return res.status(500).json({ error: 'Fetch failed.', details: err.message });
  }
};