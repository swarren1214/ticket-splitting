# Split Ticket Prototype

Interactive prototype of the new ticket-splitting workflow for the countertop (15.6" Android, 1280×720 dp), the iMin Swift 1 Pro handheld (360×800 dp), and three landscape iPad sizes.

## Run / build / deploy

```bash
npm install
cp .env.example .env.local
# Set the two server-only access settings below before starting the server.
npm run dev            # local dev server
npm run build          # Vercel app assets in dist/
npm run build:single   # UNPROTECTED self-contained offline file
npm test               # access and reducer regressions (Node.js 22.6+)
```

### Shared-password access on Vercel

Import the project with **Root Directory `source`**, framework **Vite**, build command `npm run build`, and output directory `dist`. Deploy the project, not just the contents of `dist`: [vercel.json](./vercel.json) registers [proxy.ts](./proxy.ts) as Routing Middleware on **every request**, including application scripts and assets.

The middleware explicitly uses the Node.js runtime. Its relative imports use `.js` extensions because Vercel transpiles TypeScript to JavaScript without adding those extensions; extensionless imports fail at runtime in this ES module project. `npm test` includes a compiled-middleware smoke test, in addition to the password and split-engine tests.

Set these in Vercel **Settings → Environment Variables** for each environment you deploy (Production and Preview), then redeploy:

| Variable | Value |
|---|---|
| `PROTOTYPE_PASSWORD` | Your unique shared password, 12–256 characters |
| `PROTOTYPE_SESSION_SECRET` | A separate random signing secret, at least 32 characters; generate with `openssl rand -hex 32` |

Never prefix these variables with `VITE_`, commit real values, or put them in client-side code. For local `npm run dev` / `npm run preview`, put the same settings in the ignored `.env.local` file and restart the server after changing them. Missing or invalid settings return a 503 page rather than exposing the app.

Visitors see a password-only screen. Correct passwords create a signed, HttpOnly, SameSite=Lax cookie that expires after 24 hours (Secure and host-only on HTTPS). Changing either setting and redeploying invalidates existing sessions. **Lock prototype** in the web-app toolbar (outside the simulated device) clears the current browser's cookie. Exit full screen first to access the toolbar. Login preserves preview query parameters and URL fragments. No usernames or individual accounts are stored.

Before sharing publicly, configure a Vercel Firewall rate-limit rule covering **all POST requests** by client IP to limit password guessing. Use a strong password and disable public access to old, unprotected deployments. Anyone who knows the password can share it; downloaded content cannot be revoked remotely.

The password is checked on the server, not in React. The gate does **not** protect a downloaded `build:single` HTML file, files served directly from another static host, or copies of the old `site/` output. Do not distribute those artifacts when access control is required.

See [Vercel Routing Middleware](https://vercel.com/docs/routing-middleware) for the hosting integration.

## Views

| URL | Shows |
|---|---|
| `/` | Device frames with a device switch, scenario picker and Reset |
| `#mobile` / `#counter` | Opens in that device |
| `#mobile-full` / `#counter-full` (or `?device=mobile&full`) | Edge-to-edge, no frame — open this on the real hardware |
| `#ipad-12-9` | Landscape iPad 12.9": 1366 × 1024 logical pixels |
| `#ipad-10-2` | Landscape iPad 10.2": 1080 × 810 logical pixels |
| `#ipad-mini` | Landscape iPad mini 8.3": 1133 × 744 logical pixels |
| `?scenario=unsplit` | Start from one unsplit check instead of 3 tabs |

Phones open the handheld preview with the prototype controls visible. Use the **Device** dropdown to select any of the five previews; **Reset**, the scenario picker and **Full screen** remain accessible.

On phones, **Full screen** always uses the handheld/mobile layout, even when a countertop or iPad preview is selected or linked with `-full`. Exiting full screen restores the selected preview and device picker. The layout also responds to phone orientation changes.

The iPad previews also support `-full` hashes and `?device=<preview>&full`. On tablet-sized screens they use the countertop workflow with wider ticket columns, compact icon-only header actions on smaller tablets, and menus bounded to the actual screen width. Additional tabs remain horizontally scrollable.

### Full-screen iPad testing

Select an iPad preview, then click **Full screen** in the prototype toolbar. The device frame, device switcher and toolbar disappear; the prototype fills the actual viewport, respects safe-area insets, and keeps the current order, payments, selection and undo history. Tablet columns adapt to the available width rather than stretching a scaled device frame.

Use **Ticket actions → Exit full screen** to restore the previews. Escape also exits when no overlay or item selection is active. The URL includes `-full`, so reloading or sharing it keeps the selected full-screen layout.

The button also requests browser full screen where supported. If the browser does not support or allow it, full-window mode still works and shows a notice. To hide Safari's browser controls on iPad, use **Share → Add to Home Screen**, then launch that shortcut; Home Screen launches automatically use full-window mode. Use landscape orientation for the countertop-style iPad workflow.

## How it's built

- `src/store.ts` — the split engine: tabs, lines (an item or a fraction of one), cent-exact proration of ticket discount/service charge/fees and tax (largest-remainder, with a final balancing pass so an even split is truly even), undo/redo history, and every action. Pure and UI-free, so it can be lifted into the real app or unit-tested.
- `src/countertop/` and `src/mobile/` — the two layouts. `src/ui/overlays.tsx` — dialogs, side panels / bottom sheets and menus shared by both.
- Framer Motion for animation, dnd-kit for drag and drop (mouse drag and touch long-press).
- Lucide React for all icons, mapped through the shared `Icon` component in `src/ui/kit.tsx`, including animated checkbox checks and the payment loader.

## Behaviour rules implemented

- Select items → every other tab (and "new tab") becomes a tap target. Drag also works.
- Countertop/iPad: moved items appear immediately in their destination, without a shared cross-column animation that can hide them inside scrollable columns.
- Touch screens (including iPads): long-press an item, then drag it to another tab. Scrolling is blocked during the drag; a quick swipe without holding still scrolls normally.
- Tabs are always named Tab 1, Tab 2, etc., including seat-based splits. Removing a tab or moving it to another ticket renumbers survivors without changing their identities, colors or payments; new tabs continue the current sequence. Undo and redo restore the corresponding numbering.
- Mobile: Checkout sits inside the active tab card below its total. Even Split, Split by Seat and the up-arrow Send button are grouped in the bottom ticket-action bar. Send saves and sends the splits, matching countertop.
- Mobile: exiting tabs leave the rail's layout immediately, and layout animations account for horizontal scrolling so the Add tab button stays beside the last tab.
- Mobile: pagination indicators sit above the tab card. Swiping or choosing a tab slides the cards horizontally in the navigation direction, without fading their content.
- Mobile: the order menu's four split actions use a 2×2 grid.
- Mobile buttons use pill shapes, with circular icon-only buttons and rounded corners for stacked tab selectors and tall, stacked-icon action tiles. The full-width discount, service and fees row has square corners; countertop button shapes are unchanged.
- Network status stays visible in the countertop top bar and in a mobile strip above the app header (below the device's native status bar). A Lucide Network icon uses green for Online and red for Offline, following browser connectivity; it does not verify POS/server availability.
- Ticket actions stay in one drawer: customer, ticket info, adjustments, even split and confirmations are subpages. Back (or Escape) returns to the menu; Close dismisses the drawer.
- Undoable: moves, item splits, add/remove tab, even split, split by seat, cancel splits, item discounts, voids, ticket adjustment toggles.
- Not undoable (history clears): payments and move-to-new-ticket. Both confirm first or are explicit.
- Remove tab: empty → instant with Undo; one other tab → confirm; 2+ → pick destination (previous tab preselected).
- Move to new ticket: confirm, stay on screen, banner links to the new order; optional "open after moving".
- Paid tabs lock; re-splitting (by seat / evenly / cancel) is disabled once any tab is paid.
- Paying a tab snapshots its item details, prices, adjustments and tax. Later discounts and voids affect only unpaid shares. Repeated payment events do not change totals.
- Checkout spins the loader only while processing; the success checkmark uses a single gentle scale pulse, without rotation.
- Dialogs and panels contain keyboard focus and restore it on close. Opening a drawer and navigating its subpages do not scroll the underlying device screen. Global undo/redo shortcuts are suspended while an overlay is open.
