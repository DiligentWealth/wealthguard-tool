import test from 'node:test';import assert from 'node:assert/strict';
import {otherIncomeForYear,incomeEndYear} from '../src/otherIncome.js';
import {validateScenario} from '../src/scenarioValidation.js';
import {computeScenarioSummary} from '../src/scenarioSummary.js';
import {runSimulation,runMonteCarloPath} from '../src/engine.js';
import {buildComparison} from '../src/comparison.js';
import {buildPlanningPreview} from '../src/planningPreview.js';
const source={id:1,label:'Net rental income',amount:1000,frequency:'monthly',startYear:1,endYear:3,inflate:false,endWithDeposit:''};
const settings={otherIncomeSources:[source]};
const rates={cashSavings:0,capitalPreservation:0,incomeGenerator:0,steadyGrowth:0,strategicGrowth:0};
const base={totalPortfolio:100000,allocations:{cashSavings:0,termDeposit:0,incomePortfolio:100,balancedPortfolio:0,growthPortfolio:0},accumulationAllocations:{cashSavings:100,balancedPortfolio:0,growthPortfolio:0},returns:rates,yearsUntilRetirement:0,projectionYears:4,annualIncome:24000,annualContribution:0,getSuperForYear:()=>0,inflateSuper:true,cashMonths:4.5};
test('monthly income is annualised only during inclusive start/end years',()=>{
 assert.equal(otherIncomeForYear(settings,0),0);assert.equal(otherIncomeForYear(settings,1),12000);assert.equal(otherIncomeForYear(settings,3),12000);assert.equal(otherIncomeForYear(settings,4),0);
 assert.equal(otherIncomeForYear({otherIncomeSources:[{...source,frequency:'annual',inflate:true}]},2),1000*1.02**2);
});
test('linked equity release stops income before the deposit and follows retirement timing',()=>{
 const s={otherIncomeSources:[{...source,endYear:null,endWithDeposit:'retirement:9'}],yearsUntilRetirement:2,retirementLumpSums:[{id:9,type:'deposit',amount:100000,yearFromRetirement:3}]};
 assert.equal(incomeEndYear(s.otherIncomeSources[0],s),4);assert.equal(otherIncomeForYear(s,4),12000);assert.equal(otherIncomeForYear(s,5),0);
 assert.equal(otherIncomeForYear({...s,yearsUntilRetirement:3},5),12000);
});
test('a removed linked deposit is rejected on save but cannot crash a live draft',()=>{
 const invalid={...source,endWithDeposit:'retirement:99'};
 assert.throws(()=>validateScenario({otherIncomeSources:[invalid]}),/valid equity-release deposit/);
 assert.equal(otherIncomeForYear({otherIncomeSources:[invalid]},2),0);
 assert.throws(()=>validateScenario({otherIncomeSources:[{...source,endYear:0}]}),/end on or after/);
});
test('both engines offset spending by other income without adding it to the portfolio twice',()=>{
 for(const cashflowMode of ['annual','quarterly']){
  const d=runSimulation({...base,cashflowMode,otherIncomeSources:[{...source,startYear:0,endYear:null,amount:12000,frequency:'annual',inflate:true}]});
  assert.equal(d[0].drawdownRequired,12000);assert.equal(d[0].drawdownActual,12000);assert.equal(d[0].otherIncome,12000);
  assert.ok(Math.abs(d[1].totalExact-88000)<.000001);
  const noSources=runSimulation({...base,cashflowMode}),empty=runSimulation({...base,cashflowMode,otherIncomeSources:[]});assert.deepEqual(noSources,empty);
 }
});
test('surplus other income does not get reinvested automatically',()=>{
 const d=runSimulation({...base,annualIncome:10000,otherIncomeSources:[{...source,amount:100000,startYear:0,frequency:'annual',endYear:null}]});assert.equal(d[0].drawdownRequired,0);assert.equal(d[1].totalExact,100000);
});
test('zero-volatility Monte Carlo and deterministic projection use the same income streams',()=>{
 const p={...base,cashflowMode:'quarterly',otherIncomeSources:[source],volatilities:{incomeGenerator:0,steadyGrowth:0,strategicGrowth:0}};
 assert.deepEqual(runMonteCarloPath(p).totals,runSimulation(p).map(d=>d.Total));
});
test('summary, comparisons and what-if previews carry other income into the same engine',()=>{
 const s={clientAge:60,retirementAge:61,cash:1000000,annualIncome:60000,projectionYears:5,otherIncomeSources:[{...source,startYear:1,inflate:true,endYear:null}]};
 const summary=computeScenarioSummary(s);assert.ok(Math.abs(summary.firstYearOtherIncomeToday-12000)<.00001);
 assert.equal(summary.firstYearDrawdown,48000);
 const c=buildComparison([{id:'a',label:'Without',data:{...s,otherIncomeSources:[]}},{id:'b',label:'With',data:s}]);assert.ok(c.differences.includes('Other retirement income'));
 const p=buildPlanningPreview(s,{retirementAge:62});assert.ok(p.preview.projectionData[2].otherIncome>0);assert.deepEqual(s.otherIncomeSources[0],{...source,startYear:1,inflate:true,endYear:null});
});
