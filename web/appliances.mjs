export function applianceWatts(annualKwh){const n=Number(annualKwh);if(!Number.isFinite(n)||n<=0||n>=10000)throw Error('Invalid annual energy rating');return n*1000/(365*24)}
export function applianceMatches(records,query){const q=query.trim().toLowerCase();return records.filter(r=>!q||[r.brand,r.model,r.type].join(' ').toLowerCase().includes(q))}
