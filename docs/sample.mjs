import { COLUMNS } from './analysis.mjs';

const start = Date.UTC(2026, 10, 19, 8, 0, 0, 250);
const csv = [COLUMNS.join(',')];

for (let index = -58; index <= 57; index++) {
  const time = start + index * 180;
  const bid = (2679.54 + Math.sin(index * 0.35) * 0.065 + Math.cos(index * 0.16) * 0.055).toFixed(2);
  const ask = (Number(bid) + 0.10 + (index % 3) * 0.005).toFixed(2);
  const atSpike = index >= -3 && index <= 1;
  const bidAtSpike = ['2679.77', '2679.80', '2679.80', '2679.79', '2679.75'];
  const askAtSpike = ['2679.96', '2680.04', '2680.15', '2680.10', '2679.99'];
  csv.push(['quote', time, 'XAUUSD', 'BID', atSpike ? bidAtSpike[index + 3] : bid,
    atSpike ? askAtSpike[index + 3] : ask, '', '', '', '', '', '', '', ''].join(','));
}
csv.push(['deal', start, 'XAUUSD', 'BID', '', '', '', '834001', 'DEAL_TYPE_BUY',
  'DEAL_ENTRY_OUT', 'DEAL_REASON_SL', '2680.12', '2680.00', '0.10'].join(','));
export const SAMPLE_CSV = csv.join('\n') + '\n';

// A historical export with quotes missing on the far side of the fill.
const history = ['history', start, 'XAUUSD', 'BID', '', '', '', '834001', '', '',
  'partial', 10, '', ''].join(',');
export const HISTORY_SAMPLE_CSV = [csv[0], history, ...csv.slice(4, 60), csv.at(-1)].join('\n') + '\n';
