import { formatTime, inspectExit, MAX_BYTES, quoteSpread, readCapture } from './analysis.mjs?v=0.3.0';
import { drawChart } from './chart.mjs';
import { HISTORY_SAMPLE_CSV, SAMPLE_CSV } from './sample.mjs?v=0.3.0';

const $ = (id) => document.getElementById(id);
const fileInput = $('file');
const exitSelect = $('exit');
const windowSelect = $('window');
const reference = $('reference');
const liveWindows = Array.from(windowSelect.options, (option) => [Number(option.value), option.textContent]);
const scrubber = $('scrub');
let capture;
let exit;
let report;
let request = 0;
let decimalPlaces = 2;
let showLast = false;

function set(id, text) {
  $(id).textContent = text;
}

const price = (value) => value == null ? '—' : value.toFixed(decimalPlaces);
const medianPrice = (value) => value == null ? '—' : value.toFixed(decimalPlaces + 1).replace(/0$/, '');
const priceLabels = { bid: 'Bid', ask: 'Ask', last: 'Last' };
const reasonLabel = (reason) => ({
  DEAL_REASON_SL: 'Stop loss', DEAL_REASON_TP: 'Take profit', DEAL_REASON_SO: 'Stop out',
  DEAL_REASON_CLIENT: 'Desktop', DEAL_REASON_MOBILE: 'Mobile', DEAL_REASON_WEB: 'Web',
  DEAL_REASON_EXPERT: 'Expert advisor',
})[reason] ?? (reason.replace(/^DEAL_REASON_/, '').replaceAll('_', ' ').toLowerCase() || 'Unspecified');

function fillDate(time) {
  return new Date(time).toISOString().slice(0, 10) + ' · ' + formatTime(time);
}

function setHistoryStatus(history) {
  const banner = $('history-status');
  banner.hidden = !history;
  if (!history) return;
  const status = {
    returned: 'MT5 returned ticks. Review the quote coverage around the fill.',
    partial: 'MT5 returned ticks with a history error. Part of this window may be missing.',
    empty: 'MT5 returned no ticks for this window. The recorded exit is available below.',
    failed: 'MT5 could not retrieve ticks. The recorded exit is available below.',
  }[history.status];
  banner.dataset.limited = history.status !== 'returned';
  banner.textContent = `Historical export · ±${history.seconds} seconds. ${status}`;
}

function load(csv, name) {
  const next = readCapture(csv);
  const preferred = capture?.history ? 10 : Number(windowSelect.value);
  capture = next;
  const radius = capture.history?.seconds;
  const windows = liveWindows.filter(([seconds]) => !radius || seconds <= radius);
  if (radius && windows.at(-1)[0] !== radius) windows.push([radius, `±${radius} seconds`]);
  windowSelect.replaceChildren(...windows.map(([seconds, label]) => new Option(label, seconds)));
  windowSelect.value = String(radius ?? preferred);
  setHistoryStatus(capture.history);
  const count = capture.quotes.length;
  set('file-state', [name, capture.symbol,
    `${count.toLocaleString()} recorded quote${count === 1 ? '' : 's'}`].join(' · '));
  $('error').hidden = true;
  reference.value = 'auto';
  const options = document.createDocumentFragment();
  capture.exits.forEach((item, index) => {
    options.append(new Option(`${fillDate(item.time)} · ${item.side} · ${reasonLabel(item.reason)}`, String(index)));
  });
  exitSelect.replaceChildren(options);
  render();
}

function renderVerdict() {
  const side = priceLabels[report.side];
  const crossing = report.crossing;
  const summary = {
    crossed: [`${side} reached the stop`,
      `${side} was ${price(crossing?.[report.side])} at ${formatTime(crossing?.time ?? exit.time)}, before the recorded fill.`],
    'same-time': [`${side} reached the stop at the fill timestamp`,
      'The quotes and fill share a millisecond. Their exact order is unknown.'],
    unseen: [`No ${side} touch observed`, 'The capture can only show the quotes available in this window.'],
    missing: [`No ${side} quotes before the fill`, 'Try a wider time window or verify the recorder was running.'],
    unavailable: ['Stop comparison unavailable', 'This deal does not provide a usable stop level for this exit type.'],
    other: [reasonLabel(exit.reason), 'MT5 recorded this deal with a reason other than Stop Loss.'],
  }[report.state];
  set('verdict-title', summary[0]);
  set('verdict-text', summary[1]);
  const chartSide = priceLabels[report.chartSide];
  const chartEvidence = {
    true: `Recorded ${chartSide} also touched the stop before or at the fill timestamp.`,
    false: `No recorded ${chartSide} quote touched the stop before or at the fill timestamp.`,
  }[report.chartTouchObserved];
  $('chart-evidence').hidden = !chartEvidence;
  set('chart-evidence', chartEvidence ?? '');
}

function renderMetrics() {
  const stopToFill = report.stopToFill;
  set('stop-level', price(exit.stop));
  set('fill-price', price(exit.fill));
  set('stop-to-fill', price(stopToFill));
  const stopNote = stopToFill === null
    ? (exit.reason === 'DEAL_REASON_SL' ? 'No comparable stop price' : 'Stop-loss exits only')
    : (stopToFill === 0 ? 'Filled at stop' : stopToFill > 0 ? 'Above the stop' : 'Below the stop');
  set('stop-to-fill-note', stopNote);
  set('spread-before', price(quoteSpread(report.before)));
  set('spread-median', medianPrice(report.medianSpread));
  const usable = report.spreadSampleCount.toLocaleString();
  const total = report.beforeQuoteCount.toLocaleString();
  const sampleLabel = report.spreadSampleCount === report.beforeQuoteCount ? usable : `${usable} of ${total}`;
  set('spread-sample', `${sampleLabel} pre-fill ${report.beforeQuoteCount === 1 ? 'quote' : 'quotes'} with usable spread`);
  set('spread-peak', price(report.peak));

  const notes = [];
  if (report.peakMultiple !== null) {
    notes.push(`${Number(report.peakMultiple.toFixed(2)).toLocaleString()}× pre-fill median`);
  }
  if (report.peakQuote) {
    const offset = report.peakQuote.time - exit.time;
    notes.push(offset === 0 ? 'at fill timestamp'
      : `${Math.abs(offset).toLocaleString()} ms ${offset < 0 ? 'before' : 'after'} fill`);
  }
  set('spread-peak-note', notes.join(' · '));
}

function renderCoverage() {
  const notes = [];
  if (report.before && report.after) {
    const gap = report.after.time - report.before.time;
    notes.push(`${gap.toLocaleString()} ms between the nearest quotes on either side of the fill.`);
  } else if (!report.before && !report.after) {
    notes.push('No quotes strictly before or after the fill in this window.');
  } else {
    notes.push(`No quote ${report.before ? 'after' : 'before'} the fill in this window.`);
  }
  if (report.sameTimeCount) {
    const count = report.sameTimeCount;
    notes.push(`${count.toLocaleString()} ${count === 1 ? 'quote shares' : 'quotes share'} the fill timestamp. Their order relative to the fill is unknown. Use the scrubber to view them.`);
  }
  set('quote-context', notes.join(' '));
}

function renderNearest() {
  const body = $('nearest');
  body.replaceChildren();
  if (!exit) return;
  for (const [label, quote] of [['Before fill', report.before], ['After fill', report.after]]) {
    const row = body.insertRow();
    const heading = document.createElement('th');
    heading.scope = 'row';
    heading.textContent = label;
    row.append(heading);
    const offset = quote ? quote.time - exit.time : null;
    const delta = offset === null ? '—' : `${offset > 0 ? '+' : ''}${offset} ms`;
    for (const value of [quote ? formatTime(quote.time) : 'No quote in window', delta, price(quote?.bid),
      price(quote?.ask), ...(showLast ? [price(quote?.last)] : []), price(quoteSpread(quote))]) {
      row.insertCell().textContent = value;
    }
  }
}

function redraw() {
  drawChart($('chart'), report, exit, report?.quotes[Number(scrubber.value)], showLast, price);
}

function inspectQuote() {
  const row = report?.quotes[Number(scrubber.value)];
  const text = row ? [formatTime(row.time), `Bid ${price(row.bid)}`, `Ask ${price(row.ask)}`,
    ...(showLast ? [`Last ${price(row.last)}`] : []), `Spread ${price(quoteSpread(row))}`].join(' · ') : '';
  set('quote', text);
  scrubber.setAttribute('aria-valuetext', text);
  redraw();
}

function render() {
  exit = capture.exits[Number(exitSelect.value)];
  report = exit ? inspectExit(capture, exit, Number(windowSelect.value), reference.value) : null;
  const count = report?.quotes.length ?? 0;
  let precision = 2;
  for (const row of report?.quotes ?? []) {
    for (const value of [row.bid, row.ask, row.last]) {
      const digits = value?.toFixed(8).replace(/0+$/, '').split('.')[1]?.length ?? 0;
      precision = Math.max(precision, digits);
    }
  }
  for (const value of [exit?.stop, exit?.fill]) {
    const digits = value?.toFixed(8).replace(/0+$/, '').split('.')[1]?.length ?? 0;
    precision = Math.max(precision, digits);
  }
  decimalPlaces = precision;
  showLast = capture.chartPrice === 'LAST' || reference.value === 'last';
  $('last-legend').hidden = !showLast;
  $('last-column').hidden = !showLast;
  reference.options[0].textContent = exit
    ? `Auto · ${capture.chartPrice === 'LAST' ? 'Last' : exit.side === 'Buy' ? 'Ask' : 'Bid'}` : 'Auto';
  $('exit-body').hidden = !exit;
  $('empty-note').hidden = Boolean(exit);
  $('chart-empty').hidden = count > 0;
  $('chart').hidden = count === 0;
  $('chart-context').textContent = `${capture.symbol} · MT5 chart price: ${capture.chartPrice === 'BID' ? 'Bid' : 'Last'}`;
  $('exit-context').textContent = exit ? `Deal #${exit.id} · ${exit.side} fill` : 'No exits in this capture';
  set('chart-empty', exit ? 'No quotes in this window.' : 'A recorded exit will appear here.');
  scrubber.disabled = count < 2;
  scrubber.max = Math.max(1, count - 1);
  scrubber.value = Math.max(0, report?.quotes.indexOf(report.before) ?? 0);
  if (exit) {
    renderVerdict();
    renderMetrics();
    renderCoverage();
  } else {
    set('quote-context', 'Select a capture with an exit to see the surrounding quotes.');
  }
  renderNearest();
  inspectQuote();
}

$('download').href = URL.createObjectURL(new Blob([SAMPLE_CSV], { type: 'text/csv' }));
$('sample').addEventListener('click', () => {
  request++;
  load(SAMPLE_CSV, 'Fictional sample');
});
$('history-sample').addEventListener('click', () => {
  request++;
  load(HISTORY_SAMPLE_CSV, 'Fictional historical sample');
});
fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  fileInput.value = '';
  if (!file) return;
  const sequence = ++request;
  try {
    if (file.size > MAX_BYTES) throw new Error('Open a capture under 24 MiB. Make shorter recordings for review.');
    const csv = await file.text();
    if (sequence === request) load(csv, file.name);
  } catch (error) {
    if (sequence !== request) return;
    set('error', `${file.name} · ${error.message}`);
    $('error').hidden = false;
  }
});
for (const control of [exitSelect, windowSelect, reference]) control.addEventListener('change', render);
scrubber.addEventListener('input', inspectQuote);
new ResizeObserver(redraw).observe($('chart-wrap'));
load(SAMPLE_CSV, 'Fictional sample');
