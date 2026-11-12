import React, { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { derive, fmt, initState, reducer, type Scenario } from './store';
import { AppCtx, Icon, type Device, type Overlay } from './ui/kit';
import { OverlayHost } from './ui/overlays';
import { Countertop } from './countertop/Countertop';
import { Mobile } from './mobile/Mobile';

type Preview = Device | 'ipad-12-9' | 'ipad-10-2' | 'ipad-mini';
const SIZES: Record<Preview, { w: number; h: number; label: string; device: Device }> = {
  counter: { w: 1280, h: 720, label: 'GC26', device: 'counter' },
  mobile: { w: 360, h: 800, label: 'Handheld 2.5', device: 'mobile' },
  'ipad-12-9': { w: 1366, h: 1024, label: 'iPad 12.9"', device: 'counter' },
  'ipad-10-2': { w: 1080, h: 810, label: 'iPad 10.2"', device: 'counter' },
  'ipad-mini': { w: 1133, h: 744, label: 'iPad mini', device: 'counter' },
};

// Every preview supports ?device=<preview>&full or #<preview>-full.
const params = new URLSearchParams(location.search);
const hash = location.hash.slice(1);
const handheldViewport = window.matchMedia('(max-width: 599px), (max-height: 599px) and (pointer: coarse)');
const requestedPreview = params.get('device') || hash.replace(/-full$/, '');
const initialPreview = (Object.keys(SIZES) as Preview[]).find(k => k === requestedPreview);
if (requestedPreview && !initialPreview) console.warn(`Unknown device preview: ${requestedPreview}`);
const standalone = window.matchMedia('(display-mode: standalone)').matches;

export default function App() {
  const [scenario, setScenario] = useState<Scenario>((params.get('scenario') as Scenario) || 'midSplit');
  const [s, d] = useReducer(reducer, scenario, initState);
  const [preview, setPreview] = useState<Preview>(initialPreview ?? (handheldViewport.matches ? 'mobile' : 'counter'));
  const [full, setFull] = useState(params.has('full') || hash.endsWith('-full') || standalone);
  const [handheld, setHandheld] = useState(handheldViewport.matches);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const v = useMemo(() => derive(s.core), [s.core]);
  const frameRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const browserFull = useRef(false);
  const size = SIZES[preview];
  const device = full && handheld ? 'mobile' : size.device;

  useEffect(() => {
    const changed = () => setHandheld(handheldViewport.matches);
    handheldViewport.addEventListener('change', changed);
    return () => handheldViewport.removeEventListener('change', changed);
  }, []);

  useLayoutEffect(() => {
    if (full) { setScale(1); return; }
    const el = stageRef.current!;
    const fit = () => {
      const pad = device === 'counter' ? 36 : 28;
      setScale(Math.min(1, (el.clientWidth - 48) / (size.w + pad), (el.clientHeight - 32) / (size.h + pad)));
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, [preview, full, device]);

  const enterFull = () => {
    setFull(true);
    if (standalone) return;
    if (document.fullscreenEnabled && document.documentElement.requestFullscreen) {
      browserFull.current = true;
      void document.documentElement.requestFullscreen().catch(error => {
        browserFull.current = false;
        console.warn('Browser full screen was blocked; using full-window mode.', error);
        d({ type: 'TOAST', text: 'Full-window mode is active. The browser blocked hiding its controls.', tone: 'info' });
      });
    } else {
      d({ type: 'TOAST', text: 'Full-window mode. In Safari, use Share > Add to Home Screen to hide browser controls.', tone: 'info' });
    }
  };
  const exitFull = () => {
    browserFull.current = false;
    setFull(false);
    setOverlay(null);
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(error => {
        console.warn('Could not exit browser full screen.', error);
        d({ type: 'TOAST', text: 'Preview controls restored. Use your browser to exit browser full screen.', tone: 'info' });
      });
    }
  };

  useEffect(() => {
    const changed = () => {
      if (browserFull.current && !document.fullscreenElement) {
        browserFull.current = false;
        setFull(false);
      }
    };
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);

  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.delete('full');
    if (url.searchParams.has('device')) url.searchParams.set('device', preview);
    url.hash = preview + (full ? '-full' : '');
    try { history.replaceState(null, '', url); }
    catch (error) { console.warn('Could not update the prototype preview URL.', error); }
  }, [preview, full]);

  useEffect(() => { setOverlay(null); }, [preview]);
  useEffect(() => {
    setOverlay(current => current?.kind === 'tabMenu' ? null : current);
  }, [full]);
  useEffect(() => {
    if (overlay && 'tabId' in overlay && !s.core.tabs.some(t => t.id === overlay.tabId) && overlay.kind !== 'newTicket') setOverlay(null);
  }, [s.core.tabs]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        if (overlay) return;
        e.preventDefault();
        d({ type: e.shiftKey ? 'REDO' : 'UNDO' });
      }
      else if (e.key === 'Escape' && !overlay) {
        if (s.selected.length) d({ type: 'CLEAR_SEL' });
        else if (full) exitFull();
      }
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [overlay, full, s.selected.length]);

  const ctx = { s, d, v, overlay, open: setOverlay, close: () => setOverlay(null), device, scale, frameRef, full, exitFull };
  const reset = (sc: Scenario = scenario) => { setScenario(sc); d({ type: 'RESET', scenario: sc }); setOverlay(null); };
  const allPaid = v.tabs.length > 0 && v.tabs.every(t => t.paid);
  const ended = s.orderVoided || allPaid || v.tabs.length === 0;

  const screen = (
    <div ref={frameRef} className={'screen ' + device + (device === 'counter' && (preview.startsWith('ipad-') || full) ? ' tablet' : '')} style={full ? { width: '100%', height: '100%' } : { width: size.w, height: size.h }}>
      {device === 'counter' ? <Countertop /> : <Mobile />}
      <OverlayHost />
      <AnimatePresence>
        {ended && (
          <motion.div className="end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="end-card" initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 24 }}>
              <div className={'end-ic' + (s.orderVoided ? ' red' : '')}><Icon n={s.orderVoided ? 'ban' : 'check'} s={36} w={3} /></div>
              <h2>{s.orderVoided ? 'Order #184 voided' : allPaid ? 'All tabs paid' : 'Ticket is empty'}</h2>
              <p className="muted">{s.orderVoided ? 'Every item was voided.' : allPaid ? `${v.tabs.length} tab${v.tabs.length === 1 ? '' : 's'} · ${fmt(v.ticket.total)} collected. Order #184 is closed.` : 'All tabs were moved to other tickets.'}</p>
              {s.newTickets.length > 0 && <p className="muted small">New tickets: {s.newTickets.map(t => '#' + t.number).join(', ')}</p>}
              <button className="btn pri big" onClick={() => reset()}>Start over</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <AppCtx.Provider value={ctx}>
        <div className={'shell' + (full ? ' full' : '')}>
          {!full && <div className="toolbar">
            <div className="brand"><span className="brand-mark"><Icon n="split" s={14} /></span>Split Ticket Prototype</div>
            <div className="seg tb" role="tablist" aria-label="Device">
              {(Object.keys(SIZES) as Preview[]).map(k => (
                <button key={k} role="tab" aria-selected={preview === k} className={preview === k ? 'on' : ''} onClick={() => setPreview(k)}>
                  {preview === k && <motion.span layoutId="dev-pill" className="seg-pill" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                  <span className="seg-label">{SIZES[k].label}</span>
                </button>
              ))}
            </div>
            <label className="tb-select tb-device-select">Device
              <select value={preview} onChange={e => setPreview(e.target.value as Preview)}>
                {(Object.keys(SIZES) as Preview[]).map(k => <option key={k} value={k}>{SIZES[k].label}</option>)}
              </select>
            </label>
            <div className="toolbar-spacer" />
            <label className="tb-select">Start from
              <select value={scenario} onChange={e => reset(e.target.value as Scenario)}>
                <option value="midSplit">3 tabs, mid-split</option>
                <option value="unsplit">One check, unsplit</option>
              </select>
            </label>
            <button className="btn tb-btn" onClick={() => reset()}><Icon n="undo" s={16} />Reset</button>
            <button className="btn tb-btn" onClick={enterFull}><Icon n="maximize" s={16} />Full screen</button>
            {(location.protocol === 'http:' || location.protocol === 'https:') && (
              <form className="toolbar-lock" method="post" action={'/__access/logout' + location.search + location.hash}>
                <button className="btn tb-btn" type="submit"><Icon n="lock" s={16} />Lock prototype</button>
              </form>
            )}
          </div>}
          <div className="stage" ref={stageRef}>
            <motion.div key={preview} className={full ? 'viewport-device' : 'device ' + device}
              style={full ? { width: '100%', height: '100%', scale: 1 } : { scale, transformOrigin: 'center center' }}
              initial={full ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              {screen}
            </motion.div>
          </div>
          {!full && <div className="hint">
            {device === 'counter'
              ? <>Tap items to select, then tap a tab (or drag). ⌘/Ctrl+Z to undo. Tab <Icon n="more" s={16} /> menus have move, new ticket and remove.</>
              : 'Tap items to select, then tap a tab. Long-press and drag an item onto a tab. Swipe the card to switch tabs.'}
          </div>}
        </div>
    </AppCtx.Provider>
  );
}
