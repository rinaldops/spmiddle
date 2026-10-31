import assert from "node:assert/strict";
import {
  sanitizeRichText,
  validateSafeUrl,
  validateContentLimits,
  createSafeLogger
} from "../src/security.js";

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("sanitizes active elements, event handlers, styles, and dangerous URLs", () => {
  const input = [
    '<p onclick="alert(1)" style="background:url(javascript:evil)">Hello</p>',
    '<script>alert(1)</script><iframe src="https://evil.test"></iframe>',
    '<a href="javascript:alert(1)" onmouseover=steal()>link</a>',
    '<img src="data:text/html,<script>alert(1)</script>" onerror="steal()">'
  ].join("");

  const output = sanitizeRichText(input);
  assert.equal(/<\s*\/?\s*(script|iframe|style|object|embed)\b/i.test(output), false);
  assert.equal(/\bon[a-z0-9_-]+\s*=/i.test(output), false);
  assert.equal(/\bstyle\s*=/i.test(output), false);
  assert.equal(/javascript\s*:/i.test(output), false);
  assert.equal(/data\s*:/i.test(output), false);
  assert.match(output, /Hello/);
  assert.match(output, />link<\/a>/);
});

test("retains safe URLs and supports the relative URL sanitizer option", () => {
  const output = sanitizeRichText(
    '<a href="https://example.test/path">absolute</a>'
      + '<img src="/images/logo.png"><a href="javascript:alert(1)">bad</a>'
  );
  assert.match(output, /href="https:\/\/example\.test\/path"/);
  assert.match(output, /src="\/images\/logo\.png"/);
  assert.equal(output.includes('href="javascript:alert(1)"'), false);
  assert.equal(sanitizeRichText('<a href="/relative">x</a>', { allowRelativeUrls: false }), '<a>x</a>');
});

test("validates safe HTTP URLs and rejects active, credential-bearing, and ambiguous URLs", () => {
  for (const value of [
    "https://example.test/path?q=1",
    "http://example.test",
    "/sites/app/page",
    "./page",
    "#section"
  ]) {
    assert.equal(validateSafeUrl(value, { allowRelative: true }), true, value);
  }
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,hello",
    "vbscript:msgbox(1)",
    "//evil.test/path",
    "https://user:password@example.test/",
    "https://example.test\\evil",
    "https://example.test/\nX"
  ]) {
    assert.equal(validateSafeUrl(value, { allowRelative: true }), false, value);
  }
  assert.equal(validateSafeUrl("/relative"), false);
  assert.equal(validateSafeUrl("relative", { allowRelative: true }), true);
  assert.throws(() => validateSafeUrl(null), TypeError);
});

test("enforces text length, UTF-8 byte, and minimum length limits", () => {
  assert.equal(validateContentLimits("Olá", { maxTextLength: 3, maxBytes: 4, minTextLength: 3 }), true);
  assert.equal(validateContentLimits("Olá", { maxBytes: 3 }), false);
  assert.equal(validateContentLimits("ab", { minTextLength: 3 }), false);
  assert.equal(validateContentLimits("😀😀", { maxTextLength: 2, maxBytes: 8 }), true);
  assert.equal(validateContentLimits("😀😀", { maxBytes: 7 }), false);
  assert.equal(validateContentLimits("abc", { maxText: 3 }), true);
  assert.throws(() => validateContentLimits("abc", { maxBytes: -1 }), TypeError);
  assert.throws(() => validateContentLimits("abc", { maxTextLength: 1.5 }), TypeError);
});

test("safe logger redacts secret fields and sensitive header-like strings without mutating input", () => {
  const calls = [];
  const logger = createSafeLogger({ logger: { info: (...args) => calls.push(args) } });
  const payload = {
    Authorization: "Bearer original-secret",
    Cookie: "session=original-cookie",
    access_token: "original-token",
    nested: { password: "original-password", visible: "ok" },
    message: "Authorization: Bearer string-secret; Cookie: session-cookie"
  };

  logger.info(payload);
  assert.equal(payload.Authorization, "Bearer original-secret");
  assert.deepEqual(calls, [[{
    Authorization: "[REDACTED]",
    Cookie: "[REDACTED]",
    access_token: "[REDACTED]",
    nested: { password: "[REDACTED]", visible: "ok" },
    message: "Authorization: [REDACTED]; Cookie: [REDACTED]"
  }]]);
});

test("security helpers are pure and do not require DOM or network access", () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => {
    calls += 1;
    throw new Error("network access is forbidden in security tests");
  };
  try {
    sanitizeRichText("<p>plain text</p>");
    validateSafeUrl("https://example.test");
    validateContentLimits("plain text", { maxTextLength: 20 });
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}
