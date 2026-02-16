/**
 * Refinement framework: editable text that guides the conductor.
 * Stored in data/framework.txt; falls back to Specs/Buildingspecs.txt when empty.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.REGISTRY_DATA_DIR || path.join(process.cwd(), 'data', 'projects');
const FRAMEWORK_PATH = path.join(path.dirname(DATA_DIR), 'framework.txt');
// Env can override for Docker (e.g. FRAMEWORK_DEFAULT_SPEC=/specs/Buildingspecs.txt)
const DEFAULT_SPEC_PATH = process.env.FRAMEWORK_DEFAULT_SPEC ||
  path.join(__dirname, '..', '..', 'Specs', 'Buildingspecs.txt');

function ensureDataDir() {
  const dir = path.dirname(FRAMEWORK_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function read() {
  ensureDataDir();
  if (fs.existsSync(FRAMEWORK_PATH)) {
    return fs.readFileSync(FRAMEWORK_PATH, 'utf8');
  }
  if (fs.existsSync(DEFAULT_SPEC_PATH)) {
    return fs.readFileSync(DEFAULT_SPEC_PATH, 'utf8');
  }
  return 'Refinement framework not set. Add phases and module triggers in the Framework panel and save.';
}

function write(content) {
  if (typeof content !== 'string') return false;
  ensureDataDir();
  fs.writeFileSync(FRAMEWORK_PATH, content, 'utf8');
  return true;
}

module.exports = { read, write, FRAMEWORK_PATH };
