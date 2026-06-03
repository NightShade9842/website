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

function verify(req) {
  const auth = req.headers.authorization;
  if (!auth) return null;
  try {
    return jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
  } catch { return null; }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const user = verify(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const [rows] = await pool.execute('SELECT * FROM players WHERE user_id = ?', [user.userId]);
    return res.json(rows[0] || {});
  }
  if (req.method === 'PUT') {
    const { pirate_name, profile_pic } = req.body;
    await pool.execute('UPDATE players SET pirate_name = ?, profile_pic = ? WHERE user_id = ?',
      [pirate_name, profile_pic, user.userId]);
    return res.json({ success: true });
  }
};