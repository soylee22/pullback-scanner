import unittest
from tempfile import TemporaryDirectory
from pathlib import Path
import numpy as np
import pandas as pd
from evidence import weekly,split_weeks,indicators,triggers,threshold_price,summary,tier,analyse,wilson
from journal import update_journal

class EvidenceTests(unittest.TestCase):
 def frame(self,n=850):
  idx=pd.date_range('2007-01-05',periods=n,freq='W-FRI');c=pd.Series(100*np.exp(np.arange(n)*.001+np.sin(np.arange(n)/8)*.13),index=idx)
  return pd.DataFrame({'Open':c*.999,'High':c*1.03,'Low':c*.96,'Close':c})
 def test_confirm_saturday_not_friday(self):
  f=self.frame(60);fri=str(f.index[-1].date())
  a,b=split_weeks(f,fri+' 23:59:00+00:00');self.assertEqual(len(a),59)
  a,b=split_weeks(f,str((f.index[-1]+pd.Timedelta(days=1)).date())+' 00:00:00+00:00');self.assertEqual(len(a),60)
 def test_threshold_includes_candidate(self):
  p=np.arange(90.,109.)
  for z in [-1.1,-1.35,-2.4]:
   x=threshold_price(p,z);a=np.r_[p,x];self.assertAlmostEqual((x-a.mean())/a.std(),z,places=10)
 def test_constant_threshold_unavailable(self):self.assertIsNone(threshold_price([10]*19,-1.35))
 def test_missing_fx_does_not_inflate_sample(self):
  self.assertEqual(summary([{'ret_1y':float('nan')},{'ret_1y':12}])['count_1y'],1)
 def test_small_samples_never_top_tier(self):
  s=summary([{'ret_1y':20}]*3);self.assertEqual(tier(s,s,10)[0],3);self.assertAlmostEqual(wilson(3,3)[0],43.85,places=1)
 def test_positive_returns_need_baseline_edge(self):
  s=summary([{'ret_1y':20}]*20);self.assertEqual(tier(s,s,25)[0],4)
 def test_escalation_once_and_reset(self):
  n=60;f=pd.DataFrame({'close':[10]*n,'s14':[11]*n,'s20':[11]*n,'s50':[11]*n,'z':[0.]*n,'roc':[-1]*n})
  f.loc[50:52,'z']=[-1.4,-2.5,-2.8];f.loc[53,'z']=.3;f.loc[54,'z']=-2.5
  ev=triggers(f);self.assertEqual([(x[0],x[1]) for x in ev],[(50,'PULLBACK'),(51,'PULLBACK XL'),(54,'PULLBACK XL')])
 def test_live_cannot_change_confirmed_history(self):
  f=self.frame();now=str(f.index[-1].date())+' 20:00:00+00:00';fx=pd.Series(1.,index=f.index)
  a=analyse(f,fx,f,now);f.iloc[-1]=[1,1,1,1];b=analyse(f,fx,f,now)
  self.assertEqual(a['events'],b['events']);self.assertEqual(a['pb'],b['pb'])
 def test_execution_and_cost_alignment(self):
  f=self.frame();r=analyse(f,pd.Series(1.,index=f.index),f,'2030-01-01')
  for e in r['events']:
   if e['ret_1y'] is not None:
    j=f.index.get_loc(pd.Timestamp(e['date']))+1
    self.assertAlmostEqual(e['ret_1y'],(f.Close.iloc[j+51]/f.Open.iloc[j]*.998-1)*100)
    self.assertAlmostEqual(e['benchmark_excess'],0.)
 def test_journal_immutable_and_idempotent(self):
  r={'symbol':'X','label':'X','events':[{'date':'2026-11-06','type':'PULLBACK','price':10,'z20':-1.4}],'closed':{'date':'2026-11-06'},'tier':3,'pb':{'count_1y':2}}
  with TemporaryDirectory() as d:
   p=Path(d)/'journal.json';a=update_journal(p,[r],'2026-11-11T10:00:00Z','v2');r['events'][0]['price']=99
   b=update_journal(p,[r],'2026-11-12T10:00:00Z','v2');self.assertEqual(a['entries'],b['entries']);self.assertEqual(len(b['entries']),1)
 def test_weekly_resample(self):
  idx=pd.date_range('2026-11-02',periods=5);d=pd.DataFrame({'Open':range(10,15),'High':range(11,16),'Low':range(9,14),'Close':range(10,15)},index=idx)
  w=weekly(d);self.assertEqual(w.index[0],pd.Timestamp('2026-11-06'));self.assertEqual(w.Open.iloc[0],10);self.assertEqual(w.Close.iloc[0],14)
if __name__=='__main__':unittest.main()
