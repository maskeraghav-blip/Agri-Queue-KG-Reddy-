const express = require('express');
const router = express.Router();
const agmarknetService = require('../services/agmarknetService');

/**
 * GET /api/agri/commodities
 * Returns lists of searchable commodities and other filter options
 */
router.get('/commodities', async (req, res) => {
  try {
    const filters = await agmarknetService.getFilters();
    res.json(filters.commodities || []);
  } catch (err) {
    console.error('[Agri Route] Error fetching commodities:', err.message);
    res.status(500).json({ error: 'Failed to retrieve commodity list.' });
  }
});

/**
 * GET /api/agri/filters
 * Returns unified filter lists (states, districts, markets, categories)
 */
router.get('/filters', async (req, res) => {
  try {
    const filters = await agmarknetService.getFilters();
    res.json(filters);
  } catch (err) {
    console.error('[Agri Route] Error fetching filters:', err.message);
    res.status(500).json({ error: 'Failed to retrieve filter options.' });
  }
});

/**
 * GET /api/agri/prices
 * Returns current mandi prices filtered by commodityId, stateId, districtId, marketId
 */
router.get('/prices', async (req, res) => {
  try {
    const { commodityId, stateId, districtId, marketId, page = 1, pageSize = 20 } = req.query;
    const prices = await agmarknetService.getDailyPrices({
      commodityId,
      stateId,
      districtId,
      marketId,
      page,
      pageSize
    });
    res.json(prices);
  } catch (err) {
    console.error('[Agri Route] Error fetching daily prices:', err.message);
    res.status(500).json({ error: 'Failed to retrieve market prices.' });
  }
});

/**
 * GET /api/agri/history
 * Returns historical date-wise prices for specific commodityId
 */
router.get('/history', async (req, res) => {
  try {
    const { commodityId } = req.query;
    if (!commodityId) {
      return res.status(400).json({ error: 'commodityId is required.' });
    }
    const history = await agmarknetService.getHistory({ commodityId });
    res.json(history);
  } catch (err) {
    console.error('[Agri Route] Error fetching historical prices:', err.message);
    res.status(500).json({ error: 'Failed to retrieve historical trends.' });
  }
});

/**
 * GET /api/agri/trending
 * Returns commodities with largest weekly price movements (gainers & losers)
 */
router.get('/trending', async (req, res) => {
  try {
    const lastWeek = await agmarknetService.getLastWeekPrices();
    
    // Sort to find largest absolute movements
    const sorted = [...lastWeek].sort((a, b) => Math.abs(b.percentChange) - Math.abs(a.percentChange));
    
    const gainers = sorted.filter(c => c.percentChange > 0).slice(0, 5);
    const losers = sorted.filter(c => c.percentChange < 0).slice(0, 5);
    
    res.json({
      gainers,
      losers,
      all: lastWeek
    });
  } catch (err) {
    console.error('[Agri Route] Error fetching trending commodities:', err.message);
    res.status(500).json({ error: 'Failed to retrieve trending updates.' });
  }
});

module.exports = router;
