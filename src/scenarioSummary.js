import { runSimulation, solveMaxIncome, makeKiwiSaverPools, annualKiwiSaver, retirementTimeline, isPlanFunded } from './engine.js';
export const SUPER_RATES_NET_M = {
  single_alone: 1110.30,        // Live alone or with a dependent child
  single_shared: 1024.90,       // Live with someone 18+
  couple_both_each: 854.08,     // Each - both meet criteria
  couple_one: 854.08            // Only one meets criteria
};
export const SUPER_RATES_GROSS = {
  single_alone: 1294.74,
  single_shared: 1191.14,
  couple_both_each: 984.28,
  couple_one: 984.28
};

export function computeScenarioSummary(data) {
  const d = data || {};
  const clientAge = d.clientAge ?? 60;
  const partnerAge = d.partnerAge ?? 60;
  const retirementAge = d.retirementAge ?? 65;
  const isJoint = (d.partnerName || '').trim() !== '';
  const yearsUntilClientRetirement = Math.max(0, retirementAge - clientAge);
  // Back-compat: scenarios saved before per-person retirement ages existed have no
  // partnerRetirementAge field. Falling back to the client's retirement AGE (e.g. 65)
  // would silently change the household timeline for any couple with different current
  // ages. Instead, fall back to whatever age the partner will BE when the client
  // retires — that guarantees yearsUntilPartnerRetirement equals yearsUntilClientRetirement
  // in the fallback case, so old scenarios reproduce their original numbers exactly.
  const partnerRetirementAge = d.partnerRetirementAge ?? (partnerAge + yearsUntilClientRetirement);
  const yearsUntilPartnerRetirement = isJoint ? Math.max(0, partnerRetirementAge - partnerAge) : 0;
  const {first: yearsUntilRetirement, full: yearsUntilFullRetirement} = retirementTimeline(
    yearsUntilClientRetirement, yearsUntilPartnerRetirement, isJoint);
  const livingSituation = d.livingSituation ?? 'single_shared';
  const useGrossSuper = d.useGrossSuper ?? false;
  const inflateSuper = d.inflateSuper ?? true;

  const currentInvestments = d.currentInvestments ?? [];
  const totalInvestments = currentInvestments.filter(i => isJoint || i.id !== 2).reduce((s, i) => s + (i.amount || 0), 0);
  const totalPortfolio = (d.cash || 0) + (d.termDeposits || 0) + totalInvestments;

  const contributionAmount = d.contributionAmount || 0;
  const contributionFrequency = d.contributionFrequency || 'annual';
  const annualContribution =
    contributionFrequency === 'weekly' ? contributionAmount * 52 :
    contributionFrequency === 'fortnightly' ? contributionAmount * 26 :
    contributionFrequency === 'monthly' ? contributionAmount * 12 : contributionAmount;

  const ksEnabled = d.ksEnabled ?? false;
  const annualKsClient = ksEnabled
    ? annualKiwiSaver(d.clientSalary || 0, d.clientKsRate || 0, d.clientKsEmployer || 0, d.clientEsctRate)
    : 0;
  const annualKsPartner = ksEnabled && isJoint
    ? annualKiwiSaver(d.partnerSalary || 0, d.partnerKsRate || 0, d.partnerKsEmployer || 0, d.partnerEsctRate)
    : 0;

  const clientSuperIneligible = d.clientSuperIneligible ?? false;
  const partnerSuperIneligible = d.partnerSuperIneligible ?? false;
  const getSuperForYear = (yearsIntoRetirement) => {
    const cAge = clientAge + yearsUntilRetirement + yearsIntoRetirement;
    const pAge = partnerAge + yearsUntilRetirement + yearsIntoRetirement;
    const cEligible = cAge >= 65 && !clientSuperIneligible;
    const pEligible = isJoint && pAge >= 65 && !partnerSuperIneligible;
    const rates = useGrossSuper ? SUPER_RATES_GROSS : SUPER_RATES_NET_M;
    if (isJoint) {
      if (cEligible && pEligible) return rates.couple_both_each * 2 * 26;
      if (cEligible || pEligible) return rates.couple_one * 26;
      return 0;
    }
    if (!cEligible) return 0;
    return rates[livingSituation] * 26;
  };
  const superAtRetirement = getSuperForYear(0);

  const allocations = d.allocations ?? { cashSavings: 3, termDeposit: 12, incomePortfolio: 30, balancedPortfolio: 30, growthPortfolio: 25 };
  const accumulationAllocations = d.accumulationAllocations ?? { cashSavings: 10, balancedPortfolio: 45, growthPortfolio: 45 };
  const returns = d.returns ?? { cashSavings: 0.25, capitalPreservation: 4, incomeGenerator: 5, steadyGrowth: 5.5, strategicGrowth: 7.5 };
  const accumulationReturns = d.accumulationReturns ?? {
    cashSavings: returns.cashSavings, balancedPortfolio: returns.steadyGrowth, growthPortfolio: returns.strategicGrowth
  };
  const recSettings = d.recSettings ?? { cashMonths: 4.5 };
  const projectionYears = d.projectionYears ?? 30;
  const annualIncome = d.annualIncome ?? 0;
  const clientWorkingIncome = d.clientWorkingIncome ?? 0;
  const partnerWorkingIncome = isJoint ? (d.partnerWorkingIncome ?? 0) : 0;
  const legacyTarget = Math.max(0, d.legacyTarget || 0);

  const simParams = {
    lockedKiwiSaver: makeKiwiSaverPools(currentInvestments, clientAge, partnerAge, isJoint, yearsUntilClientRetirement, yearsUntilPartnerRetirement, annualKsClient, annualKsPartner),
    totalPortfolio, allocations, accumulationAllocations, returns, accumulationReturns,
    yearsUntilRetirement, yearsUntilClientRetirement, yearsUntilPartnerRetirement,
    clientWorkingIncome, partnerWorkingIncome: isJoint ? partnerWorkingIncome : 0,
    projectionYears, annualContribution, annualKsClient, annualKsPartner,
    incomeReductionEnabled: d.incomeReductionEnabled ?? false,
    incomeReductionAfterYears: d.incomeReductionAfterYears ?? 15,
    incomeReductionPercent: d.incomeReductionPercent ?? 20,
    agedCareEnabled: d.agedCareEnabled ?? false,
    agedCareStartYear: d.agedCareStartYear ?? 20,
    agedCareAnnualCost: d.agedCareAnnualCost ?? 0,
    agedCareDurationYears: d.agedCareDurationYears ?? 0,
    badFirstYearEnabled: d.badFirstYearEnabled ?? false,
    badFirstYearShockPercent: d.badFirstYearShockPercent ?? -20,
    accumulationLumpSums: d.accumulationLumpSums ?? [],
    retirementLumpSums: d.retirementLumpSums ?? [],
    getSuperForYear, inflateSuper,
    cashflowMode: d.cashflowMode || 'annual',
    cashMonths: recSettings.cashMonths ?? 4.5
  };

  const projectionData = runSimulation({ ...simParams, annualIncome });
  const portfolioAtRetirement = (projectionData.find(p => p.year === yearsUntilRetirement) || {}).Total ?? totalPortfolio;
  const firstYearWorkingIncome = (yearsUntilRetirement < yearsUntilClientRetirement ? clientWorkingIncome : 0) + (yearsUntilRetirement < yearsUntilPartnerRetirement ? partnerWorkingIncome : 0);
  const firstYearDrawdown = Math.max(0, annualIncome - firstYearWorkingIncome - (inflateSuper ? superAtRetirement : superAtRetirement / Math.pow(1.02, yearsUntilRetirement)));

  // Modelled income ceiling (same binary search as the live app, including legacy target)
  const maxSustainableIncome = solveMaxIncome(simParams, legacyTarget);

  return {
    cashflowMode: d.cashflowMode || 'annual',
    clientName: d.clientName || '', partnerName: d.partnerName || '',
    clientAge, partnerAge, retirementAge, partnerRetirementAge, yearsUntilRetirement, yearsUntilFullRetirement, projectionYears,
    totalPortfolio, portfolioAtRetirement, superAtRetirement,
    annualIncome, firstYearDrawdown, maxSustainableIncome, legacyTarget,
    accessibleAtRetirement: projectionData.find(p => p.year === yearsUntilRetirement)?.accessibleTotal ?? totalPortfolio,
    totalShortfall: projectionData.reduce((sum,p) => sum + p.shortfall + p.lumpSumShortfall, 0),
    finalBalance: projectionData[projectionData.length-1].Total,
    legacyMet: projectionData[projectionData.length-1].totalExact + 0.01 >= legacyTarget,
    planFunded: isPlanFunded(projectionData, legacyTarget),
    projectionData
  };
}

