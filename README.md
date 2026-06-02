# Core by Valen Systems

**A spatial interface for your AI agents.**

Core is an open playground for builders: run it locally as a spatial interface
for your AI agents, improve the experience, and help shape the future of
software that feels less like a dashboard and more like a living workspace.

## Build With Us

Fork it. Modify it. Publish your improvements. Contribute upstream.

Interested builders and aspiring Valen Systems developers are welcome to
experiment, sharpen the interface, and open pull requests.

## Run It Locally

```bash
npm install --prefix runtime
npm run check
npm run proof:browser
npm run dev
```

Open [http://localhost:9252](http://localhost:9252).

The first public milestone is an extracted cinematic workspace renderer backed
by a persistent local JSON card loop. It includes the authored card panels,
center sculpture, Three.js layers, camera fit, motion, input handling, asset
loading, bundler, contracts, fixtures, and browser smoke proof.

No hosted account, private token, or cloud access is required.

## Start Contributing

Start with [docs/getting-started.md](docs/getting-started.md). Then use
[docs/README.md](docs/README.md) to find the smallest public doc for your task.

For runtime work, use [docs/module-buckets.md](docs/module-buckets.md) to find
the smallest useful owner for your change. Follow
[docs/runtime-call-order.md](docs/runtime-call-order.md) when you need the
larger runtime graph. Read [docs/public-boundary.md](docs/public-boundary.md)
before proposing anything that touches hosted behavior.

The authorable `ValenGateway` hook and wrapper SDK is the next milestone. The
current local bridge intentionally proves the extracted renderer loop first.

## License

Core is source-available under the
[PolyForm Noncommercial License 1.0.0](LICENSE).

You may use, modify, and share Core for permitted noncommercial purposes.
Do not sell a competing Core product from our source without a commercial
license from Valen Systems Inc.
