/*
 * Small, dependency-free guardrails for code running in a browser.
 *
 * These functions deliberately do not attempt to be an HTML parser or a
 * replacement for CSP, Trusted Types, or server-side validation.
 */

const ACTIVE_ELEMENTS = /<\s*\/?\s*(?:script|style|iframe|object|embed)(?:\s|\/?>)[\s\S]*?<\s*\/\s*(?:script|style|iframe|object|embed)\s*>/gi;
const ACTIVE_START = /<\s*\/?\s*(?:script|style|iframe|object|embed)(?:\s|\/?>)[^>]*>/gi;
const EVENT_ATTRIBUTE = /\s+["']?on[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const URL_ATTRIBUTE = /\s+((?:href|src|action|formaction|xlink:href|poster|background|cite|longdesc|usemap))\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const STYLE_ATTRIBUTE = /\s+style\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;
const SECRET_KEY = /^(?:authorization|proxy-authorization|cookie|set-cookie|(?:x-)?csrf[-_]?token|(?:x-)?request[-_]?digest|(?:access|refresh|id)[-_]?token|token|password|passwd|secret|api[-_]?key)$/i;

function text(value, name) {
  if (typeof value !== "string") throw new TypeError(`${name} deve ser um texto.`);
  return value;
}

function attributeValue(value) {
  return value.replace(/^['"]|['"]$/g, "").trim();
}

/**
 * Removes common active HTML content and dangerous URL/event attributes.
 * This is a conservative string filter, not a full HTML parser or sanitizer.
 */
export function sanitizeRichText(input, options = {}) {
  let result = text(input, "input");
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("options deve ser um objeto.");
  }

  // Remove complete known active-element blocks first, then malformed/open
  // instances as well.  The latter is intentionally conservative.
  result = result.replace(ACTIVE_ELEMENTS, "").replace(ACTIVE_START, "");
  result = result.replace(EVENT_ATTRIBUTE, "").replace(STYLE_ATTRIBUTE, "");
  result = result.replace(URL_ATTRIBUTE, (whole, name, raw) => {
    const url = attributeValue(raw);
    return validateSafeUrl(url, { allowRelative: options.allowRelativeUrls !== false }) ? whole : "";
  });
  return result;
}

/**
 * Validates a URL without resolving it against the current document.
 * Returns a boolean; invalid argument types throw TypeError.
 */
export function validateSafeUrl(value, options = {}) {
  text(value, "value");
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("options deve ser um objeto.");
  }
  if (CONTROL_CHARS.test(value) || /\\/.test(value)) return false;
  const candidate = value.trim();
  if (!candidate || /[\u0000-\u001f\u007f-\u009f]/.test(candidate)) return false;
  const allowRelative = options.allowRelative === true || options.allowRelativeUrls === true;
  if (/^(?:javascript|data|vbscript):/i.test(candidate.replace(/^\s+/, ""))) return false;
  if (candidate.startsWith("//")) return false;

  let parsed;
  try { parsed = new URL(candidate); } catch { parsed = null; }
  if (parsed) {
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    return !parsed.username && !parsed.password;
  }
  if (!allowRelative) return false;
  // A relative reference must not contain a hidden scheme such as "x:y".
  return !/^[a-z][a-z0-9+.-]*:/i.test(candidate) && !candidate.startsWith("#")
    ? true
    : candidate.startsWith("#");
}

function utf8Bytes(value) {
  let bytes = 0;
  for (const character of value) {
    const code = character.codePointAt(0);
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
}

/** Returns false when configured text/byte limits are exceeded. */
export function validateContentLimits(value, limits = {}) {
  text(value, "value");
  if (limits === null || typeof limits !== "object" || Array.isArray(limits)) {
    throw new TypeError("limits deve ser um objeto.");
  }
  const textLength = [...value].length;
  const bytes = utf8Bytes(value);
  const maxText = limits.maxTextLength ?? limits.maxText;
  const maxBytes = limits.maxBytes;
  const minText = limits.minTextLength ?? limits.minText;
  for (const [name, limit] of [["maxTextLength", maxText], ["maxBytes", maxBytes], ["minTextLength", minText]]) {
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 0)) {
      throw new TypeError(`${name} deve ser um inteiro não negativo.`);
    }
  }
  return (maxText === undefined || textLength <= maxText)
    && (maxBytes === undefined || bytes <= maxBytes)
    && (minText === undefined || textLength >= minText);
}

function redactString(value) {
  return value
    .replace(/(authorization\s*[:=]\s*)(bearer\s+)?[^\s,;]+/ig, "$1[REDACTED]")
    .replace(/((?:cookie|set-cookie|x-(?:csrf-token|request-digest)|(?:access|refresh)[-_]?token)\s*[:=]\s*)[^\s,;]+/ig, "$1[REDACTED]");
}

function redact(value, seen) {
  if (typeof value === "string") return redactString(value);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (value instanceof Error) {
    const safe = { name: value.name, message: redactString(value.message) };
    seen.delete(value);
    return safe;
  }
  if (Array.isArray(value)) {
    const safe = value.map((item) => redact(item, seen));
    seen.delete(value);
    return safe;
  }
  const safe = {};
  for (const [key, item] of Object.entries(value)) safe[key] = SECRET_KEY.test(key) ? "[REDACTED]" : redact(item, seen);
  seen.delete(value);
  return safe;
}

/** Creates logger methods that clone and redact data before forwarding it. */
export function createSafeLogger({ logger = console, redactor } = {}) {
  if (logger === null || (typeof logger !== "object" && typeof logger !== "function")) throw new TypeError("logger deve ser um objeto.");
  if (redactor !== undefined && typeof redactor !== "function") throw new TypeError("redactor deve ser uma função.");
  const safeCall = (method, args) => {
    const transformed = args.map((arg) => redactor ? redactor(arg) : arg);
    const safeArgs = transformed.map((arg) => redact(arg, new WeakSet()));
    if (typeof logger[method] === "function") return logger[method].apply(logger, safeArgs);
    if (method !== "log" && typeof logger.log === "function") return logger.log.apply(logger, safeArgs);
    return undefined;
  };
  return Object.freeze(Object.fromEntries(["debug", "info", "warn", "error", "log"].map((method) => [method, (...args) => safeCall(method, args)])));
}
