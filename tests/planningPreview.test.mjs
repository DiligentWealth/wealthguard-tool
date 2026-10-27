import test from 'node:test';import assert from 'node:assert/strict';
import {buildPlanningPreview} from '../src/planningPreview.js';
import {computeScenarioSummary} from '../src/scenarioSummary.js';
const plan={clientName:'Rob',partnerName:'Liz',clientAge:61,partnerAge:54,retirementAge:65,partnerRetirementAge:60,projectionYears:30,annualIncome:100000,cash:1500000,cashflowMode:'quarterly',allocations:{cashSavings:5,termDeposit:15,incomePortfolio:30,balancedPortfolio:25,growthPortfolio:25},accumulationAllocations:{cashSavings:5,balancedPortfolio:45,growthPortfolio:50},returns:{cashSavings:.25,capitalPreservation:4,incomeGenerator:5,steadyGrowth:5.5,strategicGrowth:7.5},partnerWorkingIncome:100000,incomeReductionEnabled:true,incomeReductionPercent:20,incomeReductionAfterYears:15,agedCareAnnualCost:50000};
test('earlier retirement uses a common end date and does not modify the reference',()=>{
 const original=JSON.stringify(plan),p=buildPlanningPreview(plan,{retirementAge:64});
 assert.equal(JSON.stringify(plan),original);assert.equal(p.endYears,34);assert.equal(p.input.projectionYears,31);
 assert.equal(p.baseline.projectionData.at(-1).year,34);assert.equal(p.preview.projectionData.at(-1).year,34);
 assert.equal(p.chart.length,35);assert.notEqual(p.baseline.finalBalance,p.preview.finalBalance);
});
test('different partner age changes working-income offsets on the correct years',()=>{
 const p=buildPlanningPreview(plan,{partnerRetirementAge:59});
 assert.equal(p.preview.projectionData[5].employmentIncome,0);assert.ok(p.baseline.projectionData[5].employmentIncome>0);
});
test('reduced income, care and stress alter only the preview path',()=>{
 for(const changes of [{incomeReductionEnabled:false},{agedCareEnabled:true},{badFirstYearEnabled:true}]){
  const p=buildPlanningPreview(plan,changes);assert.notDeepEqual(p.chart.map(x=>x.reference),p.chart.map(x=>x.preview));
 }
 const p=buildPlanningPreview(plan,{});assert.deepEqual(p.chart.map(x=>x.reference),p.chart.map(x=>x.preview));
});
test('invalid timing is explicit instead of dropping recorded payments',()=>{
 assert.throws(()=>buildPlanningPreview({...plan,accumulationLumpSums:[{id:1,amount:10000,type:'deposit',year:3}]},{retirementAge:64}),/accumulation payment/);
 assert.throws(()=>buildPlanningPreview({...plan,partnerRetirementAge:100},{retirementAge:120}),/common projection end date/);
 assert.throws(()=>buildPlanningPreview(plan,{annualIncome:-1}),/annualIncome/);
});
test('income ceiling remains calculated for existing callers and can be skipped only for previews',()=>{
 const normal=computeScenarioSummary({...plan,projectionYears:3}),fast=computeScenarioSummary({...plan,projectionYears:3},{calculateIncomeCeiling:false});
 assert.equal(typeof normal.maxSustainableIncome,'number');assert.equal(fast.maxSustainableIncome,null);
 assert.deepEqual(normal.projectionData,fast.projectionData);assert.equal(normal.finalBalance,fast.finalBalance);
});
