import React,{useState,useEffect} from 'react';
import {GUIDED_STEPS,guidedChecks} from './guidedSetup';
const money=n=>new Intl.NumberFormat('en-NZ',{style:'currency',currency:'NZD',maximumFractionDigits:0}).format(n||0);
export function CalculatorViewSwitch({guided,onChange}) {
 return <div className="wg-view-switch no-print" aria-label="Calculator view"><span className="text-sm font-semibold">Calculator view</span><div className="flex gap-2 flex-wrap"><button type="button" aria-pressed={!guided} onClick={()=>onChange(false)}>Full calculator</button><button type="button" aria-pressed={guided} onClick={()=>onChange(true)}>Guided setup</button></div><small>Switch views at any time; your entries stay in place.</small></div>;
}
export function GuidedOptional({guided,title,defaultExpanded=false,hidden=false,children}) {
 const [open,setOpen]=useState(defaultExpanded);
 useEffect(()=>{if(guided)setOpen(defaultExpanded);},[guided,defaultExpanded]);
 return <div hidden={hidden} className={guided?'wg-guided-optional':''}>{guided?<><button type="button" aria-expanded={open} onClick={()=>setOpen(v=>!v)} className="wg-optional-toggle">{title}<span>{open?'Hide':'Show'}</span></button><div hidden={!open}>{children}</div></>:children}</div>;
}
export function GuidedControls({step,onStep,scenario,context}) {
 const index=GUIDED_STEPS.findIndex(x=>x.id===step),current=GUIDED_STEPS[index],check=guidedChecks(scenario,context);
 return <section id="guided-controls" className="wg-guided-controls no-print" aria-label="Guided setup controls"><div className="flex items-center justify-between flex-wrap gap-2"><p className="text-xs uppercase tracking-widest text-slate-500">Optional guided preview · same calculator</p><p className="text-xs text-slate-600">Step {index+1} of {GUIDED_STEPS.length}</p></div>
   <nav aria-label="Guided setup steps"><ol className="wg-guided-steps">{GUIDED_STEPS.map((s,i)=><li key={s.id}><button type="button" aria-current={s.id===step?'step':undefined} onClick={()=>onStep(s.id)}><span>{String(i+1).padStart(2,'0')}</span><strong>{s.label}</strong><small>{check.ready[s.id]?'Inputs present':'Needs review'}</small></button></li>)}</ol></nav>
   <h2 className="font-semibold text-lg">{current.label}</h2><p className="text-sm text-slate-600 mt-1">{current.help}</p><p className="text-xs text-slate-500 mt-2">“Inputs present” is a completeness check, not confirmation that the advice or assumptions are suitable.</p>
 </section>;
}
export function GuidedFooter({step,onStep}) {
 const index=GUIDED_STEPS.findIndex(x=>x.id===step);
 return <div className="wg-guided-footer no-print"><button type="button" disabled={index===0} onClick={()=>onStep(GUIDED_STEPS[index-1].id)}>Back{index>0?`: ${GUIDED_STEPS[index-1].label}`:''}</button><span className="text-xs text-slate-500">Changes remain in the calculator. Save a scenario when ready.</span><button type="button" disabled={index===GUIDED_STEPS.length-1} onClick={()=>onStep(GUIDED_STEPS[index+1].id)}>{index<GUIDED_STEPS.length-1?`Next: ${GUIDED_STEPS[index+1].label}`:'Last step'}</button></div>;
}
export function GuidedReview({scenario,context,onStep}) {
 const check=guidedChecks(scenario,context);
 return <section className="wg-guided-review no-print" aria-label="Plan review checklist"><h2 className="font-semibold text-xl">Check the plan before presenting it</h2>
   <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4"><div><small>Total annual spending</small><strong>{money(scenario.annualIncome)}</strong><span>Today’s dollars, including NZ Super</span></div><div><small>First-year investment withdrawal needed</small><strong>{money(context.firstYearDrawdown)}</strong><span>Today’s dollars, after wages, NZ Super and other income</span></div><div><small>Other income at first retirement</small><strong>{money(context.firstYearOtherIncomeToday)}</strong><span>Today’s dollars, outside the modelled portfolio</span></div></div>
   <p className="mt-4 text-sm">First retirement is in model year {context.yearsUntilRetirement}. Final investment balance: {money(context.finalBalance)} in future dollars. Unfunded spending and one-off withdrawals: {money(context.totalShortfall)} in future dollars.</p>
   <p className="mt-2 text-sm font-semibold">{context.planFunded?'The selected spending and remaining-balance targets are met in this fixed-return projection.':'The projection does not meet every selected spending or remaining-balance target.'}</p>
   {check.warnings.length ? <ul className="wg-review-warnings">{check.warnings.map((w,i)=><li key={i}><span>{w.text}</span><button type="button" onClick={()=>onStep(w.step)}>Review {GUIDED_STEPS.find(s=>s.id===w.step)?.label.toLowerCase()}</button></li>)}</ul>:<p className="text-sm mt-3">No basic input issues were identified. Check the underlying assumptions with the client.</p>}
   <p className="text-xs text-slate-500 mt-3">A positive investment balance can coexist with a funding shortfall under the bucket rules. Projections are illustrations, not guarantees. Use the graphs below to explore changes, then save your scenario and export the report from the top of the page.</p>
 </section>;
}
