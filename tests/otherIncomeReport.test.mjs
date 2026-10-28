import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {computeScenarioSummary} from '../src/scenarioSummary.js';
let source=fs.readFileSync(new URL('../src/report.js',import.meta.url),'utf8');
for(const name of ['quarterlyRules','brand','engine','otherIncome'])source=source.replace(`'./${name}'`,JSON.stringify(new URL(`../src/${name}.js`,import.meta.url).href));
const {buildReportHTML}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('report includes other income assumptions and annual income in its appendix',()=>{
 const scenario={clientName:'Example',partnerName:'',clientAge:60,retirementAge:60,cash:1000000,annualIncome:60000,projectionYears:5,cashflowMode:'quarterly',returns:{cashSavings:0,capitalPreservation:0,incomeGenerator:0,steadyGrowth:0,strategicGrowth:0},allocations:{cashSavings:5,termDeposit:15,incomePortfolio:30,balancedPortfolio:25,growthPortfolio:25},accumulationAllocations:{cashSavings:10,balancedPortfolio:45,growthPortfolio:45},accumulationReturns:{cashSavings:0,balancedPortfolio:0,growthPortfolio:0},recSettings:{cashMonths:4.5},otherIncomeSources:[{id:1,label:'Rental <income>',amount:12000,frequency:'annual',startYear:0,endYear:2,inflate:false,endWithDeposit:''}]};
 const summary=computeScenarioSummary(scenario);
 const html=buildReportHTML({...summary,scenario,annualContribution:0,annualKsClient:0,annualKsPartner:0},{},{appendix:true});
 assert.ok(html.includes('Other retirement income'));assert.ok(html.includes('Rental &lt;income&gt;'));assert.ok(html.includes('Other income'));assert.ok(html.includes('$12,000'));
 assert.ok(!html.includes('Rental <income>'));
});
