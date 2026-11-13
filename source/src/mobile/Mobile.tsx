import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { fmt, fmtSigned, type LineView, type TabView } from '../store';
import { Check, Dot, Icon, ItemDetails, Money, NetworkStatus, ToastHost, useApp } from '../ui/kit';
import { SplitDnd, useDragging } from '../ui/dnd';
import { useTabHelpers } from '../ui/overlays';
import { Banner } from '../countertop/Countertop';

const spring = { type: 'spring' as const, stiffness: 420, damping: 36 };

function Header() {
  const { s, d, open, v } = useApp();
  return (
    <header className="m-head">
      <button className="ib gh" aria-label="Back" onClick={() => d({ type: 'TOAST', text: 'Back to order (outside this prototype)', tone: 'info' })}><Icon n="back" s={22} /></button>
      <div className="m-title-wrap">
        <div className="m-title">Split order</div>
        <div className="muted m-sub">#184 · {v.tabs.length} tab{v.tabs.length === 1 ? '' : 's'} · <Money c={v.ticket.total} /></div>
      </div>
      <button className="ib gh" aria-label="Undo" disabled={!s.past.length} onClick={() => d({ type: 'UNDO' })}><Icon n="undo" /></button>
      <button className="ib gh" aria-label="Redo" disabled={!s.future.length} onClick={() => d({ type: 'REDO' })}><Icon n="redo" /></button>
      <button className="ib gh" aria-label="Ticket actions" onClick={() => open({ kind: 'ticketMenu' })}><Icon n="more" s={22} /></button>
    </header>
  );
}

const Chip = React.forwardRef<HTMLButtonElement, { t: TabView }>(function Chip({ t }, forwardedRef) {
  const { s, d } = useApp();
  const drag = useDragging();
  const { setNodeRef, isOver } = useDroppable({ id: 'tab:' + t.tab.id, disabled: t.paid });
  const ref = useRef<HTMLButtonElement | null>(null);
  const active = s.activeTab === t.tab.id;
  const moving = drag ? drag.ids : s.selected;
  const target = !t.paid && moving.length > 0 && moving.some(id => s.core.lines.find(l => l.id === id)?.tabId !== t.tab.id);
  const [bump, setBump] = useState(0);
  const prevTotal = useRef(t.b.total);
  useEffect(() => { if (t.b.total !== prevTotal.current && prevTotal.current !== undefined) setBump(b => b + 1); prevTotal.current = t.b.total; }, [t.b.total]);
  useEffect(() => { if (active) ref.current?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' }); }, [active]);
  const onTap = () => {
    if (target && !drag && s.selected.length) d({ type: 'MOVE', lineIds: s.selected, to: t.tab.id });
    else if (!s.selected.length) d({ type: 'SET_ACTIVE', tabId: t.tab.id });
  };
  return (
    <motion.button layout ref={el => {
      ref.current = el;
      setNodeRef(el);
      if (typeof forwardedRef === 'function') forwardedRef(el);
      else if (forwardedRef) forwardedRef.current = el;
    }} transition={spring}
      initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: isOver ? 1.08 : 1 }} exit={{ opacity: 0, scale: 0.8 }}
      className={'chip' + (target ? ' tgt' : '') + (isOver ? ' over' : '') + (t.paid ? ' paid' : '')} aria-current={active} onClick={onTap}
      aria-label={target ? `Move selected items to ${t.tab.name}` : `${t.tab.name}, ${fmt(t.b.total)}${t.paid ? ', paid' : ''}`}>
      {active && !target && <motion.span layoutId="chip-active" className="chip-active" transition={spring} />}
      <span className="chip-in">
        {t.paid ? <span className="chip-paid"><Icon n="check" s={12} w={3.5} /></span> : <Dot c={t.tab.color} />}
        <span><span className="chip-name">{t.tab.name}</span>
          <motion.span key={bump} className="chip-amt" initial={bump ? { scale: 1.25, color: '#0E7A3E' } : false} animate={{ scale: 1, color: '#111827' }} transition={{ duration: 0.6 }}>
            <Money c={t.b.total} /></motion.span></span>
      </span>
    </motion.button>
  );
});

function Rail() {
  const { v, d, s } = useApp();
  const drag = useDragging();
  const { setNodeRef, isOver } = useDroppable({ id: 'new' });
  const n = drag ? drag.ids.length : s.selected.length;
  return (
    <motion.nav layoutScroll className="rail" aria-label="Tabs">
      <LayoutGroup id="rail">
        <AnimatePresence initial={false} mode="popLayout">{v.tabs.map(t => <Chip key={t.tab.id} t={t} />)}</AnimatePresence>
        <motion.button layout ref={setNodeRef} className={'chip add' + (n ? ' tgt' : '') + (isOver ? ' over' : '')}
          aria-label={n ? 'Move selected items to a new tab' : 'Add tab'}
          onClick={() => (n && !drag ? d({ type: 'MOVE', lineIds: s.selected, to: 'new' }) : d({ type: 'ADD_TAB' }))}><Icon n="plus" s={22} /></motion.button>
      </LayoutGroup>
    </motion.nav>
  );
}

function TicketActions() {
  const { d, open, v } = useApp();
  const anyPaid = v.tabs.some(t => t.paid);
  return (
    <div className="m-ticket-actions" role="group" aria-label="Ticket actions">
      <button className="btn" disabled={anyPaid} onClick={() => open({ kind: 'even' })}><Icon n="even" s={18} />Even Split</button>
      <button className="btn" disabled={anyPaid} onClick={() => d({ type: 'BY_SEAT' })}><Icon n="seat" s={18} />By Seat</button>
      <button className="btn pri m-send" aria-label="Send" title="Send" onClick={() => d({ type: 'SEND' })}><Icon n="send" s={24} /></button>
    </div>
  );
}

function MRow({ l, paid }: { l: LineView; paid: boolean }) {
  const { s, d } = useApp();
  const drag = useDragging();
  const sel = s.selected.includes(l.id);
  const { attributes, listeners, setNodeRef } = useDraggable({ id: l.id, disabled: paid });
  const flashing = s.flash.includes(l.itemId + '@' + l.tabId);
  return (
    <motion.div layout="position" transition={spring} ref={setNodeRef} {...attributes} {...listeners}
      initial={{ opacity: 0, x: -12 }} animate={{ opacity: drag?.ids.includes(l.id) ? 0.35 : 1, x: 0 }} exit={{ opacity: 0, x: 40, transition: { duration: 0.18 } }}
      role="button" aria-pressed={sel} className={'row m' + (sel ? ' sel' : '') + (paid ? ' paid' : '')}
      onClick={() => !paid && d({ type: 'SELECT', lineId: l.id })}>
      {flashing && <motion.span key={s.flashKey} className="flash" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 1.6, delay: 0.2 }} />}
      {paid ? <span className="lock"><Icon n="lock" s={16} /></span> : <Check on={sel} label={`Select ${l.item.name}`} onChange={() => d({ type: 'SELECT', lineId: l.id })} />}
      <ItemDetails line={l} />
      <div className="row-price">{l.item.discountPct ? <s className="muted was">{fmt(l.full)}</s> : null}<Money c={l.amount} /></div>
    </motion.div>
  );
}

function TabCard({ t }: { t: TabView }) {
  const { s, d, open } = useApp();
  const { selIn } = useTabHelpers();
  const [adjOpen, setAdjOpen] = useState(false);
  const mine = selIn(t.tab.id);
  const n = t.lines.length;
  const all = n > 0 && t.lines.every(l => s.selected.includes(l.id));
  return (
    <section className={'m-card' + (t.paid ? ' paid' : '')} aria-label={t.tab.name}>
      <div className="m-card-head">
        {t.paid ? <span className="paid-ic"><Icon n="check" s={16} w={3} /></span>
          : <Check on={all} label={`Select all items on ${t.tab.name}`} onChange={() => d({ type: 'SELECT_TAB', tabId: t.tab.id })} disabled={!n} />}
        <Dot c={t.tab.color} />
        <div style={{ flex: 1 }}>
          <div className="m-card-name">{t.tab.name}</div>
          <div className="col-meta">{t.paid ? <span className="paid-txt">Paid · {t.tab.paid!.method}</span> : mine.length ? <span className="sel-txt">{mine.length} of {n} selected</span> : `${n} item${n === 1 ? '' : 's'}`}</div>
        </div>
      </div>
      <AnimatePresence initial={false} mode="popLayout">
        {t.lines.map(l => <MRow key={l.id} l={l} paid={t.paid} />)}
      </AnimatePresence>
      {!n && <div className="empty m">No items yet. Select items on another tab and tap this tab, or long-press an item and drag it here.</div>}
      <button className="adj-toggle" aria-expanded={adjOpen} onClick={() => setAdjOpen(!adjOpen)}>
        <span className="muted" style={{ flex: 1 }}>Ticket Adjustments</span>
        <b><Money c={t.b.disc + t.b.sc + t.b.fee} /></b>
        <motion.span className="muted" animate={{ rotate: adjOpen ? 180 : 0 }} style={{ display: 'flex' }}><Icon n="down" s={18} /></motion.span>
      </button>
      <AnimatePresence initial={false}>
        {adjOpen && (
          <motion.div className="adj-detail" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <div className="adj-in">
              <div className="kv"><span className="muted">Discount</span><Money c={t.b.disc} /></div>
              <div className="kv"><span className="muted">Service charge</span><Money c={t.b.sc} /></div>
              <div className="kv"><span className="muted">Fees</span><Money c={t.b.fee} /></div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="m-tot">
        <div className="kv"><span className="muted">Subtotal</span><Money c={t.b.sub} /></div>
        <div className="kv"><span className="muted">Sales tax</span><Money c={t.b.tax} /></div>
        <div className="kv big"><span>Total</span><Money c={t.b.total} /></div>
      </div>
      <div className={'m-card-checkout' + (t.paid ? '' : ' tab-checkout')}>
        {t.paid ? <div className="paid-bar m"><Icon n="ok" s={20} />{t.tab.name} paid · {fmt(t.b.total)}</div>
          : <>
            {!s.selected.length && <button className="btn pri checkout m" disabled={!n} onClick={() => open({ kind: 'pay', tabId: t.tab.id })}>
              <span className="row-flex"><Icon n="card" />Pay {t.tab.name}</span><Money c={t.b.total} /></button>}
            <button className="ib tab-menu-button" aria-label={`${t.tab.name} actions`} onClick={() => open({ kind: 'tabMenu', tabId: t.tab.id })}><Icon n="more" s={22} /></button>
          </>}
      </div>
    </section>
  );
}

function Body() {
  const { s, d, v } = useApp();
  const idx = Math.max(0, v.tabs.findIndex(t => t.tab.id === s.activeTab));
  const t = v.tabs[idx];
  const [page, setPage] = useState({ index: idx, direction: 1 });
  if (page.index !== idx) setPage({ index: idx, direction: idx > page.index ? 1 : -1 });
  const dir = page.direction;
  const drag = useDragging();
  const go = (k: number) => { const nt = v.tabs[k]; if (nt) d({ type: 'SET_ACTIVE', tabId: nt.tab.id }); };
  if (!t) return null;
  return (
    <motion.main className="m-main" onPanEnd={(_, info) => {
      if (drag || s.selected.length) return;
      if (Math.abs(info.offset.x) > 70 && Math.abs(info.offset.y) < 50) go(idx + (info.offset.x < 0 ? 1 : -1));
    }}>
      <Banner />
      <div className="dots" aria-hidden="true">{v.tabs.map((x, k) => <motion.span key={x.tab.id} layout className={'pg' + (k === idx ? ' on' : '')} />)}</div>
      <div className="m-card-stage">
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div key={t.tab.id} custom={dir}
            variants={{ enter: (dr: number) => ({ x: dr > 0 ? '100%' : '-100%' }), center: { x: '0%' }, exit: (dr: number) => ({ x: dr > 0 ? '-100%' : '100%' }) }}
            initial="enter" animate="center" exit="exit" transition={{ type: 'spring', stiffness: 380, damping: 36 }}>
            <TabCard t={t} />
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.main>
  );
}

function Bottom() {
  const { s, d, open, v } = useApp();
  const sel = s.selected;
  const itemIds = [...new Set(sel.map(id => s.core.lines.find(l => l.id === id)!.itemId))];
  const srcTabs = new Set(sel.map(id => s.core.lines.find(l => l.id === id)!.tabId));
  const dests = v.tabs.filter(x => !x.paid && !(srcTabs.size === 1 && srcTabs.has(x.tab.id)));
  return (
    <div className="m-bottom-wrap">
      <AnimatePresence mode="popLayout" initial={false}>
        {sel.length ? (
          <motion.div key="sel" className="m-sel" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={spring}>
            <div className="m-sel-head"><div style={{ flex: 1, fontSize: 16, fontWeight: 700 }}>{sel.length} item{sel.length === 1 ? '' : 's'} selected</div>
              <button className="btn gh link" onClick={() => d({ type: 'CLEAR_SEL' })}>Clear</button></div>
            <div className="lbl" style={{ margin: '2px 4px 8px' }}>Move to</div>
            <div className="dest-row">
              {dests.map(o => (
                <motion.button layout key={o.tab.id} className="btn dest-btn" onClick={() => d({ type: 'MOVE', lineIds: sel, to: o.tab.id })}><Dot c={o.tab.color} />{o.tab.name}</motion.button>
              ))}
              <motion.button layout className="btn dest-btn new" onClick={() => d({ type: 'MOVE', lineIds: sel, to: 'new' })}><Icon n="plus" s={18} />New tab</motion.button>
            </div>
            <div className="hr" />
            <div className="acts">
              <button className="act" onClick={() => open({ kind: 'split', lineIds: sel })}><Icon n="split" />Split</button>
              <button className="act" onClick={() => open({ kind: 'discount', itemIds })}><Icon n="tag" />Discount</button>
              <button className="act red" onClick={() => open({ kind: 'void', itemIds })}><Icon n="ban" />Void</button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="ticket" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={spring}>
            <TicketActions />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Mobile() {
  const { s } = useApp();
  return (
    <div className="mob">
      <NetworkStatus />
      <Header />
      <SplitDnd>
        <Rail />
        <Body />
      </SplitDnd>
      <Bottom />
      <ToastHost bottom={s.selected.length ? 236 : 92} />
    </div>
  );
}
