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


def main():
    from evidence import analyse, weekly, VERSION, COST_BPS
    from journal import update_journal
    items = [(x,"ETF") for x in ETFS] + [(x,"Stock") for x in STOCKS]
    symbols = [x[0][1] for x in items] + ["GBPUSD=X", "EURGBP=X"]
    now = dt.datetime.now(dt.timezone.utc)
    print("Downloading adjusted daily OHLC", flush=True)
    raw = yf.download(symbols, period="max", interval="1d", auto_adjust=True, progress=False, threads=8)
    frames = {}
    for sym in symbols:
        try:
            d = raw.xs(sym,axis=1,level=1).dropna(subset=["Close"])
            if len(d)<300:raise ValueError("short batch response")
            frames[sym]=weekly(d)
        except Exception:
            try:
                d=yf.Ticker(sym).history(period="max",interval="1d",auto_adjust=True)
                frames[sym]=weekly(d)
            except Exception as e: print("Retry failed",sym,str(e)[:100])
    rows=[];failed=[]
    benchmark=frames.get("SWDA.L")
    if benchmark is None: raise RuntimeError("Global benchmark unavailable, refusing incomplete research")
    for item,kind in items:
        label,sym,tv,name,category=item
        try:
            frame=frames[sym]
            currency="GBP" if sym.endswith(".L") else "EUR" if sym.endswith((".PA",".AS")) else "USD"
            fx = pd.Series(1.,index=frame.index) if currency=="GBP" else frames["EURGBP=X"].Close if currency=="EUR" else 1/frames["GBPUSD=X"].Close
            row=analyse(frame,fx,benchmark,now)
            row.update(label=label,symbol=sym,tv=tv,name=name,category=category,kind=kind,currency=currency,
                       source="https://finance.yahoo.com/quote/"+sym+"/history/",quote_units="Yahoo adjusted quote units")
            rows.append(row)
        except Exception as exc:
            failed.append({"symbol":sym,"error":str(exc)[:180]});print("FAILED",sym,str(exc),flush=True)
    if len(rows)<50:raise RuntimeError("Coverage below 50, preserving previous published data")
    # Price-based correlations, never claims about fund holdings or independent bets.
    prices=pd.DataFrame({r['symbol']:frames[r['symbol']].Close for r in rows})
    corr=prices.pct_change(fill_method=None).tail(104).corr(min_periods=52)
    zs=[r['live']['z20'] for r in rows if math.isfinite(r['live']['z20'])]
    median_z=float(np.median(zs))
    for r in rows:
        r['peers']=[{'symbol':s,'correlation':float(v)} for s,v in corr[r['symbol']].drop(r['symbol']).dropna().sort_values(ascending=False).head(5).items()]
        r['relative_z']=r['live']['z20']-median_z
        r['objections']=[]
        sample=r['xl'] if r['tier']==2 else r['pb']
        if sample['count_1y']<10:r['objections'].append('Fewer than ten mature one-year episodes')
        if (sample['baseline_edge'] or 0)<=0:r['objections'].append('No positive median edge over unconditional entries')
        if r['live']['state']=='PULLBACK XL' and np.mean([z<=-1.35 for z in zs])<.2:r['objections'].append('Isolated extreme: investigate company or exposure-specific causes')
        if r['category']=='Leveraged':r['objections'].append('Daily-reset leveraged exposure: path and financing matter')
        if sample['med_mae'] is not None and sample['med_mae'] < -20:r['objections'].append('Median post-entry weekly-close loss exceeds 20%')
        if r['live']['provisional']:r['objections'].append('Current week remains provisional')
    generated=now.strftime("%Y-%m-%dT%H:%M:%SZ")
    journal=update_journal(HERE/'data'/'journal.json',rows,generated,VERSION)
    outcomes=[]
    for entry in journal['entries']:
        row=next((r for r in rows if r['symbol']==entry['symbol']),None)
        if not row:continue
        h=row['history']; obs=pd.Timestamp(entry['observed_at']).tz_localize(None)
        candidates=[i for i,d in enumerate(h['dates']) if pd.Timestamp(d)-pd.Timedelta(days=4)>obs and d<=row['closed']['date']]
        if not candidates:continue
        j=candidates[0];k=j+51
        outcome=(h['gbp'][k]/h['open_gbp'][j]*(1-COST_BPS/10000)-1)*100 if k<len(h['dates']) and h['dates'][k]<=row['closed']['date'] else None
        outcomes.append({'symbol':entry['symbol'],'date':entry['date'],'type':entry['type'],'version':entry['version'],'entry_week':h['dates'][j],'net_1y_gbp':outcome})
    payload={'generated':generated,'model_version':VERSION,'configured':len(items),'count':len(rows),'failed':failed,
             'rules':{'pullback_z':-1.35,'xl_z':-2.4,'reset_z':.25,'timeframe':'1W','minimum_mature_events':10,'cost_bps':COST_BPS},
             'weather':{'pullback_pct':float(np.mean([z<=-1.35 for z in zs])*100),'xl_pct':float(np.mean([z<=-2.4 for z in zs])*100),'median_z':median_z},
             'journal_count':len(journal['entries']),'forward_outcomes':outcomes,'instruments':rows}
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(clean(payload),separators=(',',':'),allow_nan=False))
    print('Wrote',len(rows),'instruments,',len(failed),'failed',flush=True)

if __name__ == '__main__':
    main()
