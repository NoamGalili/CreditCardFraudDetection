import { useEffect, useState, useCallback } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Lock,
  Gauge,
  MapPin,
  Sparkles,
  Clock3,
  MailCheck,
  CreditCard,
  Activity,
} from "lucide-react";
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

function Kpi({ label, value, sub, Icon, tone }) {
  return (
    <div className="kpi">
      <div className={cls("kpiIcon", tone)}>
        <Icon size={20} />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </div>
  );
}

export default function Overview() {
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
    current_index: 0,
  });

  const [transactions, setTransactions] = useState([]);
  const [selectedSeq, setSelectedSeq] = useState(null);

  // Poll simulator summary, status, and transactions history (read-only observer)
  const fetchData = useCallback(async () => {
    try {
      const [resSummary, resStatus, resTxs] = await Promise.all([
        fetch("/api/dashboard/summary"),
        fetch("/api/dashboard/status"),
        fetch("/api/dashboard/transactions?limit=500"),
      ]);

      if (resSummary.ok) {
        const dSum = await resSummary.json();
        setSummary(dSum);
      }
      if (resStatus.ok) {
        const dStat = await resStatus.json();
        setStatus(dStat);
      }
      if (resTxs.ok) {
        const dTxs = await resTxs.json();
        setTransactions(dTxs);
      }
    } catch (e) {
      console.error("Overview fetch error:", e);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 2000);
    return () => clearInterval(timer);
  }, [fetchData]);

  // Derived datasets
  const fraudIncidents = transactions.filter((t) => t.prediction === 1);
  const activeTx =
    fraudIncidents.find((t) => t.sequence === selectedSeq) ||
    fraudIncidents[0] ||
    null;

  const totalCount = summary.total_transactions || 0;
  const fraudCount = summary.fraud_predictions || 0;
  const legitCount = summary.legit_predictions || 0;

  const fraudRatePct = totalCount > 0 ? ((fraudCount / totalCount) * 100).toFixed(1) : "0.0";
  const legitRatePct = totalCount > 0 ? ((legitCount / totalCount) * 100).toFixed(1) : "0.0";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* ─── KPI Row ────────────────────────────────────────────────── */}
      <div className="kpis">
        <Kpi
          label="Fraud Detected"
          value={fraudCount.toLocaleString()}
          sub={`${fraudRatePct}% fraud rate`}
          Icon={AlertTriangle}
          tone="red"
        />
        <Kpi
          label="Legitimate Passed"
          value={legitCount.toLocaleString()}
          sub={`${legitRatePct}% clean rate`}
          Icon={CheckCircle2}
          tone="green"
        />
        <Kpi
          label="Total Processed"
          value={totalCount.toLocaleString()}
          sub={`${fmtCurrency(summary.total_volume)} stream volume`}
          Icon={Gauge}
          tone="amber"
        />
        <Kpi
          label="Flagged Fraud Volume"
          value={fmtCurrency(summary.flagged_fraud_volume)}
          sub={`Avg risk score ${(summary.avg_probability * 100).toFixed(1)}%`}
          Icon={Lock}
          tone="blue"
        />
      </div>

      {/* ─── Incident Queue & Inspector Split Layout ───────────────────── */}
      <div className="layout">
        {/* Left Column: Fraud Incident Queue */}
        <section className="panel queue">
          <div className="panelHead">
            <div>
              <b>Fraud Incident Queue</b>
              <span>Model-predicted fraud cases ({fraudIncidents.length})</span>
            </div>
          </div>

          {fraudIncidents.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "#64748b" }}>
              <CheckCircle2 size={32} style={{ marginBottom: "8px", opacity: 0.8, color: "#10b981" }} />
              <div style={{ fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                No Fraud Incidents Flagged Yet
              </div>
              <div style={{ fontSize: "12px" }}>
                {totalCount === 0
                  ? "Simulator stream has not started. Open Command Center to launch simulation."
                  : "All evaluated transactions passed model risk thresholds."}
              </div>
            </div>
          ) : (
            fraudIncidents.map((a) => {
              const txData = a.transaction || {};
              const isSel = activeTx && activeTx.sequence === a.sequence;
              const probPct = (a.probability * 100).toFixed(0);

              return (
                <button
                  key={a.sequence}
                  onClick={() => setSelectedSeq(a.sequence)}
                  className={cls("alertRow", isSel && "selected")}
                >
                  <div>
                    <span className="badge critical">CRITICAL</span>
                    <small>{fmtTime(a.processed_at)}</small>
                  </div>
                  <h3>#{a.sequence} · {a.transaction_id}</h3>
                  <p>
                    <MapPin size={13} /> {txData.city || "N/A"}, {txData.state || ""} · {txData.merchant || "Merchant"}
                  </p>
                  <footer>
                    <b>{fmtCurrency(txData.amt)}</b>
                    <span>Risk Score {probPct}%</span>
                  </footer>
                </button>
              );
            })
          )}
        </section>

        {/* Right Column: Selected Incident Inspector & Notification Preview */}
        <div className="stack">
          {/* Detail Panel */}
          <section className="panel detail">
            {!activeTx ? (
              <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
                No incident selected for detail view.
              </div>
            ) : (
              (() => {
                const txData = activeTx.transaction || {};
                const probPct = (activeTx.probability * 100).toFixed(1);
                const topReason =
                  activeTx.explanations?.final?.reasons?.[0]?.reasons?.[0] ||
                  "Model probability score crossed risk threshold.";

                return (
                  <>
                    <div className="detailTop">
                      <div>
                        <h2>#{activeTx.sequence} · {activeTx.transaction_id}</h2>
                        <p>
                          {txData.first || ""} {txData.last || ""} · {txData.category || "General"} · Selected-Stack Ensemble
                        </p>
                      </div>
                      <div className="score">
                        <span>Risk Score</span>
                        <b>{probPct}%</b>
                      </div>
                    </div>

                    <div className="grid3">
                      <div className="info">
                        <span>Amount</span>
                        <b>{fmtCurrency(txData.amt)}</b>
                      </div>
                      <div className="info">
                        <span>Inference Latency</span>
                        <b>{activeTx.inference_ms} ms</b>
                      </div>
                      <div className="info">
                        <span>Model Confidence</span>
                        <b>{probPct}%</b>
                      </div>
                      <div className="info">
                        <span>City / State</span>
                        <b>{txData.city || "N/A"}, {txData.state || ""}</b>
                      </div>
                      <div className="info">
                        <span>Card Number</span>
                        <b>{txData.cc_num ? `**** ${String(txData.cc_num).slice(-4)}` : "N/A"}</b>
                      </div>
                      <div className="info">
                        <span>Ground Truth</span>
                        <b>{activeTx.ground_truth === 1 ? "FRAUD (1)" : "LEGIT (0)"}</b>
                      </div>
                    </div>

                    {/* AI Explanation Box */}
                    <div className="explain">
                      <Sparkles size={18} />
                      <div>
                        <b>AI Model Explanation</b>
                        <p>{topReason}</p>
                      </div>
                    </div>

                    {/* Operational Tags (Read-only observation badges) */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        marginTop: "16px",
                        fontSize: "12px",
                        color: "#94a3b8",
                      }}
                    >
                      <span
                        style={{
                          background: "rgba(239, 68, 68, 0.15)",
                          border: "1px solid rgba(239, 68, 68, 0.3)",
                          color: "#fca5a5",
                          padding: "4px 10px",
                          borderRadius: "6px",
                          fontWeight: "700",
                        }}
                      >
                        Fraud Risk Flagged
                      </span>
                      <span
                        style={{
                          background: "rgba(99, 102, 241, 0.15)",
                          border: "1px solid rgba(99, 102, 241, 0.3)",
                          color: "#818cf8",
                          padding: "4px 10px",
                          borderRadius: "6px",
                          fontWeight: "700",
                        }}
                      >
                        Evaluated by Stacking Ensemble
                      </span>
                    </div>
                  </>
                );
              })()
            )}
          </section>

          {/* Customer Notification Preview (Read-only preview) */}
          <section className="panel phonePanel">
            <div className="panelHead">
              <div>
                <b>Customer Notification Preview</b>
                <span>Read-only push notification preview</span>
              </div>
              <MailCheck size={18} />
            </div>

            <div className="phone">
              <div className="phoneBar">
                <span>9:41</span>
                <span>FraudGuard</span>
              </div>

              {!activeTx ? (
                <div style={{ padding: "20px", textAlign: "center", fontSize: "12px", color: "#94a3b8" }}>
                  Select an incident to view notification preview.
                </div>
              ) : (
                (() => {
                  const txData = activeTx.transaction || {};
                  const probPct = (activeTx.probability * 100).toFixed(0);
                  return (
                    <div className="push">
                      <CreditCard size={18} />
                      <b>Fraud Risk Detected</b>
                      <p>
                        Fraud risk detected: {fmtCurrency(txData.amt)} at {txData.merchant || "Merchant"}. Risk score: {probPct}%.
                      </p>
                    </div>
                  );
                })()
              )}
            </div>
          </section>
        </div>
      </div>

      {/* ─── System Runtime & Stream Status Widget ─────────────────────── */}
      <section className="panel">
        <div className="panelHead">
          <div>
            <b>System Runtime & Stream Performance</b>
            <span>Real backend simulator execution metrics</span>
          </div>
          <Activity size={18} style={{ color: "#818cf8" }} />
        </div>

        <div className="services">
          <div className="service">
            <div className={cls("status", status.running ? "" : "warn")} />
            <b>Simulation Stream</b>
            <span>{status.running ? "LIVE STREAMING" : "SIMULATION PAUSED"}</span>
            <small>Interval {status.interval_seconds}s · Cursor {status.current_index}</small>
          </div>

          <div className="service">
            <div className="status" />
            <b>Avg Inference Latency</b>
            <span>{summary.avg_inference_ms} ms</span>
            <small>Selected-Stack Stacking Ensemble mean</small>
          </div>

          <div className="service">
            <div className="status" />
            <b>Cumulative Stream Count</b>
            <span>{totalCount.toLocaleString()} transactions</span>
            <small>Processed since simulator reset</small>
          </div>

          <div className="service">
            <div className="status" />
            <b>Dataset Pool Capacity</b>
            <span>{status.dataset_size.toLocaleString()} items</span>
            <small>Kaggle pool size (Seed 42)</small>
          </div>
        </div>
      </section>

      {/* ─── Case Timeline ──────────────────────────────────────────────── */}
      <section className="panel">
        <div className="panelHead">
          <div>
            <b>Case Audit Timeline</b>
            <span>Live event log derived from simulator stream decisions</span>
          </div>
        </div>

        <div className="timeline">
          {transactions.length === 0 ? (
            <div style={{ padding: "20px", textAlign: "center", color: "#64748b", fontSize: "13px" }}>
              No audit events logged yet. Launch simulation stream in Command Center to observe events.
            </div>
          ) : (
            transactions.slice(0, 5).map((x) => {
              const isFraud = x.prediction === 1;
              return (
                <div key={x.sequence}>
                  <Clock3 size={15} />
                  <span>{fmtTime(x.processed_at)}</span>
                  <b>
                    Sequence #{x.sequence} ({x.transaction_id}) scored as{" "}
                    <span style={{ color: isFraud ? "#f87171" : "#4ade80" }}>
                      {isFraud ? "FRAUD" : "LEGIT"}
                    </span>{" "}
                    ({(x.probability * 100).toFixed(1)}% score)
                  </b>
                  <small>Stacking Ensemble ({x.inference_ms}ms)</small>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
