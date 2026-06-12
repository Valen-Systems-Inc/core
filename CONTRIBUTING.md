# Contributing

Core is a local workshop for improving a spatial interface for AI agents.

## First Run

```bash
npm install --prefix runtime
npm run check
npm run setup:browser
npm run proof:browser
npm run dev
```

For a guided first change, read [docs/getting-started.md](docs/getting-started.md).

`npm run setup:browser` downloads the Chromium binary Playwright needs for
local browser proof. Run it once per machine before `npm run proof:browser`.

## Good First Contributions

- Improve responsive card layout and copy fit.
- Add screenshot and browser proof for card-panel profiles.
- Make motion, camera, and input behavior more measurable.
- Expand local fixtures without adding hosted dependencies.

Keep pull requests narrow. Include the local command you ran and the browser
proof that demonstrates the visible result.

## Pull Request Rule

Every PR should say:

- what changed
- which runtime module bucket owns it
- which proof command passed
- whether browser proof is needed
- why it stays inside the public boundary

Do not include production tokens, private workspace identifiers, hosted proxy
configuration, payment wiring, customer data, or private Valen Systems business
logic.
