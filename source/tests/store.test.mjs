import assert from 'node:assert/strict';
import test from 'node:test';
import { derive, initState, reducer, shareLabel } from '../src/store.ts';

test('share percentages round compactly without labeling partial shares as zero or whole', () => {
  assert.equal(shareLabel(1, 8), '12.5%');
  assert.equal(shareLabel(2, 3), '66.7%');
  assert.equal(shareLabel(1, 10000), '<0.1%');
  assert.equal(shareLabel(9999, 10000), '>99.9%');
  assert.equal(shareLabel(1, 1), '');
});

test('item rows distinguish ordered quantity from percentage shares without changing amounts', () => {
  const initial = initState();
  const view = derive(initial.core);
  const burger = view.tabs[0].lines.find(l => l.itemId === 'burger');
  assert.equal(burger.item.quantity, 1);
  assert.equal(burger.share, '50%');
  assert.equal(burger.note, 'Other 50% on Tab 2');
  assert.equal(burger.amount, 600);
  assert.equal(view.tabs[0].lines.find(l => l.itemId === 'nuggets').share, '');
  const combined = reducer(initial, { type: 'MOVE', lineIds: ['l4'], to: 't1' });
  const wholeBurger = derive(combined.core).tabs[0].lines.find(l => l.itemId === 'burger');
  assert.equal(wholeBurger.item.quantity, 1);
  assert.equal(wholeBurger.share, '');
  assert.equal(wholeBurger.amount, 1200);
  assert.deepEqual(derive(combined.core).ticket, view.ticket);
});

test('thirds retain ordered quantities and exact amounts through payment and ticket snapshots', () => {
  const initial = initState();
  initial.core.items.nuggets.quantity = 3;
  initial.core.items.nuggets.price = 2400;
  const before = derive(initial.core);
  const split = reducer(initial, { type: 'SPLIT_ITEM', lineId: 'l2', tabIds: ['t1', 't2', 't3'], shares: [1, 1, 1] });
  const view = derive(split.core);
  const lines = view.tabs.flatMap(t => t.lines).filter(l => l.itemId === 'nuggets');
  assert.deepEqual(lines.map(l => [l.item.quantity, l.num, l.den, l.share, l.amount]),
    [[3, 1, 3, '33.3%', 800], [3, 1, 3, '33.3%', 800], [3, 1, 3, '33.3%', 800]]);
  assert.deepEqual(view.ticket, before.ticket);
  const paid = reducer(split, { type: 'PAY', tabId: 't1', method: 'Cash' });
  const paidLine = derive(paid.core).tabs[0].lines.find(l => l.itemId === 'nuggets');
  assert.deepEqual([paidLine.item.quantity, paidLine.share, paidLine.amount], [3, '33.3%', 800]);
  const moved = reducer(paid, { type: 'MOVE_TO_NEW_TICKET', tabId: 't2' });
  const movedLine = moved.newTickets[0].lines.find(l => l.name === 'Chicken Nuggets');
  assert.deepEqual([movedLine.quantity, movedLine.share, movedLine.amount], [3, '33.3%', 800]);
  assert.equal(derive(moved.core).ticket.total + moved.newTickets[0].breakdown.total, before.ticket.total);
});

test('removing the first tab renumbers survivors without changing identity and supports undo, redo and add', () => {
  const initial = initState();
  const removed = reducer(initial, { type: 'REMOVE_TAB', tabId: 't1', dest: 't2' });
  assert.deepEqual(removed.core.tabs.map(t => [t.id, t.name, t.color]), [
    ['t2', 'Tab 1', initial.core.tabs[1].color],
    ['t3', 'Tab 2', initial.core.tabs[2].color],
  ]);
  assert.equal(removed.activeTab, 't2');
  assert.equal(derive(removed.core).ticket.total, derive(initial.core).ticket.total);
  assert.match(removed.toast.text, /moved to Tab 1$/);
  assert.deepEqual(initial.core.tabs.map(t => t.name), ['Tab 1', 'Tab 2', 'Tab 3']);
  const undone = reducer(removed, { type: 'UNDO' });
  assert.deepEqual(undone.core, initial.core);
  const redone = reducer(undone, { type: 'REDO' });
  assert.deepEqual(redone.core, removed.core);
  const added = reducer(redone, { type: 'ADD_TAB' });
  assert.deepEqual(added.core.tabs.map(t => t.name), ['Tab 1', 'Tab 2', 'Tab 3']);
  assert.equal(new Set(added.core.tabs.map(t => t.id)).size, 3);
});

test('moving a tab to another ticket renumbers remaining tabs and new-tab moves continue the sequence', () => {
  const moved = reducer(initState(), { type: 'MOVE_TO_NEW_TICKET', tabId: 't1' });
  assert.deepEqual(moved.core.tabs.map(t => [t.id, t.name]), [['t2', 'Tab 1'], ['t3', 'Tab 2']]);
  assert.equal(moved.newTickets[0].tabName, 'Tab 1');
  const added = reducer(moved, { type: 'MOVE', lineIds: ['l4'], to: 'new' });
  assert.deepEqual(added.core.tabs.map(t => t.name), ['Tab 1', 'Tab 2', 'Tab 3']);
});

test('seat-based splits keep sequential tab names while preserving seat grouping', () => {
  const split = reducer(initState(), { type: 'BY_SEAT' });
  assert.deepEqual(split.core.tabs.map(t => t.name), ['Tab 1', 'Tab 2', 'Tab 3']);
  split.core.tabs.forEach((tab, i) => {
    const seats = split.core.lines.filter(l => l.tabId === tab.id).map(l => split.core.items[l.itemId].seat);
    assert.ok(seats.length > 0);
    assert.ok(seats.every(seat => seat === i + 1));
  });
});

test('renumbering refreshes shared-tab references without changing paid snapshots or totals', () => {
  const paid = reducer(initState(), { type: 'PAY', tabId: 't2', method: 'Card' });
  const snapshot = paid.core.tabs[1].paid;
  const removed = reducer(paid, { type: 'REMOVE_TAB', tabId: 't1', dest: 't3' });
  const view = derive(removed.core);
  assert.deepEqual(removed.core.tabs[0].paid, snapshot);
  assert.equal(removed.core.tabs[0].name, 'Tab 1');
  assert.deepEqual(view.tabs[0].b, snapshot.breakdown);
  assert.equal(view.tabs[0].lines.find(l => l.itemId === 'burger').note, 'Other 50% on Tab 2');
  assert.equal(view.tabs[1].lines.find(l => l.itemId === 'burger').note, 'Other 50% on Tab 1');
  assert.equal(view.ticket.total, derive(paid.core).ticket.total);
});

test('duplicate payment does not change totals or the recorded payment', () => {
  const initial = initState();
  const paid = reducer(initial, { type: 'PAY', tabId: 't1', method: 'Card' });
  const repeated = reducer(paid, { type: 'PAY', tabId: 't1', method: 'Cash' });
  assert.equal(repeated, paid);
  assert.equal(derive(repeated.core).ticket.total, derive(initial.core).ticket.total);
  assert.equal(repeated.core.tabs[0].paid.method, 'Card');
});

for (const action of [
  { type: 'DISCOUNT_ITEMS', itemIds: ['burger'], pct: 50 },
  { type: 'VOID_ITEMS', itemIds: ['burger'] },
]) {
  test(`${action.type} preserves paid item details and only changes open shares`, () => {
    const paid = reducer(initState(), { type: 'PAY', tabId: 't1', method: 'Cash' });
    const before = derive(paid.core);
    const changed = reducer(paid, action);
    const after = derive(changed.core);
    assert.deepEqual(after.tabs[0].lines, before.tabs[0].lines);
    assert.deepEqual(after.tabs[0].b, before.tabs[0].b);
    assert.equal(after.tabs[0].lines.reduce((sum, line) => sum + line.amount, 0), after.tabs[0].b.items);
    assert.ok(after.tabs[1].b.total < before.tabs[1].b.total);
    const burger = after.tabs[1].lines.find(line => line.itemId === 'burger');
    if (action.type === 'DISCOUNT_ITEMS') assert.equal(burger.amount, 300);
    else assert.equal(burger, undefined);
    const nextPaid = reducer(changed, { type: 'PAY', tabId: 't2', method: 'Card' });
    assert.equal(derive(nextPaid.core).ticket.total, after.ticket.total);
    const undone = derive(reducer(changed, { type: 'UNDO' }).core);
    assert.deepEqual(undone.tabs[0].lines, before.tabs[0].lines);
    assert.equal(undone.ticket.total, before.ticket.total);
  });
}
