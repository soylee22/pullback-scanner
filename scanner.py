#!/usr/bin/env python3
"""Weekly Simple Pullback scanner.

Evaluates 54 instruments with the Simple Pullback rules from
SecondBrain/tools/tradingview-indicators/simple-pullback.pine and writes
data/scan.json for the static site.

Rules (weekly bars, dividend and split adjusted):
  PULLBACK     20W Z-score <= -1.35 SD
  PULLBACK XL  20W Z-score <= -2.40 SD
  Both require close < 20W SMA, close < 50W SMA, prior close < prior 14W SMA,
  and 14W ROC < 0 on this or the prior bar.
  One trigger per episode. The episode resets when Z-score >= +0.25 SD.
"""

from __future__ import annotations

import datetime as dt
import json
import math
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import yfinance as yf

HERE = Path(__file__).resolve().parent
OUT = HERE / "data" / "scan.json"
HISTORY_WEEKS = 104

# label, yahoo symbol, tradingview symbol, name, category
ETFS = [
    ("VUAG", "VUAG.L", "LSE:VUAG", "Vanguard S&P 500 Acc", "Core index"),
    ("CNX1", "CNX1.L", "LSE:CNX1", "iShares Nasdaq 100", "Tech / Nasdaq"),
    ("LQQ", "LQQ.PA", "EURONEXT:LQQ", "Amundi Nasdaq-100 2x Daily", "Leveraged"),
    ("SMGB", "SMGB.L", "LSE:SMGB", "VanEck Semiconductor", "Semiconductors"),
    ("IUMO", "IUMO.L", "LSE:IUMO", "iShares MSCI USA Momentum", "Factor"),
    ("SWDA", "SWDA.L", "LSE:SWDA", "iShares Core MSCI World", "Core index"),
    ("SSLN", "SSLN.L", "LSE:SSLN", "iShares Physical Silver", "Precious metals"),
    ("SGLN", "SGLN.L", "LSE:SGLN", "iShares Physical Gold", "Precious metals"),
    ("LQQ3", "LQQ3.L", "LSE:LQQ3", "WisdomTree Nasdaq 100 3x Daily", "Leveraged"),
    ("VUKG", "VUKG.L", "LSE:VUKG", "Vanguard FTSE 100 Acc", "Core index"),
    ("VFEG", "VFEG.L", "LSE:VFEG", "Vanguard FTSE Emerging Markets", "Regional"),
    ("VDPG", "VDPG.L", "LSE:VDPG", "Vanguard Developed Asia Pacific ex Japan", "Regional"),
    ("VEUA", "VEUA.L", "LSE:VEUA", "Vanguard FTSE Developed Europe", "Regional"),
    ("VJPB", "VJPB.L", "LSE:VJPB", "Vanguard FTSE Japan", "Regional"),
    ("VAGS", "VAGS.L", "LSE:VAGS", "Vanguard Global Aggregate Bond", "Bonds"),
    ("VNRG", "VNRG.L", "LSE:VNRG", "Vanguard FTSE North America", "Core index"),
    ("VHYL", "VHYL.L", "LSE:VHYL", "Vanguard All-World High Dividend", "Dividend"),
    ("TDGB", "TDGB.L", "LSE:TDGB", "VanEck Dividend Leaders", "Dividend"),
    ("IITU", "IITU.L", "LSE:IITU", "iShares S&P 500 IT Sector", "Tech / Nasdaq"),
    ("INRG", "INRG.L", "LSE:INRG", "iShares Global Clean Energy", "Thematic"),
    ("SEMI", "SEMI.L", "LSE:SEMI", "iShares MSCI Global Semiconductors", "Semiconductors"),
    ("QWTM", "QWTM.L", "LSE:QWTM", "Xtrackers MSCI World Momentum", "Factor"),
    ("IUKD", "IUKD.L", "LSE:IUKD", "iShares UK Dividend", "Dividend"),
    ("DGRG", "DGRG.L", "LSE:DGRG", "WisdomTree Quality Dividend Growth", "Dividend"),
    ("XDAX", "XDAX.L", "LSE:XDAX", "Xtrackers DAX", "Regional"),
    ("MWEP", "MWEP.L", "LSE:MWEP", "Xtrackers MSCI World Equal Weight", "Factor"),
    ("XWHS", "XWHS.L", "LSE:XWHS", "Xtrackers MSCI World Health Care", "Sector"),
    ("HPRO", "HPRO.L", "LSE:HPRO", "HSBC Developed Property", "Sector"),
    ("XWES", "XWES.L", "LSE:XWES", "Xtrackers MSCI World Energy", "Sector"),
    ("XWFS", "XWFS.L", "LSE:XWFS", "Xtrackers MSCI World Financials", "Sector"),
    ("XWCS", "XWCS.L", "LSE:XWCS", "Xtrackers MSCI World Consumer Staples", "Sector"),
]

STOCKS = [
    ("NVDA", "NVDA", "NASDAQ:NVDA", "Nvidia", "US Mag 7"),
    ("AAPL", "AAPL", "NASDAQ:AAPL", "Apple", "US Mag 7"),
    ("MSFT", "MSFT", "NASDAQ:MSFT", "Microsoft", "US Mag 7"),
    ("GOOGL", "GOOGL", "NASDAQ:GOOGL", "Alphabet", "US Mag 7"),
    ("AMZN", "AMZN", "NASDAQ:AMZN", "Amazon", "US Mag 7"),
    ("META", "META", "NASDAQ:META", "Meta Platforms", "US Mag 7"),
    ("TSLA", "TSLA", "NASDAQ:TSLA", "Tesla", "US Mag 7"),
    ("JPM", "JPM", "NYSE:JPM", "JPMorgan Chase", "US compounder"),
    ("COST", "COST", "NASDAQ:COST", "Costco", "US compounder"),
    ("WMT", "WMT", "NYSE:WMT", "Walmart", "US compounder"),
    ("BRK-B", "BRK-B", "NYSE:BRK.B", "Berkshire Hathaway", "US compounder"),
    ("MA", "MA", "NYSE:MA", "Mastercard", "US compounder"),
    ("V", "V", "NYSE:V", "Visa", "US compounder"),
    ("LLY", "LLY", "NYSE:LLY", "Eli Lilly", "US compounder"),
    ("ASML", "ASML.AS", "EURONEXT:ASML", "ASML Holding", "Europe semiconductor"),
    ("RR", "RR.L", "LSE:RR.", "Rolls-Royce", "UK blue chip"),
    ("AZN", "AZN.L", "LSE:AZN", "AstraZeneca", "UK blue chip"),
    ("BATS", "BATS.L", "LSE:BATS", "British American Tobacco", "UK blue chip"),
    ("BA", "BA.L", "LSE:BA.", "BAE Systems", "UK blue chip"),
    ("BP", "BP.L", "LSE:BP.", "BP", "UK blue chip"),
    ("LGEN", "LGEN.L", "LSE:LGEN", "Legal & General", "UK blue chip"),
    ("AV", "AV.L", "LSE:AV.", "Aviva", "UK blue chip"),
    ("RIO", "RIO.L", "LSE:RIO", "Rio Tinto", "UK blue chip"),
]


def clean(value: Any) -> Any:
    """Convert NaN and infinities to None so the output is valid JSON."""
    if isinstance(value, dict):
        return {k: clean(v) for k, v in value.items()}
    if isinstance(value, list):
        return [clean(v) for v in value]
    if isinstance(value, (float, np.floating)):
        v = float(value)
        return None if math.isnan(v) or math.isinf(v) else round(v, 4)
    if isinstance(value, np.integer):
        return int(value)
    return value


def bar_state(c, c_prev, s14_prev, s20, s50, z, r14, r14_prev) -> str:
    below = c < s20 and c < s50 and c_prev < s14_prev
    neg = r14 < 0.0 or r14_prev < 0.0
    if below and neg:
        if z <= -2.40:
            return "PULLBACK XL"
        if z <= -1.35:
            return "PULLBACK"
        if z <= -0.95:
            return "NEAR"
        return "BELOW 50W"
    if z <= -1.35 and neg and c >= s50:
        return "ABOVE 50W"
    return "NONE"


def summarise(signals: list[dict[str, Any]]) -> dict[str, Any]:
    if not signals:
        return {"count": 0, "count_1y": 0, "med_6m": None, "med_1y": None,
                "med_2y": None, "win_1y": None, "med_dd_3m": None}
    df = pd.DataFrame(signals)
    s1y = df["ret_1y"].dropna()
    return {
        "count": int(len(df)),
        "count_1y": int(len(s1y)),
        "med_6m": df["ret_6m"].dropna().median() if df["ret_6m"].notna().any() else None,
        "med_1y": s1y.median() if len(s1y) else None,
        "med_2y": df["ret_2y"].dropna().median() if df["ret_2y"].notna().any() else None,
        "win_1y": float((s1y > 0).mean() * 100.0) if len(s1y) else None,
        "med_dd_3m": df["dd_3m"].median(),
    }


def tier_for(pb: dict[str, Any], xl: dict[str, Any]) -> tuple[int, str]:
    if pb["win_1y"] is not None and pb["win_1y"] >= 80 and (pb["med_1y"] or 0) >= 12:
        return 1, "Buy every pullback"
    if xl["win_1y"] is not None and xl["win_1y"] >= 80 and (xl["med_1y"] or 0) >= 15:
        return 2, "Buy XL only"
    if pb["count_1y"] < 2:
        return 3, "Short history"
    if pb["win_1y"] is not None and pb["win_1y"] >= 70 and (pb["med_1y"] or 0) >= 9:
        return 3, "Selective"
    return 4, "Avoid"


def analyse(item: tuple, kind: str, close: pd.Series) -> dict[str, Any]:
    label, yf_sym, tv_sym, name, category = item
    close = close.dropna()
    sma14 = close.rolling(14).mean()
    sma20 = close.rolling(20).mean()
    sd20 = close.rolling(20).std(ddof=0)
    z20 = (close - sma20) / sd20
    sma50 = close.rolling(50).mean()
    sma200 = close.rolling(200).mean()
    roc14 = 100.0 * (close / close.shift(14) - 1.0)

    def state_at(i: int) -> str:
        return bar_state(close.iloc[i], close.iloc[i - 1], sma14.iloc[i - 1], sma20.iloc[i],
                         sma50.iloc[i], z20.iloc[i], roc14.iloc[i], roc14.iloc[i - 1])

    n = len(close)
    start = 50
    start_10y = max(50, n - 522)
    history_start = close.index[start].strftime("%Y-%m-%d")
    years = round((close.index[-1] - close.index[start]).days / 365.25, 1)
    start_year = int(close.index[start].strftime("%Y"))
    ep_pb = ep_xl = False
    pb_sigs_all: list[dict[str, Any]] = []
    xl_sigs_all: list[dict[str, Any]] = []
    pb_sigs_10y: list[dict[str, Any]] = []
    xl_sigs_10y: list[dict[str, Any]] = []
    events: list[dict[str, Any]] = []

    for i in range(start, n):
        z = z20.iloc[i]
        if np.isnan(z):
            continue
        if z >= 0.25:
            ep_pb = ep_xl = False
        st = state_at(i)
        is_xl = st == "PULLBACK XL"
        is_pb = st in ("PULLBACK", "PULLBACK XL")
        if not is_pb:
            continue
        c = float(close.iloc[i])
        fwd = lambda k: float(close.iloc[i + k]) / c * 100.0 - 100.0 if i + k < n else None  # noqa: E731
        entry = {
            "date": close.index[i].strftime("%Y-%m-%d"),
            "price": c,
            "z20": float(z),
            "ret_6m": fwd(26),
            "ret_1y": fwd(52),
            "ret_2y": fwd(104),
            "dd_3m": float(close.iloc[i:min(i + 14, n)].min()) / c * 100.0 - 100.0,
        }
        new_pb = is_pb and not ep_pb
        new_xl = is_xl and not ep_xl
        if new_pb:
            ep_pb = True
            pb_sigs_all.append(entry)
            if i >= start_10y:
                pb_sigs_10y.append(entry)
        if new_xl:
            ep_xl = True
            xl_sigs_all.append(entry)
            if i >= start_10y:
                xl_sigs_10y.append(entry)
        if new_pb or new_xl:
            events.append({**entry, "type": "PULLBACK XL" if new_xl else "PULLBACK"})

    pb = summarise(pb_sigs_all)
    xl = summarise(xl_sigs_all)
    tier, verdict = tier_for(pb, xl)

    pb_10y = summarise(pb_sigs_10y)
    xl_10y = summarise(xl_sigs_10y)
    tier_10y, verdict_10y = tier_for(pb_10y, xl_10y)

    closed_state = state_at(n - 2)
    live_state = state_at(n - 1)
    last_event = events[-1] if events else None
    weeks_since = None
    if last_event:
        weeks_since = int((close.index[-1] - pd.Timestamp(last_event["date"])).days // 7)

    h = max(0, n - HISTORY_WEEKS)
    return {
        "label": label,
        "symbol": yf_sym,
        "tv": tv_sym,
        "name": name,
        "category": category,
        "kind": kind,
        "weeks": n,
        "history_start": history_start,
        "start_year": start_year,
        "years": years,
        "price": float(close.iloc[-1]),
        "closed": {"date": close.index[-2].strftime("%Y-%m-%d"), "state": closed_state,
                   "z20": float(z20.iloc[-2]), "roc14": float(roc14.iloc[-2])},
        "live": {"date": close.index[-1].strftime("%Y-%m-%d"), "state": live_state,
                 "z20": float(z20.iloc[-1]), "roc14": float(roc14.iloc[-1])},
        "vs_sma50": float(close.iloc[-1] / sma50.iloc[-1] * 100.0 - 100.0),
        "vs_sma200": float(close.iloc[-1] / sma200.iloc[-1] * 100.0 - 100.0) if not np.isnan(sma200.iloc[-1]) else None,
        "last_event": last_event,
        "weeks_since_event": weeks_since,
        "pb": pb,
        "xl": xl,
        "tier": tier,
        "verdict": verdict,
        "pb_10y": pb_10y,
        "xl_10y": xl_10y,
        "tier_10y": tier_10y,
        "verdict_10y": verdict_10y,
        "events": events[-50:],
        "history": {
            "dates": [d.strftime("%Y-%m-%d") for d in close.index[h:]],
            "close": [float(v) for v in close.iloc[h:]],
            "z20": [float(v) for v in z20.iloc[h:]],
        },
    }


def main() -> None:
    items = [(e, "ETF") for e in ETFS] + [(s, "Stock") for s in STOCKS]
    symbols = [i[0][1] for i in items]
    print(f"Downloading all-time weekly data for {len(symbols)} instruments")
    raw = yf.download(symbols, period="max", interval="1wk", progress=False, auto_adjust=True)
    rows, failed = [], []
    for item, kind in items:
        try:
            series = raw["Close"][item[1]].dropna()
            if len(series) < 60:
                raise ValueError("fewer than 60 weekly bars")
            rows.append(analyse(item, kind, series))
        except Exception as exc:  # keep the rest of the scan
            failed.append({"symbol": item[1], "error": str(exc)})
            print(f"  failed {item[1]}: {exc}")
    payload = {
        "generated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "rules": {"pullback_z": -1.35, "xl_z": -2.40, "reset_z": 0.25, "z_len": 20,
                  "roc_len": 14, "sma_med": 50, "timeframe": "1W"},
        "count": len(rows),
        "failed": failed,
        "instruments": rows,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(clean(payload), separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUT} with {len(rows)} instruments ({len(failed)} failed)")


if __name__ == "__main__":
    main()
