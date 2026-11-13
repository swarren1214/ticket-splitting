import React, { useRef } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { fmt, type LineView, type TabView } from '../store';
import { Check, Dot, Icon, Money, NetworkStatus, ToastHost, useApp } from '../ui/kit';
import { SplitDnd, useDragging } from '../ui/dnd';
import { useTabHelpers } from '../ui/overlays';

const spring = { type: 'spring' as const, stiffness: 420, damping: 36 };

function Row({ l, paid }: { l: LineView; paid: boolean }) {
  const { s, d } = useApp();
  const drag = useDragging();
  const sel = s.selected.includes(l.id);
  const { attributes, listeners, setNodeRef } = useDraggable({ id: l.id, disabled: paid });
  const flashing = s.flash.includes(l.itemId + '@' + l.tabId);
  const dragging = drag?.ids.includes(l.id);
  return (
    <motion.div layout="position" transition={spring}
      initial={false} animate={{ opacity: dragging ? 0.35 : 1 }} exit={{ opacity: 0, height: 0, transition: { duration: 0.18 } }}
      ref={setNodeRef} {...attributes} {...listeners} role="button" aria-pressed={sel} tabIndex={paid ? -1 : 0}
      className={'row' + (sel ? ' sel' : '') + (paid ? ' paid' : '')}
      onClick={() => !paid && d({ type: 'SELECT', lineId: l.id })}
      onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); d({ type: 'SELECT', lineId: l.id }); } }}>
      {flashing && <motion.span key={s.flashKey} className="flash" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 1.6, delay: 0.25 }} />}
      {paid ? <span className="lock"><Icon n="lock" s={16} /></span> : <Check on={sel} label={`Select ${l.item.name}`} onChange={() => d({ type: 'SELECT', lineId: l.id })} />}
      <div className="row-main">
        <div className="row-name">{l.item.name}{l.frac && <span className="frac">{l.frac}</span>}{l.item.discountPct && <span className="disc-badge">{l.item.discountPct === 100 ? 'Comp' : `−${l.item.discountPct}%`}</span>}</div>
        <div className="row-sub">{l.item.mod}{l.note && ` · ${l.note}`}</div>
      </div>
      <div className="row-price">{l.item.discountPct ? <s className="muted was">{fmt(l.full)}</s> : null}<Money c={l.amount} /></div>
    </motion.div>
  );
}

function Column({ t }: { t: TabView }) {
  const { s, d, open } = useApp();
  const drag = useDragging();
  const { selIn } = useTabHelpers();
  const { setNodeRef, isOver } = useDroppable({ id: 'tab:' + t.tab.id, disabled: t.paid });
  const moreRef = useRef<HTMLButtonElement>(null);
  const mine = selIn(t.tab.id);
  const moving = drag ? drag.ids : s.selected;
  const incoming = moving.filter(id => s.core.lines.find(l => l.id === id)?.tabId !== t.tab.id);
  const isTarget = !t.paid && incoming.length > 0 && (mine.length === 0 || !!drag);
  const all = t.lines.length > 0 && t.lines.every(l => s.selected.includes(l.id));
  const n = t.lines.length;
  return (
    <motion.section layout transition={spring} initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
      ref={setNodeRef} aria-label={t.tab.name} className={'col' + (isTarget ? ' target' : '') + (isOver ? ' over' : '') + (t.paid ? ' paid' : '')}>
      <div className="col-head">
        {t.paid ? <span className="paid-ic"><Icon n="check" s={16} w={3} /></span>
          : <Check on={all} label={`Select all items on ${t.tab.name}`} onChange={() => d({ type: 'SELECT_TAB', tabId: t.tab.id })} disabled={!n} />}
        <Dot c={t.tab.color} />
        <div className="col-title">
          <div className="col-name">{t.tab.name}</div>
          <div className="col-meta">{t.paid ? <span className="paid-txt">Paid · {t.tab.paid!.method}</span>
            : mine.length ? <span className="sel-txt">{mine.length} of {n} selected</span> : `${n} item${n === 1 ? '' : 's'}`}</div>
        </div>
        <Money c={t.b.total} className="col-total" />
      </div>
      <AnimatePresence initial={false}>
        {isTarget && !drag && (
          <motion.div key="mv" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} style={{ overflow: 'hidden' }}>
            <div style={{ padding: 12 }}><button className="btn pri" style={{ width: '100%', height: 52 }} onClick={() => d({ type: 'MOVE', lineIds: s.selected, to: t.tab.id })}>
              <Icon n="arrow" s={18} />Move {incoming.length} item{incoming.length === 1 ? '' : 's'} here</button></div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="col-items">
        <AnimatePresence initial={false} mode="popLayout">
          {t.lines.map(l => <Row key={l.id} l={l} paid={t.paid} />)}
        </AnimatePresence>
        {!n && <div className="empty">{isTarget ? 'Drop here' : 'No items yet. Drag or move items here.'}</div>}
      </div>
      <div className="col-foot">
        <div className="adj">
          <div className="lbl">Ticket adjustments</div>
          <div className="kv"><span className="muted">Discount</span><Money c={t.b.disc} /></div>
          <div className="kv"><span className="muted">Service charge</span><Money c={t.b.sc} /></div>
          <div className="kv"><span className="muted">Fees</span><Money c={t.b.fee} /></div>
        </div>
        <div className="tot">
          <div className="kv"><span className="muted">Subtotal</span><Money c={t.b.sub} /></div>
          <div className="kv"><span className="muted">Sales tax</span><Money c={t.b.tax} /></div>
        </div>
        {t.paid ? <div className="paid-bar"><Icon n="ok" s={18} />Paid {fmt(t.b.total)}</div>
          : <div className="tab-checkout">
            <button className="btn pri checkout" disabled={!n} onClick={() => open({ kind: 'pay', tabId: t.tab.id })}>
              <span className="row-flex"><Icon n="card" s={18} />Pay</span><Money c={t.b.total} /></button>
            <button ref={moreRef} className="ib tab-menu-button" aria-label={`${t.tab.name} actions`} onClick={() => open({ kind: 'tabMenu', tabId: t.tab.id, anchor: moreRef.current!.getBoundingClientRect() })}><Icon n="more" /></button>
          </div>}
      </div>
    </motion.section>
  );
}

function NewZone() {
  const { s, d } = useApp();
  const drag = useDragging();
  const { setNodeRef, isOver } = useDroppable({ id: 'new' });
  const n = drag ? drag.ids.length : s.selected.length;
  const target = n > 0;
  return (
    <motion.div layout transition={spring} ref={setNodeRef} className={'newzone' + (target ? ' target' : '') + (isOver ? ' over' : '')}>
      <motion.div className="nz-ic" animate={{ scale: isOver ? 1.15 : 1 }}><Icon n="plus" s={28} /></motion.div>
      {target ? <>
        <div className="nz-t">Start a new tab with {n === 1 ? 'this item' : `these ${n} items`}</div>
        {!drag && <button className="btn pri" style={{ width: '100%', height: 52 }} onClick={() => d({ type: 'MOVE', lineIds: s.selected, to: 'new' })}>Move to new tab</button>}
      </> : <>
        <div className="muted nz-s">Drag items here, or select items and tap, to start a new tab</div>
        <button className="btn" style={{ width: '100%' }} onClick={() => d({ type: 'ADD_TAB' })}><Icon n="plus" s={18} />Add empty tab</button>
      </>}
    </motion.div>
  );
}

function TopBar() {
  const { s, d, open, v } = useApp();
  return (
    <header className="ct-top">
      <button className="ib" aria-label="Home" onClick={() => d({ type: 'TOAST', text: 'Home (outside this prototype)', tone: 'info' })}><Icon n="home" /></button>
      <button className="btn gh link" aria-label="Back" onClick={() => d({ type: 'TOAST', text: 'Back to order (outside this prototype)', tone: 'info' })}><Icon n="back" /><span className="ct-action-label">Back</span></button>
      <div className="vsep" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="ct-title">Split order</div>
        <div className="muted" style={{ fontSize: 13 }}>Order #184 · Table 12 · {new Set(v.tabs.flatMap(t => t.lines.map(l => l.itemId))).size} items</div>
      </div>
      <button className="btn" aria-label="Undo" title="Undo" disabled={!s.past.length} onClick={() => d({ type: 'UNDO' })}><Icon n="undo" s={18} /><span className="ct-action-label">Undo</span></button>
      <button className="btn" aria-label="Redo" title="Redo" disabled={!s.future.length} onClick={() => d({ type: 'REDO' })}><Icon n="redo" s={18} /><span className="ct-action-label">Redo</span></button>
      <div className="vsep" />
      <button className="btn gh" aria-label="Customer" title="Customer" onClick={() => open({ kind: 'customer' })}><Icon n="user" s={18} /><span className="ct-action-label">Customer</span></button>
      <button className="btn gh" aria-label="Ticket info" title="Ticket info" onClick={() => open({ kind: 'info' })}><Icon n="info" s={18} /><span className="ct-action-label">Ticket info</span></button>
      <button className="btn gh" aria-label="Print" title="Print" onClick={() => d({ type: 'TOAST', text: 'Ticket sent to printer' })}><Icon n="print" s={18} /><span className="ct-action-label">Print</span></button>
      <NetworkStatus compact />
      <button className="ib" aria-label="Ticket actions" onClick={() => open({ kind: 'ticketMenu' })}><Icon n="more" /></button>
    </header>
  );
}

function BottomBar() {
  const { s, d, open, v } = useApp();
  const sel = s.selected;
  const itemIds = [...new Set(sel.map(id => s.core.lines.find(l => l.id === id)!.itemId))];
  const tabsOf = new Set(sel.map(id => s.core.lines.find(l => l.id === id)!.tabId));
  const anyPaid = v.tabs.some(t => t.paid);
  const paid = v.tabs.filter(t => t.paid).reduce((a, t) => a + t.b.total, 0);
  const srcName = tabsOf.size === 1 ? v.tabs.find(t => t.tab.id === [...tabsOf][0])?.tab.name : `${tabsOf.size} tabs`;
  return (
    <div className="ct-bottom-wrap">
      <AnimatePresence mode="popLayout" initial={false}>
        {sel.length ? (
          <motion.footer key="sel" className="ct-bottom dark" initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }} transition={spring}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{sel.length} item{sel.length === 1 ? '' : 's'} selected {tabsOf.size === 1 ? 'on' : 'across'} {srcName}</div>
              <div style={{ fontSize: 13, color: '#C9CEDA' }}>Tap a tab to move them, or drag</div>
            </div>
            <button className="btn dk" disabled={sel.length !== 1} title={sel.length !== 1 ? 'Select one item to split' : ''} onClick={() => open({ kind: 'split', lineId: sel[0] })}><Icon n="split" s={18} />Split item</button>
            <button className="btn dk" onClick={() => open({ kind: 'discount', itemIds })}><Icon n="tag" s={18} />Discount</button>
            <button className="btn dk red" onClick={() => open({ kind: 'void', itemIds })}><Icon n="ban" s={18} />Void</button>
            <div className="vsep dk" />
            <button className="btn dk" onClick={() => d({ type: 'CLEAR_SEL' })}><Icon n="x" s={18} />Clear</button>
          </motion.footer>
        ) : (
          <motion.footer key="norm" className="ct-bottom" initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }} transition={spring}>
            <button className="btn" onClick={() => d({ type: 'ADD_TAB' })}><Icon n="plus" s={18} />Add tab</button>
            <button className="btn" disabled={anyPaid} title={anyPaid ? 'Off once a tab is paid' : ''} onClick={() => d({ type: 'BY_SEAT' })}><Icon n="seat" s={18} />Split by seat</button>
            <button className="btn" disabled={anyPaid} title={anyPaid ? 'Off once a tab is paid' : ''} onClick={() => open({ kind: 'even' })}><Icon n="even" s={18} />Split evenly</button>
            <button className="btn dan" disabled={anyPaid || v.tabs.length < 2} title={anyPaid ? 'Refund paid tabs first' : ''} onClick={() => open({ kind: 'cancel' })}><Icon n="x" s={18} />Cancel splits</button>
            <div className="toast-slot"><ToastHost inline /></div>
            <div className="summary">
              <span>{v.tabs.length} tab{v.tabs.length === 1 ? '' : 's'} · Ticket total <b><Money c={v.ticket.total} /></b></span>
              {paid > 0 && <span className="muted small">Paid {fmt(paid)} · Remaining {fmt(v.ticket.total - paid)}</span>}
            </div>
            <button className="btn pri send" onClick={() => d({ type: 'SEND' })}><Icon n="send" s={18} />Send</button>
          </motion.footer>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Banner() {
  const { s, d, open, device } = useApp();
  return (
    <AnimatePresence>
      {s.banner && (
        <motion.div role="status" className={'banner ' + device} initial={{ opacity: 0, height: 0, marginBottom: 0 }} animate={{ opacity: 1, height: 'auto', marginBottom: device === 'counter' ? 12 : 10 }} exit={{ opacity: 0, height: 0, marginBottom: 0 }}>
          <div className="banner-in">
            <Icon n="ok" s={device === 'counter' ? 20 : 18} />
            <span className="banner-t">{device === 'counter' ? s.banner.text : `Tab moved to Order #${s.banner.ticket}`}</span>
            <button className="banner-link" onClick={() => open({ kind: 'viewTicket', number: s.banner!.ticket })}>Open #{s.banner.ticket}{device === 'counter' && <Icon n="ext" s={16} />}</button>
            <button className="ib gh" aria-label="Dismiss" onClick={() => d({ type: 'DISMISS_BANNER' })}><Icon n="x" s={18} /></button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Countertop() {
  const { v } = useApp();
  return (
    <div className="ct">
      <TopBar />
      <SplitDnd>
        <main className="ct-main">
          <Banner />
          <div className="cols">
            <LayoutGroup>
              <AnimatePresence initial={false} mode="popLayout">
                {v.tabs.map(t => <Column key={t.tab.id} t={t} />)}
              </AnimatePresence>
              <NewZone />
            </LayoutGroup>
          </div>
        </main>
      </SplitDnd>
      <BottomBar />
    </div>
  );
}
