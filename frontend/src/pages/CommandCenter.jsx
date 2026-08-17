import { useEffect, useState, useRef, useCallback } from "react";
import {
  Play,
  Pause,
  Activity,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  RefreshCw,
  Cpu,
  Layers,
  Sparkles,
  ListChecks,
  Radio,
} from "lucide-react";
import { cls } from "../utils/format";

// Formatters
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

// Explanation component for predicted fraud transactions
function CommandCenterExplanations({ exp }) {
  if (!exp) return null;

  return (
    <div className="reasons" style={{ marginTop: "16px" }}>
      {/* Final Decision Reasons */}
      {exp.final && exp.final.reasons && exp.final.reasons.length > 0 && (
        <div className="reasonBlock final">
          <p className="reasonHead">
            <AlertTriangle size={14} /> Why this was flagged as fraud
          </p>
          {exp.final.note && <small className="reasonNote">{exp.final.note}</small>}
          {exp.final.reasons.map((g) => (
            <div className="finalModel" key={g.model}>
              <span className="finalModelName">{g.model}</span>
              <ul className="reasonList">
                {g.reasons && g.reasons.length > 0 ? (
                  g.reasons.map((r, i) => <li key={i}>{r}</li>)
                ) : (
                  <li className="muted">No dominant risk feature isolated.</li>
                )}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Per-Model Assessment */}
      {exp.models && exp.models.length > 0 && (
        <div className="reasonBlock">
          <p className="reasonHead">
            <ListChecks size={14} /> Per-model assessment
          </p>
          {exp.models.map((m) => (
            <div
              className={cls("modelRow", m.flagged_fraud ? "flagged" : "clear")}
              key={m.key}
            >
              <div className="modelRowTop">
                <span className="modelName">{m.name}</span>
                <span className={cls("miniTag", m.flagged_fraud ? "fraud" : "legit")}>
                  {m.flagged_fraud ? "flagged fraud" : "no fraud"} · {(m.probability * 100).toFixed(1)}%
                </span>
              </div>
              {m.flagged_fraud && m.reasons && m.reasons.length > 0 && (
                <ul className="reasonList">
                  {m.reasons.map((r, i) => (
                    <li key={i}>
                      <b>{r.label}</b>
                      {r.value !== undefined && r.value !== null && (
                        <em> ({String(r.value)})</em>
                      )}{" "}
                      — {r.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CommandCenter() {
  const [status, setStatus] = useState({
    running: false,
    interval_seconds: 3.0,
    dataset_size: 5000,
    processed_count: 0,
    current_index: 0,
    pool_loaded: false,
    load_error: null,
  });

  const [summary, setSummary] = useState({
    total_transactions: 0,
    fraud_predictions: 0,
    legit_predictions: 0,
    ground_truth_fraud: 0,
    correct_predictions: 0,
    accuracy: 0.0,
    avg_probability: 0.0,
    avg_inference_ms: 0.0,
    simulator_running: false,
    interval_seconds: 3.0,
    dataset_size: 5000,
    current_index: 0,
  });

  const [transactions, setTransactions] = useState([]);
  const [selectedSeq, setSelectedSeq] = useState(null);
  const [followLive, setFollowLive] = useState(true); // true = follow newest, false = manual item selection
  const [feedFilter, setFeedFilter] = useState("all"); // 'all' | 'fraud' | 'legitimate'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const prevTopSeqRef = useRef(null);
  const [newArrivalSeq, setNewArrivalSeq] = useState(null);

  // Fetch API snapshot (fetching up to 500 backend transactions for client filtering)
  const fetchData = useCallback(async () => {
    try {
      const [resStatus, resSummary, resTxs] = await Promise.all([
        fetch("/api/dashboard/status"),
        fetch("/api/dashboard/summary"),
        fetch("/api/dashboard/transactions?limit=500"),
      ]);

      if (!resStatus.ok || !resSummary.ok || !resTxs.ok) {
        throw new Error("Failed to fetch simulator data from backend");
      }

      const dataStatus = await resStatus.json();
      const dataSummary = await resSummary.json();
      const dataTxs = await resTxs.json();

      setStatus(dataStatus);
      setSummary(dataSummary);
      setTransactions(dataTxs);
      setError(null);

      // Detect new transaction arrival for flash highlight effect
      if (dataTxs && dataTxs.length > 0) {
        const topSeq = dataTxs[0].sequence;
        if (prevTopSeqRef.current !== null && topSeq !== prevTopSeqRef.current) {
          setNewArrivalSeq(topSeq);
          setTimeout(() => setNewArrivalSeq(null), 2500);
        }
        prevTopSeqRef.current = topSeq;
      }
    } catch (err) {
      console.error("CommandCenter polling error:", err);
      setError(err.message || "Failed to connect to simulator backend");
    } finally {
      setLoading(false);
    }
  }, []);

  // Set up polling interval (1.5 seconds)
  useEffect(() => {
    fetchData();
    const timer = setInterval(() => {
      fetchData();
    }, 1500);

    return () => clearInterval(timer);
  }, [fetchData]);

  // Simulator Control Handlers
  const handleStart = async () => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/dashboard/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval_seconds: 3.0 }),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error("Failed to start simulator:", e);
    } finally {
      setActionLoading(false);
    }
  };

  const handlePause = async () => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/dashboard/stop", {
        method: "POST",
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error("Failed to pause simulator:", e);
    } finally {
      setActionLoading(false);
    }
  };

  // 1. Filter by Search Query
  const searchFiltered = transactions.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const txData = t.transaction || {};
    return (
      (t.transaction_id && t.transaction_id.toLowerCase().includes(q)) ||
      (txData.merchant && txData.merchant.toLowerCase().includes(q)) ||
      (txData.category && txData.category.toLowerCase().includes(q)) ||
      (txData.city && txData.city.toLowerCase().includes(q))
    );
  });

  // 2. Filter by Prediction (all / fraud / legitimate)
  const predictionFiltered = searchFiltered.filter((t) => {
    if (feedFilter === "fraud") return t.prediction === 1;
    if (feedFilter === "legitimate") return t.prediction === 0;
    return true; // 'all'
  });

  // 3. Limit to ONLY the 10 most recent transactions for Command Center visible feed
  const visibleTxs = predictionFiltered.slice(0, 10);

  // Derive active selected transaction:
  // In Follow Live mode: always pick newest visible matching transaction (visibleTxs[0]).
  // In Manual Selection mode: pick selectedSeq if present in predictionFiltered, else fallback to visibleTxs[0].
  const activeTx = followLive
    ? visibleTxs[0] || null
    : predictionFiltered.find((t) => t.sequence === selectedSeq) || visibleTxs[0] || null;

  // Handle manual row selection
  const handleSelectTransaction = (seq) => {
    setSelectedSeq(seq);
    setFollowLive(false);
  };

  // Handle Follow Live button click
  const handleFollowLiveClick = () => {
    setFollowLive(true);
    setSelectedSeq(null);
  };

  // Handle feed filter change safely
  const handleFilterChange = (newFilter) => {
    setFeedFilter(newFilter);
    if (!followLive) {
      const newMatching = searchFiltered.filter((t) => {
        if (newFilter === "fraud") return t.prediction === 1;
        if (newFilter === "legitimate") return t.prediction === 0;
        return true;
      });
      const stillMatches = newMatching.some((t) => t.sequence === selectedSeq);
      if (!stillMatches) {
        setSelectedSeq(newMatching[0]?.sequence || null);
        if (newMatching.length === 0) {
          setFollowLive(true);
        }
      }
    }
  };

  return (
    <div className="ccWrap">
      {/* ─── Top Control Header ────────────────────────────────────────── */}
      <header className="ccHeader">
        <div className="ccHeaderLeft">
          <div>
            <h1 className="ccTitle">Live Monitoring Command Center</h1>
            <div className="ccSub">
              Real-time automatic transaction stream · 5,000 transaction Kaggle pool (Seed 42)
            </div>
          </div>

          <div className={`ccStatusBadge ${status.running ? "live" : "paused"}`}>
            <span className="pulseDot" />
            <span>{status.running ? "LIVE STREAMING" : "SIMULATION PAUSED"}</span>
          </div>
        </div>

        <div className="ccHeaderRight">
          <div style={{ textAlign: "right", marginRight: "12px", fontSize: "12px", color: "#94a3b8" }}>
            <div>Pool Index: <b style={{ color: "#f8fafc" }}>{status.current_index}</b> / {status.dataset_size}</div>
            <div>Interval: <b style={{ color: "#f8fafc" }}>{status.interval_seconds}s</b></div>
          </div>

          <button
            onClick={handleFollowLiveClick}
            className={`ccBtn follow ${followLive ? "active" : ""}`}
            title={followLive ? "Following live transaction stream" : "Click to follow live stream"}
          >
            <Radio size={16} className={followLive ? "pulseDot" : ""} />
            <span>{followLive ? "Following Live" : "Follow Live"}</span>
          </button>

          {status.running ? (
            <button
              onClick={handlePause}
              disabled={actionLoading}
              className="ccBtn pause"
            >
              <Pause size={16} />
              <span>Pause Stream</span>
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={actionLoading}
              className="ccBtn start"
            >
              <Play size={16} />
              <span>Start Stream</span>
            </button>
          )}
        </div>
      </header>

      {/* ─── Error Notification Banner ────────────────────────────────── */}
      {error && (
        <div
          style={{
            background: "rgba(239, 68, 68, 0.15)",
            border: "1px solid rgba(239, 68, 68, 0.4)",
            borderRadius: "12px",
            padding: "10px 16px",
            color: "#fca5a5",
            fontSize: "13px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <AlertTriangle size={16} />
            <span>Backend connection alert: {error}</span>
          </div>
          <button
            onClick={fetchData}
            style={{
              background: "transparent",
              border: "1px solid #fca5a5",
              color: "#fca5a5",
              borderRadius: "8px",
              padding: "4px 10px",
              cursor: "pointer",
              fontSize: "12px",
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* ─── Metrics KPI Row ────────────────────────────────────────────── */}
      <div className="ccKpiGrid">
        <div className="ccKpiCard">
          <span>Processed Count</span>
          <strong>{summary.total_transactions}</strong>
          <small>Total stream cycles</small>
        </div>

        <div className="ccKpiCard">
          <span>Fraud Predictions</span>
          <strong style={{ color: summary.fraud_predictions > 0 ? "#f87171" : "#f8fafc" }}>
            {summary.fraud_predictions}
          </strong>
          <small>
            {summary.total_transactions > 0
              ? `${((summary.fraud_predictions / summary.total_transactions) * 100).toFixed(1)}% fraud rate`
              : "0.0% fraud rate"}
          </small>
        </div>

        <div className="ccKpiCard">
          <span>Legitimate</span>
          <strong style={{ color: "#4ade80" }}>{summary.legit_predictions}</strong>
          <small>Passed evaluation</small>
        </div>

        <div className="ccKpiCard">
          <span>Model Accuracy</span>
          <strong style={{ color: "#818cf8" }}>
            {(summary.accuracy * 100).toFixed(1)}%
          </strong>
          <small>{summary.correct_predictions} / {summary.total_transactions} correct GT</small>
        </div>

        <div className="ccKpiCard">
          <span>Avg Probability</span>
          <strong>{(summary.avg_probability * 100).toFixed(1)}%</strong>
          <small>Ensemble risk score</small>
        </div>

        <div className="ccKpiCard">
          <span>Avg Latency</span>
          <strong>{summary.avg_inference_ms} ms</strong>
          <small>Selected-Stack speed</small>
        </div>
      </div>

      {/* ─── Main Content Split View ────────────────────────────────────── */}
      <div className="ccMainGrid">
        {/* LEFT COLUMN: Real-Time Transaction Feed */}
        <section className="ccPanel">
          <div className="ccPanelHeader">
            <b>
              <Activity size={18} style={{ color: "#818cf8" }} />
              Live Recent Feed
            </b>
            <span>Showing top {visibleTxs.length} items</span>
          </div>

          {/* Feed Filter Row (ALL | FRAUD | LEGITIMATE) */}
          <div className="ccFilterRow">
            <button
              onClick={() => handleFilterChange("all")}
              className={`ccFilterPill ${feedFilter === "all" ? "active" : ""}`}
            >
              ALL ({searchFiltered.length})
            </button>
            <button
              onClick={() => handleFilterChange("fraud")}
              className={`ccFilterPill ${feedFilter === "fraud" ? "active fraud" : ""}`}
            >
              FRAUD ({searchFiltered.filter((t) => t.prediction === 1).length})
            </button>
            <button
              onClick={() => handleFilterChange("legitimate")}
              className={`ccFilterPill ${feedFilter === "legitimate" ? "active legit" : ""}`}
            >
              LEGITIMATE ({searchFiltered.filter((t) => t.prediction === 0).length})
            </button>
          </div>

          {/* Search bar inside panel */}
          <div
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              background: "rgba(15, 23, 42, 0.2)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <Search size={14} style={{ color: "#64748b" }} />
            <input
              type="text"
              placeholder="Search by ID, merchant, category, city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: "transparent",
                border: 0,
                outline: 0,
                color: "#f8fafc",
                fontSize: "12px",
                width: "100%",
              }}
            />
          </div>

          <div className="ccFeedList">
            {loading && transactions.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
                <RefreshCw size={24} className="spin" style={{ marginBottom: "8px" }} />
                <div>Connecting to simulator backend...</div>
              </div>
            ) : visibleTxs.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
                <Clock size={28} style={{ marginBottom: "8px", opacity: 0.6 }} />
                <div style={{ fontWeight: 700, color: "#cbd5e1", marginBottom: "4px" }}>
                  {transactions.length === 0
                    ? "No transactions processed yet"
                    : "No matching transactions"}
                </div>
                <div style={{ fontSize: "12px" }}>
                  {transactions.length === 0
                    ? "Click 'Start Stream' to launch automatic simulation."
                    : `No transactions matching filter '${feedFilter.toUpperCase()}'.`}
                </div>
              </div>
            ) : (
              visibleTxs.map((item) => {
                const txData = item.transaction || {};
                const isSelected = activeTx && activeTx.sequence === item.sequence;
                const isNew = item.sequence === newArrivalSeq;
                const isFraudPred = item.prediction === 1;
                const isGtFraud = item.ground_truth === 1;
                const isGtMatch = item.prediction === item.ground_truth;

                return (
                  <div
                    key={item.sequence}
                    onClick={() => handleSelectTransaction(item.sequence)}
                    className={`ccTxItem ${isSelected ? "active" : ""} ${
                      isNew ? "newArrival" : ""
                    }`}
                  >
                    <div className="ccTxRowTop">
                      <span className="ccTxSeq">#{item.sequence} · {item.transaction_id}</span>
                      <span className="ccTxTime">{fmtTime(item.processed_at)}</span>
                    </div>

                    <div className="ccTxMainInfo">
                      <div>
                        <div className="ccTxMerchant">{txData.merchant || "Unknown Merchant"}</div>
                        <div className="ccTxCategory">
                          {txData.category || "General"} · {txData.city || ""}, {txData.state || ""}
                        </div>
                      </div>
                      <div className="ccTxAmount">{fmtCurrency(txData.amt)}</div>
                    </div>

                    <div className="ccTxBadges">
                      <span className={`ccBadge ${isFraudPred ? "fraud" : "legit"}`}>
                        {isFraudPred ? "FRAUD" : "LEGIT"} ({(item.probability * 100).toFixed(1)}%)
                      </span>

                      <span className={`ccGtBadge ${isGtMatch ? "match" : "mismatch"}`}>
                        GT: {isGtFraud ? "FRAUD" : "LEGIT"} {isGtMatch ? "✓" : "⚠"}
                      </span>

                      <span style={{ marginLeft: "auto", fontSize: "11px", color: "#64748b" }}>
                        {item.inference_ms}ms
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* RIGHT COLUMN: Selected / Latest Transaction Inspector */}
        <section className="ccPanel">
          <div className="ccPanelHeader">
            <b>
              <Cpu size={18} style={{ color: "#10b981" }} />
              Transaction Inspector
            </b>
            {activeTx && (
              <span>
                {followLive ? "LIVE FOLLOWING" : "MANUALLY SELECTED"} · Sequence #{activeTx.sequence} ({activeTx.transaction_id})
              </span>
            )}
          </div>

          {!activeTx ? (
            <div style={{ padding: "60px 20px", textAlign: "center", color: "#64748b" }}>
              <ShieldCheck size={40} style={{ marginBottom: "12px", opacity: 0.4 }} />
              <div style={{ fontSize: "16px", fontWeight: 700, color: "#cbd5e1" }}>
                No Transaction Selected
              </div>
              <div style={{ fontSize: "13px", marginTop: "4px" }}>
                Select a transaction from the live feed or click Start Stream to observe real-time predictions.
              </div>
            </div>
          ) : (
            <div className="ccInspector">
              {/* Verdict Header Card */}
              {(() => {
                const txData = activeTx.transaction || {};
                const isFraud = activeTx.prediction === 1;
                const isGtMatch = activeTx.prediction === activeTx.ground_truth;
                const probPct = (activeTx.probability * 100).toFixed(1);

                return (
                  <>
                    <div className={`ccVerdictCard ${isFraud ? "fraud" : "legit"}`}>
                      <div className="ccVerdictHeader">
                        <div className="ccVerdictTitle">
                          {isFraud ? (
                            <>
                              <ShieldAlert size={28} />
                              <span>FRAUD DETECTED</span>
                            </>
                          ) : (
                            <>
                              <ShieldCheck size={28} />
                              <span>LEGITIMATE TRANSACTION</span>
                            </>
                          )}
                        </div>

                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: "24px", fontWeight: "900", color: "#ffffff" }}>
                            {fmtCurrency(txData.amt)}
                          </div>
                          <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)" }}>
                            Threshold: {(activeTx.threshold * 100).toFixed(0)}%
                          </div>
                        </div>
                      </div>

                      {/* Probability bar */}
                      <div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "12px",
                            fontWeight: "700",
                            marginBottom: "6px",
                            color: isFraud ? "#fca5a5" : "#86efac",
                          }}
                        >
                          <span>Risk Probability Score</span>
                          <span>{probPct}%</span>
                        </div>
                        <div className="ccProbTrack">
                          <div
                            className={`ccProbFill ${isFraud ? "fraud" : "legit"}`}
                            style={{ width: `${Math.max(5, Math.min(100, activeTx.probability * 100))}%` }}
                          />
                        </div>
                      </div>

                      {/* Evaluation vs Ground Truth */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          paddingTop: "8px",
                          borderTop: "1px solid rgba(255,255,255,0.1)",
                          fontSize: "13px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span>Ground Truth Label:</span>
                          <b style={{ color: "#ffffff" }}>
                            {activeTx.ground_truth === 1 ? "FRAUD (1)" : "LEGITIMATE (0)"}
                          </b>
                        </div>

                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            fontWeight: "700",
                            color: isGtMatch ? "#4ade80" : "#fbbf24",
                          }}
                        >
                          {isGtMatch ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                          <span>
                            {isGtMatch ? "Correct Model Prediction" : "Prediction Discrepancy"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Fraud Explainability Section (Shown strictly when predicted FRAUD) */}
                    {isFraud && activeTx.explanations && (
                      <CommandCenterExplanations exp={activeTx.explanations} />
                    )}

                    {/* Base Models Breakdown */}
                    <div>
                      <div
                        style={{
                          fontSize: "12px",
                          fontWeight: "800",
                          color: "#94a3b8",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          marginBottom: "10px",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <Layers size={14} />
                        Selected-Stack Ensemble Model Scores
                      </div>

                      <div className="ccModelGrid">
                        {Object.entries(activeTx.base_models || {}).map(([modelKey, probVal]) => {
                          const valPct = (probVal * 100).toFixed(1);
                          return (
                            <div key={modelKey} className="ccModelBox">
                              <span>{modelKey.replace("_", " ").toUpperCase()}</span>
                              <b>{valPct}%</b>
                              <div
                                style={{
                                  height: "4px",
                                  background: "rgba(255,255,255,0.1)",
                                  borderRadius: "4px",
                                  marginTop: "4px",
                                  overflow: "hidden",
                                }}
                              >
                                <div
                                  style={{
                                    height: "100%",
                                    width: `${valPct}%`,
                                    background: probVal > 0.5 ? "#f87171" : "#6366f1",
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Transaction Raw Parameters */}
                    <div>
                      <div
                        style={{
                          fontSize: "12px",
                          fontWeight: "800",
                          color: "#94a3b8",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          marginBottom: "10px",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <Sparkles size={14} />
                        Dataset Transaction Parameters
                      </div>

                      <div className="ccParamGrid">
                        <div className="ccParamBox">
                          <span>Cardholder</span>
                          <b>{txData.first || ""} {txData.last || "Unknown"}</b>
                        </div>
                        <div className="ccParamBox">
                          <span>Card Number</span>
                          <b>{txData.cc_num ? `**** ${String(txData.cc_num).slice(-4)}` : "N/A"}</b>
                        </div>
                        <div className="ccParamBox">
                          <span>Merchant</span>
                          <b>{txData.merchant || "N/A"}</b>
                        </div>
                        <div className="ccParamBox">
                          <span>Category</span>
                          <b>{txData.category || "N/A"}</b>
                        </div>
                        <div className="ccParamBox">
                          <span>City / State</span>
                          <b>{txData.city || "N/A"}, {txData.state || ""} ({txData.zip || ""})</b>
                        </div>
                        <div className="ccParamBox">
                          <span>City Population</span>
                          <b>{txData.city_pop ? txData.city_pop.toLocaleString() : "N/A"}</b>
                        </div>
                        <div className="ccParamBox">
                          <span>Customer Lat/Long</span>
                          <b>{txData.lat ? `${txData.lat.toFixed(2)}, ${txData.long.toFixed(2)}` : "N/A"}</b>
                        </div>
                        <div className="ccParamBox">
                          <span>Merchant Lat/Long</span>
                          <b>{txData.merch_lat ? `${txData.merch_lat.toFixed(2)}, ${txData.merch_long.toFixed(2)}` : "N/A"}</b>
                        </div>
                        <div className="ccParamBox">
                          <span>Transaction Time</span>
                          <b>{txData.trans_date_trans_time || "N/A"}</b>
                        </div>
                        <div className="ccParamBox">
                          <span>Unix Timestamp</span>
                          <b>{txData.unix_time || "N/A"}</b>
                        </div>
                        <div className="ccParamBox">
                          <span>Gender / DOB</span>
                          <b>{txData.gender || "N/A"} · {txData.dob || "N/A"}</b>
                        </div>
                        <div className="ccParamBox">
                          <span>Inference Latency</span>
                          <b>{activeTx.inference_ms} ms</b>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
