const { collection, nextId, now, numericId } = require('../utils/mongo');
const { buildPdf, quotationPdfDefinition } = require('../utils/pdf');
const { cached } = require('../utils/cache');
const { VISIBILITY_KEYS, visibleTotal } = require('../utils/quotationSections');

/* ---- LRU PDF buffer cache (same pattern as invoices) ---- */
const pdfCache = new Map();
const MAX_CACHE = 200;
const SETTINGS_TTL = 300_000;

function lruGet(key) {
  const val = pdfCache.get(key);
  if (val !== undefined) {
    pdfCache.delete(key);
    pdfCache.set(key, val);
  }
  return val;
}

function lruSet(key, val) {
  if (pdfCache.size >= MAX_CACHE) {
    const oldest = pdfCache.keys().next().value;
    pdfCache.delete(oldest);
  }
  pdfCache.set(key, val);
}

function getSettings() {
  return cached('quotation:companySettings', SETTINGS_TTL, async () =>
    (await collection('company_settings').findOne({})) || {}
  );
}

const SORTABLE = ['quotation_no', 'companyname', 'mobile_no', 'quotation_date', 'sub_amount', 'created_at', 'id'];

function escapeRegex(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalise submitted line items. Blank rows are dropped. `hidden` rows are kept
 * in the record but excluded from the document and from the total.
 */
function cleanItems(items) {
  return (Array.isArray(items) ? items : [])
    .filter((it) => it && (it.product_id || it.productname || it.description || Number(it.rate) > 0))
    .map((it) => {
      const rate = Number(it.rate) || 0;
      const quantity = Number(it.quantity) || 1;
      return {
        product_id: numericId(it.product_id) || null,
        productname: String(it.productname || '').trim(),
        description: String(it.description || ''),
        rate,
        quantity,
        total: Number((rate * quantity).toFixed(2)),
        hidden: it.hidden === true || it.hidden === 'true',
      };
    });
}

/**
 * Normalize the editable document-content fields from a request body.
 * Only defined fields are returned, so update() won't clobber stored content
 * with blanks when the client omits a section.
 */
function pickSections(body) {
  const out = {};
  if (body.doc_title !== undefined) out.doc_title = String(body.doc_title || '');
  if (body.item_cost !== undefined) out.item_cost = String(body.item_cost || '');
  if (body.procedures !== undefined) out.procedures = String(body.procedures || '');
  if (body.operating_hours !== undefined) out.operating_hours = String(body.operating_hours || '');
  if (body.closing_note !== undefined) out.closing_note = String(body.closing_note || '');
  if (body.turnaround !== undefined) {
    out.turnaround = (Array.isArray(body.turnaround) ? body.turnaround : [])
      .map((t) => ({ priority: String(t?.priority || '').trim(), timing: String(t?.timing || '').trim() }))
      .filter((t) => t.priority || t.timing);
  }
  if (body.terms !== undefined) {
    out.terms = (Array.isArray(body.terms) ? body.terms : [])
      .map((t) => String(t || '').trim())
      .filter(Boolean);
  }
  if (body.visibility !== undefined) {
    const src = body.visibility && typeof body.visibility === 'object' ? body.visibility : {};
    // Always store the complete map; anything not explicitly false is shown.
    out.visibility = Object.fromEntries(VISIBILITY_KEYS.map((key) => [key, src[key] !== false]));
  }
  return out;
}

function findFilter(param) {
  if (!param) return { id: -1 };
  const num = numericId(param);
  if (num) {
    return { $or: [{ id: num }, { quotation_no: String(param) }] };
  }
  return { quotation_no: String(param) };
}

/** Next number in the Q-MMYY-#### sequence for the current month. */
async function generateNumber() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  const prefix = `Q-${mm}${yy}-`;

  const last = await collection('quotations')
    .find({ quotation_no: { $regex: `^${escapeRegex(prefix)}` } })
    .sort({ quotation_no: -1 })
    .limit(1)
    .toArray();

  let nextSeq = 1;
  if (last.length > 0 && last[0].quotation_no) {
    const parts = last[0].quotation_no.split('-');
    const seq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(seq)) nextSeq = seq + 1;
  }
  return `${prefix}${String(nextSeq).padStart(4, '0')}`;
}

async function list(req, res) {
  const { search = '', page = 1, limit = 10, sort = 'id', dir = 'desc' } = req.query;

  const sortCol = SORTABLE.includes(sort) ? sort : 'id';
  const sortDir = String(dir).toLowerCase() === 'asc' ? 1 : -1;
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
  const offset = (pageNum - 1) * limitNum;

  const term = String(search || '').trim();
  const filter = term
    ? {
        $or: ['quotation_no', 'companyname', 'person_incharge', 'mobile_no', 'customer_contact'].map((field) => ({
          [field]: { $regex: escapeRegex(term), $options: 'i' },
        })),
      }
    : {};

  const [rows, total] = await Promise.all([
    collection('quotations')
      .find(filter)
      .sort({ [sortCol]: sortDir, id: sortDir })
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
  res.json({ quotation_no: await generateNumber() });
}

/** Fields shared by create and update, taken from the request body. */
function recordFields(body) {
  const { companyname, address, person_incharge, mobile_no, customer_contact, quotation_date, items, notes } = body;
  const cleaned = cleanItems(items);
  return {
    companyname: String(companyname).trim(),
    address: address ? String(address).trim() : '',
    person_incharge: person_incharge ? String(person_incharge).trim() : '',
    mobile_no: mobile_no || customer_contact || '',
    customer_contact: customer_contact || mobile_no || '',
    quotation_date: quotation_date || new Date().toISOString().slice(0, 10),
    items: cleaned,
    // Hidden items are not quoted, so they do not count.
    sub_amount: visibleTotal(cleaned),
    notes: notes ? String(notes) : '',
    ...pickSections(body),
  };
}

async function create(req, res) {
  const { quotation_no, customer_id, companyname } = req.body;

  if (!companyname || !String(companyname).trim()) {
    return res.status(400).json({ message: 'Company name is required' });
  }

  const finalNumber = quotation_no && String(quotation_no).trim() ? String(quotation_no).trim() : await generateNumber();
  if (await collection('quotations').findOne({ quotation_no: finalNumber })) {
    return res.status(409).json({ message: `Quotation number ${finalNumber} already exists` });
  }

  const id = await nextId('quotations');
  const doc = {
    id,
    quotation_no: finalNumber,
    customer_id: customer_id ? numericId(customer_id) : null,
    ...recordFields(req.body),
    created_at: now(),
    updated_at: now(),
  };

  await collection('quotations').insertOne(doc);
  res.status(201).json(doc);
}

async function update(req, res) {
  const { quotation_no, customer_id, companyname } = req.body;

  if (!companyname || !String(companyname).trim()) {
    return res.status(400).json({ message: 'Company name is required' });
  }

  const filter = findFilter(req.params.id);
  const existing = await collection('quotations').findOne(filter);
  if (!existing) return res.status(404).json({ message: 'Quotation not found' });

  const updateFields = { ...recordFields(req.body), updated_at: now() };

  if (quotation_no && String(quotation_no).trim()) {
    const nextNo = String(quotation_no).trim();
    if (nextNo !== existing.quotation_no) {
      const clash = await collection('quotations').findOne({ quotation_no: nextNo, id: { $ne: existing.id } });
      if (clash) return res.status(409).json({ message: `Quotation number ${nextNo} already exists` });
    }
    updateFields.quotation_no = nextNo;
  }
  if (customer_id !== undefined) updateFields.customer_id = customer_id ? numericId(customer_id) : null;

  await collection('quotations').updateOne({ id: existing.id }, { $set: updateFields });
  const quotation = await collection('quotations').findOne({ id: existing.id });
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
  const quotation = await collection('quotations').findOne(filter);
  if (!quotation) return res.status(404).json({ message: 'Quotation not found' });

  // Any edit bumps updated_at, so an edited quotation never serves a stale PDF.
  const cacheKey = `q:${quotation._id}:${quotation.updated_at || quotation.created_at || ''}`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="quotation-${quotation.quotation_no || quotation.id}.pdf"`);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  let buf = lruGet(cacheKey);
  if (buf) {
    res.setHeader('Content-Length', buf.length);
    return res.end(buf);
  }

  try {
    const company = await getSettings();
    const docDef = quotationPdfDefinition(quotation, company);
    buf = await buildPdf(docDef);
    lruSet(cacheKey, buf);
    res.setHeader('Content-Length', buf.length);
    res.end(buf);
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
