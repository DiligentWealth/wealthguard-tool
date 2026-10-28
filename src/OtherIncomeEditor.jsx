import React from 'react';
import {depositOptions,incomeEndYear} from './otherIncome';
export default function OtherIncomeEditor({sources,onChange,settings,clientAge,partnerAge,isJoint}) {
  const deposits=depositOptions(settings);
  const update=(id,field,value)=>onChange(sources.map(s=>s.id===id?{...s,[field]:value}:s));
  const ages=year=>`Year ${year}: age ${clientAge+year}${isJoint?' / '+(partnerAge+year):''}`;
  return <section className="wg-other-income mt-5 p-4 border border-slate-200 rounded-lg" aria-label="Other retirement income">
    <div className="flex justify-between items-center flex-wrap gap-3"><div><h3 className="font-semibold">Other retirement income</h3><p className="text-sm text-slate-600 mt-1">Income available for spending after tax, expenses and any loan payments. Exclude NZ Super, employment income and returns or distributions from investments already modelled here.</p></div>
      <button type="button" className="bg-slate-700 text-white px-3 py-2 rounded-md text-sm" onClick={()=>onChange([...sources,{id:Math.max(Date.now(),...sources.map(x=>x.id+1)),label:'',amount:0,frequency:'annual',startYear:settings.yearsUntilRetirement,endYear:null,inflate:false,endWithDeposit:''}])}>Add income source</button></div>
    <p className="text-xs text-slate-500 mt-2">Years are measured from today: year 0 is the current model year. Income only offsets retirement spending; any surplus is not automatically reinvested. An end year is included in full.</p>
    {!sources.length && <p className="text-sm text-slate-500 mt-3">No other income included.</p>}
    {sources.map((source,index)=>{
      let endText='',invalid=false;try{const end=incomeEndYear(source,settings);if(end<source.startYear){invalid=true;endText='Income ends before it starts. Review the dates and linked deposit.';}else endText=Number.isFinite(end)?`Income stops after ${ages(end)}.`:'Income continues to the end of the projection.';}catch(error){invalid=true;endText=error.message;}
      return <fieldset key={source.id} className="mt-4 bg-slate-50 p-4 rounded-lg"><legend className="text-sm font-medium px-1">Income source {index+1}</legend>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-sm">Description<input aria-label={`Income source ${index+1} description`} maxLength="2000" placeholder="e.g. Net rental income" value={source.label} onChange={e=>update(source.id,'label',e.target.value)} className="wg-income-input"/></label>
          <label className="text-sm">Net amount<input aria-label={`Income source ${index+1} amount`} type="number" min="0" max="1000000000000" value={source.amount} onChange={e=>update(source.id,'amount',Math.max(0,Number(e.target.value)))} className="wg-income-input"/></label>
          <label className="text-sm">Frequency<select aria-label={`Income source ${index+1} frequency`} value={source.frequency} onChange={e=>update(source.id,'frequency',e.target.value)} className="wg-income-input"><option value="annual">Per year</option><option value="monthly">Per month</option></select></label>
          <label className="text-sm">Start year<input aria-label={`Income source ${index+1} start year`} type="number" min="0" max="240" value={source.startYear} onChange={e=>update(source.id,'startYear',Math.max(0,Math.min(240,Math.trunc(Number(e.target.value)))))} className="wg-income-input"/><small>{ages(source.startYear)}</small></label>
          <label className="text-sm">End year (blank = ongoing)<input aria-label={`Income source ${index+1} end year`} type="number" min={source.startYear} max="240" value={source.endYear??''} onChange={e=>update(source.id,'endYear',e.target.value===''?null:Math.max(source.startYear,Math.min(240,Math.trunc(Number(e.target.value)))))} className="wg-income-input"/></label>
          <label className="text-sm">Stop before equity-release deposit<select aria-label={`Income source ${index+1} linked deposit`} value={source.endWithDeposit||''} onChange={e=>update(source.id,'endWithDeposit',e.target.value)} className="wg-income-input"><option value="">No linked deposit</option>{source.endWithDeposit&&!deposits.some(x=>x.key===source.endWithDeposit)&&<option value={source.endWithDeposit}>Deposit removed — select another</option>}{deposits.map(d=><option key={d.key} value={d.key}>{d.label||'Deposit'} · year {d.modelYear}</option>)}</select></label>
        </div>
        <div className="flex justify-between flex-wrap gap-3 mt-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!source.inflate} onChange={e=>update(source.id,'inflate',e.target.checked)}/>Increase at 2% p.a. from today (amount entered in today’s dollars)</label><button type="button" aria-label={`Remove income source ${index+1}`} onClick={()=>onChange(sources.filter(s=>s.id!==source.id))} className="text-red-700 text-sm underline">Remove source</button></div>
        <p role={invalid?'alert':undefined} className="text-xs text-slate-600 mt-2">{endText} A linked deposit is received at year start, so no income from this source is included in its deposit year.</p>
      </fieldset>;
    })}
  </section>;
}
