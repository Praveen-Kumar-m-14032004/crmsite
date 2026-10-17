const { queryOne, execute, now } = require('../utils/db');
const { invalidate } = require('../utils/cache');

const current = () => queryOne('SELECT * FROM company_settings ORDER BY id LIMIT 1');

async function getSettings(_req, res) {
  res.json((await current()) || {});
}

async function updateSettings(req, res) {
  const {
    company_name, address, tel, mobile, email, website, contact_no, uen, default_currency,
  } = req.body;

  if (!company_name || !String(company_name).trim()) return res.status(400).json({ message: 'Company name is required' });

  const values = [
    String(company_name).trim(), address || null, tel || null, mobile || null, email || null,
    website || null, contact_no || null, uen || null, default_currency || 'SGD', now(),
  ];

  const existing = await current();
  if (existing) {
    await execute(
      `UPDATE company_settings SET company_name = ?, address = ?, tel = ?, mobile = ?, email = ?, website = ?, contact_no = ?, uen = ?,
         default_currency = ?, updated_at = ? WHERE id = ?`,
      [...values, existing.id]
    );
  } else {
    await execute(
      `INSERT INTO company_settings (id, company_name, address, tel, mobile, email, website, contact_no, uen, default_currency, updated_at, created_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [...values, now()]
    );
  }
  invalidate('invoice:');
  invalidate('quotation:');
  invalidate('dashboard:');
  res.json(await current());
}

module.exports = { getSettings, updateSettings };
