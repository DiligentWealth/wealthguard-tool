export const HORIZONS = [
  {key:'cashSavings',label:'Cash Savings',name:'Immediate',purpose:'Regular spending and near-term withdrawals',color:'#eab308',returnKey:'cashSavings'},
  {key:'termDeposit',label:'Capital Preservation',name:'Reserve',purpose:'A reserve for stability and flexibility',color:'#f97316',returnKey:'capitalPreservation'},
  {key:'incomePortfolio',label:'Income Generator',name:'Income',purpose:'Supporting retirement withdrawals',color:'#22c55e',returnKey:'incomeGenerator'},
  {key:'balancedPortfolio',label:'Steady Growth',name:'Growth',purpose:'Growth for medium-term needs',color:'#3b82f6',returnKey:'steadyGrowth'},
  {key:'growthPortfolio',label:'Strategic Long Term Growth',name:'Long-term',purpose:'Later retirement and long-term goals',color:'#a855f7',returnKey:'strategicGrowth'}
];
export const brandAsset = name => `${process.env.PUBLIC_URL || ''}/brand/${name}`;
