# Public Module Buckets

The extracted runtime keeps its upstream source lanes readable, but public work
falls into nine contributor-friendly buckets.

| Bucket | Main Paths |
| --- | --- |
| Boot and state | `runtime/src/boot-runtime-app`, `runtime/src/own-runtime-state-and-dom` |
| Scene composition | `runtime/src/describe-runtime-scenes`, `runtime/src/choreograph-stage-state` |
| Motion and camera | `runtime/src/animate-runtime-motion`, `runtime/src/fit-runtime-camera`, `runtime/src/calculate-runtime-values` |
| Input | `runtime/src/read-runtime-inputs` |
| Card panels | `runtime/src/render-card-panels` |
| Three.js assets | `runtime/src/render-three-assets`, `runtime/src/load-runtime-assets` |
| Sculpture and effects | `runtime/src/render-center-sculpture`, `runtime/src/draw-runtime-effects`, `runtime/src/show-boot-signal` |
| Local workspace | `runtime/src/shape-runtime-cards`, `runtime/src/bind-local-workspace` |
| Local bridge | `runtime/src/call-valen-gateway`, `runtime/scripts/local-valen-card-harness.mjs` |
