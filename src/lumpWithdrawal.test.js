import { makeKiwiSaverPools, runSimulation, solveMaxIncome, isPlanFunded } from './engine';
import { newRecoveryState, quarterlyLumpWithdrawal, restoreIncomeAfterLump } from './quarterlyRules';
import { SUPER_RATES_NET_M } from './scenarioSummary';

const angelaParams = () => {
  const ksAnnual = 71000 * (0.06 + 0.035 * 0.67);
  const holdings = [{ id: 1, amount: 162607 }, { id: 2, amount: 0 }, { id: 3, amount: 150000 }];
  return {
    totalPortfolio: 342607,
    allocations: { cashSavings: 2.5, termDeposit: 10, growthPortfolio: 26.3, incomePortfolio: 30.6, balancedPortfolio: 30.6 },
    accumulationAllocations: { cashSavings: 8.7, growthPortfolio: 43.8, balancedPortfolio: 47.5 },
    returns: { cashSavings: 0.25, steadyGrowth: 5.5, incomeGenerator: 5, strategicGrowth: 7.5, capitalPreservation: 4 },
    accumulationReturns: { cashSavings: 0.25, growthPortfolio: 7.5, balancedPortfolio: 5.5 },
    lockedKiwiSaver: makeKiwiSaverPools(holdings, 55, 60, false, 5, 10, ksAnnual, 0),
    yearsUntilRetirement: 5, yearsUntilClientRetirement: 5, yearsUntilPartnerRetirement: 10,
    projectionYears: 30, annualContribution: 0, annualKsClient: ksAnnual, annualKsPartner: 0,
    clientWorkingIncome: 0, partnerWorkingIncome: 0,
    incomeReductionEnabled: true, incomeReductionAfterYears: 20, incomeReductionPercent: 20,
    agedCareEnabled: false, accumulationLumpSums: [{ year: 1, type: 'deposit', amount: 600000 }],
    retirementLumpSums: [{ yearFromRetirement: 0, type: 'withdrawal', amount: 300000 }],
    otherIncomeSources: [], getSuperForYear: (year) => year + 60 >= 65 ? SUPER_RATES_NET_M.single_shared * 26 : 0,
    inflateSuper: true, cashMonths: 4.5, cashflowMode: 'quarterly'
  };
};

test('one-off expense preserves recovered growth-funded income reserve', () => {
  const state = { cash: 5, termDep: 100, income: 60, balanced: 130, growth: 70 };
  expect(quarterlyLumpWithdrawal(state, newRecoveryState(), 150)).toBe(150);
  expect(state.income).toBe(60);
  expect(state.termDep).toBe(100);
});

test('quarterly lump withdrawal does not sell unrecovered growth', () => {
  const recovery = newRecoveryState();
  for (const bucket of ['balanced', 'growth']) recovery[bucket].peak = 1.1;
  const state = { cash: 0, termDep: 100, income: 60, balanced: 130, growth: 70 };
  expect(quarterlyLumpWithdrawal(state, recovery, 40)).toBe(40);
  expect(state.balanced).toBe(130);
  expect(state.growth).toBe(70);
  expect(state.income).toBe(20);
});

test('post-withdrawal income refill only uses recovered growth assets', () => {
  const state = { cash: 0, termDep: 25, income: 20, balanced: 90, growth: 90 };
  const recovery = newRecoveryState();
  expect(restoreIncomeAfterLump(state, recovery, 60)).toBeCloseTo(40);
  expect(state.income).toBeCloseTo(60);
  recovery.growth.peak = 1.1;
  recovery.balanced.peak = 1.1;
  expect(restoreIncomeAfterLump(state, recovery, 80)).toBe(0);
  expect(state.income).toBeCloseTo(60);
});

test('Angela Carpenter scenario funds the first retirement year and $60k plan', () => {
  const params = angelaParams();
  const projection = runSimulation({ ...params, annualIncome: 60000 });
  expect(projection[5].lumpSumShortfall).toBeLessThan(0.01);
  expect(projection[5].shortfall).toBeLessThan(0.01);
  expect(isPlanFunded(projection)).toBe(true);
  expect(solveMaxIncome(params)).toBeGreaterThan(60000);
  expect(projection[projection.length - 1].totalExact).toBeGreaterThan(0);
});
