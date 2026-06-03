# Getting Started

Use this tutorial for your first safe public Core change.

## 1. Understand Core

Core is a local spatial interface for AI agents. It renders work objects as
cards, keeps the important work in foreground, and lets users keep useful
objects nearby in orbit. This public repo proves the local renderer and card
loop without exposing the private hosted business layer.

Do not turn Core into a normal SaaS dashboard. The dashboard vocabulary becomes
cards and work objects inside the runtime.

## 2. Run The Local Proof

From the repo root:

```bash
npm install --prefix runtime
npm run check
```

That proves:

```text
runtime build
-> dist/source sync
-> contract fixtures
-> local card helpers
-> local card loop
-> comment-preserving bundle proof
-> sensitive-value scan
```

For browser proof:

```bash
npm run setup:browser
npm run proof:browser
```

`npm run setup:browser` is a one-time Chromium download for Playwright. Run it
before the first browser proof on a new machine.

For the local dev server:

```bash
npm run dev
```

Open [http://localhost:9252](http://localhost:9252).

## 3. Make One Safe Runtime-Local Change

For a first experiment, change one public copy string in:

```text
runtime/src/describe-runtime-scenes/define-runtime-object-states.js
```

This teaches the source lane without crossing the public/private boundary.

Do not change:

- production or hosted service assumptions
- private workspace identifiers
- payment, domain, email, ad, or customer-data behavior
- generated `runtime/dist/runtime.js` by hand
- the license or public boundary in the same PR as a runtime edit

For other runtime work, use
[module-buckets.md](module-buckets.md) to find the smallest owner.

## 4. Build And Prove Again

```bash
npm --prefix runtime run build
npm --prefix runtime run check:dist
npm --prefix runtime run proof:card-loop
```

For visual, motion, input, camera, panel, or asset changes, also run:

```bash
npm run proof:browser
```

## 5. Open A Narrow PR

Use [CONTRIBUTING.md](../CONTRIBUTING.md) and include:

- what changed
- which module bucket owns it
- which commands passed
- what visible behavior changed
- anything you intentionally did not prove

If the change needs private hosted infrastructure to make sense, open an issue
or proposal first. Public Core should stay useful locally.
