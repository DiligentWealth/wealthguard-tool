// Other income is external to the modelled investment portfolio. Model year 0 is today.
export function depositOptions(s) {
  return [...(s.accumulationLumpSums||[]).filter(x=>x.type==='deposit').map(x=>({...x,key:`accumulation:${x.id}`,modelYear:x.year})),
    ...(s.retirementLumpSums||[]).filter(x=>x.type==='deposit').map(x=>({...x,key:`retirement:${x.id}`,modelYear:(s.yearsUntilRetirement||0)+x.yearFromRetirement}))];
}
export function incomeEndYear(source, settings) {
  let end = source.endYear == null ? Infinity : source.endYear;
  if (source.endWithDeposit) {
    const deposit=depositOptions(settings).find(x=>x.key===source.endWithDeposit);
    if (!deposit) throw new Error(`Select a valid equity-release deposit for ${source.label || 'other income'}.`);
    end=Math.min(end,deposit.modelYear-1);
  }
  return end;
}
export function otherIncomeForYear(settings, year, inflationRate=.02) {
  return (settings.otherIncomeSources||[]).reduce((total,source)=>{
    let end;try {end=incomeEndYear(source,settings);} catch {return total;}
    if (year<(source.startYear??0) || year>end) return total;
    const annual=(source.amount||0)*(source.frequency==='monthly'?12:1);
    return total+annual*(source.inflate ? (1+inflationRate)**year : 1);
  },0);
}
