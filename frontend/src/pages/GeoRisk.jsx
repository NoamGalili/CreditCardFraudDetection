import { useEffect, useState, useCallback } from "react";
import {
  Globe2,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Compass,
  Navigation,
  Building2,
  Layers,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cls } from "../utils/format";

const fmtCurrency = (val) => {
  if (val === undefined || val === null) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(val);
};

// Haversine formula to compute customer-to-merchant distance in Km
function haversineDistance(lat1, lon1, lat2, lon2) {
  if (
    lat1 === undefined ||
    lon1 === undefined ||
    lat2 === undefined ||
    lon2 === undefined ||
    lat1 === null ||
    lon1 === null ||
    lat2 === null ||
    lon2 === null
  ) {
    return 0;
  }
  const R = 6371; // Radius of Earth in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function GeoRisk() {
  const [status, setStatus] = useState({
    running: false,
    interval_seconds: 3.0,
    dataset_size: 5000,
    processed_count: 0,
  });

  const [transactions, setTransactions] = useState([]);
  const [windowLimit, setWindowLimit] = useState(500); // 50 | 100 | 250 | 500

  // Poll simulator status and transaction history
  const fetchData = useCallback(async () => {
    try {
      const [resStatus, resTxs] = await Promise.all([
        fetch("/api/dashboard/status"),
        fetch("/api/dashboard/transactions?limit=500"),
      ]);

      if (resStatus.ok) setStatus(await resStatus.json());
      if (resTxs.ok) setTransactions(await resTxs.json());
    } catch (e) {
      console.error("GeoRisk fetch error:", e);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 2000);
    return () => clearInterval(timer);
  }, [fetchData]);

  // Derive Recent Window dataset (newest first, slice up to windowLimit)
  const recentTxs = transactions.slice(0, windowLimit);
  const recentTotal = recentTxs.length;

  // Group by US State
  const stateMap = {};
  // Group by US City
  const cityMap = {};

  let totalDistanceKm = 0;
  let validDistCount = 0;

  recentTxs.forEach((t) => {
    const txData = t.transaction || {};
    const state = txData.state || "Unknown";
    const city = txData.city ? `${txData.city}, ${state}` : "Unknown";
    const pred = t.prediction;
    const gt = t.ground_truth;
    const amt = txData.amt || 0;
    const prob = t.probability || 0;

    // Calculate Haversine distance from cardholder (lat, long) to merchant (merch_lat, merch_long)
    if (
      txData.lat !== undefined &&
      txData.long !== undefined &&
      txData.merch_lat !== undefined &&
      txData.merch_long !== undefined
    ) {
      const dist = haversineDistance(
        txData.lat,
        txData.long,
        txData.merch_lat,
        txData.merch_long
      );
      totalDistanceKm += dist;
      validDistCount++;
    }

    // Accumulate State stats
    if (!stateMap[state]) {
      stateMap[state] = {
        state,
        total: 0,
        fraud: 0,
        legit: 0,
        flaggedVol: 0,
        totalVol: 0,
        probSum: 0,
        fp: 0,
        fn: 0,
      };
    }
    const sObj = stateMap[state];
    sObj.total++;
    sObj.totalVol += amt;
    sObj.probSum += prob;

    if (pred === 1) {
      sObj.fraud++;
      sObj.flaggedVol += amt;
    } else {
      sObj.legit++;
    }

    if (pred === 1 && gt === 0) sObj.fp++;
    if (pred === 0 && gt === 1) sObj.fn++;

    // Accumulate City stats
    if (!cityMap[city]) {
      cityMap[city] = {
        city,
        state,
        total: 0,
        fraud: 0,
        flaggedVol: 0,
      };
    }
    const cObj = cityMap[city];
    cObj.total++;
    cObj.flaggedVol += pred === 1 ? amt : 0;
    if (pred === 1) cObj.fraud++;
  });

  // State Array sorted by Fraud Count descending, then total descending
  const stateList = Object.values(stateMap).map((s) => ({
    ...s,
    fraudRate: s.total > 0 ? (s.fraud / s.total) * 100 : 0,
    avgProb: s.total > 0 ? (s.probSum / s.total) * 100 : 0,
  }));
  stateList.sort((a, b) => b.fraud - a.fraud || b.total - a.total);

  // City Array sorted by Fraud Count descending, then total descending
  const cityList = Object.values(cityMap).map((c) => ({
    ...c,
    fraudRate: c.total > 0 ? (c.fraud / c.total) * 100 : 0,
  }));
  cityList.sort((a, b) => b.fraud - a.fraud || b.total - a.total);

  // Key KPI values
  const statesImpactedCount = stateList.length;
  const stateMostFrauds = stateList[0] || null;
  const totalFlaggedVol = stateList.reduce((acc, s) => acc + s.flaggedVol, 0);
  const avgDistanceKm =
    validDistCount > 0 ? totalDistanceKm / validDistCount : 0;

  // Chart data: Top 8 States by Predicted Fraud Count
  const topStatesChartData = stateList.slice(0, 8).map((s) => ({
    name: s.state,
    frauds: s.fraud,
    total: s.total,
    fraudRate: parseFloat(s.fraudRate.toFixed(1)),
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* ─── HEADER & WINDOW SCOPE CONTROLS ────────────────────────────────── */}
      <section className="panel" style={{ padding: "20px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "16px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            paddingBottom: "10px",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "11px",
                fontWeight: 800,
                color: "#0284c7",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              GEOGRAPHIC RISK OBSERVABILITY
            </div>
            <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>
              Geographic analysis bounded to the latest {windowLimit} transaction history window
            </div>
          </div>

          {/* Window Range Selector (50 / 100 / 250 / 500) */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span
              style={{
                fontSize: "12px",
                color: "#94a3b8",
                marginRight: "6px",
                fontWeight: 700,
              }}
            >
              Window Scope:
            </span>
            {[50, 100, 250, 500].map((lim) => (
              <button
                key={lim}
                onClick={() => setWindowLimit(lim)}
                className={`ccFilterPill ${windowLimit === lim ? "active" : ""}`}
                style={{ fontSize: "11px", padding: "4px 10px" }}
              >
                Recent {lim}
              </button>
            ))}
          </div>
        </div>

        {/* ─── GEO KPI CARDS ──────────────────────────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "16px",
          }}
        >
          <div className="kpi">
            <div className="kpiIcon blue">
              <Globe2 size={20} />
            </div>
            <span>States Impacted</span>
            <strong>{statesImpactedCount}</strong>
            <small>Active US states in recent window</small>
          </div>

          <div className="kpi">
            <div className="kpiIcon red">
              <AlertTriangle size={20} />
            </div>
            <span>State with Most Predicted Frauds</span>
            <strong>
              {stateMostFrauds ? stateMostFrauds.state : "N/A"}
            </strong>
            <small>
              {stateMostFrauds
                ? `${stateMostFrauds.fraud} frauds (${stateMostFrauds.total} evaluated)`
                : "No fraud recorded"}
            </small>
          </div>

          <div className="kpi">
            <div className="kpiIcon amber">
              <MapPin size={20} />
            </div>
            <span>Flagged Fraud Volume</span>
            <strong>{fmtCurrency(totalFlaggedVol)}</strong>
            <small>Sum of predicted fraud amounts</small>
          </div>

          <div className="kpi">
            <div className="kpiIcon green">
              <Navigation size={20} />
            </div>
            <span>Avg Customer–Merchant Distance</span>
            <strong>{avgDistanceKm.toFixed(1)} km</strong>
            <small>Haversine from (lat,long) to (merch_lat,merch_long)</small>
          </div>
        </div>
      </section>

      {/* ─── TOP STATES BAR CHART ────────────────────────────────────────── */}
      <section className="panel chart" style={{ padding: "20px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "14px",
          }}
        >
          <div>
            <b style={{ color: "#0f172a", fontSize: "14px" }}>
              Top States by Model-Predicted Fraud Count (Recent {recentTotal} Window)
            </b>
            <div style={{ fontSize: "12px", color: "#475569" }}>
              Ranks US states with the highest number of transactions predicted as fraud
            </div>
          </div>
          <TrendingUp size={18} style={{ color: "#ef4444" }} />
        </div>

        {recentTotal === 0 || topStatesChartData.length === 0 ? (
          <div
            style={{
              padding: "60px",
              textAlign: "center",
              color: "#64748b",
              fontSize: "13px",
            }}
          >
            No geographic transaction data available yet. Launch simulation stream in Command Center to observe location risk.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={topStatesChartData}>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="rgba(0,0,0,0.06)"
              />
              <XAxis dataKey="name" stroke="#475569" fontSize={12} />
              <YAxis stroke="#475569" fontSize={11} allowDecimals={false} />
              <Tooltip
                formatter={(val, name) => [
                  val,
                  name === "frauds" ? "Predicted Frauds" : "Evaluated Count",
                ]}
                contentStyle={{
                  background: "#0f172a",
                  borderColor: "#334155",
                  borderRadius: "8px",
                  color: "#f8fafc",
                }}
              />
              <Bar
                dataKey="frauds"
                fill="#ef4444"
                radius={[6, 6, 0, 0]}
                name="Predicted Frauds"
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>

      {/* ─── STATE RISK INTELLIGENCE TABLE ───────────────────────────────── */}
      <section className="panel">
        <div className="panelHead">
          <div>
            <b>State Risk Intelligence Table</b>
            <span>
              State-level aggregation of evaluated transactions (Recent {recentTotal} Window)
            </span>
          </div>
        </div>

        {stateList.length === 0 ? (
          <div
            style={{
              padding: "40px",
              textAlign: "center",
              color: "#64748b",
              fontSize: "13px",
            }}
          >
            No state transactions recorded in the current window.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>US State</th>
                <th>Evaluated Tx</th>
                <th>Predicted Frauds</th>
                <th>Legitimate Passed</th>
                <th>Fraud Rate %</th>
                <th>Flagged Volume</th>
                <th>Avg Risk Score</th>
                <th>False Positives</th>
                <th>False Negatives</th>
              </tr>
            </thead>
            <tbody>
              {stateList.map((s) => {
                const isHighFraud = s.fraud > 0;
                return (
                  <tr key={s.state}>
                    <td>
                      <strong style={{ color: "#0f172a" }}>{s.state}</strong>
                    </td>
                    <td>{s.total}</td>
                    <td>
                      <span
                        style={{
                          color: isHighFraud ? "#dc2626" : "#475569",
                          fontWeight: isHighFraud ? "700" : "400",
                        }}
                      >
                        {s.fraud}
                      </span>
                    </td>
                    <td>{s.legit}</td>
                    <td>{s.fraudRate.toFixed(1)}%</td>
                    <td>{fmtCurrency(s.flaggedVol)}</td>
                    <td>{s.avgProb.toFixed(1)}%</td>
                    <td>{s.fp}</td>
                    <td>{s.fn}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* ─── CITY FRAUD DISTRIBUTION TABLE ───────────────────────────────── */}
      <section className="panel">
        <div className="panelHead">
          <div>
            <b>Top City Fraud Distribution</b>
            <span>
              Granular city-level risk breakdown derived from dataset merchant & cardholder locations
            </span>
          </div>
        </div>

        {cityList.length === 0 ? (
          <div
            style={{
              padding: "40px",
              textAlign: "center",
              color: "#64748b",
              fontSize: "13px",
            }}
          >
            No city transaction data recorded in the current window.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>City, State</th>
                <th>Evaluated Tx</th>
                <th>Predicted Frauds</th>
                <th>Fraud Rate %</th>
                <th>Flagged Fraud Volume</th>
              </tr>
            </thead>
            <tbody>
              {cityList.slice(0, 15).map((c) => (
                <tr key={c.city}>
                  <td>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <Building2 size={14} style={{ color: "#64748b" }} />
                      <span style={{ color: "#0f172a", fontWeight: "600" }}>
                        {c.city}
                      </span>
                    </div>
                  </td>
                  <td>{c.total}</td>
                  <td>
                    <span
                      style={{
                        color: c.fraud > 0 ? "#dc2626" : "#475569",
                        fontWeight: c.fraud > 0 ? "700" : "400",
                      }}
                    >
                      {c.fraud}
                    </span>
                  </td>
                  <td>{c.fraudRate.toFixed(1)}%</td>
                  <td>{fmtCurrency(c.flaggedVol)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
