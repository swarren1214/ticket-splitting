import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { motion } from 'framer-motion';
import { useApp } from './kit';

/** Drag & drop for lines. Dragging a selected line drags the whole selection. Drop targets: `tab:<id>` and `new`. */
export function SplitDnd({ children }: { children: React.ReactNode }) {
  const { s, d, device, scale, v } = useApp();
  const [drag, setDrag] = useState<{ ids: string[]; label: string } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: device === 'counter' ? { distance: 8 } : { delay: 320, tolerance: 8 },
  }));
  const onStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    const ids = s.selected.includes(id) ? s.selected : [id];
    const line = v.tabs.flatMap(t => t.lines).find(l => l.id === id);
    setDrag({ ids, label: line ? line.item.name : '' });
    if (navigator.vibrate) navigator.vibrate(12);
  };
  const onEnd = (e: DragEndEvent) => {
    const over = e.over ? String(e.over.id) : null;
    if (drag && over) d({ type: 'MOVE', lineIds: drag.ids, to: over === 'new' ? 'new' : over.replace('tab:', '') });
    setDrag(null);
  };
  return (
    <DndContext sensors={sensors} onDragStart={onStart} onDragEnd={onEnd} onDragCancel={() => setDrag(null)} autoScroll={false}>
      <DragCtx.Provider value={drag}>{children}</DragCtx.Provider>
      {createPortal(
        <DragOverlay dropAnimation={{ duration: 180 }} zIndex={9999}>
          {drag && (
            <motion.div className="drag-card"
              initial={{ rotate: 0, scale: 0.9 }} animate={{ rotate: -2, scale: 1 }}>
              {drag.ids.length > 1 && <span className="drag-stack" />}
              <span className="drag-name">{drag.label}</span>
              {drag.ids.length > 1 && <span className="drag-count">+{drag.ids.length - 1}</span>}
            </motion.div>
          )}
        </DragOverlay>, document.body)}
    </DndContext>
  );
}
export const DragCtx = React.createContext<{ ids: string[]; label: string } | null>(null);
export const useDragging = () => React.useContext(DragCtx);
