// Minimal DOM stub sufficient to run mpef-analyzer-offline.html's <script>
// block inside Node's vm module. No dependencies.
"use strict";
const vm = require("vm");
const fs = require("fs");

function mockEl(id) {
  return {
    id,
    value: "",
    textContent: "",
    innerHTML: "",
    style: {},
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    _listeners: {},
    addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
    dispatchEvent(e) { (this._listeners[e.type] || []).forEach(fn => fn.call(this, e)); return true; },
    appendChild() {}, removeChild() {}, focus() {}, select() {}, click() {}, remove() {},
    setAttribute() {}, getAttribute() { return null; },
  };
}

const KNOWN_IDS = [
  "runState", "mTitle", "mDate", "mStart", "mSched", "mInv",
  "aAgenda", "aTrans", "aMom", "aChat", "aAtt",
  "localBtn", "demoBtn", "errBox", "noteBox",
  "copyPromptBtn", "savePromptBtn", "pasteJson", "scoreJsonBtn",
  "artBox", "dash", "emptyState", "report",
];

// Extracts the <script>...</script> body from the app HTML file.
function extractScript(htmlPath) {
  const html = fs.readFileSync(htmlPath, "utf8");
  const m = html.match(/<script>([\s\S]*)<\/script>/);
  if (!m) throw new Error("No <script> block found in " + htmlPath);
  return m[1];
}

// Boots a fresh sandbox running the app's engine. Returns { sandbox, els }.
// `els` is the id->mockEl map — set el.value before calling sandbox functions,
// or el._listeners.click[0]() to fire a button handler.
function boot(htmlPath) {
  const src = extractScript(htmlPath);
  const els = {};
  KNOWN_IDS.forEach(id => (els[id] = mockEl(id)));

  const sandbox = {
    document: {
      getElementById: id => els[id] || (els[id] = mockEl(id)),
      querySelector: () => ({ textContent: "", classList: { toggle() {} } }),
      createElement: () => mockEl("tmp"),
      body: { appendChild() {}, removeChild() {} },
      execCommand: () => true,
    },
    Event: class { constructor(type) { this.type = type; } },
    navigator: { clipboard: { writeText: async () => {} } },
    Blob: class { constructor(parts) { this.parts = parts; } },
    URL: { createObjectURL: () => "blob:mock", revokeObjectURL() {} },
    window: { print() {} },
    console, setTimeout, clearTimeout,
    Math, JSON, RegExp, Object, Array, String, Number, Boolean, Date,
    isFinite, isNaN, parseInt, parseFloat,
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: htmlPath });

  // Top-level `const`/`let` bindings (CONFIG, isName, bandOf, ...) live in
  // the context's global lexical environment, not as own properties of the
  // sandbox object -- unlike top-level `function` declarations (compute,
  // localExtract, normalizeTranscript, ...), which vm attaches directly.
  // Pull the const-bound identifiers the tests need across onto sandbox too,
  // by resolving them as a second script in the same context.
  const CONST_NAMES = ["CONFIG", "isName", "bandOf", "bandColor", "RX", "NOTNAME", "STOPW"];
  const resolved = vm.runInContext(
    "({" + CONST_NAMES.map(n => n + ": typeof " + n + " !== 'undefined' ? " + n + " : undefined").join(",") + "})",
    sandbox
  );
  Object.assign(sandbox, resolved);

  return { sandbox, els };
}

module.exports = { boot, extractScript, mockEl };
