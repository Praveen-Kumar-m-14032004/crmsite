const { query, queryOne, execute, now, numericId, likeTerm } = require('../utils/db');

const SORTABLE = ['companyname', 'person_incharge', 'mobile_no', 'email', 'created_at'];

async function list(req, res) {
  const { search = '', page = 1, limit = 10, sort = 'created_at', dir = 'desc' } = req.query;

  const sortCol = SORTABLE.includes(sort) ? sort : 'created_at';
  const sortDir = String(dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
  const offset = (pageNum - 1) * limitNum;

  const term = String(search || '').trim();
  const where = term ? 'WHERE (companyname LIKE ? OR person_incharge LIKE ? OR email LIKE ? OR mobile_no LIKE ?)' : '';
  const params = term ? Array(4).fill(likeTerm(term)) : [];

  const [rows, count] = await Promise.all([
    query(`SELECT * FROM customers ${where} ORDER BY ${sortCol} ${sortDir}, id ${sortDir} LIMIT ? OFFSET ?`, [...params, limitNum, offset]),
    queryOne(`SELECT COUNT(*) AS n FROM customers ${where}`, params),
  ]);

  res.json({ data: rows, total: Number(count?.n || 0), page: pageNum, limit: limitNum });
}

async function getOne(req, res) {
  const customer = await queryOne('SELECT * FROM customers WHERE id = ?', [numericId(req.params.id)]);
  if (!customer) return res.status(404).json({ message: 'Customer not found' });
  res.json(customer);
}

const clean = (value) => (value ? String(value).trim() || null : null);

async function create(req, res) {
  const { companyname, person_incharge, mobile_no, email, address } = req.body;
  if (!companyname || !String(companyname).trim()) return res.status(400).json({ message: 'Company name is required' });

  const result = await execute(
    'INSERT INTO customers (companyname, person_incharge, mobile_no, email, address, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [String(companyname).trim(), clean(person_incharge), clean(mobile_no), clean(email), clean(address), now(), now()]
  );
  res.status(201).json(await queryOne('SELECT * FROM customers WHERE id = ?', [result.insertId]));
}

async function update(req, res) {
  const { companyname, person_incharge, mobile_no, email, address } = req.body;
  if (!companyname || !String(companyname).trim()) return res.status(400).json({ message: 'Company name is required' });

  const id = numericId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid customer ID' });
  const result = await execute(
    'UPDATE customers SET companyname = ?, person_incharge = ?, mobile_no = ?, email = ?, address = ?, updated_at = ? WHERE id = ?',
    [String(companyname).trim(), clean(person_incharge), clean(mobile_no), clean(email), clean(address), now(), id]
  );
  if (!result.affectedRows) return res.status(404).json({ message: 'Customer not found' });
  res.json(await queryOne('SELECT * FROM customers WHERE id = ?', [id]));
}

async function remove(req, res) {
  const id = numericId(req.params.id);
  if (await queryOne('SELECT id FROM invoices WHERE customer_id = ? LIMIT 1', [id])) {
    return res.status(409).json({ message: 'This record is still used by existing invoices and cannot be deleted.' });
  }
  const result = await execute('DELETE FROM customers WHERE id = ?', [id]);
  if (!result.affectedRows) return res.status(404).json({ message: 'Customer not found' });
  res.json({ message: 'Customer deleted' });
}

module.exports = { list, getOne, create, update, remove };
