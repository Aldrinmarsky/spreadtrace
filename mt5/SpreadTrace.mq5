// SPDX-License-Identifier: MIT
#property version "0.10"
#property description "Records terminal quotes and deal history to a local SpreadTrace CSV."

const int POLL_MS = 250;
const ulong MAX_RANGE_MS = 60000;
const uint MAX_DEAL_ATTEMPTS = 20;

struct PendingDeal
{
   ulong ticket;
   uint attempts;
};

int capture = INVALID_HANDLE;
ulong cursor_msc = 0;
int consumed_at_cursor = 0;
string chart_price;
string csv_symbol;
PendingDeal pending[];
bool io_failed = false;
bool tick_warning = false;

int OnInit()
{
   chart_price = SymbolInfoInteger(_Symbol, SYMBOL_CHART_MODE) == SYMBOL_CHART_MODE_LAST ? "LAST" : "BID";
   csv_symbol = _Symbol;
   StringReplace(csv_symbol, "\r", " ");
   StringReplace(csv_symbol, "\n", " ");
   StringReplace(csv_symbol, "\"", "\"\"");
   if(StringFind(csv_symbol, ",") >= 0 || StringFind(csv_symbol, "\"") >= 0)
      csv_symbol = "\"" + csv_symbol + "\"";
   MqlTick current;
   if(SymbolInfoTick(_Symbol, current) && current.time_msc > 0)
      cursor_msc = (ulong)current.time_msc;

   string base = StringFormat("SpreadTrace\\capture_%I64d_%I64u", ChartID(), GetTickCount64());
   string path = base + ".csv";
   for(int suffix = 1; FileIsExist(path); suffix++)
      path = base + "_" + IntegerToString(suffix) + ".csv";

   capture = FileOpen(path, FILE_WRITE | FILE_CSV | FILE_ANSI | FILE_SHARE_READ, ',', CP_UTF8);
   if(capture == INVALID_HANDLE)
   {
      Print("SpreadTrace: cannot open capture, error ", GetLastError());
      return INIT_FAILED;
   }

   if(FileWrite(capture, "kind", "time_msc", "symbol", "chart_price", "bid", "ask",
                "last", "deal_id", "side", "entry", "reason", "price", "stop", "volume") == 0
      || !EventSetMillisecondTimer(POLL_MS))
   {
      Print("SpreadTrace: initialization failed, error ", GetLastError());
      return INIT_FAILED;
   }
   FileFlush(capture);
   Print("SpreadTrace: recording ", _Symbol, " in MQL5\\Files\\", path);
   return INIT_SUCCEEDED;
}

void OnTradeTransaction(const MqlTradeTransaction &transaction, const MqlTradeRequest &request,
                        const MqlTradeResult &result)
{
   if(io_failed || transaction.type != TRADE_TRANSACTION_DEAL_ADD || transaction.deal == 0)
      return;

   int count = ArraySize(pending);
   if(ArrayResize(pending, count + 1, 64) < 0)
   {
      Print("SpreadTrace: could not queue deal ", transaction.deal);
      return;
   }
   pending[count].ticket = transaction.deal;
   pending[count].attempts = 0;
}

bool WriteDeal(const ulong ticket)
{
   if(!HistoryDealSelect(ticket))
      return false;
   if(HistoryDealGetString(ticket, DEAL_SYMBOL) != _Symbol)
      return true;

   ENUM_DEAL_TYPE side = (ENUM_DEAL_TYPE)HistoryDealGetInteger(ticket, DEAL_TYPE);
   if(side != DEAL_TYPE_BUY && side != DEAL_TYPE_SELL)
      return true;

   long time_msc = HistoryDealGetInteger(ticket, DEAL_TIME_MSC);
   if(time_msc <= 0)
      return false;

   ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(ticket, DEAL_ENTRY);
   ENUM_DEAL_REASON reason = (ENUM_DEAL_REASON)HistoryDealGetInteger(ticket, DEAL_REASON);
   double stop = HistoryDealGetDouble(ticket, DEAL_SL);
   string stop_text = stop == 0 ? "" : DoubleToString(stop, _Digits);

   io_failed = FileWrite(capture, "deal", time_msc, csv_symbol, chart_price, "", "", "",
                         ticket, EnumToString(side), EnumToString(entry), EnumToString(reason),
                         DoubleToString(HistoryDealGetDouble(ticket, DEAL_PRICE), _Digits),
                         stop_text, DoubleToString(HistoryDealGetDouble(ticket, DEAL_VOLUME), 8)) == 0;
   return true;
}

void DrainDeals()
{
   int retained = 0;
   int count = ArraySize(pending);
   for(int index = 0; index < count && !io_failed; index++)
   {
      if(WriteDeal(pending[index].ticket))
         continue;

      pending[index].attempts++;
      if(pending[index].attempts < MAX_DEAL_ATTEMPTS)
         pending[retained++] = pending[index];
      else
         Print("SpreadTrace: history unavailable for deal ", pending[index].ticket);
   }
   ArrayResize(pending, retained);
}

void RecordQuotes()
{
   MqlTick latest;
   if(!SymbolInfoTick(_Symbol, latest) || latest.time_msc <= 0)
      return;
   ulong latest_msc = (ulong)latest.time_msc;
   if(cursor_msc == 0)
      cursor_msc = latest_msc;
   if(latest_msc < cursor_msc)
      return;

   ulong end_msc = cursor_msc + MAX_RANGE_MS;
   if(end_msc > latest_msc)
      end_msc = latest_msc;

   MqlTick ticks[];
   ResetLastError();
   int count = CopyTicksRange(_Symbol, ticks, COPY_TICKS_ALL, cursor_msc, end_msc);
   int error = GetLastError();
   if(count < 0 || error != 0)
   {
      if(!tick_warning)
         Print("SpreadTrace: waiting for tick history, error ", error);
      tick_warning = true;
      return;
   }
   if(tick_warning)
      Print("SpreadTrace: tick history available again");
   tick_warning = false;

   // The range is inclusive. Skip already written records at its first timestamp.
   // Keep distinct ticks that share a millisecond in their terminal order.
   ulong start_msc = cursor_msc;
   int skip = consumed_at_cursor;
   for(int index = 0; index < count; index++)
   {
      ulong time_msc = (ulong)ticks[index].time_msc;
      if(time_msc == start_msc && skip > 0)
      {
         skip--;
         continue;
      }
      if(time_msc != cursor_msc)
      {
         cursor_msc = time_msc;
         consumed_at_cursor = 0;
      }
      string bid = ticks[index].bid == 0 ? "" : DoubleToString(ticks[index].bid, _Digits);
      string ask = ticks[index].ask == 0 ? "" : DoubleToString(ticks[index].ask, _Digits);
      string last = ticks[index].last == 0 ? "" : DoubleToString(ticks[index].last, _Digits);
      io_failed = FileWrite(capture, "quote", time_msc, csv_symbol, chart_price, bid, ask,
                            last, "", "", "", "", "", "", "") == 0;
      if(io_failed)
         return;
      consumed_at_cursor++;
   }
   if(end_msc < latest_msc)
   {
      cursor_msc = end_msc + 1;
      consumed_at_cursor = 0;
   }
}

void OnTimer()
{
   if(io_failed)
      return;
   DrainDeals();
   if(!io_failed)
      RecordQuotes();
   int error = GetLastError();
   FileFlush(capture);
   if(io_failed)
   {
      EventKillTimer();
      Print("SpreadTrace: file write failed. Recording stopped, error ", error);
   }
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   if(capture == INVALID_HANDLE)
      return;
   if(!io_failed && reason != REASON_INITFAILED)
   {
      DrainDeals();
      if(ArraySize(pending) > 0)
         Print("SpreadTrace: unrecorded deal events at shutdown: ", ArraySize(pending));
   }
   FileClose(capture);
}
