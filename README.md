# Core by Valen Systems

**A spatial interface for your AI agents.**

Core is an open playground for builders: run it locally as a spatial interface
for your AI agents, improve the experience, and help shape the future of
software that feels less like a dashboard and more like a living workspace.

## Build With Us

Fork it. Modify it. Publish your improvements or don't. Contribute upstream
if you want to.

Interested builders and aspiring Valen Systems developers are welcome to
experiment, sharpen the interface, and open pull requests.

All issues in repo are directly correlated to actual production issues,
so the pathway is clear:

fix issues here in PRs - if they got merged here, they likely got merged 
to the private repo.

Once thats happened a few times, feel free to reach out to @willrob-valensdad
on any platforms if you are interested in access to the private/proprietary 
repositories and being a part of the overall growth of Core and of Valen Systems Inc 
as a whole.

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

### Live Agent Desk (local hook smoke test)

Scripted localhost harness for ValenGateway-shaped hooks and JSON card upserts — **not** production M2 or human approval. See [docs/live-agent-desk.md](docs/live-agent-desk.md).

```bash
npm run demo:gateway
```

Then open [http://localhost:9252/gateway-proof.html](http://localhost:9252/gateway-proof.html) and run the smoke test (requires the dev server).

## Start Contributing

Read [docs/public-boundary.md](docs/public-boundary.md), then use
[docs/module-buckets.md](docs/module-buckets.md) to find the smallest useful
owner for your change. Follow
[docs/runtime-call-order.md](docs/runtime-call-order.md) when you need the
larger runtime graph.

The authorable `ValenGateway` hook and wrapper SDK is the next milestone. The
current local bridge intentionally proves the extracted renderer loop first.

## License

Core is source-available under the
[PolyForm Noncommercial License 1.0.0](LICENSE).

You may use, modify, and share Core for permitted noncommercial purposes.
Do not sell a competing Core product from our source without a commercial
license from Valen Systems Inc.
