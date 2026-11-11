# Pullback research terminal

[Live terminal](https://soylee22.github.io/pullback-scanner/)

Weekly Simple Pullback / XL across 31 ETFs and 23 stocks. GitHub Actions scans and deploys without a local computer. No broker connection, orders or notifications.

## Evidence and execution

`scanner.py` downloads Yahoo dividend/split-adjusted daily OHLC, resamples to Friday-labelled weeks and retries short or failed batch responses individually. Only weeks whose Saturday UTC has arrived enter signal history. Live conditions remain provisional. Missing data is visible. Coverage below 50 aborts publication.

The original 20W Z-score thresholds remain −1.35 and −2.40. Close must be below the 20W and 50W means. Prior close must be below the prior 14W mean. The 14W rate of change must be negative now or previously. Episode latches reset at Z ≥ +0.25. XL can escalate inside an existing PB episode.

Ten-year evidence tiers require ten completed 52-week outcomes, ≥80% wins and positive median edge over unconditional same-asset entries. Tier 1 requires ≥12% median net return on PB. Tier 2 requires ≥15% on XL. The confidence interval is a descriptive 95% Wilson interval, assuming independent observations. Overlapping and correlated episodes violate that assumption.

Research enters at the next weekly adjusted open. Returns use GBP conversion and a multiplicative 20bp round-trip haircut. FX uses weekly closes, which approximates entry currency conversion. London quote units cancel in returns. Displayed adjusted threshold levels retain Yahoo quote units and are not executable limit prices. The same execution and costs apply to unconditional baselines. Global excess compares with SWDA's adjusted next-open-to-close return over matching dates. SWDA is a global developed-market comparator, not an all-cap world index.

Adverse paths use weekly closes, not intraday lows. Walk-forward eligibility uses only previously matured outcomes but does not undo selection of today's surviving watchlist or data revisions. Threshold and execution sweeps are descriptive, not a parameter search. Cost-of-waiting comparisons share one 104-week endpoint, with zero cash interest and three phased entries over eight weeks.

## Interface

Confirmed trigger queue, provisional and ongoing labels, threshold radar, market breadth heatmap, distributions, Wilson-confidence and tension maps, detailed price/mean charts, outcome paths and percentile lines, walk-forward statistics, cost/delay sensitivity, waiting comparisons and CSV exports.

Research-date replay hides future outcomes, recomputes matured-only tiers and suppresses full-sample diagnostics. Prices are revised history, not original point-in-time vintages. Search/date filters are shareable in the URL. Watchlists and entered portfolio weights remain in browser storage. The cash-contribution comparison measures historical GBP volatility and worst weeks under constant rebalanced weights, including retaining cash. It does not forecast return or suggest trade sizes.

`data/journal.json` retains immutable first-observed trigger snapshots. It does not backfill historical events. Forward research waits for the first full trading week after observation before entry. Recomputed outcomes live separately in the scan data, so revised historical entry returns never masquerade as forward fills.

Price correlations are exposure proxies, not ETF holdings overlap. Price data cannot identify deteriorating earnings, debt problems, multiples or causes of a crash. The terminal flags measured objections and missing evidence without inventing fundamentals. The 52W Z-score is diagnostic only.

## Run and check

```sh
python3 -m pip install -r requirements.txt
python3 -m unittest -v test_evidence
node --check app.js
python3 scanner.py
python3 -m http.server 8873
# Optional browser acceptance tests, with Playwright installed:
python3 smoke_browser.py http://127.0.0.1:8873 /tmp/pullback-browser
```

GitHub Actions retains weekday 16:45 and 21:30 UTC scans and Saturday 08:00 UTC confirmation. Actual starts may be delayed. The workflow runs the calculation tests before scanning, commits both scan and journal data, then deploys GitHub Pages. No retired strategy workflow is re-enabled.

Data API: [yfinance download documentation](https://ranaroussi.github.io/yfinance/reference/api/yfinance.download.html). Historical research is not a validated expected-return estimate.
