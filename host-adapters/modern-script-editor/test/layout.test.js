import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SourceTextModule, SyntheticModule, createContext } from "node:vm";
import { applyMseLayout } from "../layout.js";

const tests = [];
function test(name, run) { tests.push({ name, run }); }

// Minimal geometry/event doubles, not a browser or a replica of the adapter.
function fixture({ mode = null, viewport = 1440, hostLeft = 220, hostRight = 1220,
  boundaryLeft = 80, boundaryRight = 1440, withBoundary = true, withObserver = true } = {}) {
  const listeners = new Map();
  const observers = [];
  const values = new Map();
  const classes = new Set();
  const boundary = { clientLeft: 0, clientWidth: boundaryRight - boundaryLeft, getBoundingClientRect: () => ({
    left: boundaryLeft, right: boundaryRight, width: boundaryRight - boundaryLeft
  }) };
  const parent = { closest: (selector) => selector === "[data-spmiddle-host]" ? null : withBoundary ? boundary : null };
  const document = {
    documentElement: { clientWidth: viewport },
    defaultView: {
      addEventListener(name, handler) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(handler);
      },
      removeEventListener(name, handler) { listeners.get(name)?.delete(handler); }
    }
  };
  if (withObserver) document.defaultView.ResizeObserver = class {
    targets = new Set();
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target) { this.targets.add(target); }
    disconnect() { this.targets.clear(); }
  };
  const host = {
    ownerDocument: document,
    isConnected: true,
    parentElement: parent,
    mode,
    dataset: {},
    matches: (selector) => selector === "[data-spmiddle-host]",
    getAttribute() { return this.mode; },
    classList: {
      contains: (name) => classes.has(name),
      toggle(name, active) { if (active) classes.add(name); else classes.delete(name); }
    },
    style: {
      getPropertyValue: (name) => values.get(name)?.value ?? "",
      getPropertyPriority: (name) => values.get(name)?.priority ?? "",
      setProperty: (name, value, priority = "") => values.set(name, { value, priority }),
      removeProperty: (name) => values.delete(name)
    },
    getBoundingClientRect() {
      const left = this.baseLeft + (Number.parseFloat(this.style.getPropertyValue("--spmiddle-host-margin-left")) || 0);
      const right = this.baseRight - (Number.parseFloat(this.style.getPropertyValue("--spmiddle-host-margin-right")) || 0);
      return { left, right, width: right - left };
    },
    baseLeft: hostLeft,
    baseRight: hostRight
  };
  return { host, document, parent, boundary, observers, listeners, classes };
}

function margins(host) {
  return [host.style.getPropertyValue("--spmiddle-host-margin-left"),
    host.style.getPropertyValue("--spmiddle-host-margin-right")];
}

test("Contained is the default and does not expand the wrapper", () => {
  const fake = fixture();
  const controller = applyMseLayout(fake.host);
  assert.equal(controller.refresh(), "Contained");
  assert.deepEqual(margins(fake.host), ["0px", "0px"]);
  assert.equal(fake.host.getBoundingClientRect().width, 1000);
  assert.equal(fake.classes.has("spmiddle-mse-host--full-bleed"), false);
  controller.dispose();
});

test("FullBleed expands to an asymmetric host without covering side navigation", () => {
  const fake = fixture({ mode: "FullBleed" });
  const controller = applyMseLayout(fake.host);
  assert.deepEqual(margins(fake.host), ["-140px", "-220px"]);
  assert.deepEqual(fake.host.getBoundingClientRect(), { left: 80, right: 1440, width: 1360 });
  controller.refresh();
  controller.refresh();
  assert.deepEqual(margins(fake.host), ["-140px", "-220px"]);
  controller.dispose();
});

test("without a SharePoint boundary FullBleed uses the scrollbar-excluding viewport", () => {
  const fake = fixture({ mode: " fullbleed ", withBoundary: false, viewport: 1425 });
  const controller = applyMseLayout(fake.host);
  assert.equal(controller.refresh(), "FullBleed");
  assert.deepEqual(fake.host.getBoundingClientRect(), { left: 0, right: 1425, width: 1425 });
  controller.dispose();
});

test("boundary coordinates are intersected with the viewport", () => {
  const fake = fixture({ mode: "FullBleed", boundaryLeft: -100, boundaryRight: 1700 });
  const controller = applyMseLayout(fake.host);
  assert.deepEqual(fake.host.getBoundingClientRect(), { left: 0, right: 1440, width: 1440 });
  controller.dispose();
});

test("boundary client box excludes borders and a left-side RTL scrollbar", () => {
  const fake = fixture({ mode: "FullBleed" });
  fake.boundary.clientLeft = 17;
  fake.boundary.clientWidth = 1341;
  const controller = applyMseLayout(fake.host);
  assert.deepEqual(fake.host.getBoundingClientRect(), { left: 97, right: 1438, width: 1341 });
  controller.dispose();
});

test("disconnected hosts and empty boundary intersections stay unexpanded", () => {
  const fake = fixture({ mode: "FullBleed" });
  fake.host.isConnected = false;
  const controller = applyMseLayout(fake.host);
  assert.deepEqual(margins(fake.host), ["0px", "0px"]);
  controller.dispose();
  const offscreen = fixture({ mode: "FullBleed", boundaryLeft: 1500, boundaryRight: 1600 });
  const other = applyMseLayout(offscreen.host);
  assert.deepEqual(margins(offscreen.host), ["0px", "0px"]);
  other.dispose();
});

test("resize recomputes from neutral geometry and refresh switches both modes", () => {
  const fake = fixture({ mode: "FullBleed", withBoundary: false });
  const controller = applyMseLayout(fake.host);
  fake.document.documentElement.clientWidth = 900;
  fake.host.baseLeft = 100;
  fake.host.baseRight = 800;
  fake.listeners.get("resize").forEach((handler) => handler());
  assert.deepEqual(margins(fake.host), ["-100px", "-100px"]);
  fake.host.mode = "Contained";
  assert.equal(controller.refresh(), "Contained");
  assert.deepEqual(margins(fake.host), ["0px", "0px"]);
  fake.host.mode = "FullBleed";
  controller.refresh();
  assert.deepEqual(margins(fake.host), ["-100px", "-100px"]);
  controller.dispose();
});

test("hidden hosts wait for measurable geometry and observers handle width changes", () => {
  const fake = fixture({ mode: "FullBleed", hostRight: 220 });
  const controller = applyMseLayout(fake.host);
  assert.deepEqual(margins(fake.host), ["0px", "0px"]);
  assert.deepEqual([...fake.observers[0].targets], [fake.parent, fake.boundary]);
  fake.host.baseRight = 1220;
  fake.observers[0].callback([{ target: fake.parent, contentRect: { width: 1000 } }]);
  assert.deepEqual(margins(fake.host), ["-140px", "-220px"]);
  // An unchanged width must not run another measurement on height-only reflow.
  fake.host.getBoundingClientRect = () => { throw new Error("unexpected measurement"); };
  fake.observers[0].callback([{ target: fake.parent, contentRect: { width: 1000 } }]);
  controller.dispose();
});

test("multiple instances are independent and initialization is idempotent", () => {
  const first = fixture({ mode: "FullBleed" });
  const second = fixture({ mode: "Contained" });
  const controller = applyMseLayout(first.host);
  const other = applyMseLayout(second.host);
  assert.equal(applyMseLayout(first.host), controller);
  assert.equal(first.listeners.get("resize").size, 1);
  assert.equal(first.observers.length, 1);
  controller.dispose();
  assert.deepEqual(margins(second.host), ["0px", "0px"]);
  assert.equal(second.listeners.get("resize").size, 1);
  other.dispose();
});

test("dispose restores owned styles and class, releases resources and permits reinitialization", () => {
  const fake = fixture({ mode: "FullBleed" });
  fake.host.style.setProperty("--spmiddle-host-margin-left", "3px", "important");
  fake.host.style.setProperty("color", "green");
  fake.host.classList.toggle("spmiddle-mse-host--full-bleed", true);
  const controller = applyMseLayout(fake.host);
  controller.dispose();
  controller.dispose();
  controller.refresh();
  assert.deepEqual(margins(fake.host), ["3px", ""]);
  assert.equal(fake.host.style.getPropertyPriority("--spmiddle-host-margin-left"), "important");
  assert.equal(fake.host.style.getPropertyValue("color"), "green");
  assert.equal(fake.classes.has("spmiddle-mse-host--full-bleed"), true);
  assert.equal(fake.listeners.get("resize").size, 0);
  assert.equal(fake.observers[0].targets.size, 0);
  const next = applyMseLayout(fake.host);
  assert.notEqual(next, controller);
  next.dispose();
});

test("invalid values and wrappers fail before listeners are registered", () => {
  for (const mode of ["", "Fullscreen", "invalid"]) {
    const fake = fixture({ mode });
    assert.throws(() => applyMseLayout(fake.host), /Contained ou FullBleed/);
    assert.equal(fake.listeners.size, 0);
    assert.equal(fake.observers.length, 0);
    assert.equal(fake.classes.size, 0);
  }
  assert.throws(() => applyMseLayout(null), /wrapper/);
  const nested = fixture();
  nested.host.parentElement = { closest: () => ({}) };
  assert.throws(() => applyMseLayout(nested.host), /aninhados/);
});

test("invalid refresh preserves the last valid layout", () => {
  const fake = fixture({ mode: "FullBleed" });
  const controller = applyMseLayout(fake.host);
  fake.host.mode = "invalid";
  assert.throws(controller.refresh, /Contained ou FullBleed/);
  assert.deepEqual(margins(fake.host), ["-140px", "-220px"]);
  assert.equal(fake.classes.has("spmiddle-mse-host--full-bleed"), true);
  controller.dispose();
});

test("without ResizeObserver window resize and explicit refresh remain available", () => {
  const fake = fixture({ mode: "FullBleed", withObserver: false });
  const controller = applyMseLayout(fake.host);
  assert.equal(fake.observers.length, 0);
  assert.equal(fake.listeners.get("resize").size, 1);
  controller.dispose();
});

test("CSS is scoped to the wrapper and never changes application max-width or global overflow", async () => {
  const css = await readFile(new URL("../layout.css", import.meta.url), "utf8");
  const selectors = [...css.matchAll(/([^{}]+)\{/g)].map((match) => match[1].replace(/\/\*[\s\S]*?\*\//g, "").trim());
  assert.deepEqual(selectors, ["[data-spmiddle-host]", "[data-spmiddle-host].spmiddle-mse-host--full-bleed"]);
  assert.doesNotMatch(css, /100vw|overflow|!important/);
  assert.match(css, /max-width: 100%/);
  assert.match(css, /max-width: none/);
});

test("classic external entrypoint imports the host and initializes roots after DOM ready", async () => {
  const source = await readFile(new URL("../spmiddle-mse-host.js", import.meta.url), "utf8");
  for (const readyState of ["loading", "complete"]) {
    const fake = fixture({ mode: "FullBleed" });
    const other = fixture();
    const invalid = fixture({ mode: "invalid" });
    const roots = [invalid.host, fake.host, other.host];
    const callbacks = [];
    const errors = [];
    const context = createContext({ document: {
      currentScript: { src: "https://spmiddle.invalid/host-v1/spmiddle-mse-host.js?pnp=1" },
      readyState,
      querySelectorAll(selector) { assert.equal(selector, "[data-spmiddle-host]"); return roots; },
      addEventListener(name, callback, options) {
        assert.equal(name, "DOMContentLoaded");
        assert.equal(options.once, true);
        callbacks.push(callback);
      }
    }, URL, console: { error: (...args) => errors.push(args) } });
    const module = new SourceTextModule(source, { context, importModuleDynamically: async (specifier) => {
      assert.equal(specifier, "https://spmiddle.invalid/host-v1/layout.js");
      const imported = new SyntheticModule(["applyMseLayout"], function () {
        this.setExport("applyMseLayout", applyMseLayout);
      }, { context });
      await imported.link(() => {});
      await imported.evaluate();
      return imported;
    } });
    await module.link(() => {});
    await module.evaluate();
    await context.SPMiddleMseHost.ready;
    if (readyState === "loading") {
      assert.deepEqual(margins(fake.host), ["", ""]);
      assert.equal(callbacks.length, 1);
      callbacks[0]();
    }
    await Promise.resolve();
    assert.deepEqual(margins(fake.host), ["-140px", "-220px"]);
    assert.deepEqual(margins(other.host), ["0px", "0px"]);
    assert.equal(errors.length, 1);
    applyMseLayout(fake.host).dispose();
    applyMseLayout(other.host).dispose();
  }
});

test("published example applies layout before mount and cleans up on teardown and mount failure", async () => {
  const source = await readFile(new URL("../../../examples/mse-layout/bootstrap.js", import.meta.url), "utf8");
  for (const fail of [false, true]) {
    const fake = fixture({ mode: "FullBleed" });
    const root = {};
    const cleanup = [];
    const events = [];
    const errors = [];
    let complete;
    const completed = new Promise((resolve) => { complete = resolve; });
    fake.host.querySelector = (selector) => {
      assert.equal(selector, "[data-spmiddle-app-root]");
      return root;
    };
    fake.host.addEventListener = (name, callback, options) => {
      assert.equal(name, "spmiddle-example-dispose");
      assert.equal(options.once, true);
      cleanup.push(callback);
      complete();
    };
    const context = createContext({ document: {
      currentScript: { src: "https://spmiddle.invalid/app-v1/bootstrap.js?pnp=1" },
      readyState: "complete",
      querySelector: () => fake.host
    }, SPMiddleMseHost: { ready: Promise.resolve({ applyMseLayout }) }, URL,
    console: { error: (...args) => { errors.push(args); complete(); } } });
    const module = new SourceTextModule(source, { context, importModuleDynamically: async (specifier) => {
      assert.equal(specifier, "https://spmiddle.invalid/app-v1/app.js");
      const imported = new SyntheticModule(["mount"], function () {
        this.setExport("mount", (received) => {
          assert.equal(received, root);
          assert.deepEqual(margins(fake.host), ["-140px", "-220px"]);
          events.push("mount");
          if (fail) throw new Error("mount failed");
          return { dispose() { events.push("dispose"); } };
        });
      }, { context });
      await imported.link(() => {});
      await imported.evaluate();
      return imported;
    } });
    await module.link(() => {});
    await module.evaluate();
    await completed;
    if (fail) assert.match(errors[0][1], /mount failed/);
    else {
      assert.deepEqual(events, ["mount"]);
      cleanup[0]();
      assert.deepEqual(events, ["mount", "dispose"]);
    }
    assert.equal(fake.listeners.get("resize").size, 0);
    assert.equal(fake.observers[0].targets.size, 0);
    assert.deepEqual(margins(fake.host), ["", ""]);
  }
});

for (const { name, run } of tests) {
  await run();
  console.log(`ok - ${name}`);
}
console.log(`${tests.length} MSE layout tests passed (geometry doubles, no browser or tenant).`);
