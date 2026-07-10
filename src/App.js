import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, ComposedChart, Area, BarChart, Bar
} from 'recharts';
import { Download, Save, FolderOpen, Trash2, Plus, X, Sparkles, AlertTriangle, Dices, FileDown, FileUp } from 'lucide-react';

// =============================================================================
// CONSTANTS
// =============================================================================

// NZ Super rates (fortnightly, as at 1 April 2026)
// Source: https://www.workandincome.govt.nz/eligibility/seniors/superannuation/how-much-you-can-get.html
const SUPER_RATES_NET_M = {
  single_alone: 1110.30,        // Live alone or with a dependent child
  single_shared: 1024.90,       // Live with someone 18+
  couple_both_each: 854.08,     // Each - both meet criteria
  couple_one: 854.08            // Only one meets criteria
};
const SUPER_RATES_GROSS = {
  single_alone: 1294.74,
  single_shared: 1191.14,
  couple_both_each: 984.28,
  couple_one: 984.28
};

const INFLATION_RATE = 0.02;
const STORAGE_KEY = 'wealthguard_scenarios_v2';

// Default annual volatility (standard deviation, %) for the market-exposed buckets.
// Cash & Capital Preservation are contractual and carry no volatility.
const DEFAULT_VOLATILITIES = {
  incomeGenerator: 6.0,   // built for stable income — small wobble
  steadyGrowth: 10.0,     // diversified / balanced
  strategicGrowth: 14.0   // long-term growth — the real variability
};

const BUCKET_META = [
  { key: 'cashSavings',        label: 'Cash Savings',          color: '#eab308', returnKey: 'cashSavings' },
  { key: 'termDeposit',        label: 'Capital Preservation',  color: '#f97316', returnKey: 'capitalPreservation' },
  { key: 'incomePortfolio',    label: 'Income Generator',      color: '#22c55e', returnKey: 'incomeGenerator' },
  { key: 'balancedPortfolio',  label: 'Steady Growth',         color: '#3b82f6', returnKey: 'steadyGrowth' },
  { key: 'growthPortfolio',    label: 'Strategic Long Term Growth', color: '#a855f7', returnKey: 'strategicGrowth' }
];

const ACCUM_BUCKET_META = [
  { key: 'cashSavings',       label: 'Cash Savings',    color: '#eab308' },
  { key: 'balancedPortfolio', label: 'Steady Growth',   color: '#3b82f6' },
  { key: 'growthPortfolio',   label: 'Strategic Long Term Growth', color: '#a855f7' }
];

// =============================================================================
// MONEY INPUT — formatted $ with thousand separators
// =============================================================================

function MoneyInput({ value, onChange, className = '', placeholder = '', ...rest }) {
  const [focused, setFocused] = React.useState(false);
  const [draft, setDraft] = React.useState('');

  const display = focused
    ? draft
    : (value || value === 0) ? `$${Number(value).toLocaleString('en-NZ')}` : '';

  const handleFocus = (e) => {
    setFocused(true);
    setDraft(value ? String(value) : '');
    // Select all on focus so typing replaces the value
    setTimeout(() => e.target.select(), 0);
  };

  const handleBlur = () => {
    setFocused(false);
    const parsed = parseFloat(draft.replace(/[^0-9.-]/g, ''));
    onChange(isNaN(parsed) ? 0 : parsed);
  };

  const handleChange = (e) => {
    // Allow digits, decimal point, minus sign, commas (we'll strip them)
    const cleaned = e.target.value.replace(/[^0-9.,-]/g, '');
    setDraft(cleaned);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={display}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
      {...rest}
    />
  );
}

// =============================================================================
// PRINTABLE CHART
// =============================================================================
// Recharts' ResponsiveContainer measures the on-screen width and bakes it into the
// SVG; in print that produces charts whose axes span the page but whose data paths
// are laid out for the (wider) screen and get cut off. Rather than fight this with
// timing hacks, we render TWO copies:
//   • a responsive copy shown on screen and hidden in print
//   • a fixed-width copy hidden on screen and shown only in print
// The print copy is permanently mounted at PRINT_CHART_WIDTH, so by the time the
// browser takes its print snapshot the chart is already fully laid out correctly —
// no re-render, no remount, no timing to get wrong.
const PRINT_CHART_WIDTH = 700;   // ~18.6cm A4 portrait printable width at 96dpi
const PRINT_CHART_HEIGHT = 300;  // default; line charts with legends pass a taller value

function PrintableChart({ children, screenHeight = 360, printHeight = PRINT_CHART_HEIGHT, printWidth = PRINT_CHART_WIDTH }) {
  // The print copy must NOT use ResponsiveContainer: ResponsiveContainer measures its
  // parent, and inside a display:none container that measures as 0×0, so the chart
  // renders empty axes with no data. Instead we clone the chart element and give it an
  // explicit pixel width/height, which Recharts chart components honour directly with no
  // measurement — so it draws fully even while hidden on screen.
  const printChart = React.isValidElement(children)
    ? React.cloneElement(children, { width: printWidth, height: printHeight })
    : children;
  return (
    <>
      {/* Screen: responsive, hidden when printing */}
      <div className="no-print">
        <ResponsiveContainer width="100%" height={screenHeight}>
          {children}
        </ResponsiveContainer>
      </div>
      {/* Print: fixed-size chart (no ResponsiveContainer), hidden on screen */}
      <div className="hidden print:block">
        {printChart}
      </div>
    </>
  );
}

// =============================================================================
// SIMULATION
// =============================================================================

function runSimulation(params) {
  const {
    totalPortfolio, allocations: rawAllocations, accumulationAllocations: rawAccumulationAllocations, returns,
    accumulationReturns,
    yearsUntilRetirement, projectionYears, annualContribution, annualIncome,
    annualKsTotal = 0,
    incomeReductionEnabled = false, incomeReductionAfterYears = 15, incomeReductionPercent = 20,
    accumulationLumpSums, retirementLumpSums,
    getSuperForYear, inflateSuper, cashMonths
  } = params;

  const data = [];

  // Normalise allocations so the FULL portfolio is always deployed, treating the
  // entered percentages as relative weights. This prevents the headline figures
  // from silently running on a wrong base when the inputs don't sum to exactly 100%.
  // (A visible warning is shown in the UI when the entered total isn't 100%.)
  const normalise = (obj) => {
    const sum = Object.values(obj).reduce((a, b) => a + (b || 0), 0);
    if (sum <= 0) return obj;
    const out = {};
    for (const k of Object.keys(obj)) out[k] = (obj[k] || 0) * 100 / sum;
    return out;
  };
  const allocations = normalise(rawAllocations);
  const accumulationAllocations = normalise(rawAccumulationAllocations);

  // Initial bucket allocation — use accumulation if pre-retirement, else retirement
  let cash, termDep, income, balanced, growth;
  if (yearsUntilRetirement > 0) {
    cash     = totalPortfolio * (accumulationAllocations.cashSavings / 100);
    balanced = totalPortfolio * (accumulationAllocations.balancedPortfolio / 100);
    growth   = totalPortfolio * (accumulationAllocations.growthPortfolio / 100);
    termDep  = 0;
    income   = 0;
  } else {
    cash     = totalPortfolio * (allocations.cashSavings / 100);
    termDep  = totalPortfolio * (allocations.termDeposit / 100);
    income   = totalPortfolio * (allocations.incomePortfolio / 100);
    balanced = totalPortfolio * (allocations.balancedPortfolio / 100);
    growth   = totalPortfolio * (allocations.growthPortfolio / 100);
  }

  const totalDuration = yearsUntilRetirement + projectionYears;
  let cumulativeDrawdown = 0;
  // Income bucket target — set at retirement start from the initial retirement allocation
  // This is the level we refill Income back up to from Balanced/Growth annually
  let incomeTarget = (yearsUntilRetirement === 0)
    ? totalPortfolio * (allocations.incomePortfolio / 100)
    : 0;

  // Pull `amount` proportionally from Balanced and Growth, return actual amount drawn
  const takeFromBalancedGrowth = (amount) => {
    if (amount <= 0) return 0;
    const combined = balanced + growth;
    if (combined <= 0) return 0;
    const fromB = Math.min(balanced, amount * (balanced / combined));
    const fromG = Math.min(growth,   amount * (growth   / combined));
    balanced -= fromB;
    growth   -= fromG;
    return fromB + fromG;
  };

  // Retirement drawdown cascade: Cash → Income → Balanced+Growth (prop) → TD (emergency only)
  // Cash holds day-to-day spending. Income tops up Cash (quarterly in practice).
  // Balanced+Growth top up Income. TD is a safety net — only used when everything else is depleted.
  const retireCascade = (need) => {
    let remaining = need;
    if (remaining <= 0) return 0;
    const fromCash = Math.min(cash, remaining);
    cash -= fromCash; remaining -= fromCash;
    if (remaining > 0) {
      const fromIncome = Math.min(income, remaining);
      income -= fromIncome; remaining -= fromIncome;
    }
    if (remaining > 0) {
      const drawn = takeFromBalancedGrowth(remaining);
      remaining -= drawn;
    }
    if (remaining > 0) {
      const fromTD = Math.min(termDep, remaining);
      termDep -= fromTD; remaining -= fromTD;
    }
    return need - remaining;
  };

  // Refill Cash to target from Income first, then Balanced/Growth (NOT from TD)
  const refillCash = (target) => {
    if (cash >= target) return;
    let need = target - cash;
    const fromIncome = Math.min(income, need);
    income -= fromIncome; cash += fromIncome; need -= fromIncome;
    if (need > 0) {
      const drawn = takeFromBalancedGrowth(need);
      cash += drawn;
    }
  };

  // Refill Income to target from Balanced/Growth (NOT from TD)
  const refillIncome = (target) => {
    if (income >= target) return;
    const need = target - income;
    const drawn = takeFromBalancedGrowth(need);
    income += drawn;
  };

  // Accumulation-phase withdrawal cascade: Cash → Balanced+Growth (prop)
  const accumWithdraw = (need) => {
    let remaining = need;
    const fromCash = Math.min(cash, remaining);
    cash -= fromCash; remaining -= fromCash;
    if (remaining > 0) remaining -= takeFromBalancedGrowth(remaining);
    return need - remaining;
  };

  for (let year = 0; year <= totalDuration; year++) {
    // At retirement: redistribute buckets into retirement allocation
    if (year === yearsUntilRetirement && yearsUntilRetirement > 0) {
      const total = cash + termDep + income + balanced + growth;
      cash     = total * (allocations.cashSavings / 100);
      termDep  = total * (allocations.termDeposit / 100);
      income   = total * (allocations.incomePortfolio / 100);
      balanced = total * (allocations.balancedPortfolio / 100);
      growth   = total * (allocations.growthPortfolio / 100);
      incomeTarget = income;
    }

    // Record this year's opening state
    const entry = {
      year,
      'Cash Savings':          Math.round(cash),
      'Capital Preservation':  Math.round(termDep),
      'Income Generator':      Math.round(income),
      'Steady Growth':         Math.round(balanced),
      'Strategic Long Term Growth':      Math.round(growth),
      Total:                   Math.round(cash + termDep + income + balanced + growth),
      drawdownRequired: 0,
      drawdownActual:   0,
      cumulativeDrawdown: Math.round(cumulativeDrawdown),
      superIncome: 0
    };

    if (year >= totalDuration) { data.push(entry); break; }

    const isRetired = year >= yearsUntilRetirement;

    // Contributions & lump sums during accumulation
    if (!isRetired) {
      // Regular contribution (stops at retirement)
      if (annualContribution > 0) {
        cash     += annualContribution * (accumulationAllocations.cashSavings / 100);
        balanced += annualContribution * (accumulationAllocations.balancedPortfolio / 100);
        growth   += annualContribution * (accumulationAllocations.growthPortfolio / 100);
      }
      // KiwiSaver contributions (also stop at retirement — no salary income to contribute from)
      if (annualKsTotal > 0) {
        cash     += annualKsTotal * (accumulationAllocations.cashSavings / 100);
        balanced += annualKsTotal * (accumulationAllocations.balancedPortfolio / 100);
        growth   += annualKsTotal * (accumulationAllocations.growthPortfolio / 100);
      }
      for (const ls of accumulationLumpSums) {
        if (ls.year === year && ls.amount) {
          const amt = ls.type === 'withdrawal' ? -ls.amount : ls.amount;
          if (amt >= 0) {
            cash     += amt * (accumulationAllocations.cashSavings / 100);
            balanced += amt * (accumulationAllocations.balancedPortfolio / 100);
            growth   += amt * (accumulationAllocations.growthPortfolio / 100);
          } else {
            accumWithdraw(-amt);
          }
        }
      }
    } else {
      const yearsInto = year - yearsUntilRetirement;
      for (const ls of retirementLumpSums) {
        if (ls.yearFromRetirement === yearsInto && ls.amount) {
          if (ls.type === 'withdrawal') {
            retireCascade(ls.amount);
          } else {
            // Deposit split by retirement allocation
            cash     += ls.amount * (allocations.cashSavings / 100);
            termDep  += ls.amount * (allocations.termDeposit / 100);
            income   += ls.amount * (allocations.incomePortfolio / 100);
            balanced += ls.amount * (allocations.balancedPortfolio / 100);
            growth   += ls.amount * (allocations.growthPortfolio / 100);
          }
        }
      }
    }

    // Apply returns — accumulation phase uses its own return assumptions,
    // retirement phase uses the retirement-strategy returns.
    const accRet = accumulationReturns || {
      cashSavings: returns.cashSavings, balancedPortfolio: returns.steadyGrowth, growthPortfolio: returns.strategicGrowth
    };
    cash     *= (1 + (isRetired ? returns.cashSavings   : accRet.cashSavings) / 100);
    termDep  *= (1 + returns.capitalPreservation / 100);
    income   *= (1 + returns.incomeGenerator / 100);
    balanced *= (1 + (isRetired ? returns.steadyGrowth   : accRet.balancedPortfolio) / 100);
    growth   *= (1 + (isRetired ? returns.strategicGrowth : accRet.growthPortfolio) / 100);

    // Income drawdown
    if (isRetired) {
      const yearsInto = year - yearsUntilRetirement;
      const baseSuper = getSuperForYear(yearsInto);
      const yearSuper = inflateSuper ? baseSuper * Math.pow(1 + INFLATION_RATE, yearsInto) : baseSuper;

      // Apply step-down reduction to required income if enabled (e.g. 20% less after year 15)
      const reductionFactor = (incomeReductionEnabled && yearsInto >= incomeReductionAfterYears)
        ? (1 - incomeReductionPercent / 100)
        : 1;
      const effectiveIncome = annualIncome * reductionFactor;
      const inflatedIncome = effectiveIncome * Math.pow(1 + INFLATION_RATE, yearsInto);
      const drawdownNeeded = Math.max(0, inflatedIncome - yearSuper);

      // 1. Draw expenses through the cascade (Cash → Income → B+G → TD)
      const actual = retireCascade(drawdownNeeded);

      // 2. Replenish Cash to target from Income, then B+G (not TD)
      const cashTarget = inflatedIncome * (cashMonths / 12);
      refillCash(cashTarget);

      // 3. Replenish Income to target from B+G (not TD)
      refillIncome(incomeTarget);

      cumulativeDrawdown += actual;
      entry.drawdownRequired = Math.round(drawdownNeeded);
      entry.drawdownActual   = Math.round(actual);
      entry.superIncome      = Math.round(yearSuper);
    }

    data.push(entry);
  }

  return data;
}

// =============================================================================
// MONTE CARLO ENGINE
// =============================================================================
// Models the WealthGuard strategy faithfully under random returns:
//  - Cash & Capital Preservation are contractual (fixed return, no volatility).
//  - Income Generator carries only a small wobble (built for stable income).
//  - Steady Growth & Strategic Growth carry the real volatility and move TOGETHER
//    via a shared annual market shock (so a bad year hits both at once).
//  - In a DOWN year for growth, income is funded from Cash then Capital Preservation,
//    leaving growth untouched to recover (this is the whole point of bucketing).
//    Growth is only sold as a genuine last resort when Cash + Capital Preservation
//    are exhausted. In a normal year, the usual cascade + refills run.

// Standard normal via Box-Muller
function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function runMonteCarloPath(params) {
  const {
    totalPortfolio, allocations: rawAllocations, accumulationAllocations: rawAccumulationAllocations, returns, volatilities,
    accumulationReturns, mcAccumulationEnabled = false,
    yearsUntilRetirement, projectionYears, annualContribution, annualIncome,
    annualKsTotal = 0,
    incomeReductionEnabled = false, incomeReductionAfterYears = 15, incomeReductionPercent = 20,
    accumulationLumpSums = [], retirementLumpSums = [],
    getSuperForYear, inflateSuper, cashMonths, downYearThreshold = 0
  } = params;

  // Normalise to 100% (same rationale as the deterministic engine).
  const normalise = (obj) => {
    const sum = Object.values(obj).reduce((a, b) => a + (b || 0), 0);
    if (sum <= 0) return obj;
    const out = {};
    for (const k of Object.keys(obj)) out[k] = (obj[k] || 0) * 100 / sum;
    return out;
  };
  const allocations = normalise(rawAllocations);
  const accumulationAllocations = normalise(rawAccumulationAllocations);

  let cash, termDep, income, balanced, growth;
  if (yearsUntilRetirement > 0) {
    cash     = totalPortfolio * (accumulationAllocations.cashSavings / 100);
    balanced = totalPortfolio * (accumulationAllocations.balancedPortfolio / 100);
    growth   = totalPortfolio * (accumulationAllocations.growthPortfolio / 100);
    termDep  = 0; income = 0;
  } else {
    cash     = totalPortfolio * (allocations.cashSavings / 100);
    termDep  = totalPortfolio * (allocations.termDeposit / 100);
    income   = totalPortfolio * (allocations.incomePortfolio / 100);
    balanced = totalPortfolio * (allocations.balancedPortfolio / 100);
    growth   = totalPortfolio * (allocations.growthPortfolio / 100);
  }

  const totalDuration = yearsUntilRetirement + projectionYears;
  let incomeTarget = (yearsUntilRetirement === 0) ? totalPortfolio * (allocations.incomePortfolio / 100) : 0;
  const totals = [];
  let depletionYear = null;

  const takeFromBalancedGrowth = (amount) => {
    if (amount <= 0) return 0;
    const combined = balanced + growth;
    if (combined <= 0) return 0;
    const fromB = Math.min(balanced, amount * (balanced / combined));
    const fromG = Math.min(growth,   amount * (growth   / combined));
    balanced -= fromB; growth -= fromG;
    return fromB + fromG;
  };
  const takeFromTD = (amount) => { const f = Math.min(termDep, Math.max(0, amount)); termDep -= f; return f; };

  // Normal-market cascade: Cash → Income → B+G → TD
  const retireCascadeNormal = (need) => {
    let r = need;
    const fc = Math.min(cash, r); cash -= fc; r -= fc;
    if (r > 0) { const fi = Math.min(income, r); income -= fi; r -= fi; }
    if (r > 0) r -= takeFromBalancedGrowth(r);
    if (r > 0) r -= takeFromTD(r);
    return need - r;
  };
  // Down-market cascade: Cash → TD (protect growth) → Income → B+G (last resort)
  const retireCascadeDown = (need) => {
    let r = need;
    const fc = Math.min(cash, r); cash -= fc; r -= fc;
    if (r > 0) r -= takeFromTD(r);
    if (r > 0) { const fi = Math.min(income, r); income -= fi; r -= fi; }
    if (r > 0) r -= takeFromBalancedGrowth(r);
    return need - r;
  };
  const refillCash = (target) => {
    if (cash >= target) return;
    let need = target - cash;
    const fi = Math.min(income, need); income -= fi; cash += fi; need -= fi;
    if (need > 0) cash += takeFromBalancedGrowth(need);
  };
  const refillIncome = (target) => {
    if (income >= target) return;
    income += takeFromBalancedGrowth(target - income);
  };
  const accumWithdraw = (need) => {
    let r = need;
    const fc = Math.min(cash, r); cash -= fc; r -= fc;
    if (r > 0) r -= takeFromBalancedGrowth(r);
  };

  for (let year = 0; year <= totalDuration; year++) {
    if (year === yearsUntilRetirement && yearsUntilRetirement > 0) {
      const total = cash + termDep + income + balanced + growth;
      cash = total * (allocations.cashSavings / 100);
      termDep = total * (allocations.termDeposit / 100);
      income = total * (allocations.incomePortfolio / 100);
      balanced = total * (allocations.balancedPortfolio / 100);
      growth = total * (allocations.growthPortfolio / 100);
      incomeTarget = income;
    }

    const totalNow = cash + termDep + income + balanced + growth;
    totals.push(Math.round(totalNow));
    if (totalNow <= 1 && year >= yearsUntilRetirement && depletionYear === null) depletionYear = year;
    if (year >= totalDuration) break;

    const isRetired = year >= yearsUntilRetirement;

    if (!isRetired) {
      if (annualContribution > 0) {
        cash += annualContribution * (accumulationAllocations.cashSavings / 100);
        balanced += annualContribution * (accumulationAllocations.balancedPortfolio / 100);
        growth += annualContribution * (accumulationAllocations.growthPortfolio / 100);
      }
      if (annualKsTotal > 0) {
        cash += annualKsTotal * (accumulationAllocations.cashSavings / 100);
        balanced += annualKsTotal * (accumulationAllocations.balancedPortfolio / 100);
        growth += annualKsTotal * (accumulationAllocations.growthPortfolio / 100);
      }
      for (const ls of accumulationLumpSums) {
        if (ls.year === year && ls.amount) {
          const amt = ls.type === 'withdrawal' ? -ls.amount : ls.amount;
          if (amt >= 0) {
            cash += amt * (accumulationAllocations.cashSavings / 100);
            balanced += amt * (accumulationAllocations.balancedPortfolio / 100);
            growth += amt * (accumulationAllocations.growthPortfolio / 100);
          } else accumWithdraw(-amt);
        }
      }
    } else {
      const yearsInto = year - yearsUntilRetirement;
      for (const ls of retirementLumpSums) {
        if (ls.yearFromRetirement === yearsInto && ls.amount) {
          if (ls.type === 'withdrawal') retireCascadeNormal(ls.amount);
          else {
            cash += ls.amount * (allocations.cashSavings / 100);
            termDep += ls.amount * (allocations.termDeposit / 100);
            income += ls.amount * (allocations.incomePortfolio / 100);
            balanced += ls.amount * (allocations.balancedPortfolio / 100);
            growth += ls.amount * (allocations.growthPortfolio / 100);
          }
        }
      }
    }

    // Shared market shock z drives the growth buckets together (correlation).
    const accRet = accumulationReturns || {
      cashSavings: returns.cashSavings, balancedPortfolio: returns.steadyGrowth, growthPortfolio: returns.strategicGrowth
    };
    const z = randn();
    let cashRet, steadyRet, strategicRet, incomeRet;
    if (isRetired) {
      cashRet      = returns.cashSavings / 100;
      steadyRet    = returns.steadyGrowth / 100    + (volatilities.steadyGrowth / 100) * z;
      strategicRet = returns.strategicGrowth / 100 + (volatilities.strategicGrowth / 100) * z;
      incomeRet    = returns.incomeGenerator / 100 + (volatilities.incomeGenerator / 100) * (0.5 * z + 0.5 * randn());
    } else {
      // Accumulation phase: own return means; volatility applied only if enabled.
      const v = mcAccumulationEnabled ? 1 : 0;
      cashRet      = accRet.cashSavings / 100;
      steadyRet    = accRet.balancedPortfolio / 100 + v * (volatilities.steadyGrowth / 100) * z;
      strategicRet = accRet.growthPortfolio / 100   + v * (volatilities.strategicGrowth / 100) * z;
      incomeRet    = 0; // no income bucket during accumulation
    }

    cash     *= (1 + cashRet);
    termDep  *= (1 + returns.capitalPreservation / 100);
    income   *= (1 + incomeRet);
    balanced *= (1 + steadyRet);
    growth   *= (1 + strategicRet);

    // Down-year rule only applies in retirement (that's the only phase that draws income).
    const growthWasDown = isRetired && Math.min(steadyRet, strategicRet) < (downYearThreshold / 100);

    if (isRetired) {
      const yearsInto = year - yearsUntilRetirement;
      const baseSuper = getSuperForYear(yearsInto);
      const yearSuper = inflateSuper ? baseSuper * Math.pow(1 + INFLATION_RATE, yearsInto) : baseSuper;
      const reductionFactor = (incomeReductionEnabled && yearsInto >= incomeReductionAfterYears)
        ? (1 - incomeReductionPercent / 100) : 1;
      const inflatedIncome = annualIncome * reductionFactor * Math.pow(1 + INFLATION_RATE, yearsInto);
      const drawdownNeeded = Math.max(0, inflatedIncome - yearSuper);

      if (growthWasDown) {
        retireCascadeDown(drawdownNeeded);
      } else {
        retireCascadeNormal(drawdownNeeded);
        refillCash(inflatedIncome * (cashMonths / 12));
        refillIncome(incomeTarget);
      }
    }
  }

  const survived = (cash + termDep + income + balanced + growth) > 1;
  return { totals, survived, depletionYear };
}

function runMonteCarlo(params, numSims) {
  const paths = [];
  let successes = 0;
  const depletionYears = [];
  const len = params.yearsUntilRetirement + params.projectionYears + 1;
  for (let s = 0; s < numSims; s++) {
    const { totals, survived, depletionYear } = runMonteCarloPath(params);
    paths.push(totals);
    if (survived) successes++;
    else if (depletionYear !== null) depletionYears.push(depletionYear);
  }
  const bands = [];
  for (let y = 0; y < len; y++) {
    const col = paths.map(p => p[y] ?? 0).sort((a, b) => a - b);
    const pct = (q) => col[Math.min(col.length - 1, Math.max(0, Math.floor(q * col.length)))];
    bands.push({
      year: y,
      p10: pct(0.10), p25: pct(0.25), p50: pct(0.50), p75: pct(0.75), p90: pct(0.90),
      // stacked band widths for area rendering
      base: pct(0.10),
      band10_25: pct(0.25) - pct(0.10),
      band25_75: pct(0.75) - pct(0.25),
      band75_90: pct(0.90) - pct(0.75)
    });
  }
  return { successRate: successes / numSims, bands, depletionYears, numSims };
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function WealthGuardTool() {
  // --- Client info ---
  const [clientName, setClientName]       = useState('');
  const [partnerName, setPartnerName]     = useState('');
  const [clientAge, setClientAge]         = useState(60);
  const [partnerAge, setPartnerAge]       = useState(60);
  const [retirementAge, setRetirementAge] = useState(65);
  const [livingSituation, setLivingSituation] = useState('single_shared');

  // --- Super settings ---
  const [useGrossSuper, setUseGrossSuper] = useState(false); // default Net (M)
  const [inflateSuper, setInflateSuper]   = useState(true);

  // --- Current investments ---
  // Start empty so a fresh session has a $0 portfolio until the adviser enters figures.
  // ids 1 & 2 are the (client / partner) KiwiSaver fields and are always present.
  const [currentInvestments, setCurrentInvestments] = useState([
    { id: 1, label: '', amount: 0 },
    { id: 2, label: '', amount: 0 }
  ]);
  const [cash, setCash]                 = useState(0);
  const [termDeposits, setTermDeposits] = useState(0);

  // --- Planning ---
  const [projectionYears, setProjectionYears] = useState(30);
  const [annualIncome, setAnnualIncome]       = useState(60000);
  const [contributionAmount, setContributionAmount]   = useState(0);
  const [contributionFrequency, setContributionFrequency] = useState('annual');

  // --- KiwiSaver contributions (% of salary, employee + employer matched) ---
  const [ksEnabled, setKsEnabled] = useState(false);
  const [clientSalary, setClientSalary] = useState(0);
  const [partnerSalary, setPartnerSalary] = useState(0);
  const [clientKsRate, setClientKsRate] = useState(3.5);      // employee %
  const [clientKsEmployer, setClientKsEmployer] = useState(3.5); // employer %
  const [partnerKsRate, setPartnerKsRate] = useState(3.5);
  const [partnerKsEmployer, setPartnerKsEmployer] = useState(3.5);

  // --- Income reduction in later retirement (e.g. 20% less after year 15) ---
  const [incomeReductionEnabled, setIncomeReductionEnabled] = useState(false);
  const [incomeReductionAfterYears, setIncomeReductionAfterYears] = useState(15);
  const [incomeReductionPercent, setIncomeReductionPercent] = useState(20);

  // --- Lump sums ---
  const [accumulationLumpSums, setAccumulationLumpSums] = useState([]);
  const [retirementLumpSums, setRetirementLumpSums]     = useState([]);

  // --- Allocations ---
  const [allocations, setAllocations] = useState({
    cashSavings: 3.0, termDeposit: 12.0,
    incomePortfolio: 30.0, balancedPortfolio: 30.0, growthPortfolio: 25.0
  });
  const [accumulationAllocations, setAccumulationAllocations] = useState({
    cashSavings: 10.0, balancedPortfolio: 45.0, growthPortfolio: 45.0
  });

  // --- Returns ---
  const [returns, setReturns] = useState({
    cashSavings: 0.25, capitalPreservation: 4.0,
    incomeGenerator: 5.0, steadyGrowth: 5.5, strategicGrowth: 7.5
  });

  // --- Accumulation-phase returns (separate from the retirement strategy) ---
  // Defaults match the previous behaviour (which reused the retirement figures),
  // so existing scenarios are unchanged until these are edited.
  const [accumulationReturns, setAccumulationReturns] = useState({
    cashSavings: 0.25, balancedPortfolio: 5.5, growthPortfolio: 7.5
  });

  // --- Volatility (for Monte Carlo) ---
  const [volatilities, setVolatilities] = useState({ ...DEFAULT_VOLATILITIES });

  // --- Monte Carlo settings & results ---
  const [mcSettings, setMcSettings] = useState({ numSims: 1000, downYearThreshold: 0 });
  const [mcAccumulationEnabled, setMcAccumulationEnabled] = useState(false); // apply volatility during accumulation?
  const [mcResults, setMcResults] = useState(null);
  const [mcRunning, setMcRunning] = useState(false);

  // --- Recommendation settings ---
  const [recSettings, setRecSettings] = useState({
    cashMonths: 4.5,    // 3–6 months
    tdYears: 1.5,       // 1–2 years
    incomePct: 35,      // % of invested portion (after cash/TD)
    balancedPct: 35,
    growthPct: 30
  });

  // --- Scenarios ---
  const [scenarios, setScenarios] = useState([]);
  const [showScenariosPanel, setShowScenariosPanel] = useState(false);
  const [newScenarioName, setNewScenarioName] = useState('');

  // Load scenarios from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setScenarios(JSON.parse(raw));
    } catch (e) { console.error('Failed to load scenarios', e); }
  }, []);

  const persistScenarios = (list) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      setScenarios(list);
    } catch (e) { console.error('Failed to save scenarios', e); }
  };

  // --- Derived values ---
  const isJoint = partnerName.trim() !== '';
  const yearsUntilRetirement = Math.max(0, retirementAge - clientAge);

  // --- Quick-nav sidebar (screen only) ---
  const NAV_SECTIONS = [
    { id: 'sec-client',      label: 'Client Info' },
    { id: 'sec-investments', label: 'Investments' },
    { id: 'sec-planning',    label: 'Planning' },
    { id: 'sec-allocations', label: 'Allocations' },
    { id: 'sec-returns',     label: 'Returns' },
    { id: 'sec-maxincome',   label: 'Max Income' },
    { id: 'sec-charts',      label: 'Charts' },
    { id: 'sec-montecarlo',  label: 'Monte Carlo' }
  ];
  const [activeSection, setActiveSection] = useState('sec-client');
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => { if (entry.isIntersecting) setActiveSection(entry.target.id); });
      },
      { rootMargin: '-15% 0px -70% 0px', threshold: 0 }
    );
    NAV_SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [yearsUntilRetirement]); // re-attach when conditional sections (e.g. accumulation card) mount/unmount
  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const totalInvestments = currentInvestments.reduce((s, i) => s + i.amount, 0);
  const totalPortfolio   = cash + termDeposits + totalInvestments;
  const annualContribution =
    contributionFrequency === 'weekly'      ? contributionAmount * 52 :
    contributionFrequency === 'fortnightly' ? contributionAmount * 26 :
    contributionFrequency === 'monthly'     ? contributionAmount * 12 :
    contributionAmount;

  // Annual KiwiSaver contributions (employee + employer matched, for client and partner)
  const annualKsClient = ksEnabled
    ? clientSalary * (clientKsRate / 100) + clientSalary * (clientKsEmployer / 100)
    : 0;
  const annualKsPartner = ksEnabled && isJoint
    ? partnerSalary * (partnerKsRate / 100) + partnerSalary * (partnerKsEmployer / 100)
    : 0;
  const annualKsTotal = annualKsClient + annualKsPartner;

  // Super calculation
  const getSuperForYear = useCallback((yearsIntoRetirement) => {
    const cAge = clientAge  + yearsUntilRetirement + yearsIntoRetirement;
    const pAge = partnerAge + yearsUntilRetirement + yearsIntoRetirement;
    const cEligible = cAge >= 65;
    const pEligible = isJoint && pAge >= 65;
    const rates = useGrossSuper ? SUPER_RATES_GROSS : SUPER_RATES_NET_M;
    if (isJoint) {
      if (cEligible && pEligible) return rates.couple_both_each * 2 * 26;
      if (cEligible || pEligible) return rates.couple_one * 26;
      return 0;
    }
    if (!cEligible) return 0;
    return rates[livingSituation] * 26;
  }, [clientAge, partnerAge, yearsUntilRetirement, isJoint, useGrossSuper, livingSituation]);

  const superAtRetirement = getSuperForYear(0);
  const currentAgeSuper = (() => {
    // What super the household qualifies for at their *current* age
    const cEligible = clientAge >= 65;
    const pEligible = isJoint && partnerAge >= 65;
    const rates = useGrossSuper ? SUPER_RATES_GROSS : SUPER_RATES_NET_M;
    if (isJoint) {
      if (cEligible && pEligible) return rates.couple_both_each * 2 * 26;
      if (cEligible || pEligible) return rates.couple_one * 26;
      return 0;
    }
    if (!cEligible) return 0;
    return rates[livingSituation] * 26;
  })();

  // Super at age 65 — shown separately per person if joint with different ages.
  // Each figure is the household's annual super entitlement when THAT person reaches 65,
  // inflated from today at 2% p.a.
  const superAt65Details = useMemo(() => {
    const rates = useGrossSuper ? SUPER_RATES_GROSS : SUPER_RATES_NET_M;
    const yearsToClient65  = Math.max(0, 65 - clientAge);
    const yearsToPartner65 = Math.max(0, 65 - partnerAge);

    // Household super when client hits 65 — partner's age at that point determines rate
    const partnerAgeAtClient65 = partnerAge + yearsToClient65;
    const clientHouseholdTodayRate = isJoint
      ? (partnerAgeAtClient65 >= 65 ? rates.couple_both_each * 2 * 26 : rates.couple_one * 26)
      : rates[livingSituation] * 26;
    const clientSuperFV = clientHouseholdTodayRate * Math.pow(1 + INFLATION_RATE, yearsToClient65);

    // Household super when partner hits 65 — client's age at that point determines rate
    const clientAgeAtPartner65 = clientAge + yearsToPartner65;
    const partnerHouseholdTodayRate = isJoint
      ? (clientAgeAtPartner65 >= 65 ? rates.couple_both_each * 2 * 26 : rates.couple_one * 26)
      : 0;
    const partnerSuperFV = partnerHouseholdTodayRate * Math.pow(1 + INFLATION_RATE, yearsToPartner65);

    return {
      yearsToClient65,
      yearsToPartner65,
      clientSuperFV,
      partnerSuperFV,
      // True when the client and partner reach 65 in different years (i.e. different ages today)
      ageGap: isJoint && clientAge !== partnerAge
    };
  }, [clientAge, partnerAge, isJoint, useGrossSuper, livingSituation]);

  // --- Simulation ---
  const simulationParams = useMemo(() => ({
    totalPortfolio, allocations, accumulationAllocations, returns,
    accumulationReturns,
    yearsUntilRetirement, projectionYears, annualContribution,
    annualKsTotal,
    incomeReductionEnabled, incomeReductionAfterYears, incomeReductionPercent,
    accumulationLumpSums, retirementLumpSums, getSuperForYear, inflateSuper,
    cashMonths: recSettings.cashMonths
  }), [totalPortfolio, allocations, accumulationAllocations, returns,
      accumulationReturns,
      yearsUntilRetirement, projectionYears, annualContribution,
      annualKsTotal,
      incomeReductionEnabled, incomeReductionAfterYears, incomeReductionPercent,
      accumulationLumpSums, retirementLumpSums, getSuperForYear, inflateSuper,
      recSettings.cashMonths]);

  const projectionData = useMemo(
    () => runSimulation({ ...simulationParams, annualIncome }),
    [simulationParams, annualIncome]
  );

  // Max sustainable income — binary search
  const maxSustainableIncome = useMemo(() => {
    if (totalPortfolio <= 0 || projectionYears <= 0) return 0;
    let low = 0;
    let high = Math.max(annualIncome * 5, 500000, totalPortfolio);
    for (let i = 0; i < 60; i++) {
      const mid = (low + high) / 2;
      const result = runSimulation({ ...simulationParams, annualIncome: mid });
      const finalTotal = result[result.length - 1].Total;
      if (finalTotal > 1) low = mid; else high = mid;
    }
    return Math.round(low);
  }, [simulationParams, annualIncome, totalPortfolio, projectionYears]);

  const maxSustainableDrawdown = Math.max(0, maxSustainableIncome - superAtRetirement);

  // Upper bound for the live income slider — generous headroom above whichever is
  // larger: the sustainable ceiling or the current target, rounded to a clean $10k step.
  const incomeSliderMax = Math.max(
    50000,
    Math.ceil((Math.max(maxSustainableIncome, annualIncome) * 1.5) / 10000) * 10000
  );

  // Portfolio value at the year retirement begins (from the projection).
  // For pre-retirement clients this reflects accumulation growth + contributions + lump sums.
  const portfolioAtRetirement = useMemo(() => {
    const entry = projectionData.find(d => d.year === yearsUntilRetirement);
    return entry ? entry.Total : totalPortfolio;
  }, [projectionData, yearsUntilRetirement, totalPortfolio]);

  // --- Allocation dollar values ---
  // Retirement allocation is shown as at the start of retirement (future value)
  const retirementAllocDollars = useMemo(() => ({
    cashSavings:      portfolioAtRetirement * (allocations.cashSavings / 100),
    termDeposit:      portfolioAtRetirement * (allocations.termDeposit / 100),
    incomePortfolio:  portfolioAtRetirement * (allocations.incomePortfolio / 100),
    balancedPortfolio:portfolioAtRetirement * (allocations.balancedPortfolio / 100),
    growthPortfolio:  portfolioAtRetirement * (allocations.growthPortfolio / 100)
  }), [portfolioAtRetirement, allocations]);

  // Accumulation allocation is shown as at today's portfolio value
  const accumulationAllocDollars = useMemo(() => ({
    cashSavings:      totalPortfolio * (accumulationAllocations.cashSavings / 100),
    balancedPortfolio:totalPortfolio * (accumulationAllocations.balancedPortfolio / 100),
    growthPortfolio:  totalPortfolio * (accumulationAllocations.growthPortfolio / 100)
  }), [totalPortfolio, accumulationAllocations]);

  const totalAllocation = Object.values(allocations).reduce((a, b) => a + b, 0);
  const totalAccumulationAllocation = Object.values(accumulationAllocations).reduce((a, b) => a + b, 0);

  // Weighted average returns (only meaningful when allocation totals 100%)
  const retirementAvgReturn = totalAllocation > 0 ? (
    (allocations.cashSavings       * returns.cashSavings +
     allocations.termDeposit       * returns.capitalPreservation +
     allocations.incomePortfolio   * returns.incomeGenerator +
     allocations.balancedPortfolio * returns.steadyGrowth +
     allocations.growthPortfolio   * returns.strategicGrowth) / totalAllocation
  ) : 0;

  const accumulationAvgReturn = totalAccumulationAllocation > 0 ? (
    (accumulationAllocations.cashSavings       * accumulationReturns.cashSavings +
     accumulationAllocations.balancedPortfolio * accumulationReturns.balancedPortfolio +
     accumulationAllocations.growthPortfolio   * accumulationReturns.growthPortfolio) / totalAccumulationAllocation
  ) : 0;

  // --- Actions ---
  const addInvestment = () => setCurrentInvestments([...currentInvestments, { id: Date.now(), label: '', amount: 0 }]);
  const removeInvestment = (id) => { if (id > 2) setCurrentInvestments(currentInvestments.filter(i => i.id !== id)); };
  const updateInvestment = (id, field, value) => setCurrentInvestments(currentInvestments.map(i =>
    i.id === id ? { ...i, [field]: field === 'amount' ? (parseFloat(value) || 0) : value } : i));

  const updateAllocation = (k, v) => setAllocations(p => ({ ...p, [k]: parseFloat(v) || 0 }));
  const updateAccumulationAllocation = (k, v) => setAccumulationAllocations(p => ({ ...p, [k]: parseFloat(v) || 0 }));
  const updateReturn = (k, v) => setReturns(p => ({ ...p, [k]: parseFloat(v) || 0 }));
  const updateAccumulationReturn = (k, v) => setAccumulationReturns(p => ({ ...p, [k]: parseFloat(v) || 0 }));
  const updateRecSetting = (k, v) => setRecSettings(p => ({ ...p, [k]: parseFloat(v) || 0 }));
  const updateVolatility = (k, v) => setVolatilities(p => ({ ...p, [k]: parseFloat(v) || 0 }));
  const updateMcSetting = (k, v) => setMcSettings(p => ({ ...p, [k]: parseFloat(v) || 0 }));
  // Auto-re-run: once the Monte Carlo has been run at least once, re-run it
  // automatically whenever an input changes so the results always match the figures
  // on screen. Debounced so rapid typing doesn't fire many simulations — it waits
  // until you pause, then runs once. (mcRunFnRef points at the latest run function so
  // the debounced call always uses current input values, not a stale closure.)
  const mcRunFnRef = useRef(null);
  const mcHasRunRef = useRef(false);
  useEffect(() => {
    if (!mcHasRunRef.current) return; // don't auto-run until the user has run it once
    const t = setTimeout(() => { if (mcRunFnRef.current) mcRunFnRef.current(); }, 600);
    return () => clearTimeout(t);
  }, [
    totalPortfolio, allocations, accumulationAllocations, returns, accumulationReturns, volatilities,
    annualIncome, projectionYears, mcSettings.downYearThreshold, mcAccumulationEnabled,
    annualContribution, annualKsTotal, incomeReductionEnabled, incomeReductionAfterYears,
    incomeReductionPercent, accumulationLumpSums, retirementLumpSums, mcSettings.numSims
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lump sum management
  const addAccumLumpSum = () => setAccumulationLumpSums([...accumulationLumpSums,
    { id: Date.now(), year: 1, amount: 0, label: '', type: 'deposit' }]);
  const updateAccumLumpSum = (id, field, value) => setAccumulationLumpSums(accumulationLumpSums.map(ls =>
    ls.id === id ? { ...ls, [field]: ['year', 'amount'].includes(field) ? (parseFloat(value) || 0) : value } : ls));
  const removeAccumLumpSum = (id) => setAccumulationLumpSums(accumulationLumpSums.filter(ls => ls.id !== id));

  const addRetireLumpSum = () => setRetirementLumpSums([...retirementLumpSums,
    { id: Date.now(), yearFromRetirement: 0, amount: 0, label: '', type: 'deposit' }]);
  const updateRetireLumpSum = (id, field, value) => setRetirementLumpSums(retirementLumpSums.map(ls =>
    ls.id === id ? { ...ls, [field]: ['yearFromRetirement', 'amount'].includes(field) ? (parseFloat(value) || 0) : value } : ls));
  const removeRetireLumpSum = (id) => setRetirementLumpSums(retirementLumpSums.filter(ls => ls.id !== id));

  // Apply recommendation — uses largest-remainder rounding so percentages always sum to exactly 100
  // Based on the portfolio value and expenses as-at the first year of retirement
  const applyRecommendation = () => {
    const portfolio = portfolioAtRetirement;
    if (portfolio <= 0 || annualIncome <= 0) return;
    // Inflate today's required income to the first year of retirement
    const expensesAtRetirement = annualIncome * Math.pow(1 + 0.02, yearsUntilRetirement);
    const cashAmt = expensesAtRetirement * (recSettings.cashMonths / 12);
    const tdAmt   = expensesAtRetirement * recSettings.tdYears;

    const cashPctRaw = Math.min(100, (cashAmt / portfolio) * 100);
    const tdPctRaw   = Math.min(100 - cashPctRaw, (tdAmt / portfolio) * 100);
    const remainingPct = Math.max(0, 100 - cashPctRaw - tdPctRaw);

    const invTotal = Math.max(0.1, recSettings.incomePct + recSettings.balancedPct + recSettings.growthPct);
    const incomePctRaw   = remainingPct * (recSettings.incomePct   / invTotal);
    const balancedPctRaw = remainingPct * (recSettings.balancedPct / invTotal);

    // Round first four to 1 dp, use growth as balancer so total = exactly 100
    const cashPct     = Math.round(cashPctRaw * 10) / 10;
    const tdPct       = Math.round(tdPctRaw * 10) / 10;
    const incomePct   = Math.round(incomePctRaw * 10) / 10;
    const balancedPct = Math.round(balancedPctRaw * 10) / 10;
    const growthPct   = Math.round((100 - cashPct - tdPct - incomePct - balancedPct) * 10) / 10;

    setAllocations({
      cashSavings:       cashPct,
      termDeposit:       tdPct,
      incomePortfolio:   incomePct,
      balancedPortfolio: balancedPct,
      growthPortfolio:   Math.max(0, growthPct)
    });
  };

  // Monte Carlo — runs on demand and (after the first run) automatically when inputs
  // change. Defer with a timeout so the UI can paint the "running" state before the
  // synchronous simulation loop blocks the thread.
  const runMonteCarloAnalysis = () => {
    mcHasRunRef.current = true; // enable auto-re-run from here on
    setMcRunning(true);
    setTimeout(() => {
      try {
        const params = {
          totalPortfolio, allocations, accumulationAllocations, returns, volatilities,
          accumulationReturns, mcAccumulationEnabled,
          yearsUntilRetirement, projectionYears, annualContribution, annualIncome,
          annualKsTotal,
          incomeReductionEnabled, incomeReductionAfterYears, incomeReductionPercent,
          accumulationLumpSums, retirementLumpSums, getSuperForYear, inflateSuper,
          cashMonths: recSettings.cashMonths,
          downYearThreshold: mcSettings.downYearThreshold
        };
        const n = Math.max(100, Math.min(5000, Math.round(mcSettings.numSims) || 1000));
        const res = runMonteCarlo(params, n);

        // Depletion histogram bucketed into 5-year bands (retirement-relative)
        const histo = {};
        res.depletionYears.forEach(y => {
          const into = y - yearsUntilRetirement;
          const band = Math.floor(into / 5) * 5;
          histo[band] = (histo[band] || 0) + 1;
        });
        const depletionHisto = Object.keys(histo)
          .map(Number).sort((a, b) => a - b)
          .map(band => ({ label: `${band}–${band + 4}`, count: histo[band] }));

        setMcResults({ ...res, depletionHisto });
      } catch (e) {
        console.error('Monte Carlo failed', e);
        setMcResults(null);
      } finally {
        setMcRunning(false);
      }
    }, 50);
  };
  // Keep the ref pointed at the latest run function so the debounced auto-run effect
  // always executes with current input values rather than a stale closure.
  mcRunFnRef.current = runMonteCarloAnalysis;

  // Scenario management
  const snapshot = () => ({
    clientName, partnerName, clientAge, partnerAge, retirementAge,
    livingSituation, useGrossSuper, inflateSuper,
    currentInvestments, cash, termDeposits,
    projectionYears, annualIncome, contributionAmount, contributionFrequency,
    ksEnabled, clientSalary, partnerSalary,
    clientKsRate, clientKsEmployer, partnerKsRate, partnerKsEmployer,
    incomeReductionEnabled, incomeReductionAfterYears, incomeReductionPercent,
    accumulationLumpSums, retirementLumpSums,
    allocations, accumulationAllocations, returns, recSettings,
    accumulationReturns, volatilities, mcSettings, mcAccumulationEnabled
  });

  const restore = (s) => {
    setClientName(s.clientName ?? '');
    setPartnerName(s.partnerName ?? '');
    setClientAge(s.clientAge ?? 60);
    setPartnerAge(s.partnerAge ?? 60);
    setRetirementAge(s.retirementAge ?? 65);
    setLivingSituation(s.livingSituation ?? 'single_shared');
    setUseGrossSuper(s.useGrossSuper ?? false);
    setInflateSuper(s.inflateSuper ?? true);
    setCurrentInvestments(s.currentInvestments ?? []);
    setCash(s.cash ?? 0);
    setTermDeposits(s.termDeposits ?? 0);
    setProjectionYears(s.projectionYears ?? 30);
    setAnnualIncome(s.annualIncome ?? 0);
    setContributionAmount(s.contributionAmount ?? 0);
    setContributionFrequency(s.contributionFrequency ?? 'annual');
    setKsEnabled(s.ksEnabled ?? false);
    setClientSalary(s.clientSalary ?? 0);
    setPartnerSalary(s.partnerSalary ?? 0);
    setClientKsRate(s.clientKsRate ?? 3.5);
    setClientKsEmployer(s.clientKsEmployer ?? 3.5);
    setPartnerKsRate(s.partnerKsRate ?? 3.5);
    setPartnerKsEmployer(s.partnerKsEmployer ?? 3.5);
    setIncomeReductionEnabled(s.incomeReductionEnabled ?? false);
    setIncomeReductionAfterYears(s.incomeReductionAfterYears ?? 15);
    setIncomeReductionPercent(s.incomeReductionPercent ?? 20);
    setAccumulationLumpSums(s.accumulationLumpSums ?? []);
    setRetirementLumpSums(s.retirementLumpSums ?? []);
    setAllocations(s.allocations ?? allocations);
    setAccumulationAllocations(s.accumulationAllocations ?? accumulationAllocations);
    setReturns(s.returns ?? returns);
    setRecSettings(s.recSettings ?? recSettings);
    // Back-compat: older scenarios have no separate accumulation returns — derive them
    // from the saved retirement returns so the projection reproduces exactly.
    setAccumulationReturns(s.accumulationReturns ?? {
      cashSavings: s.returns?.cashSavings ?? 0.25,
      balancedPortfolio: s.returns?.steadyGrowth ?? 5.5,
      growthPortfolio: s.returns?.strategicGrowth ?? 7.5
    });
    setVolatilities(s.volatilities ?? { ...DEFAULT_VOLATILITIES });
    setMcSettings(s.mcSettings ?? { numSims: 1000, downYearThreshold: 0 });
    setMcAccumulationEnabled(s.mcAccumulationEnabled ?? false);
  };

  const suggestScenarioName = () => {
    const names = [clientName.trim(), partnerName.trim()].filter(Boolean).join(' & ');
    const date = new Date().toLocaleDateString('en-NZ');
    const prefix = names || 'Scenario';
    return `${prefix} - WealthGuard - ${date}`;
  };

  const toggleScenariosPanel = () => {
    if (!showScenariosPanel) setNewScenarioName(suggestScenarioName());
    setShowScenariosPanel(!showScenariosPanel);
  };

  const saveScenario = () => {
    const name = newScenarioName.trim() || suggestScenarioName();
    const scn = { id: 'scn_' + Date.now(), name, savedAt: new Date().toISOString(), data: snapshot() };
    persistScenarios([scn, ...scenarios]);
    setNewScenarioName(suggestScenarioName());
  };

  const loadScenario = (id) => {
    const scn = scenarios.find(s => s.id === id);
    if (scn) { restore(scn.data); setShowScenariosPanel(false); }
  };

  const deleteScenario = (id) => {
    if (window.confirm('Delete this scenario?')) persistScenarios(scenarios.filter(s => s.id !== id));
  };

  // Download a single scenario as a .json file (portable backup, immune to cache clearing).
  const downloadScenario = (scn) => {
    try {
      const safeName = (scn.name || 'scenario').replace(/[^a-z0-9\-_ ]/gi, '').replace(/\s+/g, '_');
      const payload = { format: 'wealthguard-scenario', version: 1, exportedAt: new Date().toISOString(), scenario: scn };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      console.error('Failed to download scenario', e);
      window.alert('Sorry — could not generate the download file.');
    }
  };

  // Import a scenario from a downloaded .json file (e.g. moving between computers).
  // Adds it to the saved list AND loads it into the form.
  const importFileRef = useRef(null);
  const handleImportClick = () => { if (importFileRef.current) importFileRef.current.click(); };
  const handleImportFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        // Accept either the wrapped export { format, scenario } or a bare scenario object.
        const scn = parsed && parsed.scenario ? parsed.scenario : parsed;
        if (!scn || !scn.data || typeof scn.data !== 'object') {
          window.alert('That file doesn\'t look like a WealthGuard scenario export.');
          return;
        }
        // Give it a fresh id so it never clashes with an existing saved scenario.
        const imported = {
          id: 'scn_' + Date.now(),
          name: (scn.name || 'Imported scenario') + ' (imported)',
          savedAt: new Date().toISOString(),
          data: scn.data
        };
        persistScenarios([imported, ...scenarios]);
        restore(imported.data);
        setShowScenariosPanel(false);
        window.alert('Scenario imported and loaded: ' + imported.name);
      } catch (err) {
        console.error('Import failed', err);
        window.alert('Could not read that file — make sure it\'s a .json scenario exported from WealthGuard.');
      } finally {
        // Reset so the same file can be re-selected later if needed.
        if (importFileRef.current) importFileRef.current.value = '';
      }
    };
    reader.onerror = () => window.alert('Could not read that file.');
    reader.readAsText(file);
  };

  const generatePDF = () => {
    const names = [clientName.trim(), partnerName.trim()].filter(Boolean).join(' & ');
    const date = new Date().toLocaleDateString('en-NZ').replace(/\//g, '-');
    const prefix = names || 'Scenario';
    const newTitle = `${prefix} - WealthGuard - ${date}`;
    const originalTitle = document.title;
    document.title = newTitle;
    window.print();
    setTimeout(() => { document.title = originalTitle; }, 1000);
  };

  // --- Pie chart data ---
  const retirementPieData = BUCKET_META.map(b => ({
    name: b.label, value: Math.round(retirementAllocDollars[b.key]), color: b.color
  })).filter(d => d.value > 0);

  const accumulationPieData = ACCUM_BUCKET_META.map(b => ({
    name: b.label, value: Math.round(accumulationAllocDollars[b.key]), color: b.color
  })).filter(d => d.value > 0);

  // Drawdown chart data
  const drawdownChartData = projectionData.map(d => ({
    year: d.year,
    'Annual Drawdown': d.drawdownActual,
    'Required Drawdown': d.drawdownRequired,
    'Cumulative Drawdown': d.cumulativeDrawdown
  }));

  // Custom X-axis tick showing year number + age(s) below
  const AgeTick = ({ x, y, payload }) => {
    const yr = payload.value;
    const cAtYr = clientAge + yr;
    const pAtYr = partnerAge + yr;
    return (
      <g transform={`translate(${x},${y})`}>
        <text x={0} y={0} dy={12} textAnchor="middle" fill="#475569" fontSize="12">{yr}</text>
        <text x={0} y={0} dy={26} textAnchor="middle" fill="#94a3b8" fontSize="10">
          {isJoint ? `${cAtYr} / ${pAtYr}` : cAtYr}
        </text>
      </g>
    );
  };

  // Choose a tick interval so roughly 10-12 ticks are drawn regardless of timeline length
  const totalTimelinePoints = yearsUntilRetirement + projectionYears + 1;
  const tickInterval = Math.max(0, Math.ceil(totalTimelinePoints / 12) - 1);

  // Tooltip label that includes ages
  const ageTooltipLabel = (yr) => {
    const cAtYr = clientAge + yr;
    const pAtYr = partnerAge + yr;
    return isJoint
      ? `Year ${yr} — Ages ${cAtYr} / ${pAtYr}`
      : `Year ${yr} — Age ${cAtYr}`;
  };

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-8">
      <style>{`
        @media print {
          @page { margin: 1.2cm; size: A4; }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print { display: none !important; }
          .page-break { page-break-before: always; }
          .avoid-break { page-break-inside: avoid; break-inside: avoid; }

          /* Override gradients/backgrounds to plain for print */
          .min-h-screen {
            background: white !important;
            min-height: 0 !important;
            padding: 0 !important;
          }

          /* Keep cards tidy */
          .shadow-lg { box-shadow: none !important; }

          /* ---- Charts in print ----
             Each chart is rendered twice (see PrintableChart): a responsive copy for
             screen (.no-print) and a fixed-size copy shown only in print. The print copy
             is given explicit pixel dimensions (no ResponsiveContainer), so it's already
             laid out correctly when the print snapshot is taken — no timing or
             re-measurement involved. This guard just caps the printable width. */
          .recharts-responsive-container,
          .recharts-wrapper,
          .recharts-surface {
            max-width: 730px !important;
          }

          /* Chart caption: ensure the explanatory line below a chart can't ride up
             over the plot. A little forced top margin + block flow keeps it clear. */
          .chart-caption {
            display: block !important;
            margin-top: 10px !important;
            clear: both !important;
          }

          /* Give each major card real separation in print so a tall legend on one
             card can't bleed into the heading of the next. */
          .wg-card {
            margin-bottom: 14px !important;
          }

          /* Start the Monte Carlo section on its own page — it's large and otherwise
             gets split awkwardly across a page boundary. */
          .mc-section {
            page-break-before: always;
          }

          /* Start the two line charts (Portfolio Projection + Income Drawdown) together
             on a fresh page so they share one page rather than orphaning Income Drawdown. */
          .charts-page {
            page-break-before: always;
          }

          /* Force Recharts legend items to sit side-by-side and wrap cleanly */
          .recharts-default-legend {
            display: flex !important;
            flex-wrap: wrap !important;
            justify-content: center !important;
            gap: 4px 10px !important;
            padding: 0 !important;
            margin: 0 !important;
            line-height: 1.2 !important;
          }
          .recharts-default-legend .recharts-legend-item {
            display: inline-flex !important;
            align-items: center !important;
            margin: 0 !important;
            padding: 0 !important;
            white-space: nowrap !important;
          }

          /* Ensure gradient headers print in colour */
          .bg-gradient-to-r, .bg-gradient-to-br {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }

        /* Screen only: give anchored sections a little breathing room when the
           quick-nav sidebar scrolls the page to them. */
        .nav-anchor { scroll-margin-top: 20px; }
      `}</style>

      {/* =============== QUICK NAV (screen only) =============== */}
      <nav className="no-print hidden xl:flex flex-col gap-1 fixed left-4 top-1/2 -translate-y-1/2 z-40 bg-white/95 backdrop-blur rounded-xl shadow-lg border border-slate-200 p-2 max-h-[80vh] overflow-y-auto">
        {NAV_SECTIONS.map((s) => (
          <button key={s.id} onClick={() => scrollToSection(s.id)}
            className={`text-left px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              activeSection === s.id ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}>
            {s.label}
          </button>
        ))}
      </nav>

      <div className="max-w-7xl mx-auto">
        {/* =============== HEADER =============== */}
        <div className="bg-white rounded-lg shadow-lg p-6 md:p-8 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-6 flex-wrap">
              <img src="https://www.diligentwealth.co.nz/s/WealthGuard-Logo.jpg" alt="WealthGuard" className="h-20 md:h-28 w-auto"
                onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'flex'; }}/>
              <div style={{display:'none'}} className="flex flex-col items-center justify-center h-28 px-8 bg-gradient-to-r from-amber-500 to-blue-900 rounded-lg">
                <div className="text-white text-2xl font-bold tracking-wider">WEALTHGUARD</div>
                <div className="text-white text-xs mt-1">Investment Bucketing Strategy</div>
              </div>
              <div className="h-16 w-px bg-slate-300 hidden md:block"></div>
              <img src="https://www.diligentwealth.co.nz/s/Diligent-Logo-Main.png" alt="Diligent" className="h-12 md:h-16 w-auto"
                onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'flex'; }}/>
              <div style={{display:'none'}} className="flex items-center gap-2 h-16">
                <div className="w-14 h-14 bg-gradient-to-br from-amber-500 to-amber-600 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-2xl">D</span>
                </div>
                <span className="text-4xl font-bold text-slate-800">diligent</span>
              </div>
            </div>
            <div className="flex gap-2 no-print">
              <button onClick={toggleScenariosPanel}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 font-semibold shadow">
                <FolderOpen size={18} /> Scenarios ({scenarios.length})
              </button>
              <button onClick={generatePDF}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold shadow">
                <Download size={18} /> Export PDF
              </button>
            </div>
          </div>
          <div className="border-t-4 border-blue-600 pt-4">
            <p className="text-lg text-slate-600">Comprehensive Investment Bucketing Strategy</p>
          </div>
        </div>

        {/* =============== SCENARIOS PANEL =============== */}
        {showScenariosPanel && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6 no-print border-2 border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-800">Saved Scenarios</h2>
              <button onClick={() => setShowScenariosPanel(false)} className="text-slate-500 hover:text-slate-700"><X size={20}/></button>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              <input type="text" value={newScenarioName} onChange={(e) => setNewScenarioName(e.target.value)}
                placeholder={clientName ? `Save as "${clientName}"...` : 'Scenario name...'}
                className="flex-1 min-w-[180px] px-3 py-2 border border-slate-300 rounded-md"/>
              <button onClick={saveScenario}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-semibold">
                <Save size={16}/> Save Current
              </button>
              <button onClick={handleImportClick} title="Load a scenario from a downloaded .json file (e.g. from another computer)"
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-800 font-semibold">
                <FileUp size={16}/> Import from file
              </button>
              <input ref={importFileRef} type="file" accept="application/json,.json"
                onChange={handleImportFile} className="hidden"/>
            </div>
            <p className="text-xs text-slate-500 mb-4 -mt-2">
              Scenarios are stored in this browser only. To move one to another computer, download it (the <FileDown size={11} className="inline"/> icon),
              then use <strong>Import from file</strong> here on the other machine.
            </p>
            {scenarios.length === 0 ? (
              <p className="text-slate-500 italic text-sm">No saved scenarios yet. Save the current state to create one.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {scenarios.map(scn => (
                  <div key={scn.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-md border border-slate-200">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{scn.name}</div>
                      <div className="text-xs text-slate-500">
                        Saved {new Date(scn.savedAt).toLocaleString('en-NZ')}
                        {scn.data.clientName && ` • ${scn.data.clientName}`}
                        {scn.data.partnerName && ` & ${scn.data.partnerName}`}
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button onClick={() => loadScenario(scn.id)}
                        className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">Load</button>
                      <button onClick={() => downloadScenario(scn)} title="Download this scenario as a backup file"
                        className="px-2 py-1 bg-slate-600 text-white rounded text-sm hover:bg-slate-700"><FileDown size={14}/></button>
                      <button onClick={() => deleteScenario(scn.id)}
                        className="px-2 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"><Trash2 size={14}/></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* =============== CLIENT INFO =============== */}
        <div id="sec-client" className="bg-white rounded-lg shadow-lg p-6 mb-6 avoid-break nav-anchor">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Client Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Client Name</label>
              <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md no-print"/>
              <span className="hidden print:block">{clientName || 'Not specified'}</span>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Client Age</label>
              <input type="number" value={clientAge} onChange={(e) => setClientAge(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md no-print"/>
              <span className="hidden print:block">{clientAge}</span>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Retirement Age</label>
              <input type="number" value={retirementAge} onChange={(e) => setRetirementAge(parseInt(e.target.value) || 65)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md no-print"/>
              <span className="hidden print:block">{retirementAge}</span>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Partner Name</label>
              <input type="text" value={partnerName} onChange={(e) => setPartnerName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md no-print"/>
              <span className="hidden print:block">{partnerName || '—'}</span>
            </div>
            {isJoint && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Partner Age</label>
                <input type="number" value={partnerAge} onChange={(e) => setPartnerAge(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md no-print"/>
                <span className="hidden print:block">{partnerAge}</span>
              </div>
            )}
            {!isJoint && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Living Situation</label>
                <select value={livingSituation} onChange={(e) => setLivingSituation(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md no-print">
                  <option value="single_alone">Alone or with dependent child</option>
                  <option value="single_shared">With someone 18+</option>
                </select>
                <span className="hidden print:block">{livingSituation === 'single_alone' ? 'Alone / with dependent' : 'Shared living'}</span>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Super at Retirement (age {retirementAge})</label>
              <div className="w-full px-3 py-2 bg-slate-100 border rounded-md font-medium">
                ${Math.round(superAtRetirement).toLocaleString()}/yr
              </div>
            </div>
            {retirementAge !== 65 && !superAt65Details.ageGap && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Super at age 65{superAt65Details.yearsToClient65 > 0 ? ` (in ${superAt65Details.yearsToClient65} yr${superAt65Details.yearsToClient65 !== 1 ? 's' : ''})` : ''}
                </label>
                <div className="w-full px-3 py-2 bg-blue-50 border border-blue-200 rounded-md font-medium text-blue-900">
                  ${Math.round(superAt65Details.clientSuperFV).toLocaleString()}/yr
                </div>
              </div>
            )}
            {superAt65Details.ageGap && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Super when {clientName || 'Client'} turns 65
                    {superAt65Details.yearsToClient65 > 0 && ` (in ${superAt65Details.yearsToClient65} yr${superAt65Details.yearsToClient65 !== 1 ? 's' : ''})`}
                  </label>
                  <div className="w-full px-3 py-2 bg-blue-50 border border-blue-200 rounded-md font-medium text-blue-900">
                    ${Math.round(superAt65Details.clientSuperFV).toLocaleString()}/yr
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Super when {partnerName || 'Partner'} turns 65
                    {superAt65Details.yearsToPartner65 > 0 && ` (in ${superAt65Details.yearsToPartner65} yr${superAt65Details.yearsToPartner65 !== 1 ? 's' : ''})`}
                  </label>
                  <div className="w-full px-3 py-2 bg-blue-50 border border-blue-200 rounded-md font-medium text-blue-900">
                    ${Math.round(superAt65Details.partnerSuperFV).toLocaleString()}/yr
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Super settings */}
          <div className="mt-4 pt-4 border-t border-slate-200 no-print">
            <div className="flex flex-wrap gap-6 items-center text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={useGrossSuper} onChange={(e) => setUseGrossSuper(e.target.checked)}/>
                Use gross (pre-tax) super rates
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={inflateSuper} onChange={(e) => setInflateSuper(e.target.checked)}/>
                Inflate super at CPI (2% p.a.)
              </label>
              <span className="text-slate-500 text-xs">
                Rates effective 1 April 2026 • {useGrossSuper ? 'Gross' : 'Net (M tax code)'}
              </span>
            </div>
          </div>
        </div>

        {/* =============== CURRENT INVESTMENTS =============== */}
        <div id="sec-investments" className="bg-white rounded-lg shadow-lg p-6 mb-6 no-print nav-anchor">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Current Investments</h2>
          <div className="space-y-4 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Cash</label>
                <MoneyInput value={cash} onChange={setCash}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Term Deposits</label>
                <MoneyInput value={termDeposits} onChange={setTermDeposits}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"/>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{clientName || 'Client'} KiwiSaver</label>
                <MoneyInput value={currentInvestments.find(i => i.id === 1)?.amount || 0}
                  onChange={(v) => updateInvestment(1, 'amount', v)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"/>
              </div>
              {isJoint && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{partnerName || 'Partner'} KiwiSaver</label>
                  <MoneyInput value={currentInvestments.find(i => i.id === 2)?.amount || 0}
                    onChange={(v) => updateInvestment(2, 'amount', v)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md"/>
                </div>
              )}
            </div>
            {currentInvestments.filter(i => i.id > 2).map((inv) => (
              <div key={inv.id} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input type="text" value={inv.label} onChange={(e) => updateInvestment(inv.id, 'label', e.target.value)}
                  placeholder="Investment name" className="w-full px-3 py-2 border border-slate-300 rounded-md"/>
                <div className="flex gap-2">
                  <MoneyInput value={inv.amount} onChange={(v) => updateInvestment(inv.id, 'amount', v)}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-md"/>
                  <button onClick={() => removeInvestment(inv.id)}
                    className="px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"><Trash2 size={16}/></button>
                </div>
              </div>
            ))}
          </div>
          <button onClick={addInvestment}
            className="w-full px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 flex items-center justify-center gap-2">
            <Plus size={16}/> Add Investment
          </button>
          <div className="mt-4 pt-4 border-t">
            <span className="text-lg font-bold">Total Portfolio: ${totalPortfolio.toLocaleString()}</span>
          </div>
        </div>

        {/* =============== ACCUMULATION ALLOCATION + PIE (if applicable) =============== */}
        {yearsUntilRetirement > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6 avoid-break">
            <h2 className="text-xl font-bold text-slate-800 mb-4">
              Accumulation Phase Allocation
              <span className={`text-sm font-normal ml-2 ${Math.abs(totalAccumulationAllocation - 100) > 0.1 ? 'text-red-600' : 'text-slate-500'}`}>
                ({totalAccumulationAllocation.toFixed(1)}%)
              </span>
              <span className="text-sm font-normal ml-2 px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200">
                Weighted avg return: {accumulationAvgReturn.toFixed(2)}%
              </span>
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Inputs */}
              <div className="space-y-2">
                {ACCUM_BUCKET_META.map(b => (
                  <div key={b.key} className="p-2 rounded border-l-4" style={{ borderLeftColor: b.color, backgroundColor: b.color + '15' }}>
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <label className="col-span-4 text-sm font-medium">{b.label}</label>
                      <div className="col-span-3 flex items-center gap-1 no-print">
                        <input type="number" step="0.1" value={accumulationAllocations[b.key]}
                          onChange={(e) => updateAccumulationAllocation(b.key, e.target.value)}
                          className="w-full px-2 py-1 border border-slate-300 rounded text-sm"/>
                        <span className="text-sm">%</span>
                      </div>
                      <span className="hidden print:block col-span-3 text-sm">{accumulationAllocations[b.key]}%</span>
                      <div className="col-span-5 text-right text-sm font-medium">
                        ${accumulationAllocDollars[b.key].toLocaleString(undefined, {maximumFractionDigits: 0})}
                      </div>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-slate-500 mt-2 italic">
                  Used for {yearsUntilRetirement} year{yearsUntilRetirement !== 1 ? 's' : ''} until retirement. Reallocates to the retirement mix at age {retirementAge}.
                </p>

                {/* Accumulation-phase returns (separate from retirement strategy) */}
                <div className="mt-4 pt-4 border-t border-slate-200 no-print">
                  <div className="flex items-baseline justify-between mb-2">
                    <h3 className="text-sm font-semibold text-slate-800">Accumulation Returns (%)</h3>
                    <span className="text-xs text-slate-500">Separate from retirement</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      {k:'cashSavings', l:'Cash', c:'text-yellow-700'},
                      {k:'balancedPortfolio', l:'Balanced', c:'text-blue-700'},
                      {k:'growthPortfolio', l:'Growth', c:'text-purple-700'}
                    ].map(({k, l, c}) => (
                      <div key={k}>
                        <label className={`text-xs font-medium mb-1 block ${c}`}>{l}</label>
                        <div className="flex gap-1">
                          <input type="number" step="0.1" value={accumulationReturns[k]}
                            onChange={(e) => updateAccumulationReturn(k, e.target.value)}
                            className="w-full px-2 py-1 border border-slate-300 rounded text-sm"/>
                          <span className="text-sm self-center">%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    These drive growth up to retirement. The retirement-strategy returns (below) take over once the buckets reallocate at age {retirementAge}.
                  </p>
                </div>
              </div>

              {/* Pie chart */}
              <div className="flex items-center justify-center">
                {accumulationPieData.length > 0 ? (
                  <PrintableChart screenHeight={320} printHeight={300} printWidth={330}>
                    <PieChart>
                      <Pie data={accumulationPieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                        outerRadius={100} innerRadius={45}
                        label={({percent}) => percent > 0.03 ? `${(percent * 100).toFixed(0)}%` : ''}>
                        {accumulationPieData.map((entry, i) => <Cell key={i} fill={entry.color}/>)}
                      </Pie>
                      <Tooltip formatter={(v) => `$${Number(v).toLocaleString("en-NZ", {maximumFractionDigits: 0})}`}/>
                      <Legend verticalAlign="bottom" height={36} wrapperStyle={{fontSize: '12px'}}/>
                    </PieChart>
                  </PrintableChart>
                ) : (
                  <div className="text-slate-400 text-sm italic">Enter allocations to see chart</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* =============== RETIREMENT PLANNING =============== */}
        <div id="sec-planning" className="bg-white rounded-lg shadow-lg p-6 mb-6 no-print nav-anchor">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Retirement Planning</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Years Until Retirement</label>
              <input type="number" value={yearsUntilRetirement} disabled
                className="w-full px-3 py-2 bg-slate-100 border rounded-md"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Retirement Years</label>
              <input type="number" value={projectionYears}
                onChange={(e) => setProjectionYears(parseInt(e.target.value) || 30)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Annual Income Required</label>
              <MoneyInput value={annualIncome} onChange={setAnnualIncome}
                className="w-full px-3 py-2 border border-slate-300 rounded-md"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Regular Contribution</label>
              <MoneyInput value={contributionAmount} onChange={setContributionAmount}
                className="w-full px-3 py-2 border border-slate-300 rounded-md"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Frequency</label>
              <select value={contributionFrequency} onChange={(e) => setContributionFrequency(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md">
                <option value="weekly">Weekly</option>
                <option value="fortnightly">Fortnightly</option>
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
              </select>
            </div>
            <div className="bg-blue-50 p-3 rounded-md text-sm flex flex-col justify-center">
              <div><strong>Regular contribution:</strong> ${annualContribution.toLocaleString()}/yr</div>
              {annualKsTotal > 0 && (
                <div><strong>KiwiSaver contributions:</strong> ${Math.round(annualKsTotal).toLocaleString()}/yr</div>
              )}
              <div><strong>Total contributions:</strong> ${Math.round(annualContribution + annualKsTotal).toLocaleString()}/yr</div>
              <div className="text-xs text-slate-500 mt-1 italic">All contributions stop at retirement.</div>
            </div>
          </div>

          {/* KiwiSaver contributions (percentage-based, from salary) */}
          <div className="mt-6 pt-6 border-t border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-slate-800">KiwiSaver Contributions</h3>
                <p className="text-xs text-slate-500">Percentage of salary, employee + employer matched. Added to accumulation only.</p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={ksEnabled} onChange={(e) => setKsEnabled(e.target.checked)}/>
                Enable
              </label>
            </div>

            {ksEnabled && (
              <div className={`grid grid-cols-1 ${isJoint ? 'md:grid-cols-2' : ''} gap-4`}>
                {/* Client */}
                <div className="bg-slate-50 p-3 rounded-md border border-slate-200">
                  <div className="text-sm font-semibold text-slate-700 mb-2">{clientName || 'Client'}</div>
                  <div className="space-y-2">
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">Gross Annual Salary</label>
                      <MoneyInput value={clientSalary} onChange={setClientSalary}
                        className="w-full px-2 py-1 border border-slate-300 rounded text-sm"/>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">Employee %</label>
                        <div className="flex items-center gap-1">
                          <input type="number" step="0.5" min="0" max="100" value={clientKsRate}
                            onChange={(e) => setClientKsRate(parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 border border-slate-300 rounded text-sm"/>
                          <span className="text-xs">%</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">Employer %</label>
                        <div className="flex items-center gap-1">
                          <input type="number" step="0.5" min="0" max="100" value={clientKsEmployer}
                            onChange={(e) => setClientKsEmployer(parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 border border-slate-300 rounded text-sm"/>
                          <span className="text-xs">%</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-slate-600 bg-white rounded px-2 py-1 border border-slate-200">
                      Contributing <strong>${Math.round(annualKsClient).toLocaleString()}/yr</strong> total
                    </div>
                  </div>
                </div>

                {/* Partner */}
                {isJoint && (
                  <div className="bg-slate-50 p-3 rounded-md border border-slate-200">
                    <div className="text-sm font-semibold text-slate-700 mb-2">{partnerName || 'Partner'}</div>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">Gross Annual Salary</label>
                        <MoneyInput value={partnerSalary} onChange={setPartnerSalary}
                          className="w-full px-2 py-1 border border-slate-300 rounded text-sm"/>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">Employee %</label>
                          <div className="flex items-center gap-1">
                            <input type="number" step="0.5" min="0" max="100" value={partnerKsRate}
                              onChange={(e) => setPartnerKsRate(parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1 border border-slate-300 rounded text-sm"/>
                            <span className="text-xs">%</span>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">Employer %</label>
                          <div className="flex items-center gap-1">
                            <input type="number" step="0.5" min="0" max="100" value={partnerKsEmployer}
                              onChange={(e) => setPartnerKsEmployer(parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1 border border-slate-300 rounded text-sm"/>
                            <span className="text-xs">%</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-slate-600 bg-white rounded px-2 py-1 border border-slate-200">
                        Contributing <strong>${Math.round(annualKsPartner).toLocaleString()}/yr</strong> total
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Income step-down after N years */}
          <div className="mt-6 pt-6 border-t border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-slate-800">Reduce Income in Later Retirement</h3>
                <p className="text-xs text-slate-500">Common pattern: spending reduces in later years as travel and lifestyle activities slow down.</p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={incomeReductionEnabled}
                  onChange={(e) => setIncomeReductionEnabled(e.target.checked)}/>
                Enable
              </label>
            </div>

            {incomeReductionEnabled && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">After (years into retirement)</label>
                  <input type="number" min="0" max={projectionYears} step="1" value={incomeReductionAfterYears}
                    onChange={(e) => setIncomeReductionAfterYears(parseInt(e.target.value) || 15)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md"/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Reduce income by</label>
                  <div className="flex items-center gap-2">
                    <input type="number" min="0" max="100" step="5" value={incomeReductionPercent}
                      onChange={(e) => setIncomeReductionPercent(parseInt(e.target.value) || 20)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md"/>
                    <span className="text-sm">%</span>
                  </div>
                </div>
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-md text-sm">
                  <div className="text-xs text-amber-700 uppercase tracking-wide">From year {incomeReductionAfterYears}</div>
                  <div className="font-semibold">
                    ${Math.round(annualIncome * (1 - incomeReductionPercent / 100)).toLocaleString()}/yr
                    <span className="text-xs text-slate-500 ml-1">(in today's $)</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    From age {retirementAge + incomeReductionAfterYears}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Lump sums */}
          <div className="mt-6 pt-6 border-t border-slate-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Accumulation lump sums */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-slate-800">Pre-Retirement Lump Sums</h3>
                  <button onClick={addAccumLumpSum}
                    className="flex items-center gap-1 px-2 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600">
                    <Plus size={14}/> Add
                  </button>
                </div>
                {accumulationLumpSums.length === 0 && (
                  <p className="text-xs text-slate-500 italic">No pre-retirement lump sums. Click Add to include an inheritance, property sale, etc.</p>
                )}
                {accumulationLumpSums.map(ls => (
                  <div key={ls.id} className="bg-slate-50 p-3 rounded-md mb-2 border border-slate-200">
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <input type="text" placeholder="Label" value={ls.label}
                        onChange={(e) => updateAccumLumpSum(ls.id, 'label', e.target.value)}
                        className="col-span-4 px-2 py-1 border border-slate-300 rounded text-sm"/>
                      <div className="col-span-2">
                        <label className="text-xs text-slate-500">Year</label>
                        <input type="number" min="0" max={yearsUntilRetirement - 1} value={ls.year}
                          onChange={(e) => updateAccumLumpSum(ls.id, 'year', e.target.value)}
                          className="w-full px-2 py-1 border border-slate-300 rounded text-sm"/>
                      </div>
                      <div className="col-span-3">
                        <label className="text-xs text-slate-500">Amount</label>
                        <MoneyInput value={ls.amount}
                          onChange={(v) => updateAccumLumpSum(ls.id, 'amount', v)}
                          className="w-full px-2 py-1 border border-slate-300 rounded text-sm"/>
                      </div>
                      <select value={ls.type} onChange={(e) => updateAccumLumpSum(ls.id, 'type', e.target.value)}
                        className="col-span-2 px-1 py-1 border border-slate-300 rounded text-sm">
                        <option value="deposit">Deposit</option>
                        <option value="withdrawal">Withdraw</option>
                      </select>
                      <button onClick={() => removeAccumLumpSum(ls.id)}
                        className="col-span-1 text-red-500 hover:text-red-700"><X size={16}/></button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Retirement lump sums */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-slate-800">In-Retirement Lump Sums</h3>
                  <button onClick={addRetireLumpSum}
                    className="flex items-center gap-1 px-2 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600">
                    <Plus size={14}/> Add
                  </button>
                </div>
                {retirementLumpSums.length === 0 && (
                  <p className="text-xs text-slate-500 italic">No in-retirement lump sums. Click Add for events like travel, renovation, car purchase, inheritance.</p>
                )}
                {retirementLumpSums.map(ls => (
                  <div key={ls.id} className="bg-slate-50 p-3 rounded-md mb-2 border border-slate-200">
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <input type="text" placeholder="Label" value={ls.label}
                        onChange={(e) => updateRetireLumpSum(ls.id, 'label', e.target.value)}
                        className="col-span-4 px-2 py-1 border border-slate-300 rounded text-sm"/>
                      <div className="col-span-2">
                        <label className="text-xs text-slate-500">Yr post-ret</label>
                        <input type="number" min="0" max={projectionYears - 1} value={ls.yearFromRetirement}
                          onChange={(e) => updateRetireLumpSum(ls.id, 'yearFromRetirement', e.target.value)}
                          className="w-full px-2 py-1 border border-slate-300 rounded text-sm"/>
                      </div>
                      <div className="col-span-3">
                        <label className="text-xs text-slate-500">Amount</label>
                        <MoneyInput value={ls.amount}
                          onChange={(v) => updateRetireLumpSum(ls.id, 'amount', v)}
                          className="w-full px-2 py-1 border border-slate-300 rounded text-sm"/>
                      </div>
                      <select value={ls.type} onChange={(e) => updateRetireLumpSum(ls.id, 'type', e.target.value)}
                        className="col-span-2 px-1 py-1 border border-slate-300 rounded text-sm">
                        <option value="deposit">Deposit</option>
                        <option value="withdrawal">Withdraw</option>
                      </select>
                      <button onClick={() => removeRetireLumpSum(ls.id)}
                        className="col-span-1 text-red-500 hover:text-red-700"><X size={16}/></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* =============== RETIREMENT ALLOCATION + PIE =============== */}
        <div id="sec-allocations" className="bg-white rounded-lg shadow-lg p-6 mb-6 avoid-break nav-anchor">
          <div className="flex flex-wrap items-center justify-between mb-4 gap-2">
            <h2 className="text-xl font-bold text-slate-800">
              Retirement Phase Allocation
              <span className={`text-sm font-normal ml-2 ${Math.abs(totalAllocation - 100) > 0.1 ? 'text-red-600' : 'text-slate-500'}`}>
                ({totalAllocation.toFixed(1)}%)
              </span>
              <span className="text-sm font-normal ml-2 px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200">
                Weighted avg return: {retirementAvgReturn.toFixed(2)}%
              </span>
            </h2>
            <button onClick={applyRecommendation}
              className="no-print flex items-center gap-2 px-3 py-2 bg-amber-500 text-white rounded-md hover:bg-amber-600 text-sm font-semibold shadow">
              <Sparkles size={16}/> Apply Recommendation
            </button>
          </div>
          {yearsUntilRetirement > 0 && (
            <p className="text-xs text-slate-500 mb-3 -mt-2">
              $ values shown as at retirement (year {yearsUntilRetirement}, age {retirementAge}) — portfolio projected to ${portfolioAtRetirement.toLocaleString(undefined, {maximumFractionDigits: 0})}.
            </p>
          )}

          {Math.abs(totalAllocation - 100) > 0.1 && (
            <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-300 text-red-800 rounded-md p-3 text-sm">
              <AlertTriangle size={18} className="shrink-0 mt-0.5"/>
              <div>
                <strong>Retirement allocation totals {totalAllocation.toFixed(1)}%, not 100%.</strong> The projection still
                deploys the full portfolio by treating these as relative weights — but the percentages above won't match the
                dollar figures until you adjust them to sum to 100%.
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Inputs */}
            <div>
              <div className="space-y-2 mb-4">
                {BUCKET_META.map(b => (
                  <div key={b.key} className="p-2 rounded border-l-4" style={{ borderLeftColor: b.color, backgroundColor: b.color + '15' }}>
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <label className="col-span-4 text-sm font-medium">{b.label}</label>
                      <div className="col-span-3 flex items-center gap-1 no-print">
                        <input type="number" step="0.1" value={allocations[b.key]}
                          onChange={(e) => updateAllocation(b.key, e.target.value)}
                          className="w-full px-2 py-1 border border-slate-300 rounded text-sm"/>
                        <span className="text-sm">%</span>
                      </div>
                      <span className="hidden print:block col-span-3 text-sm">{allocations[b.key]}%</span>
                      <div className="col-span-5 text-right text-sm font-medium">
                        ${retirementAllocDollars[b.key].toLocaleString(undefined, {maximumFractionDigits: 0})}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Recommendation settings */}
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 no-print">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Sparkles size={14} className="text-amber-500"/> Recommendation Settings
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <label className="text-xs text-slate-600">Cash (months of expenses)</label>
                    <input type="number" step="0.5" min="0" max="12" value={recSettings.cashMonths}
                      onChange={(e) => updateRecSetting('cashMonths', e.target.value)}
                      className="w-full px-2 py-1 border border-slate-300 rounded"/>
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">Term Dep (years of expenses)</label>
                    <input type="number" step="0.25" min="0" max="10" value={recSettings.tdYears}
                      onChange={(e) => updateRecSetting('tdYears', e.target.value)}
                      className="w-full px-2 py-1 border border-slate-300 rounded"/>
                  </div>
                </div>
                <div className="mt-3">
                  <label className="text-xs text-slate-600 block mb-1">Invested split (% of remaining)</label>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs text-green-700">Income</label>
                      <input type="number" step="1" value={recSettings.incomePct}
                        onChange={(e) => updateRecSetting('incomePct', e.target.value)}
                        className="w-full px-2 py-1 border border-slate-300 rounded text-sm"/>
                    </div>
                    <div>
                      <label className="text-xs text-blue-700">Balanced</label>
                      <input type="number" step="1" value={recSettings.balancedPct}
                        onChange={(e) => updateRecSetting('balancedPct', e.target.value)}
                        className="w-full px-2 py-1 border border-slate-300 rounded text-sm"/>
                    </div>
                    <div>
                      <label className="text-xs text-purple-700">Growth</label>
                      <input type="number" step="1" value={recSettings.growthPct}
                        onChange={(e) => updateRecSetting('growthPct', e.target.value)}
                        className="w-full px-2 py-1 border border-slate-300 rounded text-sm"/>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  {yearsUntilRetirement > 0 ? (
                    <>At retirement (with 2% CPI): Cash ≈ ${(annualIncome * Math.pow(1.02, yearsUntilRetirement) * recSettings.cashMonths / 12).toLocaleString(undefined, {maximumFractionDigits: 0})} • TD ≈ ${(annualIncome * Math.pow(1.02, yearsUntilRetirement) * recSettings.tdYears).toLocaleString(undefined, {maximumFractionDigits: 0})}</>
                  ) : (
                    <>Cash ≈ ${(annualIncome * recSettings.cashMonths / 12).toLocaleString(undefined, {maximumFractionDigits: 0})} • TD ≈ ${(annualIncome * recSettings.tdYears).toLocaleString(undefined, {maximumFractionDigits: 0})}</>
                  )}
                </p>
              </div>
            </div>

            {/* Pie chart */}
            <div className="flex items-center justify-center">
              {retirementPieData.length > 0 ? (
                <PrintableChart screenHeight={320} printHeight={300} printWidth={330}>
                  <PieChart>
                    <Pie data={retirementPieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                      outerRadius={100} innerRadius={45}
                      label={({percent}) => percent > 0.03 ? `${(percent * 100).toFixed(0)}%` : ''}>
                      {retirementPieData.map((entry, i) => <Cell key={i} fill={entry.color}/>)}
                    </Pie>
                    <Tooltip formatter={(v) => `$${Number(v).toLocaleString("en-NZ", {maximumFractionDigits: 0})}`}/>
                    <Legend verticalAlign="bottom" height={36} wrapperStyle={{fontSize: '12px'}}/>
                  </PieChart>
                </PrintableChart>
              ) : (
                <div className="text-slate-400 text-sm italic">Enter allocations to see chart</div>
              )}
            </div>
          </div>
        </div>

        {/* =============== RETURNS =============== */}
        <div id="sec-returns" className="bg-white rounded-lg shadow-lg p-6 mb-6 no-print nav-anchor">
          <h2 className="text-xl font-bold mb-4">Expected Returns (%)</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              {k:'cashSavings', l:'Cash'},
              {k:'capitalPreservation', l:'Capital Pres.'},
              {k:'incomeGenerator', l:'Income'},
              {k:'steadyGrowth', l:'Balanced'},
              {k:'strategicGrowth', l:'Growth'}
            ].map(({k, l}) => (
              <div key={k}>
                <label className="text-sm font-medium mb-1 block">{l}</label>
                <div className="flex gap-1">
                  <input type="number" step="0.1" value={returns[k]}
                    onChange={(e) => updateReturn(k, e.target.value)}
                    className="w-full px-2 py-1 border rounded"/>
                  <span className="text-sm self-center">%</span>
                </div>
              </div>
            ))}
          </div>

          {/* Volatility (used by Monte Carlo only) */}
          <div className="mt-6 pt-6 border-t border-slate-200">
            <div className="flex items-baseline justify-between mb-1">
              <h3 className="font-semibold text-slate-800">Volatility (annual std. dev., %)</h3>
              <span className="text-xs text-slate-500">Used by the Monte Carlo analysis only</span>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Cash and Capital Preservation are contractual — they carry no volatility. Income Generator is built for
              stable income, so it takes only a small wobble. The real variability sits in the two growth buckets, which
              move together in a market shock.
            </p>
            <div className="grid grid-cols-3 gap-4 max-w-xl">
              {[
                {k:'incomeGenerator', l:'Income', c:'text-green-700'},
                {k:'steadyGrowth', l:'Balanced', c:'text-blue-700'},
                {k:'strategicGrowth', l:'Growth', c:'text-purple-700'}
              ].map(({k, l, c}) => (
                <div key={k}>
                  <label className={`text-sm font-medium mb-1 block ${c}`}>{l}</label>
                  <div className="flex gap-1">
                    <input type="number" step="0.5" min="0" value={volatilities[k]}
                      onChange={(e) => updateVolatility(k, e.target.value)}
                      className="w-full px-2 py-1 border rounded"/>
                    <span className="text-sm self-center">%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* =============== MAX SUSTAINABLE DRAWDOWN =============== */}
        <div id="sec-maxincome" className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-lg shadow-lg p-6 mb-6 text-white avoid-break nav-anchor">
          <h2 className="text-xl font-bold mb-3">Maximum Sustainable Income</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-xs opacity-80 uppercase tracking-wider">Max sustainable income</div>
              <div className="text-3xl font-bold mt-1">${Math.round(maxSustainableIncome).toLocaleString()}<span className="text-lg font-normal">/yr</span></div>
              <div className="text-xs opacity-80 mt-1">Portfolio depleted at end of year {projectionYears}</div>
            </div>
            <div>
              <div className="text-xs opacity-80 uppercase tracking-wider">Implied first-year drawdown</div>
              <div className="text-3xl font-bold mt-1">${Math.round(maxSustainableDrawdown).toLocaleString()}<span className="text-lg font-normal">/yr</span></div>
              <div className="text-xs opacity-80 mt-1">After ${Math.round(superAtRetirement).toLocaleString()} super</div>
            </div>
            <div>
              <div className="text-xs opacity-80 uppercase tracking-wider">Your target income</div>
              <div className="text-3xl font-bold mt-1">${Math.round(annualIncome).toLocaleString()}<span className="text-lg font-normal">/yr</span></div>
              <div className={`text-xs mt-1 font-semibold flex items-center gap-1 ${annualIncome <= maxSustainableIncome ? 'text-green-300' : 'text-amber-300'}`}>
                {annualIncome <= maxSustainableIncome
                  ? `✓ Sustainable (${((annualIncome / maxSustainableIncome) * 100).toFixed(0)}% of max)`
                  : <><AlertTriangle size={14}/> Exceeds sustainable level</>}
              </div>
            </div>
          </div>
          <p className="text-xs opacity-75 mt-4">
            The highest annual income this portfolio can sustain through the full {projectionYears}-year retirement. Income and NZ Super are both increased by 2% each year to keep pace with inflation — so although the first-year figure is shown above, actual drawings grow annually to preserve purchasing power.{inflateSuper ? '' : ' (Super inflation is currently disabled in settings — this will understate sustainability.)'}
          </p>
        </div>

        {/* =============== CURRENT PORTFOLIO SUMMARY (screen + print) =============== */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6 avoid-break">
          <h3 className="text-lg font-bold mb-3">Current Portfolio</h3>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 text-slate-600">
                <th className="text-left py-2 font-medium">Holding</th>
                <th className="text-right py-2 font-medium w-32">Amount</th>
                <th className="text-right py-2 font-medium w-20">%</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-1.5">Cash</td>
                <td className="text-right">${Math.round(cash).toLocaleString()}</td>
                <td className="text-right text-slate-500">{totalPortfolio > 0 ? ((cash / totalPortfolio) * 100).toFixed(1) : '0.0'}%</td>
              </tr>
              <tr className="border-b">
                <td className="py-1.5">Term Deposits</td>
                <td className="text-right">${Math.round(termDeposits).toLocaleString()}</td>
                <td className="text-right text-slate-500">{totalPortfolio > 0 ? ((termDeposits / totalPortfolio) * 100).toFixed(1) : '0.0'}%</td>
              </tr>
              <tr className="border-b">
                <td className="py-1.5">{clientName || 'Client'} KiwiSaver</td>
                <td className="text-right">${Math.round(currentInvestments[0]?.amount || 0).toLocaleString()}</td>
                <td className="text-right text-slate-500">{totalPortfolio > 0 ? (((currentInvestments[0]?.amount || 0) / totalPortfolio) * 100).toFixed(1) : '0.0'}%</td>
              </tr>
              {isJoint && (
                <tr className="border-b">
                  <td className="py-1.5">{partnerName || 'Partner'} KiwiSaver</td>
                  <td className="text-right">${Math.round(currentInvestments[1]?.amount || 0).toLocaleString()}</td>
                  <td className="text-right text-slate-500">{totalPortfolio > 0 ? (((currentInvestments[1]?.amount || 0) / totalPortfolio) * 100).toFixed(1) : '0.0'}%</td>
                </tr>
              )}
              {currentInvestments.filter(i => i.id > 2).map(inv => (
                <tr key={inv.id} className="border-b">
                  <td className="py-1.5">{inv.label || 'Investment'}</td>
                  <td className="text-right">${Math.round(inv.amount).toLocaleString()}</td>
                  <td className="text-right text-slate-500">{totalPortfolio > 0 ? ((inv.amount / totalPortfolio) * 100).toFixed(1) : '0.0'}%</td>
                </tr>
              ))}
              <tr className="font-bold border-t-2">
                <td className="py-2">Total</td>
                <td className="text-right">${Math.round(totalPortfolio).toLocaleString()}</td>
                <td className="text-right">100.0%</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* =============== RETIREMENT PLANNING SUMMARY (print) =============== */}
        <div className="hidden print:block avoid-break mb-6">
          <div className="bg-white rounded-lg p-6 border border-slate-200">
            <h2 className="text-xl font-bold text-slate-800 mb-4">Retirement Planning</h2>
            <div className="grid grid-cols-3 gap-4 text-sm mb-4">
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wide">Years Until Retirement</div>
                <div className="font-semibold text-base mt-0.5">{yearsUntilRetirement}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wide">Retirement Duration</div>
                <div className="font-semibold text-base mt-0.5">{projectionYears} years</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wide">Annual Income Required</div>
                <div className="font-semibold text-base mt-0.5">${Math.round(annualIncome).toLocaleString()}/yr</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wide">Regular Contribution</div>
                <div className="font-semibold text-base mt-0.5">
                  {contributionAmount > 0 ? `$${Math.round(contributionAmount).toLocaleString()} ${contributionFrequency}` : '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wide">Annual Contribution Total</div>
                <div className="font-semibold text-base mt-0.5">${Math.round(annualContribution + annualKsTotal).toLocaleString()}</div>
                {annualKsTotal > 0 && (
                  <div className="text-xs text-slate-500 mt-0.5">
                    (incl. ${Math.round(annualKsTotal).toLocaleString()} KiwiSaver)
                  </div>
                )}
              </div>
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wide">First-Year Drawdown</div>
                <div className="font-semibold text-base mt-0.5">${Math.round(Math.max(0, annualIncome - superAtRetirement)).toLocaleString()}/yr</div>
              </div>
            </div>

            {(ksEnabled && (annualKsClient > 0 || annualKsPartner > 0)) && (
              <div className="pt-4 border-t border-slate-200 mb-4">
                <h3 className="font-semibold text-slate-800 mb-2 text-sm">KiwiSaver Contributions</h3>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b text-slate-600 text-xs uppercase">
                      <th className="text-left py-1 font-medium">Person</th>
                      <th className="text-right py-1 font-medium">Salary</th>
                      <th className="text-right py-1 font-medium">Employee %</th>
                      <th className="text-right py-1 font-medium">Employer %</th>
                      <th className="text-right py-1 font-medium">Total p.a.</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="py-1">{clientName || 'Client'}</td>
                      <td className="text-right">${Math.round(clientSalary).toLocaleString()}</td>
                      <td className="text-right">{clientKsRate}%</td>
                      <td className="text-right">{clientKsEmployer}%</td>
                      <td className="text-right font-semibold">${Math.round(annualKsClient).toLocaleString()}</td>
                    </tr>
                    {isJoint && (
                      <tr className="border-b">
                        <td className="py-1">{partnerName || 'Partner'}</td>
                        <td className="text-right">${Math.round(partnerSalary).toLocaleString()}</td>
                        <td className="text-right">{partnerKsRate}%</td>
                        <td className="text-right">{partnerKsEmployer}%</td>
                        <td className="text-right font-semibold">${Math.round(annualKsPartner).toLocaleString()}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {incomeReductionEnabled && (
              <div className="pt-4 border-t border-slate-200 mb-4">
                <h3 className="font-semibold text-slate-800 mb-1 text-sm">Income Step-Down</h3>
                <p className="text-sm">
                  Income reduces by <strong>{incomeReductionPercent}%</strong> from year {incomeReductionAfterYears} of retirement (age {retirementAge + incomeReductionAfterYears})
                  {' '}— target drops from <strong>${Math.round(annualIncome).toLocaleString()}</strong> to <strong>${Math.round(annualIncome * (1 - incomeReductionPercent / 100)).toLocaleString()}</strong> in today's dollars.
                </p>
              </div>
            )}

            {(accumulationLumpSums.length > 0 || retirementLumpSums.length > 0) && (
              <div className="pt-4 border-t border-slate-200">
                <h3 className="font-semibold text-slate-800 mb-2 text-sm">Lump Sum Events</h3>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b text-slate-600 text-xs uppercase">
                      <th className="text-left py-1 font-medium">Event</th>
                      <th className="text-left py-1 font-medium">Phase</th>
                      <th className="text-left py-1 font-medium">When</th>
                      <th className="text-left py-1 font-medium">Type</th>
                      <th className="text-right py-1 font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accumulationLumpSums.map(ls => (
                      <tr key={ls.id} className="border-b">
                        <td className="py-1">{ls.label || 'Lump sum'}</td>
                        <td className="py-1">Pre-retirement</td>
                        <td className="py-1">Year {ls.year} (age {clientAge + ls.year})</td>
                        <td className="py-1 capitalize">{ls.type}</td>
                        <td className="text-right py-1">${Math.round(ls.amount).toLocaleString()}</td>
                      </tr>
                    ))}
                    {retirementLumpSums.map(ls => (
                      <tr key={ls.id} className="border-b">
                        <td className="py-1">{ls.label || 'Lump sum'}</td>
                        <td className="py-1">In-retirement</td>
                        <td className="py-1">Year {yearsUntilRetirement + ls.yearFromRetirement} (age {retirementAge + ls.yearFromRetirement})</td>
                        <td className="py-1 capitalize">{ls.type}</td>
                        <td className="text-right py-1">${Math.round(ls.amount).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* =============== YOUR RETIREMENT PICTURE (NARRATIVE) =============== */}
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 border-l-4 border-amber-500 rounded-lg shadow-lg p-6 mb-6 avoid-break">
          <h2 className="text-xl font-bold text-slate-800 mb-3 flex items-center gap-2">
            <Sparkles size={20} className="text-amber-600"/> Your Retirement Picture
          </h2>
          <div className="space-y-3 text-sm text-slate-700 leading-relaxed">
            {/* Opening: today's position */}
            <p>
              {isJoint ? (
                <><strong>{clientName || 'Client'}</strong> (age {clientAge}) and <strong>{partnerName || 'Partner'}</strong> (age {partnerAge})</>
              ) : (
                <><strong>{clientName || 'Client'}</strong> (age {clientAge})</>
              )}
              {' '}currently hold <strong>${Math.round(totalPortfolio).toLocaleString()}</strong> across cash, term deposits, KiwiSaver and other investments
              {yearsUntilRetirement > 0 ? (
                <>, with plans to retire in <strong>{yearsUntilRetirement} year{yearsUntilRetirement !== 1 ? 's' : ''}</strong> at age {retirementAge}.</>
              ) : (
                <> and {isJoint ? 'are' : 'is'} already at retirement age.</>
              )}
              {(annualContribution > 0 || annualKsTotal > 0) && yearsUntilRetirement > 0 && (
                <> Between now and then, contributions of <strong>${Math.round(annualContribution + annualKsTotal).toLocaleString()}/yr</strong> ({annualContribution > 0 && `${'$'}${Math.round(annualContribution).toLocaleString()} regular`}{annualContribution > 0 && annualKsTotal > 0 && <> + </>}{annualKsTotal > 0 && `${'$'}${Math.round(annualKsTotal).toLocaleString()} KiwiSaver`}) will continue to build the portfolio. Contributions stop at retirement.</>
              )}
            </p>

            {/* Portfolio growth */}
            {yearsUntilRetirement > 0 && (
              <p>
                Based on the WealthGuard accumulation allocation (weighted average return of {accumulationAvgReturn.toFixed(2)}% p.a.),
                the portfolio is projected to grow to approximately <strong>${Math.round(portfolioAtRetirement).toLocaleString()}</strong> by
                the start of retirement.
              </p>
            )}

            {/* Income & super in retirement */}
            <p>
              The target annual retirement income is <strong>${Math.round(annualIncome).toLocaleString()}</strong> in today's dollars, rising each year with inflation.
              {superAtRetirement > 0 ? (
                <> NZ Super is expected to contribute around <strong>${Math.round(superAtRetirement).toLocaleString()}/yr</strong> from day one of retirement</>
              ) : (
                <> NZ Super isn't available yet at the chosen retirement age — the portfolio must cover the full income requirement initially</>
              )}
              {superAt65Details.ageGap ? (
                <>
                  . When <strong>{clientName || 'Client'}</strong> turns 65
                  {superAt65Details.yearsToClient65 > 0 ? ` (in ${superAt65Details.yearsToClient65} year${superAt65Details.yearsToClient65 !== 1 ? 's' : ''})` : ''},
                  household super will be around <strong>${Math.round(superAt65Details.clientSuperFV).toLocaleString()}/yr</strong>
                  {superAt65Details.clientSuperFV < superAt65Details.partnerSuperFV ? (
                    <>, lifting further to <strong>${Math.round(superAt65Details.partnerSuperFV).toLocaleString()}/yr</strong> when {partnerName || 'Partner'} also qualifies in {superAt65Details.yearsToPartner65} year{superAt65Details.yearsToPartner65 !== 1 ? 's' : ''}</>
                  ) : (
                    <></>
                  )}.
                </>
              ) : retirementAge !== 65 && superAt65Details.yearsToClient65 > 0 ? (
                <>. Once age 65 is reached (in {superAt65Details.yearsToClient65} year{superAt65Details.yearsToClient65 !== 1 ? 's' : ''}), super is expected to be around <strong>${Math.round(superAt65Details.clientSuperFV).toLocaleString()}/yr</strong>.</>
              ) : (
                <>.</>
              )}
            </p>

            {/* Sustainability */}
            <p>
              Projecting {projectionYears} years of retirement with the current investment allocations,
              the portfolio can sustain an annual income of up to <strong>${Math.round(maxSustainableIncome).toLocaleString()}</strong>.
              {' '}
              {annualIncome <= maxSustainableIncome ? (
                <>The target of ${Math.round(annualIncome).toLocaleString()} sits at <strong>{((annualIncome / maxSustainableIncome) * 100).toFixed(0)}%</strong> of that ceiling — comfortably within what the plan can support.</>
              ) : (
                <><strong className="text-red-700">The target of ${Math.round(annualIncome).toLocaleString()} exceeds the sustainable level</strong> — either the income target will need to come down, or the portfolio needs to grow further before retirement.</>
              )}
            </p>

            {/* Income step-down, if enabled */}
            {incomeReductionEnabled && (
              <p>
                After {incomeReductionAfterYears} years of retirement (age {retirementAge + incomeReductionAfterYears}),
                the income target reduces by <strong>{incomeReductionPercent}%</strong> to
                <strong> ${Math.round(annualIncome * (1 - incomeReductionPercent / 100)).toLocaleString()}/yr</strong> in today's dollars —
                reflecting the typical pattern where travel and active lifestyle spending slows down in the later years of retirement.
              </p>
            )}

            {/* Lump sums, if any */}
            {(accumulationLumpSums.length > 0 || retirementLumpSums.length > 0) && (
              <p>
                This projection also allows for
                {accumulationLumpSums.length > 0 && (
                  <> {accumulationLumpSums.length} pre-retirement {accumulationLumpSums.length === 1 ? 'lump sum' : 'lump sums'}</>
                )}
                {accumulationLumpSums.length > 0 && retirementLumpSums.length > 0 && <> and</>}
                {retirementLumpSums.length > 0 && (
                  <> {retirementLumpSums.length} in-retirement {retirementLumpSums.length === 1 ? 'lump sum' : 'lump sums'}</>
                )}
                {' '}(inheritances, property sales, one-off purchases) as entered in the planning section.
              </p>
            )}
          </div>
        </div>

        <div className="hidden print:block page-break"></div>

        {/* =============== HOW THE DRAWDOWN WORKS =============== */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6 avoid-break">
          <h2 className="text-xl font-bold mb-2">How the Drawdown Works</h2>
          <p className="text-sm text-slate-600 mb-5">
            In retirement, the WealthGuard strategy pays your regular living expenses in a specific order designed
            to let long-term investments keep growing while still providing reliable day-to-day cashflow.
          </p>

          {/* Visual cascade */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-6">
            {[
              { label: 'Cash Savings',   color: '#eab308', role: 'Everyday spending',        detail: `${recSettings.cashMonths} months of expenses` },
              { label: 'Income Generator', color: '#22c55e', role: 'Tops up Cash',           detail: 'Quarterly top-ups' },
              { label: 'Steady Growth',  color: '#3b82f6', role: 'Tops up Income',           detail: 'Medium-term compounding' },
              { label: 'Strategic Long Term Growth', color: '#a855f7', role: 'Tops up Income',         detail: 'Long-term compounding' },
              { label: 'Capital Preservation', color: '#f97316', role: 'Emergency reserve',  detail: `${recSettings.tdYears} years of expenses` }
            ].map((b, i) => (
              <div key={b.label} className="relative">
                <div className="rounded-lg p-3 border-l-4 h-full" style={{ borderLeftColor: b.color, backgroundColor: b.color + '15' }}>
                  <div className="text-xs font-bold uppercase tracking-wider" style={{ color: b.color }}>Step {i + 1}</div>
                  <div className="font-semibold text-sm mt-1">{b.label}</div>
                  <div className="text-xs text-slate-600 mt-1">{b.role}</div>
                  <div className="text-xs text-slate-500 mt-1 italic">{b.detail}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Detailed flow */}
          <div className="space-y-3 text-sm text-slate-700">
            <div className="flex gap-3 items-start">
              <div className="shrink-0 w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-700 font-bold text-sm">1</div>
              <div>
                <strong>You spend from Cash Savings.</strong> Your monthly expenses are paid from the Cash bucket, which
                holds roughly {recSettings.cashMonths} months' worth of living costs — enough that short-term market
                movements never affect your day-to-day spending.
              </div>
            </div>
            <div className="flex gap-3 items-start">
              <div className="shrink-0 w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-sm">2</div>
              <div>
                <strong>Cash is refilled from Income Generator.</strong> Every quarter, we top up Cash from the Income
                Generator bucket. This bucket is made up of dividend-producing and interest-bearing investments designed
                to deliver reliable income without heavy volatility.
              </div>
            </div>
            <div className="flex gap-3 items-start">
              <div className="shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">3</div>
              <div>
                <strong>Income Generator is refilled from Steady Growth and Strategic Long Term Growth.</strong> Once a year, we
                top up the Income bucket from the two long-term growth buckets. Drawing from them only annually lets
                them keep compounding for as long as possible, and gives us flexibility to draw more heavily from
                whichever has performed best.
              </div>
            </div>
            <div className="flex gap-3 items-start">
              <div className="shrink-0 w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-700 font-bold text-sm">4</div>
              <div>
                <strong>Capital Preservation is your safety net.</strong> Term deposits hold around {recSettings.tdYears} years
                of expenses and are only touched in genuine emergencies — such as a prolonged market downturn where we
                don't want to sell growth assets at a loss. In normal conditions they stay untouched and earn steady
                interest in the background.
              </div>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-200 text-xs text-slate-500">
            <strong className="text-slate-700">Why this works:</strong> Because you're never forced to sell long-term
            investments during a market dip to cover this month's groceries, your portfolio has time to ride out
            volatility. The buckets work together to protect against what's called "sequence of returns risk" — the
            danger of early retirement losses permanently shrinking your nest egg.
          </div>
        </div>

        {/* =============== PORTFOLIO GROWTH CHART =============== */}
        <div id="sec-charts" className="bg-white rounded-lg shadow-lg p-6 mb-6 avoid-break wg-card chart-card charts-page nav-anchor">
          <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-xl font-bold">Portfolio Projection</h2>
            <span className="text-xs text-slate-500">X-axis: year · {isJoint ? 'client / partner age' : 'age'}</span>
          </div>

          {/* Live income slider — drag to see the projection respond instantly */}
          <div className="no-print mb-5 bg-slate-50 border border-slate-200 rounded-lg p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
              <label htmlFor="income-slider" className="text-sm font-semibold text-slate-700">
                Try a different required income
              </label>
              <span className="text-lg font-bold text-slate-800">${Math.round(annualIncome).toLocaleString()}/yr</span>
            </div>
            <input
              id="income-slider"
              type="range"
              min={0}
              max={incomeSliderMax}
              step={1000}
              value={annualIncome}
              onChange={(e) => setAnnualIncome(parseFloat(e.target.value) || 0)}
              className="w-full accent-blue-600 cursor-pointer"
            />
            <div className="flex items-center justify-between mt-2 text-xs">
              <span className="text-slate-400">$0</span>
              <span className={`font-semibold flex items-center gap-1 ${
                maxSustainableIncome <= 0 ? 'text-slate-500'
                : annualIncome <= maxSustainableIncome ? 'text-green-600' : 'text-amber-600'}`}>
                {maxSustainableIncome > 0 && (
                  annualIncome <= maxSustainableIncome
                    ? `✓ ${((annualIncome / maxSustainableIncome) * 100).toFixed(0)}% of max sustainable ($${Math.round(maxSustainableIncome).toLocaleString()})`
                    : <><AlertTriangle size={12}/> Exceeds max sustainable (${Math.round(maxSustainableIncome).toLocaleString()})</>
                )}
              </span>
              <span className="text-slate-400">${incomeSliderMax.toLocaleString()}</span>
            </div>
          </div>

          <PrintableChart screenHeight={420} printHeight={330}>
            <LineChart data={projectionData} margin={{left:40, right:20, top:5, bottom:10}}>
              <CartesianGrid strokeDasharray="3 3"/>
              <XAxis dataKey="year" tick={<AgeTick/>} height={45} interval={tickInterval}/>
              <YAxis tickFormatter={(v) => `$${(v/1000).toLocaleString()}k`} width={80}/>
              <Tooltip formatter={(v) => `$${Number(v).toLocaleString("en-NZ", {maximumFractionDigits: 0})}`} labelFormatter={ageTooltipLabel}/>
              <Legend wrapperStyle={{paddingTop: '10px'}}/>
              <Line type="monotone" dataKey="Total" stroke="#1f2937" strokeWidth={3} dot={false}/>
              <Line type="monotone" dataKey="Cash Savings" stroke="#eab308" strokeWidth={2} dot={false}/>
              <Line type="monotone" dataKey="Capital Preservation" stroke="#f97316" strokeWidth={2} dot={false}/>
              <Line type="monotone" dataKey="Income Generator" stroke="#22c55e" strokeWidth={2} dot={false}/>
              <Line type="monotone" dataKey="Steady Growth" stroke="#3b82f6" strokeWidth={2} dot={false}/>
              <Line type="monotone" dataKey="Strategic Long Term Growth" stroke="#a855f7" strokeWidth={2} dot={false}/>
            </LineChart>
          </PrintableChart>
          {yearsUntilRetirement > 0 && (
            <p className="text-xs mt-2 text-slate-500 no-print">
              Accumulation phase: years 0–{yearsUntilRetirement - 1} (ages {clientAge}–{clientAge + yearsUntilRetirement - 1}). Retirement phase begins year {yearsUntilRetirement} (age {retirementAge}).
            </p>
          )}
        </div>

        {/* =============== INCOME DRAWDOWN CHART =============== */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6 avoid-break wg-card chart-card">
          <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-xl font-bold">Income Drawdown</h2>
            <span className="text-xs text-slate-500">X-axis: year · {isJoint ? 'client / partner age' : 'age'}</span>
          </div>
          <PrintableChart screenHeight={370} printHeight={330}>
            <LineChart data={drawdownChartData} margin={{left:40, right:20, top:5, bottom:10}}>
              <CartesianGrid strokeDasharray="3 3"/>
              <XAxis dataKey="year" tick={<AgeTick/>} height={45} interval={tickInterval}/>
              <YAxis tickFormatter={(v) => `$${(v/1000).toLocaleString()}k`} width={80}/>
              <Tooltip formatter={(v) => `$${Number(v).toLocaleString("en-NZ", {maximumFractionDigits: 0})}`} labelFormatter={ageTooltipLabel}/>
              <Legend wrapperStyle={{paddingTop: '10px'}}/>
              <Line type="monotone" dataKey="Required Drawdown" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 4" dot={false}/>
              <Line type="monotone" dataKey="Annual Drawdown" stroke="#dc2626" strokeWidth={2} dot={false}/>
              <Line type="monotone" dataKey="Cumulative Drawdown" stroke="#7c3aed" strokeWidth={3} dot={false}/>
            </LineChart>
          </PrintableChart>
          <p className="text-xs mt-3 text-slate-500 no-print">
            Required = income gap needed each year. Annual = what the portfolio was actually able to provide (capped if funds run out). Both income and super inflate at 2% p.a.
          </p>
        </div>

        {/* =============== MONTE CARLO =============== */}
        <div id="sec-montecarlo" className={`bg-white rounded-lg shadow-lg p-6 mb-6 wg-card nav-anchor ${mcResults ? 'mc-section' : ''}`}>
          <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2"><Dices size={20} className="text-blue-600"/> Monte Carlo Analysis</h2>
              <p className="text-sm text-slate-600 mt-1 max-w-3xl">
                The projection above assumes every bucket earns its expected return every year. Real markets don't behave
                that way. This runs the plan through {Math.round(mcSettings.numSims).toLocaleString()} random return sequences
                — modelling the WealthGuard strategy faithfully: in a down year, income is funded from Cash and Capital
                Preservation so the growth buckets are left alone to recover.
              </p>
            </div>
            <button onClick={runMonteCarloAnalysis} disabled={mcRunning}
              className="no-print flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold shadow disabled:opacity-60">
              <Dices size={18}/> {mcRunning ? 'Running…' : mcResults ? 'Re-run' : 'Run simulation'}
            </button>
          </div>

          {/* Settings */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 no-print">
            <div>
              <label className="text-xs text-slate-600 block mb-1">Number of simulations</label>
              <select value={mcSettings.numSims} onChange={(e) => updateMcSetting('numSims', e.target.value)}
                className="w-full px-2 py-1 border border-slate-300 rounded text-sm">
                <option value={500}>500 (fast)</option>
                <option value={1000}>1,000</option>
                <option value={2000}>2,000</option>
                <option value={5000}>5,000 (slow, smoothest)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-600 block mb-1">"Down year" threshold (growth return below)</label>
              <div className="flex items-center gap-1">
                <input type="number" step="0.5" value={mcSettings.downYearThreshold}
                  onChange={(e) => updateMcSetting('downYearThreshold', e.target.value)}
                  className="w-full px-2 py-1 border border-slate-300 rounded text-sm"/>
                <span className="text-sm">%</span>
              </div>
            </div>
            {yearsUntilRetirement > 0 && (
              <div className="flex flex-col justify-end">
                <label className="flex items-center gap-2 cursor-pointer text-sm bg-slate-50 border border-slate-200 rounded px-3 py-2">
                  <input type="checkbox" checked={mcAccumulationEnabled}
                    onChange={(e) => setMcAccumulationEnabled(e.target.checked)}/>
                  Apply volatility in accumulation
                </label>
              </div>
            )}
            <div className="text-xs text-slate-500 flex items-end pb-1">
              When a growth bucket returns below the threshold, income is drawn from the safe buckets instead of selling growth.
              {yearsUntilRetirement > 0 && (
                <> {mcAccumulationEnabled
                  ? ' Accumulation years are also randomised.'
                  : ' Accumulation years grow smoothly; only retirement is randomised.'}</>
              )}
            </div>
          </div>

          {!mcResults && !mcRunning && (
            <>
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 text-amber-800 text-sm no-print">
                <strong>Run the simulation to include it in the printed report.</strong> Click <strong>Run simulation</strong> below
                to model {Math.round(mcSettings.numSims).toLocaleString()} possible market outcomes. After the first run it
                updates automatically whenever you change a figure.
              </div>
              {/* Printed note so the section never appears as an unexplained blank */}
              <div className="hidden print:block text-sm text-slate-500 italic">
                The Monte Carlo analysis was not run for this report. To include it, open the tool, click “Run simulation”,
                then export to PDF.
              </div>
            </>
          )}
          {mcRunning && !mcResults && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-8 text-center text-slate-500 text-sm">
              Running {Math.round(mcSettings.numSims).toLocaleString()} simulations…
            </div>
          )}

          {mcResults && (
            <div className="space-y-6">
              {mcRunning && (
                <div className="no-print text-xs text-blue-600 flex items-center gap-2 -mb-3">
                  <Dices size={14} className="animate-pulse"/> Updating results for the latest figures…
                </div>
              )}
              {/* Headline stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className={`rounded-lg p-4 border-l-4 ${mcResults.successRate >= 0.85 ? 'bg-green-50 border-green-500' : mcResults.successRate >= 0.7 ? 'bg-amber-50 border-amber-500' : 'bg-red-50 border-red-500'}`}>
                  <div className="text-xs uppercase tracking-wider text-slate-500">Success probability</div>
                  <div className={`text-4xl font-bold mt-1 ${mcResults.successRate >= 0.85 ? 'text-green-700' : mcResults.successRate >= 0.7 ? 'text-amber-700' : 'text-red-700'}`}>
                    {(mcResults.successRate * 100).toFixed(0)}%
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    {incomeReductionEnabled ? (
                      <>of {mcResults.numSims.toLocaleString()} runs met the full income need across all {projectionYears} years —
                      ${Math.round(annualIncome).toLocaleString()}/yr for the first {incomeReductionAfterYears},
                      then ${Math.round(annualIncome * (1 - incomeReductionPercent / 100)).toLocaleString()}/yr
                      (−{incomeReductionPercent}%) thereafter, each rising with inflation</>
                    ) : (
                      <>of {mcResults.numSims.toLocaleString()} runs met the full ${Math.round(annualIncome).toLocaleString()}/yr
                      income need across all {projectionYears} years (rising with inflation)</>
                    )}
                  </div>
                </div>
                <div className="rounded-lg p-4 border-l-4 bg-slate-50 border-slate-400">
                  <div className="text-xs uppercase tracking-wider text-slate-500">Median end balance</div>
                  <div className="text-4xl font-bold mt-1 text-slate-800">
                    ${(mcResults.bands[mcResults.bands.length - 1].p50 / 1000).toLocaleString(undefined, {maximumFractionDigits: 0})}k
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    Half of outcomes finish above this; range shown in the chart below
                  </div>
                </div>
                <div className="rounded-lg p-4 border-l-4 bg-slate-50 border-slate-400">
                  <div className="text-xs uppercase tracking-wider text-slate-500">Runs that fell short</div>
                  <div className="text-4xl font-bold mt-1 text-slate-800">{mcResults.depletionYears.length.toLocaleString()}</div>
                  <div className="text-xs text-slate-600 mt-1">
                    {mcResults.depletionYears.length > 0
                      ? `Typically depleting around year ${Math.round(mcResults.depletionYears.reduce((a,b)=>a+b,0)/mcResults.depletionYears.length) - yearsUntilRetirement} of retirement`
                      : 'No runs ran out of money'}
                  </div>
                </div>
              </div>

              {/* Fan chart */}
              <div className="avoid-break">
                <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
                  <h3 className="font-semibold text-slate-800">Range of Outcomes</h3>
                  <span className="text-xs text-slate-500">X-axis: year · {isJoint ? 'client / partner age' : 'age'}</span>
                </div>
                <PrintableChart screenHeight={380} printHeight={250}>
                  <ComposedChart data={mcResults.bands} margin={{left:40, right:20, top:5, bottom:10}}>
                    <CartesianGrid strokeDasharray="3 3"/>
                    <XAxis dataKey="year" tick={<AgeTick/>} height={45} interval={tickInterval}/>
                    <YAxis tickFormatter={(v) => `$${(v/1000).toLocaleString()}k`} width={80}/>
                    <Tooltip
                      labelFormatter={ageTooltipLabel}
                      formatter={(v, name) => [`$${Number(v).toLocaleString("en-NZ", {maximumFractionDigits: 0})}`, name]}/>
                    {/* Stacked invisible base + bands to create a fan */}
                    <Area type="monotone" dataKey="base" stackId="1" stroke="none" fill="transparent" name="10th pct" legendType="none"/>
                    <Area type="monotone" dataKey="band10_25" stackId="1" stroke="none" fill="#3b82f6" fillOpacity={0.15} name="10–25th pct"/>
                    <Area type="monotone" dataKey="band25_75" stackId="1" stroke="none" fill="#3b82f6" fillOpacity={0.28} name="25–75th pct (mid 50%)"/>
                    <Area type="monotone" dataKey="band75_90" stackId="1" stroke="none" fill="#3b82f6" fillOpacity={0.15} name="75–90th pct"/>
                    <Line type="monotone" dataKey="p50" stroke="#1d4ed8" strokeWidth={3} dot={false} name="Median"/>
                  </ComposedChart>
                </PrintableChart>
                <p className="text-xs text-slate-500 mt-2 chart-caption">
                  The shaded fan shows where the portfolio lands across all simulations: the dark band is the middle 50% of
                  outcomes, the lighter bands stretch to the 10th and 90th percentiles. The solid line is the median path.
                </p>
              </div>

              {/* Depletion histogram */}
              {mcResults.depletionHisto.length > 0 && (
                <div className="avoid-break mc-histogram">
                  <h3 className="font-semibold text-slate-800 mb-2">When Money Ran Out (in the runs that fell short)</h3>
                  <PrintableChart screenHeight={220} printHeight={170}>
                    <BarChart data={mcResults.depletionHisto} margin={{left:40, right:20, top:5, bottom:5}}>
                      <CartesianGrid strokeDasharray="3 3"/>
                      <XAxis dataKey="label" tick={{fontSize: 12}}/>
                      <YAxis allowDecimals={false} width={50}/>
                      <Tooltip formatter={(v) => [`${v} runs`, 'Count']} labelFormatter={(l) => `Retirement years ${l}`}/>
                      <Bar dataKey="count" fill="#dc2626" radius={[4,4,0,0]}/>
                    </BarChart>
                  </PrintableChart>
                  <p className="text-xs text-slate-500 mt-2 chart-caption">
                    Grouped by 5-year band of retirement. Failures clustered early are the real warning sign — that's
                    sequence-of-returns risk biting. Failures only in the far-right bands mean the plan held up through the years that matter most.
                  </p>
                </div>
              )}

              <div className="text-xs text-slate-400 italic">
                Monte Carlo results are stochastic — re-running will give slightly different figures. More simulations = steadier numbers.
                This models market randomness on the growth buckets only; it is not a guarantee and does not constitute financial advice.
              </div>
            </div>
          )}
        </div>

        {/* =============== PRINT FOOTER =============== */}
        <div className="hidden print:block mt-6 text-xs text-slate-600">
          <p><strong>Prepared by Diligent Wealth Management</strong> • {new Date().toLocaleDateString('en-NZ')}</p>
          <p className="mt-2">CONFIDENTIAL — This document contains projections and should not be considered financial advice.</p>
        </div>

        {/* =============== ABOUT =============== */}
        <div className="mt-8 bg-slate-100 rounded-lg p-6 no-print">
          <h3 className="font-semibold text-slate-800 mb-2">About WealthGuard</h3>
          <p className="text-sm text-slate-600 mb-4">
            WealthGuard uses five distinct buckets to maximise growth potential while minimising sequencing risk.
            In retirement, day-to-day spending comes from <strong>Cash Savings</strong>, which is topped up from the
            <strong> Income Generator</strong> bucket on a quarterly basis. The Income Generator bucket is in turn
            replenished annually from <strong>Steady Growth</strong> and <strong>Strategic Long Term Growth</strong>, letting
            long-term assets continue compounding. <strong>Capital Preservation</strong> (Term Deposits) sits aside
            as a safety net, only drawn on in emergencies or during periods where the invested buckets are in
            a negative position.
          </p>
          <div className="border-t pt-4 mt-4 text-sm text-slate-500">
            <p className="font-semibold text-slate-700 mb-2">Diligent Wealth Management</p>
            <p>CONFIDENTIAL — For Diligent Wealth Management and client use only</p>
            <p className="mt-2">This document contains projections based on assumptions and should not be considered as financial advice.
            Past performance is not indicative of future results. Please consult with your financial advisor for personalised guidance.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
