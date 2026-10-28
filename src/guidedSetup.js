import {validateScenario} from './scenarioValidation.js';
import {firstRetirementYear} from './planningPreview.js';
export const GUIDED_STEPS = [
 {id:'clients',label:'Clients',help:'Enter names, current ages, retirement ages and NZ Super assumptions.'},
 {id:'assets',label:'Investments',help:'Record current cash, investments and KiwiSaver. These are current holdings, not your proposed retirement mix.'},
 {id:'income',label:'Spending & income',help:'Enter total spending including NZ Super, net working income and any other income. Add optional events only where relevant.'},
 {id:'strategy',label:'Strategy',help:'Review the pre-retirement and retirement bucket mixes separately, then the net return assumptions.'},
 {id:'results',label:'Check & results',help:'Review the input checks and funding gaps before interpreting the graphs or generating a report.'}
];
export function guidedChecks(s,context={}) {
 const joint=!!s.partnerName?.trim(), first=firstRetirementYear(s), warnings=[];
 let schemaError='';try{validateScenario(s);}catch(error){schemaError=error.message;warnings.push({step:'income',text:schemaError});}
 const hasName=!!s.clientName?.trim(), ages=(s.clientAge??0)>0 && (s.retirementAge??0)>0 && (!joint || ((s.partnerAge??0)>0 && (s.partnerRetirementAge??0)>0));
 const total=(s.cash||0)+(s.termDeposits||0)+(s.currentInvestments||[]).filter(x=>joint||x.id!==2).reduce((sum,x)=>sum+(x.amount||0),0);
 const retirementSum=Object.values(s.allocations||{}).reduce((sum,x)=>sum+x,0),accumulationSum=Object.values(s.accumulationAllocations||{}).reduce((sum,x)=>sum+x,0);
 const allocationOK=Math.abs(retirementSum-100)<=.1 && (first===0 || Math.abs(accumulationSum-100)<=.1);
 const incomeBucketIssue=(context.investmentIncomeNeeded ?? ((context.firstYearDrawdown||0)>0)) && !(s.allocations?.incomePortfolio>0);
 if(!hasName||!ages)warnings.push({step:'clients',text:'Check the client name and ages, including each person’s retirement age.'});
 if(!(total>0))warnings.push({step:'assets',text:'No investment balance has been entered. Check cash, investments and KiwiSaver.'});
 if(!(s.annualIncome>0))warnings.push({step:'income',text:'Annual spending is $0. Confirm whether that is intentional.'});
 if(!allocationOK)warnings.push({step:'strategy',text:'Make the relevant investment allocations total 100% before finalising the plan.'});
 if(incomeBucketIssue)warnings.push({step:'strategy',text:'Investment-funded spending is required, but the retirement allocation has 0% in Income Generator. Check how the quarterly top-ups will be funded; KiwiSaver releases may add income holdings later.'});
 for(const [name,age,retirement,working] of [[s.clientName||'Client',s.clientAge??60,s.retirementAge??65,s.clientWorkingIncome||0],...(joint?[[s.partnerName,s.partnerAge??60,s.partnerRetirementAge??65,s.partnerWorkingIncome||0]]:[])]){
  if(Math.max(0,retirement-age)>first && working===0)warnings.push({step:'income',text:`${name} continues working after first retirement, but $0 net working income is included. Confirm this is intentional.`});
 }
 if(context.invalidLumpTiming)warnings.push({step:'income',text:'A one-off payment is outside the modelled period. Check its timing.'});
 if(context.totalShortfall>.01)warnings.push({step:'results',text:'Some planned spending or withdrawals are unfunded under the selected bucket rules. Investments may still remain; review the funding path before presenting the result.'});
 const ready={clients:hasName&&ages,assets:total>0,income:s.annualIncome>0&&!schemaError&&!context.invalidLumpTiming,strategy:allocationOK&&!incomeBucketIssue,results:!!context.planFunded};
 warnings.forEach(w=>{ready[w.step]=false;});
 return {warnings,ready};
}
