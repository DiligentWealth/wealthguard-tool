// Reject malformed backups before they reach React or the cash-flow engines.
export function validateScenario(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Error('Invalid scenario data.');
  const visit = (v, key = '', depth = 0) => {
    if (depth > 8) throw new Error('Scenario nesting is too deep.');
    if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('Scenario numbers must be finite.');
    if (typeof v === 'string' && v.length > 2000) throw new Error('Scenario text is too long.');
    if (Array.isArray(v) && v.length > 200) throw new Error('Scenario contains too many entries.');
    if (v && typeof v === 'object') Object.entries(v).forEach(([k,x]) => {
      if (['__proto__','constructor','prototype'].includes(k)) throw new Error('Invalid scenario key.');
      visit(x,k,depth+1);
    });
  };
  visit(s);
  for (const key of ['clientName','partnerName']) if (s[key] != null && typeof s[key] !== 'string') throw new Error(key+' must be text.');
  const money = ['clientWorkingIncome','partnerWorkingIncome','cash','termDeposits','annualIncome','contributionAmount','clientSalary','partnerSalary','legacyTarget','agedCareAnnualCost'];
  const numeric = (v,k,min=0,max=1e12,integer=false) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v<min || v>max || (integer && !Number.isInteger(v))) throw new Error('Invalid '+k+'.');
  };
  for (const k of money) if (s[k]!=null) numeric(s[k],k);
  for (const k of ['clientAge','partnerAge','retirementAge','partnerRetirementAge']) if (s[k]!=null) numeric(s[k],k,0,120,true);
  if (s.projectionYears!=null) numeric(s.projectionYears,'projectionYears',1,120,true);
  for (const k of ['allocations','accumulationAllocations','returns','accumulationReturns','recSettings','volatilities','mcSettings','giftingThresholds']) {
    if (s[k]!=null) {
      if (typeof s[k]!=='object' || Array.isArray(s[k])) throw new Error('Invalid '+k+'.');
      Object.entries(s[k]).forEach(([key,v])=>numeric(v,key, k.includes('Returns') || k==='returns' || key==='downYearThreshold' ? -100 : 0));
    }
  }
  for (const k of ['useGrossSuper','inflateSuper','clientSuperIneligible','partnerSuperIneligible','ksEnabled','incomeReductionEnabled','agedCareEnabled','badFirstYearEnabled','showTodaysDollars','mcAccumulationEnabled','giftingCalcEnabled','giftingBothApplyingTogether','wealthTransferEnabled']) {
    if (s[k]!=null && typeof s[k] !== 'boolean') throw new Error('Invalid '+k+'.');
  }
  for (const k of ['clientKsRate','clientKsEmployer','partnerKsRate','partnerKsEmployer','incomeReductionPercent','clientEsctRate','partnerEsctRate']) if (s[k]!=null) numeric(s[k],k,0,100);
  for (const k of ['incomeReductionAfterYears','agedCareStartYear','agedCareDurationYears','giftingYearsUntilCare']) if (s[k]!=null) numeric(s[k],k,0,240,true);
  if (s.livingSituation!=null && !['single_alone','single_shared'].includes(s.livingSituation)) throw new Error('Invalid living situation.');
  if (s.contributionFrequency!=null && !['annual','weekly','fortnightly','monthly'].includes(s.contributionFrequency)) throw new Error('Invalid contribution frequency.');
  for (const [k,required] of [['allocations',['cashSavings','termDeposit','incomePortfolio','balancedPortfolio','growthPortfolio']],['accumulationAllocations',['cashSavings','balancedPortfolio','growthPortfolio']],['returns',['cashSavings','capitalPreservation','incomeGenerator','steadyGrowth','strategicGrowth']],['accumulationReturns',['cashSavings','balancedPortfolio','growthPortfolio']]]) {
    if (s[k]) required.forEach(key=>numeric(s[k][key],key,k.includes('Returns') || k==='returns' ? -100 : 0));
  }
  for (const k of ['currentInvestments','accumulationLumpSums','retirementLumpSums']) {
    if (s[k]!=null && !Array.isArray(s[k])) throw new Error(k+' must be a list.');
    const ids = new Set();
    (s[k]||[]).forEach(item=>{
      if (ids.has(item?.id)) throw new Error('Duplicate entry ID.');
      ids.add(item?.id);
      if (!item || typeof item!=='object') throw new Error('Invalid '+k+' entry.');
      numeric(item.amount,'amount');
      numeric(item.id,'entry ID',0,Number.MAX_SAFE_INTEGER,true);
      if (item.label!=null && typeof item.label!=='string') throw new Error('Entry labels must be text.');
      if (k!=='currentInvestments') {
        const year = k==='accumulationLumpSums' ? item.year : item.yearFromRetirement;
        numeric(year,'lump-sum year',0,240,true);
        if (!['deposit','withdrawal'].includes(item.type)) throw new Error('Invalid lump-sum type.');
      }
    });
  }
  return s;
}
