require('dotenv').config({ override: true });
const express = require('express');
const cors = require('cors');
const { getDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Request logging
app.use((req, res, next) => {
  req.setTimeout(0); // Unlimited request timeout
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.url.startsWith('/api')) {
      console.log(`${req.method} ${req.url} ${res.statusCode} ${duration}ms`);
    }
  });
  next();
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/farmers', require('./routes/farmers'));
app.use('/api/centers', require('./routes/centers'));
app.use('/api/doctor', require('./routes/doctor'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/tokens', require('./routes/tokens'));
app.use('/api/queue', require('./routes/queue'));
app.use('/api/market-prices', require('./routes/marketPrices'));
app.use('/api/schemes', require('./routes/schemes'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/seeds', require('./routes/seedRoutes'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/transport', require('./routes/transportRoutes'));
app.use('/api/ai-agent', require('./routes/aiAgent'));
app.use('/api/agri', require('./routes/agri'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0', name: 'AgriQueue API' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Vercel Serverless Function Support
if (process.env.VERCEL) {
  module.exports = app;
} else {
  // Initialize database then start server locally
  async function start() {
    await getDb();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n  🌾 AgriQueue API Server running on http://localhost:${PORT}\n`);
    });
  }

  start().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
// Trigger server watch reload
