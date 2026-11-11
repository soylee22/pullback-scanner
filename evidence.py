"""Auditable weekly research. No order placement or inferred fundamentals."""
from __future__ import annotations
import math
import numpy as np
import pandas as pd

VERSION = 'weekly-v2'
MIN_SAMPLE = 10
COST_BPS = 20  # total round-trip haircut, applied multiplicatively

def weekly(daily):
    d = daily.copy()
    d.index = pd.to_datetime(d.index).tz_localize(None).normalize()
    d=d.where(d>0).dropna(subset=['Open','Close'])
    return d.resample('W-FRI').agg({'Open':'first','High':'max','Low':'min','Close':'last'}).dropna()

def split_weeks(frame, now=None):
    now = pd.Timestamp(now or pd.Timestamp.now(tz='UTC'))
    if now.tzinfo: now = now.tz_convert('UTC').tz_localize(None)
    mask = frame.index + pd.Timedelta(days=1) <= now
    return frame.loc[mask], frame.loc[~mask]

def indicators(c):
    mean = c.rolling(20).mean()
    return pd.DataFrame({'close':c,'s14':c.rolling(14).mean(),'s20':mean,'s50':c.rolling(50).mean(),
                         'z':(c-mean)/c.rolling(20).std(ddof=0),'z52':(c-c.rolling(52).mean())/c.rolling(52).std(ddof=0),
                         'roc':c.pct_change(14,fill_method=None)*100})

def state(f,i,threshold=-1.35):
    r,p=f.iloc[i],f.iloc[i-1]
    below = r.close < r.s20 and r.close < r.s50 and p.close < p.s14
    neg = r.roc < 0 or p.roc < 0
    if below and neg and r.z <= threshold: return 'PULLBACK XL' if r.z <= -2.4 else 'PULLBACK'
    if below and neg and r.z <= -.95:return 'NEAR'
    return 'NONE'

def triggers(f, threshold=-1.35):
    pb=xl=False; events=[]
    for i in range(50,len(f)):
        if f.z.iloc[i]>=.25:pb=xl=False
        st=state(f,i,threshold)
        if st not in ['PULLBACK','PULLBACK XL']:continue
        new_pb=not pb; new_xl=st=='PULLBACK XL' and not xl
        if new_pb or new_xl:events.append((i,'PULLBACK XL' if new_xl else 'PULLBACK',new_pb,new_xl))
        pb=True
        if st=='PULLBACK XL':xl=True
    return events

def wilson(w,n):
    if not n:return [None,None]
    z=1.95996398454;p=w/n;a=1+z*z/n
    mid=(p+z*z/(2*n))/a;half=z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/a
    return [(mid-half)*100,(mid+half)*100]

def summary(events):
    vals=[e['ret_1y'] for e in events if e.get('ret_1y') is not None and math.isfinite(e['ret_1y'])]
    n=len(vals);w=sum(v>0 for v in vals)
    med=lambda key:float(np.median([e[key] for e in events if e.get(key) is not None and math.isfinite(e[key])])) if any(e.get(key) is not None and math.isfinite(e[key]) for e in events) else None
    return {'count':len(events),'count_1y':n,'win_1y':w/n*100 if n else None,'wilson':wilson(w,n),
            'med_1y':float(np.median(vals)) if n else None,'med_6m':med('ret_6m'),'med_2y':med('ret_2y'),
            'distribution':list(np.percentile(vals,[0,25,50,75,100])) if n else [],
            'med_mae':med('mae'),'med_trough_weeks':med('trough_weeks'),'med_recovery_weeks':med('recovery_weeks'),
            'med_dd_3m':med('dd_3m'),'benchmark_excess':med('benchmark_excess'),
            'confidence':'Established sample' if n>=30 else 'Limited sample' if n>=MIN_SAMPLE else 'Unproven'}

def tier(pb,xl,baseline=None):
    def qualifies(s,ret):
        return s['count_1y']>=MIN_SAMPLE and s['win_1y']>=80 and s['med_1y']>=ret and baseline is not None and s['med_1y']>baseline
    if qualifies(pb,12):return 1,'Pullback evidence'
    if qualifies(xl,15):return 2,'XL evidence'
    return (3,'Unproven') if pb['count_1y']<MIN_SAMPLE else (4,'No demonstrated edge')

def threshold_price(previous,z):
    """Solve an inclusive 20-observation population Z-score for candidate close."""
    x=np.asarray(previous,dtype=float)[-19:]
    if len(x)!=19 or np.std(x)==0:return None
    m=x.mean();ss=((x-m)**2).sum();n=20
    d=z*math.sqrt(n*ss/((n-1)*((n-1)-z*z)))
    return float(m+d)

def analyse(frame, fx, benchmark, now=None):
    confirmed,live=split_weeks(frame,now)
    if len(confirmed)<60:raise ValueError('fewer than 60 confirmed weekly bars')
    c=confirmed.Close;f=indicators(c);events=[]
    # Conversion is a ratio. Pence versus pounds cancels for returns.
    fx=fx.reindex(c.index).ffill();gbp=c*fx
    op=confirmed.Open*fx
    bm=(benchmark.Close if isinstance(benchmark,pd.DataFrame) else benchmark).reindex(c.index).ffill()
    bm_open=(benchmark.Open if isinstance(benchmark,pd.DataFrame) else benchmark).reindex(c.index).ffill()
    end=len(c)-1;cut=c.index[-1]-pd.DateOffset(years=10)
    for i,kind,new_pb,new_xl in triggers(f):
        j=i+1
        e={'date':str(c.index[i].date()),'type':kind,'new_pb':new_pb,'new_xl':new_xl,'price':float(c.iloc[i]),'z20':float(f.z.iloc[i]),
           'entry_date':str(c.index[j].date()) if j<=end else None,'entry_price':float(op.iloc[j]) if j<=end else None}
        for key,h in [('ret_6m',26),('ret_1y',52),('ret_2y',104)]:
            k=j+h-1
            e[key]=float((gbp.iloc[k]/op.iloc[j]*(1-COST_BPS/10000)-1)*100) if k<=end and j<=end else None
            e[key+'_date']=str(c.index[k].date()) if k<=end else None
        mature=e['ret_1y'] is not None
        path=(gbp.iloc[j:j+52]/op.iloc[j]-1)*100 if j<=end else pd.Series(dtype=float)
        e['path']=list(path.values) if mature else []
        e['mae']=float(min(0,path.min())) if mature else None
        e['trough_weeks']=int(np.argmin(path.values))+1 if mature else None
        recovery=[k+1 for k,v in enumerate(path) if v>=0]
        e['recovery_weeks']=recovery[0] if mature and recovery else None
        e['dd_3m']=float(min(0,path.iloc[:13].min())) if len(path)>=13 else None
        e['benchmark_excess']=e['ret_1y']-float((bm.iloc[j+51]/bm_open.iloc[j]*(1-COST_BPS/10000)-1)*100) if mature and pd.notna(bm.iloc[j]) and pd.notna(bm.iloc[j+51]) else None
        events.append(e)
    recent=[e for e in events if pd.Timestamp(e['date'])>=cut]
    pb=summary([e for e in recent if e['new_pb']]);xl=summary([e for e in recent if e['new_xl']])
    # Same next-week-open execution and costs at every eligible weekly observation.
    baseline=[]
    for i in range(50,end-51):
        if c.index[i]<cut:continue
        baseline.append(float((gbp.iloc[i+52]/op.iloc[i+1]*(1-COST_BPS/10000)-1)*100))
    unconditional=float(np.median(baseline)) if baseline else None
    t,v=tier(pb,xl,unconditional)
    for s in [pb,xl]:s['baseline_edge']=s['med_1y']-unconditional if s['med_1y'] is not None and unconditional is not None else None
    # Expanding, matured-only qualification. Current universe is survivorship-biased.
    wf=[]
    for e in recent:
        if e['ret_1y'] is None:continue
        known=[x for x in events if x['ret_1y_date'] and x['ret_1y_date']<e['date'] and pd.Timestamp(x['date'])>=pd.Timestamp(e['date'])-pd.DateOffset(years=10)]
        eligible_baseline=[]
        ei=c.index.get_loc(pd.Timestamp(e['date']))
        for i in range(max(50,ei-522),ei-52):eligible_baseline.append(float((gbp.iloc[i+52]/op.iloc[i+1]*(1-COST_BPS/10000)-1)*100))
        b=float(np.median(eligible_baseline)) if eligible_baseline else None
        wt,_=tier(summary([x for x in known if x['new_pb']]),summary([x for x in known if x['new_xl']]),b)
        if wt==1 or wt==2 and e['new_xl']:wf.append(e)
    # One pot, same fixed 104-week endpoint. Cash earns zero. Sample annual starts.
    wait=[];sigidx=[i for i,*_ in triggers(f)]
    for i in range(max(50,end-522),end-103,52):
        entry=i+1;k=i+104;later=next((j+1 for j in sigidx if i<=j<i+52),None)
        immediate=(gbp.iloc[k]/op.iloc[entry]*(1-COST_BPS/10000)-1)*100
        waiting=(gbp.iloc[k]/op.iloc[later]*(1-COST_BPS/10000)-1)*100 if later else 0
        phased=np.mean([(gbp.iloc[k]/op.iloc[entry+q]*(1-COST_BPS/10000)-1)*100 for q in [0,4,8]])
        wait.append({'start':str(c.index[i].date()),'immediate':immediate,'waiting':waiting,'phased':phased,'weeks_cash':later-entry if later else 104})
    sensitivity=[]
    for z in [-1.1,-1.35,-1.6]:
        dates={str(c.index[i].date()) for i,*_ in triggers(f,z)}
        vals=[]
        for i,*_ in triggers(f,z):
            if i+52<=end and c.index[i]>=cut:vals.append((gbp.iloc[i+52]/op.iloc[i+1]*(1-COST_BPS/10000)-1)*100)
        sensitivity.append({'threshold':z,'n':len(vals),'median':float(np.median(vals)) if vals else None})
    execution_stress=[]
    for delay,bps in [(0,20),(0,40),(1,20),(1,40)]:
        vals=[]
        for i,*_ in triggers(f):
            j=i+1+delay;k=j+51
            if k<=end and c.index[i]>=cut:
                vals.append((gbp.iloc[k]/op.iloc[j]*(1-bps/10000)-1)*100)
        execution_stress.append({'delay_weeks':delay,'cost_bps':bps,'n':len(vals),'median':float(np.median(vals)) if vals else None})
    current=indicators(frame.Close)
    last=f.iloc[-1];ls=current.iloc[-1]
    last_event=events[-1] if events else None
    closed_date=str(c.index[-1].date())
    fresh=last_event if last_event and last_event['date']==closed_date else None
    h=frame.index>=c.index[-1]-pd.DateOffset(years=16)
    hist=current.loc[h]
    return {'tier':t,'verdict':v,'pb':pb,'xl':xl,'pb_10y':pb,'xl_10y':xl,
            'all_pb':summary([e for e in events if e['new_pb']]),'all_xl':summary([e for e in events if e['new_xl']]),
            'execution_stress':execution_stress,'baseline':unconditional,'walkforward':summary(wf),'waiting':wait,'sensitivity':sensitivity,
            'closed':{'date':closed_date,'state':state(f,len(f)-1),'z20':last.z,'roc14':last.roc,'trigger':fresh['type'] if fresh else None},
            'live':{'date':str(frame.index[-1].date()),'state':state(current,len(current)-1),'z20':ls.z,'roc14':ls.roc,'provisional':bool(len(live))},
            'price':float(frame.Close.iloc[-1]),'vs_sma50':(ls.close/ls.s50-1)*100,
            'radar':{'pb_price':threshold_price(frame.Close.iloc[:-1] if len(live) else frame.Close,-1.35),'xl_price':threshold_price(frame.Close.iloc[:-1] if len(live) else frame.Close,-2.4),
                     'conditions':int(ls.close<ls.s20)+int(ls.close<ls.s50)+int(current.close.iloc[-2]<current.s14.iloc[-2])+int(ls.roc<0 or current.roc.iloc[-2]<0),
                     'z52':ls.z52},
            'events':events,'last_event':last_event,'weeks':len(c),'years':round(len(c)/52,1),'start_year':c.index[50].year,
            'history':{'dates':[str(x.date()) for x in hist.index],**{k:list(hist[key]) for k,key in [('close','close'),('z20','z'),('sma20','s20'),('sma50','s50'),('roc14','roc')]},'open_gbp':list((frame.Open*fx.reindex(frame.index).ffill()).loc[h]),'gbp':list((frame.Close*fx.reindex(frame.index).ffill()).loc[h])}}
