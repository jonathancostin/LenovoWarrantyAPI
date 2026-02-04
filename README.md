# Lenovo Warranty + Spec Lookup

A Node.js toolkit for looking up Lenovo warranty status and hardware specifications by serial number. Uses Playwright to scrape the Lenovo support site.

**Three ways to use it:**
- **CLI** — Look up a single serial from the command line
- **CSV** — Batch-process a spreadsheet of serials
- **API Server** — REST endpoints for integration with other apps

---

## Prerequisites

This tool requires **Node.js** and **Google Chrome** to be installed.

### Installing Node.js

#### macOS

**Option A: Using Homebrew (recommended)**
```bash
# Install Homebrew if you don't have it
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js
brew install node
```

**Option B: Direct download**
1. Go to https://nodejs.org
2. Download the macOS installer (LTS version recommended)
3. Run the installer

Verify installation:
```bash
node --version   # Should show v18 or higher
npm --version    # Should show 9 or higher
```

#### Windows

**Option A: Direct download (recommended)**
1. Go to https://nodejs.org
2. Download the Windows installer (LTS version recommended)
3. Run the installer, accept defaults

**Option B: Using winget**
```powershell
winget install OpenJS.NodeJS.LTS
```

**Option C: Using Chocolatey**
```powershell
choco install nodejs-lts
```

Verify installation (open new terminal after install):
```powershell
node --version
npm --version
```

### Installing Google Chrome

This tool uses Chrome (not Playwright's bundled Chromium) to bypass TLS fingerprinting on Lenovo's website.

#### macOS
```bash
# Via Homebrew
brew install --cask google-chrome

# Or download from https://www.google.com/chrome/
```

#### Windows
Download from https://www.google.com/chrome/ and install.

---

## Installation

```bash
# Clone the repository
git clone https://github.com/jonathancostin/LenovoWarrantyAPI.git
cd LenovoWarrantyAPI

# Install Node.js dependencies
npm install

# Install Playwright's Chrome integration
npx playwright install chromium
```

That's it! You're ready to use the tool.

---

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

### Example Output

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

---

## CSV Batch Lookup

Process a CSV of serial numbers and get enriched output with warranty + spec data.

```bash
# Basic usage
node csv-lookup.js input.csv output.csv

# Auto-named output (creates input.results.csv)
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

---

## API Server

For integration with web apps or other services:

```bash
# Start the server (port 3001 by default)
npm start

# Or directly
node server.js
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/warranty-lookup` | Warranty info only |
| `POST` | `/api/spec-lookup` | Machine specs only |
| `POST` | `/api/full-lookup` | Warranty + specs combined |
| `POST` | `/api/bulk-lookup` | Multiple serials (max 50) |
| `GET` | `/api/health` | Health check |

### Example Requests

**Single lookup:**
```bash
curl -X POST http://localhost:3001/api/full-lookup \
  -H "Content-Type: application/json" \
  -d '{"serialNumber": "PF3AHRQ7"}'
```

**Bulk lookup:**
```bash
curl -X POST http://localhost:3001/api/bulk-lookup \
  -H "Content-Type: application/json" \
  -d '{"serialNumbers": ["PF3AHRQ7", "MJ09RK9B"]}'
```

### Environment Variables

Create a `.env` file to customize:

```env
PORT=3001
ALLOWED_ORIGIN=*
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | API server port |
| `ALLOWED_ORIGIN` | `*` | CORS origin (use `*` for any, or specify your domain) |

---

## Project Structure

```
├── cli.js              # Standalone CLI tool
├── csv-lookup.js       # CSV batch processor
├── server.js           # Express API server
├── lib/
│   └── scraper.js      # Shared Playwright scraping logic
└── package.json
```

---

## Troubleshooting

### "Chrome not found" error
Make sure Google Chrome is installed and run:
```bash
npx playwright install chromium
```

### Slow lookups
Each lookup takes ~10–20 seconds due to page load times. For CSV batch processing, the default 2-second delay between lookups helps avoid rate limiting.

### Selectors stopped working
Lenovo's support site is an SPA. If the scraper stops returning data, the site's HTML structure may have changed. Check `lib/scraper.js` and update the selectors.

### Rate limiting
If you're getting blocked or empty results on bulk lookups, increase the delay:
```bash
node csv-lookup.js input.csv output.csv --delay 5000
```

---

## License

MIT
