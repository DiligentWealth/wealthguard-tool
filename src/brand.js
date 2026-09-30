export const HORIZONS = [
  {key:'cashSavings',label:'Cash Savings',name:'Immediate',purpose:'Regular spending and near-term withdrawals',color:'#D5A65A',returnKey:'cashSavings'},
  {key:'termDeposit',label:'Capital Preservation',name:'Reserve',purpose:'A reserve for stability and flexibility',color:'#B8873E',returnKey:'capitalPreservation'},
  {key:'incomePortfolio',label:'Income Generator',name:'Income',purpose:'Supporting retirement withdrawals',color:'#8995A8',returnKey:'incomeGenerator'},
  {key:'balancedPortfolio',label:'Steady Growth',name:'Growth',purpose:'Growth for medium-term needs',color:'#526784',returnKey:'steadyGrowth'},
  {key:'growthPortfolio',label:'Strategic Long Term Growth',name:'Long-term',purpose:'Later retirement and long-term goals',color:'#293A61',returnKey:'strategicGrowth'}
];
export const brandAsset = name => `${process.env.PUBLIC_URL || ''}/brand/${name}`;
