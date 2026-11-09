/* Pullback scanner front end. Reads data/scan.json produced by scanner.py. */
(function () {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const fmtPct = (v, d = 1) => (v === null || v === undefined ? "–" : (v >= 0 ? "+" : "") + v.toFixed(d) + "%");
  const cls = (v) => (v === null || v === undefined ? "dim" : v >= 0 ? "pos" : "neg");

  /* ── Hero field: vertical dashes on drifting wave arcs ─────────────── */
  function startField() {
    const cv = $("#field");
    const ctx = cv.getContext("2d");
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w, h, dpr, cols, rows, accents;

    function resize() {
      dpr = Math.min(devicePixelRatio || 1, 2);
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / 26) + 2;
      rows = Math.ceil(h / 52) + 2;
      accents = new Set();
      for (let i = 0; i < Math.round(cols * rows * 0.012); i++) accents.add(Math.floor(Math.random() * cols * rows));
    }

    function draw(t) {
      ctx.clearRect(0, 0, w, h);
      const time = t * 0.00012;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const nx = c / cols, ny = r / rows;
          // Concentric arcs centred low in the frame, gently breathing.
          const dx = (nx - 0.5) * 1.6, dy = ny - 1.05;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const wave = Math.sin(dist * 22 - time * 14);
          const x = c * 26 + Math.sin(dist * 9 - time * 6) * 9;
          const y = r * 52 + (c % 2) * 26;
          const vis = (wave + 1) / 2;
          if (vis < 0.35) continue;
          const fade = Math.min(1, ny * 1.25) * (0.25 + vis * 0.75);
          const accent = accents.has(r * cols + c);
          ctx.fillStyle = accent ? `rgba(30,110,243,${0.95 * fade})` : `rgba(160,169,177,${0.55 * fade})`;
          ctx.fillRect(x, y, 2, 26 + vis * 10);
        }
      }
      if (!reduce) requestAnimationFrame(draw);
    }

    resize();
    addEventListener("resize", resize);
    requestAnimationFrame(draw);
  }

  /* ── Split headline reveal ─────────────────────────────────────────── */
  function splitHeadline() {
    document.querySelectorAll(".split").forEach((el) => {
      el.innerHTML = el.innerHTML
        .split(/(<br>)/)
        .map((part) => (part === "<br>" ? part : part.split(" ").filter(Boolean).map((wd) => `<span class="w"><span>${wd}</span></span>`).join(" ")))
        .join("");
      el.querySelectorAll(".w > span").forEach((s, i) => (s.style.transitionDelay = 120 + i * 70 + "ms"));
      requestAnimationFrame(() => el.classList.add("in"));
    });
  }

  /* ── Signal helpers ────────────────────────────────────────────────── */
  const STRENGTH = { "PULLBACK XL": 3, PULLBACK: 2, "ABOVE 50W": 1, NEAR: 1 };

  function currentSignal(r) {
    // Strongest of the closed bar, the live bar, or an episode trigger in the last two weeks.
    let best = { state: "NONE", when: "" };
    const consider = (state, when) => {
      if ((STRENGTH[state] || 0) > (STRENGTH[best.state] || 0)) best = { state, when };
    };
    consider(r.closed.state, "Closed " + shortDate(r.closed.date));
    consider(r.live.state, "Live this week");
    if (r.last_event && r.weeks_since_event !== null && r.weeks_since_event <= 2) consider(r.last_event.type, "Fired " + shortDate(r.last_event.date));
    return best;
  }

  function shortDate(iso) {
    const d = new Date(iso + "T00:00:00Z");
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  }

  function badge(state) {
    if (state === "PULLBACK XL") return '<span class="badge b-xl">PULLBACK XL</span>';
    if (state === "PULLBACK") return '<span class="badge b-pb">PULLBACK</span>';
    if (state === "ABOVE 50W") return '<span class="badge b-watch">WATCH · ABOVE 50W</span>';
    if (state === "NEAR") return '<span class="badge b-watch">NEAR</span>';
    return '<span class="badge b-none">—</span>';
  }

  function stat(s) {
    if (!s || s.med_1y === null) return `<span class="dim">n=${s ? s.count : 0}</span>`;
    return `<span class="${cls(s.med_1y)}">${fmtPct(s.med_1y)}</span> <span class="dim">${Math.round(s.win_1y)}% · ${s.count}</span>`;
  }

  /* ── Charts ────────────────────────────────────────────────────────── */
  function spark(values, events, dates, height = 64, width = 300) {
    const v = values.filter((x) => x !== null);
    if (v.length < 2) return "";
    const min = Math.min(...v), max = Math.max(...v);
    const x = (i) => (i / (values.length - 1)) * width;
    const y = (val) => height - 4 - ((val - min) / (max - min || 1)) * (height - 8);
    const d = values.map((val, i) => (val === null ? "" : `${i ? "L" : "M"}${x(i).toFixed(1)},${y(val).toFixed(1)}`)).join("");
    const marks = (events || [])
      .map((e) => {
        const i = dates.indexOf(e.date);
        if (i < 0) return "";
        return `<circle cx="${x(i)}" cy="${y(values[i])}" r="3.2" fill="${e.type === "PULLBACK XL" ? "#1E6EF3" : "#fff"}"/>`;
      })
      .join("");
    return `<svg class="card-spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="#a0a9b1" stroke-width="1.4" vector-effect="non-scaling-stroke"/>${marks}</svg>`;
  }

  function priceChart(r) {
    const W = 600, H = 220, P = 10;
    const c = r.history.close, dates = r.history.dates;
    const min = Math.min(...c), max = Math.max(...c);
    const x = (i) => P + (i / (c.length - 1)) * (W - 2 * P);
    const y = (v) => H - P - ((v - min) / (max - min || 1)) * (H - 2 * P);
    const path = c.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
    const area = path + `L${x(c.length - 1)},${H}L${x(0)},${H}Z`;
    const marks = r.events
      .map((e) => {
        const i = dates.indexOf(e.date);
        if (i < 0) return "";
        const col = e.type === "PULLBACK XL" ? "#1E6EF3" : "#fff";
        return `<line x1="${x(i)}" x2="${x(i)}" y1="${P}" y2="${H}" stroke="${col}" stroke-opacity=".25"/><circle cx="${x(i)}" cy="${y(c[i])}" r="4.5" fill="${col}" stroke="#000" stroke-width="1.5"/>`;
      })
      .join("");
    return `<svg viewBox="0 0 ${W} ${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1E6EF3" stop-opacity=".22"/><stop offset="1" stop-color="#1E6EF3" stop-opacity="0"/></linearGradient></defs><path d="${area}" fill="url(#g)"/><path d="${path}" fill="none" stroke="#fff" stroke-width="1.6"/>${marks}</svg>`;
  }

  function zChart(r) {
    const W = 600, H = 150, P = 10;
    const z = r.history.z20;
    const lo = Math.min(-3.2, ...z.filter((v) => v !== null)), hi = Math.max(3, ...z.filter((v) => v !== null));
    const x = (i) => P + (i / (z.length - 1)) * (W - 2 * P);
    const y = (v) => P + ((hi - v) / (hi - lo)) * (H - 2 * P);
    const path = z.map((v, i) => (v === null ? "" : `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)).join("");
    const line = (v, col, dash) => `<line x1="${P}" x2="${W - P}" y1="${y(v)}" y2="${y(v)}" stroke="${col}" stroke-dasharray="${dash}" stroke-width="1"/><text x="${W - P - 2}" y="${y(v) - 4}" fill="${col}" font-size="10" text-anchor="end" font-family="JetBrains Mono">${v.toFixed(2)}</text>`;
    return `<svg viewBox="0 0 ${W} ${H}">${line(0, "#2e2e2e", "0")}${line(-1.35, "#a0a9b1", "4 4")}${line(-2.4, "#1E6EF3", "4 4")}<path d="${path}" fill="none" stroke="#fff" stroke-width="1.4"/></svg>`;
  }

  /* ── Render ────────────────────────────────────────────────────────── */
  let DATA = null;
  let filter = "all";
  let sortKey = "signal";
  let sortAsc = false;

  const SORT_LABEL = {
    signal: "signal strength (XL, then Pullback, then watch), then tier, then Z-score",
    label: "ticker", z: "20-week Z-score", roc: "14-week rate of change", s50: "distance from the 50-week average",
    pb: "median one-year return after any pullback", xl: "median one-year return after an XL", dd: "typical three-month dip after entry", tier: "backtest tier",
  };

  function sortVal(r, k) {
    switch (k) {
      case "signal": return (STRENGTH[r._sig.state] || 0) * 1000 + (5 - r.tier) * 100 - r.live.z20;
      case "label": return r.label;
      case "z": return r.live.z20;
      case "roc": return r.live.roc14;
      case "s50": return r.vs_sma50;
      case "pb": return r.pb.med_1y ?? -999;
      case "xl": return r.xl.med_1y ?? -999;
      case "dd": return r.pb.med_dd_3m ?? -999;
      case "tier": return r.tier;
    }
  }

  function isActionable(r) {
    return r.tier <= 2 && (STRENGTH[r._sig.state] || 0) >= 2;
  }

  function renderCards() {
    const list = DATA.instruments.filter(isActionable).sort((a, b) => sortVal(b, "signal") - sortVal(a, "signal"));
    $("#cardsEmpty").hidden = list.length > 0;
    $("#cards").innerHTML = list
      .map((r) => `
      <article class="card" data-sym="${r.symbol}">
        <div class="card-top">
          <div><div class="card-ticker">${r.label}</div><div class="card-name">${r.name}</div></div>
          <div>${badge(r._sig.state)}<span class="when">${r._sig.when}</span></div>
        </div>
        ${spark(r.history.close.slice(-52), r.events, r.history.dates.slice(-52))}
        <div class="card-grid">
          <div><span class="k">20W Z</span><span class="v">${r.live.z20.toFixed(2)}</span></div>
          <div><span class="k">${r.tier === 2 ? "XL 1Y" : "PB 1Y"}</span><span class="v ${cls(r.tier === 2 ? r.xl.med_1y : r.pb.med_1y)}">${fmtPct(r.tier === 2 ? r.xl.med_1y : r.pb.med_1y)}</span></div>
          <div><span class="k">Win rate</span><span class="v">${Math.round((r.tier === 2 ? r.xl.win_1y : r.pb.win_1y) ?? 0)}%</span></div>
        </div>
        <div class="card-foot"><span>Tier ${r.tier} · ${r.verdict}</span><span>n=${r.tier === 2 ? r.xl.count : r.pb.count} (${r.years}Y) · dip ${fmtPct(r.pb.med_dd_3m)}</span></div>
      </article>`)
      .join("");
  }

  function renderTable() {
    const q = $("#search").value.trim().toLowerCase();
    let rows = DATA.instruments.filter((r) => {
      if (q && !(r.label + " " + r.symbol + " " + r.name + " " + r.category).toLowerCase().includes(q)) return false;
      if (filter === "active") return (STRENGTH[r._sig.state] || 0) >= 1;
      if (filter === "t12") return r.tier <= 2;
      if (filter === "ETF" || filter === "Stock") return r.kind === filter;
      return true;
    });
    rows.sort((a, b) => {
      const va = sortVal(a, sortKey), vb = sortVal(b, sortKey);
      const cmp = typeof va === "string" ? va.localeCompare(vb) : va - vb;
      return sortAsc ? cmp : -cmp;
    });
    document.querySelectorAll("th").forEach((th) => {
      th.classList.toggle("sorted", th.dataset.k === sortKey);
      th.classList.toggle("asc", th.dataset.k === sortKey && sortAsc);
    });
    $("#sortNote").textContent = `Sorted by ${SORT_LABEL[sortKey]} · ${rows.length} shown · click any column to re-sort`;
    $("#tbl tbody").innerHTML = rows
      .map((r) => `
      <tr data-sym="${r.symbol}">
        <td><span class="t-ticker">${r.label}</span><span class="t-name">${r.name} <span class="mono dim">· ${r.start_year || ''} (${r.years}Y)</span></span></td>
        <td>${badge(r._sig.state)}${r._sig.state !== "NONE" ? `<span class="when" style="text-align:left">${r._sig.when}</span>` : ""}</td>
        <td class="num">${r.live.z20.toFixed(2)}</td>
        <td class="num ${cls(r.live.roc14)}">${fmtPct(r.live.roc14)}</td>
        <td class="num ${cls(r.vs_sma50)}">${fmtPct(r.vs_sma50)}</td>
        <td class="num">${stat(r.pb)}</td>
        <td class="num">${stat(r.xl)}</td>
        <td class="num dim">${fmtPct(r.pb.med_dd_3m)}</td>
        <td><span class="tier tier-${r.tier}">${r.verdict}</span></td>
      </tr>`)
      .join("");
  }

  function openDrawer(sym) {
    const r = DATA.instruments.find((x) => x.symbol === sym);
    if (!r) return;
    const evRows = r.events
      .slice()
      .reverse()
      .map((e) => `<tr><td>${shortDate(e.date)} ${e.date.slice(0, 4)}</td><td>${badge(e.type)}</td><td class="num">${e.z20.toFixed(2)}</td><td class="num ${cls(e.ret_6m)}">${fmtPct(e.ret_6m)}</td><td class="num ${cls(e.ret_1y)}">${fmtPct(e.ret_1y)}</td><td class="num dim">${fmtPct(e.dd_3m)}</td></tr>`)
      .join("");
    const dl = (s) => `<dl><dt>Signals</dt><dd>${s.count}</dd><dt>Median 6M</dt><dd>${fmtPct(s.med_6m)}</dd><dt>Median 1Y</dt><dd class="${cls(s.med_1y)}">${fmtPct(s.med_1y)}</dd><dt>Median 2Y</dt><dd>${fmtPct(s.med_2y)}</dd><dt>1Y win rate</dt><dd>${s.win_1y === null ? "–" : Math.round(s.win_1y) + "%"}</dd><dt>3M dip</dt><dd>${fmtPct(s.med_dd_3m)}</dd></dl>`;
    $("#dBody").innerHTML = `
      <p class="eyebrow mono">${r.kind} · ${r.category}</p>
      <div class="d-ticker" id="dTitle">${r.label}</div>
      <p class="d-name">${r.name} · ${r.symbol} <span class="mono dim">· Since ${r.start_year || '—'} (${r.years || '—'} years of data)</span></p>
      <div class="d-row">${badge(r._sig.state)}<span class="tier tier-${r.tier}">Tier ${r.tier} · ${r.verdict}</span></div>
      <div class="d-chart"><div class="d-cap">Two years · weekly close · dots mark triggers</div>${priceChart(r)}</div>
      <div class="d-chart"><div class="d-cap">20-week Z-score · −1.35 Pullback · −2.40 XL</div>${zChart(r)}</div>
      <div class="d-stats">
        <div><h4>All-time Pullbacks (${r.start_year}–2026)</h4>${dl(r.pb)}</div>
        <div><h4>All-time Pullback XL (${r.start_year}–2026)</h4>${dl(r.xl)}</div>
        <div><h4>Recent 10Y Pullbacks</h4>${dl(r.pb_10y || r.pb)}</div>
        <div><h4>Recent 10Y Pullback XL</h4>${dl(r.xl_10y || r.xl)}</div>
      </div>
      <table class="d-events"><thead><tr><th>Trigger</th><th>Type</th><th class="num">Z</th><th class="num">6M</th><th class="num">1Y</th><th class="num">3M dip</th></tr></thead><tbody>${evRows || '<tr><td colspan="6" class="dim">No triggers in the window</td></tr>'}</tbody></table>
      <a class="btn btn-blue d-tv" href="https://www.tradingview.com/chart/?symbol=${encodeURIComponent(r.tv)}&interval=1W" target="_blank" rel="noopener">Open weekly chart in TradingView ↗</a>`;
    $("#drawer").classList.add("open");
    $("#drawer").setAttribute("aria-hidden", "false");
  }

  function closeDrawer() {
    $("#drawer").classList.remove("open");
    $("#drawer").setAttribute("aria-hidden", "true");
  }

  function renderHeader() {
    const list = DATA.instruments;
    const xl = list.filter((r) => r.tier <= 2 && r._sig.state === "PULLBACK XL").length;
    const buy = list.filter(isActionable).length;
    const t1 = list.filter((r) => r.tier === 1).length;
    const gen = new Date(DATA.generated);
    $("#stXl").textContent = xl;
    $("#stBuy").textContent = buy;
    $("#stT1").textContent = `${t1}/${list.length}`;
    $("#stTime").textContent = gen.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
    const top = list.filter(isActionable).sort((a, b) => sortVal(b, "signal") - sortVal(a, "signal")).slice(0, 4).map((r) => r.label);
    $("#announceText").innerHTML = buy ? `${buy} actionable signals this week: ${top.join(" · ")}${buy > 4 ? " and more" : ""} <a href="#signals">→</a>` : "No Tier 1 or 2 signals this week";
    $("#heroStamp").textContent = `Weekly close · scanned ${gen.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`;
  }

  /* ── Pareto Quadrant Chart ─────────────────────────────────────────── */
  let paretoHorizon = "all";
  let paretoSig = "pb";
  let paretoU = "all";

  function renderPareto() {
    if (!DATA) return;
    const svg = $("#paretoSvg");
    if (!svg) return;

    const list = DATA.instruments.filter((r) => {
      if (paretoU !== "all" && r.kind !== paretoU) return false;
      const s = paretoHorizon === "10y" ? (paretoSig === "xl" ? r.xl_10y : r.pb_10y) : r[paretoSig];
      return s && s.win_1y !== null && s.count_1y >= 2;
    });

    const pts = list.map((r) => {
      const s = paretoHorizon === "10y" ? (paretoSig === "xl" ? r.xl_10y : r.pb_10y) : r[paretoSig];
      const tier = paretoHorizon === "10y" ? r.tier_10y : r.tier;
      const verdict = paretoHorizon === "10y" ? r.verdict_10y : r.verdict;
      return {
        r,
        symbol: r.symbol,
        label: r.label,
        name: r.name,
        kind: r.kind,
        category: r.category,
        tier: tier || r.tier,
        verdict: verdict || r.verdict,
        x: s.win_1y,
        y: s.med_1y,
        n: s.count_1y,
        dd: s.med_dd_3m,
        med_2y: s.med_2y,
        years: r.years,
        start_year: r.start_year,
      };
    });

    if (!pts.length) {
      svg.innerHTML = '<text x="480" y="260" fill="#777" font-family="JetBrains Mono" font-size="14" text-anchor="middle">No instruments match the selected filters</text>';
      $("#paretoTags").innerHTML = "";
      return;
    }

    // Sort descending by Win Rate, then descending by 1Y Median Return
    const sorted = [...pts].sort((a, b) => b.x - a.x || b.y - a.y);
    const frontier = [];
    let maxY = -Infinity;
    for (const p of sorted) {
      if (p.y > maxY) {
        frontier.push(p);
        maxY = p.y;
      }
    }
    const frontierSet = new Set(frontier.map((p) => p.label));

    // Update frontier pills
    $("#paretoTags").innerHTML = frontier
      .map((p) => `<button class="f-pill" data-sym="${p.symbol}">${p.label} <span class="dim">${Math.round(p.x)}% · +${Math.round(p.y)}%</span></button>`)
      .join("");

    // SVG coordinate space
    const W = 960, H = 520;
    const padL = 60, padR = 40, padT = 40, padB = 55;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const xMin = 20, xMax = 104;
    const allY = pts.map((p) => p.y);
    const minYRaw = Math.min(...allY);
    const maxYRaw = Math.max(...allY);
    const yMin = Math.min(-10, Math.floor(minYRaw / 10) * 10);
    const yMax = Math.max(50, Math.ceil(maxYRaw / 10) * 10 + 5);

    const toX = (val) => padL + ((val - xMin) / (xMax - xMin)) * plotW;
    const toY = (val) => padT + ((yMax - val) / (yMax - yMin)) * plotH;

    const x80 = toX(80);
    const y15 = toY(15);
    const x100 = toX(100);

    let html = `<defs>
      <linearGradient id="pGlow" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#1E6EF3" stop-opacity="0.12"/>
        <stop offset="1" stop-color="#1E6EF3" stop-opacity="0"/>
      </linearGradient>
    </defs>`;

    // Subtle Alpha Quadrant tint
    html += `<rect x="${x80}" y="${padT}" width="${x100 - x80}" height="${Math.max(0, y15 - padT)}" fill="#1E6EF3" fill-opacity="0.05" rx="2"/>`;

    // Quadrant watermarks
    html += `<text x="${x80 + 12}" y="${padT + 22}" fill="#1E6EF3" font-family="JetBrains Mono" font-size="10.5" letter-spacing="0.08em" font-weight="600" opacity="0.8">ALPHA TIER · WIN ≥ 80% · 1Y RET ≥ 15%</text>`;
    html += `<text x="${padL + 12}" y="${padT + 22}" fill="#555" font-family="JetBrains Mono" font-size="10" letter-spacing="0.08em" opacity="0.6">HIGH BETA / MOMENTUM · WIN &lt; 80%</text>`;
    html += `<text x="${x80 + 12}" y="${H - padB - 14}" fill="#555" font-family="JetBrains Mono" font-size="10" letter-spacing="0.08em" opacity="0.6">DEFENSIVE · 1Y RET &lt; 15%</text>`;
    html += `<text x="${padL + 12}" y="${H - padB - 14}" fill="#444" font-family="JetBrains Mono" font-size="10" letter-spacing="0.08em" opacity="0.5">SUB-OPTIMAL / AVOID</text>`;

    // Grid lines for X (every 20% from 20 to 100)
    for (let xVal = 20; xVal <= 100; xVal += 20) {
      const gx = toX(xVal);
      html += `<line x1="${gx}" y1="${padT}" x2="${gx}" y2="${H - padB}" stroke="#1f1f1f" stroke-width="1"/>`;
      html += `<text x="${gx}" y="${H - padB + 20}" fill="#777" font-family="JetBrains Mono" font-size="11" text-anchor="middle">${xVal}%</text>`;
    }
    html += `<text x="${padL + plotW / 2}" y="${H - 12}" fill="#999" font-family="JetBrains Mono" font-size="11" text-anchor="middle" letter-spacing="0.06em">HISTORICAL 1-YEAR WIN RATE</text>`;

    // Grid lines for Y
    const yStep = yMax - yMin > 80 ? 20 : 10;
    const yStart = Math.ceil(yMin / yStep) * yStep;
    for (let yVal = yStart; yVal <= yMax; yVal += yStep) {
      const gy = toY(yVal);
      html += `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="#1f1f1f" stroke-width="1"/>`;
      html += `<text x="${padL - 10}" y="${gy + 4}" fill="#777" font-family="JetBrains Mono" font-size="11" text-anchor="end">${yVal > 0 ? "+" : ""}${yVal}%</text>`;
    }
    html += `<text x="${padL - 42}" y="${padT + plotH / 2}" fill="#999" font-family="JetBrains Mono" font-size="11" text-anchor="middle" transform="rotate(-90 ${padL - 42} ${padT + plotH / 2})" letter-spacing="0.06em">MEDIAN 1-YEAR RETURN</text>`;

    // Benchmark crosshairs (80% Win Rate, 15% 1Y Return)
    html += `<line x1="${x80}" y1="${padT}" x2="${x80}" y2="${H - padB}" stroke="#1E6EF3" stroke-width="1.2" stroke-dasharray="4 4" stroke-opacity="0.6"/>`;
    html += `<line x1="${padL}" y1="${y15}" x2="${W - padR}" y2="${y15}" stroke="#1E6EF3" stroke-width="1.2" stroke-dasharray="4 4" stroke-opacity="0.6"/>`;
    html += `<text x="${x80}" y="${padT - 10}" fill="#1E6EF3" font-family="JetBrains Mono" font-size="10.5" text-anchor="middle" font-weight="600">80% TIER 1 CUTOFF</text>`;

    // Pareto frontier dashed curve
    if (frontier.length > 1) {
      const fPath = frontier.map((p, i) => `${i ? "L" : "M"}${toX(p.x).toFixed(1)},${toY(p.y).toFixed(1)}`).join(" ");
      html += `<path d="${fPath}" fill="none" stroke="#1E6EF3" stroke-width="2.2" stroke-dasharray="5 4" stroke-opacity="0.85"/>`;
    }

    // Nodes
    const tierColors = { 1: "#1E6EF3", 2: "#FFB800", 3: "#888888", 4: "#FF3344" };

    const renderNode = (p) => {
      const cx = toX(p.x).toFixed(1);
      const cy = toY(p.y).toFixed(1);
      const col = tierColors[p.tier] || "#888";
      const isFrontier = frontierSet.has(p.label);

      let nodeHtml = `<g class="p-node-group" data-sym="${p.symbol}" data-label="${p.label}">`;
      if (isFrontier) {
        nodeHtml += `<circle cx="${cx}" cy="${cy}" r="10" fill="none" stroke="#1E6EF3" stroke-width="1.5" stroke-opacity="0.7"/>`;
      }
      nodeHtml += `<circle class="p-node-dot" cx="${cx}" cy="${cy}" r="${isFrontier ? 6 : 4.8}" fill="${col}" stroke="#000" stroke-width="1.5"/>`;

      const prominent = isFrontier || p.label === "SSLN" || p.label === "VUAG" || p.label === "CNX1" || p.label === "COST" || p.label === "NVDA" || (p.tier === 1 && p.x === 100);
      if (prominent) {
        const xOffset = p.x > 95 ? -10 : 10;
        const anchor = p.x > 95 ? "end" : "start";
        nodeHtml += `<text x="${(parseFloat(cx) + xOffset).toFixed(1)}" y="${(parseFloat(cy) + 4).toFixed(1)}" fill="${isFrontier ? '#fff' : '#aaa'}" font-family="JetBrains Mono" font-size="11" font-weight="${isFrontier ? '700' : '500'}" text-anchor="${anchor}">${p.label}</text>`;
      }
      nodeHtml += `</g>`;
      return nodeHtml;
    };

    pts.filter((p) => !frontierSet.has(p.label)).forEach((p) => (html += renderNode(p)));
    frontier.forEach((p) => (html += renderNode(p)));

    svg.innerHTML = html;
  }

  function wire() {
    $("#paretoSignal").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      paretoSig = b.dataset.sig;
      document.querySelectorAll("#paretoSignal button").forEach((x) => x.classList.toggle("on", x === b));
      renderPareto();
    });
    $("#paretoUniverse").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      paretoU = b.dataset.u;
      document.querySelectorAll("#paretoUniverse button").forEach((x) => x.classList.toggle("on", x === b));
      renderPareto();
    });

    const svg = $("#paretoSvg");
    const tt = $("#paretoTooltip");
    const wrap = $("#paretoChartWrap");

    svg.addEventListener("mousemove", (e) => {
      const grp = e.target.closest(".p-node-group");
      if (!grp) {
        tt.hidden = true;
        return;
      }
      const sym = grp.dataset.sym;
      const r = DATA.instruments.find((x) => x.symbol === sym);
      if (!r) return;
      const s = paretoHorizon === "10y" ? (paretoSig === "xl" ? r.xl_10y : r.pb_10y) : r[paretoSig];
      const tier = paretoHorizon === "10y" ? r.tier_10y : r.tier;
      const verdict = paretoHorizon === "10y" ? r.verdict_10y : r.verdict;
      const rect = wrap.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      tt.style.left = `${x}px`;
      tt.style.top = `${y}px`;
      tt.innerHTML = `
        <div class="tt-top">
          <span class="tt-sym">${r.label}</span>
          <span class="tt-tier">Tier ${tier} · ${verdict}</span>
        </div>
        <div class="tt-name">${r.name}</div>
        <dl>
          <dt>Sample base</dt><dd class="dim">${s.count_1y} signals · ${paretoHorizon === "10y" ? "Last 10Y" : (r.years || '—') + "Y (since " + (r.start_year || '—') + ")"}</dd>
          <dt>1Y Win Rate</dt><dd class="${cls(s.win_1y - 50)}">${Math.round(s.win_1y)}%</dd>
          <dt>Median 1Y</dt><dd class="${cls(s.med_1y)}">${fmtPct(s.med_1y)}</dd>
          <dt>Median 2Y</dt><dd>${fmtPct(s.med_2y)}</dd>
          <dt>3M Dip</dt><dd class="dim">${fmtPct(s.med_dd_3m)}</dd>
        </dl>
      `;
      tt.hidden = false;
    });

    svg.addEventListener("mouseleave", () => {
      tt.hidden = true;
    });
    $("#paretoHorizon").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      paretoHorizon = b.dataset.h;
      document.querySelectorAll("#paretoHorizon button").forEach((x) => x.classList.toggle("on", x === b));
      renderPareto();
    });
    $("#filters").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      filter = b.dataset.f;
      document.querySelectorAll("#filters button").forEach((x) => x.classList.toggle("on", x === b));
      renderTable();
    });
    $("#search").addEventListener("input", renderTable);
    document.querySelectorAll("th[data-k]").forEach((th) =>
      th.addEventListener("click", () => {
        const k = th.dataset.k;
        if (sortKey === k) sortAsc = !sortAsc;
        else { sortKey = k; sortAsc = k === "label" || k === "z" || k === "tier"; }
        renderTable();
      })
    );
    document.addEventListener("click", (e) => {
      const row = e.target.closest("[data-sym]");
      if (row && !e.target.closest("a")) openDrawer(row.dataset.sym);
      if (e.target.closest("[data-close]")) closeDrawer();
    });
    document.addEventListener("keydown", (e) => e.key === "Escape" && closeDrawer());
  }

  startField();
  splitHeadline();
  wire();
  fetch("data/scan.json", { cache: "no-store" })
    .then((r) => r.json())
    .then((d) => {
      DATA = d;
      DATA.instruments.forEach((r) => (r._sig = currentSignal(r)));
      renderHeader();
      renderCards();
      renderPareto();
      renderTable();
    })
    .catch((err) => {
      $("#announceText").textContent = "The scan data failed to load. " + err.message;
    });
})();
