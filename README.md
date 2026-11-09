# Pullback

Weekly Simple Pullback and Pullback XL signals across 31 UK-listed ETFs and 23 global stocks.

Live site: https://soylee22.github.io/pullback-scanner/

## How it works

`scanner.py` downloads 15 years of adjusted weekly closes from Yahoo Finance. It applies the rules from `simple-pullback.pine` and writes `data/scan.json`. The static site (`index.html`, `styles.css`, `app.js`) reads that file.

A signal needs a weekly close below the 20-week and 50-week averages, a negative 14-week rate of change, and a 20-week Z-score at or below −1.35 (Pullback) or −2.40 (Pullback XL). One signal fires per episode. The episode resets at +0.25 SD.

Tiers come from the last ten years. Tier 1 won at least 80% of the time a year later with a median gain of 12% or more. Tier 2 meets that bar on XL signals only.

## Refresh

GitHub Actions runs `.github/workflows/scan.yml` on weekdays at 16:45 and 21:30 UTC and on Saturday at 08:00 UTC. Run it manually with:

```bash
gh workflow run scan.yml -R soylee22/pullback-scanner
```

Local preview:

```bash
python3 scanner.py && python3 -m http.server 8000
```

Research only. Past results do not guarantee future returns.
