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
        <div class="card-foot"><span>Tier ${r.tier} · ${r.verdict}</span><span>3M dip ${fmtPct(r.pb.med_dd_3m)}</span></div>
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
        <td><span class="t-ticker">${r.label}</span><span class="t-name">${r.name}</span></td>
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
      <p class="d-name">${r.name} · ${r.symbol}</p>
      <div class="d-row">${badge(r._sig.state)}<span class="tier tier-${r.tier}">Tier ${r.tier} · ${r.verdict}</span></div>
      <div class="d-chart"><div class="d-cap">Two years · weekly close · dots mark triggers</div>${priceChart(r)}</div>
      <div class="d-chart"><div class="d-cap">20-week Z-score · −1.35 Pullback · −2.40 XL</div>${zChart(r)}</div>
      <div class="d-stats"><div><h4>All pullbacks · 10Y</h4>${dl(r.pb)}</div><div><h4>Pullback XL · 10Y</h4>${dl(r.xl)}</div></div>
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

  function wire() {
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
      renderTable();
    })
    .catch((err) => {
      $("#announceText").textContent = "The scan data failed to load. " + err.message;
    });
})();
