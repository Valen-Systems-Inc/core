# Public Docs

Use this map to find the smallest public Core doc for your task.

| Need | Read |
| --- | --- |
| Make your first safe change | [getting-started.md](getting-started.md) |
| Understand the public/private boundary | [public-boundary.md](public-boundary.md) |
| Find the runtime owner for a change | [module-buckets.md](module-buckets.md) |
| Understand the runtime call graph | [runtime-call-order.md](runtime-call-order.md) |
| See what was extracted or replaced | [upstream-export-manifest.md](upstream-export-manifest.md) |
| Open a good pull request | [../CONTRIBUTING.md](../CONTRIBUTING.md) |
| Check security limits | [../SECURITY.md](../SECURITY.md) |

## Public Onboarding Categories

These categories are for public contributors. They are not directory names, and
they are not the runtime module buckets.

| # | Category | What It Means |
| --- | --- | --- |
| `01` | Orientation | Understand Core as a local spatial interface for AI agents. |
| `02` | Local Development & Proof | Run the local renderer, card loop, bundle proof, and browser smoke test. |
| `03` | Runtime Architecture Safety | Use module buckets before editing runtime source. |
| `04` | Visual Runtime Contributions | Improve cards, motion, input, camera, assets, and layout locally. |
| `05` | Public Boundary | Keep private backend, production, payment, hosted proxy, and workspace details out. |
| `06` | Contribution Flow | Keep PRs narrow and include proof commands. |
| `07` | Governance | Respect the source-available license and security reporting path. |

Public contributors should be able to start locally without hosted access. If a
change needs a hosted Valen Systems service to be useful, it probably belongs in
a proposal first, not a runtime PR.
