import { applianceWatts, applianceMatches } from './appliances.mjs';
import { calculate, deviceKwh, freshness, tieredFlatCrossover, scenarioFile, parseScenario, resultCsv } from './model.mjs';
const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);
const decimal = (value, places = 1) => new Intl.NumberFormat('en-CA', { maximumFractionDigits: places }).format(value);
const storageKey = 'coolcode:tariffbench:scenario:v1';
let rates, presets, lastResult, nextId = 1;
function el(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
function status(text) { $('status').textContent = text; }
function addDevice(device = { name: 'My device', watts: 100, hours: 4, quantity: 1 }) {
  if ($('devices').children.length >= 200) return status('Maximum 200 devices per scenario.');
  const id = nextId++;
  const row = el('div', undefined, 'device');
  const top = el('div', undefined, 'device-top');
  const fields = el('div', undefined, 'fields');
  for (const [key, label, min, max, step] of [['name', 'Device name', null, null, null], ['watts', 'Average watts', 0, 1000000, 'any'], ['hours', 'Hours / day', 0, 24, 'any'], ['quantity', 'Quantity', 1, 10000, '1']]) {
    const group = el('div'); const input = el('input'); input.id = `device-${id}-${key}`; input.dataset.key = key;
    input.type = key === 'name' ? 'text' : 'number'; input.value = device[key];
    if (key === 'name') input.maxLength = 120; else { input.min = min; input.max = max; input.step = step; }
    const caption = el('label', label); caption.htmlFor = input.id; group.append(caption, input); (key === 'name' ? top : fields).append(group);
  }
  const remove = el('button', 'Remove', 'remove'); remove.type = 'button'; remove.setAttribute('aria-label', `Remove ${device.name || 'device'}`);
  remove.addEventListener('click', () => { row.remove(); render(); }); top.append(remove);
  row.append(top, fields, el('p', '', 'device-total')); $('devices').append(row);
}
function readScenario() {
  return { region: $('region').value, days: $('days').value, months: $('months').value, baseKwh: $('base-kwh').value, taxPercent: $('tax').value, baseShares: { overnight: $('base-night').value, peak: $('base-peak').value }, deviceShares: { overnight: $('device-night').value, peak: $('device-peak').value }, devices: [...$('devices').children].map(row => Object.fromEntries([...row.querySelectorAll('input')].map(input => [input.dataset.key, input.value]))) };
}
function applyScenario(s) {
  for (const [id, value] of Object.entries({ region: s.region, days: s.days, months: s.months, 'base-kwh': s.baseKwh, tax: s.taxPercent, 'base-night': s.baseShares.overnight, 'base-peak': s.baseShares.peak, 'device-night': s.deviceShares.overnight, 'device-peak': s.deviceShares.peak })) $(id).value = value;
  $('devices').replaceChildren(); s.devices.forEach(addDevice); render();
}
function render() {
  const ns = $('region').value === 'ns'; $('months-field').hidden = !ns; $('time-card').hidden = ns;
  for (const group of ['base', 'device']) {
    const left = 100 - Number($(`${group}-night`).value) - Number($(`${group}-peak`).value);
    $(`${group}-other`).textContent = `${decimal(left, 2)}% in other hours`;
  }
  try {
    lastResult = calculate(rates, readScenario());
    $('validation').hidden = true; $('result-content').hidden = false;
    for (const id of ['save', 'export-json', 'export-csv']) $(id).disabled = false;
  } catch (error) {
    lastResult = null; $('validation').textContent = error.message; $('validation').hidden = false; $('result-content').hidden = true;
    for (const id of ['save', 'export-json', 'export-csv']) $(id).disabled = true;
    for (const row of $('devices').children) row.querySelector('.device-total').textContent = 'Check the inputs above.';
    return;
  }
  const result = lastResult, s = result.scenario;
  $('added-kwh').textContent = decimal(result.addedKwh, 2); $('total-kwh').textContent = decimal(result.totalKwh, 2);
  $('period-note').textContent = `${s.days}-day period${ns ? ` · ${decimal(s.months, 2)} month(s) of basic charges` : ''} · ${s.taxPercent ? `${decimal(s.taxPercent, 2)}% simple tax adjustment` : 'before tax'} · CAD`;
  [...$('devices').children].forEach((row, i) => { row.querySelector('.device-total').textContent = `${decimal(deviceKwh(s.devices[i], s.days), 2)} kWh in this billing period`; row.querySelector('.remove').setAttribute('aria-label', `Remove ${s.devices[i].name || 'device'}`); });
  const cards = result.plans.map(p => {
    const card = el('article', undefined, 'plan'); card.dataset.plan = p.plan; card.append(el('h3', p.name));
    const price = el('div', undefined, 'plan-price'); const combined = el('div'); combined.append(el('strong', money(p.combined.total)), el('span', 'Household + devices'));
    const incremental = el('div', undefined, 'increment'); incremental.append(el('strong', money(p.incremental)), el('span', 'Added-device cost')); price.append(combined, incremental); card.append(price);
    card.append(el('p', `Annualized: ${money(p.annual)} total · ${money(p.annualIncremental)} for added devices`, 'annual'));
    const details = el('details'); details.append(el('summary', 'Show bill breakdown')); const list = el('dl', undefined, 'breakdown');
    for (const [label, value] of [['Energy charge', p.combined.energy], ['Basic charge', p.combined.fixed], ...(ns ? [] : [['BC rate riders (−1.5% net)', p.combined.rider]]), ...(p.plan.endsWith('-tod') ? [['Time-of-day adjustment', p.combined.timeOfDay]] : []), ...(s.taxPercent ? [['Simple tax adjustment', p.combined.tax]] : []), ['Bill without added devices', p.base.total]]) { const line = el('div'); line.append(el('dt', label), el('dd', money(value))); list.append(line); }
    details.append(list); if (p.plan.startsWith('bc-tiered')) details.append(el('p', `${decimal(p.combined.lowKwh, 3)} kWh at tier 1; ${decimal(p.combined.highKwh, 3)} kWh at tier 2. Threshold: ${decimal(rates.bc.threshold_kwh_per_day * s.days, 3)} kWh for ${s.days} days.`, 'hint'));
    card.append(details); return card;
  }); $('plan-results').replaceChildren(...cards);
  $('crossover').hidden = ns;
  $('crossover').textContent = `Tiered vs flat: at these rates, flat becomes cheaper above about ${decimal(tieredFlatCrossover(rates, s.days), 1)} kWh in ${s.days} days, before tax. The crossover is the same with identical time-of-day usage.`;
}
function reference() {
  $('edition-badge').textContent = `Rates reviewed ${rates.reviewed_at}`;
  const state = freshness(rates);
  $('freshness').textContent = state.expired ? `This reference edition ends ${rates.valid_through}. Calculations still use the displayed 2026 rates; verify current rates before relying on the estimate.` : state.stale ? `Rates were last reviewed ${rates.reviewed_at} (${state.ageDays} days ago). Verify the official sources before relying on the estimate.` : `Reference rates: BC effective ${rates.bc.effective_from}; NS effective ${rates.ns.effective_from}. Reviewed ${rates.reviewed_at}. Bills are estimates; taxes excluded by default.`;
  $('maintenance').textContent = `Tariffs are manually reviewed against the official linked sources. Edition ${rates.edition}; reviewed ${rates.reviewed_at}; reference valid through ${rates.valid_through}. A warning appears after ${rates.review_after_days} days without review, or after the reference end date. Rebuilding the site does not update the review date. No automatic rate updates are claimed.`;
  const bc = el('div'), ns = el('div'); bc.append(el('h3', 'BC Hydro · standard residential'));
  bc.append(el('p', `Effective ${rates.bc.effective_from}: tiered energy ${decimal(rates.bc.tier1 * 100, 2)}¢ / ${decimal(rates.bc.tier2 * 100, 2)}¢ per kWh, changing at exactly ${rates.bc.threshold_kwh_per_day} kWh per billing day; basic charge ${decimal(rates.bc.tiered_fixed_per_day * 100, 2)}¢/day. Flat energy ${decimal(rates.bc.flat * 100, 2)}¢/kWh; basic charge ${decimal(rates.bc.flat_fixed_per_day * 100, 2)}¢/day. A −1.5% deferral rider and 0% trade-income rider apply to energy and basic charges.`));
  bc.append(el('p', `Time-of-day tariff effective ${rates.bc.tod_effective_from}: −5¢/kWh overnight and +5¢/kWh at peak, added after those riders. Eligibility and available service options must be confirmed with BC Hydro.`));
  ns.append(el('h3', 'Nova Scotia Power · standard residential')); ns.append(el('p', `Effective ${rates.ns.effective_from}: combined energy ${decimal(rates.ns.energy * 100, 3)}¢/kWh plus $${rates.ns.fixed_per_month.toFixed(2)}/month. Use actual billed months for the basic charge. This edition is not suitable for the announced 2027 changes.`));
  for (const [section, source] of [[bc, rates.bc], [ns, rates.ns]]) { const links = el('div', undefined, 'source-links'); for (const item of source.sources) { const a = el('a', item.label + ' ↗'); a.href = item.url; a.rel = 'noreferrer'; a.target = '_blank'; links.append(a); } section.append(links); }
  $('rate-reference').replaceChildren(bc, ns);
}
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type })); const a = el('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function run(action) { try { action(); } catch (error) { status(error.message || 'That action could not be completed.'); } }

async function appliances() {
  const response=await fetch('./data/appliances.json'); if(!response.ok)throw Error('Appliance catalogue unavailable; you can still enter annual kWh or average watts manually.');
  const catalogue=await response.json(); let matches=[];
  function search(){matches=applianceMatches(catalogue.records,$('appliance-query').value);$('appliance-model').replaceChildren();for(const r of matches.slice(0,200)){const o=el('option',`${r.brand} ${r.model} · ${r.annualKwh} kWh/year · ${r.type}`);o.value=r.id;$('appliance-model').append(o)}$('appliance-status').textContent=`${catalogue.count.toLocaleString()} Canadian-market records · captured ${catalogue.capturedAt.slice(0,10)} UTC · source updated ${catalogue.sourceUpdatedAt?.slice(0,10)||'not supplied'}. ${matches.length} matches; showing ${Math.min(matches.length,200)}. Refine a broad search.`;$('add-appliance').disabled=!matches.length;}
  $('appliance-query').addEventListener('input',search);
  $('add-appliance').addEventListener('click',()=>{const r=matches.find(x=>x.id===$('appliance-model').value);if(!r)return;addDevice({name:`${r.brand} ${r.model} · ${r.annualKwh} kWh/yr`,watts:applianceWatts(r.annualKwh),hours:24,quantity:1});render();status(`Added ${r.brand} ${r.model} using its ${r.annualKwh} kWh/year reference rating.`);});search();
}

async function main() {
  [rates, presets] = await Promise.all(['rates.json', 'presets.json'].map(async path => { const response = await fetch(new URL(path, import.meta.url)); if (!response.ok) throw new Error(`Could not load ${path} (${response.status}).`); return response.json(); }));
  presets.forEach((preset, index) => { const option = el('option', preset.name); option.value = String(index); $('preset').append(option); });
  $('calculator').addEventListener('submit', event => event.preventDefault());
  $('calculator').addEventListener('input', render);
  $('add-device').addEventListener('click', () => { addDevice(presets[Number($('preset').value)]); render(); });
  $('save').addEventListener('click', () => run(() => { localStorage.setItem(storageKey, scenarioFile(readScenario(), rates)); status('Scenario saved in this browser. It will only be restored when you choose Restore saved.'); }));
  $('restore').addEventListener('click', () => run(() => { const text = localStorage.getItem(storageKey); if (!text) return status('No saved scenario in this browser.'); const file = parseScenario(text); applyScenario(file.scenario); status(`Saved scenario restored.${file.rateEdition !== rates.edition ? ' Results use the current displayed rate edition, not the saved edition.' : ''}`); }));
  $('forget').addEventListener('click', () => run(() => { localStorage.removeItem(storageKey); status('Saved scenario deleted from this browser. The current unsaved inputs remain.'); }));
  $('export-json').addEventListener('click', () => run(() => { download('tariffbench-scenario.json', scenarioFile(readScenario(), rates), 'application/json'); status('Scenario file downloaded. It contains your inputs.'); }));
  $('export-csv').addEventListener('click', () => run(() => { download('tariffbench-results.csv', resultCsv(lastResult, rates), 'text/csv;charset=utf-8'); status('Results exported with the rate edition and assumptions.'); }));
  $('import').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async () => { const file = $('import-file').files[0]; if (!file) return; try { if (file.size > 200000) throw new Error('Scenario file is too large (maximum 200 KB).'); const imported = parseScenario(await file.text()); applyScenario(imported.scenario); status(`Scenario opened locally.${imported.rateEdition !== rates.edition ? ' Recalculated using the displayed rate edition; the file used a different edition.' : ''}`); } catch (error) { status(`Could not open scenario: ${error.message}`); } finally { $('import-file').value = ''; } });
  addDevice(presets[0]); reference(); render();
  appliances().catch(error=>{$('appliance-status').textContent=error.message;});
}
main().catch(error => { $('load-error').hidden = false; $('load-error').textContent = `The calculator could not start. ${error.message} Reload the page or report an issue below.`; $('calculator').hidden = true; });
