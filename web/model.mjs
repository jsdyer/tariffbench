// Pure calculation engine. Currency stays unrounded until display; kWh is additive.
export const PLAN_NAMES = { 'bc-tiered': 'BC Hydro · tiered', 'bc-flat': 'BC Hydro · flat', 'bc-tiered-tod': 'BC Hydro · tiered + time of day', 'bc-flat-tod': 'BC Hydro · flat + time of day', 'ns-standard': 'NS Power · standard residential' };
export function number(value, label, min = 0, max = 1e9) {
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) throw new Error(`${label} is required.`);
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${label} must be between ${min} and ${max}.`);
  return n;
}
export function shares(value, label) {
  const overnight = number(value?.overnight, `${label}: overnight share`, 0, 100);
  const peak = number(value?.peak, `${label}: peak share`, 0, 100);
  if (overnight + peak > 100 + 1e-9) throw new Error(`${label}: overnight and peak shares cannot exceed 100% together.`);
  return { overnight, peak };
}
export function validateScenario(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.devices) || raw.devices.length > 200) throw new Error('Use a scenario with at most 200 devices.');
  if (!['bc', 'ns'].includes(raw.region)) throw new Error('Choose BC Hydro or Nova Scotia Power.');
  const days = number(raw.days, 'Billing days', 1, 366);
  const months = raw.region === 'ns' ? number(raw.months, 'Billed months', 0.01, 12) : 1;
  const baseKwh = number(raw.baseKwh, 'Other household electricity', 0, 1000000);
  const taxPercent = number(raw.taxPercent, 'Optional tax adjustment', 0, 100);
  const baseShares = raw.region === 'bc' ? shares(raw.baseShares, 'Other household electricity') : { overnight: 0, peak: 0 };
  const deviceShares = raw.region === 'bc' ? shares(raw.deviceShares, 'Added devices') : { overnight: 0, peak: 0 };
  const devices = raw.devices.map((d, i) => ({
    name: typeof d?.name === 'string' ? d.name.slice(0, 120) : `Device ${i + 1}`,
    watts: number(d?.watts, `Device ${i + 1}: watts`, 0, 1000000),
    hours: number(d?.hours, `Device ${i + 1}: hours/day`, 0, 24),
    quantity: number(d?.quantity, `Device ${i + 1}: quantity`, 1, 10000)
  }));
  if (devices.some(d => !Number.isInteger(d.quantity))) throw new Error('Device quantities must be whole numbers.');
  return { region: raw.region, days, months, baseKwh, taxPercent, baseShares, deviceShares, devices };
}
export const deviceKwh = (device, days = 1) => device.watts / 1000 * device.hours * device.quantity * days;
export function bill(rates, plan, kwh, days, months, allocation, taxPercent = 0) {
  if (!Object.hasOwn(PLAN_NAMES, plan)) throw new Error('Unknown rate plan.');
  number(kwh, 'Energy', 0, 1e12); number(days, 'Days', 1, 366); number(months, 'Months', 0.01, 12);
  let energy, fixed, rider = 0, timeOfDay = 0, lowKwh = 0, highKwh = 0;
  if (plan === 'ns-standard') {
    energy = kwh * rates.ns.energy;
    fixed = months * rates.ns.fixed_per_month;
  } else {
    const r = rates.bc;
    if (plan.startsWith('bc-tiered')) {
      lowKwh = Math.min(kwh, days * r.threshold_kwh_per_day);
      highKwh = Math.max(0, kwh - lowKwh);
      energy = lowKwh * r.tier1 + highKwh * r.tier2;
      fixed = days * r.tiered_fixed_per_day;
    } else { energy = kwh * r.flat; fixed = days * r.flat_fixed_per_day; }
    rider = (energy + fixed) * (r.deferral_rider + r.trade_income_rider);
    if (plan.endsWith('-tod')) {
      // RS 1901 and 1904 explicitly exclude RS 2101: don't apply riders to TOD.
      timeOfDay = allocation.overnight * r.overnight_adjustment + allocation.peak * r.peak_adjustment;
    }
  }
  const subtotal = energy + fixed + rider + timeOfDay;
  const tax = subtotal * taxPercent / 100;
  return { energy, fixed, rider, timeOfDay, subtotal, tax, total: subtotal + tax, lowKwh, highKwh };
}
const allocate = (kwh, split) => ({ overnight: kwh * split.overnight / 100, peak: kwh * split.peak / 100 });
export function calculate(rates, raw) {
  const s = validateScenario(raw);
  const addedKwh = s.devices.reduce((sum, d) => sum + deviceKwh(d, s.days), 0);
  const baseAllocation = allocate(s.baseKwh, s.baseShares);
  const addedAllocation = allocate(addedKwh, s.deviceShares);
  const allAllocation = { overnight: baseAllocation.overnight + addedAllocation.overnight, peak: baseAllocation.peak + addedAllocation.peak };
  const plans = Object.keys(PLAN_NAMES).filter(p => p.startsWith(s.region + '-')).map(plan => {
    const base = bill(rates, plan, s.baseKwh, s.days, s.months, baseAllocation, s.taxPercent);
    const combined = bill(rates, plan, s.baseKwh + addedKwh, s.days, s.months, allAllocation, s.taxPercent);
    const annualRatio = 365 / s.days;
    const annualBase = bill(rates, plan, s.baseKwh * annualRatio, 365, 12, { overnight: baseAllocation.overnight * annualRatio, peak: baseAllocation.peak * annualRatio }, s.taxPercent);
    const annualCombined = bill(rates, plan, (s.baseKwh + addedKwh) * annualRatio, 365, 12, { overnight: allAllocation.overnight * annualRatio, peak: allAllocation.peak * annualRatio }, s.taxPercent);
    return { plan, name: PLAN_NAMES[plan], base, combined, incremental: combined.total - base.total, annual: annualCombined.total, annualIncremental: annualCombined.total - annualBase.total };
  });
  return { scenario: s, addedKwh, totalKwh: s.baseKwh + addedKwh, plans };
}
export function freshness(rates, today = new Date()) {
  const current = today.toISOString().slice(0, 10);
  const ageDays = Math.floor((Date.parse(current) - Date.parse(rates.reviewed_at)) / 86400000);
  return { ageDays, expired: current > rates.valid_through, stale: ageDays > rates.review_after_days };
}
export function tieredFlatCrossover(rates, days) {
  const r = rates.bc;
  return ((r.tier2 - r.tier1) * r.threshold_kwh_per_day * days + (r.flat_fixed_per_day - r.tiered_fixed_per_day) * days) / (r.tier2 - r.flat);
}
export function scenarioFile(scenario, rates) {
  return JSON.stringify({ format: 'coolcode:tariffbench:scenario', version: 1, rateEdition: rates.edition, scenario: validateScenario(scenario) }, null, 2);
}
export function parseScenario(text) {
  if (text.length > 200000) throw new Error('Scenario file is too large (maximum 200 KB).');
  const file = JSON.parse(text);
  if (file?.format !== 'coolcode:tariffbench:scenario' || file.version !== 1) throw new Error('This is not a supported Tariff Bench scenario.');
  return { scenario: validateScenario(file.scenario), rateEdition: file.rateEdition };
}
const csvCell = value => '"' + String(value).replace(/^(?=[\s]*[=+@-]|[\t\r\n])/, "'").replaceAll('"', '""') + '"';
export function resultCsv(result, rates) {
  const rows = [['Tariff Bench electricity estimate', rates.edition], ['Rates reviewed', rates.reviewed_at], ['Currency', 'CAD'], ['Billing days', result.scenario.days], ['Billed months', result.scenario.months], ['Other household kWh', result.scenario.baseKwh], ['Added device kWh', result.addedKwh], ['Optional tax percent', result.scenario.taxPercent], [], ['Plan', 'Base household bill', 'Combined bill', 'Added-device cost', 'Annualized combined bill', 'Annualized added-device cost'], ...result.plans.map(p => [p.name, p.base.total.toFixed(2), p.combined.total.toFixed(2), p.incremental.toFixed(2), p.annual.toFixed(2), p.annualIncremental.toFixed(2)]), [], ['Device', 'Watts', 'Hours/day', 'Quantity', 'Period kWh'], ...result.scenario.devices.map(d => [d.name, d.watts, d.hours, d.quantity, deviceKwh(d, result.scenario.days)]), [], ['Assumptions', 'Estimates using one tariff edition; taxes excluded unless manually entered. No future-rate prediction.'], ['Other household overnight / peak %', result.scenario.baseShares.overnight, result.scenario.baseShares.peak], ['Added device overnight / peak %', result.scenario.deviceShares.overnight, result.scenario.deviceShares.peak]];
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}
