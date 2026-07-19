import { useEffect, useRef, useState, useMemo } from "react";
import * as d3 from "d3";
import * as topojson from "topojson-client";
import { motion, AnimatePresence } from "framer-motion";

// ─── DATA ────────────────────────────────────────────────────────────────────

const TRANSACTIONS = [
  { id: "TX-90321", source: "Kyiv",        sourceLl: [30.52, 50.45],  dest: "Miami",     destLl: [-80.19, 25.77], amount: 12400, merchant: "Online Electronics",  risk: "confirmed",  score: 97, reason: "Geographic anomaly — card used 6,000 mi from last activity", time: "Just now" },
  { id: "TX-88310", source: "Shanghai",    sourceLl: [121.47, 31.23], dest: "New York",   destLl: [-74.00, 40.71], amount: 21000, merchant: "Luxury Retail",        risk: "confirmed",  score: 94, reason: "Card clone pattern — simultaneous transaction detected",    time: "1m ago"   },
  { id: "TX-66104", source: "Lagos",       sourceLl: [3.38,  6.45],   dest: "Paris",      destLl: [2.35,  48.85], amount: 3800,  merchant: "Wire Transfer",         risk: "confirmed",  score: 91, reason: "Merchant flagged — known high-risk operator",              time: "5m ago"   },
  { id: "TX-21055", source: "Minsk",       sourceLl: [27.56, 53.90],  dest: "Dubai",      destLl: [55.30, 25.20], amount: 5600,  merchant: "Crypto Exchange",       risk: "confirmed",  score: 87, reason: "Velocity spike — 4 transactions in 3 minutes",             time: "9m ago"   },
  { id: "TX-77122", source: "Moscow",      sourceLl: [37.62, 55.75],  dest: "Dubai",      destLl: [55.30, 25.20], amount: 6150,  merchant: "Hotel Booking",         risk: "suspicious", score: 72, reason: "Unusual device fingerprint — new browser + VPN detected",  time: "2m ago"   },
  { id: "TX-55719", source: "São Paulo",   sourceLl: [-46.63,-23.55], dest: "London",     destLl: [-0.13, 51.51], amount: 4600,  merchant: "Jewelry Store",         risk: "suspicious", score: 68, reason: "Amount anomaly — 8× above monthly average",              time: "4m ago"   },
  { id: "TX-33084", source: "Berlin",      sourceLl: [13.40, 52.52],  dest: "Singapore",  destLl: [103.82, 1.35], amount: 1200,  merchant: "Travel Services",       risk: "suspicious", score: 63, reason: "Off-hours activity — transaction at 03:14 local time",     time: "7m ago"   },
  { id: "TX-44901", source: "Bucharest",   sourceLl: [26.10, 44.43],  dest: "Toronto",    destLl: [-79.38, 43.65],amount: 8900,  merchant: "Travel Agency",         risk: "suspicious", score: 59, reason: "First-time country — card never used in Romania before",   time: "12m ago"  },
];

const RISK_BY_HOUR = [
  { hour: "08", confirmed: 3,  suspicious: 8,  clean: 120 },
  { hour: "09", confirmed: 5,  suspicious: 13, clean: 210 },
  { hour: "10", confirmed: 8,  suspicious: 18, clean: 280 },
  { hour: "11", confirmed: 7,  suspicious: 16, clean: 260 },
  { hour: "12", confirmed: 11, suspicious: 24, clean: 340 },
  { hour: "13", confirmed: 9,  suspicious: 21, clean: 310 },
  { hour: "14", confirmed: 13, suspicious: 28, clean: 390 },
  { hour: "15", confirmed: 10, suspicious: 20, clean: 330 },
];

const TOP_COUNTRIES = [
  { country: "Russia",        flag: "🇷🇺", transactions: 143, fraud: 6,  level: "high"   },
  { country: "Nigeria",       flag: "🇳🇬", transactions: 87,  fraud: 5,  level: "high"   },
  { country: "China",         flag: "🇨🇳", transactions: 309, fraud: 3,  level: "medium" },
  { country: "United States", flag: "🇺🇸", transactions: 812, fraud: 4,  level: "medium" },
  { country: "Germany",       flag: "🇩🇪", transactions: 256, fraud: 1,  level: "low"    },
];

const SYSTEM_STATUS = [
  { name: "ML Model API",          status: "Operational", metric: "99.98% uptime" },
  { name: "Transaction Stream",    status: "Operational", metric: "2,147 tx/s"    },
  { name: "Notification Service",  status: "Operational", metric: "187 ms avg"    },
  { name: "Agent Consoles",        status: "Operational", metric: "24 online"     },
];

const fmt$ = v => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

// ─── GLOBE MAP ────────────────────────────────────────────────────────────────

function GlobeMap({ activeTx, onSelect }) {
  const svgRef  = useRef(null);
  const animRef = useRef({});
  const worldRef = useRef(null);
  const [ready, setReady] = useState(false);

  // Project lon/lat → svg x,y for the Natural Earth projection
  const projRef = useRef(null);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    const W = svgRef.current.clientWidth  || 900;
    const H = svgRef.current.clientHeight || 480;

    svg.selectAll("*").remove();

    const projection = d3.geoNaturalEarth1()
      .scale(W / 6.2)
      .translate([W / 2, H / 2]);
    projRef.current = projection;

    const path = d3.geoPath().projection(projection);

    // Ocean
    svg.append("rect").attr("width", W).attr("height", H).attr("fill", "#020917");

    // Graticule
    const graticule = d3.geoGraticule().step([20, 20]);
    svg.append("path")
      .datum(graticule())
      .attr("d", path)
      .attr("fill", "none")
      .attr("stroke", "rgba(96,165,250,0.06)")
      .attr("stroke-width", 0.5);

    fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
      .then(r => r.json())
      .then(world => {
        worldRef.current = world;

        // Land
        svg.append("g").selectAll("path")
          .data(topojson.feature(world, world.objects.countries).features)
          .join("path")
          .attr("d", path)
          .attr("fill", "#0d2137")
          .attr("stroke", "#1e3a5f")
          .attr("stroke-width", 0.5);

        // Borders
        svg.append("path")
          .datum(topojson.mesh(world, world.objects.countries, (a, b) => a !== b))
          .attr("d", path)
          .attr("fill", "none")
          .attr("stroke", "#1e4060")
          .attr("stroke-width", 0.35);

        // City dots
        TRANSACTIONS.forEach(tx => {
          const ps = projection(tx.sourceLl);
          const pd = projection(tx.destLl);
          if (!ps || !pd) return;
          [[ps, tx.sourceLl], [pd, tx.destLl]].forEach(([p]) => {
            svg.append("circle")
              .attr("cx", p[0]).attr("cy", p[1]).attr("r", 3)
              .attr("fill", "#60a5fa").attr("opacity", 0.6);
          });
        });

        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  // Draw animated arcs whenever activeTx or readiness changes
  useEffect(() => {
    if (!ready || !projRef.current) return;
    const svg = d3.select(svgRef.current);
    const proj = projRef.current;

    // Clear previous arcs/markers
    svg.selectAll(".tx-arc, .tx-dot, .tx-pulse").remove();
    Object.values(animRef.current).forEach(id => cancelAnimationFrame(id));
    animRef.current = {};

    TRANSACTIONS.forEach((tx, i) => {
      const ps = proj(tx.sourceLl);
      const pd = proj(tx.destLl);
      if (!ps || !pd) return;

      const isActive  = tx.id === activeTx?.id;
      const confirmed = tx.risk === "confirmed";
      const color     = confirmed ? "#ef4444" : "#f59e0b";
      const opacity   = isActive ? 1 : 0.35;
      const weight    = isActive ? 2 : 0.9;

      // Curved path via midpoint lift
      const mx = (ps[0] + pd[0]) / 2;
      const my = Math.min(ps[1], pd[1]) - Math.abs(pd[0] - ps[0]) * 0.28 - 20;
      const dStr = `M${ps[0]},${ps[1]} Q${mx},${my} ${pd[0]},${pd[1]}`;

      const pathEl = svg.append("path")
        .attr("class", "tx-arc")
        .attr("d", dStr)
        .attr("fill", "none")
        .attr("stroke", color)
        .attr("stroke-width", weight)
        .attr("stroke-opacity", opacity)
        .attr("stroke-dasharray", isActive ? "none" : "6 4")
        .style("cursor", "pointer")
        .on("click", () => onSelect(tx));

      // Animate a travelling dot
      const dot = svg.append("circle")
        .attr("class", "tx-dot")
        .attr("r", isActive ? 5 : 3)
        .attr("fill", color)
        .attr("opacity", opacity)
        .style("pointer-events", "none");

      const totalLen = pathEl.node().getTotalLength();
      let start = null;
      const duration = 2200 + i * 180;

      function animateDot(ts) {
        if (!start) start = ts;
        const t = ((ts - start) % duration) / duration;
        const pt = pathEl.node().getPointAtLength(t * totalLen);
        dot.attr("cx", pt.x).attr("cy", pt.y);
        animRef.current[tx.id] = requestAnimationFrame(animateDot);
      }
      animRef.current[tx.id] = requestAnimationFrame(animateDot);

      // Pulse rings on source if active
      if (isActive) {
        [3, 7, 12].forEach((r, ri) => {
          svg.append("circle")
            .attr("class", "tx-pulse")
            .attr("cx", ps[0]).attr("cy", ps[1])
            .attr("r", r)
            .attr("fill", "none")
            .attr("stroke", color)
            .attr("stroke-width", 0.8)
            .attr("stroke-opacity", 0.7 - ri * 0.2);
        });
      }
    });

    return () => {
      Object.values(animRef.current).forEach(id => cancelAnimationFrame(id));
    };
  }, [ready, activeTx, onSelect]);

  return (
    <svg
      ref={svgRef}
      style={{ width: "100%", height: "100%", display: "block" }}
      role="img"
      aria-label="World map showing live fraud transaction routes"
    />
  );
}

// ─── SPARKLINE ────────────────────────────────────────────────────────────────

function Sparkline({ data, color }) {
  const W = 80, H = 28;
  const max = Math.max(...data);
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * W,
    H - (v / max) * H,
  ]);
  const d = "M" + pts.map(p => p.join(",")).join(" L");
  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3" fill={color} />
    </svg>
  );
}

// ─── MINI AREA CHART ─────────────────────────────────────────────────────────

function MiniAreaChart({ data, keys, colors }) {
  const W = 380, H = 110;
  const maxVal = Math.max(...data.map(d => keys.reduce((s, k) => s + d[k], 0)));
  const xScale = i => (i / (data.length - 1)) * (W - 32) + 16;
  const yScale = v => H - 8 - (v / maxVal) * (H - 20);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H }}>
      <defs>
        {colors.map((c, i) => (
          <linearGradient key={i} id={`ag${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={c} stopOpacity="0.4" />
            <stop offset="100%" stopColor={c} stopOpacity="0"   />
          </linearGradient>
        ))}
      </defs>
      {/* grid */}
      {[0, 0.5, 1].map(t => (
        <line key={t} x1={16} x2={W - 16} y1={8 + t * (H - 20)} y2={8 + t * (H - 20)}
          stroke="rgba(255,255,255,0.06)" strokeWidth="0.8" />
      ))}
      {keys.map((k, ki) => {
        const pts = data.map((d, i) => [xScale(i), yScale(d[k])]);
        const area = `M${pts[0][0]},${H - 8} ` +
          pts.map(p => `L${p[0]},${p[1]}`).join(" ") +
          ` L${pts[pts.length - 1][0]},${H - 8} Z`;
        const line = "M" + pts.map(p => p.join(",")).join(" L");
        return (
          <g key={k}>
            <path d={area} fill={`url(#ag${ki})`} />
            <path d={line} fill="none" stroke={colors[ki]} strokeWidth="1.6" strokeLinecap="round" />
          </g>
        );
      })}
      {data.map((d, i) => (
        <text key={i} x={xScale(i)} y={H - 1} textAnchor="middle"
          style={{ fontSize: 8, fill: "rgba(255,255,255,0.3)", fontFamily: "monospace" }}>
          {d.hour}
        </text>
      ))}
    </svg>
  );
}

// ─── STACKED BAR CHART ───────────────────────────────────────────────────────

function StackedBarChart({ data }) {
  const W = 380, H = 110;
  const barW = (W - 32) / data.length - 4;
  const maxVal = Math.max(...data.map(d => d.confirmed + d.suspicious + d.clean));
  const yScale = v => (v / maxVal) * (H - 20);
  const xScale = i => 16 + i * ((W - 32) / data.length);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H }}>
      {data.map((d, i) => {
        const x = xScale(i);
        const cleanH   = yScale(d.clean);
        const susH     = yScale(d.suspicious);
        const fraudH   = yScale(d.confirmed);
        const totalH   = cleanH + susH + fraudH;
        const baseY    = H - 14;
        return (
          <g key={i}>
            <rect x={x} y={baseY - cleanH}           width={barW} height={cleanH} fill="#10b981" opacity="0.7" rx="1" />
            <rect x={x} y={baseY - cleanH - susH}    width={barW} height={susH}   fill="#f59e0b" opacity="0.85" />
            <rect x={x} y={baseY - totalH}            width={barW} height={fraudH} fill="#ef4444" opacity="0.9" rx="1" />
            <text x={x + barW / 2} y={H - 2} textAnchor="middle"
              style={{ fontSize: 8, fill: "rgba(255,255,255,0.3)", fontFamily: "monospace" }}>
              {d.hour}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── STAT CARD ───────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, sparkData, sparkColor, accent }) {
  const accents = {
    red:    { bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.2)",   text: "#fca5a5" },
    amber:  { bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.2)",  text: "#fcd34d" },
    green:  { bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.2)",  text: "#6ee7b7" },
    blue:   { bg: "rgba(96,165,250,0.08)",  border: "rgba(96,165,250,0.2)",  text: "#93c5fd" },
  };
  const a = accents[accent];
  return (
    <div style={{
      background: a.bg, border: `1px solid ${a.border}`,
      borderRadius: 16, padding: "16px 18px",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", fontFamily: "monospace" }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1 }}>{value}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>{sub}</div>
        </div>
        {sparkData && <Sparkline data={sparkData} color={sparkColor} />}
      </div>
    </div>
  );
}

// ─── RISK PILL ───────────────────────────────────────────────────────────────

function RiskPill({ risk, small }) {
  const confirmed = risk === "confirmed";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: confirmed ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)",
      border: `1px solid ${confirmed ? "rgba(239,68,68,0.3)" : "rgba(245,158,11,0.3)"}`,
      color: confirmed ? "#fca5a5" : "#fcd34d",
      borderRadius: 999, padding: small ? "2px 8px" : "4px 10px",
      fontSize: small ? 10 : 11, fontWeight: 700, letterSpacing: "0.06em",
      textTransform: "uppercase", fontFamily: "monospace",
    }}>
      <span style={{
        width: small ? 5 : 6, height: small ? 5 : 6, borderRadius: "50%",
        background: confirmed ? "#ef4444" : "#f59e0b",
        boxShadow: `0 0 8px ${confirmed ? "#ef4444" : "#f59e0b"}`,
        flexShrink: 0,
      }} />
      {confirmed ? "Confirmed" : "Suspicious"}
    </span>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function CommandCenter() {
  const [activeTx, setActiveTx]   = useState(TRANSACTIONS[0]);
  const [clock, setClock]         = useState(new Date());
  const [blinkOn, setBlinkOn]     = useState(true);

  useEffect(() => {
    const c = setInterval(() => setClock(new Date()), 1000);
    const b = setInterval(() => setBlinkOn(v => !v), 800);
    const r = setInterval(() => {
      setActiveTx(cur => {
        const idx = TRANSACTIONS.findIndex(t => t.id === cur.id);
        return TRANSACTIONS[(idx + 1) % TRANSACTIONS.length];
      });
    }, 4500);
    return () => { clearInterval(c); clearInterval(b); clearInterval(r); };
  }, []);

  const totals = useMemo(() => {
    const confirmed  = TRANSACTIONS.filter(t => t.risk === "confirmed");
    const suspicious = TRANSACTIONS.filter(t => t.risk === "suspicious");
    return {
      confirmed:  confirmed.length,
      suspicious: suspicious.length,
      blocked:    confirmed.reduce((s, t) => s + t.amount, 0),
      clean:      2341,
    };
  }, []);

  const sparkConf = [3, 5, 8, 7, 11, 9, 13, 10];
  const sparkSus  = [8, 13, 18, 16, 24, 21, 28, 20];

  const S = {
    root: {
      minHeight: "100vh",
      background: "#020917",
      color: "#fff",
      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
      padding: "20px 24px",
      display: "flex",
      flexDirection: "column",
      gap: 16,
      boxSizing: "border-box",
    },
    header: {
      display: "flex", alignItems: "center", justifyContent: "space-between",
      borderBottom: "1px solid rgba(96,165,250,0.15)", paddingBottom: 14,
    },
    logoRow: { display: "flex", alignItems: "center", gap: 14 },
    logoIcon: {
      width: 42, height: 42,
      background: "rgba(96,165,250,0.12)",
      border: "1px solid rgba(96,165,250,0.25)",
      borderRadius: 10,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 20,
    },
    liveChip: {
      display: "flex", alignItems: "center", gap: 7,
      background: "rgba(16,185,129,0.1)",
      border: "1px solid rgba(16,185,129,0.25)",
      borderRadius: 999, padding: "5px 12px",
      fontSize: 11, color: "#6ee7b7", fontWeight: 700, letterSpacing: "0.12em",
    },
    clockBox: {
      textAlign: "right",
    },
    metrics: {
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: 12,
    },
    bodyGrid: {
      display: "grid",
      gridTemplateColumns: "1fr 360px",
      gap: 16,
      flex: 1,
    },
    leftCol: { display: "flex", flexDirection: "column", gap: 14 },
    rightCol: { display: "flex", flexDirection: "column", gap: 14, overflow: "hidden" },
    mapCard: {
      flex: 1, minHeight: 380,
      background: "#020917",
      border: "1px solid rgba(96,165,250,0.15)",
      borderRadius: 18, overflow: "hidden", position: "relative",
    },
    card: {
      background: "rgba(255,255,255,0.025)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 16, padding: "14px 16px",
    },
    cardTitle: {
      fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase",
      color: "rgba(255,255,255,0.35)", marginBottom: 12, fontWeight: 700,
    },
    chartsRow: {
      display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14,
    },
    feedScroll: {
      display: "flex", flexDirection: "column", gap: 8,
      overflowY: "auto", maxHeight: 340,
    },
    txRow: (active, confirmed) => ({
      background: active
        ? (confirmed ? "rgba(239,68,68,0.08)" : "rgba(245,158,11,0.08)")
        : "rgba(255,255,255,0.03)",
      border: `1px solid ${active
        ? (confirmed ? "rgba(239,68,68,0.35)" : "rgba(245,158,11,0.35)")
        : "rgba(255,255,255,0.06)"}`,
      borderRadius: 12, padding: "10px 12px",
      cursor: "pointer", transition: "all 0.2s",
    }),
  };

  return (
    <div style={S.root}>
      {/* Google Font */}
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;700&display=swap" rel="stylesheet" />

      {/* ── HEADER ── */}
      <header style={S.header}>
        <div style={S.logoRow}>
          <div style={S.logoIcon}>🛡️</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em", color: "#fff" }}>
              Global Fraud Command Center
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
              Office wall display · live transaction intelligence
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={S.liveChip}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%", background: "#10b981",
              boxShadow: "0 0 10px #10b981",
              opacity: blinkOn ? 1 : 0.3, transition: "opacity 0.3s",
            }} />
            LIVE STREAM
          </div>
          <div style={S.clockBox}>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "0.04em" }}>
              {clock.toLocaleTimeString("en-GB")}
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em" }}>
              {clock.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" }).toUpperCase()}
            </div>
          </div>
        </div>
      </header>

      {/* ── STAT CARDS ── */}
      <div style={S.metrics}>
        <StatCard label="Confirmed Fraud"    value={totals.confirmed}           sub="Blocked automatically"       sparkData={sparkConf} sparkColor="#ef4444" accent="red"   />
        <StatCard label="Suspicious Alerts"  value={totals.suspicious}          sub="Awaiting agent review"       sparkData={sparkSus}  sparkColor="#f59e0b" accent="amber" />
        <StatCard label="Clean Transactions" value={totals.clean.toLocaleString()} sub="98.3% of traffic today"  sparkData={[120,210,280,260,340,310,390,330]} sparkColor="#10b981" accent="green" />
        <StatCard label="Blocked Amount"     value={fmt$(totals.blocked)}       sub="Estimated loss prevented"   accent="blue"  />
      </div>

      {/* ── BODY ── */}
      <div style={S.bodyGrid}>

        {/* LEFT */}
        <div style={S.leftCol}>

          {/* MAP */}
          <div style={S.mapCard}>
            {/* Corner labels */}
            <div style={{ position: "absolute", top: 12, left: 14, zIndex: 10, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                background: "rgba(2,9,23,0.85)", border: "1px solid rgba(96,165,250,0.2)",
                borderRadius: 10, padding: "6px 12px", fontSize: 11, color: "rgba(255,255,255,0.6)",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span style={{ color: "#60a5fa" }}>◉</span> Global Transaction Routes
              </div>
            </div>
            <div style={{ position: "absolute", top: 12, right: 14, zIndex: 10, display: "flex", gap: 10, alignItems: "center" }}>
              {[["#ef4444","Confirmed Fraud"],["#f59e0b","Suspicious"]].map(([c,l]) => (
                <div key={l} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "rgba(255,255,255,0.45)" }}>
                  <span style={{ width: 8, height: 2, background: c, display: "inline-block", borderRadius: 1 }} />
                  {l}
                </div>
              ))}
            </div>

            {/* Active TX info bar */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTx.id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35 }}
                style={{
                  position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 10,
                  background: "linear-gradient(to top, rgba(2,9,23,0.98) 60%, transparent)",
                  padding: "32px 18px 16px",
                  display: "grid", gridTemplateColumns: "1fr auto 1fr auto",
                  alignItems: "center", gap: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "0.14em", textTransform: "uppercase" }}>Source</div>
                  <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{activeTx.source}</div>
                </div>
                <div style={{ fontSize: 18, color: "rgba(255,255,255,0.25)" }}>→</div>
                <div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "0.14em", textTransform: "uppercase" }}>Destination</div>
                  <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{activeTx.dest}</div>
                </div>
                <div style={{
                  background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 12, padding: "8px 14px", textAlign: "right",
                }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.12em" }}>Amount</div>
                  <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>{fmt$(activeTx.amount)}</div>
                  <div style={{ marginTop: 5 }}><RiskPill risk={activeTx.risk} small /></div>
                </div>
              </motion.div>
            </AnimatePresence>

            <GlobeMap activeTx={activeTx} onSelect={setActiveTx} />
          </div>

          {/* CHARTS */}
          <div style={S.chartsRow}>
            <div style={S.card}>
              <div style={S.cardTitle}>Risk Volume · by Hour</div>
              <MiniAreaChart
                data={RISK_BY_HOUR}
                keys={["confirmed", "suspicious"]}
                colors={["#ef4444", "#f59e0b"]}
              />
              <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
                {[["#ef4444","Confirmed"],["#f59e0b","Suspicious"]].map(([c,l]) => (
                  <div key={l} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                    <span style={{ width: 10, height: 2, background: c, borderRadius: 1 }} />{l}
                  </div>
                ))}
              </div>
            </div>
            <div style={S.card}>
              <div style={S.cardTitle}>Transaction Mix · by Hour</div>
              <StackedBarChart data={RISK_BY_HOUR} />
              <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
                {[["#10b981","Clean"],["#f59e0b","Suspicious"],["#ef4444","Fraud"]].map(([c,l]) => (
                  <div key={l} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                    <span style={{ width: 10, height: 2, background: c, borderRadius: 1 }} />{l}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div style={S.rightCol}>

          {/* LIVE FEED */}
          <div style={{ ...S.card, flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={S.cardTitle}>Live Risk Feed</div>
              <span style={{ fontSize: 10, color: "#6ee7b7", fontWeight: 700 }}>● {TRANSACTIONS.length} ACTIVE</span>
            </div>
            <div style={S.feedScroll}>
              {TRANSACTIONS.map(tx => {
                const active    = tx.id === activeTx?.id;
                const confirmed = tx.risk === "confirmed";
                return (
                  <motion.div
                    key={tx.id}
                    style={S.txRow(active, confirmed)}
                    onClick={() => setActiveTx(tx)}
                    whileHover={{ scale: 1.01 }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <RiskPill risk={tx.risk} small />
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{tx.id} · {tx.time}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{tx.source} → {tx.dest}</div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{tx.merchant}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{fmt$(tx.amount)}</div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>Score {tx.score}</div>
                      </div>
                    </div>
                    {active && (
                      <div style={{
                        marginTop: 8, paddingTop: 8,
                        borderTop: "1px solid rgba(255,255,255,0.08)",
                        fontSize: 10, color: "rgba(255,255,255,0.5)", lineHeight: 1.5,
                      }}>
                        ⚠ {tx.reason}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* TOP COUNTRIES */}
          <div style={S.card}>
            <div style={S.cardTitle}>Top Risk Countries</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {TOP_COUNTRIES.map(c => {
                const rate = ((c.fraud / c.transactions) * 100).toFixed(1);
                const barColor = c.level === "high" ? "#ef4444" : c.level === "medium" ? "#f59e0b" : "#10b981";
                const barW = Math.min(100, parseFloat(rate) * 14);
                return (
                  <div key={c.country}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                      <span>{c.flag} {c.country}</span>
                      <span style={{ color: barColor, fontWeight: 700 }}>{rate}% fraud</span>
                    </div>
                    <div style={{ height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${barW}%`, height: "100%", background: barColor, borderRadius: 2 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SYSTEM STATUS */}
          <div style={S.card}>
            <div style={S.cardTitle}>System Status</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {SYSTEM_STATUS.map(s => (
                <div key={s.name} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  fontSize: 11,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 6px #10b981" }} />
                    <span style={{ color: "rgba(255,255,255,0.7)" }}>{s.name}</span>
                  </div>
                  <span style={{ color: "rgba(255,255,255,0.35)", fontFamily: "monospace" }}>{s.metric}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
