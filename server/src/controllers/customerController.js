const { collection, nextId, now, numericId } = require('../utils/mongo');

const SORTABLE = ['companyname', 'person_incharge', 'mobile_no', 'email', 'created_at'];

async function list(req, res) {
  const { search = '', page = 1, limit = 10, sort = 'created_at', dir = 'desc' } = req.query;

  const sortCol = SORTABLE.includes(sort) ? sort : 'created_at';
  const sortDir = dir.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
  const offset = (pageNum - 1) * limitNum;

  const filter = search ? { $or: ['companyname', 'person_incharge', 'email', 'mobile_no'].map((field) => ({ [field]: { $regex: search, $options: 'i' } })) } : {};
  const [rows, total] = await Promise.all([
    collection('customers').find(filter).sort({ [sortCol]: sortDir === 'ASC' ? 1 : -1, id: sortDir === 'ASC' ? 1 : -1 }).skip(offset).limit(limitNum).toArray(),
    collection('customers').countDocuments(filter),
  ]);

  res.json({ data: rows, total, page: pageNum, limit: limitNum });
}

async function getOne(req, res) {
  const customer = await collection('customers').findOne({ id: numericId(req.params.id) });
  if (!customer) return res.status(404).json({ message: 'Customer not found' });
  res.json(customer);
}

async function create(req, res) {
  const { companyname, person_incharge, mobile_no, email, address } = req.body;
  if (!companyname) return res.status(400).json({ message: 'Company name is required' });

  const customer = { id: await nextId('customers'), companyname, person_incharge: person_incharge || null, mobile_no: mobile_no || null, email: email || null, address: address || null, created_at: now(), updated_at: now() };
  await collection('customers').insertOne(customer);
  res.status(201).json(customer);
}

async function update(req, res) {
  const { companyname, person_incharge, mobile_no, email, address } = req.body;
  if (!companyname || !String(companyname).trim()) return res.status(400).json({ message: 'Company name is required' });

  const id = numericId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid customer ID' });
  const result = await collection('customers').findOneAndUpdate(
    { id },
    {
      $set: {
        companyname: String(companyname).trim(),
        person_incharge: person_incharge ? String(person_incharge).trim() : null,
        mobile_no: mobile_no ? String(mobile_no).trim() : null,
        email: email ? String(email).trim() : null,
        address: address ? String(address).trim() : null,
        updated_at: now(),
      },
    },
    { returnDocument: 'after' }
  );
  const customer = result?.value !== undefined && typeof result.value === 'object' ? result.value : result;
  if (!customer) return res.status(404).json({ message: 'Customer not found' });
  res.json(customer);
}

async function remove(req, res) {
  const id = numericId(req.params.id);
  if (await collection('invoices').findOne({ customer_id: id })) return res.status(409).json({ message: 'This record is still used by existing invoices and cannot be deleted.' });
  const result = await collection('customers').deleteOne({ id });
  if (!result.deletedCount) return res.status(404).json({ message: 'Customer not found' });
  res.json({ message: 'Customer deleted' });
}

module.exports = { list, getOne, create, update, remove };
