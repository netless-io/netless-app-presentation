import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { createPresentationRuntimeTeardown } from "../src/runtime-lifecycle";
import { waitForCurrentPageImage } from "../src/setup-ready";
import { Preload, ELoadState } from "../src/preload";
import { Presentation } from "../src/presentation";

test("invalid thumbnail URL reports its error and preserves the original URL", () => {
  const errors: unknown[] = [];
  const viewer = { onThumbnailError: (error: unknown) => errors.push(error) } as Presentation;
  assert.equal(Presentation.prototype.thumbnail.call(viewer, "/relative.png"), "/relative.png");
  assert.equal(errors.length, 1);
  assert.ok(errors[0] instanceof Error);

  const brokenLogger = { onThumbnailError: () => { throw new Error("logger failed"); } } as Presentation;
  assert.equal(Presentation.prototype.thumbnail.call(brokenLogger, "/relative.png"), "/relative.png");
});

function timers(t: TestContext) {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  (globalThis as any).window = globalThis;
  t.after(() => { delete (globalThis as any).window; });
}

function image(src: string | null, complete = true, naturalWidth = 0) {
  return {
    complete, naturalWidth, currentSrc: src || "",
    getAttribute: (key: string) => key === "src" ? src : null,
  } as HTMLImageElement;
}

test("broken image releases setup without consuming the five-second timeout", async t => {
  timers(t);
  const result = waitForCurrentPageImage(() => image("https://test/missing.png"), 5000, () => false);
  let outcome: string | undefined;
  void result.then(value => { outcome = value; });
  t.mock.timers.tick(100);
  await Promise.resolve();
  assert.equal(outcome, "error");
});

test("unset image source is not mistaken for a load failure", async t => {
  timers(t);
  let img = image(null);
  let settled = false;
  const result = waitForCurrentPageImage(() => img, 5000, () => false);
  void result.then(() => { settled = true; });
  t.mock.timers.tick(100);
  await Promise.resolve();
  assert.equal(settled, false);
  img = image("https://test/loaded.png", true, 100);
  t.mock.timers.tick(100);
  assert.equal(await result, "loaded");
});

test("pending image can fail after the wait starts", async t => {
  timers(t);
  const img = image("https://test/missing.png", false);
  let reads = 0;
  const result = waitForCurrentPageImage(() => { reads++; return img; }, 5000, () => false);
  Object.assign(img, { complete: true });
  t.mock.timers.tick(100);
  t.mock.timers.tick(5000);
  assert.equal(await result, "error");
  assert.equal(reads, 2, "polling is cancelled after failure");
});

test("wait follows replacement image and stops polling after success", async t => {
  timers(t);
  let img: HTMLImageElement | null = null;
  let reads = 0;
  const result = waitForCurrentPageImage(() => { reads++; return img; }, 5000, () => false);
  img = image("https://test/page.png", false);
  t.mock.timers.tick(100);
  img = image("https://test/new-page.png", true, 100);
  t.mock.timers.tick(100);
  assert.equal(await result, "loaded");
  const before = reads;
  t.mock.timers.tick(5000);
  assert.equal(reads, before);
});

test("missing image has bounded wait; disposed app stops without further DOM reads", async t => {
  timers(t);
  const timeout = waitForCurrentPageImage(() => null, 5000, () => false);
  t.mock.timers.tick(5000);
  assert.equal(await timeout, "timeout");
  let disposed = false;
  let reads = 0;
  const result = waitForCurrentPageImage(() => { reads++; return null; }, 5000, () => disposed);
  disposed = true;
  t.mock.timers.tick(100);
  assert.equal(await result, "disposed");
  t.mock.timers.tick(5000);
  assert.equal(reads, 1);
});

test("strict lazy readiness warns once but never reports a timeout as ready", async t => {
  timers(t);
  let img = image("https://test/page.png", false);
  let warnings = 0;
  let settled = false;
  const result = waitForCurrentPageImage(() => img, 5000, () => false, {
    waitForReady: () => true, onTimeout: () => { warnings++; },
  });
  void result.then(() => { settled = true; });
  t.mock.timers.tick(15000); await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(warnings, 1);
  img = image("https://test/page.png", true, 100);
  t.mock.timers.tick(100);
  assert.equal(await result, "loaded");
});

test("strict lazy setup exits on disposal or when the host returns to eager", async t => {
  timers(t);
  let disposed = false;
  let strict = true;
  const options = { waitForReady: () => strict, onTimeout() {} };
  const first = waitForCurrentPageImage(() => null, 5000, () => disposed, options);
  t.mock.timers.tick(5000); disposed = true; t.mock.timers.tick(100);
  assert.equal(await first, "disposed");
  disposed = false;
  const second = waitForCurrentPageImage(() => null, 5000, () => disposed, options);
  t.mock.timers.tick(5000); strict = false; t.mock.timers.tick(100);
  assert.equal(await second, "timeout");
});

test("partial host cleanup API still disposes and unmounts supported mounts", () => {
  const calls: string[] = [];
  const teardown = createPresentationRuntimeTeardown(
    { unmountFooter: () => calls.push("footer") } as any,
    () => calls.push("dispose"),
  );
  teardown();
  teardown();
  assert.deepEqual(calls, ["dispose", "footer"]);
});

test("one failed unmount does not skip the remaining mounts", () => {
  const calls: string[] = [];
  const error = new Error("unmount failed");
  const teardown = createPresentationRuntimeTeardown({
    unmountContent() { calls.push("content"); throw error; },
    unmountFooter() { calls.push("footer"); },
    unmountStyles() { calls.push("styles"); },
  }, () => calls.push("dispose"));
  assert.throws(teardown, error);
  teardown();
  assert.deepEqual(calls, ["dispose", "content", "footer", "styles"]);
});

test("dispose failure still unmounts all host mounts", () => {
  const calls: string[] = [];
  const error = new Error("dispose failed");
  const teardown = createPresentationRuntimeTeardown({
    unmountContent() { calls.push("content"); },
    unmountFooter() { calls.push("footer"); },
    unmountStyles() { calls.push("styles"); },
  }, () => { throw error; });
  assert.throws(teardown, error);
  assert.deepEqual(calls, ["content", "footer", "styles"]);
});

class Link {
  dataset: Record<string, string> = {};
  rel = "";
  as = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  hrefWrites = 0;
  private url = "";
  get href() { return this.url; }
  set href(value: string) { this.hrefWrites++; this.url = value; }
}

function preloader(t: TestContext) {
  timers(t);
  const links = new Set<Link>();
  const created: Link[] = [];
  (globalThis as any).document = {
    createElement() { const link = new Link(); created.push(link); return link; },
    head: {
      appendChild: (link: Link) => links.add(link),
      contains: (link: Link) => links.has(link),
      removeChild: (link: Link) => links.delete(link),
    },
  };
  const preload = new Preload([0, 1].map(i => ({ src: `https://test/${i}.png`, width: 1, height: 1 })));
  t.after(() => {
    preload.dispose();
    delete (globalThis as any).document;
  });
  return { preload, links, created };
}

test("preload failure releases its slot without reassigning href or automatic retry", async t => {
  const { preload, links, created } = preloader(t);
  const failed = created[0];
  failed.onerror!();
  assert.equal(failed.hrefWrites, 1);
  assert.equal(links.has(failed), false);
  assert.equal(failed.onerror, null);
  assert.equal(preload.preloadMap.get(0)?.state, ELoadState.error);
  t.mock.timers.tick(100);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(created.filter(link => link.href === failed.href).length, 1);
  assert.equal(created.some(link => link.href.endsWith("1.png")), true, "other pages continue");
  preload.touch(0, true);
  assert.equal(created.filter(link => link.href === failed.href).length, 2, "explicit revisit retries");
});

test("pause detaches callbacks; stale completion cannot remove resumed preload", t => {
  const { preload, created } = preloader(t);
  const previous = created[0];
  const staleLoad = previous.onload!;
  const staleError = previous.onerror!;
  preload.pause();
  assert.equal(previous.onload, null);
  assert.equal(previous.onerror, null);
  preload.resume(0);
  const resumed = preload.loadingLinks.get(0)?.link;
  staleLoad();
  staleError();
  assert.equal(preload.loadingLinks.get(0)?.link, resumed);
  assert.equal(preload.preloadMap.get(0)?.state, ELoadState.unloaded);
});

test("successful preload releases its link and progresses to the next page", t => {
  const { preload, created, links } = preloader(t);
  const first = created[0];
  first.onload!();
  assert.equal(preload.preloadMap.get(0)?.state, ELoadState.loaded);
  assert.equal(first.onload, null);
  assert.equal(links.has(first), false);
  assert.equal(created[1].href, "https://test/1.png");
  created[1].onload!();
  preload.touch(0, true);
  assert.equal(created.length, 2, "loaded pages are not fetched again");
});

test("all failed preloads terminate even when idle work was already queued", async t => {
  const { preload, created, links } = preloader(t);
  created[0].onerror!();
  created[1].onerror!();
  for (let i = 0; i < 10; i++) {
    t.mock.timers.tick(100);
    await Promise.resolve();
    await Promise.resolve();
  }
  assert.equal(created.length, 2);
  assert.equal(links.size, 0);
  assert.equal(preload.loadingLinks.size, 0);
  assert.ok([...preload.preloadMap.values()].every(page => page.state === ELoadState.error));
});

test("dispose prevents queued work or resume from allocating new preloads", async t => {
  const { preload, created, links } = preloader(t);
  const first = created[0];
  const staleLoad = first.onload!;
  preload.dispose();
  assert.equal(first.onload, null);
  assert.equal(first.onerror, null);
  staleLoad();
  preload.resume(0);
  t.mock.timers.tick(100);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(links.size, 0);
  assert.equal(created.length, 1);
});
