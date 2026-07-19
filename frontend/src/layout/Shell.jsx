import React from 'react';
import { ShieldCheck, LayoutDashboard, BellRing, Network, LineChart, Globe2, Radar, Settings, Search } from 'lucide-react';
import { cls } from '../utils/format';

export default function Shell({ nav, page, setPage, children }) {
  return (
    <div className="app" dir="ltr">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandIcon"><ShieldCheck size={22} /></div>
          <div><b>FraudGuard</b><span>Command Center</span></div>
        </div>
        <nav>
          {nav.map(([id, label, Icon, badge]) => (
            <button key={id} onClick={() => setPage(id)} className={cls('navBtn', page === id && 'active')}>
              <Icon size={18} />
              <span>{label}</span>
              {badge && <em>{badge}</em>}
            </button>
          ))}
        </nav>
        <div className="agent">
          <div className="avatar">YC</div>
          <div><b>Yael Cohen</b><span>Senior Fraud Agent</span></div>
          <i />
        </div>
      </aside>
      <main className="main">
        <Topbar />
        <div className="content">{children}</div>
      </main>
    </div>
  );
}

function Topbar() {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow"><span />Live fraud observability</p>
        <h1>Agent Operations Console</h1>
      </div>
      <div className="search"><Search size={17} /><input placeholder="Search transactions, cardholders, countries..." /></div>
    </header>
  );
}
