import test from 'node:test';import assert from 'node:assert/strict';import {guidedChecks} from '../src/guidedSetup.js';
const base={clientName:'Example',clientAge:61,retirementAge:65,annualIncome:100000,cash:1000000,projectionYears:30,allocations:{cashSavings:5,termDeposit:15,incomePortfolio:30,balancedPortfolio:25,growthPortfolio:25},accumulationAllocations:{cashSavings:10,balancedPortfolio:40,growthPortfolio:50}};
test('guide checks never mutate financial inputs and flag zero income allocation even if withdrawals start later',()=>{
 const s={...base,allocations:{cashSavings:5,termDeposit:0,incomePortfolio:0,balancedPortfolio:45,growthPortfolio:50}},before=JSON.stringify(s);
 const c=guidedChecks(s,{firstYearDrawdown:0,investmentIncomeNeeded:true,planFunded:false,totalShortfall:30000});
 assert.equal(JSON.stringify(s),before);assert.ok(c.warnings.some(x=>x.text.includes('0% in Income Generator')));assert.ok(c.warnings.some(x=>x.text.includes('Investments may still remain')));assert.equal(c.ready.strategy,false);
});
test('missing client/investment inputs and invalid income streams remain visible in review checks',()=>{
 const c=guidedChecks({...base,clientName:'',cash:0,otherIncomeSources:[{id:1,label:'Rental',amount:12000,frequency:'annual',startYear:1,endYear:0,inflate:false}]},{});
 assert.equal(c.ready.clients,false);assert.equal(c.ready.assets,false);assert.equal(c.ready.income,false);assert.ok(c.warnings.some(x=>x.text.includes('end on or after')));
});
