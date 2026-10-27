import { computeScenarioSummary } from './scenarioSummary.js';
import { validateScenario } from './scenarioValidation.js';
import { retirementTimeline } from './engine.js';

export const PREVIEW_FIELDS = ['retirementAge','partnerRetirementAge','annualIncome',
  'incomeReductionEnabled','incomeReductionAfterYears','incomeReductionPercent',
  'agedCareEnabled','agedCareAnnualCost','badFirstYearEnabled'];
export function firstRetirementYear(s) {
  const clientYears = Math.max(0,(s.retirementAge ?? 65)-(s.clientAge ?? 60));
  const partnerYears = Math.max(0,(s.partnerRetirementAge ?? ((s.partnerAge ?? 60)+clientYears))-(s.partnerAge ?? 60));
  return retirementTimeline(clientYears,partnerYears,!!s.partnerName?.trim()).first;
}
export function buildPlanningPreview(reference, changes = {}) {
  const input = {...reference};
  for (const key of PREVIEW_FIELDS) if (changes[key] !== undefined) input[key] = changes[key];
  const endYears = firstRetirementYear(reference)+(reference.projectionYears ?? 30);
  input.projectionYears = endYears-firstRetirementYear(input);
  if (!Number.isInteger(input.projectionYears) || input.projectionYears<1 || input.projectionYears>120) {
    throw new Error('Choose retirement ages before the common projection end date, with 1–120 retirement years.');
  }
  validateScenario(input);
  const accumulation = input.accumulationLumpSums || [], retirement = input.retirementLumpSums || [];
  if (accumulation.some(x=>x.amount>0 && (!Number.isInteger(x.year) || x.year<0 || x.year>=firstRetirementYear(input)))) {
    throw new Error('An accumulation payment falls outside the changed accumulation period. Review its timing in Planning before comparing these ages.');
  }
  if (retirement.some(x=>x.amount>0 && (!Number.isInteger(x.yearFromRetirement) || x.yearFromRetirement<0 || x.yearFromRetirement>=input.projectionYears))) {
    throw new Error('A retirement payment falls outside the common projection end date. Review its timing before comparing these ages.');
  }
  const baseline = computeScenarioSummary(reference,{calculateIncomeCeiling:false});
  const preview = computeScenarioSummary(input,{calculateIncomeCeiling:false});
  const chart = baseline.projectionData.map((row,year)=>({year,reference:row.Total,preview:preview.projectionData[year].Total}));
  return {input,baseline,preview,endYears,chart};
}
