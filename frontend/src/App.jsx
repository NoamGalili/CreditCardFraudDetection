import { useMemo, useState } from 'react';
import { AlertTriangle, Activity, BellRing, CheckCircle2, ChevronLeft, Clock3, CreditCard, Database, Filter, Gauge, Globe2, LayoutDashboard, LineChart, Lock, MailCheck, MapPin, Network, Radar, Search, Settings, ShieldAlert, ShieldCheck, ShieldX, Sparkles, UserSearch, Zap } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { alerts, audit, countries, serviceHealth, timeseries } from './data/mockData';
import { money, cls } from './utils/format';
import CommandCenter from "./pages/CommandCenter";
import LiveDetection from "./pages/LiveDetection";
import Shell from './layout/Shell';

const nav = [
  ['detect', 'Live Detection', Zap],
  ['overview', 'Overview', LayoutDashboard],
  ['services', 'Services', Network],
  ['analytics', 'Analytics', LineChart],
  ['geo', 'Geo Risk', Globe2],
  ['command', 'Command Center', Radar]
]; const severityClass = { critical: 'critical', high: 'high', medium: 'medium' };
function Kpi({ label, value, sub, Icon, tone }) { return <div className="kpi"><div className={cls('kpiIcon', tone)}><Icon size={20} /></div><span>{label}</span><strong>{value}</strong><small>{sub}</small></div> }
function RiskBadge({ severity }) { return <span className={cls('badge', severityClass[severity])}>{severity}</span> }
function AlertQueue({ selected, setSelected }) { return <section className="panel queue"><div className="panelHead"><div><b>Incident queue</b><span>Prioritized by risk score and freshness</span></div><button className="ghost"><Filter size={15} /> Filter</button></div>{alerts.map(a => <button key={a.id} onClick={() => setSelected(a)} className={cls('alertRow', selected.id === a.id && 'selected')}><div><RiskBadge severity={a.severity} /><small>{a.time}</small></div><h3>{a.id} · {a.holder}</h3><p><MapPin size={13} />{a.from} → {a.to} · {a.merchant}</p><footer><b>{money(a.amount)}</b><span>Score {a.score}</span></footer></button>)}</section> }
function Detail({ item }) { return <section className="panel detail"><div className="detailTop"><div><h2>{item.id}</h2><p>{item.holder} · {item.channel} · {item.model}</p></div><div className="score"><span>Risk score</span><b>{item.score}</b></div></div><div className="grid3"><Info k="Amount" v={money(item.amount)} /><Info k="Latency" v={item.latency} /><Info k="Confidence" v={`${Math.round(item.confidence * 100)}%`} /><Info k="Device" v={item.device} /><Info k="IP Address" v={item.ip} /><Info k="Reason" v={item.reason} /></div><div className="explain"><Sparkles size={18} /><div><b>AI explanation</b><p>The transaction was blocked because the current location, device fingerprint, merchant category and spending amount do not match the customer baseline. The model found a strong fraud pattern, not just one weak signal.</p></div></div><div className="actions"><button className="danger"><ShieldX size={16} /> Confirm block</button><button className="success"><CheckCircle2 size={16} /> Release transaction</button><button><UserSearch size={16} /> Open customer profile</button></div></section> }
function Info({ k, v }) { return <div className="info"><span>{k}</span><b>{v}</b></div> }
function ServiceMap() { return <section className="panel"><div className="panelHead"><div><b>Service health</b><span>Datadog-style operational layer</span></div></div><div className="services">{serviceHealth.map(s => <div className="service" key={s.name}><div className={cls('status', s.status === 'Degraded' && 'warn')} /><b>{s.name}</b><span>{s.status}</span><small>Uptime {s.uptime} · p95 {s.p95} · {s.rpm} rpm</small></div>)}</div></section> }
import Overview from "./pages/Overview";
import Analytics from "./pages/Analytics";
import GeoRisk from "./pages/GeoRisk";

export default function App() {

  const [page, setPage] = useState('detect');

  return (
    <Shell nav={nav} page={page} setPage={setPage}>
      {page === 'detect' && <LiveDetection />}
      {page === 'overview' && <Overview />}
      {page === 'services' && <ServiceMap />}
      {page === 'analytics' && <Analytics />}
      {page === 'geo' && <GeoRisk />}
      {page === 'command' && <CommandCenter />}
    </Shell>
  );
}