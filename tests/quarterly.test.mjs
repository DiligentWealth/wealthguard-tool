import test from 'node:test';import assert from 'node:assert/strict';
import {runSimulation,runMonteCarloPath,runMonteCarlo,solveMaxIncome,isPlanFunded} from '../src/engine.js';
import {newRecoveryState,runQuarterlyYear,quarterlyLumpWithdrawal,allMarketsDown} from '../src/quarterlyRules.js';
import {computeScenarioSummary} from '../src/scenarioSummary.js';
import {buildComparison} from '../src/comparison.js';
import {validateScenario} from '../src/scenarioValidation.js';
const zero={cash:0,termDep:0,income:0,balanced:0,growth:0};
const rates={cashSavings:0,capitalPreservation:0,incomeGenerator:0,steadyGrowth:0,strategicGrowth:0};
const allocations={cashSavings:10,termDeposit:20,incomePortfolio:30,balancedPortfolio:20,growthPortfolio:20};
const base={cashflowMode:'quarterly',totalPortfolio:100000,allocations,accumulationAllocations:{cashSavings:10,balancedPortfolio:45,growthPortfolio:45},returns:rates,
 yearsUntilRetirement:0,projectionYears:2,annualContribution:0,annualIncome:42000,getSuperForYear:()=>30000,inflateSuper:true,cashMonths:4.5};
const near=(a,b)=>assert.ok(Math.abs(a-b)<.00001,`${a} != ${b}`);
function year(state,recovery,returns=zero,need=12000,targets={incomeTarget:30000,termTarget:20000}){return runQuarterlyYear({state,recovery,annualReturns:returns,annualNeed:need,...targets});}
test('$12000 gap produces four $3000 quarterly Income-to-Cash transfers and monthly spending',()=>{
 const d=runSimulation(base);assert.equal(d[0].quarters.length,4);for(const q of d[0].quarters){near(q.fromIncome,3000);near(q.fromTerm,0);near(q.spent,3000);near(q.cashClosing,10000);}
 near(d[1].totalExact,88000);near(d[0].incomeRefill,12000);near(d[1]['Income Generator'],30000);
});
test('zero return quarterly and annual have identical total spending, without transfer double counting',()=>{
 const q=runSimulation(base),a=runSimulation({...base,cashflowMode:'annual'});near(q.at(-1).totalExact,a.at(-1).totalExact);near(q[1].totalExact,88000);
});
test('monthly cash withdrawals reproduce a hand-calculated effective monthly return path',()=>{
 const p={...base,totalPortfolio:100000,allocations:{cashSavings:100,termDeposit:0,incomePortfolio:0,balancedPortfolio:0,growthPortfolio:0},annualIncome:12000,getSuperForYear:()=>0,projectionYears:1,returns:{...rates,cashSavings:5}};
 let expected=100000;for(let i=0;i<12;i++)expected=expected*1.05**(1/12)-1000;
 near(runSimulation(p)[1].totalExact,expected);assert.ok(expected<93000);
});
test('a negative growth bucket alone does not allow use of term deposits',()=>{
 const r=newRecoveryState();r.balanced.index=.7;
 const result=year({cash:10000,termDep:20000,income:30000,balanced:20000,growth:20000},r);
 near(result.quarters[0].fromIncome,3000);near(result.quarters[0].fromTerm,0);near(result.state.termDep,20000);
});
test('all three market indices below peaks switches quarterly funding to reserve',()=>{
 const r=newRecoveryState();for(const k of Object.keys(r))r[k].index=.8;
 const result=year({cash:10000,termDep:20000,income:30000,balanced:20000,growth:20000},r);
 assert.ok(allMarketsDown(r));for(const q of result.quarters){near(q.fromTerm,3000);near(q.fromIncome,0);}near(result.state.termDep,8000);near(result.termRefill,0);
});
test('positive year without full recovery does not rebuild reserve or sell unrecovered growth',()=>{
 const r=newRecoveryState();for(const k of Object.keys(r))r[k].index=.8;
 const result=year({cash:10000,termDep:8000,income:30000,balanced:20000,growth:20000},r,{...zero,income:10,balanced:10,growth:10},0);
 assert.ok(allMarketsDown(r));near(result.termRefill,0);near(result.state.termDep,8000);
});
test('full recovery restores reserve to original target after Income target is funded',()=>{
 const r=newRecoveryState();for(const k of Object.keys(r))r[k].index=.8;
 const result=year({cash:10000,termDep:8000,income:30000,balanced:20000,growth:20000},r,{...zero,income:25,balanced:25,growth:25},0);
 assert.ok(!allMarketsDown(r));near(result.termRefill,12000);near(result.state.termDep,20000);
});
test('flow-driven balance changes do not change market recovery indices',()=>{
 const r=newRecoveryState();year({cash:10000,termDep:20000,income:30000,balanced:20000,growth:20000},r);
 for(const k of Object.keys(r)){near(r[k].index,1);near(r[k].peak,1);}
});
test('reserve is not a general emergency fallback when markets are recovered',()=>{
 const result=year({cash:0,termDep:50000,income:0,balanced:0,growth:0},newRecoveryState());
 near(result.shortfall,12000);near(result.state.termDep,50000);
});
test('unrecovered assets remain invested and liquidity shortfall fails funding test',()=>{
 const d=runSimulation({...base,allocations:{cashSavings:0,termDeposit:100,incomePortfolio:0,balancedPortfolio:0,growthPortfolio:0}});
 near(d[0].shortfall,12000);assert.equal(isPlanFunded(d),false);near(d[1].totalExact,100000);
});
test('one-off withdrawals respect the reserve gate and recovered-growth rule',()=>{
 const state={cash:0,termDep:20000,income:0,balanced:20000,growth:20000},r=newRecoveryState();r.balanced.index=.8;
 near(quarterlyLumpWithdrawal(state,r,30000),20000);near(state.termDep,20000);near(state.balanced,20000);
});
test('zero-volatility Monte Carlo reproduces quarterly deterministic annual balances',()=>{
 const p={...base,volatilities:{incomeGenerator:0,steadyGrowth:0,strategicGrowth:0},returns:{...rates,incomeGenerator:3,steadyGrowth:5,strategicGrowth:7}};
 assert.deepEqual(runMonteCarloPath(p).totals,runSimulation(p).map(d=>d.Total));
});
test('quarterly income ceiling uses quarterly engine and includes liquidity restrictions',()=>{
 assert.equal(solveMaxIncome({...base,totalPortfolio:0}),30000);
 const max=solveMaxIncome(base);assert.ok(isPlanFunded(runSimulation({...base,annualIncome:max})));assert.ok(!isPlanFunded(runSimulation({...base,annualIncome:max+1})));
});
test('older scenarios default to annual and explicit quarterly propagates into summary and comparison',()=>{
 const scenario={clientAge:65,retirementAge:65,cash:100000,annualIncome:42000,projectionYears:2,returns:rates,allocations};
 const old=computeScenarioSummary(scenario),annual=computeScenarioSummary({...scenario,cashflowMode:'annual'}),q=computeScenarioSummary({...scenario,cashflowMode:'quarterly'});
 assert.deepEqual(old,annual);assert.equal(q.cashflowMode,'quarterly');assert.ok(q.projectionData[0].quarters.length===4);
 const c=buildComparison([{id:'a',label:'Annual',data:scenario},{id:'b',label:'Quarterly',data:{...scenario,cashflowMode:'quarterly'}}]);assert.equal(c.columns[1].summary.cashflowMode,'quarterly');
});
test('invalid mode rejected, exported scenario can preserve either supported mode',()=>{assert.throws(()=>validateScenario({cashflowMode:'daily'}));for(const mode of ['annual','quarterly'])assert.equal(validateScenario({cashflowMode:mode}).cashflowMode,mode);});
test('different retirement ages and working-income offset feed quarterly transfers',()=>{
 const d=runSimulation({...base,annualIncome:60000,partnerWorkingIncome:18000,yearsUntilClientRetirement:0,yearsUntilPartnerRetirement:1});
 near(d[0].quarters[0].required,3000);near(d[1].quarters[0].required,7650);
});
test('released KiwiSaver is not double-counted and never drawn before access',()=>{
 const p={...base,totalPortfolio:200000,lockedKiwiSaver:[{amount:100000,yearsUntilAccess:1,contributionYears:0,annualContribution:0}]};
 const d=runSimulation(p);near(d[0].lockedKiwiSaver,100000);near(d[1].lockedKiwiSaver,0);near(d.at(-1).totalExact,200000-12000-12240);
});
test('annual return remains exactly annual when spending is zero',()=>{
 const d=runSimulation({...base,annualIncome:0,projectionYears:1,allocations:{cashSavings:0,termDeposit:0,incomePortfolio:100,balancedPortfolio:0,growthPortfolio:0},returns:{...rates,incomeGenerator:5}});
 near(d[1].totalExact,105000);
});
test('quarterly Monte Carlo is finite, non-negative, and orders percentile bands',()=>{
 const r=runMonteCarlo({...base,volatilities:{incomeGenerator:6,steadyGrowth:10,strategicGrowth:14}},100);
 assert.ok(r.successRate>=0&&r.successRate<=1);for(const b of r.bands){assert.ok(Number.isFinite(b.p50));assert.ok(b.p10>=0);assert.ok(b.p10<=b.p25&&b.p25<=b.p50&&b.p50<=b.p75&&b.p75<=b.p90);}
});
