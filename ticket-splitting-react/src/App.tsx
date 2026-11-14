import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { derive, fmt, initState, reducer } from './store';
import { AppCtx, Icon, type Device, type Overlay } from './ui/kit';
import { OverlayHost } from './ui/overlays';
import { Countertop } from './countertop/Countertop';
import { Mobile } from './mobile/Mobile';

const handheldViewport = window.matchMedia('(max-width: 599px), (max-height: 599px) and (pointer: coarse)');

export default function App() {
  const [s, d] = useReducer(reducer, 'midSplit', initState);
  const [handheld, setHandheld] = useState(handheldViewport.matches);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const v = useMemo(() => derive(s.core), [s.core]);
  const frameRef = useRef<HTMLDivElement>(null);
  const device: Device = handheld ? 'mobile' : 'counter';

  useEffect(() => {
    const changed = () => setHandheld(handheldViewport.matches);
    handheldViewport.addEventListener('change', changed);
    return () => handheldViewport.removeEventListener('change', changed);
  }, []);

  useEffect(() => { setOverlay(null); }, [device]);
  useEffect(() => {
    if (overlay && 'tabId' in overlay && !s.core.tabs.some(t => t.id === overlay.tabId) && overlay.kind !== 'newTicket') setOverlay(null);
  }, [s.core.tabs]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        if (overlay) return;
        e.preventDefault();
        d({ type: e.shiftKey ? 'REDO' : 'UNDO' });
      } else if (e.key === 'Escape' && !overlay && s.selected.length) {
        d({ type: 'CLEAR_SEL' });
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [overlay, s.selected.length]);

  const ctx = { s, d, v, overlay, open: setOverlay, close: () => setOverlay(null), device, scale: 1, frameRef };
  const reset = () => { d({ type: 'RESET', scenario: 'midSplit' }); setOverlay(null); };
  const allPaid = v.tabs.length > 0 && v.tabs.every(t => t.paid);
  const ended = s.orderVoided || allPaid || v.tabs.length === 0;

  return (
    <AppCtx.Provider value={ctx}>
      <div className="prototype-root">
        <div ref={frameRef} className={'screen ' + device + (device === 'counter' ? ' tablet' : '')}>
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
                  <button className="btn pri big" onClick={reset}>Start over</button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </AppCtx.Provider>
  );
}
