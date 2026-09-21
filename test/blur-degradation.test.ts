import assert from "node:assert/strict";
import { test } from "node:test";

// Minimal DOM/window stubs - the degradation logic only needs these shapes.
const listeners: Record<string, Array<(ev: unknown) => void>> = {};
let removed: Array<{ type: string; fn: (ev: unknown) => void }> = [];
const mutationObservers: Array<{
    target?: unknown;
    callback: () => void;
}> = [];
(globalThis as any).document = {
    addEventListener(type: string, fn: (ev: unknown) => void) {
        (listeners[type] ||= []).push(fn);
    },
    removeEventListener(type: string, fn: (ev: unknown) => void) {
        removed.push({ type, fn });
    },
};
(globalThis as any).window = { location: { href: "https://example.test/" } };
(globalThis as any).MutationObserver = class {
    private observer: (typeof mutationObservers)[number];
    constructor(callback: () => void) {
        this.observer = { callback };
        mutationObservers.push(this.observer);
    }
    observe(target: unknown) {
        this.observer.target = target;
    }
    disconnect() {
        this.observer.target = undefined;
    }
};

import { setupBlurThumbnailDegradation } from "../src/app-presentation";
import { Presentation } from "../src/presentation";
import { createPresentationRuntimeTeardown } from "../src/runtime-lifecycle";

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

class FakeClassList {
    values = new Set<string>();
    toggle(name: string, enabled?: boolean) {
        const next = enabled ?? !this.values.has(name);
        if (next) this.values.add(name);
        else this.values.delete(name);
        return next;
    }
    contains(name: string) {
        return this.values.has(name);
    }
}

function makeConfig(container: FakeContainer) {
    const focusHandlers: Array<(v: boolean) => void> = [];
    const boxHandlers: Record<string, Array<() => void>> = {};
    const calls = { pause: 0, resume: 0, suspendPreview: 0 };
    const disposeFns: Array<() => void> = [];
    const pageIndex = { value: 0 };
    const backgroundClasses = new FakeClassList();
    const boxClasses = new FakeClassList();
    const boxElement = { classList: boxClasses };
    const box = {
        focus: true,
        $box: boxElement,
        wrapClassName: (name: string) => `telebox-${name}`,
        events: {
            on: (type: string, fn: () => void) => {
                (boxHandlers[type] ||= []).push(fn);
            },
            off: (type: string, fn: () => void) => {
                boxHandlers[type] = (boxHandlers[type] || []).filter(
                    (item) => item !== fn,
                );
            },
        },
    };
    const config = {
        context: {
            emitter: {
                on: (_: string, fn: (v: boolean) => void) => {
                    focusHandlers.push(fn);
                    return () => {};
                },
            },
            getBox: () => box,
            getBoxStatus: () => undefined,
            getWindowManager: () => ({ lazySetupInMaximizedMode: true, boxState: "maximized" }),
        },
        view: { divElement: container as unknown as HTMLElement } as any,
        pages: [{ src: FULL, thumbnail: THUMB, width: 100, height: 100 }],
        pageIndex$: pageIndex,
        app: {
            whiteboardDOM: { classList: backgroundClasses },
            suspendPreviewResources: () => (calls.suspendPreview += 1),
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
        commitBlur: () => {
            box.focus = false;
            boxClasses.toggle("telebox-blur", true);
            mutationObservers
                .filter((observer) => observer.target === boxElement)
                .forEach((observer) => observer.callback());
        },
        commitFocus: () => {
            box.focus = true;
            boxClasses.toggle("telebox-blur", false);
            mutationObservers
                .filter((observer) => observer.target === boxElement)
                .forEach((observer) => observer.callback());
        },
        disposeAll: () => disposeFns.forEach((f) => f()),
        calls,
        pageIndex,
        backgroundClasses,
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
    assert.equal(
        container.img.src,
        FULL,
        "no re-degrade after thumbnail failure",
    );
    cfg.commitBlur();
    assert.equal(
        container.img.src,
        FULL,
        "box blur does not retry the failed thumbnail",
    );
    // focus still restores (no-op) and resumes preload
    cfg.focus();
    assert.equal(cfg.calls.resume, 1);
});

test("pages without a thumbnail suspend only after TeleBox commits blur", () => {
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
    assert.equal(
        container.img.src,
        FULL,
        "focus intent alone keeps the visible image",
    );
    assert.equal(
        cfg.backgroundClasses.contains("netless-app-presentation-background-suspended"),
        false,
        "view remains visible until the box is actually blurred",
    );

    cfg.commitBlur();
    assert.match(
        container.img.src,
        /^data:image\/gif;base64,/,
        "decoder source released",
    );
    assert.equal(
        cfg.backgroundClasses.contains("netless-app-presentation-background-suspended"),
        true,
        "only the SDK background layer is hidden",
    );
    assert.equal(cfg.calls.suspendPreview, 1, "loaded preview resources released");

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
    assert.equal(
        cfg.backgroundClasses.contains("netless-app-presentation-background-suspended"),
        false,
        "thumbnail background remains paintable",
    );

    cfg.focus();
    assert.equal(container.img.src, FULL, "focus restores the current full image");
});

test("query-only GIF thumbnail is suspended as the original animated resource", () => {
    listeners["load"] = [];
    listeners["error"] = [];
    const gif = "https://img.test/animated.gif";
    const container = new FakeContainer(gif);
    const cfg = makeConfig(container);
    (cfg.config.pages as any)[0] = {
        src: gif,
        thumbnail: `${gif}?x-oss-process=image/resize,l_50`,
        width: 100,
        height: 100,
    };
    setupBlurThumbnailDegradation(cfg.config as any);

    cfg.blur();
    assert.equal(
        container.img.src,
        gif,
        "the still-visible app keeps its GIF before box blur",
    );
    cfg.commitBlur();
    assert.match(container.img.src, /^data:image\/gif;base64,/);
    assert.equal(
        cfg.backgroundClasses.contains("netless-app-presentation-background-suspended"),
        true,
    );

    cfg.focus();
    assert.equal(container.img.src, gif);
});

test("preview suspension closes preview and clears loaded image attributes", () => {
    const removedAttributes: string[] = [];
    const attributes = new Set([
        "src",
        "srcset",
        "sizes",
        "data-src",
        "data-ll-status",
    ]);
    const img = {
        removeAttribute: (name: string) => {
            removedAttributes.push(name);
            attributes.delete(name);
        },
    };
    let closed = false;
    let destroyed = 0;
    const presentation = Object.create(Presentation.prototype) as Presentation;
    Object.assign(presentation, {
        togglePreview: (show: boolean) => {
            closed = show === false;
        },
        previewLazyload: { destroy: () => (destroyed += 1) },
        previewDOM: { querySelectorAll: () => [img] },
    });

    presentation.suspendPreviewResources();

    assert.equal(closed, true);
    assert.equal(destroyed, 1);
    assert.equal(presentation.previewLazyload, null);
    assert.deepEqual(removedAttributes, [
        "src",
        "srcset",
        "sizes",
        "data-ll-status",
    ]);
    assert.equal(attributes.has("data-src"), true, "lazy source remains available on reopen");
});

test("runtime teardown disposes and unmounts each Presentation mount once", () => {
    const calls: string[] = [];
    const teardown = createPresentationRuntimeTeardown(
        {
            unmountContent: () => calls.push("content"),
            unmountFooter: () => calls.push("footer"),
            unmountStyles: () => calls.push("styles"),
        },
        () => calls.push("dispose"),
    );

    teardown();
    teardown();

    assert.deepEqual(calls, ["dispose", "content", "footer", "styles"]);
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
