import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { Download, Save, FolderOpen, Trash2, Plus, X, Sparkles, AlertTriangle } from 'lucide-react';

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

const BUCKET_META = [
  { key: 'cashSavings',        label: 'Cash Savings',          color: '#eab308', returnKey: 'cashSavings' },
  { key: 'termDeposit',        label: 'Capital Preservation',  color: '#f97316', returnKey: 'capitalPreservation' },
  { key: 'incomePortfolio',    label: 'Income Generator',      color: '#22c55e', returnKey: 'incomeGenerator' },
  { key: 'balancedPortfolio',  label: 'Steady Growth',         color: '#3b82f6', returnKey: 'steadyGrowth' },
  { key: 'growthPortfolio',    label: 'Strategic Growth',      color: '#a855f7', returnKey: 'strategicGrowth' }
];

const ACCUM_BUCKET_META = [
  { key: 'cashSavings',       label: 'Cash Savings',    color: '#eab308' },
  { key: 'balancedPortfolio', label: 'Steady Growth',   color: '#3b82f6' },
  { key: 'growthPortfolio',   label: 'Strategic Growth', color: '#a855f7' }
];

// =============================================================================
// SIMULATION
// =============================================================================

function runSimulation(params) {
  const {
    totalPortfolio, allocations, accumulationAllocations, returns,
    yearsUntilRetirement, projectionYears, annualContribution, annualIncome,
    accumulationLumpSums, retirementLumpSums,
    getSuperForYear, inflateSuper, cashMonths
  } = params;

  const data = [];

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
      'Strategic Growth':      Math.round(growth),
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
      if (annualContribution > 0) {
        cash     += annualContribution * (accumulationAllocations.cashSavings / 100);
        balanced += annualContribution * (accumulationAllocations.balancedPortfolio / 100);
        growth   += annualContribution * (accumulationAllocations.growthPortfolio / 100);
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

    // Apply returns
    cash     *= (1 + returns.cashSavings / 100);
    termDep  *= (1 + returns.capitalPreservation / 100);
    income   *= (1 + returns.incomeGenerator / 100);
    balanced *= (1 + returns.steadyGrowth / 100);
    growth   *= (1 + returns.strategicGrowth / 100);

    // Income drawdown
    if (isRetired) {
      const yearsInto = year - yearsUntilRetirement;
      const baseSuper = getSuperForYear(yearsInto);
      const yearSuper = inflateSuper ? baseSuper * Math.pow(1 + INFLATION_RATE, yearsInto) : baseSuper;
      const inflatedIncome = annualIncome * Math.pow(1 + INFLATION_RATE, yearsInto);
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
  const [currentInvestments, setCurrentInvestments] = useState([
    { id: 1, label: '', amount: 200000 },
    { id: 2, label: '', amount: 370000 },
    { id: 3, label: '', amount: 270763 }
  ]);
  const [cash, setCash]                 = useState(36000);
  const [termDeposits, setTermDeposits] = useState(120000);

  // --- Planning ---
  const [projectionYears, setProjectionYears] = useState(30);
  const [annualIncome, setAnnualIncome]       = useState(60000);
  const [contributionAmount, setContributionAmount]   = useState(0);
  const [contributionFrequency, setContributionFrequency] = useState('annual');

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
  const totalInvestments = currentInvestments.reduce((s, i) => s + i.amount, 0);
  const totalPortfolio   = cash + termDeposits + totalInvestments;
  const annualContribution =
    contributionFrequency === 'weekly'      ? contributionAmount * 52 :
    contributionFrequency === 'fortnightly' ? contributionAmount * 26 :
    contributionFrequency === 'monthly'     ? contributionAmount * 12 :
    contributionAmount;

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

  // --- Simulation ---
  const simulationParams = useMemo(() => ({
    totalPortfolio, allocations, accumulationAllocations, returns,
    yearsUntilRetirement, projectionYears, annualContribution,
    accumulationLumpSums, retirementLumpSums, getSuperForYear, inflateSuper,
    cashMonths: recSettings.cashMonths
  }), [totalPortfolio, allocations, accumulationAllocations, returns,
      yearsUntilRetirement, projectionYears, annualContribution,
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

  // --- Allocation dollar values ---
  const retirementAllocDollars = useMemo(() => ({
    cashSavings:      totalPortfolio * (allocations.cashSavings / 100),
    termDeposit:      totalPortfolio * (allocations.termDeposit / 100),
    incomePortfolio:  totalPortfolio * (allocations.incomePortfolio / 100),
    balancedPortfolio:totalPortfolio * (allocations.balancedPortfolio / 100),
    growthPortfolio:  totalPortfolio * (allocations.growthPortfolio / 100)
  }), [totalPortfolio, allocations]);

  const accumulationAllocDollars = useMemo(() => ({
    cashSavings:      totalPortfolio * (accumulationAllocations.cashSavings / 100),
    balancedPortfolio:totalPortfolio * (accumulationAllocations.balancedPortfolio / 100),
    growthPortfolio:  totalPortfolio * (accumulationAllocations.growthPortfolio / 100)
  }), [totalPortfolio, accumulationAllocations]);

  const totalAllocation = Object.values(allocations).reduce((a, b) => a + b, 0);
  const totalAccumulationAllocation = Object.values(accumulationAllocations).reduce((a, b) => a + b, 0);

  // --- Actions ---
  const addInvestment = () => setCurrentInvestments([...currentInvestments, { id: Date.now(), label: '', amount: 0 }]);
  const removeInvestment = (id) => { if (id > 2) setCurrentInvestments(currentInvestments.filter(i => i.id !== id)); };
  const updateInvestment = (id, field, value) => setCurrentInvestments(currentInvestments.map(i =>
    i.id === id ? { ...i, [field]: field === 'amount' ? (parseFloat(value) || 0) : value } : i));

  const updateAllocation = (k, v) => setAllocations(p => ({ ...p, [k]: parseFloat(v) || 0 }));
  const updateAccumulationAllocation = (k, v) => setAccumulationAllocations(p => ({ ...p, [k]: parseFloat(v) || 0 }));
  const updateReturn = (k, v) => setReturns(p => ({ ...p, [k]: parseFloat(v) || 0 }));
  const updateRecSetting = (k, v) => setRecSettings(p => ({ ...p, [k]: parseFloat(v) || 0 }));

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

  // Apply recommendation
  const applyRecommendation = () => {
    if (totalPortfolio <= 0 || annualIncome <= 0) return;
    const cashAmt = annualIncome * (recSettings.cashMonths / 12);
    const tdAmt   = annualIncome * recSettings.tdYears;
    const remaining = Math.max(0, totalPortfolio - cashAmt - tdAmt);

    const cashPct = Math.min(100, (cashAmt / totalPortfolio) * 100);
    const tdPct   = Math.min(100 - cashPct, (tdAmt / totalPortfolio) * 100);
    const remainingPct = Math.max(0, 100 - cashPct - tdPct);

    const invTotal = Math.max(0.1, recSettings.incomePct + recSettings.balancedPct + recSettings.growthPct);
    const incomePct   = remainingPct * (recSettings.incomePct   / invTotal);
    const balancedPct = remainingPct * (recSettings.balancedPct / invTotal);
    const growthPct   = remainingPct * (recSettings.growthPct   / invTotal);

    setAllocations({
      cashSavings:       Math.round(cashPct * 10) / 10,
      termDeposit:       Math.round(tdPct * 10) / 10,
      incomePortfolio:   Math.round(incomePct * 10) / 10,
      balancedPortfolio: Math.round(balancedPct * 10) / 10,
      growthPortfolio:   Math.round(growthPct * 10) / 10
    });
  };

  // Scenario management
  const snapshot = () => ({
    clientName, partnerName, clientAge, partnerAge, retirementAge,
    livingSituation, useGrossSuper, inflateSuper,
    currentInvestments, cash, termDeposits,
    projectionYears, annualIncome, contributionAmount, contributionFrequency,
    accumulationLumpSums, retirementLumpSums,
    allocations, accumulationAllocations, returns, recSettings
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
    setAccumulationLumpSums(s.accumulationLumpSums ?? []);
    setRetirementLumpSums(s.retirementLumpSums ?? []);
    setAllocations(s.allocations ?? allocations);
    setAccumulationAllocations(s.accumulationAllocations ?? accumulationAllocations);
    setReturns(s.returns ?? returns);
    setRecSettings(s.recSettings ?? recSettings);
  };

  const saveScenario = () => {
    const name = newScenarioName.trim() || clientName.trim() || `Scenario ${scenarios.length + 1}`;
    const scn = { id: 'scn_' + Date.now(), name, savedAt: new Date().toISOString(), data: snapshot() };
    persistScenarios([scn, ...scenarios]);
    setNewScenarioName('');
  };

  const loadScenario = (id) => {
    const scn = scenarios.find(s => s.id === id);
    if (scn) { restore(scn.data); setShowScenariosPanel(false); }
  };

  const deleteScenario = (id) => {
    if (confirm('Delete this scenario?')) persistScenarios(scenarios.filter(s => s.id !== id));
  };

  const generatePDF = () => window.print();

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

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-8">
      <style>{`
        @media print {
          @page { margin: 1cm; size: A4; }
          body { margin: 0; padding: 0; }
          .no-print { display: none !important; }
          .page-break { page-break-before: always; }
          .avoid-break { page-break-inside: avoid; }
        }
      `}</style>

      <div className="max-w-7xl mx-auto">
        {/* =============== HEADER =============== */}
        <div className="bg-white rounded-lg shadow-lg p-6 md:p-8 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-6 flex-wrap">
              <img src="https://www.diligentwealth.co.nz/s/WealthGuard-Logo.jpg" alt="WealthGuard" className="h-20 md:h-28 w-auto"
                crossOrigin="anonymous"
                onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'flex'; }}/>
              <div style={{display:'none'}} className="flex flex-col items-center justify-center h-28 px-8 bg-gradient-to-r from-amber-500 to-blue-900 rounded-lg">
                <div className="text-white text-2xl font-bold tracking-wider">WEALTHGUARD</div>
                <div className="text-white text-xs mt-1">Investment Bucketing Strategy</div>
              </div>
              <div className="h-16 w-px bg-slate-300 hidden md:block"></div>
              <img src="https://www.diligentwealth.co.nz/s/Diligent-Logo-Main.png" alt="Diligent" className="h-12 md:h-16 w-auto"
                crossOrigin="anonymous"
                onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'flex'; }}/>
              <div style={{display:'none'}} className="flex items-center gap-2 h-16">
                <div className="w-14 h-14 bg-gradient-to-br from-amber-500 to-amber-600 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-2xl">D</span>
                </div>
                <span className="text-4xl font-bold text-slate-800">diligent</span>
              </div>
            </div>
            <div className="flex gap-2 no-print">
              <button onClick={() => setShowScenariosPanel(!showScenariosPanel)}
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
            <div className="flex gap-2 mb-4">
              <input type="text" value={newScenarioName} onChange={(e) => setNewScenarioName(e.target.value)}
                placeholder={clientName ? `Save as "${clientName}"...` : 'Scenario name...'}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-md"/>
              <button onClick={saveScenario}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-semibold">
                <Save size={16}/> Save Current
              </button>
            </div>
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
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6 avoid-break">
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
              <label className="block text-sm font-medium text-slate-700 mb-1">Super at Retirement</label>
              <div className="w-full px-3 py-2 bg-slate-100 border rounded-md font-medium">
                ${superAtRetirement.toLocaleString()}/yr
              </div>
            </div>
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
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6 no-print">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Current Investments</h2>
          <div className="space-y-4 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Cash</label>
                <input type="number" value={cash} onChange={(e) => setCash(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Term Deposits</label>
                <input type="number" value={termDeposits} onChange={(e) => setTermDeposits(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"/>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{clientName || 'Client'} KiwiSaver</label>
                <input type="number" value={currentInvestments.find(i => i.id === 1)?.amount || 0}
                  onChange={(e) => updateInvestment(1, 'amount', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"/>
              </div>
              {isJoint && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{partnerName || 'Partner'} KiwiSaver</label>
                  <input type="number" value={currentInvestments.find(i => i.id === 2)?.amount || 0}
                    onChange={(e) => updateInvestment(2, 'amount', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md"/>
                </div>
              )}
            </div>
            {currentInvestments.filter(i => i.id > 2).map((inv) => (
              <div key={inv.id} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input type="text" value={inv.label} onChange={(e) => updateInvestment(inv.id, 'label', e.target.value)}
                  placeholder="Investment name" className="w-full px-3 py-2 border border-slate-300 rounded-md"/>
                <div className="flex gap-2">
                  <input type="number" value={inv.amount} onChange={(e) => updateInvestment(inv.id, 'amount', e.target.value)}
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

        {/* =============== RETIREMENT PLANNING =============== */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6 no-print">
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
              <input type="number" value={annualIncome}
                onChange={(e) => setAnnualIncome(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Regular Contribution</label>
              <input type="number" value={contributionAmount}
                onChange={(e) => setContributionAmount(parseFloat(e.target.value) || 0)}
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
              <div><strong>Annual contribution:</strong> ${annualContribution.toLocaleString()}</div>
              <div><strong>Drawdown from portfolio:</strong> ${Math.max(0, annualIncome - superAtRetirement).toLocaleString()}/yr</div>
            </div>
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
                        <input type="number" value={ls.amount}
                          onChange={(e) => updateAccumLumpSum(ls.id, 'amount', e.target.value)}
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
                        <input type="number" value={ls.amount}
                          onChange={(e) => updateRetireLumpSum(ls.id, 'amount', e.target.value)}
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
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex flex-wrap items-center justify-between mb-4 gap-2">
            <h2 className="text-xl font-bold text-slate-800">
              Retirement Phase Allocation
              <span className={`text-sm font-normal ml-2 ${Math.abs(totalAllocation - 100) > 0.1 ? 'text-red-600' : 'text-slate-500'}`}>
                ({totalAllocation.toFixed(1)}%)
              </span>
            </h2>
            <button onClick={applyRecommendation}
              className="no-print flex items-center gap-2 px-3 py-2 bg-amber-500 text-white rounded-md hover:bg-amber-600 text-sm font-semibold shadow">
              <Sparkles size={16}/> Apply Recommendation
            </button>
          </div>

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
                  Cash ≈ ${(annualIncome * recSettings.cashMonths / 12).toLocaleString(undefined, {maximumFractionDigits: 0})} •
                  TD ≈ ${(annualIncome * recSettings.tdYears).toLocaleString(undefined, {maximumFractionDigits: 0})}
                </p>
              </div>
            </div>

            {/* Pie chart */}
            <div className="flex items-center justify-center">
              {retirementPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie data={retirementPieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                      outerRadius={100} innerRadius={45}
                      label={({percent}) => percent > 0.03 ? `${(percent * 100).toFixed(0)}%` : ''}>
                      {retirementPieData.map((entry, i) => <Cell key={i} fill={entry.color}/>)}
                    </Pie>
                    <Tooltip formatter={(v) => `$${v.toLocaleString()}`}/>
                    <Legend verticalAlign="bottom" height={36} wrapperStyle={{fontSize: '12px'}}/>
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-slate-400 text-sm italic">Enter allocations to see chart</div>
              )}
            </div>
          </div>
        </div>

        {/* =============== ACCUMULATION ALLOCATION + PIE (if applicable) =============== */}
        {yearsUntilRetirement > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h2 className="text-xl font-bold text-slate-800 mb-4">
              Accumulation Phase Allocation
              <span className={`text-sm font-normal ml-2 ${Math.abs(totalAccumulationAllocation - 100) > 0.1 ? 'text-red-600' : 'text-slate-500'}`}>
                ({totalAccumulationAllocation.toFixed(1)}%)
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
              </div>

              {/* Pie chart */}
              <div className="flex items-center justify-center">
                {accumulationPieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <PieChart>
                      <Pie data={accumulationPieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                        outerRadius={100} innerRadius={45}
                        label={({percent}) => percent > 0.03 ? `${(percent * 100).toFixed(0)}%` : ''}>
                        {accumulationPieData.map((entry, i) => <Cell key={i} fill={entry.color}/>)}
                      </Pie>
                      <Tooltip formatter={(v) => `$${v.toLocaleString()}`}/>
                      <Legend verticalAlign="bottom" height={36} wrapperStyle={{fontSize: '12px'}}/>
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-slate-400 text-sm italic">Enter allocations to see chart</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* =============== RETURNS =============== */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6 no-print">
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
        </div>

        {/* =============== MAX SUSTAINABLE DRAWDOWN =============== */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-lg shadow-lg p-6 mb-6 text-white avoid-break">
          <h2 className="text-xl font-bold mb-3">Maximum Sustainable Income</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-xs opacity-80 uppercase tracking-wider">Max sustainable income</div>
              <div className="text-3xl font-bold mt-1">${maxSustainableIncome.toLocaleString()}<span className="text-lg font-normal">/yr</span></div>
              <div className="text-xs opacity-80 mt-1">Portfolio depleted at end of year {projectionYears}</div>
            </div>
            <div>
              <div className="text-xs opacity-80 uppercase tracking-wider">Implied first-year drawdown</div>
              <div className="text-3xl font-bold mt-1">${maxSustainableDrawdown.toLocaleString()}<span className="text-lg font-normal">/yr</span></div>
              <div className="text-xs opacity-80 mt-1">After ${superAtRetirement.toLocaleString()} super</div>
            </div>
            <div>
              <div className="text-xs opacity-80 uppercase tracking-wider">Your target income</div>
              <div className="text-3xl font-bold mt-1">${annualIncome.toLocaleString()}<span className="text-lg font-normal">/yr</span></div>
              <div className={`text-xs mt-1 font-semibold flex items-center gap-1 ${annualIncome <= maxSustainableIncome ? 'text-green-300' : 'text-amber-300'}`}>
                {annualIncome <= maxSustainableIncome
                  ? `✓ Sustainable (${((annualIncome / maxSustainableIncome) * 100).toFixed(0)}% of max)`
                  : <><AlertTriangle size={14}/> Exceeds sustainable level</>}
              </div>
            </div>
          </div>
          <p className="text-xs opacity-75 mt-4">
            Calculated via binary search, using the same simulation as the charts. Income and super inflate at 2% p.a.{inflateSuper ? '' : ' (super inflation currently disabled — will understate sustainability)'}.
          </p>
        </div>

        {/* =============== PRINT-ONLY SUMMARIES =============== */}
        <div className="hidden print:block avoid-break mb-6">
          <h3 className="text-lg font-bold mb-3">Current Portfolio</h3>
          <table className="w-full text-sm border-collapse">
            <tbody>
              <tr className="border-b"><td className="py-1">Cash</td><td className="text-right">${cash.toLocaleString()}</td></tr>
              <tr className="border-b"><td className="py-1">Term Deposits</td><td className="text-right">${termDeposits.toLocaleString()}</td></tr>
              <tr className="border-b"><td className="py-1">{clientName} KiwiSaver</td><td className="text-right">${(currentInvestments[0]?.amount || 0).toLocaleString()}</td></tr>
              {isJoint && <tr className="border-b"><td className="py-1">{partnerName} KiwiSaver</td><td className="text-right">${(currentInvestments[1]?.amount || 0).toLocaleString()}</td></tr>}
              {currentInvestments.filter(i => i.id > 2).map(inv => (
                <tr key={inv.id} className="border-b"><td className="py-1">{inv.label || 'Investment'}</td><td className="text-right">${inv.amount.toLocaleString()}</td></tr>
              ))}
              <tr className="font-bold border-t-2"><td className="py-2">Total</td><td className="text-right">${totalPortfolio.toLocaleString()}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="hidden print:block page-break"></div>

        {/* =============== PORTFOLIO GROWTH CHART =============== */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6 avoid-break">
          <h2 className="text-xl font-bold mb-4">Portfolio Projection</h2>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={projectionData} margin={{left:40, right:20, top:5, bottom:5}}>
              <CartesianGrid strokeDasharray="3 3"/>
              <XAxis dataKey="year" label={{value: 'Years from now', position: 'insideBottom', offset: -5}}/>
              <YAxis tickFormatter={(v) => `$${(v/1000).toLocaleString()}k`} width={80}/>
              <Tooltip formatter={(v) => `$${v.toLocaleString()}`}/>
              <Legend/>
              <Line type="monotone" dataKey="Total" stroke="#1f2937" strokeWidth={3} dot={false}/>
              <Line type="monotone" dataKey="Cash Savings" stroke="#eab308" strokeWidth={2} dot={false}/>
              <Line type="monotone" dataKey="Capital Preservation" stroke="#f97316" strokeWidth={2} dot={false}/>
              <Line type="monotone" dataKey="Income Generator" stroke="#22c55e" strokeWidth={2} dot={false}/>
              <Line type="monotone" dataKey="Steady Growth" stroke="#3b82f6" strokeWidth={2} dot={false}/>
              <Line type="monotone" dataKey="Strategic Growth" stroke="#a855f7" strokeWidth={2} dot={false}/>
            </LineChart>
          </ResponsiveContainer>
          {yearsUntilRetirement > 0 && (
            <p className="text-xs mt-2 text-slate-500 no-print">
              Accumulation phase: years 0–{yearsUntilRetirement - 1}. Retirement phase begins year {yearsUntilRetirement}.
            </p>
          )}
        </div>

        {/* =============== INCOME DRAWDOWN CHART =============== */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6 avoid-break">
          <h2 className="text-xl font-bold mb-4">Income Drawdown</h2>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={drawdownChartData} margin={{left:40, right:20, top:5, bottom:5}}>
              <CartesianGrid strokeDasharray="3 3"/>
              <XAxis dataKey="year"/>
              <YAxis tickFormatter={(v) => `$${(v/1000).toLocaleString()}k`} width={80}/>
              <Tooltip formatter={(v) => `$${v.toLocaleString()}`}/>
              <Legend/>
              <Line type="monotone" dataKey="Required Drawdown" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 4" dot={false}/>
              <Line type="monotone" dataKey="Annual Drawdown" stroke="#dc2626" strokeWidth={2} dot={false}/>
              <Line type="monotone" dataKey="Cumulative Drawdown" stroke="#7c3aed" strokeWidth={3} dot={false}/>
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs mt-3 text-slate-500 no-print">
            Required = income gap needed each year. Annual = what the portfolio was actually able to provide (capped if funds run out). Both income and super inflate at 2% p.a.
          </p>
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
            replenished annually from <strong>Steady Growth</strong> and <strong>Strategic Growth</strong>, letting
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