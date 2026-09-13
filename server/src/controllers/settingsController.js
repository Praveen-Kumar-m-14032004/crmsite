const pool = require('../config/db');

async function getSettings(_req, res) {
  const [rows] = await pool.query('SELECT * FROM company_settings LIMIT 1');
  res.json(rows[0] || {});
}

async function updateSettings(req, res) {
  const {
    company_name, address, tel, mobile, email, website, contact_no, uen, default_currency,
  } = req.body;

  if (!company_name) return res.status(400).json({ message: 'Company name is required' });

  const [rows] = await pool.query('SELECT id FROM company_settings LIMIT 1');

  if (rows[0]) {
    await pool.query(
      `UPDATE company_settings SET
        company_name = ?, address = ?, tel = ?, mobile = ?, email = ?,
        website = ?, contact_no = ?, uen = ?, default_currency = ?
       WHERE id = ?`,
      [company_name, address || null, tel || null, mobile || null, email || null,
        website || null, contact_no || null, uen || null, default_currency || 'SGD', rows[0].id]
    );
  } else {
    await pool.query(
      `INSERT INTO company_settings
        (company_name, address, tel, mobile, email, website, contact_no, uen, default_currency)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [company_name, address || null, tel || null, mobile || null, email || null,
        website || null, contact_no || null, uen || null, default_currency || 'SGD']
    );
  }

  const [updated] = await pool.query('SELECT * FROM company_settings LIMIT 1');
  res.json(updated[0]);
}

module.exports = { getSettings, updateSettings };
