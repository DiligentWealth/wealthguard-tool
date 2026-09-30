# WealthGuard branding and reports update

Use this update with the GitHub/Vercel application you already have working.

## Files to copy into your existing repository

Copy these files from this package into the matching locations in your app:

- `src/App.js`
- `src/brand.js` (new)
- `src/report.js`
- `src/comparison.js` (new)
- `src/scenarioSummary.js` (new)
- `src/scenarioValidation.js`
- `src/index.css`
- `tailwind.config.js`
- `public/index.html`
- `public/favicon.ico`
- `public/manifest.json` (new)
- the complete `public/brand/` folder, including `fonts/` and font licences

Keep your live `src/supabaseClient.js`, authentication components, `src/index.js`, environment variables and Vercel settings. This package contains a local-review adapter for standalone testing; it is not a replacement for your live authentication setup. Your live Supabase client must retain the `storageMode` export added to resolve the previous build error.

`src/engine.js` is unchanged. Keep your working refined engine. The updated `src/scenarioValidation.js` adds optional report-text validation; copy it with this update. There are no new npm dependencies or database changes.

## Build and publish

Run these commands from your existing repository folder after copying the files:

```bash
npm run build
git status --short
git add src/App.js src/brand.js src/report.js src/comparison.js src/scenarioSummary.js src/scenarioValidation.js src/index.css tailwind.config.js public/index.html public/favicon.ico public/manifest.json public/brand
git commit -m "Refine WealthGuard reports and add three-scenario comparison"
git push
```

Vercel should rebuild the connected branch. If `git push` says everything is up to date, use `git status --short` to check that you copied the update into the correct repository and committed it first. If the old favicon remains after deployment, refresh the tab or reopen it; browsers cache icons.

## Export a report

1. Enter or load a scenario and check its assumptions.
2. Click **Export report**. Select the annual cash-flow appendix if needed.
3. Choose **Open PDF / Print report**, then **Save as PDF / Print** in the new report tab. In your browser, choose **Save as PDF**, A4, background graphics on and browser headers/footers off. The report supplies its own headers and page numbers.
4. Or choose **Download HTML** for a self-contained document, including images and fonts. It can be opened offline and printed later.

The report contains a cover, overview, five horizons, capital/cash-flow charts, net return and accumulation assumptions, model limits, capital events when entered, and matching Monte Carlo results when available. A fixed-return scenario without current Monte Carlo results includes a discussion page instead. The report captures the inputs at export; later edits do not change that copy. Invalid lump-sum timings block export. Reports do not include the app's separate gifting/wealth-transfer illustrations; this is stated in the report.

Reports use future NZD for projections and identify income entered in today's NZD. They use the current scenario's calculation results directly. Existing saved scenarios remain supported; the branding/export update adds no required scenario fields. Exported documents contain client details, so handle them like other client reports.

## Brand assets and fonts

The supplied master Diligent logo, report hero image and favicon are bundled locally. The WealthGuard five-horizon treatment uses the supplied advert's wording and visual approach, with navy and gold branding. Buckets retain their distinct original yellow, orange, green, blue and purple colours; comparison and cash-flow lines use distinct colours and dash patterns. Headings use Manrope and body/UI text uses Inter. Font files are self-hosted; licence notices are in `public/brand/fonts/`.

## Latest report fixes

Comparison exports accept saved scenarios with differing client details or ages and show those differences. Original bucket colours are restored, with distinct comparison-line patterns. The navy Your Retirement Picture panel now uses white headings and body text.

## Verification

Production build passes. All 40 calculation and comparison regression tests pass. Chromium checks cover title/favicon, branding on desktop and mobile, PDF/report pages, optional annual appendix, matching Monte Carlo inclusion and offline HTML images/fonts. A fictional Alex/Jamie Example report demonstrates the layout. No live GitHub repository or Vercel deployment was modified in this workspace.

## Client review and proposal reports

Client review is the default. All financial figures populate from the calculator; no extra text is required. Use Proposed retirement strategy for a new-client illustration. Expand Add report commentary to enter optional client goals, adviser comments and a related advice-document reference. Blank sections are omitted. These fields save with the scenario and travel in its JSON backup. Older scenarios load without requiring them.

Business defaults contain an optional adviser name and disclosure/complaints reference. These defaults are saved in the current browser, separately from client scenarios; they are not shared between advisers or computers. Actual client advice, disclosure and suitability requirements remain part of your advice process. The report does not certify regulatory compliance.

The report keeps Cash Savings, Capital Preservation, Income Generator, Steady Growth and Strategic Long Term Growth. Return assumptions are explicitly described as after investment tax and fund, platform and advice fees. The modelled income ceiling is no longer printed in the client report.

## Comparing earlier and later retirement

Save variants for the clients you intend to compare. Differences in names, current ages or household structure are highlighted for review and do not block export. Each scenario retains its own inputs. Give them meaningful names, such as Earlier retirement, Current plan and Later retirement. Choose comparison scenarios from Export report or the existing Scenarios > Compare control. Select up to three distinct scenarios; the current unsaved plan can be one of them.

Choose the final age for Scenario A’s younger client (or its single client). Leave it blank to use the latest original end date across the selected scenarios. All comparison paths cover the same number of years from today; when starting ages differ, final ages are shown separately. the underlying saved scenarios and the main report projection remain unchanged. The comparison's end date can therefore differ from the main report's end date, which is identified separately.

Tick Include comparison in report. The page compares each person's retirement age, spending, accessible and total balances at retirement, first-year withdrawals, spending/one-off shortfalls and the balance and target at the common end date, with a three-line chart. It identifies other financial assumptions that differ. Market stress settings are honoured. Comparison results use fixed-return projections, not comparative Monte Carlo probabilities.

Lump sums, additional care costs, spending reductions and first-year stress remain timed relative to each scenario's first retirement, so changing retirement dates can move their calendar timing. The comparison highlights this when applicable. Correct out-of-range payments before export; they are never silently dropped. Duplicates and invalid common end ages are blocked. Check highlighted client-detail differences before sharing a comparison.

Optional regression tests: copy `tests/comparison.test.mjs` and run `node --test tests/*.test.mjs`. There are no new production npm dependencies.
