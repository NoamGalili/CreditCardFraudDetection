export const alerts = [
  { id:'FG-94821', status:'blocked', severity:'critical', holder:'Cardholder #4821', merchant:'Miami Luxury Outlet', amount:12400, currency:'USD', from:'Kyiv', to:'Miami', score:97, reason:'Geo anomaly', model:'XGBoost v3.2', latency:'38ms', channel:'Web', time:'Now', device:'Unknown MacOS Safari', ip:'45.82.11.90', confidence:0.98 },
  { id:'FG-09934', status:'blocked', severity:'critical', holder:'Cardholder #9934', merchant:'NYC Electronics', amount:21000, currency:'USD', from:'Shanghai', to:'New York', score:94, reason:'Card cloning', model:'Random Forest v2.9', latency:'42ms', channel:'POS', time:'4m', device:'Terminal POS-338', ip:'103.21.88.4', confidence:0.96 },
  { id:'FG-70093', status:'blocked', severity:'high', holder:'Cardholder #0093', merchant:'Wire Transfer', amount:3800, currency:'USD', from:'Lagos', to:'London', score:91, reason:'Merchant reputation', model:'XGBoost v3.2', latency:'35ms', channel:'Mobile', time:'7m', device:'Android 14', ip:'197.210.23.9', confidence:0.94 },
  { id:'FG-17712', status:'review', severity:'medium', holder:'Cardholder #7712', merchant:'Dubai Luxury Retail', amount:6150, currency:'USD', from:'Moscow', to:'Dubai', score:72, reason:'Velocity spike', model:'Neural Ensemble', latency:'51ms', channel:'POS', time:'12m', device:'Terminal POS-142', ip:'91.210.12.87', confidence:0.81 },
  { id:'FG-33310', status:'review', severity:'medium', holder:'Cardholder #3310', merchant:'Singapore Hotel', amount:1200, currency:'USD', from:'Berlin', to:'Singapore', score:68, reason:'Night activity', model:'XGBoost v3.2', latency:'29ms', channel:'Web', time:'16m', device:'iPhone 15', ip:'83.44.70.100', confidence:0.78 },
  { id:'FG-48847', status:'review', severity:'medium', holder:'Cardholder #8847', merchant:'London Jewelry', amount:4600, currency:'USD', from:'São Paulo', to:'London', score:61, reason:'Amount deviation', model:'Random Forest v2.9', latency:'44ms', channel:'Mobile', time:'22m', device:'iPhone 14', ip:'201.55.60.18', confidence:0.73 },
];
export const serviceHealth = [
  { name:'Fraud API', status:'Operational', uptime:'99.98%', p95:'42ms', rpm:1840 },
  { name:'Scoring Pipeline', status:'Operational', uptime:'99.95%', p95:'67ms', rpm:982 },
  { name:'Notification Gateway', status:'Degraded', uptime:'98.84%', p95:'180ms', rpm:420 },
  { name:'Audit Logger', status:'Operational', uptime:'99.99%', p95:'21ms', rpm:2800 },
];
export const timeseries = Array.from({length:24}, (_,i)=>({ hour:`${String(i).padStart(2,'0')}:00`, fraud:Math.round(2+Math.sin(i/2)*2+i/6), suspicious:Math.round(8+Math.cos(i/3)*5+i/3), approved:Math.round(140+Math.sin(i/4)*40+i*8), latency:Math.round(30+Math.sin(i/3)*16+i/4)}));
export const countries = [
  ['Russia',143,6,'High'],['Nigeria',87,5,'High'],['China',309,3,'Medium'],['United States',812,4,'Medium'],['Germany',256,1,'Low'],['Israel',198,1,'Low'],['United Kingdom',224,2,'Low'],['Brazil',115,2,'Medium']
].map(([name,tx,fr,risk])=>({name,tx,fr,rate:(fr/tx*100).toFixed(1),risk}));
export const audit = [
  ['09:41','Model scored transaction FG-94821 as critical','XGBoost v3.2'],
  ['09:42','Agent opened investigation panel','Yael Cohen'],
  ['09:43','Push notification generated for customer','Notification Gateway'],
  ['09:44','Transaction temporarily blocked','Fraud API'],
  ['09:45','Case added to high priority queue','Rules Engine']
].map(([time,event,actor])=>({time,event,actor}));
