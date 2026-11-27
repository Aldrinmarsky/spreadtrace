// SPDX-License-Identifier: MIT
#property version "0.30"
#property description "Exports one past exit and available surrounding ticks to a local CSV."
#property script_show_inputs

input ulong DealTicket = 0;       // Closing deal ticket from History > Deals
input int  WindowSeconds = 30;  // Seconds on each side of the fill (2–120)

string CsvSymbol(string symbol)
{
   StringReplace(symbol, "\r", " ");
   StringReplace(symbol, "\n", " ");
   StringReplace(symbol, "\"", "\"\"");
   if(StringFind(symbol, ",") >= 0 || StringFind(symbol, "\"") >= 0)
      return "\"" + symbol + "\"";
   return symbol;
}

string QuotePrice(const double price, const int digits)
{
   return price == 0 ? "" : DoubleToString(price, digits);
}

void OnStart()
{
   if(DealTicket == 0 || WindowSeconds < 2 || WindowSeconds > 120)
   {
      Print("SpreadTrace History: enter a closing deal ticket and a window from 2 to 120 seconds.");
      return;
   }

   ResetLastError();
   if(!HistoryDealSelect(DealTicket))
   {
      Print("SpreadTrace History: closing deal not found in this account, error ", GetLastError());
      return;
   }

   ENUM_DEAL_TYPE side = (ENUM_DEAL_TYPE)HistoryDealGetInteger(DealTicket, DEAL_TYPE);
   ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(DealTicket, DEAL_ENTRY);
   if((side != DEAL_TYPE_BUY && side != DEAL_TYPE_SELL) ||
      (entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY && entry != DEAL_ENTRY_INOUT))
   {
      Print("SpreadTrace History: choose a closing deal in the Deals view.");
      return;
   }

   string symbol = HistoryDealGetString(DealTicket, DEAL_SYMBOL);
   long time_msc = HistoryDealGetInteger(DealTicket, DEAL_TIME_MSC);
   long radius = (long)WindowSeconds * 1000;
   long digits, mode, reason;
   double price, stop, volume;
   if(time_msc <= radius || symbol == "" ||
      !HistoryDealGetInteger(DealTicket, DEAL_REASON, reason) ||
      !HistoryDealGetDouble(DealTicket, DEAL_PRICE, price) ||
      !HistoryDealGetDouble(DealTicket, DEAL_SL, stop) ||
      !HistoryDealGetDouble(DealTicket, DEAL_VOLUME, volume) ||
      !SymbolSelect(symbol, true) ||
      !SymbolInfoInteger(symbol, SYMBOL_DIGITS, digits) ||
      !SymbolInfoInteger(symbol, SYMBOL_CHART_MODE, mode))
   {
      Print("SpreadTrace History: could not read deal or symbol properties, error ", GetLastError());
      return;
   }

   MqlTick ticks[];
   ResetLastError();
   int count = CopyTicksRange(symbol, ticks, COPY_TICKS_ALL,
                              (ulong)(time_msc - radius), (ulong)(time_msc + radius));
   int tick_error = GetLastError();
   string status;
   if(count < 0 || (count == 0 && tick_error != 0))
      status = "failed";
   else if(count == 0)
      status = "empty";
   else
      status = tick_error == 0 ? "returned" : "partial";

   string base = StringFormat("SpreadTrace\\history_%I64u_%I64u", DealTicket, GetTickCount64());
   string path = base + ".csv";
   for(int suffix = 1; FileIsExist(path); suffix++)
      path = base + "_" + IntegerToString(suffix) + ".csv";

   int file = FileOpen(path, FILE_WRITE | FILE_CSV | FILE_ANSI, ',', CP_UTF8);
   if(file == INVALID_HANDLE)
   {
      Print("SpreadTrace History: cannot open export, error ", GetLastError());
      return;
   }

   string csv_symbol = CsvSymbol(symbol);
   string chart = mode == SYMBOL_CHART_MODE_LAST ? "LAST" : "BID";
   bool written = FileWrite(file, "kind", "time_msc", "symbol", "chart_price", "bid", "ask",
                            "last", "deal_id", "side", "entry", "reason", "price", "stop", "volume") > 0 &&
                  FileWrite(file, "history", time_msc, csv_symbol, chart, "", "", "",
                            DealTicket, "", "", status, WindowSeconds, "", "") > 0 &&
                  FileWrite(file, "deal", time_msc, csv_symbol, chart, "", "", "",
                            DealTicket, EnumToString(side), EnumToString(entry),
                            EnumToString((ENUM_DEAL_REASON)reason), DoubleToString(price, (int)digits),
                            QuotePrice(stop, (int)digits), DoubleToString(volume, 8)) > 0;
   for(int i = 0; written && i < count; i++)
      written = FileWrite(file, "quote", ticks[i].time_msc, csv_symbol, chart,
                          QuotePrice(ticks[i].bid, (int)digits), QuotePrice(ticks[i].ask, (int)digits),
                          QuotePrice(ticks[i].last, (int)digits), "", "", "", "", "", "", "") > 0;

   FileClose(file);
   if(!written)
   {
      bool removed = FileDelete(path);
      Print("SpreadTrace History: write failed. Incomplete export ", removed ? "removed." : "may remain at " + path);
      return;
   }
   Print("SpreadTrace History: saved MQL5\\Files\\", path, " · tick status ", status,
         " · records ", MathMax(count, 0), " · tick API error ", tick_error);
}
