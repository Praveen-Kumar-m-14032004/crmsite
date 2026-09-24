const { collection, nextId, now, numericId } = require('../utils/mongo');
const { buildPdf, createPdfStream, quotationPdfDefinition } = require('../utils/pdf');

const DEFAULT_RATES = [
  { type: 'EXPORT PERMITS', charge: '11.00 SGD' },
  { type: 'IMPORT PERMITS', charge: '11.00 SGD' },
  { type: 'IMPORTER OF THE RECORD', charge: '30.00 SGD' },
  { type: 'USING PERMIT DECLARATION SFA LICENSE', charge: '25.00 SGD' },
  { type: 'CERTIFICATE OF ORIGINS', charge: '50.00 SGD' },
  { type: 'PERMIT AMENDMENTS', charge: '0.50 SGD' },
  { type: 'CANCELLATION/REJECTION', charge: '0.50 SGD' },
];

const DEFAULT_TURNAROUNDS = [
  { priority: 'Normal Requests', timing: 'Within 2hrs from time of Request' },
  { priority: 'Urgent Requests', timing: 'Within 60mins of Request' },
  { priority: 'Super Urgent Requests', timing: 'Within 30 mins of Request' },
  { priority: 'Tier1/Control countries/Other Controlling Agencies', timing: 'Depending upon the Customs queue' },
];

const SORTABLE = ['quotation_no', 'companyname', 'mobile_no', 'quotation_date', 'created_at', 'id'];

async function list(req, res) {
  const { search = '', page = 1, limit = 10, sort = 'id', dir = 'desc' } = req.query;

  const sortCol = SORTABLE.includes(sort) ? sort : 'id';
  const sortDir = dir.toLowerCase() === 'asc' ? 1 : -1;
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
  const offset = (pageNum - 1) * limitNum;

  const filter = search
    ? {
        $or: ['quotation_no', 'companyname', 'person_incharge', 'mobile_no'].map((field) => ({
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
  const quotation = await collection('quotations').findOne({ id: numericId(req.params.id) });
  if (!quotation) return res.status(404).json({ message: 'Quotation not found' });
  res.json(quotation);
}

async function nextNumber(_req, res) {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  const prefix = `PD-${mm}${yy}-`;

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
    quotation_date,
    items,
    turnarounds,
    ops_email,
    cc_email,
    contact_numbers,
  } = req.body;

  if (!companyname || !String(companyname).trim()) {
    return res.status(400).json({ message: 'Company name is required' });
  }

  let finalNumber = quotation_no;
  if (!finalNumber) {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    const prefix = `PD-${mm}${yy}-`;
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

  const id = await nextId('quotations');
  const doc = {
    id,
    quotation_no: finalNumber,
    customer_id: customer_id ? numericId(customer_id) : null,
    companyname: String(companyname).trim(),
    address: address ? String(address).trim() : '',
    person_incharge: person_incharge ? String(person_incharge).trim() : '',
    mobile_no: mobile_no ? String(mobile_no).trim() : '',
    quotation_date: quotation_date || new Date().toISOString().slice(0, 10),
    items: Array.isArray(items) && items.length > 0 ? items : DEFAULT_RATES,
    turnarounds: Array.isArray(turnarounds) && turnarounds.length > 0 ? turnarounds : DEFAULT_TURNAROUNDS,
    ops_email: ops_email || 'Ops@aula.com.sg',
    cc_email: cc_email || 'Customspermit.sg@gmail.com',
    contact_numbers: contact_numbers || '+65 8370 1443 & +65 8919 7865 / +65 8322 5509',
    created_at: now(),
    updated_at: now(),
  };

  await collection('quotations').insertOne(doc);
  res.status(201).json(doc);
}

async function update(req, res) {
  const id = numericId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid quotation ID' });

  const {
    quotation_no,
    customer_id,
    companyname,
    address,
    person_incharge,
    mobile_no,
    quotation_date,
    items,
    turnarounds,
    ops_email,
    cc_email,
    contact_numbers,
  } = req.body;

  if (!companyname || !String(companyname).trim()) {
    return res.status(400).json({ message: 'Company name is required' });
  }

  const updateFields = {
    companyname: String(companyname).trim(),
    address: address ? String(address).trim() : '',
    person_incharge: person_incharge ? String(person_incharge).trim() : '',
    mobile_no: mobile_no ? String(mobile_no).trim() : '',
    quotation_date: quotation_date || new Date().toISOString().slice(0, 10),
    updated_at: now(),
  };

  if (quotation_no) updateFields.quotation_no = quotation_no;
  if (customer_id !== undefined) updateFields.customer_id = customer_id ? numericId(customer_id) : null;
  if (Array.isArray(items)) updateFields.items = items;
  if (Array.isArray(turnarounds)) updateFields.turnarounds = turnarounds;
  if (ops_email) updateFields.ops_email = ops_email;
  if (cc_email) updateFields.cc_email = cc_email;
  if (contact_numbers) updateFields.contact_numbers = contact_numbers;

  const result = await collection('quotations').findOneAndUpdate(
    { id },
    { $set: updateFields },
    { returnDocument: 'after' }
  );

  const quotation = result?.value !== undefined && typeof result.value === 'object' ? result.value : result;
  if (!quotation) return res.status(404).json({ message: 'Quotation not found' });
  res.json(quotation);
}

async function remove(req, res) {
  const id = numericId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid quotation ID' });

  const result = await collection('quotations').deleteOne({ id });
  if (!result.deletedCount) return res.status(404).json({ message: 'Quotation not found' });
  res.json({ success: true, message: 'Quotation deleted successfully' });
}

async function getPdf(req, res) {
  const id = numericId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid quotation ID' });

  const [quotation, company] = await Promise.all([
    collection('quotations').findOne({ id }),
    collection('company_settings').findOne({}),
  ]);

  if (!quotation) return res.status(404).json({ message: 'Quotation not found' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="quotation-${quotation.quotation_no || id}.pdf"`);
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
