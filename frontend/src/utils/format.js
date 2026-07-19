export const money = n => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
export const cls = (...x) => x.filter(Boolean).join(' ');
