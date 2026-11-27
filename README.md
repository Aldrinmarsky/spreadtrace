# SpreadTrace

Inspect a MetaTrader 5 exit against the Bid and Ask quotes your terminal recorded.

The fictional XAUUSD demo shows a short position with a stop at **2,680.00**. The highest Bid is **2,679.80**, the Ask reaches **2,680.15**, and the Buy fill is **2,680.12**. The exit report compares the **0.35** peak spread with the typical spread before the fill.

## Try the demo

Open the [live demo](https://aldrinmarsky.github.io/spreadtrace/). To run it locally, use the command below from the repository root and open [http://localhost:8000](http://localhost:8000).

```sh
python -m http.server 8000 --directory docs
```

The sample loads automatically. Use **Open capture** to review your own CSV. The report runs in the browser with no external libraries, backend, or uploads. To host the sample publicly on GitHub Pages, choose **Deploy from a branch** in your repository's Pages settings and select `main` and `/docs`.

## Record an MT5 session

1. In MT5 desktop, use **File → Open Data Folder** and copy [SpreadTrace.mq5](mt5/SpreadTrace.mq5) into `MQL5/Experts`.
2. Open the file in MetaEditor, compile it with **F7**, then attach **SpreadTrace** from the Navigator to the chart for the exact broker symbol you want to monitor. Each chart instance creates a separate capture.
3. Check the **Experts** tab for the recorder message and CSV path. The Expert Advisor reads ticks and trade history and writes the CSV locally. It has no order placement or modification calls.
4. Keep the terminal connected and the chart open through the exits you want to review. After the close, allow the recorder to collect post-fill quotes, then copy the CSV from `MQL5/Files/SpreadTrace` into the report. The report accepts files up to 24 MiB.

For a first check, attach it to an active symbol in a demo account and verify that the header and quote rows appear. Once you have a demo exit, verify that the deal, fill time, and fill price match the account history. The browser report is covered by automated tests. MetaEditor compilation and live MT5 capture still need terminal verification.

## Review a past MT5 exit

1. Copy [SpreadTraceHistory.mq5](mt5/SpreadTraceHistory.mq5) into `MQL5/Scripts` in your MT5 data folder. Open it in MetaEditor and compile with **F7**.
2. In the desktop terminal, sign in to the account that made the trade. Open **Toolbox → History**, switch to **Deals**, and find the closing **Deal** ticket. A position ID or order ticket will not identify the closing deal.
3. Run **SpreadTraceHistory** from **Navigator → Scripts**. Enter the ticket as **DealTicket** and set the requested seconds on either side of the fill. The default is 30 seconds and the maximum is 120.
4. Open the resulting `history_*.csv` from `MQL5/Files/SpreadTrace` in SpreadTrace. To try the report without MT5, expand **Review a past MT5 exit** on the demo and choose **Load historical sample**.

The script uses the symbol and timestamps on record for the deal. It exports the deal even if the tick request fails or returns no ticks. A partial export contains the ticks MT5 returned with an error. A successful tick request still cannot establish complete quote coverage. See the [MQL5 tick-range documentation](https://www.mql5.com/en/docs/series/copyticksrange). The historical script only reads market data and account history, selects the symbol for data access, and writes the CSV locally.

## Read a report

- **Window** shows quotes on either side of the exit, with the recorded stop and fill drawn on the timeline. The quote scrubber shows exact recorded values.
- **Stop-to-fill difference** is the recorded fill price minus the recorded stop price for an ordinary stop-loss exit. A positive value means the fill was above the stop.
- **Median spread before fill** uses the usable Bid/Ask pairs strictly before the fill in the selected window. **Peak spread in window** includes both sides of the fill. Its timestamp and multiple of the pre-fill median show when it occurred and how large it was relative to that sample. The multiple is unavailable when the median is zero or there are no usable pre-fill pairs.
- **Price to check against stop** defaults to Ask for a Buy exit and Bid for a Sell exit on a Bid chart. A Last chart defaults to Last. Confirm the trigger convention for your instrument and override the reference when appropriate. MT5's [order documentation](https://www.metatrader5.com/en/terminal/help/trading/general_concept) describes the standard Bid/Ask checks and exchange exceptions.
- **Quotes around the fill** uses the closest quote strictly before and strictly after the deal timestamp, shows the time between them, and flags missing rows. Quotes sharing the deal's millisecond remain visible in the scrubber. Their order relative to the deal is unknown.
- A recorded touch is evidence that a captured quote reached the stop level in the chosen window. The exit reason comes from the recorded deal. The terminal capture cannot show the broker's full execution sequence, an earlier stop level before a modification, or data the terminal did not receive.

## Capture format

Each UTF-8 CSV contains one symbol and two record types. `quote` rows have Bid, Ask, and Last where available. `deal` rows have the deal ticket, side, entry type, reason, fill price, reported stop, and volume. Times are raw MT5 millisecond values displayed on the capture clock. The report keeps ticket IDs as strings and treats distinct partial fills as distinct deals. A historical export adds one `history` row with the selected ticket and fill timestamp, retrieval status in `reason`, and the requested seconds on each side in `price`. Older live CSVs remain compatible. A reversal's reported stop belongs to the original reversal order, so the report omits it from the stop comparison.

The recorder batches [terminal tick history](https://www.mql5.com/en/docs/series/copyticksrange) and listens for [added deals](https://www.mql5.com/en/docs/event_handlers/ontradetransaction) while attached. See [deal properties](https://www.mql5.com/en/docs/constants/tradingconstants/dealproperties) for field definitions. Captures can contain real prices and deal IDs. Keep your live CSVs outside the public repository.

## Tests

```sh
node --test
```

MIT licensed.
