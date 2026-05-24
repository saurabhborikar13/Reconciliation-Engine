const validateTransaction = (row) => {
  const errors = [];
  
  if (!row.transaction_id || row.transaction_id.trim() === '') {
    errors.push('Missing transaction_id');
  }
  if (!row.asset || row.asset.trim() === '') {
    errors.push('Missing asset token name');
  }
  if (!row.type || row.type.trim() === '') {
    errors.push('Missing transaction type action');
  }

  // Handle malformed strings or empty values
  let parsedTimestamp = null;
  if (!row.timestamp || row.timestamp.trim() === '') {
    errors.push('Missing timestamp sequence');
  } else {
    parsedTimestamp = new Date(row.timestamp);
    if (isNaN(parsedTimestamp.getTime()) || row.timestamp.trim().endsWith('T')) {
      errors.push(`Malformed timestamp detected: "${row.timestamp}"`);
      parsedTimestamp = null;
    }
  }

  let quantity = parseFloat(row.quantity);
  if (isNaN(quantity)) {
    errors.push(`Invalid numeric quantity structure: ${row.quantity}`);
  } else if (quantity <= 0) {
    errors.push(`Negative or zero quantity violation: ${row.quantity}`);
  }

  return {
    isValid: errors.length === 0,
    validationErrors: errors,
    data: {
      transaction_id: row.transaction_id ? row.transaction_id.trim() : null,
      timestamp: row.timestamp ? row.timestamp.trim() : null,
      parsedTimestamp,
      type: row.type ? row.type.trim().toUpperCase() : null,
      asset: row.asset ? row.asset.trim() : null,
      quantity: isNaN(quantity) ? null : quantity,
      price_usd: row.price_usd && !isNaN(parseFloat(row.price_usd)) ? parseFloat(row.price_usd) : null,
      fee: row.fee && !isNaN(parseFloat(row.fee)) ? parseFloat(row.fee) : 0,
      note: row.note ? row.note.trim() : ''
    }
  };
};

module.exports = { validateTransaction };