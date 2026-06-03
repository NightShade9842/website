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
  
  const { pirate_name, whatsapp_number } = req.body;
  const userId = `${whatsapp_number}@s.whatsapp.net`;

  try {
    const [rows] = await pool.execute(
      'SELECT * FROM players WHERE pirate_name = ? AND user_id = ?',
      [pirate_name, userId]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign(
      { userId: rows[0].user_id, pirateName: rows[0].pirate_name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    return res.json({ token, user: rows[0] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};