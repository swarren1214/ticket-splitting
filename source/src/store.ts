// Split-ticket engine: pure state + reducer. UI never does money math itself.

// price is the ordered line total; quantity is the ordered count, not the tab's share.
export interface Item { id: string; name: string; mod: string; quantity: number; price: number; seat: number; discountPct?: number; voided?: boolean; elsewhere?: { ticket: number; num: number; den: number } }
export interface LinePricing { key: string; item: Item; num: number; den: number; amount: number; full: number }
export interface Line { id: string; itemId: string; tabId: string; num: number; den: number; pricing?: LinePricing }
export interface Breakdown { items: number; disc: number; sc: number; fee: number; sub: number; tax: number; total: number }
export interface Tab { id: string; name: string; color: string; paid?: { method: string; breakdown: Breakdown; lines: LineView[] } }
export interface Adjust { disc: number; sc: number; fee: number }
export interface Core { tabs: Tab[]; lines: Line[]; items: Record<string, Item>; adjust: Adjust; seq: number; tabSeq: number }
export interface NewTicket { number: number; tabName: string; color: string; lines: { name: string; mod: string; quantity: number; share: string; amount: number }[]; breakdown: Breakdown }
export interface Toast { id: number; text: string; undo?: boolean; tone?: 'ok' | 'info' }
export interface Banner { kind: 'newTicket'; ticket: number; text: string }

export interface State {
  core: Core; past: Core[]; future: Core[];
  selected: string[]; flash: string[]; flashKey: number;
  toast: Toast | null; banner: Banner | null;
  activeTab: string; newTickets: NewTicket[]; nextTicket: number;
  orderVoided: boolean; sent: boolean;
}

export const TAX_RATE = 0.08;
export const DEFAULT_ADJUST: Adjust = { disc: -400, sc: 500, fee: 200 };
export const COLORS = ['#EE7A12', '#C02BD8', '#0E9F9A', '#2F9E44', '#D9467C', '#2E7CF6', '#B88A00', '#8B5E3C', '#6D5BD0', '#D2452B'];

// ---------- money ----------
export const fmt = (c: number) => (c < 0 ? '−' : '') + '$' + (Math.abs(c) / 100).toFixed(2);
export const fmtSigned = (c: number) => (c >= 0 ? '+' : '−') + '$' + (Math.abs(c) / 100).toFixed(2);

/** Split an integer amount across weights so the parts always sum exactly (largest remainder). */
export function allocate(total: number, weights: number[], prio?: number[]): number[] {
  const W = weights.reduce((a, b) => a + b, 0);
  if (W <= 0 || total === 0) return weights.map(() => 0);
  const sign = total < 0 ? -1 : 1, T = Math.abs(total);
  const raw = weights.map(w => (T * w) / W);
  const base = raw.map(Math.floor);
  let rem = T - base.reduce((a, b) => a + b, 0);
  // ties go to the lowest `prio` first (e.g. the tab with the smallest running total) so leftover cents spread evenly
  const order = raw.map((r, i) => [Math.round((r - Math.floor(r)) * 1e6), i]).sort((a, b) => (b[0] - a[0]) || ((prio?.[a[1]] ?? a[1]) - (prio?.[b[1]] ?? b[1])) || a[1] - b[1]);
  for (let k = 0; k < order.length && rem > 0; k++, rem--) base[order[k][1]]++;
  return base.map(v => v * sign);
}

// ---------- fractions ----------
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
export function addFrac(a: [number, number], b: [number, number]): [number, number] {
  const n = a[0] * b[1] + b[0] * a[1], d = a[1] * b[1], g = gcd(n, d) || 1;
  return [n / g, d / g];
}
export function reduce(n: number, d: number): [number, number] { const g = gcd(n, d) || 1; return [n / g, d / g]; }
export function shareLabel(n: number, d: number): string {
  if (n === d) return '';
  const percent = n * 100 / d;
  if (percent > 0 && percent < 0.1) return '<0.1%';
  if (percent > 99.9 && percent < 100) return '>99.9%';
  return `${Math.round(percent * 10) / 10}%`;
}

// ---------- seed ----------
const ITEMS: Item[] = [
  { id: 'burger', name: 'Hamburger', mod: 'Small', quantity: 1, price: 1200, seat: 1 },
  { id: 'nuggets', name: 'Chicken Nuggets', mod: 'Small', quantity: 1, price: 800, seat: 1 },
  { id: 'wings', name: 'Hot Wings', mod: 'Small', quantity: 1, price: 1000, seat: 2 },
  { id: 'fries', name: 'Fries', mod: 'Large', quantity: 1, price: 500, seat: 2 },
  { id: 'tea', name: 'Iced Tea', mod: 'Unsweetened', quantity: 1, price: 300, seat: 3 },
  { id: 'lemonade', name: 'Lemonade', mod: 'Regular', quantity: 1, price: 350, seat: 3 },
];

export type Scenario = 'midSplit' | 'unsplit';
export function seed(s: Scenario): Core {
  const items = Object.fromEntries(ITEMS.map(i => [i.id, { ...i }]));
  if (s === 'unsplit') {
    return { items, adjust: { ...DEFAULT_ADJUST }, seq: 100, tabSeq: 1,
      tabs: [{ id: 't1', name: 'Tab 1', color: COLORS[0] }],
      lines: ITEMS.map((i, k) => ({ id: 'l' + k, itemId: i.id, tabId: 't1', num: 1, den: 1 })) };
  }
  return {
    items, adjust: { ...DEFAULT_ADJUST }, seq: 100, tabSeq: 3,
    tabs: [{ id: 't1', name: 'Tab 1', color: COLORS[0] }, { id: 't2', name: 'Tab 2', color: COLORS[1] }, { id: 't3', name: 'Tab 3', color: COLORS[2] }],
    lines: [
      { id: 'l1', itemId: 'burger', tabId: 't1', num: 1, den: 2 },
      { id: 'l2', itemId: 'nuggets', tabId: 't1', num: 1, den: 1 },
      { id: 'l3', itemId: 'wings', tabId: 't1', num: 1, den: 1 },
      { id: 'l4', itemId: 'burger', tabId: 't2', num: 1, den: 2 },
      { id: 'l5', itemId: 'fries', tabId: 't2', num: 1, den: 1 },
      { id: 'l6', itemId: 'tea', tabId: 't2', num: 1, den: 1 },
      { id: 'l7', itemId: 'lemonade', tabId: 't3', num: 1, den: 1 },
    ],
  };
}
export function initState(s: Scenario = 'midSplit'): State {
  const core = seed(s);
  return { core, past: [], future: [], selected: [], flash: [], flashKey: 0, toast: null, banner: null,
    activeTab: core.tabs[0].id, newTickets: [], nextTicket: 185, orderVoided: false, sent: false };
}

// ---------- derived ----------
export interface LineView extends Line { item: Item; amount: number; share: string; note: string; full: number }
export interface TabView { tab: Tab; lines: LineView[]; b: Breakdown; paid: boolean }

const itemFor = (core: Core, line: Line) => line.pricing?.item ?? core.items[line.itemId];
const priceKey = (line: Line) => line.pricing ? 'price:' + line.pricing.key : 'item:' + line.itemId;
// A reopened share keeps its recorded cents as the basis for subsequent moves and splits.
const valueFor = (core: Core, line: Line) => line.pricing
  ? line.pricing.amount * line.pricing.den / line.pricing.num
  : itemFor(core, line).price * (100 - (itemFor(core, line).discountPct ?? 0)) / 100;

export function derive(core: Core): { tabs: TabView[]; ticket: Breakdown } {
  const paidIds = new Set(core.tabs.filter(t => t.paid).map(t => t.id));
  const paidLines = new Set(core.tabs.flatMap(t => t.paid?.lines.map(l => l.id) ?? []));
  const live = core.lines.filter(l => paidIds.has(l.tabId) ? paidLines.has(l.id) : !itemFor(core, l).voided);
  // per-line amounts
  const amount: Record<string, number> = {};
  const byItem: Record<string, Line[]> = {};
  live.filter(l => !paidIds.has(l.tabId)).forEach(l => (byItem[priceKey(l)] ||= []).push(l));
  const running: Record<string, number> = {};
  for (const ls of Object.values(byItem)) {
    const eff = ls[0].pricing ? valueFor(core, ls[0]) : Math.round(valueFor(core, ls[0]));
    const share = ls.reduce((a, l) => a + l.num / l.den, 0);
    allocate(Math.round(eff * share), ls.map(l => l.num / l.den), ls.map(l => running[l.tabId] ?? 0))
      .forEach((v, k) => { amount[ls[k].id] = v; running[ls[k].tabId] = (running[ls[k].tabId] ?? 0) + v; });
  }
  const openTabs = core.tabs.filter(t => !t.paid);
  const itemsSub = openTabs.map(t => live.filter(l => l.tabId === t.id).reduce((a, l) => a + amount[l.id], 0));
  // each adjustment's leftover cent goes to the tab that is currently lowest (or highest, for discounts) so tabs stay balanced
  const run = [...itemsSub];
  const alloc = (total: number, w: number[]) => { const r = allocate(total, w, run.map(x => (total >= 0 ? x : -x))); r.forEach((v, i) => (run[i] += v)); return r; };
  const disc = alloc(core.adjust.disc, itemsSub), sc = alloc(core.adjust.sc, itemsSub), fee = alloc(core.adjust.fee, itemsSub);
  const taxable = itemsSub.map((v, i) => v + disc[i] + sc[i] + fee[i]);
  // tax is computed on the whole ticket (paid tabs included) so paying a tab never shifts the ticket total by a cent
  const paidTabs = core.tabs.filter(t => t.paid);
  const paidSub = paidTabs.reduce((a, t) => a + t.paid!.breakdown.sub, 0), paidTax = paidTabs.reduce((a, t) => a + t.paid!.breakdown.tax, 0);
  const tax = alloc(Math.round((taxable.reduce((a, b) => a + b, 0) + paidSub) * TAX_RATE) - paidTax, taxable.map(v => Math.max(0, v)));
  // Final balance pass: every adjustment and tax is proportional to item value, so each tab's fair total is
  // (open total × its exact, unrounded item share). Rounding drift (±1–2¢) is absorbed into that tab's tax line.
  const exact = openTabs.map(t => live.filter(l => l.tabId === t.id).reduce((a, l) => a + valueFor(core, l) * l.num / l.den, 0));
  const totals = taxable.map((v, i) => v + tax[i]);
  const target = allocate(totals.reduce((a, b) => a + b, 0), exact);
  const openB: Record<string, Breakdown> = {};
  openTabs.forEach((t, i) => {
    const tx = tax[i] + (target[i] - totals[i]);
    openB[t.id] = { items: itemsSub[i], disc: disc[i], sc: sc[i], fee: fee[i], sub: taxable[i], tax: tx, total: taxable[i] + tx };
  });

  const tabName = (id: string) => core.tabs.find(t => t.id === id)?.name ?? '';
  const noteFor = (l: Line, related: Line[]) => {
    const item = core.items[l.itemId];
    const others = related.filter(o => o.itemId === l.itemId && o.id !== l.id);
    let note = '';
    if (l.num !== l.den) {
      if (others.length === 1) note = `Other ${shareLabel(others[0].num, others[0].den)} on ${tabName(others[0].tabId)}`;
      else if (others.length > 1) note = `Shared with ${others.map(o => tabName(o.tabId)).join(', ')}`;
      else if (item.elsewhere) note = `Other ${shareLabel(item.elsewhere.num, item.elsewhere.den)} on #${item.elsewhere.ticket}`;
      if (others.length && item.elsewhere) note += ` · #${item.elsewhere.ticket}`;
    }
    return note;
  };
  const tabs = core.tabs.map(t => {
    if (t.paid) return { tab: t, lines: t.paid.lines.map(l => ({ ...l, note: noteFor(l, core.lines) })), paid: true, b: t.paid.breakdown };
    const lines: LineView[] = live.filter(l => l.tabId === t.id).map(l => {
      const item = itemFor(core, l);
      const full = l.pricing ? l.pricing.full * l.pricing.den / l.pricing.num : item.price;
      return { ...l, item, amount: amount[l.id], share: shareLabel(l.num, l.den), note: noteFor(l, live), full: Math.round(full * l.num / l.den) };
    });
    return { tab: t, lines, paid: false, b: openB[t.id] };
  });
  const sum = (k: keyof Breakdown) => tabs.reduce((a, t) => a + t.b[k], 0);
  return { tabs, ticket: { items: sum('items'), disc: sum('disc'), sc: sum('sc'), fee: sum('fee'), sub: sum('sub'), tax: sum('tax'), total: sum('total') } };
}

// ---------- helpers ----------
function clone(c: Core): Core { return JSON.parse(JSON.stringify(c)); }
function normalize(c: Core): Core {
  c.tabs.forEach((t, i) => { t.name = `Tab ${i + 1}`; });
  c.tabSeq = c.tabs.length;
  const out: Line[] = [];
  for (const l of c.lines) {
    const m = out.find(o => priceKey(o) === priceKey(l) && o.tabId === l.tabId);
    if (m) { const [n, d] = addFrac([m.num, m.den], [l.num, l.den]); m.num = n; m.den = d; }
    else out.push({ ...l });
  }
  c.lines = out;
  return c;
}
function itemShares(lines: Line[]): Line[] {
  const groups = new Map<string, Line>();
  for (const l of lines) {
    const key = priceKey(l), existing = groups.get(key);
    if (existing) [existing.num, existing.den] = addFrac([existing.num, existing.den], [l.num, l.den]);
    else groups.set(key, { ...l });
  }
  return [...groups.values()];
}
function newTab(c: Core): Tab {
  c.tabSeq = c.tabs.length + 1;
  const used = new Set(c.tabs.map(t => t.color));
  const color = COLORS.find(x => !used.has(x)) ?? COLORS[c.tabSeq % COLORS.length];
  const t = { id: 't' + ++c.seq, name: `Tab ${c.tabSeq}`, color };
  c.tabs.push(t);
  return t;
}
const nid = (c: Core) => 'l' + ++c.seq;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

// ---------- reducer ----------
export type Action =
  | { type: 'SELECT'; lineId: string } | { type: 'SELECT_TAB'; tabId: string } | { type: 'CLEAR_SEL' }
  | { type: 'MOVE'; lineIds: string[]; to: string | 'new' }
  | { type: 'MOVE_ALL'; from: string; to: string | 'new' }
  | { type: 'ADD_TAB' }
  | { type: 'REMOVE_TAB'; tabId: string; dest?: string }
  | { type: 'SPLIT_ITEMS'; lineIds: string[]; tabIds: (string | 'new')[]; shares: number[] }
  | { type: 'EVEN_SPLIT'; n: number } | { type: 'BY_SEAT' } | { type: 'CANCEL_SPLITS' }
  | { type: 'DISCOUNT_ITEMS'; itemIds: string[]; pct: number }
  | { type: 'VOID_ITEMS'; itemIds: string[] }
  | { type: 'SET_ADJ'; key: keyof Adjust; on: boolean }
  | { type: 'PAY'; tabId: string; method: string }
  | { type: 'VOID_PAYMENT'; tabId: string }
  | { type: 'MOVE_TO_NEW_TICKET'; tabId: string }
  | { type: 'VOID_ORDER' } | { type: 'SEND' }
  | { type: 'UNDO' } | { type: 'REDO' }
  | { type: 'RESET'; scenario: Scenario }
  | { type: 'SET_ACTIVE'; tabId: string }
  | { type: 'TOAST'; text: string; tone?: 'ok' | 'info' } | { type: 'DISMISS_TOAST' } | { type: 'DISMISS_BANNER' };

let toastId = 0;
const toast = (text: string, undo = true, tone: 'ok' | 'info' = 'ok'): Toast => ({ id: ++toastId, text, undo, tone });

function commit(s: State, core: Core, extra: Partial<State> = {}): State {
  core = normalize(core);
  const active = core.tabs.some(t => t.id === (extra.activeTab ?? s.activeTab)) ? (extra.activeTab ?? s.activeTab) : core.tabs[0]?.id;
  return { ...s, ...extra, core, past: [...s.past, s.core].slice(-50), future: [], selected: [], activeTab: active, sent: false };
}
/** Non-undoable change: history is cleared (payments, new tickets). */
function commitFinal(s: State, core: Core, extra: Partial<State> = {}): State {
  const r = commit(s, core, extra);
  return { ...r, past: [], future: [] };
}
function flashFor(core: Core, tabId: string, itemIds: string[]) {
  return normalize(clone(core)).lines.filter(l => l.tabId === tabId && itemIds.includes(l.itemId)).map(l => l.itemId + '@' + tabId);
}

export function reducer(s: State, a: Action): State {
  const c = clone(s.core);
  const tabById = (id: string) => c.tabs.find(t => t.id === id)!;
  switch (a.type) {
    case 'SELECT': {
      const l = s.core.lines.find(x => x.id === a.lineId);
      if (!l || s.core.tabs.find(t => t.id === l.tabId)?.paid) return s;
      const on = s.selected.includes(a.lineId);
      return { ...s, selected: on ? s.selected.filter(x => x !== a.lineId) : [...s.selected, a.lineId] };
    }
    case 'SELECT_TAB': {
      const ids = s.core.lines.filter(l => l.tabId === a.tabId && !itemFor(s.core, l).voided).map(l => l.id);
      const all = ids.length > 0 && ids.every(i => s.selected.includes(i));
      return { ...s, selected: all ? s.selected.filter(i => !ids.includes(i)) : [...new Set([...s.selected, ...ids])] };
    }
    case 'CLEAR_SEL': return { ...s, selected: [] };
    case 'SET_ACTIVE': return { ...s, activeTab: a.tabId };

    case 'MOVE': {
      const dest = a.to === 'new' ? newTab(c) : tabById(a.to);
      if (dest.paid) return s;
      const moving = c.lines.filter(l => a.lineIds.includes(l.id) && l.tabId !== dest.id);
      if (!moving.length) return { ...s, selected: [] };
      moving.forEach(l => (l.tabId = dest.id));
      const n = moving.length;
      return commit(s, c, { toast: toast(`Moved ${plural(n, 'item')} to ${dest.name}`), flash: flashFor(c, dest.id, moving.map(l => l.itemId)), flashKey: s.flashKey + 1 });
    }
    case 'MOVE_ALL': {
      const dest = a.to === 'new' ? newTab(c) : tabById(a.to);
      const moving = c.lines.filter(l => l.tabId === a.from && !itemFor(c, l).voided);
      moving.forEach(l => (l.tabId = dest.id));
      return commit(s, c, { toast: toast(`Moved ${plural(moving.length, 'item')} from ${tabById(a.from).name} to ${dest.name}`), flash: flashFor(c, dest.id, moving.map(l => l.itemId)), flashKey: s.flashKey + 1 });
    }
    case 'ADD_TAB': {
      const t = newTab(c);
      return commit(s, c, { activeTab: t.id, toast: toast(`${t.name} added`) });
    }
    case 'REMOVE_TAB': {
      const t = tabById(a.tabId);
      const lines = c.lines.filter(l => l.tabId === a.tabId);
      if (lines.length && a.dest) lines.forEach(l => (l.tabId = a.dest!));
      const idx = c.tabs.findIndex(x => x.id === a.tabId);
      c.tabs = c.tabs.filter(x => x.id !== a.tabId);
      normalize(c);
      let msg = `${t.name} removed`;
      if (lines.length && a.dest) msg += ` · ${plural(lines.length, 'item')} moved to ${tabById(a.dest).name}`;
      const nextActive = a.dest ?? c.tabs[Math.max(0, idx - 1)]?.id;
      return commit(s, c, { toast: toast(msg), activeTab: s.activeTab === a.tabId ? nextActive : s.activeTab,
        flash: a.dest ? flashFor(c, a.dest, lines.map(l => l.itemId)) : [], flashKey: s.flashKey + 1 });
    }
    case 'SPLIT_ITEMS': {
      const selected = new Set(a.lineIds);
      const lines = c.lines.filter(l => selected.has(l.id));
      if (!selected.size || lines.length !== selected.size || lines.some(l => itemFor(c, l).voided || tabById(l.tabId).paid)) {
        return { ...s, toast: toast('Select available unpaid items to split.', false, 'info') };
      }
      if (a.tabIds.length < 2 || new Set(a.tabIds).size !== a.tabIds.length || a.shares.length !== a.tabIds.length ||
        a.shares.some(share => !Number.isSafeInteger(share) || share <= 0) ||
        a.tabIds.some(id => id !== 'new' && !c.tabs.some(t => t.id === id && !t.paid))) {
        return { ...s, toast: toast('Choose at least two open tabs and positive whole-number shares.', false, 'info') };
      }
      const S = a.shares.reduce((x, y) => x + y, 0);
      const destIds = a.tabIds.map(id => (id === 'new' ? newTab(c).id : id));
      c.lines = c.lines.filter(l => !selected.has(l.id));
      lines.forEach(l => destIds.forEach((tid, k) => {
        const [n, d] = reduce(l.num * a.shares[k], l.den * S);
        c.lines.push({ ...l, id: nid(c), tabId: tid, num: n, den: d });
      }));
      const itemIds = [...new Set(lines.map(l => l.itemId))];
      const subject = lines.length === 1 ? itemFor(c, lines[0]).name : plural(lines.length, 'item');
      return commit(s, c, { toast: toast(`${subject} split between ${destIds.length} tabs`),
        flash: destIds.flatMap(t => itemIds.map(id => id + '@' + t)), flashKey: s.flashKey + 1 });
    }
    case 'EVEN_SPLIT': {
      const shares = itemShares(c.lines);
      c.tabs = []; c.tabSeq = 0; c.lines = [];
      const tabs = Array.from({ length: a.n }, () => newTab(c));
      shares.forEach(l => tabs.forEach(t => { const [n, d] = reduce(l.num, l.den * a.n); c.lines.push({ ...l, id: nid(c), tabId: t.id, num: n, den: d }); }));
      return commit(s, c, { activeTab: tabs[0].id, toast: toast(`Split evenly ${a.n} ways`) });
    }
    case 'BY_SEAT': {
      const shares = itemShares(c.lines);
      const seats = [...new Set(shares.map(l => itemFor(c, l).seat))].sort();
      c.tabs = []; c.tabSeq = 0; c.lines = [];
      const bySeat: Record<number, Tab> = {};
      seats.forEach(st => (bySeat[st] = newTab(c)));
      shares.forEach(l => c.lines.push({ ...l, id: nid(c), tabId: bySeat[itemFor(c, l).seat].id }));
      return commit(s, c, { activeTab: c.tabs[0].id, toast: toast(`Split by seat · ${plural(seats.length, 'tab')}`) });
    }
    case 'CANCEL_SPLITS': {
      const shares = itemShares(c.lines);
      c.tabs = []; c.tabSeq = 0; c.lines = [];
      const t = newTab(c);
      shares.forEach(l => c.lines.push({ ...l, id: nid(c), tabId: t.id }));
      return commit(s, c, { activeTab: t.id, toast: toast('Splits cancelled · back to one check') });
    }
    case 'DISCOUNT_ITEMS': {
      a.itemIds.forEach(id => (c.items[id].discountPct = a.pct || undefined));
      c.lines.forEach(l => {
        if (l.pricing && a.itemIds.includes(l.itemId) && !tabById(l.tabId).paid) {
          l.pricing.item.discountPct = a.pct || undefined;
          l.pricing.amount = Math.round(l.pricing.full * (100 - a.pct) / 100);
        }
      });
      return commit(s, c, { toast: toast(a.pct ? `${a.pct === 100 ? 'Comped' : a.pct + '% off'} · ${plural(a.itemIds.length, 'item')}` : 'Discount removed') });
    }
    case 'VOID_ITEMS': {
      a.itemIds.forEach(id => (c.items[id].voided = true));
      c.lines.forEach(l => { if (l.pricing && a.itemIds.includes(l.itemId) && !tabById(l.tabId).paid) l.pricing.item.voided = true; });
      return commit(s, c, { toast: toast(`Voided ${plural(a.itemIds.length, 'item')}`) });
    }
    case 'SET_ADJ': {
      c.adjust[a.key] = a.on ? DEFAULT_ADJUST[a.key] : 0;
      const name = { disc: 'Ticket discount', sc: 'Service charge', fee: 'Fees' }[a.key];
      return commit(s, c, { toast: toast(`${name} ${a.on ? 'applied' : 'removed'}`) });
    }
    case 'PAY': {
      const t = c.tabs.find(t => t.id === a.tabId);
      if (!t) return { ...s, toast: toast('This tab is no longer available for payment.', false, 'info') };
      if (t.paid) return s;
      const tv = derive(s.core).tabs.find(t => t.tab.id === a.tabId)!;
      t.paid = { method: a.method, breakdown: { ...tv.b }, lines: tv.lines.map(l => ({ ...l, item: { ...l.item } })) };
      c.adjust = { disc: c.adjust.disc - tv.b.disc, sc: c.adjust.sc - tv.b.sc, fee: c.adjust.fee - tv.b.fee };
      const nextOpen = c.tabs.find(x => !x.paid)?.id ?? a.tabId;
      return commitFinal(s, c, { toast: toast(`${t.name} paid · ${fmt(tv.b.total)} ${a.method}`, false), activeTab: s.activeTab === a.tabId ? nextOpen : s.activeTab });
    }
    case 'VOID_PAYMENT': {
      const t = c.tabs.find(t => t.id === a.tabId);
      if (!t?.paid) return { ...s, toast: toast('This tab no longer has a payment to void.', false, 'info') };
      const payment = t.paid;
      c.lines = c.lines.filter(l => l.tabId !== t.id);
      c.lines.push(...payment.lines.map(l => ({
        id: l.id, itemId: l.itemId, tabId: t.id, num: l.num, den: l.den,
        pricing: { key: l.id, item: { ...l.item }, amount: l.amount, full: l.full, num: l.num, den: l.den },
      })));
      c.adjust = { disc: c.adjust.disc + payment.breakdown.disc, sc: c.adjust.sc + payment.breakdown.sc, fee: c.adjust.fee + payment.breakdown.fee };
      delete t.paid;
      return commitFinal(s, c, { activeTab: t.id, flash: [], toast: toast(`${t.name} payment voided · reopened`, false) });
    }
    case 'MOVE_TO_NEW_TICKET': {
      const tv = derive(s.core).tabs.find(t => t.tab.id === a.tabId)!;
      const num = s.nextTicket;
      const moved = tv.lines;
      const movedShares = new Map<string, [number, number]>();
      moved.forEach(l => {
        movedShares.set(l.itemId, addFrac(movedShares.get(l.itemId) ?? [0, 1], [l.num, l.den]));
      });
      movedShares.forEach(([n, d], itemId) => {
        if (c.lines.some(l => l.itemId === itemId && l.tabId !== a.tabId)) c.items[itemId].elsewhere = { ticket: num, num: n, den: d };
      });
      c.lines = c.lines.filter(l => l.tabId !== a.tabId);
      const idx = c.tabs.findIndex(x => x.id === a.tabId);
      c.tabs = c.tabs.filter(x => x.id !== a.tabId);
      c.adjust = { disc: c.adjust.disc - tv.b.disc, sc: c.adjust.sc - tv.b.sc, fee: c.adjust.fee - tv.b.fee };
      const nt: NewTicket = { number: num, tabName: tv.tab.name, color: tv.tab.color, breakdown: tv.b,
        lines: tv.lines.map(l => ({ name: l.item.name, mod: l.item.mod, quantity: l.item.quantity, share: l.share, amount: l.amount })) };
      return commitFinal(s, c, { newTickets: [...s.newTickets, nt], nextTicket: num + 1, toast: null,
        banner: { kind: 'newTicket', ticket: num, text: `${tv.tab.name} moved to new Order #${num} · ${plural(tv.lines.length, 'item')} · ${fmt(tv.b.total)}` },
        activeTab: c.tabs[Math.max(0, idx - 1)]?.id ?? '' });
    }
    case 'VOID_ORDER': return { ...s, orderVoided: true, selected: [], toast: null };
    case 'SEND': return { ...s, sent: true, toast: toast('Splits saved and sent', false) };
    case 'UNDO': {
      if (!s.past.length) return s;
      const prev = s.past[s.past.length - 1];
      return { ...s, core: prev, past: s.past.slice(0, -1), future: [s.core, ...s.future], selected: [], toast: toast('Undone', false, 'info'),
        activeTab: prev.tabs.some(t => t.id === s.activeTab) ? s.activeTab : prev.tabs[0].id, flash: [] };
    }
    case 'REDO': {
      if (!s.future.length) return s;
      const nxt = s.future[0];
      return { ...s, core: nxt, past: [...s.past, s.core], future: s.future.slice(1), selected: [], toast: toast('Redone', false, 'info'),
        activeTab: nxt.tabs.some(t => t.id === s.activeTab) ? s.activeTab : nxt.tabs[0].id, flash: [] };
    }
    case 'RESET': return initState(a.scenario);
    case 'TOAST': return { ...s, toast: toast(a.text, false, a.tone ?? 'ok') };
    case 'DISMISS_TOAST': return { ...s, toast: null };
    case 'DISMISS_BANNER': return { ...s, banner: null };
  }
}
