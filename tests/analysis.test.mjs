import assert from 'node:assert/strict';
import test from 'node:test';
import { COLUMNS, inspectExit, quoteSpread, readCapture } from '../docs/analysis.mjs';
import { SAMPLE_CSV } from '../docs/sample.mjs';

const timestamp = 1700000000000;
const header = COLUMNS.join(',');
const quote = (offset, bid, ask, last = '', mode = 'BID', symbol = 'TEST') =>
  ['quote', timestamp + offset, symbol, mode, bid, ask, last, '', '', '', '', '', '', ''].join(',');
const deal = (side, stop, entry = 'OUT', reason = 'SL', mode = 'BID', symbol = 'TEST', offset = 0) =>
  ['deal', timestamp + offset, symbol, mode, '', '', '', '9007199254740999', `DEAL_TYPE_${side}`,
    `DEAL_ENTRY_${entry}`, `DEAL_REASON_${reason}`, 100.05, stop, 0.1].join(',');
const csv = (...lines) => [header, ...lines].join('\r\n');
const inspect = (capture, reference) => inspectExit(capture, capture.exits[0], 2, reference);

test('sample reports an Ask touch before the short exit while Bid stays below the stop', () => {
  const capture = readCapture(SAMPLE_CSV);
  const report = inspect(capture);
  assert.equal(capture.symbol, 'XAUUSD');
  assert.equal(report.state, 'crossed');
  assert.equal(report.side, 'ask');
  assert.ok(report.quotes.every((row) => row.bid < capture.exits[0].stop));
  assert.equal(report.before.time - capture.exits[0].time, -180);
  assert.equal(report.after.time - capture.exits[0].time, 180);
  assert.equal(report.peak.toFixed(2), '0.35');
});

test('sell exit selects Bid and includes equality, even if only Bid is present', () => {
  const capture = readCapture(csv(quote(-300, 100, ''), deal('SELL', 100)));
  const report = inspect(capture);
  assert.equal(report.side, 'bid');
  assert.equal(report.state, 'crossed');
  assert.equal(report.peak, null);
});

test('Last chart uses Last automatically and offers a manual override', () => {
  const capture = readCapture(csv(quote(-5, 101, 102, 99, 'LAST'), deal('BUY', 100, 'OUT', 'SL', 'LAST')));
  assert.equal(inspect(capture).side, 'last');
  assert.equal(inspect(capture).state, 'unseen');
  assert.equal(inspect(capture, 'ask').state, 'crossed');
});

test('same-millisecond crossings remain ambiguous and are excluded from nearest rows', () => {
  const capture = readCapture(csv(quote(10, 101, 102), deal('BUY', 100),
    quote(0, 99, 99.8), quote(0, 99, 101), quote(-15, 99, 99.9)));
  const report = inspect(capture);
  assert.equal(report.state, 'same-time');
  assert.equal(report.sameTimeCount, 2);
  assert.equal(report.before.time, timestamp - 15);
  assert.equal(report.after.time, timestamp + 10);
});

test('touch after the fill does not establish a recorded pre-fill crossing', () => {
  const capture = readCapture(csv(quote(10, 101, 102), quote(-50, 99, 99.9), deal('BUY', 100)));
  assert.equal(inspect(capture).state, 'unseen');
  assert.equal(inspect(readCapture(csv(quote(10, 101, 102), deal('BUY', 100)))).state, 'missing');
});

test('filters entries, deduplicates tickets as text and handles unmatched exit types', () => {
  const closing = deal('BUY', 101, 'INOUT');
  const capture = readCapture('\uFEFF' + csv(deal('SELL', '', 'IN'), closing, closing));
  assert.equal(capture.exits.length, 1);
  assert.equal(capture.exits[0].id, '9007199254740999');
  assert.equal(capture.exits[0].stop, null);
  assert.equal(inspect(capture).state, 'unavailable');
  assert.equal(inspect(readCapture(csv(deal('SELL', '', 'OUT', 'TP')))).state, 'other');
  assert.equal(inspect(readCapture(csv(deal('SELL', '', 'OUT')))).state, 'unavailable');
});

test('validates the file schema and record data, including quoted symbols', () => {
  assert.equal(readCapture(csv(quote(-50, 99, 100, '', 'BID', '"A,""B"'))).symbol, 'A,"B');
  assert.throws(() => readCapture(csv(quote(-50, 99, 100, '', 'BID', '"A"extra'))), /Malformed CSV/);
  assert.throws(() => readCapture('history,anything\n'), /SpreadTrace recorder/);
  assert.throws(() => readCapture(csv()), /no records/);
  assert.throws(() => readCapture(csv(quote(-50, 'invalid', 100))), /Line 2 · Invalid Bid/);
  assert.throws(() => readCapture(csv(quote(0, 100, 101), quote(2, 100, 101, '', 'BID', 'OTHER'))),
    /Multiple symbols/);
});

test('unavailable or crossed quotes do not contribute to spread statistics', () => {
  assert.equal(quoteSpread({ bid: 4, ask: 3 }), null);
  assert.equal(quoteSpread({ bid: null, ask: 3 }), null);
  assert.equal(quoteSpread({ bid: 3, ask: 3 }), 0);
});
