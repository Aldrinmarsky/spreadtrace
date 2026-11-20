import { formatTime } from './analysis.mjs';

const TOP = 12;
const BOTTOM = 28;
const LEFT = 5;
const RIGHT = 73;
const COLORS = { bid: '#99b8fa', ask: '#81e6bd', last: '#d0b9f8', stop: '#f2cd89' };

export function drawChart(canvas, report, exit, active, showLast, formatPrice) {
  const { width, height } = canvas.getBoundingClientRect();
  if (!width || !height) return;
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  if (!report?.quotes.length) return;

  const { quotes, from, to } = report;
  const series = showLast ? ['bid', 'ask', 'last'] : ['bid', 'ask'];
  let low = Math.min(exit.fill, exit.stop ?? exit.fill);
  let high = Math.max(exit.fill, exit.stop ?? exit.fill);
  for (const quote of quotes) {
    for (const key of series) {
      const price = quote[key];
      if (price === null) continue;
      low = Math.min(price, low);
      high = Math.max(price, high);
    }
  }
  const padding = (high - low || Math.abs(high) * 0.00005 || 0.00005) * 0.18;
  low -= padding;
  high += padding;
  const right = width - RIGHT;
  const bottom = height - BOTTOM;
  const x = (time) => LEFT + (time - from) / (to - from) * (right - LEFT);
  const y = (price) => bottom - (price - low) / (high - low) * (bottom - TOP);

  ctx.font = '11px monospace';
  ctx.textBaseline = 'middle';
  function line(x1, y1, x2, y2, color, dash = []) {
    ctx.setLineDash(dash);
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  for (let index = 0; index <= 4; index++) {
    const price = low + (high - low) * index / 4;
    line(LEFT, y(price), right, y(price), '#303a40');
    ctx.fillStyle = '#a8b4b5';
    ctx.fillText(formatPrice(price), right + 7, y(price), RIGHT - 10);
  }
  const slots = width > 510 ? 4 : 2;
  for (let index = 0; index <= slots; index++) {
    const time = from + (to - from) * index / slots;
    const offset = x(time);
    line(offset, TOP, offset, bottom, '#303a40');
    ctx.textAlign = index === 0 ? 'left' : index === slots ? 'right' : 'center';
    ctx.fillText(formatTime(time).slice(0, 8), offset, bottom + 14);
  }
  ctx.textAlign = 'left';
  if (exit.stop !== null) line(LEFT, y(exit.stop), right, y(exit.stop), COLORS.stop, [6, 5]);
  line(x(exit.time), TOP, x(exit.time), bottom, '#96a0a4', [3, 5]);

  for (const key of series) {
    ctx.strokeStyle = COLORS[key];
    ctx.fillStyle = COLORS[key];
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let previous;
    for (const quote of quotes) {
      const price = quote[key];
      if (price === null) {
        previous = undefined;
        continue;
      }
      const offset = x(quote.time);
      if (previous) {
        ctx.lineTo(offset, y(previous[key]));
        ctx.lineTo(offset, y(price));
      } else {
        ctx.moveTo(offset, y(price));
        ctx.rect(offset - 0.75, y(price) - 0.75, 1.5, 1.5);
        ctx.moveTo(offset, y(price));
      }
      previous = quote;
    }
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  if (active) line(x(active.time), TOP, x(active.time), bottom, '#91aa9f', [2, 5]);
  ctx.beginPath();
  ctx.arc(x(exit.time), y(exit.fill), 4, 0, Math.PI * 2);
  ctx.fillStyle = '#ecf0ee';
  ctx.fill();
}
