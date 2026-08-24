const mysql = require('mysql2/promise');

let pool = null;

async function initDb() {
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'password', // Defaulting to 'password' or whatever user needs
  };

  // First connect without database to create it if it doesn't exist
  const initialConnection = await mysql.createConnection(dbConfig);

  await initialConnection.query('CREATE DATABASE IF NOT EXISTS agriqueue');
  await initialConnection.end();

  // Now create the pool connected to the database
  pool = mysql.createPool({
    ...dbConfig,
    database: process.env.DB_NAME || 'agriqueue',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  // Create tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS farmers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      mobile VARCHAR(20) UNIQUE NOT NULL,
      aadhaar_hash VARCHAR(255),
      farmer_id VARCHAR(50) UNIQUE,
      village VARCHAR(100),
      district VARCHAR(100),
      state VARCHAR(100) DEFAULT 'Telangana',
      land_size FLOAT DEFAULT 0,
      crop_types JSON,
      preferred_language VARCHAR(10) DEFAULT 'en',
      notification_prefs JSON,
      password_hash VARCHAR(255),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS procurement_centers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      address TEXT,
      district VARCHAR(100),
      state VARCHAR(100) DEFAULT 'Telangana',
      location_lat FLOAT NOT NULL,
      location_lng FLOAT NOT NULL,
      capacity_per_slot INT DEFAULT 20,
      operating_hours VARCHAR(50) DEFAULT '08:00-17:00',
      crops_accepted JSON,
      active_counters INT DEFAULT 2,
      is_open BOOLEAN DEFAULT 1,
      avg_processing_minutes FLOAT DEFAULT 8.0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      farmer_id INT NOT NULL,
      center_id INT NOT NULL,
      slot_date DATE NOT NULL,
      slot_time VARCHAR(20) NOT NULL,
      crop_type VARCHAR(100),
      estimated_quantity FLOAT,
      status ENUM('booked','queued','in_progress','completed','cancelled','no_show') DEFAULT 'booked',
      queue_position INT,
      token_id INT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (farmer_id) REFERENCES farmers(id),
      FOREIGN KEY (center_id) REFERENCES procurement_centers(id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      booking_id INT NOT NULL UNIQUE,
      token_code VARCHAR(50) UNIQUE NOT NULL,
      qr_data TEXT,
      issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      scanned_at DATETIME NULL,
      status ENUM('active','used','expired','cancelled') DEFAULT 'active',
      FOREIGN KEY (booking_id) REFERENCES bookings(id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      farmer_id INT NOT NULL,
      type VARCHAR(50) NOT NULL,
      channel ENUM('in_app','sms','whatsapp','push') DEFAULT 'in_app',
      title VARCHAR(255),
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT 0,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status ENUM('pending','sent','delivered','failed') DEFAULT 'sent',
      FOREIGN KEY (farmer_id) REFERENCES farmers(id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS market_prices (
      id INT AUTO_INCREMENT PRIMARY KEY,
      crop_name VARCHAR(100) NOT NULL,
      crop_name_hi VARCHAR(100),
      crop_name_te VARCHAR(100),
      mandi_name VARCHAR(100) NOT NULL,
      state VARCHAR(100),
      price_per_quintal FLOAT NOT NULL,
      msp FLOAT,
      unit VARCHAR(50) DEFAULT 'INR/quintal',
      date_recorded DATE,
      trend ENUM('up','down','stable') DEFAULT 'stable'
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schemes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      title_hi VARCHAR(255),
      title_te VARCHAR(255),
      description TEXT NOT NULL,
      description_hi TEXT,
      description_te TEXT,
      eligibility TEXT,
      eligibility_hi TEXT,
      eligibility_te TEXT,
      required_documents JSON,
      link VARCHAR(255),
      icon VARCHAR(50) DEFAULT 'info',
      is_active BOOLEAN DEFAULT 1
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      action VARCHAR(100) NOT NULL,
      entity_type VARCHAR(100) NOT NULL,
      entity_id INT,
      actor_id INT,
      actor_type VARCHAR(50) DEFAULT 'farmer',
      details JSON,
      ip_address VARCHAR(50),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS seeds (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      supplier VARCHAR(255) NOT NULL,
      price FLOAT NOT NULL,
      mrp FLOAT NOT NULL,
      rating FLOAT,
      reviews VARCHAR(20),
      stock INT DEFAULT 0,
      image VARCHAR(500),
      description TEXT,
      badge VARCHAR(100),
      tags JSON
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS seed_orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      farmer_id INT NOT NULL,
      total_amount FLOAT NOT NULL,
      status ENUM('pending','completed','cancelled') DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (farmer_id) REFERENCES farmers(id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS seed_order_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      seed_id INT NOT NULL,
      quantity INT NOT NULL DEFAULT 1,
      price FLOAT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES seed_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (seed_id) REFERENCES seeds(id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      farmer_id INT NOT NULL,
      amount FLOAT NOT NULL,
      status ENUM('pending','completed','failed','cancelled') DEFAULT 'pending',
      payment_method VARCHAR(50),
      bank_name VARCHAR(100),
      transaction_id VARCHAR(100),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES seed_orders(id),
      FOREIGN KEY (farmer_id) REFERENCES farmers(id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS transport_bookings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      farmer_id INT NOT NULL,
      vehicle_name VARCHAR(255) NOT NULL,
      pickup_location VARCHAR(255) NOT NULL,
      drop_location VARCHAR(255) NOT NULL,
      booking_date DATETIME NOT NULL,
      status ENUM('pending','confirmed','completed','cancelled') DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (farmer_id) REFERENCES farmers(id)
    )
  `);

  // Try to alter table to add columns in case it exists
  try { await pool.query('ALTER TABLE seeds ADD COLUMN description TEXT'); } catch(e) {}
  try { await pool.query('ALTER TABLE seeds ADD COLUMN badge VARCHAR(100)'); } catch(e) {}
  try { await pool.query('ALTER TABLE seeds ADD COLUMN tags JSON'); } catch(e) {}

  // Seed default items if empty or less than 15
  const [seedRows] = await pool.query('SELECT COUNT(*) as count FROM seeds');
  if (seedRows[0].count < 15) {
    await pool.query('SET FOREIGN_KEY_CHECKS = 0');
    await pool.query('DELETE FROM seeds');
    await pool.query('SET FOREIGN_KEY_CHECKS = 1');
    
    const newSeeds = [
      ['Golden Wheat Seeds', 'Kisan Gold', 1200, 1400, 4.9, '4.2K', 50, 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=600&auto=format&fit=crop&q=80', 'High-yield drought-resistant wheat variant perfect for dry regions.', '100% Organic', JSON.stringify(['Drought Resistant', 'High Yield', 'Fast Growth'])],
      ['Basmati Royal Rice', 'Heritage Seeds', 1800, 2000, 4.8, '12K', 40, 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&auto=format&fit=crop&q=80', 'Premium aromatic basmati rice seeds. Export quality grain length.', '', JSON.stringify(['Aromatic', 'Long Grain', 'Premium'])],
      ['Hybrid Tomato F1', 'AgriTech', 450, 500, 4.6, '2.1K', 100, 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=600&auto=format&fit=crop&q=80', 'Disease-resistant hybrid tomato seeds suitable for greenhouse farming.', '100% Organic', JSON.stringify(['Disease Resistant', 'High Shelf Life'])],
      ['Bt Cotton Bollgard', 'Monsanto (Generic)', 800, 950, 4.7, '3.5K', 150, 'https://images.unsplash.com/photo-1606041008023-472dfb5e530f?w=600&auto=format&fit=crop&q=80', 'Genetically modified cotton seeds resistant to bollworms.', '', JSON.stringify(['Pest Resistant', 'High Fiber'])],
      ['Mustard Gold 99', 'Desi Seeds', 600, 700, 4.5, '1.8K', 80, 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=600&auto=format&fit=crop&q=80', 'High oil content mustard seeds. Traditional flavor with modern yield.', '100% Organic', JSON.stringify(['High Oil %', 'Hardy Crop'])],
      ['Soybean Super Protein', 'NutriFarm', 2200, 2500, 4.8, '5.6K', 60, 'https://images.unsplash.com/photo-1599940824399-b87987ceb72a?w=600&auto=format&fit=crop&q=80', 'Protein-rich soybean variety. Great for soil nitrogen fixation.', '100% Organic', JSON.stringify(['Nitrogen Fixer', 'Protein Rich'])],
      ['Kharif Maize Hybrid', 'Kisan Gold', 700, 850, 4.3, '1.2K', 120, 'https://images.unsplash.com/photo-1551754655-cd27e38d2076?w=600&auto=format&fit=crop&q=80', 'Fast-growing maize suitable for Kharif season planting.', '', JSON.stringify(['Fast Growth', 'Sturdy Stalks'])],
      ['Groundnut Bold 44', 'Heritage Seeds', 1500, 1750, 4.6, '2.9K', 45, 'https://images.unsplash.com/photo-1567892328521-998db4c5b364?w=600&auto=format&fit=crop&q=80', 'High oil yielding groundnut seeds. Best for sandy loam soil.', 'Top Seller', JSON.stringify(['High Yield', 'Oil Rich'])],
      ['Sugarcane Setts CO-0238', 'SugarCo', 2500, 2800, 4.4, '800', 30, 'https://images.unsplash.com/photo-1589927986089-35812388d1f4?w=600&auto=format&fit=crop&q=80', 'High sugar recovery variety. Disease free tissue culture setts.', '', JSON.stringify(['High Recovery', 'Disease Free'])],
      ['Turmeric Seed Rhizomes', 'SpiceFarm', 950, 1100, 4.7, '3.1K', 75, 'https://images.unsplash.com/photo-1615485500704-8e990f9900f7?w=600&auto=format&fit=crop&q=80', 'High curcumin content turmeric rhizomes. Organic certified.', '100% Organic', JSON.stringify(['High Curcumin', 'Medicinal'])],
      ['Jowar (Sorghum) Pro', 'Desi Seeds', 400, 500, 4.2, '1.5K', 200, 'https://images.unsplash.com/photo-1595855759920-86582396756a?w=600&auto=format&fit=crop&q=80', 'Dual purpose sorghum for grain and fodder. Highly drought tolerant.', '', JSON.stringify(['Drought Tolerant', 'Dual Purpose'])],
      ['Onion Red Nashik', 'AgriTech', 1100, 1300, 4.8, '6.7K', 90, 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=600&auto=format&fit=crop&q=80', 'Classic pungent red onion seeds with excellent storage life.', 'Top Rated', JSON.stringify(['High Shelf Life', 'Pungent'])],
      ['Chilli Teja Guntur', 'SpiceFarm', 1800, 2100, 4.9, '15K', 20, 'https://images.unsplash.com/photo-1588252303782-cb80119abd6d?w=600&auto=format&fit=crop&q=80', 'Extremely spicy red chilli seeds. Premium export quality.', 'Bestseller', JSON.stringify(['High Pungency', 'Export Quality'])],
      ['Potato Seed Tubers', 'NutriFarm', 1300, 1500, 4.4, '2.3K', 60, 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=600&auto=format&fit=crop&q=80', 'Disease-free potato tubers for uniform and high yield.', '', JSON.stringify(['Uniform Yield', 'Disease Free'])],
      ['Cabbage Green F1', 'AgriTech', 350, 450, 4.5, '1.1K', 150, 'https://images.unsplash.com/photo-1594282486552-05b4d80fbb9f?w=600&auto=format&fit=crop&q=80', 'Compact and heavy cabbage heads. Resistant to black rot.', '100% Organic', JSON.stringify(['Black Rot Resistant', 'Compact Head'])],
      ['Carrot Kuroda', 'Heritage Seeds', 400, 500, 4.3, '900', 100, 'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?w=600&auto=format&fit=crop&q=80', 'Deep orange, sweet and tender carrots. High market demand.', '', JSON.stringify(['Sweet Taste', 'High Demand'])],
      ['Spinach All Green', 'Kisan Gold', 250, 300, 4.6, '3.4K', 250, 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=600&auto=format&fit=crop&q=80', 'Fast growing leafy spinach. Rich in iron and vitamins.', '100% Organic', JSON.stringify(['Fast Growth', 'Iron Rich'])],
      ['Okra (Bhindi) Hybrid', 'AgriTech', 500, 600, 4.4, '2.8K', 130, 'https://images.unsplash.com/photo-1425543103986-22abb7d7e8d2?w=600&auto=format&fit=crop&q=80', 'Dark green, tender okra. Resistant to Yellow Vein Mosaic Virus.', '', JSON.stringify(['YVMV Resistant', 'Tender'])]
    ];

    for (const s of newSeeds) {
      await pool.query(
        'INSERT INTO seeds (name, supplier, price, mrp, rating, reviews, stock, image, description, badge, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        s
      );
    }
  }

  return pool;
}

async function getDb() {
  if (pool) return pool;
  return await initDb();
}

async function prepareGet(sql, params = []) {
  if (!pool) await getDb();
  const [rows] = await pool.execute(sql, params);
  return rows.length ? rows[0] : null;
}

async function prepareAll(sql, params = []) {
  if (!pool) await getDb();
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function prepareRun(sql, params = []) {
  if (!pool) await getDb();
  const [result] = await pool.execute(sql, params);
  return { lastInsertRowid: result.insertId, changes: result.affectedRows };
}

module.exports = { getDb, prepareGet, prepareAll, prepareRun, initDb };
