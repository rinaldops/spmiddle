import assert from "node:assert/strict";
import {
  sanitizeRichText,
  validateContentLimits,
  validateSafeUrl
} from "../../packages/sharepoint-rich-text/src/index.js";

// Sanitized security cases for the Explore Mais link contract. This test does
// not import mse-platform or access a browser, tenant, or external URL.
const safeUrls = [
  "https://placeholder.invalid/safe",
  "http://placeholder.invalid/safe"
];
const unsafeUrls = [
  "javascript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "//placeholder.invalid/ambiguous",
  "https://user:password@placeholder.invalid/credential-bearing"
];

for (const url of safeUrls) assert.equal(validateSafeUrl(url), true, `URL segura rejeitada: ${url}`);
for (const url of unsafeUrls) assert.equal(validateSafeUrl(url), false, `URL insegura aceita: ${url}`);
assert.equal(validateSafeUrl("relative/path", { allowRelative: true }), true);
assert.equal(validateSafeUrl("javascript:alert(1)", { allowRelative: true }), false);

const dirtyDescription = '<p onclick="bad()">Use <strong>placeholder</strong></p>'
  + '<script>bad()</script><a href="javascript:bad()">unsafe</a>';
const cleanDescription = sanitizeRichText(dirtyDescription, { allowRelativeUrls: false });
assert.equal(/<\s*script\b|\bon[a-z]+\s*=|javascript\s*:/i.test(cleanDescription), false);
assert.match(cleanDescription, /placeholder/);

assert.equal(validateContentLimits("<placeholder-description>", {
  maxTextLength: 100,
  maxBytes: 100
}), true);
assert.equal(validateContentLimits("<placeholder-description>", {
  maxTextLength: 5
}), false);

console.log("ok - Explore Mais security parity: safe URLs, active-content removal, and content limits");
