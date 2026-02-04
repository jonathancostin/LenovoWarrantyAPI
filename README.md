# Lenovo Warranty + Spec Lookup

A Node.js toolkit for looking up Lenovo warranty status and hardware specs by serial number. Uses Playwright to scrape the Lenovo support site.

Three ways to use it:
- **CLI** — look up a single serial from the command line
- **CSV** — batch-process a spreadsheet of serials
- **API Server** — REST endpoints for integration with other apps

## Setup

```bash
npm install
```

> **Note:** This project uses Google Chrome (not Playwright's bundled Chromium) to bypass TLS fingerprinting on Lenovo's site. Make sure Chrome is installed, then run `npx playwright install chrome` to register it with Playwright.

## CLI Usage

Look up a single serial number without running the server:

```bash
# Pretty human-readable output (default)
node cli.js --serial PF3AHRQ7

# Short form / bare serial
node cli.js PF3AHRQ7

# JSON output
node cli.js --serial PF3AHRQ7 --json

# Warranty only (faster — skips spec scrape)
node cli.js --serial PF3AHRQ7 --warranty

# Specs only
node cli.js --serial PF3AHRQ7 --specs

# Specs as JSON
node cli.js PF3AHRQ7 --specs --json
```

### CLI Options

| Flag | Description |
|------|-------------|
| `-s, --serial <SN>` | Serial number (or pass as first positional arg) |
| `--json` | Output raw JSON |
| `--pretty` | Human-readable output (default) |
| `--warranty` | Warranty info only |
| `--specs` | Hardware specs only |
| `-h, --help` | Show help |

### Example Output (pretty)

```
──────────────────────────────────────────────────
  Lenovo Warranty Lookup
──────────────────────────────────────────────────
  Serial Number : PF3AHRQ7
  Product       : ThinkPad T14 Gen 3
  Status        : Active
  Start Date    : 01/15/2023
  End Date      : 01/14/2026
  Days Left     : 345

──────────────────────────────────────────────────
  Machine Specifications
──────────────────────────────────────────────────
  Processor          Intel Core i7-1265U
  Memory             16 GB DDR5
  Storage            512 GB SSD M.2 2280 PCIe
  Display            14" WUXGA (1920x1200) IPS
  Operating System   Windows 11 Pro 64-bit
  Graphics           Intel Iris Xe Graphics
  Battery            52.5Wh
──────────────────────────────────────────────────
```

## CSV Batch Lookup

Process a CSV of serial numbers and get enriched output with warranty + spec data.

```bash
# Basic usage
node csv-lookup.js input.csv output.csv

# Auto-named output (input.results.csv)
node csv-lookup.js input.csv

# Custom delay between lookups (default 2000ms)
node csv-lookup.js input.csv output.csv --delay 5000
```

### Input CSV Format

The **first column** must contain serial numbers. A header row is required. Any additional columns are preserved in the output:

```csv
Serial,Asset Tag,Location
PF3AHRQ7,IT-001,Floor 2
MJ09RK9B,IT-002,Floor 3
R90WKXYZ,IT-003,Reception
```

### Output CSV

Your original columns are kept, and the following columns are appended:

| Column | Description |
|--------|-------------|
| Product Name | e.g. "ThinkPad T14 Gen 3" |
| Machine Type | MTM identifier |
| Warranty Status | Active / Expired / Unknown |
| Warranty Start | Start date |
| Warranty End | End date |
| Days Remaining | Days of warranty left |
| Processor | CPU info |
| Memory | RAM info |
| Storage | Drive info |
| Display | Screen info |
| Operating System | OS version |
| Graphics | GPU info |
| Battery | Battery info |
| All Specs (JSON) | Full specs object as JSON |
| Error | Error message if lookup failed |

### Features

- **Progress indicator** — shows `[3/100] Looking up ABC123...` as it runs
- **Incremental saves** — writes results after each lookup so you don't lose progress if interrupted
- **Error resilience** — if one serial fails, it logs the error and continues with the rest
- **Rate limiting** — configurable delay between lookups (default 2s) to avoid being blocked

## API Server

For integration with web apps or other services:

```bash
# Start the server (port 3001 by default)
node server.js

# Or use PM2 for production
npm run pm2:start
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/warranty-lookup` | Warranty info only |
| `POST` | `/api/spec-lookup` | Machine specs only |
| `POST` | `/api/full-lookup` | Warranty + specs combined |
| `POST` | `/api/bulk-lookup` | Multiple serials (max 50) |
| `GET` | `/api/health` | Health check |

### Example Request

```bash
curl -X POST http://localhost:3001/api/full-lookup \
  -H "Content-Type: application/json" \
  -d '{"serialNumber": "PF3AHRQ7"}'
```

### Bulk Request

```bash
curl -X POST http://localhost:3001/api/bulk-lookup \
  -H "Content-Type: application/json" \
  -d '{"serialNumbers": ["PF3AHRQ7", "MJ09RK9B"]}'
```

## Project Structure

```
├── cli.js              # Standalone CLI tool
├── csv-lookup.js       # CSV batch processor
├── server.js           # Express API server
├── lib/
│   └── scraper.js      # Shared Playwright scraping logic
├── server-simple.js    # Lightweight server (no specs)
├── test-api.js         # API tests
├── ecosystem.config.js # PM2 config
├── deploy.sh           # Deployment script
└── package.json
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | API server port |
| `ALLOWED_ORIGIN` | `*` | CORS origin |

## Notes

- Playwright launches Chrome in headless mode for each lookup (uses `channel: 'chrome'` to bypass TLS fingerprinting)
- Each lookup takes ~10–20 seconds depending on network speed
- The Lenovo support site is an SPA — scraping selectors may need updating if their UI changes
- For large CSV batches, consider increasing the delay to avoid rate limiting
