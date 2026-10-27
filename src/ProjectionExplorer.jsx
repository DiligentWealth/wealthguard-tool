import React, {useMemo, useState} from 'react';
import {LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer} from 'recharts';
import {buildPlanningPreview} from './planningPreview';
const money = n => new Intl.NumberFormat('en-NZ',{style:'currency',currency:'NZD',maximumFractionDigits:0}).format(n || 0);
function AgeControl({id,name,value,min,onChange}) {
  return <div><label className="block text-sm font-medium mb-2" htmlFor={`preview-age-${id}`}>{name} retirement age</label>
    <div className="flex items-center gap-2">
      <button type="button" aria-label={`${name} retire one year earlier`} disabled={value<=min} onClick={()=>onChange(value-1)} className="wg-step-button">−</button>
      <input id={`preview-age-${id}`} aria-label={`${name} preview retirement age`} type="number" min={min} max="120" value={value} onChange={e=>{if(e.target.value!=='')onChange(Math.max(min,Math.min(120,Number(e.target.value))));}} className="w-20 border rounded-md p-2 text-center"/>
      <button type="button" aria-label={`${name} retire one year later`} disabled={value>=120} onClick={()=>onChange(value+1)} className="wg-step-button">+</button>
    </div></div>;
}
export default function ProjectionExplorer({reference,onApply,onClose}) {
  const [changes,setChanges] = useState({});
  const [today,setToday] = useState(!!reference.showTodaysDollars);
  const value = (key,fallback) => changes[key] ?? reference[key] ?? fallback;
  const set = (key,v) => setChanges(s=>({...s,[key]:v}));
  const joint = !!reference.partnerName?.trim();
  const clientYears = Math.max(0,(reference.retirementAge??65)-(reference.clientAge??60));
  const partnerRetirement = reference.partnerRetirementAge ?? ((reference.partnerAge??60)+clientYears);
  const result = useMemo(()=>{try{return {data:buildPlanningPreview(reference,changes)};}catch(error){return {error:error.message};}},[reference,changes]);
  const p=result.data;
  const chart=p?.chart.map(row=>({...row,reference:row.reference/(today?1.02**row.year:1),preview:row.preview/(today?1.02**row.year:1)}));
  const changed=p && Object.keys(changes).some(key=>changes[key] !== reference[key]);
  const ageLabel=year=>`Year ${year} · age ${(reference.clientAge??60)+Number(year)}${joint?' / '+((reference.partnerAge??60)+Number(year)):''}`;
  return <section className="wg-projection-explorer no-print" aria-label="Planning comparison preview">
    <div className="flex justify-between gap-3 items-start mb-4"><div><h3 className="font-semibold text-lg">Explore planning changes</h3><p className="text-sm text-slate-600 mt-1">Compare with the plan captured when you opened this panel. Preview changes stay here until you apply them.</p></div>
      <button type="button" onClick={onClose} className="text-sm underline shrink-0">Close preview</button></div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-5">
      <AgeControl id="client" name={reference.clientName || 'Client'} value={value('retirementAge',65)} min={Math.min(reference.clientAge??60,reference.retirementAge??65)} onChange={v=>set('retirementAge',v)}/>
      {joint && <AgeControl id="partner" name={reference.partnerName || 'Partner'} value={value('partnerRetirementAge',partnerRetirement)} min={Math.min(reference.partnerAge??60,partnerRetirement)} onChange={v=>set('partnerRetirementAge',v)}/>}
      <label className="text-sm font-medium">Annual spending, including NZ Super<input aria-label="Preview annual spending" type="number" min="0" max="1000000000000" step="1000" value={value('annualIncome',0)} onChange={e=>set('annualIncome',Math.max(0,Number(e.target.value)))} className="block border rounded-md p-2 mt-2 w-full"/><span className="text-xs text-slate-500 font-normal">Today’s dollars</span></label>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
      <div className="wg-preview-option"><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={value('incomeReductionEnabled',false)} onChange={e=>set('incomeReductionEnabled',e.target.checked)}/>Reduced income later in retirement</label>
        <div className="flex flex-wrap gap-3 mt-3"><label className="text-xs">Reduction (%)<input aria-label="Preview income reduction percent" type="number" min="0" max="100" disabled={!value('incomeReductionEnabled',false)} value={value('incomeReductionPercent',20)} onChange={e=>set('incomeReductionPercent',Math.max(0,Math.min(100,Number(e.target.value))))} className="block border rounded p-1 mt-1 w-20"/></label>
        <label className="text-xs">After retirement years<input aria-label="Preview income reduction after years" type="number" min="0" max="120" disabled={!value('incomeReductionEnabled',false)} value={value('incomeReductionAfterYears',15)} onChange={e=>set('incomeReductionAfterYears',Math.max(0,Math.min(120,Math.round(Number(e.target.value)))))} className="block border rounded p-1 mt-1 w-20"/></label></div></div>
      <div className="wg-preview-option"><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={value('agedCareEnabled',false)} onChange={e=>set('agedCareEnabled',e.target.checked)}/>Include additional care costs</label>
        <label className="text-xs block mt-3">Annual care cost, today’s dollars<input aria-label="Preview annual care cost" type="number" min="0" max="1000000000000" step="1000" disabled={!value('agedCareEnabled',false)} value={value('agedCareAnnualCost',0)} onChange={e=>set('agedCareAnnualCost',Math.max(0,Number(e.target.value)))} className="block border rounded p-1 mt-1 w-full"/></label>
        <p className="text-xs text-slate-500 mt-2">Starts {reference.agedCareStartYear??20} years after first retirement; {reference.agedCareDurationYears>0?`${reference.agedCareDurationYears} years`:'ongoing'}.</p></div>
      <div className="wg-preview-option"><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={value('badFirstYearEnabled',false)} onChange={e=>set('badFirstYearEnabled',e.target.checked)}/>Include first-year market stress</label><p className="text-xs text-slate-500 mt-3">Uses the recorded {Math.abs(reference.badFirstYearShockPercent??-20)}% shock to the growth buckets in the first retirement year.</p></div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 mb-3"><label className="text-sm flex items-center gap-2"><input type="checkbox" checked={today} onChange={e=>setToday(e.target.checked)}/>Compare in today’s dollars</label>
      <button type="button" onClick={()=>setChanges({})} className="text-sm underline">Reset preview</button></div>
    {result.error ? <p role="alert" className="p-3 text-sm bg-amber-50 text-amber-900 rounded">{result.error}</p> : <>
      <p className="text-xs text-slate-600 mb-3">Both plans end {p.endYears} years from today, at age {(reference.clientAge??60)+p.endYears}{joint?' / '+((reference.partnerAge??60)+p.endYears):''}. {changed?'The dashed line shows the changed plan.':'No changes yet: the two balance lines overlap.'}</p>
      <div className="wg-preview-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={chart} margin={{left:10,right:15,top:10,bottom:10}}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="year"/><YAxis width={80} tickFormatter={n=>`$${Math.round(n/1000).toLocaleString()}k`}/><Tooltip labelFormatter={ageLabel} formatter={n=>money(n)}/><Legend/>
        <Line isAnimationActive={false} dataKey="reference" name="Reference plan" stroke="#293A61" strokeWidth={3} dot={false}/><Line isAnimationActive={false} dataKey="preview" name="What-if plan" stroke="#c07820" strokeWidth={3} strokeDasharray="7 4" dot={false}/></LineChart></ResponsiveContainer></div>
      <div className="overflow-x-auto mt-4"><table className="w-full text-sm wg-preview-table"><caption className="text-left text-xs text-slate-500 mb-2">Amounts below are future NZD, regardless of the chart display setting.</caption><thead><tr><th scope="col">At the common end date</th><th scope="col">Reference</th><th scope="col">What-if</th></tr></thead><tbody>
        <tr><th scope="row">Final investment balance</th><td>{money(p.baseline.finalBalance)}</td><td>{money(p.preview.finalBalance)}</td></tr>
        <tr><th scope="row">Unfunded spending / one-off withdrawals</th><td>{money(p.baseline.totalShortfall)}</td><td>{money(p.preview.totalShortfall)}</td></tr>
        <tr><th scope="row">All spending and remaining-balance targets met?</th><td>{p.baseline.planFunded?'Yes':'No'}</td><td>{p.preview.planFunded?'Yes':'No'}</td></tr>
      </tbody></table></div>
      <p className="text-sm mt-3 text-slate-700" role="status">Change in final balance: {money(p.preview.finalBalance-p.baseline.finalBalance)}.</p>
      <p className="text-xs text-slate-500 mt-3">These are fixed-return illustrations. Any funding shortfalls remain visible even when investments remain. Retirement payments, spending reductions, care costs and stress move with first retirement; accumulation payments stay in their recorded years.</p>
    </>}
    <div className="flex flex-wrap gap-3 mt-4 items-center"><button type="button" disabled={!p || !changed} onClick={()=>onApply(p.input)} className="bg-blue-700 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">Apply preview to calculator</button><span className="text-xs text-slate-500">Apply, then save as a scenario for report comparisons. Re-run Monte Carlo after applying changes.</span></div>
  </section>;
}
