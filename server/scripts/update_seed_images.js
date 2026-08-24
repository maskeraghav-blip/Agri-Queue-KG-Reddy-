require('dotenv').config({ override: true });
const { getDb, prepareRun, prepareAll } = require('../db');

const updates = [
  { name: 'Golden Wheat Seeds', image: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=600&auto=format&fit=crop&q=80' },
  { name: 'Basmati Royal Rice', image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&auto=format&fit=crop&q=80' },
  { name: 'Hybrid Tomato F1', image: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=600&auto=format&fit=crop&q=80' },
  { name: 'Bt Cotton Bollgard', image: 'https://images.unsplash.com/photo-1606041008023-472dfb5e530f?w=600&auto=format&fit=crop&q=80' },
  { name: 'Mustard Gold 99', image: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=600&auto=format&fit=crop&q=80' },
  { name: 'Soybean Super Protein', image: 'https://images.unsplash.com/photo-1599940824399-b87987ceb72a?w=600&auto=format&fit=crop&q=80' },
  { name: 'Kharif Maize Hybrid', image: 'https://images.unsplash.com/photo-1551754655-cd27e38d2076?w=600&auto=format&fit=crop&q=80' },
  { name: 'Groundnut Bold 44', image: 'https://images.unsplash.com/photo-1567892328521-998db4c5b364?w=600&auto=format&fit=crop&q=80' },
  { name: 'Sugarcane Setts CO-0238', image: 'https://images.unsplash.com/photo-1589927986089-35812388d1f4?w=600&auto=format&fit=crop&q=80' },
  { name: 'Turmeric Seed Rhizomes', image: 'https://images.unsplash.com/photo-1615485500704-8e990f9900f7?w=600&auto=format&fit=crop&q=80' },
  { name: 'Jowar (Sorghum) Pro', image: 'https://images.unsplash.com/photo-1595855759920-86582396756a?w=600&auto=format&fit=crop&q=80' },
  { name: 'Onion Red Nashik', image: 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=600&auto=format&fit=crop&q=80' },
  { name: 'Chilli Teja Guntur', image: 'https://images.unsplash.com/photo-1588252303782-cb80119abd6d?w=600&auto=format&fit=crop&q=80' },
  { name: 'Potato Seed Tubers', image: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=600&auto=format&fit=crop&q=80' },
  { name: 'Cabbage Green F1', image: 'https://images.unsplash.com/photo-1594282486552-05b4d80fbb9f?w=600&auto=format&fit=crop&q=80' },
  { name: 'Carrot Kuroda', image: 'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?w=600&auto=format&fit=crop&q=80' },
  { name: 'Spinach All Green', image: 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=600&auto=format&fit=crop&q=80' },
  { name: 'Okra (Bhindi) Hybrid', image: 'https://images.unsplash.com/photo-1425543103986-22abb7d7e8d2?w=600&auto=format&fit=crop&q=80' }
];

async function updateDb() {
  await getDb();
  for (const item of updates) {
    await prepareRun('UPDATE seeds SET image = ? WHERE name LIKE ?', [item.image, `%${item.name}%`]);
  }
  console.log('✅ Successfully updated seed images in database!');
  const rows = await prepareAll('SELECT id, name, image FROM seeds');
  console.log(`Updated ${rows.length} seeds in database.`);
  rows.forEach(r => console.log(`- ${r.name}: ${r.image.substring(0, 50)}...`));
}

updateDb()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
