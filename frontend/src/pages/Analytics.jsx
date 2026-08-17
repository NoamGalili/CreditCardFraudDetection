import { useEffect, useState, useCallback } from "react";
import {
  LineChart as LineChartIcon,
  Activity,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Sparkles,
  PieChart as PieIcon,
  Sliders,
  Check,
  XCircle,
  HelpCircle,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
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

const fmtTime = (isoString) => {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch (e) {
    return isoString;
  }
};

export default function Analytics() {
  const [summary, setSummary] = useState({
    total_transactions: 0,
    fraud_predictions: 0,
    legit_predictions: 0,
    ground_truth_fraud: 0,
    correct_predictions: 0,
    accuracy: 0.0,
    avg_probability: 0.0,
    avg_inference_ms: 0.0,
    total_volume: 0.0,
    flagged_fraud_volume: 0.0,
  });

  const [status, setStatus] = useState({
    running: false,
    interval_seconds: 3.0,
    dataset_size: 5000,
    processed_count: 0,
  });

  const [daily, setDaily] = useState({
    date: "",
    total_transactions: 0,
    fraud_predictions: 0,
    legit_predictions: 0,
    total_volume: 0.0,
    flagged_fraud_volume: 0.0,
    avg_probability: null,
    avg_inference_ms: null,
    hourly: [],
  });

  const [transactions, setTransactions] = useState([]);
  const [windowLimit, setWindowLimit] = useState(500); // 50 | 100 | 250 | 500

  // Poll simulator summary, status, daily 24H stats, and transaction history
  const fetchData = useCallback(async () => {
    try {
      const [resSummary, resStatus, resTxs, resDaily] = await Promise.all([
        fetch("/api/dashboard/summary"),
        fetch("/api/dashboard/status"),
        fetch("/api/dashboard/transactions?limit=500"),
        fetch("/api/dashboard/daily"),
      ]);

      if (resSummary.ok) setSummary(await resSummary.json());
      if (resStatus.ok) setStatus(await resStatus.json());
      if (resTxs.ok) setTransactions(await resTxs.json());
      if (resDaily.ok) setDaily(await resDaily.json());
    } catch (e) {
      console.error("Analytics fetch error:", e);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 2000);
    return () => clearInterval(timer);
  }, [fetchData]);

  // Derive Daily 24-Hour chart data (00:00 to 23:59)
  const dailyHourlyData = (daily.hourly || []).map((b) => ({
    time: `${b.hour}:00`,
    evaluated: b.total_transactions || 0,
    fraud: b.fraud_predictions || 0,
    legit: b.legit_predictions || 0,
    volume: b.total_volume || 0,
  }));

  const dailyPieData = [
    { name: "Fraud Predictions", value: daily.fraud_predictions || 0, color: "#ef4444" },
    { name: "Legitimate Passed", value: daily.legit_predictions || 0, color: "#10b981" },
  ];
  const dailyTotalTxs = daily.total_transactions || 0;

  // Derive Recent Window dataset (newest first, slice up to windowLimit, then reverse for chronological charts)
  const windowTxsReversed = transactions.slice(0, windowLimit);
  const windowTxs = [...windowTxsReversed].reverse(); // Chronological order
  const windowTotal = windowTxs.length;

  // Evaluation calculations for recent window (Prediction vs Ground Truth)
  let tp = 0,
    fp = 0,
    tn = 0,
    fn = 0;
  let windowFraudCount = 0;
  let windowLegitCount = 0;
  let windowTotalVolume = 0;
  let windowFraudVolume = 0;

  // Base model probability accumulators
  let rfSum = 0,
    catSum = 0,
    xgbSum = 0,
    metaSum = 0;
  let rfCount = 0,
    catCount = 0,
    xgbCount = 0;

  windowTxs.forEach((t) => {
    const pred = t.prediction;
    const gt = t.ground_truth;
    const amt = t.transaction?.amt || 0;

    if (pred === 1) {
      windowFraudCount++;
      windowFraudVolume += amt;
    } else {
      windowLegitCount++;
    }
    windowTotalVolume += amt;

    if (pred === 1 && gt === 1) tp++;
    else if (pred === 1 && gt === 0) fp++;
    else if (pred === 0 && gt === 0) tn++;
    else if (pred === 0 && gt === 1) fn++;

    const bm = t.base_models || {};
    if (bm.random_forest !== undefined) {
      rfSum += floatVal(bm.random_forest);
      rfCount++;
    }
    if (bm.catboost !== undefined) {
      catSum += floatVal(bm.catboost);
      catCount++;
    }
    if (bm.xgboost !== undefined) {
      xgbSum += floatVal(bm.xgboost);
      xgbCount++;
    }
    if (t.probability !== undefined) {
      metaSum += floatVal(t.probability);
    }
  });

  function floatVal(v) {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  const windowFraudRate = windowTotal > 0 ? (windowFraudCount / windowTotal) * 100 : 0;
  const windowAccuracy = windowTotal > 0 ? ((tp + tn) / windowTotal) * 100 : 0;
  const precision = tp + fp > 0 ? (tp / (tp + fp)) * 100 : 0;
  const recall = tp + fn > 0 ? (tp / (tp + fn)) * 100 : 0;
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  const rfAvgRisk = rfCount > 0 ? (rfSum / rfCount) * 100 : 0;
  const catAvgRisk = catCount > 0 ? (catSum / catCount) * 100 : 0;
  const xgbAvgRisk = xgbCount > 0 ? (xgbSum / xgbCount) * 100 : 0;
  const metaAvgRisk = windowTotal > 0 ? (metaSum / windowTotal) * 100 : 0;

  // Chart data: Latency buckets across chronological recent window
  const bucketSize = Math.max(1, Math.ceil(windowTotal / 12));
  const timeBuckets = [];
  for (let i = 0; i < windowTotal; i += bucketSize) {
    const chunk = windowTxs.slice(i, i + bucketSize);
    const firstTx = chunk[0];
    const label = fmtTime(firstTx.processed_at) || `#${firstTx.sequence}`;
    const avgMs =
      chunk.reduce((sum, c) => sum + (c.inference_ms || 0), 0) / chunk.length;

    timeBuckets.push({
      time: label,
      latency: Math.round(avgMs),
    });
  }

  // Base model ensemble comparison data
  const baseModelData = [
    { name: "Random Forest", avgRisk: parseFloat(rfAvgRisk.toFixed(1)), color: "#6366f1" },
    { name: "CatBoost", avgRisk: parseFloat(catAvgRisk.toFixed(1)), color: "#0ea5e9" },
    { name: "XGBoost", avgRisk: parseFloat(xgbAvgRisk.toFixed(1)), color: "#10b981" },
    { name: "Stacking (Meta)", avgRisk: parseFloat(metaAvgRisk.toFixed(1)), color: "#f59e0b" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* ─── SECTION 1: CUMULATIVE SESSION SUMMARY (LIFETIME METRICS) ───── */}
      <section className="panel" style={{ padding: "20px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "16px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            paddingBottom: "10px",
          }}
        >
          <div>
            <div style={{ fontSize: "11px", fontWeight: 800, color: "#4f46e5", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              CUMULATIVE SESSION SUMMARY
            </div>
            <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>
              Lifetime Stream Performance (Unbounded Session Accumulators)
            </div>
          </div>
          <span style={{ fontSize: "12px", background: "rgba(99, 102, 241, 0.15)", color: "#818cf8", padding: "4px 10px", borderRadius: "6px", fontWeight: "700" }}>
            Session Scope
          </span>
        </div>

        <div className="kpis">
          <div className="kpi">
            <div className="kpiIcon red"><AlertTriangle size={20} /></div>
            <span>Fraud Predictions</span>
            <strong>{(summary.fraud_predictions || 0).toLocaleString()}</strong>
            <small>
              {summary.total_transactions > 0
                ? `${((summary.fraud_predictions / summary.total_transactions) * 100).toFixed(1)}% cumulative rate`
                : "0.0% cumulative rate"}
            </small>
          </div>

          <div className="kpi">
            <div className="kpiIcon green"><CheckCircle2 size={20} /></div>
            <span>Legitimate Predictions</span>
            <strong>{(summary.legit_predictions || 0).toLocaleString()}</strong>
            <small>Passed evaluation</small>
          </div>

          <div className="kpi">
            <div className="kpiIcon amber"><Activity size={20} /></div>
            <span>Total Processed</span>
            <strong>{(summary.total_transactions || 0).toLocaleString()}</strong>
            <small>{fmtCurrency(summary.total_volume)} cumulative volume</small>
          </div>

          <div className="kpi">
            <div className="kpiIcon blue"><Zap size={20} /></div>
            <span>Flagged Fraud Volume</span>
            <strong>{fmtCurrency(summary.flagged_fraud_volume)}</strong>
            <small>Session Accuracy: {((summary.accuracy || 0) * 100).toFixed(1)}%</small>
          </div>
        </div>
      </section>

      {/* ─── SECTION 2: DAILY 24-HOUR OBSERVABILITY (TODAY: 00:00 - 23:59) ─── */}
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
            <div style={{ fontSize: "11px", fontWeight: 800, color: "#0284c7", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              DAILY 24-HOUR OBSERVABILITY (TODAY)
            </div>
            <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>
              Continuous full-day stream metrics ({daily.date || "Today"}) — Preserved across session resets
            </div>
          </div>

          <span style={{ fontSize: "12px", background: "rgba(14, 165, 233, 0.15)", color: "#0284c7", padding: "4px 10px", borderRadius: "6px", fontWeight: "700" }}>
            24H Daily Scope (00:00 - 23:59)
          </span>
        </div>

        {/* 24H Daily Charts Row */}
        <div className="charts">
          {/* Chart 1: Evaluation Stream Throughput — Today (24H) */}
          <section className="panel chart">
            <div style={{ marginBottom: "10px" }}>
              <b style={{ color: "#0f172a", fontSize: "14px" }}>
                Evaluation Stream Throughput — Today (24H)
              </b>
              <div style={{ fontSize: "12px", color: "#64748b" }}>
                Transactions processed per hour (00:00 - 23:59) for {daily.date || "today"}
              </div>
            </div>

            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={dailyHourlyData}>
                <defs>
                  <linearGradient id="dailyVolGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="time" stroke="#475569" fontSize={11} />
                <YAxis stroke="#475569" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: "#0f172a", borderColor: "#334155", borderRadius: "8px", color: "#ffffff" }}
                  itemStyle={{ color: "#ffffff" }}
                  labelStyle={{ color: "#ffffff" }}
                  formatter={(val) => [`${val} txs`, "Processed"]}
                />
                <Area type="monotone" dataKey="evaluated" stroke="#0ea5e9" fill="url(#dailyVolGrad)" strokeWidth={2} name="Evaluated Count" />
              </AreaChart>
            </ResponsiveContainer>
          </section>

          {/* Chart 2: Prediction Risk Distribution — Today (24H) */}
          <section className="panel chart">
            <div style={{ marginBottom: "10px" }}>
              <b style={{ color: "#0f172a", fontSize: "14px" }}>
                Prediction Risk Distribution — Today (24H)
              </b>
              <div style={{ fontSize: "12px", color: "#64748b" }}>
                Full-day fraud vs legitimate predictions ratio ({dailyTotalTxs} total processed today)
              </div>
            </div>

            {dailyTotalTxs === 0 ? (
              <div style={{ padding: "60px", textAlign: "center", color: "#64748b" }}>
                No transactions processed today yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={dailyPieData}
                    dataKey="value"
                    innerRadius={65}
                    outerRadius={95}
                    paddingAngle={3}
                  >
                    {dailyPieData.map((x, i) => (
                      <Cell key={i} fill={x.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#0f172a", borderColor: "#334155", borderRadius: "8px", color: "#ffffff" }}
                    itemStyle={{ color: "#ffffff" }}
                    labelStyle={{ color: "#ffffff" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </section>
        </div>
      </section>

      {/* ─── SECTION 3: RECENT WINDOW ANALYTICS (BOUNDED HISTORY SCOPE) ─── */}
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
            <div style={{ fontSize: "11px", fontWeight: 800, color: "#059669", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              RECENT WINDOW EVALUATION & TRENDS
            </div>
            <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>
              Analysis bounded to the latest {windowLimit} transaction history window
            </div>
          </div>

          {/* Window Range Selector (50 / 100 / 250 / 500) */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "12px", color: "#94a3b8", marginRight: "6px", fontWeight: 700 }}>
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

        {/* Window Operational & Evaluation KPI Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginBottom: "20px" }}>
          <div className="ccKpiCard">
            <span>Recent Window Fraud Rate</span>
            <strong style={{ color: windowFraudRate > 0 ? "#f87171" : "#f8fafc" }}>
              {windowFraudRate.toFixed(1)}%
            </strong>
            <small>{windowFraudCount} / {windowTotal} transactions</small>
          </div>

          <div className="ccKpiCard">
            <span>Recent Window Accuracy</span>
            <strong style={{ color: "#818cf8" }}>{windowAccuracy.toFixed(1)}%</strong>
            <small>{tp + tn} / {windowTotal} GT match</small>
          </div>

          <div className="ccKpiCard">
            <span>Model Precision</span>
            <strong style={{ color: "#38bdf8" }}>{precision.toFixed(1)}%</strong>
            <small>TP / (TP + FP)</small>
          </div>

          <div className="ccKpiCard">
            <span>Model Recall (Sensitivity)</span>
            <strong style={{ color: "#4ade80" }}>{recall.toFixed(1)}%</strong>
            <small>TP / (TP + FN)</small>
          </div>

          <div className="ccKpiCard">
            <span>F1 Score</span>
            <strong style={{ color: "#fbbf24" }}>{f1Score.toFixed(1)}%</strong>
            <small>Harmonic mean</small>
          </div>
        </div>

        {/* Evaluation Confusion Matrix Cards */}
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "12px", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
            Prediction vs Ground Truth Evaluation Matrix (Recent {windowTotal} Transactions)
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
            <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: "12px", padding: "12px" }}>
              <div style={{ fontSize: "11px", fontWeight: 800, color: "#047857", textTransform: "uppercase" }}>
                True Positives (TP)
              </div>
              <div style={{ fontSize: "22px", fontWeight: 900, color: "#065f46", margin: "4px 0" }}>
                {tp}
              </div>
              <div style={{ fontSize: "12px", color: "#047857", fontWeight: "600" }}>
                Predicted FRAUD · Ground Truth FRAUD
              </div>
            </div>

            <div style={{ background: "#fff1f2", border: "1px solid #fecaca", borderRadius: "12px", padding: "12px" }}>
              <div style={{ fontSize: "11px", fontWeight: 800, color: "#b91c1c", textTransform: "uppercase" }}>
                False Positives (FP)
              </div>
              <div style={{ fontSize: "22px", fontWeight: 900, color: "#991b1b", margin: "4px 0" }}>
                {fp}
              </div>
              <div style={{ fontSize: "12px", color: "#b91c1c", fontWeight: "600" }}>
                Predicted FRAUD · Ground Truth LEGIT
              </div>
            </div>

            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "12px", padding: "12px" }}>
              <div style={{ fontSize: "11px", fontWeight: 800, color: "#1d4ed8", textTransform: "uppercase" }}>
                True Negatives (TN)
              </div>
              <div style={{ fontSize: "22px", fontWeight: 900, color: "#1e40af", margin: "4px 0" }}>
                {tn}
              </div>
              <div style={{ fontSize: "12px", color: "#1d4ed8", fontWeight: "600" }}>
                Predicted LEGIT · Ground Truth LEGIT
              </div>
            </div>

            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "12px", padding: "12px" }}>
              <div style={{ fontSize: "11px", fontWeight: 800, color: "#b45309", textTransform: "uppercase" }}>
                False Negatives (FN)
              </div>
              <div style={{ fontSize: "22px", fontWeight: 900, color: "#92400e", margin: "4px 0" }}>
                {fn}
              </div>
              <div style={{ fontSize: "12px", color: "#b45309", fontWeight: "600" }}>
                Predicted LEGIT · Ground Truth FRAUD
              </div>
            </div>
          </div>
        </div>

        {/* ─── Base Model Ensemble Risk Score Comparison (Mathematically Defined) ─── */}
        <section className="panel chart" style={{ marginBottom: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <div>
              <b style={{ color: "#0f172a" }}>Base Model Ensemble Risk Score Comparison</b>
              <div style={{ fontSize: "12px", color: "#475569" }}>
                Mathematically calculated mean probability: Avg Risk = sum(base_models[model]) / recent_window_count
              </div>
            </div>
            <Layers size={18} style={{ color: "#4f46e5" }} />
          </div>

          {windowTotal === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
              No base model probabilities recorded yet.
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={baseModelData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="name" stroke="#475569" fontSize={12} />
                  <YAxis stroke="#475569" fontSize={11} domain={[0, 100]} unit="%" />
                  <Tooltip
                    formatter={(val) => [`${val}%`, "Avg Fraud Risk Score"]}
                    contentStyle={{ background: "#0f172a", borderColor: "#334155", borderRadius: "8px", color: "#ffffff" }}
                    itemStyle={{ color: "#ffffff" }}
                    labelStyle={{ color: "#ffffff" }}
                  />
                  <Bar dataKey="avgRisk" radius={[6, 6, 0, 0]}>
                    {baseModelData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginTop: "16px" }}>
                <div className="ccModelBox">
                  <span>RANDOM FOREST AVG RISK</span>
                  <b style={{ color: "#818cf8" }}>{rfAvgRisk.toFixed(1)}%</b>
                  <small>n = {rfCount} predictions</small>
                </div>
                <div className="ccModelBox">
                  <span>CATBOOST AVG RISK</span>
                  <b style={{ color: "#38bdf8" }}>{catAvgRisk.toFixed(1)}%</b>
                  <small>n = {catCount} predictions</small>
                </div>
                <div className="ccModelBox">
                  <span>XGBOOST AVG RISK</span>
                  <b style={{ color: "#34d399" }}>{xgbAvgRisk.toFixed(1)}%</b>
                  <small>n = {xgbCount} predictions</small>
                </div>
                <div className="ccModelBox">
                  <span>STACKING META-MODEL AVG</span>
                  <b style={{ color: "#fbbf24" }}>{metaAvgRisk.toFixed(1)}%</b>
                  <small>Final ensemble score</small>
                </div>
              </div>
            </>
          )}
        </section>

        {/* ─── Model Inference Speed Trend Chart ────────────────────────── */}
        <section className="panel chart">
          <b style={{ color: "#0f172a" }}>
            Model Inference Latency Trend (Recent {windowTotal} Transactions)
          </b>
          {windowTotal === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
              No latency data recorded yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={timeBuckets}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} unit="ms" />
                <Tooltip
                  formatter={(val) => [`${val} ms`, "Avg Inference Latency"]}
                  contentStyle={{ background: "#0f172a", borderColor: "#334155", borderRadius: "8px", color: "#ffffff" }}
                  itemStyle={{ color: "#ffffff" }}
                  labelStyle={{ color: "#ffffff" }}
                />
                <Bar dataKey="latency" fill="#818cf8" radius={[4, 4, 0, 0]} name="Avg Latency (ms)" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
      </section>
    </div>
  );
}
