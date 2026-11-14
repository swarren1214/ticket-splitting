# Ticket splitting - standalone React prototype

The ticket-splitting prototype only: no login, password gate, lock controls,
device selector, preview frames, or external prototype toolbar.

## Run

Use Node.js 22.18 or newer and npm. From this extracted project directory:

```sh
npm ci
npm run dev
```

Open the URL Vite prints. The handheld layout is selected automatically below
600px wide, or on a short touch-screen viewport. Larger windows use the responsive
countertop/tablet layout. Resizing preserves ticket state.

```sh
npm test
npm run build
npm run preview
```

The production build is written to `dist/` and can be served by a static web host.
There is intentionally no access control in this version.

## Included behavior

- Item selection, touch/mouse dragging, tab moves and horizontal handheld swiping.
- Even, seat-based and advanced multi-item splitting, including custom weights.
- Ordered quantities and percentage share badges.
- Undo/Redo, item discounts and voids, and ticket adjustments.
- Simulated payments and confirmed payment voiding with recorded prices preserved.
- Tab removal and moves to new tickets.

Payments, printing, sending and customer information are simulations. No payment
processor, backend or persistent storage is included. Refreshing resets the demo.
Completed or voided orders retain the prototype's Start over action.

## Code

- `src/App.tsx`: responsive app entry point and shared state.
- `src/store.ts`: ticket reducer and integer-cent accounting.
- `src/mobile/` and `src/countertop/`: POS layouts.
- `src/ui/`: shared controls, dialogs, drawers and drag-and-drop support.
- `tests/store.test.mjs`: financial and ticket-operation regression tests.

Dependencies are declared in `package.json` and pinned in `package-lock.json`.
The archive excludes dependencies, generated builds, credentials and deployment
middleware.
