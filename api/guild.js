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
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { guild_id } = req.query;
  if (!guild_id) return res.status(400).json({ error: 'Missing guild_id' });

  const [[guild]] = await pool.execute('SELECT * FROM guilds WHERE id = ?', [guild_id]);
  const [members] = await pool.execute(
    `SELECT p.user_id, p.pirate_name, p.level, p.guild_role FROM players p WHERE p.guild_id = ? ORDER BY FIELD(p.guild_role, 'captain', 'first mate', 'member'), p.level DESC`,
    [guild_id]
  );
  return res.json({ guild, members });
};