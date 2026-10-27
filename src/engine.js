import { newRecoveryState, runQuarterlyYear, quarterlyLumpWithdrawal } from './quarterlyRules.js';
// WealthGuard annual cash-flow model. Monetary inputs are NZD.
export const INFLATION_RATE = 0.02;
const DEFAULT_VOLATILITIES = { incomeGenerator: 6, steadyGrowth: 10, strategicGrowth: 14 };
export function normaliseAllocations(obj) {
  const out = Object.fromEntries(Object.entries(obj).map(([k,v]) => [k, Number.isFinite(v) ? Math.max(0,v) : 0]));
  const sum = Object.values(out).reduce((a,b) => a+b, 0);
  if (!sum) return Object.fromEntries(Object.keys(out).map(k => [k, k === 'cashSavings' ? 100 : 0]));
  return Object.fromEntries(Object.entries(out).map(([k,v]) => [k, v * 100 / sum]));
}
export function isPlanFunded(data, legacyTarget = 0) {
  return data.length > 0 && data.every(d => d.shortfall <= 0.01 && d.lumpSumShortfall <= 0.01) &&
    data[data.length-1].totalExact + 0.01 >= Math.max(0, legacyTarget);
}
export function solveMaxIncome(params, legacyTarget = 0) {
  if (params.projectionYears <= 0 || !isPlanFunded(runSimulation({...params, annualIncome:0}), legacyTarget)) return 0;
  let low = 0, high = Math.max(500000, params.totalPortfolio);
  for (let i=0; i<30 && isPlanFunded(runSimulation({...params, annualIncome:high}), legacyTarget); i++) high *= 2;
  for (let i=0; i<50; i++) {
    const mid = (low+high)/2;
    if (isPlanFunded(runSimulation({...params, annualIncome:mid}), legacyTarget)) low=mid; else high=mid;
  }
  return Math.floor(low); // Do not round above a feasible ceiling.
}
export function retirementTimeline(clientYears, partnerYears, isJoint) {
  return { first: isJoint ? Math.min(clientYears, partnerYears) : clientYears,
    full: isJoint ? Math.max(clientYears, partnerYears) : clientYears };
}
export function makeKiwiSaverPools(holdings, clientAge, partnerAge, isJoint, clientYears, partnerYears, annualClient, annualPartner) {
  return [{id:1, age:clientAge, contributionYears:clientYears, annualContribution:annualClient},
    ...(isJoint ? [{id:2, age:partnerAge, contributionYears:partnerYears, annualContribution:annualPartner}] : [])]
    .map(k => ({...k, amount:holdings.find(h => h.id === k.id)?.amount || 0, yearsUntilAccess:Math.max(0,65-k.age)}));
}
export function runSimulation(params) {
  const {
    totalPortfolio, allocations: rawAllocations, accumulationAllocations: rawAccumulationAllocations, returns,
    accumulationReturns, stochastic = false, volatilities = DEFAULT_VOLATILITIES,
    mcAccumulationEnabled = false, downYearThreshold = 0, lockedKiwiSaver = [],
    yearsUntilRetirement, projectionYears, annualContribution, annualIncome,
    clientWorkingIncome = 0, partnerWorkingIncome = 0,
    // Per-person retirement timing: each person's KiwiSaver stops at THEIR OWN
    // retirement year, not the household's (later-of-two) year. Defaulting both to
    // yearsUntilRetirement keeps old callers (single-date scenarios) unaffected.
    yearsUntilClientRetirement = yearsUntilRetirement, yearsUntilPartnerRetirement = yearsUntilRetirement,
    annualKsClient = 0, annualKsPartner = 0,
    incomeReductionEnabled = false, incomeReductionAfterYears = 15, incomeReductionPercent = 20,
    agedCareEnabled = false, agedCareStartYear = 10, agedCareAnnualCost = 0, agedCareDurationYears = 0,
    badFirstYearEnabled = false, badFirstYearShockPercent = -20,
    accumulationLumpSums = [], retirementLumpSums = [],
    getSuperForYear, inflateSuper, cashMonths, cashflowMode = 'annual'
  } = params;

  if (!Number.isInteger(yearsUntilRetirement) || yearsUntilRetirement < 0 || yearsUntilRetirement > 120 ||
      !Number.isInteger(projectionYears) || projectionYears < 1 || projectionYears > 120) throw new Error('Invalid projection duration.');
  for (const v of [totalPortfolio, annualIncome, annualContribution]) if (!Number.isFinite(v) || v < 0) throw new Error('Invalid cash-flow amount.');
  if (!['annual','quarterly'].includes(cashflowMode)) throw new Error('Invalid cash-flow model.');
  const quarterly = cashflowMode === 'quarterly';
  const recovery = newRecoveryState();
  let termTarget = 0;
  const data = [];

  // Normalise allocations so the FULL portfolio is always deployed, treating the
  // entered percentages as relative weights. This prevents the headline figures
  // from silently running on a wrong base when the inputs don't sum to exactly 100%.
  // (A visible warning is shown in the UI when the entered total isn't 100%.)
  const allocations = normaliseAllocations(rawAllocations);
  const accumulationAllocations = normaliseAllocations(rawAccumulationAllocations);
  const locked = lockedKiwiSaver.filter(k => k.yearsUntilAccess > 0 || (quarterly && k.amount > 0)).map(k => ({ ...k }));
  let beforeFirstRetirement = yearsUntilRetirement > 0;
  const earlyReleased = {income:0,balanced:0,growth:0};
  const lockedTotal = () => locked.reduce((sum, k) => sum + k.amount, 0);
  const accessibleInitial = Math.max(0, totalPortfolio - lockedTotal());
  let allocationBaseTotal = accessibleInitial;
  // Initial bucket allocation — use accumulation if pre-retirement, else retirement
  let cash, termDep, income, balanced, growth;
  if (yearsUntilRetirement > 0) {
    cash     = accessibleInitial * (accumulationAllocations.cashSavings / 100);
    balanced = accessibleInitial * (accumulationAllocations.balancedPortfolio / 100);
    growth   = accessibleInitial * (accumulationAllocations.growthPortfolio / 100);
    termDep  = 0;
    income   = 0;
  } else {
    cash     = accessibleInitial * (allocations.cashSavings / 100);
    termDep  = accessibleInitial * (allocations.termDeposit / 100);
    income   = accessibleInitial * (allocations.incomePortfolio / 100);
    balanced = accessibleInitial * (allocations.balancedPortfolio / 100);
    growth   = accessibleInitial * (allocations.growthPortfolio / 100);
  }

  const totalDuration = yearsUntilRetirement + projectionYears;
  let cumulativeDrawdown = 0;
  // Income bucket target — set at retirement start from the initial retirement allocation
  // This is the level we refill Income back up to from Balanced/Growth annually
  let incomeTarget = (yearsUntilRetirement === 0)
    ? accessibleInitial * (allocations.incomePortfolio / 100)
    : 0;

  termTarget = termDep;

  // Pull `amount` proportionally from Balanced and Growth, return actual amount drawn
  const takeFromBalancedGrowth = (amount) => {
    if (amount <= 0) return 0;
    const combined = balanced + growth;
    if (combined <= 0) return 0;
    const fromB = Math.min(balanced, amount * (balanced / combined));
    const fromG = Math.min(growth,   amount * (growth   / combined));
    if(quarterly && beforeFirstRetirement) {
      if(balanced>0) earlyReleased.balanced-=fromB*earlyReleased.balanced/balanced;
      if(growth>0) earlyReleased.growth-=fromG*earlyReleased.growth/growth;
    }
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

  // Down-market cascade: Cash → TD (protect growth) → Income → B+G (last resort).
  // Used for the "bad first year" stress test — funds the first year of retirement
  // from the safe buckets so growth assets aren't sold right after a market drop.
  const retireCascadeDown = (need) => {
    let remaining = need;
    if (remaining <= 0) return 0;
    const fromCash = Math.min(cash, remaining);
    cash -= fromCash; remaining -= fromCash;
    if (remaining > 0) {
      const fromTD = Math.min(termDep, remaining);
      termDep -= fromTD; remaining -= fromTD;
    }
    if (remaining > 0) {
      const fromIncome = Math.min(income, remaining);
      income -= fromIncome; remaining -= fromIncome;
    }
    if (remaining > 0) {
      const drawn = takeFromBalancedGrowth(remaining);
      remaining -= drawn;
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
    if(quarterly && remaining>0) {
      const paid=Math.min(income,remaining);
      if(income>0) earlyReleased.income-=paid*earlyReleased.income/income;
      income-=paid;remaining-=paid;
    }
    if (remaining > 0) remaining -= takeFromBalancedGrowth(remaining);
    return need - remaining;
  };

  const releaseKiwiSaver = (year) => {
      for(const k of locked) {
        if(year>=k.yearsUntilAccess && k.amount>0) {
          if(quarterly) {
            const third=k.amount/3;
            income+=third;balanced+=third;growth+=third;incomeTarget+=third;
            if(beforeFirstRetirement) for(const key of Object.keys(earlyReleased))earlyReleased[key]+=third;
          } else {
            const weights=year<yearsUntilRetirement ? accumulationAllocations : allocations;
            cash+=k.amount*weights.cashSavings/100;
            balanced+=k.amount*weights.balancedPortfolio/100;
            growth+=k.amount*weights.growthPortfolio/100;
            if(year>=yearsUntilRetirement) {
              termDep+=k.amount*weights.termDeposit/100;
              income+=k.amount*weights.incomePortfolio/100;
              incomeTarget+=k.amount*weights.incomePortfolio/100;
            }
          }
          k.amount=0;
        }
      }
    };

  for (let year = 0; year <= totalDuration; year++) {
    // Legacy keeps its original ordering; quarterly releases after retirement
    // reallocation so an unlock in the same year retains the equal-third split.
    beforeFirstRetirement=year<yearsUntilRetirement;
    if(!quarterly)releaseKiwiSaver(year);
    // At retirement: redistribute buckets into retirement allocation
    if (year === yearsUntilRetirement && yearsUntilRetirement > 0) {
      const preserved=quarterly ? earlyReleased : {income:0,balanced:0,growth:0};
      const total = cash + termDep + income + balanced + growth - preserved.income - preserved.balanced - preserved.growth;
      allocationBaseTotal = total;
      cash     = total * (allocations.cashSavings / 100);
      termDep  = total * (allocations.termDeposit / 100);
      income   = total * (allocations.incomePortfolio / 100) + preserved.income;
      balanced = total * (allocations.balancedPortfolio / 100) + preserved.balanced;
      growth   = total * (allocations.growthPortfolio / 100) + preserved.growth;
      incomeTarget = income;
      termTarget = termDep;
    }

    if(quarterly)releaseKiwiSaver(year);

    // Record this year's opening state
    const entry = {
      year,
      ...(quarterly ? {allocationBaseTotal,bucketBalances:{cashSavings:cash,termDeposit:termDep,incomePortfolio:income,balancedPortfolio:balanced,growthPortfolio:growth}} : {}),
      'Cash Savings':          Math.round(cash),
      'Capital Preservation':  Math.round(termDep),
      'Income Generator':      Math.round(income),
      'Steady Growth':         Math.round(balanced),
      'Strategic Long Term Growth':      Math.round(growth),
      Total:                   Math.round(cash + termDep + income + balanced + growth + lockedTotal()),
      totalExact: cash + termDep + income + balanced + growth + lockedTotal(),
      accessibleTotal: cash + termDep + income + balanced + growth,
      lockedKiwiSaver: lockedTotal(), shortfall: 0, lumpSumShortfall: 0,
      drawdownRequired: 0,
      drawdownActual:   0,
      cumulativeDrawdown: Math.round(cumulativeDrawdown),
      employmentIncome: 0,
      superIncome: 0
    };

    if (year >= totalDuration) { data.push(entry); break; }

    const isRetired = year >= yearsUntilRetirement;
    const yearsIntoRetirement = isRetired ? year - yearsUntilRetirement : -1;
    // The "bad first year" stress test shocks growth returns and protects growth via
    // the down-year cascade only in the very first year of retirement.
    const isShockYear = badFirstYearEnabled && isRetired && yearsIntoRetirement === 0;

    // Contributions & lump sums during accumulation
    if (!isRetired) {
      // Regular contribution (stops at retirement)
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
            entry.lumpSumShortfall += -amt - accumWithdraw(-amt);
          }
        }
      }
    } else {
      const yearsInto = year - yearsUntilRetirement;
      for (const ls of retirementLumpSums) {
        if (ls.yearFromRetirement === yearsInto && ls.amount) {
          if (ls.type === 'withdrawal') {
            if (quarterly) {
              const state = {cash,termDep,income,balanced,growth};
              entry.lumpSumShortfall += ls.amount - quarterlyLumpWithdrawal(state,recovery,ls.amount);
              ({cash,termDep,income,balanced,growth} = state);
            } else entry.lumpSumShortfall += ls.amount - retireCascade(ls.amount);
          } else {
            // Deposit split by retirement allocation
            cash     += ls.amount * (allocations.cashSavings / 100);
            termDep  += ls.amount * (allocations.termDeposit / 100);
            income   += ls.amount * (allocations.incomePortfolio / 100);
            balanced += ls.amount * (allocations.balancedPortfolio / 100);
            growth   += ls.amount * (allocations.growthPortfolio / 100);
            if (quarterly) {
              incomeTarget += ls.amount * allocations.incomePortfolio / 100;
              termTarget += ls.amount * allocations.termDeposit / 100;
            }
          }
        }
      }
    }

    // Accessible KiwiSaver contributions continue while their owner is working,
    // even after the other person retires. Locked contributions are handled below.
    const ksThisYear = lockedKiwiSaver.length ? lockedKiwiSaver.filter(k => year >= k.yearsUntilAccess && year < k.contributionYears).reduce((sum,k) => sum+k.annualContribution,0) :
      (year < yearsUntilClientRetirement ? annualKsClient : 0) + (year < yearsUntilPartnerRetirement ? annualKsPartner : 0);
    if (ksThisYear > 0) {
      const weights = isRetired ? allocations : accumulationAllocations;
      if(quarterly) {
        const third=ksThisYear/3;
        income+=third;balanced+=third;growth+=third;incomeTarget+=third;
        if(beforeFirstRetirement)for(const key of Object.keys(earlyReleased))earlyReleased[key]+=third;
      } else {
        cash += ksThisYear * weights.cashSavings / 100;
        balanced += ksThisYear * weights.balancedPortfolio / 100;
        growth += ksThisYear * weights.growthPortfolio / 100;
        if (isRetired) {
          termDep += ksThisYear * weights.termDeposit / 100;
          income += ksThisYear * weights.incomePortfolio / 100;
        }
      }
    }

    // Apply returns — accumulation phase uses its own return assumptions,
    // retirement phase uses the retirement-strategy returns. In the "bad first year"
    // shock year, growth buckets get the shock return instead of their expected one;
    // Cash, Capital Preservation and Income Generator are unaffected (matching the
    // Monte Carlo engine's treatment of a down year).
    const accRet = accumulationReturns || {
      cashSavings: returns.cashSavings, balancedPortfolio: returns.steadyGrowth, growthPortfolio: returns.strategicGrowth
    };
    const z = stochastic ? randn() : 0;
    const volatilityOn = stochastic && (isRetired || mcAccumulationEnabled);
    const balancedReturnPct = isShockYear ? badFirstYearShockPercent :
      (isRetired ? returns.steadyGrowth : accRet.balancedPortfolio) +
      (volatilityOn ? volatilities.steadyGrowth * z : 0);
    const growthReturnPct = isShockYear ? badFirstYearShockPercent :
      (isRetired ? returns.strategicGrowth : accRet.growthPortfolio) +
      (volatilityOn ? volatilities.strategicGrowth * z : 0);
    const incomeReturnPct = returns.incomeGenerator + (stochastic && isRetired ?
      volatilities.incomeGenerator * (0.5 * z + Math.sqrt(0.75) * randn()) : 0);
    const grow = (amount, pct) => amount * Math.max(0, 1 + pct / 100);
    if (!quarterly || !isRetired) {
    cash = grow(cash, isRetired ? returns.cashSavings : accRet.cashSavings);
    termDep = grow(termDep, returns.capitalPreservation);
    income = grow(income, incomeReturnPct);
    balanced = grow(balanced, balancedReturnPct);
    growth = grow(growth, growthReturnPct);
    }
    if(quarterly && beforeFirstRetirement) {
      earlyReleased.income=grow(earlyReleased.income,incomeReturnPct);
      earlyReleased.balanced=grow(earlyReleased.balanced,balancedReturnPct);
      earlyReleased.growth=grow(earlyReleased.growth,growthReturnPct);
    }
    for (const k of locked) {
      if (year < k.yearsUntilAccess) {
        if (year < k.contributionYears) k.amount += k.annualContribution;
        // Locked holdings retain the selected accumulation strategy until access.
        const ksReturn = accRet.cashSavings * accumulationAllocations.cashSavings / 100 +
          (accRet.balancedPortfolio + (volatilityOn ? volatilities.steadyGrowth * z : 0)) * accumulationAllocations.balancedPortfolio / 100 +
          (accRet.growthPortfolio + (volatilityOn ? volatilities.strategicGrowth * z : 0)) * accumulationAllocations.growthPortfolio / 100;
        k.amount = grow(k.amount, ksReturn);

      }
    }
    const isDownYear = isRetired && (isShockYear || Math.min(balancedReturnPct, growthReturnPct) < downYearThreshold);

    // Income drawdown
    if (isRetired) {
      const yearsInto = yearsIntoRetirement;
      const baseSuper = getSuperForYear(yearsInto);
      const yearSuper = inflateSuper ? baseSuper * Math.pow(1 + INFLATION_RATE, year) : baseSuper;

      // Apply step-down reduction to required income if enabled (e.g. 20% less after year 15)
      const reductionFactor = (incomeReductionEnabled && yearsInto >= incomeReductionAfterYears)
        ? (1 - incomeReductionPercent / 100)
        : 1;
      const effectiveIncome = annualIncome * reductionFactor;
      const inflatedIncome = effectiveIncome * Math.pow(1 + INFLATION_RATE, year);

      // Aged care: an additional cost from a chosen year of retirement, inflated the
      // same way as income, for a set duration (0 = ongoing for the rest of the plan).
      const agedCareActive = agedCareEnabled && yearsInto >= agedCareStartYear &&
        (agedCareDurationYears <= 0 || yearsInto < agedCareStartYear + agedCareDurationYears);
      const inflatedAgedCare = agedCareActive
        ? agedCareAnnualCost * Math.pow(1 + INFLATION_RATE, year)
        : 0;

      const workingIncomeToday = (year < yearsUntilClientRetirement ? clientWorkingIncome : 0) +
        (year < yearsUntilPartnerRetirement ? partnerWorkingIncome : 0);
      const employmentIncome = workingIncomeToday * Math.pow(1 + INFLATION_RATE, year);
      const drawdownNeeded = Math.max(0, inflatedIncome + inflatedAgedCare - yearSuper - employmentIncome);
      entry.employmentIncome = Math.round(employmentIncome);

      let actual;
      if (quarterly) {
        const result=runQuarterlyYear({state:{cash,termDep,income,balanced,growth},recovery,
          annualReturns:{cash:returns.cashSavings,termDep:returns.capitalPreservation,
            income:incomeReturnPct,balanced:balancedReturnPct,growth:growthReturnPct},
          annualNeed:drawdownNeeded,incomeTarget,termTarget,record:!stochastic});
        ({cash,termDep,income,balanced,growth}=result.state);
        actual=result.actual;
        entry.quarters=result.quarters;
        entry.incomeRefill=result.incomeRefill;
        entry.termRefill=result.termRefill;
      } else {
      // 1. Draw expenses through the cascade — protective (down-year) cascade in the
      // shock year, normal cascade otherwise (Cash → Income → B+G → TD).
      actual = isDownYear ? retireCascadeDown(drawdownNeeded) : retireCascade(drawdownNeeded);

      // 2. Replenish Cash to target from Income, then B+G (not TD) — skipped in the
      // shock year so growth isn't touched to top up cash right after a market drop.
      if (!isDownYear) {
        const cashTarget = inflatedIncome * (cashMonths / 12);
        refillCash(cashTarget);
        // 3. Replenish Income to target from B+G (not TD)
        refillIncome(incomeTarget);
      }

      }

      entry.shortfall = Math.max(0, drawdownNeeded - actual);
      if (quarterly && entry.shortfall < 1e-7) entry.shortfall = 0;
      cumulativeDrawdown += actual;
      entry.drawdownRequired = Math.round(drawdownNeeded);
      entry.drawdownActual   = Math.round(actual);
      entry.superIncome      = Math.round(yearSuper);
      entry.agedCareCost     = Math.round(inflatedAgedCare);
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

export function runMonteCarloPath(params) {
  const data = runSimulation({ ...params, stochastic: true });
  const failed = data.find(d => d.shortfall > 0.01 || d.lumpSumShortfall > 0.01);
  const final = data[data.length - 1];
  const legacyMet = final.totalExact + 0.01 >= Math.max(0, params.legacyTarget || 0);
  return { totals: data.map(d => d.Total), survived: !failed && legacyMet,
    depletionYear: failed ? failed.year : (!legacyMet ? final.year : null) };
}

export function runMonteCarlo(params, numSims) {
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


export function annualKiwiSaver(salary, employeePct, employerPct, esctOverride = null) {
  const base = salary * (1 + employerPct / 100);
  const esct = esctOverride ?? (base <= 18720 ? 10.5 : base <= 64200 ? 17.5 : base <= 93720 ? 30 : base <= 216000 ? 33 : 39);
  return salary * (employeePct + employerPct * (1-esct/100)) / 100;
}
