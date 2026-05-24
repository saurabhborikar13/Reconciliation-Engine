const csv = require('csv-parser');
const fs = require('fs');
const { validateTransaction } = require('./validator');

const parseCSV = (filePath, source) => {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        const validation = validateTransaction(row);
        results.push({
          ...validation.data,
          source,
          isValid: validation.isValid,
          validationErrors: validation.validationErrors
        });
      })
      .on('end', () => resolve(results))
      .on('error', (err) => reject(err));
  });
};

module.exports = { parseCSV };