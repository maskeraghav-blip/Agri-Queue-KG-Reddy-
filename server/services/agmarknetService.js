const axios = require('axios');
const { prepareGet, prepareRun } = require('../db');

const BASE_URL = 'https://api.agmarknet.gov.in/v1';

// Headers required to prevent 403 responses
const HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Origin': 'https://agmarknet.gov.in',
  'Referer': 'https://agmarknet.gov.in/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

/**
 * Fetch data from AGMARKNET with retries
 */
async function fetchWithRetry(config, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await axios({
        ...config,
        headers: {
          ...HEADERS,
          ...config.headers
        },
        timeout: 15000 // 15 seconds timeout
      });
      return response.data;
    } catch (err) {
      console.warn(`[AGMARKNET Service] Attempt ${i + 1} failed:`, err.message);
      if (i === retries) throw err;
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}

/**
 * Get cached item or fetch and update cache
 */
async function getOrFetch(cacheKey, fetchFn, cacheDurationMs) {
  try {
    const cached = await prepareGet('SELECT * FROM agmarknet_cache WHERE cache_key = ?', [cacheKey]);
    const now = new Date();
    
    if (cached && new Date(cached.expires_at) > now) {
      console.log(`[AGMARKNET Cache] Hit for: ${cacheKey}`);
      return JSON.parse(cached.cache_value);
    }

    console.log(`[AGMARKNET Cache] Miss/Expired for: ${cacheKey}. Fetching from API...`);
    try {
      const freshData = await fetchFn();
      const expiresAt = new Date(Date.now() + cacheDurationMs).toISOString().slice(0, 19).replace('T', ' ');
      
      await prepareRun(
        'INSERT INTO agmarknet_cache (cache_key, cache_value, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE cache_value = VALUES(cache_value), expires_at = VALUES(expires_at)',
        [cacheKey, JSON.stringify(freshData), expiresAt]
      );
      
      return freshData;
    } catch (apiErr) {
      console.error(`[AGMARKNET API] Failed to fetch data:`, apiErr.message);
      if (cached) {
        console.warn(`[AGMARKNET Cache] Falling back to expired cache data for: ${cacheKey}`);
        return JSON.parse(cached.cache_value);
      }
      throw apiErr;
    }
  } catch (dbErr) {
    console.error(`[Database Cache Error]`, dbErr.message);
    return await fetchFn();
  }
}

const agmarknetService = {
  /**
   * Fetch filter metadata (commodities, states, districts, markets, categories)
   * Cache duration: 24 Hours (86400000 ms)
   */
  async getFilters() {
    return getOrFetch('filters_meta', async () => {
      try {
        // 1. Fetch main filters containing commodities
        const filterData = await fetchWithRetry({
          method: 'GET',
          url: `${BASE_URL}/daily-price-arrival/filters`
        });

        // 2. Fetch states metadata
        const stateData = await fetchWithRetry({
          method: 'GET',
          url: `${BASE_URL}/location/state?page=1`
        });

        // 3. Fetch category list
        const categoryData = await fetchWithRetry({
          method: 'GET',
          url: `${BASE_URL}/list-market-category`
        });

        // Construct a unified metadata response
        return {
          commodities: filterData?.commodityList && filterData.commodityList.length ? filterData.commodityList : getMockCommodities(),
          commodityGroups: filterData?.commodityGroupList || [],
          categories: categoryData || [],
          states: stateData?.states && stateData.states.length 
            ? stateData.states 
            : (stateData?.records && stateData.records.length 
              ? stateData.records 
              : (Array.isArray(stateData) && stateData.length ? stateData : getMockStates())),
          districts: filterData?.districtList || [],
          markets: filterData?.marketList || [],
          varieties: filterData?.varietyList || [],
          grades: filterData?.gradeList || []
        };
      } catch (err) {
        console.warn('[AGMARKNET Service] Metadata fetch failed, using offline fallback filters...');
        return {
          commodities: getMockCommodities(),
          commodityGroups: [],
          categories: [],
          states: getMockStates(),
          districts: getMockDistricts(),
          markets: getMockMarkets(),
          varieties: [],
          grades: []
        };
      }
    }, 86400000); // 24 hours
  },

  /**
   * Fetch daily prices based on filters
   * Cache duration: 1 Hour (3600000 ms)
   */
  async getDailyPrices({ commodityId, stateId, districtId, marketId, page = 1, pageSize = 20 }) {
    const cacheKey = `prices_daily_${commodityId || 'all'}_s${stateId || 'all'}_d${districtId || 'all'}_m${marketId || 'all'}_p${page}`;
    
    return getOrFetch(cacheKey, async () => {
      // Build filters payload
      const payload = {
        commodityId: commodityId ? parseInt(commodityId) : null,
        stateId: stateId ? parseInt(stateId) : null,
        districtId: districtId ? parseInt(districtId) : null,
        marketId: marketId ? parseInt(marketId) : null,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      };

      try {
        const response = await fetchWithRetry({
          method: 'POST',
          url: `${BASE_URL}/prices-and-arrivals/market-report/daily`,
          data: payload
        });
        return response || { records: [], totalRecords: 0 };
      } catch (err) {
        console.error('[AGMARKNET Service] Daily prices fetch failed, providing fallback mock pricing...');
        return getMockPricesFallback(payload);
      }
    }, 3600000); // 1 hour
  },

  /**
   * Fetch historical trend prices for specific commodity
   * Cache duration: 1 Hour (3600000 ms)
   */
  async getHistory({ commodityId }) {
    const cacheKey = `prices_history_${commodityId}`;
    return getOrFetch(cacheKey, async () => {
      try {
        const response = await fetchWithRetry({
          method: 'GET',
          url: `${BASE_URL}/prices-and-arrivals/date-wise/specific-commodity?commodityId=${commodityId}`
        });
        return response || [];
      } catch (err) {
        console.error('[AGMARKNET Service] History fetch failed, providing fallback mock trends...');
        return getMockHistoryFallback(commodityId);
      }
    }, 3600000);
  },

  /**
   * Fetch last week prices to calculate trend movement
   * Cache duration: 1 Hour (3600000 ms)
   */
  async getLastWeekPrices() {
    return getOrFetch('prices_last_week', async () => {
      try {
        const response = await fetchWithRetry({
          method: 'GET',
          url: `${BASE_URL}/prices-and-arrivals/commodity-price/lastweek`
        });
        return response || [];
      } catch (err) {
        console.error('[AGMARKNET Service] Last week prices fetch failed, using fallback...');
        return getMockLastWeekFallback();
      }
    }, 3600000);
  }
};

/**
 * Robust mock fallback databases when official portals are offline or rate-limited
 */
function getMockPricesFallback({ commodityId, stateId, districtId, marketId, page, pageSize }) {
  const allMock = [
    // --- Telangana ---
    { commodityName: 'Tomato', stateName: 'Telangana', districtName: 'Medak', marketName: 'Gajwel Mandi', varietyName: 'Desi', gradeName: 'FAQ', arrivalDate: new Date().toISOString().split('T')[0], minPrice: 2000, maxPrice: 2800, modalPrice: 2400 },
    { commodityName: 'Wheat', stateName: 'Telangana', districtName: 'Nizamabad', marketName: 'Nizamabad Mandi', varietyName: 'Lokwan', gradeName: 'FAQ', arrivalDate: new Date().toISOString().split('T')[0], minPrice: 2100, maxPrice: 2400, modalPrice: 2275 },
    { commodityName: 'Rice (Paddy)', stateName: 'Telangana', districtName: 'Warangal', marketName: 'Warangal Mandi', varietyName: 'Common', gradeName: 'Grade A', arrivalDate: new Date().toISOString().split('T')[0], minPrice: 2100, maxPrice: 2300, modalPrice: 2200 },
    { commodityName: 'Cotton', stateName: 'Telangana', districtName: 'Warangal', marketName: 'Warangal Mandi', varietyName: 'Medium Staple', gradeName: 'FAQ', arrivalDate: new Date().toISOString().split('T')[0], minPrice: 6500, maxPrice: 7200, modalPrice: 6900 },
    { commodityName: 'Turmeric', stateName: 'Telangana', districtName: 'Nizamabad', marketName: 'Nizamabad Mandi', varietyName: 'Finger', gradeName: 'Premium', arrivalDate: new Date().toISOString().split('T')[0], minPrice: 12000, maxPrice: 14500, modalPrice: 13500 },
    { commodityName: 'Maize', stateName: 'Telangana', districtName: 'Warangal', marketName: 'Warangal Mandi', varietyName: 'Hybrid', gradeName: 'FAQ', arrivalDate: new Date().toISOString().split('T')[0], minPrice: 1800, maxPrice: 2200, modalPrice: 2000 },

    // --- Maharashtra ---
    { commodityName: 'Onion', stateName: 'Maharashtra', districtName: 'Nashik', marketName: 'Lasalgaon Mandi', varietyName: 'Red Onion', gradeName: 'FAQ', arrivalDate: new Date().toISOString().split('T')[0], minPrice: 1500, maxPrice: 2200, modalPrice: 1900 },
    { commodityName: 'Tomato', stateName: 'Maharashtra', districtName: 'Nashik', marketName: 'Lasalgaon Mandi', varietyName: 'Local', gradeName: 'FAQ', arrivalDate: new Date().toISOString().split('T')[0], minPrice: 1800, maxPrice: 2600, modalPrice: 2200 },
    { commodityName: 'Potato', stateName: 'Maharashtra', districtName: 'Pune', marketName: 'Pune Mandi', varietyName: 'Jyoti', gradeName: 'FAQ', arrivalDate: new Date().toISOString().split('T')[0], minPrice: 1300, maxPrice: 1700, modalPrice: 1500 },
    { commodityName: 'Wheat', stateName: 'Maharashtra', districtName: 'Pune', marketName: 'Pune Mandi', varietyName: 'Sharbati', gradeName: 'Premium', arrivalDate: new Date().toISOString().split('T')[0], minPrice: 2400, maxPrice: 2800, modalPrice: 2600 },

    // --- Andhra Pradesh ---
    { commodityName: 'Turmeric', stateName: 'Andhra Pradesh', districtName: 'Guntur', marketName: 'Guntur Mandi', varietyName: 'Finger', gradeName: 'Premium', arrivalDate: new Date().toISOString().split('T')[0], minPrice: 11800, maxPrice: 14200, modalPrice: 13000 },
    { commodityName: 'Chilli', stateName: 'Andhra Pradesh', districtName: 'Guntur', marketName: 'Guntur Mandi', varietyName: 'Teja', gradeName: 'Export Quality', arrivalDate: new Date().toISOString().split('T')[0], minPrice: 18000, maxPrice: 21500, modalPrice: 19500 },
    { commodityName: 'Onion', stateName: 'Andhra Pradesh', districtName: 'Kurnool', marketName: 'Kurnool Mandi', varietyName: 'Red Onion', gradeName: 'FAQ', arrivalDate: new Date().toISOString().split('T')[0], minPrice: 1400, maxPrice: 2000, modalPrice: 1750 },
    { commodityName: 'Rice (Paddy)', stateName: 'Andhra Pradesh', districtName: 'Kurnool', marketName: 'Kurnool Mandi', varietyName: 'Sona Masuri', gradeName: 'Premium', arrivalDate: new Date().toISOString().split('T')[0], minPrice: 2300, maxPrice: 2600, modalPrice: 2450 },

    // --- Karnataka ---
    { commodityName: 'Onion', stateName: 'Karnataka', districtName: 'Hubballi', marketName: 'Hubballi Mandi', varietyName: 'Bangalore Rose', gradeName: 'FAQ', arrivalDate: new Date().toISOString().split('T')[0], minPrice: 1600, maxPrice: 2300, modalPrice: 2050 },
    { commodityName: 'Rice (Paddy)', stateName: 'Karnataka', districtName: 'Hubballi', marketName: 'Hubballi Mandi', varietyName: 'Jyoti', gradeName: 'Grade A', arrivalDate: new Date().toISOString().split('T')[0], minPrice: 2200, maxPrice: 2450, modalPrice: 2300 },
    { commodityName: 'Potato', stateName: 'Karnataka', districtName: 'Belagavi', marketName: 'Belagavi Mandi', varietyName: 'Jyoti', gradeName: 'FAQ', arrivalDate: new Date().toISOString().split('T')[0], minPrice: 1100, maxPrice: 1500, modalPrice: 1300 },
    { commodityName: 'Maize', stateName: 'Karnataka', districtName: 'Belagavi', marketName: 'Belagavi Mandi', varietyName: 'Local Hybrid', gradeName: 'FAQ', arrivalDate: new Date().toISOString().split('T')[0], minPrice: 1750, maxPrice: 2100, modalPrice: 1950 },

    // --- Madhya Pradesh ---
    { commodityName: 'Soybean', stateName: 'Madhya Pradesh', districtName: 'Indore', marketName: 'Indore Mandi', varietyName: 'Yellow Soybean', gradeName: 'FAQ', arrivalDate: new Date().toISOString().split('T')[0], minPrice: 4200, maxPrice: 4800, modalPrice: 4500 },
    { commodityName: 'Wheat', stateName: 'Madhya Pradesh', districtName: 'Indore', marketName: 'Indore Mandi', varietyName: 'Malwa Sharbati', gradeName: 'Premium', arrivalDate: new Date().toISOString().split('T')[0], minPrice: 2500, maxPrice: 3000, modalPrice: 2750 },
    { commodityName: 'Onion', stateName: 'Madhya Pradesh', districtName: 'Ujjain', marketName: 'Ujjain Mandi', varietyName: 'Local Red', gradeName: 'FAQ', arrivalDate: new Date().toISOString().split('T')[0], minPrice: 1300, maxPrice: 1800, modalPrice: 1600 },

    // --- Uttar Pradesh ---
    { commodityName: 'Potato', stateName: 'Uttar Pradesh', districtName: 'Agra', marketName: 'Agra Mandi', varietyName: 'Jyoti', gradeName: 'FAQ', arrivalDate: new Date().toISOString().split('T')[0], minPrice: 1200, maxPrice: 1600, modalPrice: 1400 },
    { commodityName: 'Wheat', stateName: 'Uttar Pradesh', districtName: 'Agra', marketName: 'Agra Mandi', varietyName: 'Dara', gradeName: 'FAQ', arrivalDate: new Date().toISOString().split('T')[0], minPrice: 2200, maxPrice: 2400, modalPrice: 2300 },
    { commodityName: 'Rice (Paddy)', stateName: 'Uttar Pradesh', districtName: 'Lucknow', marketName: 'Lucknow Mandi', varietyName: 'Basmati', gradeName: 'Premium', arrivalDate: new Date().toISOString().split('T')[0], minPrice: 3200, maxPrice: 3800, modalPrice: 3500 },
    { commodityName: 'Tomato', stateName: 'Uttar Pradesh', districtName: 'Lucknow', marketName: 'Lucknow Mandi', varietyName: 'Desi', gradeName: 'FAQ', arrivalDate: new Date().toISOString().split('T')[0], minPrice: 1800, maxPrice: 2500, modalPrice: 2100 }
  ];

  let filtered = allMock;
  if (commodityId) {
    const names = { 17: 'Wheat', 23: 'Rice (Paddy)', 19: 'Tomato', 20: 'Onion', 21: 'Potato', 22: 'Cotton', 24: 'Turmeric', 25: 'Maize' };
    const name = names[commodityId];
    if (name) filtered = filtered.filter(f => f.commodityName.toLowerCase() === name.toLowerCase());
  }
  if (stateId) {
    const states = { 1: 'Telangana', 2: 'Maharashtra', 3: 'Uttar Pradesh', 4: 'Andhra Pradesh', 5: 'Karnataka', 6: 'Madhya Pradesh' };
    const sName = states[stateId];
    if (sName) filtered = filtered.filter(f => f.stateName.toLowerCase() === sName.toLowerCase());
  }
  if (districtId) {
    const districts = { 10: 'Medak', 11: 'Nizamabad', 12: 'Warangal', 13: 'Nashik', 14: 'Agra', 15: 'Pune', 16: 'Lucknow', 17: 'Guntur', 18: 'Kurnool', 19: 'Hubballi', 20: 'Belagavi', 21: 'Indore', 22: 'Ujjain' };
    const dName = districts[districtId];
    if (dName) filtered = filtered.filter(f => f.districtName.toLowerCase() === dName.toLowerCase());
  }
  if (marketId) {
    const markets = { 50: 'Gajwel Mandi', 51: 'Nizamabad Mandi', 52: 'Warangal Mandi', 53: 'Lasalgaon Mandi', 54: 'Agra Mandi', 55: 'Pune Mandi', 56: 'Lucknow Mandi', 57: 'Guntur Mandi', 58: 'Kurnool Mandi', 59: 'Hubballi Mandi', 60: 'Belagavi Mandi', 61: 'Indore Mandi', 62: 'Ujjain Mandi' };
    const mName = markets[marketId];
    if (mName) filtered = filtered.filter(f => f.marketName.toLowerCase() === mName.toLowerCase());
  }

  const start = (page - 1) * pageSize;
  const records = filtered.slice(start, start + pageSize);

  return {
    records,
    totalRecords: filtered.length
  };
}

function getMockHistoryFallback(commodityId) {
  const dates = Array.from({ length: 15 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().split('T')[0];
  }).reverse();

  let basePrice = 2000;
  if (commodityId == 24) basePrice = 13000; // Turmeric
  if (commodityId == 22) basePrice = 6800;  // Cotton
  if (commodityId == 20) basePrice = 1900;  // Onion

  return dates.map((date, idx) => ({
    date,
    modalPrice: basePrice + Math.round(Math.sin(idx) * 200 + (idx * 15))
  }));
}

function getMockLastWeekFallback() {
  return [
    { commodityName: 'Tomato', lastWeekPrice: 2200, currentPrice: 2400, percentChange: 9.09, status: 'gainer' },
    { commodityName: 'Onion', lastWeekPrice: 2100, currentPrice: 1900, percentChange: -9.52, status: 'loser' },
    { commodityName: 'Turmeric', lastWeekPrice: 12500, currentPrice: 13500, percentChange: 8.0, status: 'gainer' },
    { commodityName: 'Cotton', lastWeekPrice: 7000, currentPrice: 6900, percentChange: -1.43, status: 'loser' },
    { commodityName: 'Wheat', lastWeekPrice: 2250, currentPrice: 2275, percentChange: 1.11, status: 'stable' }
  ];
}

function getMockCommodities() {
  return [
    { commodityCode: 19, commodityName: 'Tomato' },
    { commodityCode: 20, commodityName: 'Onion' },
    { commodityCode: 21, commodityName: 'Potato' },
    { commodityCode: 17, commodityName: 'Wheat' },
    { commodityCode: 23, commodityName: 'Rice (Paddy)' },
    { commodityCode: 22, commodityName: 'Cotton' },
    { commodityCode: 24, commodityName: 'Turmeric' },
    { commodityCode: 25, commodityName: 'Maize' }
  ];
}

function getMockStates() {
  return [
    { stateCode: 1, stateName: 'Telangana' },
    { stateCode: 2, stateName: 'Maharashtra' },
    { stateCode: 3, stateName: 'Uttar Pradesh' },
    { stateCode: 4, stateName: 'Andhra Pradesh' },
    { stateCode: 5, stateName: 'Karnataka' },
    { stateCode: 6, stateName: 'Madhya Pradesh' }
  ];
}

function getMockDistricts() {
  return [
    { districtCode: 10, districtName: 'Medak', stateCode: 1 },
    { districtCode: 11, districtName: 'Nizamabad', stateCode: 1 },
    { districtCode: 12, districtName: 'Warangal', stateCode: 1 },
    { districtCode: 13, districtName: 'Nashik', stateCode: 2 },
    { districtCode: 15, districtName: 'Pune', stateCode: 2 },
    { districtCode: 14, districtName: 'Agra', stateCode: 3 },
    { districtCode: 16, districtName: 'Lucknow', stateCode: 3 },
    { districtCode: 17, districtName: 'Guntur', stateCode: 4 },
    { districtCode: 18, districtName: 'Kurnool', stateCode: 4 },
    { districtCode: 19, districtName: 'Hubballi', stateCode: 5 },
    { districtCode: 20, districtName: 'Belagavi', stateCode: 5 },
    { districtCode: 21, districtName: 'Indore', stateCode: 6 },
    { districtCode: 22, districtName: 'Ujjain', stateCode: 6 }
  ];
}

function getMockMarkets() {
  return [
    { marketCode: 50, marketName: 'Gajwel Mandi', districtCode: 10 },
    { marketCode: 51, marketName: 'Nizamabad Mandi', districtCode: 11 },
    { marketCode: 52, marketName: 'Warangal Mandi', districtCode: 12 },
    { marketCode: 53, marketName: 'Lasalgaon Mandi', districtCode: 13 },
    { marketCode: 55, marketName: 'Pune Mandi', districtCode: 15 },
    { marketCode: 54, marketName: 'Agra Mandi', districtCode: 14 },
    { marketCode: 56, marketName: 'Lucknow Mandi', districtCode: 16 },
    { marketCode: 57, marketName: 'Guntur Mandi', districtCode: 17 },
    { marketCode: 58, marketName: 'Kurnool Mandi', districtCode: 18 },
    { marketCode: 59, marketName: 'Hubballi Mandi', districtCode: 19 },
    { marketCode: 60, marketName: 'Belagavi Mandi', districtCode: 20 },
    { marketCode: 61, marketName: 'Indore Mandi', districtCode: 21 },
    { marketCode: 62, marketName: 'Ujjain Mandi', districtCode: 22 }
  ];
}

module.exports = agmarknetService;
