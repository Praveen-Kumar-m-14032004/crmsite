const { collection, nextId, now, numericId } = require('../utils/mongo');

async function list(req, res) {
  const { search = '', page = 1, limit = 10 } = req.query;
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
  const offset = (pageNum - 1) * limitNum;
  const filter = search ? { productname: { $regex: search, $options: 'i' } } : {};
  const [rows, total] = await Promise.all([
    collection('products').find(filter).sort({ created_at: -1, id: -1 }).skip(offset).limit(limitNum).toArray(),
    collection('products').countDocuments(filter),
  ]);

  res.json({ data: rows, total, page: pageNum, limit: limitNum });
}

async function getOne(req, res) {
  const product = await collection('products').findOne({ id: numericId(req.params.id) });
  if (!product) return res.status(404).json({ message: 'Product not found' });
  res.json(product);
}

async function create(req, res) {
  const { productname } = req.body;
  if (!productname) return res.status(400).json({ message: 'Product name is required' });
  const product = { id: await nextId('products'), productname, created_at: now() };
  await collection('products').insertOne(product);
  res.status(201).json(product);
}

async function update(req, res) {
  const { productname } = req.body;
  if (!productname) return res.status(400).json({ message: 'Product name is required' });
  const result = await collection('products').findOneAndUpdate({ id: numericId(req.params.id) }, { $set: { productname } }, { returnDocument: 'after' });
  const product = result?.value || result;
  if (!product || product.id === undefined) return res.status(404).json({ message: 'Product not found' });
  res.json(product);
}

async function remove(req, res) {
  const id = numericId(req.params.id);
  if (await collection('invoice_items').findOne({ product_id: id })) return res.status(409).json({ message: 'This record is still used by existing invoices and cannot be deleted.' });
  const result = await collection('products').deleteOne({ id });
  if (!result.deletedCount) return res.status(404).json({ message: 'Product not found' });
  res.json({ message: 'Product deleted' });
}

module.exports = { list, getOne, create, update, remove };
