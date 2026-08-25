const { prepareAll, prepareRun } = require('../db');

const seedController = {
  async getSeeds(req, res) {
    try {
      const seeds = await prepareAll('SELECT * FROM seeds');
      res.json(seeds);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch seeds' });
    }
  },

  async createOrder(req, res) {
    try {
      const farmerId = req.farmer.id;
      const { items } = req.body;

      if (!items || items.length === 0) {
        return res.status(400).json({ error: 'No items in order' });
      }

      let total = 0;
      for (const item of items) {
        const seed = (await prepareAll('SELECT price FROM seeds WHERE id = ?', [item.seed_id]))[0];
        if (seed) {
          total += seed.price * item.quantity;
        }
      }

      const result = await prepareRun(
        'INSERT INTO seed_orders (farmer_id, total_amount, status) VALUES (?, ?, ?)',
        [farmerId, total, 'pending']
      );

      const orderId = result.lastInsertRowid;
      for (const item of items) {
        await prepareRun(
          'INSERT INTO seed_order_items (order_id, seed_id, quantity, price) VALUES (?, ?, ?, (SELECT price FROM seeds WHERE id = ?))',
          [orderId, item.seed_id, item.quantity, item.seed_id]
        );
      }

      const payResult = await prepareRun(
        'INSERT INTO payments (order_id, farmer_id, amount, status) VALUES (?, ?, ?, ?)',
        [orderId, farmerId, total, 'pending']
      );

      res.json({ success: true, order_id: orderId, payment_id: payResult.lastInsertRowid, total_amount: total });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create order' });
    }
  },

  async buyNow(req, res) {
    try {
      const farmerId = req.farmer.id;
      const { seed_id, quantity = 1 } = req.body;

      if (!seed_id) {
        return res.status(400).json({ error: 'Seed ID is required' });
      }

      const seed = await prepareAll('SELECT * FROM seeds WHERE id = ?', [seed_id]);
      if (!seed || seed.length === 0) {
        return res.status(404).json({ error: 'Seed not found' });
      }

      const s = seed[0];
      const total = s.price * quantity;

      const result = await prepareRun(
        'INSERT INTO seed_orders (farmer_id, total_amount, status) VALUES (?, ?, ?)',
        [farmerId, total, 'pending']
      );

      const orderId = result.lastInsertRowid;
      await prepareRun(
        'INSERT INTO seed_order_items (order_id, seed_id, quantity, price) VALUES (?, ?, ?, ?)',
        [orderId, seed_id, quantity, s.price]
      );

      const payResult = await prepareRun(
        'INSERT INTO payments (order_id, farmer_id, amount, status) VALUES (?, ?, ?, ?)',
        [orderId, farmerId, total, 'pending']
      );

      res.json({ success: true, order_id: orderId, payment_id: payResult.lastInsertRowid, total_amount: total, seed_name: s.name });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to place order' });
    }
  }
};

module.exports = seedController;
