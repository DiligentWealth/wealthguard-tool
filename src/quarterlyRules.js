// WealthGuard quarterly TEST rules. Market recovery uses nominal net total-return
// indices, independent of transfers/withdrawals. Annual return paths are smoothed
// into monthly effective returns; this does not simulate intrayear volatility.
const EPS = 1e-8;
export function newRecoveryState() {
  return Object.fromEntries(['income','balanced','growth'].map(k=>[k,{index:1,peak:1}]));
}
export function recovered(recovery,k) { return recovery[k].index >= recovery[k].peak - EPS; }
export function allMarketsDown(recovery) { return ['income','balanced','growth'].every(k=>!recovered(recovery,k)); }
function take(state,k,amount) { const paid=Math.min(Math.max(0,state[k]),Math.max(0,amount));state[k]-=paid;return paid; }
function takeRecoveredGrowth(state,recovery,amount) {
  const keys=['balanced','growth'].filter(k=>recovered(recovery,k));
  const total=keys.reduce((a,k)=>a+state[k],0);
  const target=Math.min(Math.max(0,amount),total);
  if(total>0) keys.forEach(k=>{state[k]-=target*state[k]/total;});
  return target;
}
export function quarterlyLumpWithdrawal(state,recovery,amount) {
  let remaining=amount;
  remaining-=take(state,'cash',remaining);
  if(allMarketsDown(recovery)) remaining-=take(state,'termDep',remaining);
  remaining-=take(state,'income',remaining);
  remaining-=takeRecoveredGrowth(state,recovery,remaining);
  // Capital Preservation is never a general last-resort withdrawal source.
  return amount-remaining;
}
export function runQuarterlyYear({state,recovery,annualReturns,annualNeed,incomeTarget,termTarget,record=true}) {
  const monthly=Object.fromEntries(Object.entries(annualReturns).map(([k,v])=>[k,Math.max(0,1+v/100)**(1/12)]));
  const quarters=[];let actual=0;
  for(let quarter=1;quarter<=4;quarter++) {
    const required=annualNeed/4;
    const down=allMarketsDown(recovery);
    let remaining=required,fromTerm=0,fromIncome=0;
    if(down) {fromTerm=take(state,'termDep',remaining);remaining-=fromTerm;}
    fromIncome=take(state,'income',remaining);remaining-=fromIncome;
    state.cash+=fromTerm+fromIncome;
    let spent=0;
    for(let month=0;month<3;month++) {
      for(const k of Object.keys(state))state[k]*=monthly[k];
      for(const k of ['income','balanced','growth']) {
        recovery[k].index*=monthly[k];
        recovery[k].peak=Math.max(recovery[k].peak,recovery[k].index);
      }
      const paid=take(state,'cash',annualNeed/12);spent+=paid;actual+=paid;
    }
    if(record)quarters.push({quarter,required,fromIncome,fromTerm,transferred:fromIncome+fromTerm,spent,shortfall:Math.max(0,required-spent) < 1e-7 ? 0 : Math.max(0,required-spent),allMarketsDown:down,cashClosing:state.cash});
  }
  // Review annually. Rebuild Income first, then the depleted emergency reserve.
  // Income itself must have recovered before growth is sold to replenish it.
  let incomeRefill=0,termRefill=0;
  if(recovered(recovery,'income')) {
    incomeRefill=takeRecoveredGrowth(state,recovery,Math.max(0,incomeTarget-state.income));
    state.income+=incomeRefill;
  }
  if(['income','balanced','growth'].every(k=>recovered(recovery,k))) {
    termRefill=takeRecoveredGrowth(state,recovery,Math.max(0,termTarget-state.termDep));
    state.termDep+=termRefill;
  }
  return {state,recovery,actual,shortfall:Math.max(0,annualNeed-actual) < 1e-7 ? 0 : Math.max(0,annualNeed-actual),quarters,incomeRefill,termRefill};
}
export const QUARTERLY_RULES_TEXT = 'Quarterly test model: transfer one quarter of the annual spending gap after NZ Super and working income into Cash Savings at the start of each quarter, then pay spending monthly. Use Capital Preservation first only while Income Generator and both growth buckets are below their previous nominal net total-return peaks. Otherwise use Income Generator. Refill Income Generator annually from recovered growth buckets only when Income Generator has recovered; then restore Capital Preservation to its initial retirement target once all three market buckets have recovered. Refill targets are fixed nominal amounts, increased by allocated new deposits or released KiwiSaver. If permitted funding and Cash run out, record a spending shortfall rather than automatically sell unrecovered growth assets.';
