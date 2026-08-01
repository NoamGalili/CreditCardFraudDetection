import { useEffect, useState, useCallback } from 'react';
import {
  ShieldAlert, ShieldCheck, Upload, Send, Loader2, Zap, CheckCircle2,
  XCircle, Radar, BellRing, BellOff, AlertTriangle, ListChecks,
} from 'lucide-react';
import { cls, money } from '../utils/format';

// Fields shown in the transaction inspector (read-only).
const DISPLAY_FIELDS = [
  ['trans_date_trans_time', 'Date / Time'],
  ['amt', 'Amount'],
  ['merchant', 'Merchant'],
  ['category', 'Category'],
  ['gender', 'Gender'],
  ['city', 'City'],
  ['state', 'State'],
  ['job', 'Job'],
  ['dob', 'Date of Birth'],
  ['lat', 'Lat'],
  ['long', 'Long'],
  ['merch_lat', 'Merch Lat'],
  ['merch_long', 'Merch Long'],
  ['city_pop', 'City Pop'],
];

const SAMPLE_META = {
  legit: { label: 'Legit', cls: 'legit' },
  fraud: { label: 'Fraud', cls: 'fraud' },
  wrong_fp: { label: 'Was FP', cls: 'wrong' },
  wrong_fn: { label: 'Was FN', cls: 'wrong' },
};

function ScoreBar({ label, value, color }) {
  return (
    <div className="scoreRow">
      <span>{label}</span>
      <div className="scoreTrack"><div className="scoreFill" style={{ width: `${Math.min(value * 100, 100)}%`, background: color }} /></div>
      <b>{(value * 100).toFixed(2)}%</b>
    </div>
  );
}

// Per-model + final-decision reasoning. A model "identifies fraud" when its
// own probability crosses the model threshold (default 50%). The final block
// aggregates reasons from ONLY the models that flagged fraud.
function Explanations({ exp, isFraud }) {
  const anyFlagged = exp.models.some((m) => m.flagged_fraud);
  if (!isFraud && !anyFlagged) return null;

  return (
    <div className="reasons">
      {isFraud && exp.final.reasons.length > 0 && (
        <div className="reasonBlock final">
          <p className="reasonHead"><AlertTriangle size={14} /> Why this was flagged as fraud</p>
          {exp.final.note && <small className="reasonNote">{exp.final.note}</small>}
          {exp.final.reasons.map((g) => (
            <div className="finalModel" key={g.model}>
              <span className="finalModelName">{g.model}</span>
              <ul className="reasonList">
                {g.reasons.length
                  ? g.reasons.map((r, i) => <li key={i}>{r}</li>)
                  : <li className="muted">No dominant risk feature isolated.</li>}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className="reasonBlock">
        <p className="reasonHead"><ListChecks size={14} /> Per-model assessment</p>
        {exp.models.map((m) => (
          <div className={cls('modelRow', m.flagged_fraud ? 'flagged' : 'clear')} key={m.key}>
            <div className="modelRowTop">
              <span className="modelName">{m.name}</span>
              <span className={cls('miniTag', m.flagged_fraud ? 'fraud' : 'legit')}>
                {m.flagged_fraud ? 'flagged fraud' : 'no fraud'} · {(m.probability * 100).toFixed(1)}%
              </span>
            </div>
            {m.flagged_fraud && m.reasons.length > 0 && (
              <ul className="reasonList">
                {m.reasons.map((r, i) => (
                  <li key={i}>
                    <b>{r.label}</b>{r.value !== undefined && r.value !== null && <em> ({String(r.value)})</em>} — {r.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LiveDetection() {
  const [samples, setSamples] = useState([]);
  const [tx, setTx] = useState(null);
  const [txName, setTxName] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [telegram, setTelegram] = useState({ configured: false });
  const [testMsg, setTestMsg] = useState('');

  useEffect(() => {
    fetch('/api/samples').then(r => r.json()).then(setSamples).catch(() => {});
    fetch('/api/telegram/status').then(r => r.json()).then(setTelegram).catch(() => {});
  }, []);

  const loadSample = useCallback(async (filename) => {
    setError(''); setResult(null);
    const r = await fetch('/api/samples/' + encodeURIComponent(filename));
    const data = await r.json();
    setTx(data); setTxName(filename.replace('.json', ''));
  }, []);

  const onUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        let data = JSON.parse(ev.target.result);
        if (Array.isArray(data)) data = data[0];
        setTx(data); setTxName(file.name.replace('.json', '')); setResult(null); setError('');
      } catch (err) { setError('Invalid JSON file: ' + err.message); }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  const analyze = useCallback(async () => {
    if (!tx) return;
    setLoading(true); setError(''); setResult(null);
    try {
      const r = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tx),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error || 'Prediction failed'); }
      else { setResult(data); }
    } catch (err) { setError(String(err)); }
    finally { setLoading(false); }
  }, [tx]);

  const sendTest = useCallback(async () => {
    setTestMsg('');
    const r = await fetch('/api/telegram/test', { method: 'POST' });
    const data = await r.json();
    setTestMsg(data.ok ? 'Test message sent ✓' : (data.error || 'Failed'));
  }, []);

  const gt = tx?.is_fraud;
  const isFraud = result?.is_fraud === 1;

  return (
    <div className="detect">
      {/* Sample picker + Telegram status */}
      <section className="panel">
        <div className="panelHead">
          <div><b>Live fraud detection</b><span>Score a transaction with the RF + CatBoost + XGBoost stacking ensemble</span></div>
          <div className={cls('tgPill', telegram.configured ? 'on' : 'off')}>
            {telegram.configured ? <BellRing size={14} /> : <BellOff size={14} />}
            Telegram {telegram.configured ? 'armed' : 'off'}
          </div>
        </div>
        <div className="sampleRow">
          {samples.map(s => {
            const meta = SAMPLE_META[s.label] || SAMPLE_META.legit;
            return (
              <button key={s.filename} className={cls('chip', meta.cls, txName === s.filename.replace('.json', '') && 'sel')}
                onClick={() => loadSample(s.filename)}>
                {s.filename.replace('.json', '')}
              </button>
            );
          })}
          <label className="chip upload">
            <Upload size={13} /> Upload JSON
            <input type="file" accept=".json" onChange={onUpload} hidden />
          </label>
        </div>
      </section>

      <div className="detectGrid">
        {/* Transaction inspector */}
        <section className="panel">
          <div className="panelHead"><div><b>Transaction</b><span>{txName || 'No transaction loaded'}</span></div></div>
          {!tx ? (
            <div className="empty2"><Radar size={30} /><p>Pick a sample or upload a transaction JSON to begin.</p></div>
          ) : (
            <>
              <div className="txGrid">
                {DISPLAY_FIELDS.map(([k, lbl]) => (
                  <div className="txField" key={k}>
                    <span>{lbl}</span>
                    <b>{k === 'amt' ? money(tx[k]) : String(tx[k] ?? '—')}</b>
                  </div>
                ))}
              </div>
              <button className="analyzeBtn" onClick={analyze} disabled={loading}>
                {loading ? <Loader2 className="spin" size={18} /> : <Zap size={18} />}
                {loading ? 'Analyzing…' : 'Analyze transaction'}
              </button>
              {error && <p className="errText"><XCircle size={14} /> {error}</p>}
            </>
          )}
        </section>

        {/* Result */}
        <section className="panel">
          <div className="panelHead"><div><b>Result</b><span>Ensemble decision & model breakdown</span></div></div>
          {!result ? (
            <div className="empty2"><ShieldCheck size={30} /><p>Run an analysis to see the fraud verdict.</p></div>
          ) : (
            <div className="resultBody">
              <div className={cls('verdict', isFraud ? 'fraud' : 'legit')}>
                {isFraud ? <ShieldAlert size={30} /> : <ShieldCheck size={30} />}
                <div>
                  <b>{result.label}</b>
                  <span>{(result.probability * 100).toFixed(2)}% fraud probability</span>
                </div>
                {gt !== undefined && gt !== null && (
                  <div className={cls('gtTag', Number(gt) === result.is_fraud ? 'ok' : 'bad')}>
                    {Number(gt) === result.is_fraud ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                    truth: {Number(gt) === 1 ? 'Fraud' : 'Legit'}
                  </div>
                )}
              </div>

              {/* Stacking probability vs threshold */}
              <div className="probWrap">
                <div className="probTrack">
                  <div className={cls('probFill', isFraud ? 'fraud' : 'legit')} style={{ width: `${result.probability * 100}%` }} />
                  <div className="threshMark" style={{ left: `${result.threshold * 100}%` }} title={`threshold ${(result.threshold * 100).toFixed(1)}%`} />
                </div>
                <small>Decision threshold {(result.threshold * 100).toFixed(1)}%</small>
              </div>

              {/* Base model breakdown */}
              <div className="breakdown">
                <p>Base model votes → meta-model</p>
                <ScoreBar label="Random Forest" value={result.base_models.random_forest} color="#6366f1" />
                <ScoreBar label="CatBoost" value={result.base_models.catboost} color="#0ea5e9" />
                <ScoreBar label="XGBoost" value={result.base_models.xgboost} color="#10b981" />
                <ScoreBar label="Stacking (final)" value={result.probability} color={isFraud ? '#ef4444' : '#22c55e'} />
              </div>

              {result.explanations && <Explanations exp={result.explanations} isFraud={isFraud} />}

              <div className="resFoot">
                <span>Inference {result.inference_ms} ms</span>
                {isFraud && (
                  <span className={cls('tgSent', result.telegram_notified ? 'ok' : 'bad')}>
                    {result.telegram_notified ? <><Send size={13} /> Telegram alert sent</> : <><BellOff size={13} /> {telegram.configured ? 'Telegram failed' : 'Telegram off'}</>}
                  </span>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Telegram control */}
      <section className="panel">
        <div className="panelHead"><div><b>Telegram notifications</b><span>A message is sent automatically on every fraud verdict</span></div></div>
        <div className="tgCtl">
          <div className={cls('tgState', telegram.configured ? 'on' : 'off')}>
            {telegram.configured ? 'Configured — alerts are armed.' : 'Not configured — set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env.'}
          </div>
          <button className="ghost" onClick={sendTest} disabled={!telegram.configured}><Send size={14} /> Send test message</button>
          {testMsg && <span className="tgTest">{testMsg}</span>}
        </div>
      </section>
    </div>
  );
}
