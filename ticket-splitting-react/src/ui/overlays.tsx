import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useIsPresent } from 'framer-motion';
import { allocate, fmt, fmtSigned, reduce, shareLabel, type TabView } from '../store';
import { AppCtx, Check, Dialog, Dot, Icon, Money, Panel, useApp, useEsc, useModalFocus } from './kit';

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function useTabHelpers() {
  const { s, v } = useApp();
  const open = v.tabs.filter(t => !t.paid);
  const others = (id: string) => open.filter(t => t.tab.id !== id);
  const selIn = (id: string) => s.selected.filter(l => s.core.lines.find(x => x.id === l)?.tabId === id);
  return { open, others, selIn };
}

/** Starts the remove-tab flow: empty tabs go immediately (with Undo), otherwise a confirm. */
export function useRemoveTab() {
  const { d, open, v } = useApp();
  return (tabId: string) => {
    const t = v.tabs.find(x => x.tab.id === tabId)!;
    if (!t.lines.length) d({ type: 'REMOVE_TAB', tabId });
    else open({ kind: 'remove', tabId });
  };
}

// ---------------- dialogs ----------------
function RemoveTab({ tabId }: { tabId: string }) {
  const { v, d, close } = useApp();
  const { others } = useTabHelpers();
  const t = v.tabs.find(x => x.tab.id === tabId)!;
  const opts = others(tabId);
  const idx = v.tabs.findIndex(x => x.tab.id === tabId);
  const prev = [...v.tabs.slice(0, idx)].reverse().find(x => !x.paid) ?? opts[0];
  const [dest, setDest] = useState(prev?.tab.id);
  const destName = v.tabs.find(x => x.tab.id === dest)?.tab.name;
  const go = () => { d({ type: 'REMOVE_TAB', tabId, dest }); close(); };
  return (
    <Dialog title={`Remove ${t.tab.name}?`} icon="trash" tone="red" onClose={close}
      actions={<><button className="btn" onClick={close}>Cancel</button><button className="btn danf grow" onClick={go}>{opts.length === 1 ? `Remove and move to ${destName}` : 'Remove tab'}</button></>}>
      {opts.length === 1 ? (
        <p className="dlg-p">{plural(t.lines.length, 'item')} ({fmt(t.b.items)}) will move to <b>{destName}</b>.</p>
      ) : (
        <>
          <p className="dlg-p">{t.tab.name} has {plural(t.lines.length, 'item')} ({fmt(t.b.items)}). Choose where {t.lines.length === 1 ? 'it goes' : 'they go'}.</p>
          <div className="opts" role="radiogroup" aria-label="Destination tab">
            {opts.map(o => (
              <label key={o.tab.id} className={'opt' + (dest === o.tab.id ? ' sel' : '')}>
                <input type="radio" name="dest" checked={dest === o.tab.id} onChange={() => setDest(o.tab.id)} />
                <Dot c={o.tab.color} />
                <span style={{ flex: 1 }}><span className="opt-t">{o.tab.name}{o.tab.id === prev?.tab.id && <span className="badge">Previous</span>}</span>
                  <span className="muted opt-s">{plural(o.lines.length, 'item')} · {fmt(o.b.total)}</span></span>
              </label>
            ))}
          </div>
        </>
      )}
      <div className="muted small" style={{ marginTop: 10 }}>You can undo this.</div>
    </Dialog>
  );
}

function NewTicket({ tabId }: { tabId: string }) {
  const { v, d, s, close, open } = useApp();
  const t = v.tabs.find(x => x.tab.id === tabId)!;
  const [jump, setJump] = useState(false);
  const go = () => { const n = s.nextTicket; d({ type: 'MOVE_TO_NEW_TICKET', tabId }); if (jump) open({ kind: 'viewTicket', number: n }); else close(); };
  return (
    <Dialog title={`Move ${t.tab.name} to a new ticket?`} icon="file" onClose={close} width={480}
      actions={<><button className="btn" onClick={close}>Cancel</button><button className="btn pri grow" onClick={go}>Move to new ticket</button></>}>
      <p className="dlg-p">{plural(t.lines.length, 'item')} ({fmt(t.b.total)}) will move to a new order, <b>#{s.nextTicket}</b>. This can’t be undone from the split screen.</p>
      <label className="inline-check"><Check on={jump} label="Open the new ticket after moving" onChange={() => setJump(!jump)} />Open the new ticket after moving</label>
    </Dialog>
  );
}

function CancelSplitsDetails() {
  const { v } = useApp();
  const n = v.tabs.length;
  const shared = [...new Set(v.tabs.flatMap(t => t.lines.filter(l => l.share).map(l => l.item.name)))];
  return (
    <>
      <p className="dlg-p">All {n} tabs merge back into one check for <b>{fmt(v.ticket.total)}</b>.{shared.length ? ` Shared items (${shared.join(', ')}) are recombined.` : ''}</p>
      <div className="muted small">You can undo this.</div>
    </>
  );
}

function CancelSplitsActions({ onCancel }: { onCancel: () => void }) {
  const { d, close } = useApp();
  return <><button className="btn grow" onClick={onCancel}>Keep splits</button><button className="btn danf grow" onClick={() => { d({ type: 'CANCEL_SPLITS' }); close(); }}>Cancel splits</button></>;
}

function CancelSplits() {
  const { close } = useApp();
  return (
    <Dialog title="Cancel all splits?" icon="x" tone="red" onClose={close} actions={<CancelSplitsActions onCancel={close} />}>
      <CancelSplitsDetails />
    </Dialog>
  );
}

function VoidItems({ itemIds }: { itemIds: string[] }) {
  const { s, d, close } = useApp();
  const [reason, setReason] = useState<string | null>(null);
  const names = itemIds.map(i => s.core.items[i].name);
  const shared = itemIds.some(i => s.core.lines.filter(l => l.itemId === i).length > 1);
  return (
    <Dialog title={`Void ${itemIds.length === 1 ? names[0] : plural(itemIds.length, 'item')}?`} icon="ban" tone="red" onClose={close}
      actions={<><button className="btn" onClick={close}>Cancel</button><button className="btn danf grow" disabled={!reason} onClick={() => { d({ type: 'VOID_ITEMS', itemIds }); close(); }}>Void</button></>}>
      <p className="dlg-p">{shared ? 'This voids unpaid shares, including those on other open tabs. Paid shares stay unchanged. ' : ''}Pick a reason.</p>
      <div className="chips">{['Customer changed mind', 'Kitchen error', 'Wrong item rung', 'Quality issue'].map(r =>
        <button key={r} className={'pill' + (reason === r ? ' on' : '')} aria-pressed={reason === r} onClick={() => setReason(r)}>{r}</button>)}</div>
    </Dialog>
  );
}

function VoidOrderDetails() {
  const { v } = useApp();
  return <p className="dlg-p">Every tab and item ({fmt(v.ticket.total)}) is voided. This can’t be undone and may need a manager.</p>;
}

function VoidOrderActions({ onCancel }: { onCancel: () => void }) {
  const { d, close } = useApp();
  return <><button className="btn grow" onClick={onCancel}>Keep order</button><button className="btn danf grow" onClick={() => { d({ type: 'VOID_ORDER' }); close(); }}>Void order</button></>;
}

function VoidOrder() {
  const { close } = useApp();
  return (
    <Dialog title="Void Order #184?" icon="ban" tone="red" onClose={close} actions={<VoidOrderActions onCancel={close} />}>
      <VoidOrderDetails />
    </Dialog>
  );
}

function VoidPayment({ tabId }: { tabId: string }) {
  const { v, d, close } = useApp();
  const t = v.tabs.find(t => t.tab.id === tabId);
  const payment = t?.tab.paid;
  if (!t || !payment) return (
    <Dialog title="Payment unavailable" icon="alert" tone="red" onClose={close}
      actions={<button className="btn grow" onClick={close}>Close</button>}>
      <p className="dlg-p">This tab no longer has a payment to void.</p>
    </Dialog>
  );
  return (
    <Dialog title={`Void payment for ${t.tab.name}?`} icon="ban" tone="red" onClose={close} width={480}
      actions={<><button className="btn" onClick={close}>Cancel</button><button className="btn danf grow"
        onClick={() => { d({ type: 'VOID_PAYMENT', tabId }); close(); }}>Void payment</button></>}>
      <p className="dlg-p">Void the <b>{fmt(payment.breakdown.total)} {payment.method.toLowerCase()}</b> payment?
        {' '}{t.tab.name} will reopen with its recorded items and item prices. Other paid tabs stay locked.</p>
      <p className="muted small">Ticket adjustments and tax are recalculated across unpaid tabs. This can’t be undone.</p>
      <p className="muted small">Prototype: no real payment is reversed.</p>
    </Dialog>
  );
}

// ---------------- panels ----------------
function TabPills({ ids, toggle, includeNew = true, newOn, toggleNew }: { ids: string[]; toggle: (id: string) => void; includeNew?: boolean; newOn?: boolean; toggleNew?: () => void }) {
  const { open } = useTabHelpers();
  return (
    <div className="chips">
      {open.map(t => {
        const on = ids.includes(t.tab.id);
        return <button key={t.tab.id} className={'pill' + (on ? ' on' : '')} aria-pressed={on} onClick={() => toggle(t.tab.id)}>
          <Dot c={t.tab.color} />{t.tab.name}{on && <Icon n="check" s={16} w={3} />}</button>;
      })}
      {includeNew && <button className={'pill' + (newOn ? ' on' : ' accent')} aria-pressed={!!newOn} onClick={toggleNew}><Icon n="plus" s={16} />New tab{newOn && <Icon n="check" s={16} w={3} />}</button>}
    </div>
  );
}

function SplitItems({ lineIds }: { lineIds: string[] }) {
  const { v, d, close, device } = useApp();
  const { open } = useTabHelpers();
  const lines = open.flatMap(t => t.lines).filter(l => lineIds.includes(l.id));
  const first = lines[0];
  const sources = [...new Set(lines.map(l => l.tabId))];
  const nextOpen = open.find(t => !sources.includes(t.tab.id))?.tab.id;
  const [ids, setIds] = useState<string[]>(sources.length > 1 || !nextOpen ? sources : [...sources, nextOpen]);
  const [withNew, setWithNew] = useState(sources.length < 2 && !nextOpen);
  const [mode, setMode] = useState<'even' | 'custom'>('even');
  const [shares, setShares] = useState<Record<string, number>>({});
  const targets = [...ids, ...(withNew ? ['new'] : [])];
  const sh = targets.map(t => (mode === 'even' ? 1 : shares[t] ?? 1));
  const S = sh.reduce((a, b) => a + b, 0);
  const amounts = targets.map(() => 0);
  lines.forEach(l => allocate(l.amount, sh).forEach((amount, k) => { amounts[k] += amount; }));
  const total = lines.reduce((sum, l) => sum + l.amount, 0);
  const colorOf = (id: string) => (id === 'new' ? '#8D95A1' : v.tabs.find(t => t.tab.id === id)!.tab.color);
  const nameOf = (id: string) => (id === 'new' ? 'New tab' : v.tabs.find(t => t.tab.id === id)!.tab.name);
  const toggle = (id: string) => setIds(x => (x.includes(id) ? x.filter(i => i !== id) : [...x, id]));
  const unavailable = !lines.length || lines.length !== new Set(lineIds).size;
  const ok = !unavailable && targets.length >= 2;
  return (
    <Panel title={lines.length === 1 && first ? (device === 'counter' ? 'Split item' : `Split ${first.item.name}`) : `Split ${plural(lines.length, 'item')}`} onClose={close} height={device === 'mobile' ? 600 : undefined}
      sub={lines.length === 1 && first
        ? <>{first.item.name} · {fmt(first.amount)}{first.share ? ` (${first.share} share)` : ''} · on {nameOf(first.tabId)}</>
        : <>{plural(lines.length, 'item')} · {fmt(total)} · {sources.length === 1 ? `on ${nameOf(sources[0])}` : `across ${plural(sources.length, 'tab')}`}</>}
      footer={<><button className="btn grow" onClick={close}>Cancel</button><button className="btn pri grow2" disabled={!ok} onClick={() => { d({ type: 'SPLIT_ITEMS', lineIds, tabIds: targets, shares: sh }); close(); }}>
        {ok ? `Split between ${targets.length} tabs` : 'Pick at least 2 tabs'}</button></>}>
      {unavailable && <div className="warn" role="alert"><Icon n="alert" s={16} />Some selected items are no longer available. Close and select unpaid items again.</div>}
      {lines.length > 1 && <>
        <div className="nt-list">{lines.map(l => <div key={l.id} className="kv nt-row">
          <span><b>{l.item.name}</b> {l.share && <span className="share-badge">{l.share}</span>}
            <span className="muted small" style={{ display: 'block' }}>Qty {l.item.quantity} · on {nameOf(l.tabId)}</span></span>
          <Money c={l.amount} />
        </div>)}</div>
        <p className="muted small">The same portions apply to every selected share. Unselected and paid shares stay unchanged.</p>
      </>}
      <div className="lbl">Split between</div>
      <TabPills ids={ids} toggle={toggle} newOn={withNew} toggleNew={() => setWithNew(!withNew)} />
      <div className="lbl" style={{ marginTop: 18 }}>Portions</div>
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={mode === 'even'} className={mode === 'even' ? 'on' : ''} onClick={() => setMode('even')}>Even</button>
        <button role="tab" aria-selected={mode === 'custom'} className={mode === 'custom' ? 'on' : ''} onClick={() => setMode('custom')}>Custom shares</button>
      </div>
      <div className="alloc-bar">
        {targets.map((t, k) => <div key={t} style={{ flexGrow: sh[k], background: colorOf(t) }} />)}
      </div>
      <div className="share-rows">
        {targets.map((t, k) => {
          const [n, dd] = reduce(sh[k], S);
          return (
            <div key={t} className="share-row">
              <Dot c={colorOf(t)} />
              <div style={{ flex: 1 }}><div className="opt-t">{nameOf(t)} <span className="share-badge">{shareLabel(n, dd) || '100%'}</span></div><div className="muted opt-s">{fmt(amounts[k])}</div></div>
              {mode === 'custom' && (
                <div className="stepper sm">
                  <button className="ib gh" aria-label={`Fewer shares for ${nameOf(t)}`} disabled={sh[k] <= 1} onClick={() => setShares({ ...shares, [t]: sh[k] - 1 })}><Icon n="minus" s={18} /></button>
                  <span>{sh[k]}</span>
                  <button className="ib gh" aria-label={`More shares for ${nameOf(t)}`} disabled={sh[k] >= 9} onClick={() => setShares({ ...shares, [t]: sh[k] + 1 })}><Icon n="plus" s={18} /></button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="muted small" style={{ marginTop: 12 }}>Preview amounts are estimates before ticket adjustments and tax; final cents are balanced per item. Item discounts carry over proportionally.</p>
    </Panel>
  );
}

function EvenSplitDetails({ n, setN }: { n: number; setN: (n: number) => void }) {
  const { v } = useApp();
  const each = allocate(v.ticket.total, Array(n).fill(1));
  return (
    <>
      <div className="lbl">How many ways?</div>
      <div className="stepper big">
        <button className="ib gh" aria-label="Fewer" disabled={n <= 2} onClick={() => setN(n - 1)}><Icon n="minus" s={22} /></button>
        <span><AnimatePresence mode="popLayout" initial={false}><motion.span key={n} initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -16, opacity: 0 }} style={{ display: 'inline-block' }}>{n}</motion.span></AnimatePresence>&nbsp;ways</span>
        <button className="ib gh" aria-label="More" disabled={n >= 12} onClick={() => setN(n + 1)}><Icon n="plus" s={22} /></button>
      </div>
      <div className="chips even-q">{[2, 3, 4, 5, 6].map(k => <button key={k} className={'pill' + (k === n ? ' on' : '')} aria-pressed={k === n} onClick={() => setN(k)}>{k}</button>)}</div>
      <div className="preview"><span>Each tab pays</span><b><Money c={each[0]} />{each[0] !== each[n - 1] && <span className="muted small"> (last {fmt(each[n - 1])})</span>}</b></div>
      <div className="mini-tabs">{Array.from({ length: n }).map((_, k) => <motion.span layout key={k} className="mini-tab" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} />)}</div>
      <p className="muted small">Every item is divided into {n} equal shares.</p>
      {v.tabs.length > 1 && <div className="warn"><Icon n="alert" s={16} />Replaces your current {v.tabs.length} tabs. You can undo this.</div>}
    </>
  );
}

function EvenSplitActions({ n, onCancel }: { n: number; onCancel: () => void }) {
  const { d, close } = useApp();
  return <><button className="btn grow" onClick={onCancel}>Cancel</button><button className="btn pri grow2" onClick={() => { d({ type: 'EVEN_SPLIT', n }); close(); }}>Split {n} ways</button></>;
}

function EvenSplit() {
  const { v, close } = useApp();
  const [n, setN] = useState(Math.max(2, v.tabs.length));
  return (
    <Panel title="Split evenly" sub={`Ticket total ${fmt(v.ticket.total)}`} onClose={close} height={520} footer={<EvenSplitActions n={n} onCancel={close} />}>
      <EvenSplitDetails n={n} setN={setN} />
    </Panel>
  );
}

function Discount({ itemIds }: { itemIds: string[] }) {
  const { s, v, d, close } = useApp();
  const selected = v.tabs.flatMap(t => t.lines).filter(l => s.selected.includes(l.id));
  const items = itemIds.map(id => selected.find(l => l.itemId === id)?.item ?? s.core.items[id]);
  const cur = items[0].discountPct ?? 0;
  const [pct, setPct] = useState(cur || 10);
  const names = items.map(i => i.name).join(', ');
  return (
    <Panel title="Discount items" sub={names} onClose={close} height={430}
      footer={<>{cur ? <button className="btn dan" onClick={() => { d({ type: 'DISCOUNT_ITEMS', itemIds, pct: 0 }); close(); }}>Remove</button> : <button className="btn grow" onClick={close}>Cancel</button>}
        <button className="btn pri grow2" onClick={() => { d({ type: 'DISCOUNT_ITEMS', itemIds, pct }); close(); }}>Apply {pct === 100 ? 'comp' : pct + '% off'}</button></>}>
      <div className="lbl">Amount</div>
      <div className="grid3">{[10, 15, 20, 25, 50, 100].map(p => <button key={p} className={'pill tile-pill' + (p === pct ? ' on' : '')} aria-pressed={p === pct} onClick={() => setPct(p)}>{p === 100 ? 'Comp' : p + '%'}</button>)}</div>
      <p className="muted small" style={{ marginTop: 14 }}>Applies to all unpaid shares of this item. Paid shares stay unchanged.</p>
    </Panel>
  );
}

function Pay({ tabId }: { tabId: string }) {
  const { v, d, close } = useApp();
  const t = v.tabs.find(x => x.tab.id === tabId)!;
  const [phase, setPhase] = useState<'pick' | 'processing' | 'done'>('pick');
  const [method, setMethod] = useState('');
  const [total] = useState(t.b.total);
  const processing = useRef(false);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);
  const go = (m: string) => {
    if (processing.current) return;
    processing.current = true;
    setMethod(m);
    setPhase('processing');
    timers.current = [
      window.setTimeout(() => setPhase('done'), 1100),
      window.setTimeout(() => { d({ type: 'PAY', tabId, method: m }); close(); }, 1900),
    ];
  };
  return (
    <Panel title={`Pay ${t.tab.name}`} sub={plural(t.lines.length, 'item')} onClose={phase === 'pick' ? close : () => {}} height={470}>
      <div className="pay-amt"><Dot c={t.tab.color} s={14} /><span>{fmt(total)}</span></div>
      <div className="pay-break muted small">Items {fmt(t.b.items)} · Adjustments {fmtSigned(t.b.disc + t.b.sc + t.b.fee)} · Tax {fmt(t.b.tax)}</div>
      <AnimatePresence mode="wait">
        {phase === 'pick' && (
          <motion.div key="pick" className="pay-methods" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <button className="btn pri big" onClick={() => go('Card')}><Icon n="card" />Card</button>
            <button className="btn big" onClick={() => go('Cash')}><Icon n="cash" />Cash</button>
            <p className="muted small" style={{ textAlign: 'center', margin: '4px 0 0' }}>Prototype: no real payment is taken.</p>
          </motion.div>
        )}
        {phase !== 'pick' && (
          <motion.div key="proc" className="pay-proc" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
            {phase === 'processing' ? <motion.div key="processing" className="spinner" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}><Icon n="loader" s={56} /></motion.div>
              : <motion.div key="paid" className="paid-check" initial={{ scale: 0.85 }} animate={{ scale: [0.85, 1.06, 1] }} transition={{ duration: 0.45, ease: 'easeOut' }}><Icon n="check" s={40} w={3} /></motion.div>}
            <div style={{ fontWeight: 600, marginTop: 14 }}>{phase === 'processing' ? `Processing ${method.toLowerCase()}…` : 'Paid'}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </Panel>
  );
}

function CustomerDetails() {
  return (
    <>
      <div className="cust"><div className="avatar">JL</div><div><div className="opt-t" style={{ fontSize: 18 }}>Jordan Lee</div><div className="muted">(801) 555‑0142 · jordan@example.com</div></div></div>
      <div className="kvs">{[['Visits', '14'], ['Last visit', 'Oct 28'], ['Loyalty', '1,240 pts'], ['Notes', 'Prefers booth seating']].map(([k, val]) => <div key={k} className="kv"><span className="muted">{k}</span><span>{val}</span></div>)}</div>
      <p className="muted small">Sample customer for the prototype.</p>
    </>
  );
}
function Customer() {
  const { close } = useApp();
  return <Panel title="Customer" onClose={close} height={420}><CustomerDetails /></Panel>;
}
function InfoDetails() {
  const { v } = useApp();
  return (
      <div className="kvs">{[['Order', '#184'], ['Table', '12'], ['Guests', '3'], ['Server', 'Dallas Joyce'], ['Opened', '9:02 AM'], ['Tabs', String(v.tabs.length)], ['Ticket total', fmt(v.ticket.total)]].map(([k, val]) =>
        <div key={k} className="kv"><span className="muted">{k}</span><span style={{ fontWeight: 600 }}>{val}</span></div>)}</div>
  );
}
function Info() {
  const { close } = useApp();
  return <Panel title="Ticket info" onClose={close} height={440}><InfoDetails /></Panel>;
}
function AdjustDetails() {
  const { s, d, v } = useApp();
  const row = (key: 'disc' | 'sc' | 'fee', label: string, sub: string, amt: number) => {
    const on = s.core.adjust[key] !== 0;
    return (
      <div className="adj-row">
        <div style={{ flex: 1 }}><div className="opt-t">{label}</div><div className="muted opt-s">{sub}</div></div>
        <span style={{ fontWeight: 600, marginRight: 12 }}>{on ? fmt(amt) : 'Off'}</span>
        <button role="switch" aria-checked={on} aria-label={label} className={'switch' + (on ? ' on' : '')} onClick={() => d({ type: 'SET_ADJ', key, on: !on })}><motion.span layout className="knob" transition={{ type: 'spring', stiffness: 700, damping: 35 }} /></button>
      </div>
    );
  };
  const paidAdj = v.tabs.some(t => t.paid);
  return (
    <>
      {row('disc', 'Happy hour discount', 'Ticket discount', v.ticket.disc)}
      {row('sc', 'Service charge', 'Large-party service charge', v.ticket.sc)}
      {row('fee', 'Fees', 'Card processing fee', v.ticket.fee)}
      {paidAdj && <p className="muted small" style={{ marginTop: 12 }}>Paid tabs keep the share they paid; toggles only change open tabs.</p>}
    </>
  );
}
function Adjust() {
  const { close } = useApp();
  return <Panel title="Discounts, service charges & fees" sub="Ticket level · prorated across tabs by item subtotal" onClose={close} height={470}><AdjustDetails /></Panel>;
}
function ViewTicket({ number }: { number: number }) {
  const { s, close } = useApp();
  const t = s.newTickets.find(x => x.number === number);
  if (!t) return null;
  return (
    <Panel title={`Order #${t.number}`} sub={`New ticket · from ${t.tabName} on #184`} onClose={close} height={560}
      footer={<button className="btn pri grow" onClick={close}><Icon n="back" />Back to Order #184</button>}>
      <div className="nt-list">{t.lines.map((l, k) => <div key={k} className="kv nt-row"><span><b>{l.name}</b> {l.share && <span className="share-badge">{l.share}</span>}<span className="muted small" style={{ display: 'block' }}>Qty {l.quantity} · {l.mod}</span></span><span style={{ fontWeight: 600 }}>{fmt(l.amount)}</span></div>)}</div>
      <div className="kvs">{[['Adjustments', fmtSigned(t.breakdown.disc + t.breakdown.sc + t.breakdown.fee)], ['Tax', fmt(t.breakdown.tax)]].map(([k, val]) => <div key={k} className="kv"><span className="muted">{k}</span><span>{val}</span></div>)}
        <div className="kv" style={{ fontWeight: 700, fontSize: 18 }}><span>Total</span><span>{fmt(t.breakdown.total)}</span></div></div>
    </Panel>
  );
}

// ---------------- menus ----------------
/** Tab actions. Countertop: anchored popover. Mobile: bottom sheet. */
function TabMenu({ tabId, anchor }: { tabId: string; anchor?: DOMRect }) {
  const { v, d, close, open, device, scale, frameRef, s } = useApp();
  const { others, selIn, open: openTabs } = useTabHelpers();
  const removeTab = useRemoveTab();
  const t = v.tabs.find(x => x.tab.id === tabId)!;
  const dests = others(tabId);
  const sel = selIn(tabId);
  const [expand, setExpand] = useState<'all' | 'sel' | null>(null);
  const empty = !t.lines.length;
  const moveAllDisabled = empty ? 'Tab is empty' : !dests.length ? 'No other tabs' : '';
  const moveSelDisabled = !sel.length ? 'Select items on this tab first' : '';
  const newTicketDisabled = empty ? 'Tab is empty' : openTabs.length < 2 ? 'Only tab on this ticket' : '';
  const removeDisabled = openTabs.length < 2 ? 'Can’t remove the only tab' : '';

  const destList = (kind: 'all' | 'sel') => (
    <motion.div className="dest-list" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
      {dests.map(o => <button key={o.tab.id} className="dest" onClick={() => { kind === 'all' ? d({ type: 'MOVE_ALL', from: tabId, to: o.tab.id }) : d({ type: 'MOVE', lineIds: sel, to: o.tab.id }); close(); }}>
        <Dot c={o.tab.color} />{o.tab.name}<span className="muted" style={{ marginLeft: 'auto', fontSize: 13 }}>{fmt(o.b.total)}</span></button>)}
      {kind === 'sel' && <button className="dest accent" onClick={() => { d({ type: 'MOVE', lineIds: sel, to: 'new' }); close(); }}><Icon n="plus" s={18} />New tab</button>}
    </motion.div>
  );
  const moveRow = (kind: 'all' | 'sel', label: string, dis: string) => {
    const n = kind === 'all' ? t.lines.length : sel.length;
    const single = dests.length === 1 && kind === 'all';
    const lbl = dis ? label : single ? `Move all ${n} items to ${dests[0].tab.name}` : kind === 'sel' && dests.length === 0 ? `Move ${n} selected to a new tab` : `${label} (${n})`;
    const act = () => {
      if (single) { d({ type: 'MOVE_ALL', from: tabId, to: dests[0].tab.id }); close(); }
      else if (kind === 'sel' && !dests.length) { d({ type: 'MOVE', lineIds: sel, to: 'new' }); close(); }
      else setExpand(expand === kind ? null : kind);
    };
    return (
      <>
        <button className="li" disabled={!!dis} onClick={act}><Icon n="arrow" /><span>{lbl}{dis && <span className="li-sub">{dis}</span>}</span>
          {!dis && !single && !(kind === 'sel' && !dests.length) && <motion.span animate={{ rotate: expand === kind ? 90 : 0 }} className="li-chev"><Icon n="right" s={18} /></motion.span>}</button>
        <AnimatePresence initial={false}>{expand === kind && destList(kind)}</AnimatePresence>
      </>
    );
  };
  const body = (
    <>
      {device === 'mobile' && !t.paid && (
        <button className="btn pri big" style={{ width: '100%', marginBottom: 8 }} disabled={empty} onClick={() => open({ kind: 'pay', tabId })}><Icon n="card" />Pay {t.tab.name} · {fmt(t.b.total)}</button>
      )}
      {moveRow('all', 'Move all items to…', moveAllDisabled)}
      {moveRow('sel', 'Move selected items to…', moveSelDisabled)}
      <button className="li" disabled={!!newTicketDisabled} onClick={() => open({ kind: 'newTicket', tabId })}><Icon n="file" /><span>Move to new ticket<span className="li-sub">{newTicketDisabled || 'Creates a new order · can’t be undone'}</span></span></button>
      <button className="li" disabled={empty} onClick={() => { d({ type: 'TOAST', text: `${t.tab.name} sent to printer` }); close(); }}><Icon n="print" /><span>Print tab</span></button>
      <button className="li red" disabled={!!removeDisabled} onClick={() => { close(); removeTab(tabId); }}><Icon n="trash" /><span>Remove tab{removeDisabled && <span className="li-sub">{removeDisabled}</span>}</span></button>
    </>
  );
  useEsc(close);
  if (device === 'mobile') return <Panel title={t.tab.name} sub={`${plural(t.lines.length, 'item')} · ${fmt(t.b.total)}`} onClose={close}>{body}</Panel>;

  // countertop popover, positioned relative to the scaled device frame
  const fr = frameRef.current!.getBoundingClientRect();
  const left = anchor ? Math.max(8, Math.min((anchor.left - fr.left) / scale - 8, frameRef.current!.clientWidth - 316)) : 8;
  const bottom = anchor ? (fr.bottom - anchor.top) / scale + 6 : 8;
  const maxHeight = anchor ? (anchor.top - fr.top) / scale - 14 : frameRef.current!.clientHeight - 16;
  return (
    <div className="layer">
      <div className="click-away" onClick={close} />
      <motion.div tabIndex={-1} role="menu" aria-label={`${t.tab.name} actions`} className="popover" style={{ left, bottom, maxHeight, overflowY: 'auto', transformOrigin: 'bottom left' }}
        initial={{ opacity: 0, scale: 0.95, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 500, damping: 34 }}>{body}</motion.div>
    </div>
  );
}

function TicketMenu() {
  const { close, d, v } = useApp();
  const [page, setPage] = useState<'menu' | 'customer' | 'info' | 'adjust' | 'even' | 'cancel' | 'voidOrder'>('menu');
  const [n, setN] = useState(Math.max(2, v.tabs.length));
  const anyPaid = v.tabs.some(t => t.paid);
  const back = () => setPage('menu');
  const titles = {
    menu: 'Order #184', customer: 'Customer', info: 'Ticket info', adjust: 'Discounts, service charges & fees',
    even: 'Split evenly', cancel: 'Cancel all splits?', voidOrder: 'Void Order #184?',
  };
  const sub = page === 'menu' ? `Table 12 · ${plural(v.tabs.length, 'tab')} · ${fmt(v.ticket.total)}`
    : page === 'even' ? `Ticket total ${fmt(v.ticket.total)}`
    : page === 'adjust' ? 'Ticket level · prorated across tabs by item subtotal' : undefined;
  const footer = page === 'even' ? <EvenSplitActions n={n} onCancel={back} />
    : page === 'cancel' ? <CancelSplitsActions onCancel={back} />
    : page === 'voidOrder' ? <VoidOrderActions onCancel={back} /> : undefined;
  return (
    <Panel title={titles[page]} sub={sub} onClose={close} onBack={page === 'menu' ? undefined : back} height={720} footer={footer}>
      {page === 'customer' && <CustomerDetails />}
      {page === 'info' && <InfoDetails />}
      {page === 'adjust' && <AdjustDetails />}
      {page === 'even' && <EvenSplitDetails n={n} setN={setN} />}
      {page === 'cancel' && <CancelSplitsDetails />}
      {page === 'voidOrder' && <VoidOrderDetails />}
      {page === 'menu' && <>
      <div className="lbl">Split</div>
      <div className="tiles">
        <button className="tile" onClick={() => { d({ type: 'ADD_TAB' }); close(); }}><Icon n="plus" s={22} />Add tab</button>
        <button className="tile" disabled={anyPaid} onClick={() => { d({ type: 'BY_SEAT' }); close(); }}><Icon n="seat" s={22} />By seat</button>
        <button className="tile" disabled={anyPaid} onClick={() => setPage('even')}><Icon n="even" s={22} />Evenly</button>
        <button className="tile red" disabled={anyPaid || v.tabs.length < 2} onClick={() => setPage('cancel')}><Icon n="x" s={22} />Cancel splits</button>
      </div>
      {anyPaid && <p className="muted small" style={{ margin: '-6px 0 12px' }}>Re-splitting is off once a tab is paid.</p>}
      <div className="lbl">Ticket</div>
      <button className="li" onClick={() => setPage('customer')}><Icon n="user" /><span>View customer</span></button>
      <button className="li" onClick={() => setPage('info')}><Icon n="info" /><span>Ticket info</span></button>
      <button className="li" onClick={() => setPage('adjust')}><Icon n="tag" /><span>Discounts</span></button>
      <button className="li" onClick={() => setPage('adjust')}><Icon n="pct" /><span>Service charges &amp; fees</span></button>
      <button className="li" onClick={() => { d({ type: 'TOAST', text: 'Ticket sent to printer' }); close(); }}><Icon n="print" /><span>Print ticket</span></button>
      <div style={{ height: 8 }} />
      <button className="li red" disabled={anyPaid} onClick={() => setPage('voidOrder')}><Icon n="ban" /><span>Void order{anyPaid && <span className="li-sub">A tab is already paid</span>}</span></button>
      </>}
    </Panel>
  );
}

/** While an overlay animates out, keep showing the state it had (the tab it points at may already be gone). */
function Freeze({ children }: { children: React.ReactNode }) {
  const ctx = useApp();
  const present = useIsPresent();
  const ref = useRef(ctx);
  if (present) ref.current = ctx;
  return <AppCtx.Provider value={ref.current}>{children}</AppCtx.Provider>;
}

export function OverlayHost() {
  const { overlay } = useApp();
  const o = overlay;
  const key = o ? o.kind + ('tabId' in o ? o.tabId : '') : null;
  const modalRef = useModalFocus(key);
  return (
    <div ref={modalRef}>
      <AnimatePresence>
        {o && (
          <motion.div key={key} data-overlay-key={key} className="overlay-root" exit={{ opacity: 1 }} transition={{ duration: 0.25 }}><Freeze>
            {o.kind === 'remove' && <RemoveTab tabId={o.tabId} />}
            {o.kind === 'newTicket' && <NewTicket tabId={o.tabId} />}
            {o.kind === 'cancel' && <CancelSplits />}
            {o.kind === 'even' && <EvenSplit />}
            {o.kind === 'split' && <SplitItems lineIds={o.lineIds} />}
            {o.kind === 'discount' && <Discount itemIds={o.itemIds} />}
            {o.kind === 'void' && <VoidItems itemIds={o.itemIds} />}
            {o.kind === 'voidOrder' && <VoidOrder />}
            {o.kind === 'pay' && <Pay tabId={o.tabId} />}
            {o.kind === 'voidPayment' && <VoidPayment tabId={o.tabId} />}
            {o.kind === 'customer' && <Customer />}
            {o.kind === 'info' && <Info />}
            {o.kind === 'adjust' && <Adjust />}
            {o.kind === 'ticketMenu' && <TicketMenu />}
            {o.kind === 'tabMenu' && <TabMenu tabId={o.tabId} anchor={o.anchor} />}
            {o.kind === 'viewTicket' && <ViewTicket number={o.number} />}
          </Freeze></motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
