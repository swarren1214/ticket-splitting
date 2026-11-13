import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import {
  ArrowRight, ArrowUp, Ban, Banknote, Check as CheckIcon, ChevronDown, ChevronLeft, ChevronRight, ChevronUp,
  CircleCheck, Columns2, CreditCard, Ellipsis, ExternalLink, FilePlus, GripVertical, House, Info,
  LoaderCircle, Lock, Maximize, Merge, Minimize, Minus, Network, Percent, Plus, Printer, Redo2, Send, Split, Tag, Trash2,
  TriangleAlert, Undo2, UserRound, UsersRound, X,
} from 'lucide-react';
import type { Action, LineView, State } from '../store';
import { derive } from '../store';

// ---------- app context ----------
export type Overlay =
  | { kind: 'remove'; tabId: string } | { kind: 'newTicket'; tabId: string } | { kind: 'cancel' } | { kind: 'even' }
  | { kind: 'split'; lineIds: string[] } | { kind: 'discount'; itemIds: string[] } | { kind: 'void'; itemIds: string[] }
  | { kind: 'pay'; tabId: string } | { kind: 'customer' } | { kind: 'info' } | { kind: 'adjust' } | { kind: 'voidOrder' }
  | { kind: 'ticketMenu' } | { kind: 'tabMenu'; tabId: string; anchor?: DOMRect } | { kind: 'viewTicket'; number: number };
export type Device = 'counter' | 'mobile';
export interface Ctx {
  s: State; d: React.Dispatch<Action>; v: ReturnType<typeof derive>;
  overlay: Overlay | null; open: (o: Overlay) => void; close: () => void;
  device: Device; scale: number; frameRef: React.RefObject<HTMLDivElement>;
  full: boolean; exitFull: () => void;
}
export const AppCtx = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppCtx);

// ---------- icons ----------
const icons = {
  undo: Undo2, redo: Redo2, back: ChevronLeft, home: House,
  plus: Plus, minus: Minus, check: CheckIcon, x: X, arrow: ArrowRight, arrowUp: ArrowUp,
  split: Split, tag: Tag, ban: Ban, print: Printer, user: UserRound, info: Info,
  card: CreditCard, cash: Banknote, ext: ExternalLink, file: FilePlus,
  seat: UsersRound, even: Columns2, merge: Merge, trash: Trash2,
  down: ChevronDown, up: ChevronUp, right: ChevronRight, pct: Percent,
  alert: TriangleAlert, ok: CircleCheck, grip: GripVertical, send: Send, lock: Lock,
  more: Ellipsis, loader: LoaderCircle,
  network: Network, maximize: Maximize, minimize: Minimize,
};
type IconName = keyof typeof icons;
const MotionCheck = motion.create(CheckIcon);

export function Icon({ n, s = 20, w = 2 }: { n: IconName; s?: number; w?: number }) {
  const LucideIcon = icons[n];
  return <LucideIcon size={s} strokeWidth={w} aria-hidden="true" focusable="false" style={{ flexShrink: 0 }} />;
}

export function ItemDetails({ line }: { line: LineView }) {
  const { item, share, note } = line;
  const description = item.mod + (note ? ` · ${note}` : '');
  return (
    <div className="row-main">
      <div className="row-name">
        <span className="item-name" title={item.name}>{item.name}</span>
        {share && <span className="share-badge">{share}</span>}
        {item.discountPct && <span className="disc-badge">{item.discountPct === 100 ? 'Comp' : `−${item.discountPct}%`}</span>}
      </div>
      <div className="row-sub">
        <span className="row-qty">Qty {item.quantity}</span><span aria-hidden="true">·</span>
        <span className="row-description" title={description}>{description}</span>
      </div>
    </div>
  );
}

export function NetworkStatus({ compact = false }: { compact?: boolean }) {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  const label = online ? 'Online' : 'Offline';
  return (
    <div role="status" className={'network-status' + (online ? '' : ' offline') + (compact ? ' compact' : '')}
      title={`Network: ${label} (browser connectivity)`}>
      <Icon n="network" s={compact ? 20 : 16} />
      <span className="network-label">{label}</span>
    </div>
  );
}

export function Check({ on, label, onChange, disabled }: { on: boolean; label: string; onChange: () => void; disabled?: boolean }) {
  return (
    <label className={'cbw' + (disabled ? ' dis' : '')} onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
      <input type="checkbox" aria-label={label} checked={on} onChange={onChange} disabled={disabled} />
      <AnimatePresence>{on && <MotionCheck initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ type: 'spring', stiffness: 600, damping: 28 }}
        size={18} strokeWidth={3} aria-hidden="true" focusable="false" />}</AnimatePresence>
    </label>
  );
}

/** Money that rolls when it changes. */
export function Money({ c, className, style }: { c: number; className?: string; style?: React.CSSProperties }) {
  const txt = (c < 0 ? '−' : '') + '$' + (Math.abs(c) / 100).toFixed(2);
  return (
    <span className={'money ' + (className ?? '')} style={style}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={txt} initial={{ y: '60%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '-60%', opacity: 0 }} transition={{ duration: 0.22 }} style={{ display: 'inline-block' }}>{txt}</motion.span>
      </AnimatePresence>
    </span>
  );
}

export const Dot = ({ c, s = 12 }: { c: string; s?: number }) => <span className="dot" style={{ background: c, width: s, height: s }} />;

// ---------- overlays ----------
const scrimAnim = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.18 } };

export function useEsc(onClose: () => void) {
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
}

export function useModalFocus(overlayKey: string | null) {
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!overlayKey) return;
    const root = Array.from(ref.current?.children ?? []).find(el => el.getAttribute('data-overlay-key') === overlayKey);
    const modal = root?.querySelector<HTMLElement>('[role="dialog"], [role="menu"]');
    if (!modal) return;
    if (document.activeElement instanceof HTMLElement && !ref.current?.contains(document.activeElement)) {
      opener.current = document.activeElement;
    }
    const previous = opener.current;
    const focusable = () => Array.from(modal.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, a[href], [tabindex]',
    )).filter(el => el.tabIndex >= 0 && !el.matches(':disabled') && el.getClientRects().length > 0);
    // The drawer is still off-screen during entry; focusing it must not scroll the device frame.
    const focusFirst = () => (focusable()[0] ?? modal).focus({ preventScroll: true });
    const onFocus = (e: FocusEvent) => {
      if (e.target instanceof Node && !modal.contains(e.target)) focusFirst();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const elements = focusable();
      const first = elements[0], last = elements[elements.length - 1];
      if (!first) { e.preventDefault(); modal.focus({ preventScroll: true }); }
      else if (e.shiftKey && (document.activeElement === first || document.activeElement === modal)) {
        e.preventDefault(); last.focus({ preventScroll: true });
        const body = last.closest('.panel-body');
        if (body) body.scrollTop = body.scrollHeight;
      } else if (!e.shiftKey && (document.activeElement === last || document.activeElement === modal)) {
        e.preventDefault(); focusFirst();
      }
    };
    focusFirst();
    document.addEventListener('focusin', onFocus);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('keydown', onKey);
      // Restore after React's commit-time focus restoration, without stealing focus from a new overlay.
      queueMicrotask(() => {
        if ((modal.contains(document.activeElement) || document.activeElement === document.body) &&
          previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
      });
    };
  }, [overlayKey]);
  return ref;
}

/** Centered confirmation dialog (both devices). */
export function Dialog({ title, icon, tone = 'blue', children, actions, onClose, width = 460 }:
  { title: string; icon: IconName; tone?: 'blue' | 'red'; children: React.ReactNode; actions: React.ReactNode; onClose: () => void; width?: number }) {
  useEsc(onClose);
  const { device } = useApp();
  return (
    <div className="layer">
      <motion.div className="scrim" {...scrimAnim} onClick={onClose} />
      <motion.div tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={'dialog ' + device}
        style={device === 'counter' ? { width } : undefined}
        initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: 'spring', stiffness: 420, damping: 32 }}>
        <div className={'dlg-ic ' + tone}><Icon n={icon} s={24} /></div>
        <h2>{title}</h2>
        {children}
        <div className="dlg-actions">{actions}</div>
      </motion.div>
    </div>
  );
}

/** Side panel on countertop, draggable bottom sheet on mobile. */
export function Panel({ title, sub, children, footer, onClose, onBack, height }:
  { title: string; sub?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; onClose: () => void; onBack?: () => void; height?: number | 'auto' }) {
  useEsc(onBack ?? onClose);
  const { device } = useApp();
  const controls = useDragControls();
  const backRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const previousTitle = useRef(title);
  useLayoutEffect(() => {
    if (previousTitle.current === title) return;
    previousTitle.current = title;
    bodyRef.current?.scrollTo(0, 0);
    (onBack ? backRef.current : closeRef.current)?.focus({ preventScroll: true });
  }, [title]);
  if (device === 'counter') {
    return (
      <div className="layer">
        <motion.div className="scrim" {...scrimAnim} onClick={onClose} />
        <motion.aside tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="side"
          initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 38 }}>
          <div className="panel-head">
            {onBack && <button ref={backRef} className="ib gh" aria-label="Back to ticket actions" onClick={onBack}><Icon n="back" /></button>}
            <div style={{ flex: 1 }}><div className="panel-title">{title}</div>{sub && <div className="muted" style={{ fontSize: 14 }}>{sub}</div>}</div>
            <button ref={closeRef} className="ib" aria-label="Close" onClick={onClose}><Icon n="x" /></button></div>
          <div ref={bodyRef} className="panel-body">{children}</div>
          {footer && <div className="panel-foot">{footer}</div>}
        </motion.aside>
      </div>
    );
  }
  return (
    <div className="layer">
      <motion.div className="scrim" {...scrimAnim} onClick={onClose} />
      <motion.div tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="sheet" style={{ height: height ?? 'auto' }}
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 38 }}
        drag="y" dragListener={false} dragControls={controls} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, info) => { if (info.offset.y > 90 || info.velocity.y > 600) onClose(); }}>
        <div className="grab-zone" onPointerDown={e => controls.start(e)}>
          <div className="grabber" />
          <div className="panel-head m">
            {onBack && <button ref={backRef} className="ib gh" aria-label="Back to ticket actions" onClick={onBack} onPointerDown={e => e.stopPropagation()}><Icon n="back" s={22} /></button>}
            <div style={{ flex: 1 }}><div className="panel-title m">{title}</div>{sub && <div className="muted" style={{ fontSize: 13 }}>{sub}</div>}</div>
            <button ref={closeRef} className="ib gh" aria-label="Close" onClick={onClose} onPointerDown={e => e.stopPropagation()}><Icon n="x" s={22} /></button></div>
        </div>
        <div ref={bodyRef} className="panel-body m">{children}</div>
        {footer && <div className="panel-foot m">{footer}</div>}
      </motion.div>
    </div>
  );
}

// ---------- toast ----------
export function ToastHost({ bottom, top, inline }: { bottom?: number; top?: number; inline?: boolean }) {
  const { s, d } = useApp();
  const t = s.toast;
  const timer = useRef<number>();
  useEffect(() => {
    if (!t) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => d({ type: 'DISMISS_TOAST' }), t.undo ? 6000 : 3200);
    return () => window.clearTimeout(timer.current);
  }, [t?.id]);
  return (
    <div className={'toast-host' + (inline ? ' inline' : '')} style={inline ? undefined : top !== undefined ? { top } : { bottom }}>
      <AnimatePresence mode="popLayout">
        {t && (
          <motion.div key={t.id} role="status" className="toast" layout
            initial={{ opacity: 0, y: top !== undefined ? -24 : 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: top !== undefined ? -12 : 12, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 500, damping: 34 }}>
            <span style={{ color: t.tone === 'info' ? '#A9B8FF' : '#6EE7A0', display: 'flex' }}><Icon n={t.tone === 'info' ? 'info' : 'ok'} /></span>
            <span className="toast-text">{t.text}</span>
            {t.undo && <button className="toast-undo" onClick={() => d({ type: 'UNDO' })}>Undo</button>}
            <motion.span className="toast-bar" initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: t.undo ? 6 : 3.2, ease: 'linear' }} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
