# Upstream Export Manifest

This public milestone is an extraction and sanitization pass, not a parallel
rewrite.

## Extracted With Light Sanitization

| Public Path | Private Upstream Owner |
| --- | --- |
| `runtime/src/render-card-panels` | `runtime/src/render-card-panels` |
| `runtime/src/render-center-sculpture` | `runtime/src/render-center-sculpture` |
| `runtime/src/render-three-assets` | `runtime/src/render-three-assets` |
| `runtime/src/show-boot-signal` | `runtime/src/show-boot-signal` |
| `runtime/src/load-runtime-assets` | `runtime/src/load-runtime-assets` |
| `runtime/src/animate-runtime-motion` | `runtime/src/animate-runtime-motion` |
| `runtime/src/fit-runtime-camera` | `runtime/src/fit-runtime-camera` |
| `runtime/src/read-runtime-inputs` | `runtime/src/read-runtime-inputs` |
| `runtime/scripts/runtime-bundler.mjs` | `runtime/scripts/runtime-bundler.mjs` |
| `runtime/contracts` | `runtime/contracts` |

## Sanitized Replacements

| Public Path | Replaces |
| --- | --- |
| `runtime/src/describe-runtime-scenes` | Private phase and scene manifests |
| `runtime/src/bind-local-workspace` | Private host actions and product gates |
| `runtime/src/call-valen-gateway` | Private runtime bridge |
| `runtime/scripts/local-valen-card-harness.mjs` | Existing local persisted card harness |
| `runtime/scripts/dev-server.mjs` | Existing dev server without hosted proxying |

## Deferred

The programmable `ValenGateway`, hook registry, wrapper registry, `bodyMapping`,
and optional hosted adapter belong to the second milestone.
