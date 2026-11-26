# Tariff Bench

[Open the electricity cost calculator](https://coolcode.ca/tariffbench/).

Estimate how much your NAS, desktop, heater or other device adds to the household electricity bill. Compare BC Hydro tiered and flat residential service, with optional time-of-day overlays, or calculate Nova Scotia Power standard residential service. No account, API key, file upload or installation is required.

<!-- coolcode:guide -->
Enter actual billing days and the household kWh **excluding** the devices in your scenario. Add arbitrary devices with average watts, hours per day and quantity. Tariff Bench calculates total bills and the extra cost of all devices together, sharing the household's BC tier threshold rather than giving each device a new lower tier. BC time-of-day estimates use separate energy shares for household and added-device loads; check eligibility with BC Hydro before switching. NS standard service uses its published combined energy rate and your actual number of billed months. Rates were manually reviewed November 24, 2026, with effective dates shown on the page; this reference edition ends December 31, 2026. Tax defaults to zero; an optional simple percentage does not reproduce all tax/rebate rules. Save on your device only when requested, download/open scenario JSON or export CSV results. No inputs leave the browser. NS time-of-day equipment tariffs and enrollment-limited pilots are outside this calculator's coverage.
Search the Canadian-market ENERGY STAR refrigeration catalogue by brand or model and add its rated annual energy use to the same household scenario. Catalogue capture dates are separate from manually reviewed tariff dates.
<!-- /coolcode:guide -->

## Rate edition and calculations

`web/rates.json` is the reviewed, versioned source of rates and official source links. It is bundled with the application; a build does **not** fetch rates or change the review timestamp.

| Service | Effective date | Included charges |
| --- | --- | --- |
| BC Hydro tiered (RS 1101) | April 1, 2026 | $0.1187/kWh up to **22.1918 kWh per billing day**, then $0.1408/kWh; $0.2344/day basic charge |
| BC Hydro flat (RS 1151) | April 1, 2026 | $0.1270/kWh and $0.25/day basic charge |
| BC riders (RS 1901 / 1904) | April 1, 2026 | −1.5% deferral rider and 0% trade income rider on base energy plus basic charge |
| BC time of day (RS 2101) | July 1, 2026 | −$0.05/kWh overnight (23:00–07:00), +$0.05/kWh at peak (16:00–21:00), daily in utility local time; other hours unchanged |
| NS standard residential | May 1, 2026 | Published combined customer energy rate $0.19128/kWh; $20.08 per billed month |

**BC riders exclude RS 2101 adjustments**, as specified in the electric tariff. NS's published combined energy price includes its listed fuel, operational and efficiency charges. The raw energy line in the tariff book is a different figure; do not substitute it without accounting for applicable riders, or add riders a second time to the combined price.

Official sources are linked in `web/rates.json` and in the tool: [BC electric tariff](https://www.bchydro.com/content/dam/BCHydro/customer-portal/documents/corporate/tariff-filings/electric-tariff/bchydro-electric-tariff.pdf), [NS standard rates](https://www.nspower.ca/your-home/residential-rates/standard-residential-service-rate), and [NS tariff book](https://www.nspower.ca/docs/default-source/regulatory/tariff-book-2026.pdf).

- Device kWh = watts ÷ 1000 × daily hours × quantity × billing days. A nameplate is not an average draw; use measurements for cycling loads and distinguish UPS overhead from its downstream devices.
- Added-device cost = whole-house bill with devices − whole-house bill without devices. Fixed charges occur once; devices share one tier. This estimates a change to the household bill, not a standalone service account for each device.
- Time-of-day percentages describe energy, not simply hours. Defaults illustrate constant use across 24 hours. Changes to these shares do not change overall kWh.
- Annualized results apply the same daily use for 365 days, 365 BC daily charges or 12 NS monthly charges, at the displayed rate edition. They are not a future-rate or seasonal-use forecast.
- BC tier/flat crossover includes the fixed-charge difference; identical time-of-day adjustments cancel in that comparison.
- All amounts are CAD. Currency is rounded for display only. Taxes are excluded unless the visitor supplies a simple effective percentage. No tax rate, provincial rebate, special charge, credit or payment adjustment is inferred.
- Use actual utility billing periods. Split estimates at tariff change dates. NS billing months are entered separately from days, including fractional months if applicable to the actual bill.
- Standard service only: NS thermal-storage time-of-day and enrollment-limited time-of-use/critical-peak programs are not modelled. BC meter/account eligibility is not inferred.

## Privacy

The application fetches its public `rates.json` and `presets.json`, then calculates locally. Inputs and imported scenario files are never uploaded or included in URLs. A namespaced browser-storage key, `coolcode:tariffbench:scenario:v1`, is written only by **Save on this device**, read only by **Restore saved**, and removed by **Delete saved**. Files you export contain your entered device names and usage. The common CoolCode aggregate visit counter does not receive calculator inputs.

## Expand or customize

1. Edit `web/presets.json` to add or change suggested devices. Wattages are explicitly editable illustrations. Visitors can already add custom devices without editing this file (up to a defensive 200-row limit).
2. For tariff updates, review the official customer pages **and** applicable tariff schedules/riders. Edit `web/rates.json`; record the true effective dates, a new `edition`, genuine `reviewed_at`, and a conservative `valid_through`. Never refresh these fields merely because a build succeeded. Keep earlier editions accessible in Git history.
3. Update rate examples and coverage here, plus model tests where the tariff structure changes. The UI derives displayed prices from the config. If a plan adds seasonal periods or eligibility rules, implement and test them before adding it to the supported plan list.
4. Run the checks below and inspect both desktop and mobile at a project URL. A push to `main` publishes only after checks pass. PRs build a reviewable artifact without deployment.
5. Update the hub catalogue/guide, audit coverage, generated Worker, sitemap and watchdog registration using [the tool lifecycle](https://github.com/jsdyer/jsdyer.github.io/blob/main/docs/tool-lifecycle.md). Tariffs remain a manual reference. The separate appliance catalogue now refreshes monthly through pages.yml; register that collector and its appliance capture timestamp without treating it as a tariff review. A warning appears after 90 days since review or after the edition's end date; it does not imply rates are verified between reviews.

The 2026 edition ends December 31 because NS has announced 2027 changes. Those future combined charges are not guessed. Confirm the final customer rates and all riders before publishing a new edition.

## Development and checks

```sh
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -v
python3 scripts/build.py
python3 -m pip install -r tests/browser-requirements.txt
# Use an installed Chromium-compatible browser, or install Playwright Chromium.
python3 -m playwright install chromium
python3 tests/browser_smoke.py
python3 -m http.server --directory dist 8080
```

The builder is offline and publishes only `web/` with escaped catalogue metadata and search metadata. `dist/` is generated and excluded from Git. Pure math tests cover shared tiers, rider exclusions, exact thresholds, annualization, monthly charges, imports and invalid inputs. The browser smoke test checks live results, invalid states, custom inputs, local persistence, export/import, and mobile overflow at a project subpath. Set `CHROMIUM_PATH` to use a system browser.

## Appliance models and annual energy use

The refrigerator finder uses the [ENERGY STAR residential refrigeration catalogue](https://data.energystar.gov/d/p5st-her9), filtered to records that explicitly list Canada in Markets. The source can include model wildcards and related refrigeration types. It does not represent all appliances sold in Canada or a stock/price check. No certification logo or endorsement is displayed.

Annual kWh is converted to average watts as `annualKwh × 1000 / (365 × 24)` and added at 24 hours/day. The existing tariff engine computes incremental cost using the household's shared tiers. The rating is a test reference; visitors can adjust assumptions. The annual average does not establish a time-of-day load shape or peak power.

Edit `config/appliances.json` to review the export, expected market and minimum coverage. Run `python3 scripts/refresh_appliances.py` or the manual Pages workflow. Monthly collection uses the public SODA3 CSV export, validates schema and annual ratings, and commits a dated snapshot. First publication collects if no snapshot exists. Failed collection prevents deployment; existing published data remains available. Scheduled appliance collection **does not review or advance tariff dates**. The existing tariff validity warning remains active. Register pages.yml cron `31 9 2 * *` and freshness `/tariffbench/data/appliances-status.json` → `capturedAt` with a 45-day tolerance in the watchdog. The separate schedule guard protects this collector only. No key is required.
