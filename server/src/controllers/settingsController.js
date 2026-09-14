const { collection, nextId, now } = require('../utils/mongo');

async function getSettings(_req, res) {
  res.json(await collection('company_settings').findOne({}) || {});
}

async function updateSettings(req, res) {
  const {
    company_name, address, tel, mobile, email, website, contact_no, uen, default_currency,
  } = req.body;

  if (!company_name) return res.status(400).json({ message: 'Company name is required' });

  const settings = { company_name, address: address || null, tel: tel || null, mobile: mobile || null, email: email || null, website: website || null, contact_no: contact_no || null, uen: uen || null, default_currency: default_currency || 'SGD', updated_at: now() };
  const existing = await collection('company_settings').findOne({});
  if (existing) await collection('company_settings').updateOne({ _id: existing._id }, { $set: settings });
  else await collection('company_settings').insertOne({ id: await nextId('company_settings'), ...settings });
  res.json(await collection('company_settings').findOne({}));
}

module.exports = { getSettings, updateSettings };
