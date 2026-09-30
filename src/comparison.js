import { computeScenarioSummary } from './scenarioSummary.js';
import { validateScenario } from './scenarioValidation.js';
const stable = v => JSON.stringify(v, (_,x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])) : x);
const groups = [
 ['Spending target',['annualIncome']],
 ['Current investments',['cash','termDeposits','currentInvestments']],
 ['Investment allocations',['allocations','accumulationAllocations']],
 ['Net investment returns',['returns','accumulationReturns']],
 ['Regular contributions',['contributionAmount','contributionFrequency']],
 ['Employment income',['clientWorkingIncome','partnerWorkingIncome']],
 ['KiwiSaver contributions',['ksEnabled','clientSalary','partnerSalary','clientKsRate','clientKsEmployer','partnerKsRate','partnerKsEmployer','clientEsctRate','partnerEsctRate']],
 ['NZ Super assumptions',['livingSituation','useGrossSuper','inflateSuper','clientSuperIneligible','partnerSuperIneligible']],
 ['Spending reductions',['incomeReductionEnabled','incomeReductionAfterYears','incomeReductionPercent']],
 ['Additional care costs',['agedCareEnabled','agedCareStartYear','agedCareAnnualCost','agedCareDurationYears']],
 ['First-year market stress',['badFirstYearEnabled','badFirstYearShockPercent']],
 ['One-off payments',['accumulationLumpSums','retirementLumpSums']],
 ['Remaining-balance target',['legacyTarget']],
 ['Withdrawal settings',['recSettings']]
];
function comparisonInputs(s) {
  const returns=s.returns??{cashSavings:0.25,capitalPreservation:4,incomeGenerator:5,steadyGrowth:5.5,strategicGrowth:7.5};
  return {
    annualIncome:s.annualIncome??0,cash:s.cash??0,termDeposits:s.termDeposits??0,
    currentInvestments:(s.currentInvestments||[]).filter(x=>x.amount>0).map(x=>({kiwiSaverMember:x.id===1?'client':x.id===2?'partner':null,amount:x.amount})).sort((a,b)=>stable(a).localeCompare(stable(b))),
    allocations:s.allocations??{cashSavings:3,termDeposit:12,incomePortfolio:30,balancedPortfolio:30,growthPortfolio:25},
    accumulationAllocations:s.accumulationAllocations??{cashSavings:10,balancedPortfolio:45,growthPortfolio:45},
    returns,accumulationReturns:s.accumulationReturns??{cashSavings:returns.cashSavings,balancedPortfolio:returns.steadyGrowth,growthPortfolio:returns.strategicGrowth},
    contributionAmount:s.contributionAmount??0,contributionFrequency:s.contributionFrequency??'annual',
    clientWorkingIncome:s.clientWorkingIncome??0,partnerWorkingIncome:s.partnerWorkingIncome??0,
    ksEnabled:s.ksEnabled??false,clientSalary:s.clientSalary??0,partnerSalary:s.partnerSalary??0,clientKsRate:s.clientKsRate??0,partnerKsRate:s.partnerKsRate??0,clientKsEmployer:s.clientKsEmployer??0,partnerKsEmployer:s.partnerKsEmployer??0,clientEsctRate:s.clientEsctRate??null,partnerEsctRate:s.partnerEsctRate??null,
    livingSituation:s.livingSituation??'single_shared',useGrossSuper:s.useGrossSuper??false,inflateSuper:s.inflateSuper??true,clientSuperIneligible:s.clientSuperIneligible??false,partnerSuperIneligible:s.partnerSuperIneligible??false,
    incomeReductionEnabled:s.incomeReductionEnabled??false,incomeReductionAfterYears:s.incomeReductionAfterYears??15,incomeReductionPercent:s.incomeReductionPercent??20,
    agedCareEnabled:s.agedCareEnabled??false,agedCareStartYear:s.agedCareStartYear??20,agedCareAnnualCost:s.agedCareAnnualCost??0,agedCareDurationYears:s.agedCareDurationYears??0,
    badFirstYearEnabled:s.badFirstYearEnabled??false,badFirstYearShockPercent:s.badFirstYearShockPercent??-20,
    accumulationLumpSums:(s.accumulationLumpSums||[]).filter(x=>x.amount>0).map(({amount,type,year})=>({amount,type,year})),retirementLumpSums:(s.retirementLumpSums||[]).filter(x=>x.amount>0).map(({amount,type,yearFromRetirement})=>({amount,type,yearFromRetirement})),
    legacyTarget:s.legacyTarget??0,recSettings:{cashMonths:s.recSettings?.cashMonths??4.5}
  };
}
export function buildComparison(selections, finalAge){
  if(selections.length<2 || selections.length>3) throw new Error('Select two or three scenarios to compare.');
  if(new Set(selections.map(x=>x.id)).size!==selections.length) throw new Error('Choose a different scenario in each comparison column.');
  selections.forEach(x=>validateScenario(x.data));
  const base=selections[0].data;
  const joint=!!base.partnerName?.trim();
  const identity = s => stable([s.clientName?.trim().toLowerCase()||'',s.partnerName?.trim().toLowerCase()||'',s.clientAge??60,joint?s.partnerAge??60:null]);
  if(selections.some(x=>identity(x.data)!==identity(base)||!!x.data.partnerName?.trim()!==joint)) throw new Error('Use scenarios for the same clients with the same current ages.');
  const youngestAge=joint?Math.min(base.clientAge??60,base.partnerAge??60):base.clientAge??60;
  const original=selections.map(x=>computeScenarioSummary(x.data));
  const endYears=finalAge==null || finalAge==='' ? Math.max(...original.map(x=>x.yearsUntilRetirement+x.projectionYears)) : Number(finalAge)-youngestAge;
  if(!Number.isInteger(endYears) || endYears<1 || endYears>240) throw new Error('Enter a valid whole-number final age for the comparison.');
  const columns=selections.map((x,i)=>{
    const projectionYears=endYears-original[i].yearsUntilRetirement;
    if(projectionYears<1 || projectionYears>120) throw new Error('The comparison end date must follow every retirement date, with 1–120 retirement years per scenario.');
    const input={...x.data,projectionYears};
    const accumulation=x.data.accumulationLumpSums||[],retirement=x.data.retirementLumpSums||[];
    if(accumulation.some(e=>e.amount>0&&(!Number.isInteger(e.year)||e.year<0||e.year>=original[i].yearsUntilRetirement)) || retirement.some(e=>e.amount>0&&(!Number.isInteger(e.yearFromRetirement)||e.yearFromRetirement<0||e.yearFromRetirement>=projectionYears))) throw new Error(`Correct the one-off payment timing in “${x.label}” for this comparison end date.`);
    return {...x,summary:computeScenarioSummary(input)};
  });
  const inputs=selections.map(x=>comparisonInputs(x.data));
  const differences=groups.filter(([,keys])=>keys.some(k=>inputs.some(x=>stable(x[k])!==stable(inputs[0][k])))).map(([label])=>label);
  const relativeEvents=selections.some(x=>(x.data.retirementLumpSums||[]).some(e=>e.amount>0)||x.data.agedCareEnabled||x.data.incomeReductionEnabled||x.data.badFirstYearEnabled);
  const chart=Array.from({length:endYears+1},(_,year)=>Object.fromEntries([['year',year],...columns.map((x,i)=>['scenario'+i,x.summary.projectionData[year].Total])]));
  return {columns,endYears,finalAge:youngestAge+endYears,youngestAge,differences,relativeEvents,chart};
}
