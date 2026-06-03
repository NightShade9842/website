const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');

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
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  let { whatsapp_number } = req.body;
  if (!whatsapp_number) {
    return res.status(400).json({ error: 'Please provide your WhatsApp number.' });
  }

  // Clean the number (remove +, spaces, etc.)
  whatsapp_number = whatsapp_number.replace(/[+\s]/g, '').trim();
  const userId = `${whatsapp_number}@s.whatsapp.net`;

  try {
    const [rows] = await pool.execute(
      'SELECT * FROM players WHERE user_id = ?',
      [userId]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'No account found with this number. Make sure you registered with the bot first.' });
    }

    const user = rows[0];
    const token = jwt.sign(
      { userId: user.user_id, pirateName: user.pirate_name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({ token, user });
  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
};