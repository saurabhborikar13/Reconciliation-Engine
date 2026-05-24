const normalizeAsset = (asset) => {
  if (!asset) return '';
  const val = asset.trim().toLowerCase();
  return val === 'bitcoin' ? 'btc' : val;
};

const areTypesCompatible = (userType, exchangeType) => {
  if (!userType || !exchangeType) return false;
  const u = userType.toUpperCase();
  const e = exchangeType.toUpperCase();

  if (u === 'BUY' && e === 'BUY') return true;
  if (u === 'SELL' && e === 'SELL') return true;
  if (u === 'TRANSFER_OUT' && e === 'TRANSFER_IN') return true;
  if (u === 'TRANSFER_IN' && e === 'TRANSFER_OUT') return true;
  return false;
};

const runMatchingEngine = (userDocs, exchangeDocs, config) => {
  const { timestampToleranceSeconds, quantityTolerancePct } = config;
  const reportEntries = [];
  const matchedExchangeIds = new Set();

  const validUser = [];
  userDocs.forEach(u => {
    if (!u.isValid) {
      reportEntries.push({
        category: 'Unmatched (User only)',
        reason: `Data Quality Flag: ${u.validationErrors.join(' | ')}`,
        userTransaction: u,
        exchangeTransaction: null
      });
    } else {
      validUser.push(u);
    }
  });

  const validExchange = [];
  exchangeDocs.forEach(e => {
    if (!e.isValid) {
      reportEntries.push({
        category: 'Unmatched (Exchange only)',
        reason: `Data Quality Flag: ${e.validationErrors.join(' | ')}`,
        userTransaction: null,
        exchangeTransaction: e
      });
    } else {
      validExchange.push(e);
    }
  });

  // Evaluate candidate links
  for (const user of validUser) {
    const userAsset = normalizeAsset(user.asset);
    const userTime = new Date(user.parsedTimestamp).getTime();

    let candidates = validExchange.filter(e => {
      if (matchedExchangeIds.has(e._id.toString())) return false;
      if (normalizeAsset(e.asset) !== userAsset) return false;
      if (!areTypesCompatible(user.type, e.type)) return false;

      const eTime = new Date(e.parsedTimestamp).getTime();
      const timeDiff = Math.abs(userTime - eTime) / 1000;
      return timeDiff <= timestampToleranceSeconds;
    });

    if (candidates.length === 0) {
      reportEntries.push({
        category: 'Unmatched (User only)',
        reason: 'No counterpart transaction discovered within time window tolerance boundaries.',
        userTransaction: user,
        exchangeTransaction: null
      });
      continue;
    }

    // Sort matching records by closest chronological sequence
    candidates.sort((a, b) => {
      const diffA = Math.abs(new Date(a.parsedTimestamp).getTime() - userTime);
      const diffB = Math.abs(new Date(b.parsedTimestamp).getTime() - userTime);
      return diffA - diffB;
    });

    const bestMatch = candidates[0];
    const qtyDiffPct = (Math.abs(user.quantity - bestMatch.quantity) / user.quantity) * 100;
    const finalTimeDiff = Math.abs(userTime - new Date(bestMatch.parsedTimestamp).getTime()) / 1000;

    if (qtyDiffPct <= quantityTolerancePct) {
      reportEntries.push({
        category: 'Matched',
        reason: `Reconciliation verified. Delta time: ${finalTimeDiff}s, Delta quantity: ${qtyDiffPct.toFixed(4)}%`,
        userTransaction: user,
        exchangeTransaction: bestMatch
      });
      matchedExchangeIds.add(bestMatch._id.toString());
    } else {
      reportEntries.push({
        category: 'Conflicting',
        reason: `Temporal linkage established, but quantity variance (${qtyDiffPct.toFixed(4)}%) breaches limit (${quantityTolerancePct}%)`,
        userTransaction: user,
        exchangeTransaction: bestMatch
      });
      matchedExchangeIds.add(bestMatch._id.toString());
    }
  }

  // Pick up remaining unmatched items
  for (const exchange of validExchange) {
    if (!matchedExchangeIds.has(exchange._id.toString())) {
      reportEntries.push({
        category: 'Unmatched (Exchange only)',
        reason: 'No customer ledger counterpart transaction found within timestamp tolerance boundaries.',
        userTransaction: null,
        exchangeTransaction: exchange
      });
    }
  }

  return {
    reportEntries,
    summary: {
      matched: reportEntries.filter(r => r.category === 'Matched').length,
      conflicting: reportEntries.filter(r => r.category === 'Conflicting').length,
      unmatchedUser: reportEntries.filter(r => r.category === 'Unmatched (User only)').length,
      unmatchedExchange: reportEntries.filter(r => r.category === 'Unmatched (Exchange only)').length
    }
  };
};

module.exports = { runMatchingEngine };