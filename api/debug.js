const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 1,
  queueLimit: 0
});

module.exports = async (req, res) => {
  // Allow CORS (needed for browser)
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const phone = req.query.phone;
  if (!phone) {
    return res.status(400).json({ error: 'Please provide ?phone=number' });
  }

  // Clean the number (remove +, spaces)
  const cleanNumber = phone.replace(/[+\s]/g, '');

  // Try both possible formats: with and without leading +
  const candidates = [
    `${cleanNumber}@s.whatsapp.net`,
    `+${cleanNumber}@s.whatsapp.net`
  ];

  try {
    let user = null;
    for (const userId of candidates) {
      const [rows] = await pool.execute('SELECT * FROM players WHERE user_id = ?', [userId]);
      if (rows.length) {
        user = rows[0];
        break;
      }
    }

    if (!user) {
      return res.status(404).json({ error: 'Not found' });
    }

    // Return the full player object (it will show the exact user_id and pirate_name)
    return res.json(user);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};