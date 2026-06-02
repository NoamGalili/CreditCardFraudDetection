import { useMemo, useState } from 'react';
import { AlertTriangle, Activity, BellRing, CheckCircle2, ChevronLeft, Clock3, CreditCard, Database, Filter, Gauge, Globe2, LayoutDashboard, LineChart, Lock, MailCheck, MapPin, Network, Radar, Search, Settings, ShieldAlert, ShieldCheck, ShieldX, Sparkles, UserSearch, Zap } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { alerts, audit, countries, serviceHealth, timeseries } from './data/mockData';
import { money, cls } from './utils/format';
import CommandCenter from "./pages/CommandCenter";
import Shell from './layout/Shell';

const nav=[
  ['overview','Overview',LayoutDashboard],
  ['incidents','Incidents',BellRing,12],
  ['services','Services',Network],
  ['analytics','Analytics',LineChart],
  ['geo','Geo Risk',Globe2],
  ['command','Command Center',Radar],
  ['settings','Settings',Settings]
   ];const severityClass={critical:'critical',high:'high',medium:'medium'};
function Kpi({label,value,sub,Icon,tone}){return <div className="kpi"><div className={cls('kpiIcon',tone)}><Icon size={20}/></div><span>{label}</span><strong>{value}</strong><small>{sub}</small></div>}
function RiskBadge({severity}){return <span className={cls('badge',severityClass[severity])}>{severity}</span>}
function AlertQueue({selected,setSelected}){return <section className="panel queue"><div className="panelHead"><div><b>Incident queue</b><span>Prioritized by risk score and freshness</span></div><button className="ghost"><Filter size={15}/> Filter</button></div>{alerts.map(a=><button key={a.id} onClick={()=>setSelected(a)} className={cls('alertRow',selected.id===a.id&&'selected')}><div><RiskBadge severity={a.severity}/><small>{a.time}</small></div><h3>{a.id} · {a.holder}</h3><p><MapPin size={13}/>{a.from} → {a.to} · {a.merchant}</p><footer><b>{money(a.amount)}</b><span>Score {a.score}</span></footer></button>)}</section>}
function Detail({item}){return <section className="panel detail"><div className="detailTop"><div><h2>{item.id}</h2><p>{item.holder} · {item.channel} · {item.model}</p></div><div className="score"><span>Risk score</span><b>{item.score}</b></div></div><div className="grid3"><Info k="Amount" v={money(item.amount)}/><Info k="Latency" v={item.latency}/><Info k="Confidence" v={`${Math.round(item.confidence*100)}%`}/><Info k="Device" v={item.device}/><Info k="IP Address" v={item.ip}/><Info k="Reason" v={item.reason}/></div><div className="explain"><Sparkles size={18}/><div><b>AI explanation</b><p>The transaction was blocked because the current location, device fingerprint, merchant category and spending amount do not match the customer baseline. The model found a strong fraud pattern, not just one weak signal.</p></div></div><div className="actions"><button className="danger"><ShieldX size={16}/> Confirm block</button><button className="success"><CheckCircle2 size={16}/> Release transaction</button><button><UserSearch size={16}/> Open customer profile</button></div></section>}
function Info({k,v}){return <div className="info"><span>{k}</span><b>{v}</b></div>}
function ServiceMap(){return <section className="panel"><div className="panelHead"><div><b>Service health</b><span>Datadog-style operational layer</span></div></div><div className="services">{serviceHealth.map(s=><div className="service" key={s.name}><div className={cls('status',s.status==='Degraded'&&'warn')}/><b>{s.name}</b><span>{s.status}</span><small>Uptime {s.uptime} · p95 {s.p95} · {s.rpm} rpm</small></div>)}</div></section>}
function Charts(){return <div className="charts"><section className="panel chart"><b>Transaction volume</b><ResponsiveContainer width="100%" height={260}><AreaChart data={timeseries}><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={.35}/><stop offset="95%" stopColor="#6366f1" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="hour"/><YAxis/><Tooltip/><Area type="monotone" dataKey="approved" stroke="#6366f1" fill="url(#g)" strokeWidth={3}/></AreaChart></ResponsiveContainer></section><section className="panel chart"><b>Risk distribution</b><ResponsiveContainer width="100%" height={260}><PieChart><Pie data={[{name:'Critical',value:12,c:'#ef4444'},{name:'Review',value:47,c:'#f59e0b'},{name:'Clean',value:2341,c:'#10b981'}]} dataKey="value" innerRadius={70} outerRadius={105}>{[{c:'#ef4444'},{c:'#f59e0b'},{c:'#10b981'}].map((x,i)=><Cell key={i} fill={x.c}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></section></div>}
function Timeline(){return <section className="panel"><div className="panelHead"><div><b>Case timeline</b><span>Audit-ready event stream</span></div></div><div className="timeline">{audit.map((x,i)=><div key={i}><Clock3 size={15}/><span>{x.time}</span><b>{x.event}</b><small>{x.actor}</small></div>)}</div></section>}
function GeoTable(){return <section className="panel"><div className="panelHead"><div><b>Geo risk intelligence</b><span>Country-level fraud pressure</span></div></div><table><thead><tr><th>Country</th><th>Transactions</th><th>Frauds</th><th>Fraud %</th><th>Risk</th></tr></thead><tbody>{countries.map(c=><tr key={c.name}><td>{c.name}</td><td>{c.tx}</td><td>{c.fr}</td><td>{c.rate}%</td><td><span className={cls('riskPill',c.risk.toLowerCase())}>{c.risk}</span></td></tr>)}</tbody></table></section>}
function Notification({item}){return <section className="panel phonePanel"><div className="panelHead"><div><b>Customer notification preview</b><span>Ready-to-send push message</span></div><MailCheck size={18}/></div><div className="phone"><div className="phoneBar"><span>9:41</span><span>FraudGuard</span></div><div className="push"><CreditCard size={18}/><b>Transaction blocked</b><p>We blocked {money(item.amount)} at {item.merchant}. Reason: {item.reason}. Was this you?</p><div><button>No, block it</button><button>Yes, approve</button></div></div></div></section>}
function Overview(){const[selected,setSelected]=useState(alerts[0]);return <><div className="kpis"><Kpi label="Critical fraud" value="12" sub="+3 last hour" Icon={AlertTriangle} tone="red"/><Kpi label="Review queue" value="47" sub="6 SLA risks" Icon={Gauge} tone="amber"/><Kpi label="Approved today" value="2,341" sub="98.3% clean" Icon={CheckCircle2} tone="green"/><Kpi label="Saved today" value="$84K" sub="Estimated prevented loss" Icon={Lock} tone="blue"/></div><div className="layout"><AlertQueue selected={selected} setSelected={setSelected}/><div className="stack"><Detail item={selected}/><Notification item={selected}/></div></div><ServiceMap/><Timeline/></>}
function Analytics(){return <><Charts/><section className="panel chart"><b>Fraud and latency correlation</b><ResponsiveContainer width="100%" height={300}><BarChart data={timeseries}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="hour"/><YAxis/><Tooltip/><Bar dataKey="fraud" fill="#ef4444" radius={[8,8,0,0]}/><Bar dataKey="suspicious" fill="#f59e0b" radius={[8,8,0,0]}/></BarChart></ResponsiveContainer></section></>}
function Placeholder({title,sub,Icon}){return <section className="empty"><Icon size={38}/><h2>{title}</h2><p>{sub}</p></section>}
export default function App(){
    const[page,setPage]=useState('overview');
  
    return (
      <Shell nav={nav} page={page} setPage={setPage}>
        {page==='overview'&&<Overview/>}
        {page==='incidents'&&<Overview/>}
        {page==='services'&&<ServiceMap/>}
        {page==='analytics'&&<Analytics/>}
        {page==='geo'&&<GeoTable/>}
  
        {page==='command'&&<CommandCenter/>}
  
        {page==='settings'&&(
          <Placeholder
            title="Settings & Roles"
            sub="Prepared screen for admin roles, SLA thresholds, model versions and notification templates."
            Icon={Settings}
          />
        )}
      </Shell>
    );
  }