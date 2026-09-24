const { collection, nextId, now, numericId } = require('../utils/mongo');
const { createPdfStream, quotationPdfDefinition } = require('../utils/pdf');

const SORTABLE = ['quotation_no', 'companyname', 'mobile_no', 'quotation_date', 'sub_amount', 'created_at', 'id'];

function findFilter(param) {
  if (!param) return { id: -1 };
  const num = numericId(param);
  if (num) {
    return { $or: [{ id: num }, { quotation_no: String(param) }] };
  }
  return { quotation_no: String(param) };
}

async function list(req, res) {
  const { search = '', page = 1, limit = 10, sort = 'id', dir = 'desc' } = req.query;

  const sortCol = SORTABLE.includes(sort) ? sort : 'id';
  const sortDir = dir.toLowerCase() === 'asc' ? 1 : -1;
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
  const offset = (pageNum - 1) * limitNum;

  const filter = search
    ? {
        $or: ['quotation_no', 'companyname', 'person_incharge', 'mobile_no', 'customer_contact'].map((field) => ({
          [field]: { $regex: search, $options: 'i' },
        })),
      }
    : {};

  const [rows, total] = await Promise.all([
    collection('quotations')
      .find(filter)
      .sort({ [sortCol]: sortDir })
      .skip(offset)
      .limit(limitNum)
      .toArray(),
    collection('quotations').countDocuments(filter),
  ]);

  res.json({ data: rows, total, page: pageNum, limit: limitNum });
}

async function getOne(req, res) {
  const quotation = await collection('quotations').findOne(findFilter(req.params.id));
  if (!quotation) return res.status(404).json({ message: 'Quotation not found' });
  res.json(quotation);
}

async function nextNumber(_req, res) {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  const prefix = `Q-${mm}${yy}-`;

  const last = await collection('quotations')
    .find({ quotation_no: { $regex: `^${prefix}` } })
    .sort({ quotation_no: -1 })
    .limit(1)
    .toArray();

  let nextSeq = 1;
  if (last.length > 0 && last[0].quotation_no) {
    const parts = last[0].quotation_no.split('-');
    const seq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(seq)) nextSeq = seq + 1;
  }

  const nextQuotationNo = `${prefix}${String(nextSeq).padStart(4, '0')}`;
  res.json({ quotation_no: nextQuotationNo });
}

async function create(req, res) {
  const {
    quotation_no,
    customer_id,
    companyname,
    address,
    person_incharge,
    mobile_no,
    customer_contact,
    quotation_date,
    items = [],
    notes,
  } = req.body;

  if (!companyname || !String(companyname).trim()) {
    return res.status(400).json({ message: 'Company name is required' });
  }

  let finalNumber = quotation_no ? String(quotation_no).trim() : '';
  if (!finalNumber) {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    const prefix = `Q-${mm}${yy}-`;
    const last = await collection('quotations')
      .find({ quotation_no: { $regex: `^${prefix}` } })
      .sort({ quotation_no: -1 })
      .limit(1)
      .toArray();
    let nextSeq = 1;
    if (last.length > 0 && last[0].quotation_no) {
      const parts = last[0].quotation_no.split('-');
      const seq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(seq)) nextSeq = seq + 1;
    }
    finalNumber = `${prefix}${String(nextSeq).padStart(4, '0')}`;
  }

  // Calculate items and total sub_amount
  const cleanItems = (Array.isArray(items) ? items : [])
    .filter((it) => it && (it.product_id || it.productname || it.description || Number(it.rate) > 0))
    .map((it) => {
      const rate = Number(it.rate) || 0;
      const quantity = Number(it.quantity) || 1;
      const total = Number((rate * quantity).toFixed(2));
      return {
        product_id: it.product_id || null,
        productname: it.productname || '',
        description: it.description || '',
        rate,
        quantity,
        total,
      };
    });

  const sub_amount = cleanItems.reduce((sum, it) => sum + it.total, 0);

  const id = await nextId('quotations');
  const doc = {
    id,
    quotation_no: finalNumber,
    customer_id: customer_id ? numericId(customer_id) : null,
    companyname: String(companyname).trim(),
    address: address ? String(address).trim() : '',
    person_incharge: person_incharge ? String(person_incharge).trim() : '',
    mobile_no: mobile_no || customer_contact || '',
    customer_contact: customer_contact || mobile_no || '',
    quotation_date: quotation_date || new Date().toISOString().slice(0, 10),
    items: cleanItems,
    sub_amount: Number(sub_amount.toFixed(2)),
    notes: notes || '',
    created_at: now(),
    updated_at: now(),
  };

  await collection('quotations').insertOne(doc);
  res.status(201).json(doc);
}

async function update(req, res) {
  const {
    quotation_no,
    customer_id,
    companyname,
    address,
    person_incharge,
    mobile_no,
    customer_contact,
    quotation_date,
    items,
    notes,
  } = req.body;

  if (!companyname || !String(companyname).trim()) {
    return res.status(400).json({ message: 'Company name is required' });
  }

  const cleanItems = (Array.isArray(items) ? items : [])
    .filter((it) => it && (it.product_id || it.productname || it.description || Number(it.rate) > 0))
    .map((it) => {
      const rate = Number(it.rate) || 0;
      const quantity = Number(it.quantity) || 1;
      const total = Number((rate * quantity).toFixed(2));
      return {
        product_id: it.product_id || null,
        productname: it.productname || '',
        description: it.description || '',
        rate,
        quantity,
        total,
      };
    });

  const sub_amount = cleanItems.reduce((sum, it) => sum + it.total, 0);

  const updateFields = {
    companyname: String(companyname).trim(),
    address: address ? String(address).trim() : '',
    person_incharge: person_incharge ? String(person_incharge).trim() : '',
    mobile_no: mobile_no || customer_contact || '',
    customer_contact: customer_contact || mobile_no || '',
    quotation_date: quotation_date || new Date().toISOString().slice(0, 10),
    items: cleanItems,
    sub_amount: Number(sub_amount.toFixed(2)),
    notes: notes || '',
    updated_at: now(),
  };

  if (quotation_no) updateFields.quotation_no = String(quotation_no).trim();
  if (customer_id !== undefined) updateFields.customer_id = customer_id ? numericId(customer_id) : null;

  const result = await collection('quotations').findOneAndUpdate(
    findFilter(req.params.id),
    { $set: updateFields },
    { returnDocument: 'after' }
  );

  const quotation = result?.value !== undefined && typeof result.value === 'object' ? result.value : result;
  if (!quotation) return res.status(404).json({ message: 'Quotation not found' });
  res.json(quotation);
}

async function remove(req, res) {
  const filter = findFilter(req.params.id);
  const result = await collection('quotations').deleteOne(filter);
  if (!result.deletedCount) return res.status(404).json({ message: 'Quotation not found' });
  res.json({ success: true, message: 'Quotation deleted successfully' });
}

async function getPdf(req, res) {
  const filter = findFilter(req.params.id);
  const [quotation, company] = await Promise.all([
    collection('quotations').findOne(filter),
    collection('company_settings').findOne({}),
  ]);

  if (!quotation) return res.status(404).json({ message: 'Quotation not found' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="quotation-${quotation.quotation_no || quotation.id}.pdf"`);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  try {
    const docDef = quotationPdfDefinition(quotation, company || {});
    const stream = createPdfStream(docDef);
    stream.pipe(res);
  } catch (err) {
    console.error('[pdf] Quotation PDF generation failed:', err);
    res.status(500).json({ message: 'Failed to generate PDF' });
  }
}

module.exports = {
  list,
  getOne,
  nextNumber,
  create,
  update,
  remove,
  getPdf,
};
