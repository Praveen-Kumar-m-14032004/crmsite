/**
 * Header information shared by the report exports (Excel and CSV): company name,
 * generated date, invoice count and the filters the report was run with.
 */

const FALLBACK_COMPANY = 'Permit Declaration';

function describeFilters(filters = {}) {
  const status = filters.status && String(filters.status).toLowerCase() === 'pending' ? 'Unpaid' : filters.status;
  return Object.entries({
    'Company Name': filters.company,
    From: filters.start,
    To: filters.end,
    'Payment Status': filters.paymentStatus,
    Status: status,
    'Invoice No': filters.invoiceNo,
  })
    .filter(([, value]) => value && String(value).trim() && value !== 'All')
    .map(([label, value]) => `${label}: ${String(value).trim()}`);
}

function reportHeader(rows = [], { filters = {}, settings = {} } = {}) {
  const active = describeFilters(filters);
  const generatedOn = new Date().toISOString().slice(0, 10);
  return {
    company: String(settings.company_name || '').trim() || FALLBACK_COMPANY,
    title: 'Invoice Report',
    generatedOn,
    countLabel: `${rows.length} invoice${rows.length === 1 ? '' : 's'}`,
    filtersLabel: active.length ? active.join('   |   ') : 'All invoices (no filters applied)',
  };
}

module.exports = { describeFilters, reportHeader };
