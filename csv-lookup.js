#!/usr/bin/env node
/**
 * Lenovo CSV Batch Lookup
 *
 * Reads serial numbers from the first column of an input CSV,
 * runs a full lookup (warranty + specs) for each serial,
 * and writes enriched results to an output CSV.
 *
 * Usage:
 *   node csv-lookup.js input.csv output.csv
 *   node csv-lookup.js input.csv                  # writes to input.results.csv
 *   node csv-lookup.js input.csv -d 3000          # 3s delay between lookups
 */
const fs = require('fs');
const path = require('path');
const { getFullLookup } = require('./lib/scraper');

// ── CSV helpers (no external deps) ───────────────────────────────
function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { fields.push(current); current = ''; }
      else { current += ch; }
    }
  }
  fields.push(current);
  return fields;
}

function sanitizeText(s) {
  // Replace common Unicode symbols with ASCII equivalents for CSV compatibility
  return s
    .replace(/®/g, '(R)')
    .replace(/™/g, '(TM)')
    .replace(/©/g, '(C)')
    .replace(/°/g, ' deg')
    .replace(/–/g, '-')
    .replace(/—/g, '-')
    .replace(/'/g, "'")
    .replace(/'/g, "'")
    .replace(/"/g, '"')
    .replace(/"/g, '"')
    .replace(/…/g, '...')
    .replace(/[^\x00-\x7F]/g, ''); // Remove any remaining non-ASCII
}

function escapeCSV(val) {
  const s = sanitizeText(String(val == null ? '' : val));
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function toCSVLine(fields) {
  return fields.map(escapeCSV).join(',');
}

// ── Parse args ───────────────────────────────────────────────────
function parseArgs(argv) {
  const opts = { input: null, output: null, delay: 2000 };
  const positional = [];
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if ((a === '-d' || a === '--delay') && argv[i + 1]) { opts.delay = parseInt(argv[++i], 10); continue; }
    if (a === '-h' || a === '--help') { printHelp(); process.exit(0); }
    positional.push(a);
  }
  opts.input = positional[0] || null;
  opts.output = positional[1] || null;
  return opts;
}

function printHelp() {
  console.log(`
Lenovo CSV Batch Lookup

Usage:
  node csv-lookup.js <input.csv> [output.csv] [options]

Options:
  -d, --delay <ms>   Delay between lookups in ms (default: 2000)
  -h, --help         Show this help

Input CSV format:
  First column must contain Lenovo serial numbers.
  First row is treated as a header.

Output CSV:
  The original columns are preserved, and the following columns are appended:
    Product Name, Machine Type, Warranty Status, Warranty Start,
    Warranty End, Days Remaining, Processor, Memory, Storage,
    Display, Operating System, Graphics, Battery, All Specs (JSON), Error

Examples:
  node csv-lookup.js serials.csv results.csv
  node csv-lookup.js serials.csv                   # → serials.results.csv
  node csv-lookup.js serials.csv results.csv -d 5000
`);
}

// ── Fixed output columns we always add ───────────────────────────
const EXTRA_HEADERS = [
  'Product Name',
  'Machine Type',
  'Warranty Status',
  'Warranty Start',
  'Warranty End',
  'Days Remaining',
  'Processor',
  'Memory',
  'Storage',
  'Display',
  'Operating System',
  'Graphics',
  'Battery',
  'All Specs (JSON)',
  'Error'
];

// Try to match spec keys to our fixed columns
function specValue(specs, ...keys) {
  for (const k of keys) {
    for (const sk of Object.keys(specs)) {
      if (sk.toLowerCase().includes(k.toLowerCase())) return specs[sk];
    }
  }
  return '';
}

function buildExtraFields(result) {
  if (!result || !result.success) {
    const err = result ? result.error || 'Lookup failed' : 'Lookup failed';
    return Array(EXTRA_HEADERS.length - 1).fill('').concat([err]);
  }

  const w = result.warranty || {};
  const specs = result.specifications || {};

  return [
    result.productName || w.productName || '',
    result.machineType || '',
    w.warrantyStatus || '',
    w.startDate || '',
    w.endDate || '',
    w.daysRemaining != null ? String(w.daysRemaining) : '',
    specValue(specs, 'processor', 'cpu'),
    specValue(specs, 'memory', 'ram'),
    specValue(specs, 'storage', 'hard drive', 'ssd', 'hdd', 'disk'),
    specValue(specs, 'display', 'screen', 'lcd'),
    specValue(specs, 'operating system', 'os'),
    specValue(specs, 'graphic', 'gpu', 'video'),
    specValue(specs, 'battery'),
    JSON.stringify(specs),
    ''   // no error
  ];
}

// ── Main ─────────────────────────────────────────────────────────
(async () => {
  const opts = parseArgs(process.argv);

  if (!opts.input) {
    console.error('Error: input CSV path required. Use --help for usage.');
    process.exit(1);
  }

  if (!fs.existsSync(opts.input)) {
    console.error(`Error: file not found: ${opts.input}`);
    process.exit(1);
  }

  const outputPath = opts.output ||
    path.join(
      path.dirname(opts.input),
      path.basename(opts.input, path.extname(opts.input)) + '.results.csv'
    );

  const raw = fs.readFileSync(opts.input, 'utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    console.error('Error: CSV must have a header row and at least one data row.');
    process.exit(1);
  }

  const headerFields = parseCSVLine(lines[0]);
  const outputHeader = toCSVLine([...headerFields, ...EXTRA_HEADERS]);
  const rows = lines.slice(1).map((l) => parseCSVLine(l));
  const total = rows.length;

  console.log(`\nLenovo CSV Batch Lookup`);
  console.log(`─────────────────────────────────`);
  console.log(`  Input  : ${opts.input}`);
  console.log(`  Output : ${outputPath}`);
  console.log(`  Serials: ${total}`);
  console.log(`  Delay  : ${opts.delay}ms between lookups`);
  console.log(`─────────────────────────────────\n`);

  const outputLines = [outputHeader];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < total; i++) {
    const row = rows[i];
    const serial = (row[0] || '').trim();

    if (!serial || serial.length < 3) {
      console.log(`  [${i + 1}/${total}] Skipping empty/invalid serial`);
      outputLines.push(toCSVLine([...row, ...Array(EXTRA_HEADERS.length).fill('SKIPPED')]));
      continue;
    }

    console.log(`  [${i + 1}/${total}] Looking up ${serial}...`);

    let result;
    try {
      result = await getFullLookup(serial);
      successCount++;
      console.log(`  [${i + 1}/${total}] ✓ ${serial} — ${result.productName || 'OK'}`);
    } catch (err) {
      failCount++;
      result = { success: false, serialNumber: serial, error: err.message };
      console.log(`  [${i + 1}/${total}] ✗ ${serial} — ${err.message}`);
    }

    const extra = buildExtraFields(result);
    outputLines.push(toCSVLine([...row, ...extra]));

    // Write progress after each lookup so partial results are saved
    fs.writeFileSync(outputPath, outputLines.join('\n') + '\n', 'utf-8');

    // Polite delay between lookups (skip after last one)
    if (i < total - 1 && opts.delay > 0) {
      await new Promise((r) => setTimeout(r, opts.delay));
    }
  }

  console.log(`\n─────────────────────────────────`);
  console.log(`  Done! ${successCount} succeeded, ${failCount} failed out of ${total}`);
  console.log(`  Results written to: ${outputPath}`);
  console.log(`─────────────────────────────────\n`);
})();
