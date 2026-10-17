const { query, queryOne, execute, now, numericId, likeTerm, parseJson, toJson, isDuplicateError } = require('../utils/db');
const { buildPdf, quotationPdfDefinition } = require('../utils/pdf');
const { cached } = require('../utils/cache');
const { VISIBILITY_KEYS, visibleTotal } = require('../utils/quotationSections');
const { localToday } = require('../utils/dates');

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
    (await queryOne('SELECT * FROM company_settings ORDER BY id LIMIT 1')) || {}
  );
}

const SORTABLE = ['quotation_no', 'companyname', 'mobile_no', 'quotation_date', 'sub_amount', 'created_at', 'id'];
const JSON_FIELDS = ['items', 'turnaround', 'terms', 'visibility'];

/** Database row -> API shape (JSON columns parsed). */
function hydrate(row) {
  if (!row) return null;
  return {
    ...row,
    items: parseJson(row.items, []),
    turnaround: parseJson(row.turnaround, null),
    terms: parseJson(row.terms, null),
    visibility: parseJson(row.visibility, null),
  };
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
 * Editable document-content fields from a request body. Only defined fields are
 * returned, so update() won't clobber stored content when the client omits one.
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

/** Look a quotation up by numeric id or by its number. */
async function findQuotation(param) {
  if (!param) return null;
  const num = numericId(param);
  const row = num
    ? await queryOne('SELECT * FROM quotations WHERE id = ? OR quotation_no = ? LIMIT 1', [num, String(param)])
    : await queryOne('SELECT * FROM quotations WHERE quotation_no = ? LIMIT 1', [String(param)]);
  return hydrate(row);
}

/** Next number in the Q-MMYY-#### sequence for the current month. */
async function generateNumber() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  const prefix = `Q-${mm}${yy}-`;

  const last = await queryOne('SELECT quotation_no FROM quotations WHERE quotation_no LIKE ? ORDER BY quotation_no DESC LIMIT 1', [`${prefix}%`]);
  let nextSeq = 1;
  if (last?.quotation_no) {
    const parts = last.quotation_no.split('-');
    const seq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(seq)) nextSeq = seq + 1;
  }
  return `${prefix}${String(nextSeq).padStart(4, '0')}`;
}

async function list(req, res) {
  const { search = '', page = 1, limit = 10, sort = 'id', dir = 'desc' } = req.query;

  const sortCol = SORTABLE.includes(sort) ? sort : 'id';
  const sortDir = String(dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
  const offset = (pageNum - 1) * limitNum;

  const term = String(search || '').trim();
  const where = term
    ? 'WHERE (quotation_no LIKE ? OR companyname LIKE ? OR person_incharge LIKE ? OR mobile_no LIKE ? OR customer_contact LIKE ?)'
    : '';
  const params = term ? Array(5).fill(likeTerm(term)) : [];

  const [rows, count] = await Promise.all([
    query(`SELECT * FROM quotations ${where} ORDER BY ${sortCol} ${sortDir}, id ${sortDir} LIMIT ? OFFSET ?`, [...params, limitNum, offset]),
    queryOne(`SELECT COUNT(*) AS n FROM quotations ${where}`, params),
  ]);

  res.json({ data: rows.map(hydrate), total: Number(count?.n || 0), page: pageNum, limit: limitNum });
}

async function getOne(req, res) {
  const quotation = await findQuotation(req.params.id);
  if (!quotation) return res.status(404).json({ message: 'Quotation not found' });
  res.json(quotation);
}

async function nextNumber(_req, res) {
  res.json({ quotation_no: await generateNumber() });
}

/** Columns shared by create and update, taken from the request body. */
function recordFields(body) {
  const { companyname, address, person_incharge, mobile_no, customer_contact, quotation_date, items, notes } = body;
  const cleaned = cleanItems(items);
  return {
    companyname: String(companyname).trim(),
    address: address ? String(address).trim() : '',
    person_incharge: person_incharge ? String(person_incharge).trim() : '',
    mobile_no: mobile_no || customer_contact || '',
    customer_contact: customer_contact || mobile_no || '',
    quotation_date: (quotation_date && String(quotation_date).slice(0, 10)) || localToday(),
    items: cleaned,
    // Hidden items are not quoted, so they do not count.
    sub_amount: visibleTotal(cleaned),
    notes: notes ? String(notes) : '',
    ...pickSections(body),
  };
}

/** Serialise JSON columns for storage. */
function toColumns(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = JSON_FIELDS.includes(key) ? toJson(value) : value;
  }
  return out;
}

async function create(req, res) {
  const { quotation_no, customer_id, companyname } = req.body;

  if (!companyname || !String(companyname).trim()) {
    return res.status(400).json({ message: 'Company name is required' });
  }

  const finalNumber = quotation_no && String(quotation_no).trim() ? String(quotation_no).trim() : await generateNumber();
  if (await queryOne('SELECT id FROM quotations WHERE quotation_no = ?', [finalNumber])) {
    return res.status(409).json({ message: `Quotation number ${finalNumber} already exists` });
  }

  const columns = toColumns({
    quotation_no: finalNumber,
    customer_id: customer_id ? numericId(customer_id) : null,
    ...recordFields(req.body),
    created_at: now(),
    updated_at: now(),
  });

  try {
    const names = Object.keys(columns);
    const result = await execute(
      `INSERT INTO quotations (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
      names.map((name) => columns[name])
    );
    res.status(201).json(await findQuotation(result.insertId));
  } catch (err) {
    if (isDuplicateError(err)) return res.status(409).json({ message: `Quotation number ${finalNumber} already exists` });
    throw err;
  }
}

async function update(req, res) {
  const { quotation_no, customer_id, companyname } = req.body;

  if (!companyname || !String(companyname).trim()) {
    return res.status(400).json({ message: 'Company name is required' });
  }

  const existing = await findQuotation(req.params.id);
  if (!existing) return res.status(404).json({ message: 'Quotation not found' });

  const fields = { ...recordFields(req.body), updated_at: now() };

  if (quotation_no && String(quotation_no).trim()) {
    const nextNo = String(quotation_no).trim();
    if (nextNo !== existing.quotation_no) {
      const clash = await queryOne('SELECT id FROM quotations WHERE quotation_no = ? AND id <> ?', [nextNo, existing.id]);
      if (clash) return res.status(409).json({ message: `Quotation number ${nextNo} already exists` });
    }
    fields.quotation_no = nextNo;
  }
  if (customer_id !== undefined) fields.customer_id = customer_id ? numericId(customer_id) : null;

  const columns = toColumns(fields);
  const names = Object.keys(columns);
  try {
    await execute(`UPDATE quotations SET ${names.map((name) => `${name} = ?`).join(', ')} WHERE id = ?`, [...names.map((name) => columns[name]), existing.id]);
  } catch (err) {
    if (isDuplicateError(err)) return res.status(409).json({ message: `Quotation number ${fields.quotation_no} already exists` });
    throw err;
  }
  res.json(await findQuotation(existing.id));
}

async function remove(req, res) {
  const existing = await findQuotation(req.params.id);
  if (!existing) return res.status(404).json({ message: 'Quotation not found' });
  await execute('DELETE FROM quotations WHERE id = ?', [existing.id]);
  res.json({ success: true, message: 'Quotation deleted successfully' });
}

async function getPdf(req, res) {
  const quotation = await findQuotation(req.params.id);
  if (!quotation) return res.status(404).json({ message: 'Quotation not found' });

  // Any edit bumps updated_at, so an edited quotation never serves a stale PDF.
  const cacheKey = `q:${quotation.id}:${quotation.updated_at || quotation.created_at || ''}`;

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
