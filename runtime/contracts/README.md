# Runtime Contracts

These files give developers a typed map for the card loop without splitting
`runtime.js` yet.

They are documentation and test-contract helpers, not a new runtime layer.

Files:

- `core-runtime-contracts.d.ts`: TypeScript types for cards, hook payloads,
  runtime status, and `window.ValenWorkspace`.
- `card-loop.schema.json`: JSON Schema for the local proof/readback shape.
- `card.schema.json`: reusable card shape.
- `get-cards.response.schema.json`: `get-cards` readback shape.
- `process-card-action.request.schema.json`: card action request shape.
- `process-card-action.response.schema.json`: card action result shape.
- `runtime-status.schema.json`: `get-runtime-status` truth/status shape.
- `workspace-capability.schema.json`: hidden capability catalog row shape.

The big runtime file still owns behavior. These contracts exist so hook work,
fixtures, and future refactors have names that match the product spine.

Run:

```bash
npm run check:contracts
```

That validates schemas and the local proof fixtures. It does not prove live
hosted backend hook behavior.
