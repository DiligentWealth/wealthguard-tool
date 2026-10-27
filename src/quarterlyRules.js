// WealthGuard Quarterly Income Model rules. Market recovery uses nominal net total-return
// indices, independent of transfers/withdrawals. Annual return paths are smoothed
// into monthly effective returns; this does not simulate intrayear volatility.
const EPS = 1e-8;
export function newRecoveryState() {
  return Object.fromEntries(['income','balanced','growth'].map(k=>[k,{index:1,peak:1}]));
}
export function recovered(recovery,k) { return recovery[k].index >= recovery[k].peak - EPS; }
export function allMarketsDown(recovery) { return ['income','balanced','growth'].every(k=>!recovered(recovery,k)); }
export function investmentBucketsExhausted(state) { return ['income','balanced','growth'].every(k=>state[k] <= EPS); }
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
  // Reserve is also available once all three investment buckets are exhausted.
  if(investmentBucketsExhausted(state)) remaining-=take(state,'termDep',remaining);
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
    const exhausted=investmentBucketsExhausted(state);
    if(exhausted && remaining>0) {const extra=take(state,'termDep',remaining);fromTerm+=extra;remaining-=extra;}
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
    if(record)quarters.push({quarter,required,fromIncome,fromTerm,transferred:fromIncome+fromTerm,spent,shortfall:Math.max(0,required-spent) < 1e-7 ? 0 : Math.max(0,required-spent),allMarketsDown:down,investmentBucketsExhausted:exhausted,cashClosing:state.cash});
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
export const QUARTERLY_RULES_TEXT = 'Quarterly top-ups are scheduled for the 15th of the first month of each quarter, allowing time for cash distributions to settle into the portfolio. Transfer one quarter of the annual spending gap after NZ Super and working income into Cash Savings, then pay spending monthly. The additional cash buffer is not extra spending. For this projection, transfers are approximated at quarter start; the exact day and distribution settlement dates are not separately modelled. Use Capital Preservation first only while Income Generator and both growth buckets are below their previous nominal net total-return peaks. Otherwise use Income Generator. If Income Generator and both growth buckets are exhausted, Capital Preservation can also fund ongoing spending. Refill Income Generator annually from recovered growth buckets only when Income Generator has recovered; then restore Capital Preservation to its initial retirement target once all three market buckets have recovered. Refill targets are fixed nominal amounts, increased by allocated new deposits. Available KiwiSaver is split equally between Income Generator and the two growth buckets; its Income share increases the Income refill target. If permitted funding and Cash run out, record a spending shortfall rather than automatically sell unrecovered growth assets.';
