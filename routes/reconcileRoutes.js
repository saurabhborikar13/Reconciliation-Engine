const express = require('express');
const router = express.Router();
const multer = require('multer');
const controller = require('../controllers/reconcileController');

const upload = multer({ dest: 'uploads/' });

router.post('/reconcile', upload.fields([
  { name: 'user_file', maxCount: 1 },
  { name: 'exchange_file', maxCount: 1 }
]), controller.reconcile);

router.get('/report/:runId', controller.getReport);
router.get('/report/:runId/summary', controller.getSummary);
router.get('/report/:runId/unmatched', controller.getUnmatched);

module.exports = router;