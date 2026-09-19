import assert from "node:assert/strict";
import { test } from "node:test";

// Minimal DOM/window stubs - the degradation logic only needs these shapes.
const listeners: Record<string, Array<(ev: unknown) => void>> = {};
let removed: Array<{ type: string; fn: (ev: unknown) => void }> = [];
(globalThis as any).document = {
    addEventListener(type: string, fn: (ev: unknown) => void) {
        (listeners[type] ||= []).push(fn);
    },
    removeEventListener(type: string, fn: (ev: unknown) => void) {
        removed.push({ type, fn });
    },
};
(globalThis as any).window = { location: { href: "https://example.test/" } };

import { setupBlurThumbnailDegradation } from "../src/app-presentation";

const FULL = "https://img.test/full.png";
const THUMB = "https://img.test/full.png?x-oss-process=image/resize,l_20";

type FakeImg = { src: string; tagName: string; matches: (s: string) => boolean };
const makeImg = (src: string): FakeImg => ({
    src,
    tagName: "IMG",
    matches: (s: string) => s === 'img[alt="background"]',
});

/** A fake view container whose background img can be swapped (rebind). */
class FakeContainer {
    img: FakeImg;
    constructor(src: string) {
        this.img = makeImg(src);
    }
    contains(target: unknown) {
        return target === this.img;
    }
    querySelector(sel: string) {
        return sel === 'img[alt="background"]' ? this.img : null;
    }
}

function makeConfig(container: FakeContainer) {
    const focusHandlers: Array<(v: boolean) => void> = [];
    const calls = { pause: 0, resume: 0 };
    const disposeFns: Array<() => void> = [];
    const pageIndex = { value: 0 };
    const config = {
        context: {
            emitter: {
                on: (_: string, fn: (v: boolean) => void) => {
                    focusHandlers.push(fn);
                    return () => {};
                },
            },
            getBoxStatus: () => undefined,
            getWindowManager: () => ({ lazySetupInMaximizedMode: true, boxState: "maximized" }),
        },
        view: { divElement: container as unknown as HTMLElement } as any,
        pages: [{ src: FULL, thumbnail: THUMB, width: 100, height: 100 }],
        pageIndex$: pageIndex,
        app: {
            preload: {
                pause: () => (calls.pause += 1),
                resume: (_: number) => (calls.resume += 1),
            },
        } as any,
        dispose: { add: (fn: () => void) => disposeFns.push(fn) } as any,
    };
    return {
        config,
        blur: () => focusHandlers.forEach((f) => f(false)),
        focus: () => focusHandlers.forEach((f) => f(true)),
        disposeAll: () => disposeFns.forEach((f) => f()),
        calls,
        pageIndex,
    };
}

const fireLoad = (target: unknown) => listeners["load"].forEach((fn) => fn({ target }));
const fireError = (target: unknown) => listeners["error"].forEach((fn) => fn({ target }));

test("degrades on blur and restores on focus", () => {
    listeners["load"] = [];
    listeners["error"] = [];
    const container = new FakeContainer(FULL);
    const cfg = makeConfig(container);
    setupBlurThumbnailDegradation(cfg.config as any);

    cfg.blur();
    assert.equal(container.img.src, THUMB, "blur swaps to thumbnail");
    assert.equal(cfg.calls.pause, 1, "preload paused on blur");

    cfg.focus();
    assert.equal(container.img.src, FULL, "focus restores full image");
    assert.equal(cfg.calls.resume, 1, "preload resumed on focus");
});

test("re-degrades after view rebind (document-level listener follows new container)", () => {
    listeners["load"] = [];
    listeners["error"] = [];
    const containerA = new FakeContainer(FULL);
    const cfg = makeConfig(containerA);
    setupBlurThumbnailDegradation(cfg.config as any);

    cfg.blur();
    assert.equal(containerA.img.src, THUMB);

    // rebind: WM replaces the view container; the new container re-renders
    // the FULL image and the document-level listener must still own it.
    const containerB = new FakeContainer(FULL);
    (cfg.config.view as { divElement: HTMLElement }).divElement =
        containerB as unknown as HTMLElement;
    fireLoad(containerB.img);
    assert.equal(containerB.img.src, THUMB, "rebound container re-degraded");

    // foreign imgs (other apps) are ignored
    const foreign = makeImg("https://other.test/full.png");
    fireLoad(foreign);
    assert.equal(foreign.src, "https://other.test/full.png");
});

test("thumbnail load failure pins the episode: no retry storm, focus still restores", () => {
    listeners["load"] = [];
    listeners["error"] = [];
    const container = new FakeContainer(FULL);
    const cfg = makeConfig(container);
    setupBlurThumbnailDegradation(cfg.config as any);

    cfg.blur();
    assert.equal(container.img.src, THUMB);
    // thumbnail fails to load -> episode pinned
    fireError(container.img);
    // the SDK retry settles on the full image
    container.img.src = FULL;
    fireLoad(container.img);
    // the pinned episode must NOT re-degrade over the retried full image
    assert.equal(container.img.src, FULL, "no re-degrade after thumbnail failure");
    // focus still restores (no-op) and resumes preload
    cfg.focus();
    assert.equal(cfg.calls.resume, 1);
});

test("pages without a thumbnail keep the full image and later pages still degrade", () => {
    listeners["load"] = [];
    listeners["error"] = [];
    const container = new FakeContainer(FULL);
    const cfg = makeConfig(container);
    (cfg.config.pages as any).length = 0;
    (cfg.config.pages as any).push(
        { src: FULL, width: 100, height: 100 }, // no thumbnail
    );
    setupBlurThumbnailDegradation(cfg.config as any);

    cfg.blur();
    assert.equal(container.img.src, FULL, "no thumbnail: full image kept");

    // a later page WITH a thumbnail still degrades (blurEpisode survives)
    (cfg.config.pages as any).push({
        src: FULL,
        thumbnail: THUMB,
        width: 100,
        height: 100,
    });
    cfg.pageIndex.value = 1;
    fireLoad(container.img);
    assert.equal(container.img.src, THUMB, "subsequent thumbnail page degraded");
});

test("dispose removes document listeners", () => {
    listeners["load"] = [];
    listeners["error"] = [];
    removed = [];
    const before = removed.length;
    const container = new FakeContainer(FULL);
    const cfg = makeConfig(container);
    setupBlurThumbnailDegradation(cfg.config as any);
    cfg.disposeAll();
    assert.equal(removed.length - before, 2, "load+error listeners removed");
});
