"""Append-only first-observed evidence, separate from recomputed backtests."""
import json
from pathlib import Path

def update_journal(path, rows, generated, version):
    path=Path(path)
    data=json.loads(path.read_text()) if path.exists() else {'started':generated,'entries':[]}
    keys={(e['symbol'],e['date'],e['type'],e['version']) for e in data['entries']}
    for r in rows:
        for e in r['events']:
            # No retrospective seeding: only a trigger on the latest confirmed week.
            if e['date']!=r['closed']['date']:continue
            key=(r['symbol'],e['date'],e['type'],version)
            if key in keys:continue
            data['entries'].append({'symbol':r['symbol'],'label':r['label'],'date':e['date'],'type':e['type'],
                                    'version':version,'observed_at':generated,'native_adjusted_price':e['price'],
                                    'z20':e['z20'],'tier_observed':r['tier'],'mature_n':r['pb']['count_1y']})
            keys.add(key)
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(data,indent=2,allow_nan=False)+'\n')
    return data
