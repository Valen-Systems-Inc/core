# Public Boundary

This repository exposes a playable local Core runtime so contributors can
improve the interface and its local work-object loop.

## Included

- Cinematic renderer and card-panel layers.
- Center sculpture, authored card assets, motion, camera, input, and audio.
- Persistent local JSON cards with create, read, keep, dismiss, recall,
  approve, status, and session-isolation proof.
- Local build tooling, contracts, fixtures, and browser smoke proof.

## Not Included

- Hosted backend implementation details.
- Production workspace identifiers, tokens, proxy wiring, or payment paths.
- Private product choreography and dashboard-adaptation logic.
- The future hosted adapter.

The public runtime uses `WorkspaceMode` and local fixtures. Its purpose is to
make visible interface work real and testable without publishing the business
layer behind Core.
