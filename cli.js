#!/usr/bin/env node
/**
 * Lenovo Warranty + Spec CLI
 *
 * Usage:
 *   node cli.js --serial PF3AHRQ7              # pretty output (default)
 *   node cli.js --serial PF3AHRQ7 --json       # JSON output
 *   node cli.js --serial PF3AHRQ7 --pretty     # human-readable output
 *   node cli.js --serial PF3AHRQ7 --warranty   # warranty only
 *   node cli.js --serial PF3AHRQ7 --specs      # specs only
 */
const { getFullLookup, getWarrantyInfo, getMachineSpecs } = require('./lib/scraper');

// ── Minimal arg parser ───────────────────────────────────────────
function parseArgs(argv) {
  const args = { serial: null, json: false, pretty: false, warranty: false, specs: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if ((a === '--serial' || a === '-s') && argv[i + 1]) { args.serial = argv[++i]; continue; }
    if (a === '--json')    { args.json = true;    continue; }
    if (a === '--pretty')  { args.pretty = true;  continue; }
    if (a === '--warranty') { args.warranty = true; continue; }
    if (a === '--specs')   { args.specs = true;   continue; }
    if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
    // Allow bare serial (first positional arg)
    if (!a.startsWith('-') && !args.serial) { args.serial = a; }
  }
  return args;
}

function printHelp() {
  console.log(`
Lenovo Warranty + Spec CLI

Usage:
  node cli.js --serial <SERIAL>  [options]
  node cli.js <SERIAL>           [options]

Options:
  -s, --serial <SN>   Serial number to look up
  --json               Output raw JSON
  --pretty             Human-readable output (default)
  --warranty           Warranty info only (skip specs)
  --specs              Spec info only (skip warranty)
  -h, --help           Show this help

Examples:
  node cli.js PF3AHRQ7
  node cli.js --serial PF3AHRQ7 --json
  node cli.js PF3AHRQ7 --specs --json
`);
}

// ── Pretty printer ───────────────────────────────────────────────
function prettyPrint(data, mode) {
  const line = '─'.repeat(50);

  if (mode === 'warranty' || mode === 'full') {
    const w = data.warranty || data;
    console.log(`\n${line}`);
    console.log(`  Lenovo Warranty Lookup`);
    console.log(line);
    console.log(`  Serial Number : ${w.serialNumber || data.serialNumber || 'N/A'}`);
    console.log(`  Product       : ${data.productName || w.productName || 'N/A'}`);
    if (data.machineType) console.log(`  Machine Type  : ${data.machineType}`);
    console.log(`  Status        : ${w.warrantyStatus || 'N/A'}`);
    console.log(`  Start Date    : ${w.startDate || 'N/A'}`);
    console.log(`  End Date      : ${w.endDate || 'N/A'}`);
    if (w.daysRemaining != null) console.log(`  Days Left     : ${w.daysRemaining}`);
    if (w.coverageDetails && w.coverageDetails.length) {
      console.log(`  Coverage      :`);
      w.coverageDetails.forEach((c) => console.log(`    • ${c}`));
    }
  }

  const specs = data.specifications || {};
  if ((mode === 'specs' || mode === 'full') && Object.keys(specs).length) {
    console.log(`\n${line}`);
    console.log(`  Machine Specifications`);
    console.log(line);
    const maxKey = Math.max(...Object.keys(specs).map((k) => k.length), 10);
    for (const [k, v] of Object.entries(specs)) {
      console.log(`  ${k.padEnd(maxKey)}  ${v}`);
    }
  }

  console.log(`\n${line}`);
  console.log(`  Lookup completed at ${data.timestamp || new Date().toISOString()}`);
  console.log(line + '\n');
}

// ── Main ─────────────────────────────────────────────────────────
(async () => {
  const args = parseArgs(process.argv);

  if (!args.serial) {
    console.error('Error: serial number required. Use --help for usage.');
    process.exit(1);
  }

  const sn = args.serial.trim();

  try {
    let result;
    let mode = 'full';

    if (args.warranty && !args.specs) {
      mode = 'warranty';
      result = await getWarrantyInfo(sn);
    } else if (args.specs && !args.warranty) {
      mode = 'specs';
      result = await getMachineSpecs(sn);
    } else {
      result = await getFullLookup(sn);
    }

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      prettyPrint(result, mode);
    }
  } catch (err) {
    console.error(`\nError looking up ${sn}: ${err.message}\n`);
    process.exit(1);
  }
})();
