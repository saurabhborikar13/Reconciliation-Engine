const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const connectDB = require('./config/database');
const routes = require('./routes/reconcileRoutes');

dotenv.config();
connectDB();

const app = express();

// ── CORS ───────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── BODY PARSERS ────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── STATIC UI ───────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── API ROUTES ──────────────────────────────────────────────────
app.use('/api', routes);

// ── ROOT ─────────────────────────────────────────────────────────
// Serve the UI for all non-API routes (SPA fallback)
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── START ────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 KoinX Reconciliation Engine running on http://localhost:${PORT}`);
  console.log(`📊 Dashboard available at  http://localhost:${PORT}`);
  console.log(`🔌 API base URL            http://localhost:${PORT}/api`);
});