import { HORIZONS, brandAsset } from './brand';
import { normaliseAllocations } from './engine';

export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => new Intl.NumberFormat('en-NZ',{style:'currency',currency:'NZD',maximumFractionDigits:0}).format(Number(n)||0);
const pct = (n, digits = 1) => `${Number(n || 0).toFixed(digits)}%`;
const chunks = (a,n) => Array.from({length:Math.ceil(a.length/n)},(_,i)=>a.slice(i*n,(i+1)*n));
let assetsPromise;
export function loadReportAssets(){
  if(!assetsPromise) assetsPromise = Promise.all(['diligent-logo.png','report-hero.jpg',...['inter','manrope'].flatMap(f=>[400,600,700].map(w=>`fonts/${f}-latin-${w}-normal.woff2`))].map(async name=>{
    const res=await fetch(brandAsset(name)); if(!res.ok) throw new Error(`Report asset unavailable: ${name}`);
    const blob=await res.blob(); const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);});return [name,data];
  })).then(Object.fromEntries).catch(e=>{assetsPromise=null;throw e;});
  return assetsPromise;
}
function chart(data, series, label){
  const w=640,h=180,l=64,r=18,t=20,b=38;
  const max=Math.max(1,...data.flatMap(d=>series.map(s=>Number(d[s.key])||0)))*1.08;
  const maxYear=Math.max(1,...data.map(d=>d.year));
  const x=y=>l+(w-l-r)*y/maxYear, y=v=>h-b-(h-t-b)*v/max;
  let svg=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeHTML(label)}"><title>${escapeHTML(label)}</title>`;
  for(let i=0;i<=4;i++){const v=max*i/4;svg+=`<line x1="${l}" x2="${w-r}" y1="${y(v)}" y2="${y(v)}" stroke="#DFE2E7"/><text x="${l-8}" y="${y(v)+4}" text-anchor="end">${v>=1e6?(v/1e6).toFixed(1)+'m':Math.round(v/1000)+'k'}</text>`;}
  for(let i=0;i<=4;i++){const v=Math.round(maxYear*i/4);svg+=`<text x="${x(v)}" y="${h-17}" text-anchor="middle">${v}</text>`;}
  series.forEach(s=>{svg+=`<path d="${data.map((d,i)=>`${i?'L':'M'}${x(d.year).toFixed(2)},${y(Number(d[s.key])||0).toFixed(2)}`).join(' ')}" fill="none" stroke="${s.color}" stroke-width="2.5"${s.dash?` stroke-dasharray="${s.dash}"`:""}/>`;});
  svg+=`<text x="${w/2}" y="${h-1}" text-anchor="middle">Years from today</text></svg>`;
  return svg+`<div class="legend">${series.map(s=>`<span><i style="background:${s.color}"></i>${escapeHTML(s.label)}</span>`).join('')}</div>`;
}
function monteCarloFan(bands){
  if(!bands?.length) return '';
  const w=640,h=240,l=64,r=18,t=16,b=38;
  const max=Math.max(1,...bands.map(d=>d.p90))*1.08;
  const maxYear=Math.max(1,...bands.map(d=>d.year));
  const x=v=>l+(w-l-r)*v/maxYear,y=v=>h-b-(h-t-b)*v/max;
  const points=(rows,key)=>rows.map((d,i)=>`${i?'L':'M'}${x(d.year).toFixed(2)},${y(d[key]).toFixed(2)}`).join(' ');
  const area=(low,high,color)=>`<path d="${points(bands,high)} ${points([...bands].reverse(),low).replace(/^M/,'L')} Z" fill="${color}"/>`;
  let svg=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Monte Carlo investment balance range in future dollars"><title>Monte Carlo investment balance range in future dollars</title>`;
  for(let i=0;i<=4;i++){const v=max*i/4;svg+=`<line x1="${l}" x2="${w-r}" y1="${y(v)}" y2="${y(v)}" stroke="#DFE2E7"/><text x="${l-8}" y="${y(v)+4}" text-anchor="end">${v>=1e6?(v/1e6).toFixed(1)+'m':Math.round(v/1000)+'k'}</text>`;const year=Math.round(maxYear*i/4);svg+=`<text x="${x(year)}" y="${h-17}" text-anchor="middle">${year}</text>`;}
  svg+=area('p10','p90','#DEE6F0')+area('p25','p75','#91A9C6')+`<path d="${points(bands,'p50')}" fill="none" stroke="#293A61" stroke-width="3"/><text x="${w/2}" y="${h-1}" text-anchor="middle">Years from today</text></svg>`;
  return svg+'<div class="legend"><span><i style="background:#293A61"></i>Median (50th percentile)</span><span><i style="background:#91A9C6"></i>Middle 50% (25th–75th)</span><span><i style="background:#DEE6F0"></i>Middle 80% (10th–90th)</span></div>';
}
function shortfallHistogram(mc,yearsUntilRetirement){
  const counts=new Map();
  mc.depletionYears.forEach(year=>{const start=Math.floor((year-yearsUntilRetirement)/5)*5;counts.set(start,(counts.get(start)||0)+1);});
  const bins=[...counts].sort((a,b)=>a[0]-b[0]);
  if(!bins.length) return '<p class="note">No simulated run missed a spending, one-off withdrawal or remaining-balance target.</p>';
  const w=640,h=130,l=40,b=32,t=12,space=(w-l-12)/bins.length,max=Math.max(...bins.map(x=>x[1]));
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Number of simulations by first unmet target, in years from first retirement"><title>Number of simulations by first unmet target, in years from first retirement</title>${bins.map(([year,count],i)=>{const height=(h-b-t-14)*count/max;const x=l+i*space+space*.15;return `<rect x="${x}" y="${h-b-height}" width="${space*.7}" height="${height}" fill="#D5A65A"/><text x="${x+space*.35}" y="${h-b-height-5}" text-anchor="middle">${count}</text><text x="${x+space*.35}" y="${h-17}" text-anchor="middle">${year}–${year+4}</text>`;}).join('')}<text x="${w/2}" y="${h-1}" text-anchor="middle">Years from first retirement</text></svg>`;
}
function table(headers,rows){return `<table><thead><tr>${headers.map(h=>`<th>${escapeHTML(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(c=>`<td>${escapeHTML(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;}
function metric(label,value,note=''){return `<div class="metric"><small>${escapeHTML(label)}</small><strong>${escapeHTML(value)}</strong><span>${escapeHTML(note)}</span></div>`;}
export function buildReportHTML(p,assets,options={}){
  const s=p.scenario,d=p.projectionData;
  const names=[s.clientName,s.partnerName].filter(n=>n?.trim()).join(' & ')||'Retirement scenario';
  const date=new Date(p.generatedAt||Date.now()).toLocaleDateString('en-NZ',{day:'numeric',month:'long',year:'numeric'});
  const years=p.yearsUntilRetirement;
  const last=d[d.length-1];
  const first=d.find(row=>row.year===years)||d[0];
  const weights=normaliseAllocations(s.allocations);
  const details=p.reportDetails||s.reportDetails||{};
  const business=p.reportBusiness||{};
  const proposal=details.kind==='proposal';
  const textBlock=(title,value)=>value?.trim()?`<h3>${escapeHTML(title)}</h3><p class="user-text">${escapeHTML(value)}</p>`:'';
  const pages=[];
  const add=(title,sub,body)=>pages.push({title,sub,body});
  add('Your retirement outlook',proposal?'Proposed retirement strategy':'Your retirement review',`
    <p class="lead">${proposal?'This report illustrates how a WealthGuard approach could support your retirement spending.':'This report brings together your investments, retirement spending target and expected income to help review your WealthGuard strategy.'}</p>
    <div class="metrics">${metric('Current investment balance',money(p.totalPortfolio),'Including KiwiSaver')}${metric('Annual spending target',money(s.annualIncome),"Today’s dollars")}${metric('First-year withdrawal needed',money(p.firstYearDrawdown),"Today’s dollars; after wages and NZ Super")}</div>
    <div class="callout"><strong>${p.planFunded?'The targets are met in this projection':'The projection does not meet all your targets'}</strong><p>${p.planFunded?'Using the assumptions in this report, available investment money meets the planned spending and other withdrawals throughout the period shown, together with the target for money remaining at the end.':`Projected spending and one-off withdrawal shortfalls total ${money(p.totalShortfall)} in future dollars. The final balance is ${money(last.Total)}, compared with a remaining-balance target of ${money(s.legacyTarget)}.`} This depends on the assumptions. Lower returns, higher spending or a longer retirement could change the outcome.</p></div>
    ${s.useGrossSuper?'<div class="callout"><strong>Gross NZ Super selected</strong><p>Pre-tax NZ Super is used to offset spending. This can understate the investment withdrawals needed for after-tax spending. Review the tax basis with your adviser.</p></div>':''}
    <h3>Your retirement dates</h3>${table(['Person','Current age','Retirement age','Years until retirement','Net working income / year'],[[s.clientName||'Client',s.clientAge,s.retirementAge,Math.max(0,s.retirementAge-s.clientAge),money(s.clientWorkingIncome)],...(s.partnerName?.trim()?[[s.partnerName,s.partnerAge,s.partnerRetirementAge,Math.max(0,s.partnerRetirementAge-s.partnerAge),money(s.partnerWorkingIncome)]]:[])])}
    <p class="note">Household retirement spending begins when the first person retires. Any employment income entered for the other person helps meet that spending until their own retirement. The amounts above are available for spending after tax and KiwiSaver deductions, in today’s dollars. Zero means no employment income is included.</p>
    <h3>Estimated investment balances</h3><div class="metrics">${metric('At first retirement',money(p.portfolioAtRetirement),'Future dollars')}${metric('Available for withdrawal',money(p.accessibleAtRetirement),'At first retirement, before annual payments')}${metric('At the end of the projection',money(last.Total),`After ${s.projectionYears} retirement years`)}</div>
    <p class="note">Retirement spending begins ${years===0?'now':`in ${years} years`}. The projection ends ${last.year} years from today${s.partnerName?.trim()?`, when ${escapeHTML(s.clientName||'the client')} is ${s.clientAge+last.year} and ${escapeHTML(s.partnerName)} is ${s.partnerAge+last.year}`:`, at age ${s.clientAge+last.year}`}. Future dollar amounts are not adjusted back to today’s purchasing power.</p>
  `);
  if(details.goals?.trim()||details.commentary?.trim()) add(proposal?'Your goals and proposed approach':'Your review discussion','Adviser commentary',`${textBlock('Your goals',details.goals)}${textBlock('Adviser commentary',details.commentary)}<p class="note">This commentary accompanies the projection. Read it alongside the assumptions, risks and any related advice documents.</p>`);
  add('Five buckets. One strategy.','How WealthGuard organises your investments',`
    <p class="lead">WealthGuard organises investments according to when you may need the money, from nearer-term spending through to later retirement needs.</p>
    <div class="horizon-line">${HORIZONS.map((b,i)=>`<div><span>${String(i+1).padStart(2,'0')}</span><strong>${b.label}</strong></div>`).join('')}</div>
    <div class="allocation-bar">${HORIZONS.map(b=>`<span style="width:${weights[b.key]}%;background:${b.color}"></span>`).join('')}</div>
    ${table(['Bucket','Purpose','Allocation','Amount'],HORIZONS.map(b=>[b.label,b.purpose,pct(weights[b.key]),money(p.retirementAllocDollars[b.key])]))}
    <p class="note">The figures illustrate the allocation of investments available for withdrawal at first retirement, in future dollars. They may differ from current holdings. Allocations are scaled to 100% in the model. KiwiSaver assumed to remain unavailable at that point (${money(first.lockedKiwiSaver)}) is excluded.</p>
    <h3>Supporting regular spending</h3><p>Money for regular spending would generally come from Cash Savings. Your adviser would review how and when to replenish it, taking account of your needs, available investments and market conditions. The projection uses simplified withdrawal rules; actual transactions may differ following an adviser review.</p>
    <p>The aim is to provide money for nearer-term spending while allowing longer-term investments more time to grow. This can help reduce pressure to sell longer-term investments during a market downturn, although it cannot remove that risk.</p>
    <p class="note">Bucket names describe their intended purpose. They do not guarantee income or protect against losses. Risk depends on the investments held, including market movements and withdrawal restrictions.</p>
  `);
  add('Your retirement projections','Understanding the projections',`
    <h3>Your projected investment balance · future dollars</h3>${chart(d,[{key:'Total',label:'Total investments',color:'#293A61'},{key:'accessibleTotal',label:'Available for withdrawal',color:'#3b82f6',dash:'6 3'},{key:'lockedKiwiSaver',label:'KiwiSaver not yet available',color:'#f97316',dash:'2 3'}],'Projected investment balances')}
    <h3>Your projected retirement cash flow · future dollars</h3>${chart(d.slice(0,-1),[{key:'drawdownRequired',label:'Withdrawals needed',color:'#293A61'},{key:'drawdownActual',label:'Projected withdrawals',color:'#f97316',dash:'6 3'},{key:'employmentIncome',label:'Employment income',color:'#16a34a'},{key:'superIncome',label:'NZ Super',color:'#a855f7'}],'Projected annual retirement cash flow')}
    <p class="note"><strong>Withdrawals needed</strong> means spending to be met from investments after the employment income and NZ Super included. <strong>Projected withdrawals</strong> means what the investments can provide under the assumptions. Any gap is a projected shortfall. One-off payments are separate.</p>
    <p class="note">Balances are shown at year start and payments occur during the year. The final balance point has no further year of spending. Inflation means future amounts generally buy less than the same amount today.</p>
    <div class="callout"><strong>An illustration, not a prediction</strong><p>The main projection uses fixed annual return assumptions. Real returns vary and losses can occur. Use the charts to understand the direction and timing of your plan, rather than to predict investment values.</p></div>
  `);
  add('Investment return assumptions','The basis of your projection',`
    ${table(['Bucket','Return during retirement / year','Return before retirement / year'],HORIZONS.map(b=>[b.label,pct(s.returns[b.returnKey],2),['cashSavings','balancedPortfolio','growthPortfolio'].includes(b.key)?pct(s.accumulationReturns[b.key],2):'Not used']))}
    <h3>Returns after fees and tax</h3><p>The annual return assumptions have been entered by your adviser after allowing for investment tax, fund fees, platform fees and advice fees. These costs are already reflected in the projected balances and are not deducted again.</p>
    <p>The rates are planning assumptions, not guaranteed returns. Actual returns will vary, and investments can lose value. Your actual fees and adviser remuneration are described in the relevant advice and disclosure information.</p>
    <h3>Before retirement</h3>${table(['Bucket','Illustrated allocation'],HORIZONS.filter(b=>['cashSavings','balancedPortfolio','growthPortfolio'].includes(b.key)).map(b=>[b.label,pct(normaliseAllocations(s.accumulationAllocations)[b.key])]))}
    <p class="note">Before first retirement, available investments use these allocations and return assumptions. KiwiSaver that is not yet available continues to use them until the relevant person’s assumed access date.</p>
    <h3>Matching the approach to you</h3><p>An investment recommendation also needs to consider your circumstances, goals, tolerance for losses and ability to manage changes in investment value. Review the allocation and its underlying investments with your adviser.</p>
  `);
  const assumptions=[
    ['Inflation','2% a year from today for retirement spending and additional care costs; actual living costs may increase differently.'],
    ['Regular contributions',`${money(p.annualContribution)} a year; end when the first person retires.`],
    ['KiwiSaver contributions',`${money(p.annualKsClient)} client; ${money(p.annualKsPartner)} partner a year. Each stops at that person’s retirement in this projection.`],
    ['KiwiSaver access','Assumed at each person’s age 65. Actual eligibility and restrictions need to be confirmed.'],
    ['NZ Super',`${s.useGrossSuper?'Gross':'After-tax M tax-code'} rates dated 1 April 2026; ${s.inflateSuper?'future increases assumed at 2% a year':'payments held fixed'}. Client ${s.clientSuperIneligible?'excluded':'assumed eligible from 65'}; partner ${s.partnerSuperIneligible?'excluded':'assumed eligible from 65 if joint'}.`],
    ['Spending reduction',s.incomeReductionEnabled?`${s.incomeReductionPercent}% after ${s.incomeReductionAfterYears} years from first retirement.`:'No reduction included.'],
    ['Additional care costs',s.agedCareEnabled?`${money(s.agedCareAnnualCost)} a year in today’s dollars, from year ${s.agedCareStartYear} after first retirement, ${s.agedCareDurationYears?`for ${s.agedCareDurationYears} years`:'ongoing'}.`:'No additional care-cost provision included.'],
    ['First-year market stress',s.badFirstYearEnabled?`${pct(s.badFirstYearShockPercent)} return applied to Steady Growth and Strategic Long Term Growth in the first retirement year.`:'Not included.'],
    ['Money remaining at the end',`${money(s.legacyTarget)} target in future dollars.`]
  ];
  add('Other assumptions and limitations','Understanding the calculation',`${table(['Assumption','What is included'],assumptions)}
    <h3>What to check with your adviser</h3><p>NZ Super eligibility is assumed from the information entered. Actual entitlement and after-tax payments depend on your circumstances and the rules at the time. Assumed future increases are estimates, not confirmed government rates. Care costs are spending assumptions; the projection does not determine eligibility for government assistance.</p>
    <h3>How payments are timed</h3><p>The calculation uses whole years: contributions and one-off payments are applied at year start, followed by investment returns and then annual spending withdrawals. Actual payments occur throughout the year. This simplified timing can produce a more favourable result than regular withdrawals during the year.</p>
    <p class="note">Employment income above spending needs is not automatically added to investments. Separate gifting and wealth-transfer illustrations are not deducted from these balances. Spending beyond the period shown is not assessed.</p>
    <p class="note">NZ Super rate reference: workandincome.govt.nz/eligibility/seniors/superannuation/how-much-you-can-get.html</p>`);
  const events=[...(s.accumulationLumpSums||[]).filter(e=>e.amount>0).map(e=>[e.label||'Before-retirement payment',e.type==='deposit'?'Money added':'Money withdrawn',`Year ${e.year} from today`,money(e.amount)]),...(s.retirementLumpSums||[]).filter(e=>e.amount>0).map(e=>[e.label||'Retirement payment',e.type==='deposit'?'Money added':'Money withdrawn',`Year ${e.yearFromRetirement} after first retirement`,money(e.amount)])];
  chunks(events,12).forEach((rows,i)=>add('Planned additions and withdrawals',i?'One-off payments · continued':'One-off payments',`${table(['Description','Payment','Timing','Amount'],rows)}<p class="note">Amounts are in dollars at the expected payment date and are not automatically increased for inflation. They enter at the start of the selected year. Actual timing may differ. Expected inheritances, sale proceeds and other future receipts remain assumptions until confirmed and available.</p>`));
  if(p.mcResults){const mc=p.mcResults;add('What if investment returns vary?','Exploring uncertainty',`
    <p class="lead">Poor returns early in retirement can have a lasting effect, particularly when money is being withdrawn at the same time.</p><p>A simulation tests many different sequences of annual returns. This is sometimes called a Monte Carlo simulation.</p>
    <div class="metrics">${metric('Scenarios meeting all targets',pct(mc.successRate*100))}${metric('Scenarios tested',Number(mc.numSims).toLocaleString('en-NZ'))}${metric('Scenarios missing at least one target',Number(mc.depletionYears.length).toLocaleString('en-NZ'))}</div>
    <p>Meeting all targets means covering the spending, one-off withdrawals and remaining-balance target in this report. Other scenarios miss at least one target; this does not necessarily mean investments are exhausted.</p>
    <div class="callout"><strong>How to interpret the percentage</strong><p>It describes scenarios tested by the model, not a measured probability that your retirement plan will succeed. It does not guarantee an outcome. Different assumptions could produce different results.</p></div>
    <h3>Market fluctuation assumptions</h3>${table(['Bucket','Assumed annual variability'],[['Income Generator',pct(s.volatilities.incomeGenerator)],['Steady Growth',pct(s.volatilities.steadyGrowth)],['Strategic Long Term Growth',pct(s.volatilities.strategicGrowth)]])}
    <p class="note">These figures describe the size of annual return fluctuations used in the model. Fluctuations before retirement are ${s.mcAccumulationEnabled?'included':'not included'}. The withdrawal-rule down-year threshold is ${pct(s.mcSettings.downYearThreshold)}.</p>
    <p>The model simplifies markets. Severe losses, prolonged downturns and unusual events may be understated. Cash Savings and Capital Preservation returns are held fixed for modelling; this does not guarantee their returns or protect against losses.</p>
  `);
    if(mc.bands?.length){const end=mc.bands[mc.bands.length-1];add('The range of simulated outcomes','Monte Carlo simulation graphs',`
      <h3>Investment balances across simulated outcomes · future dollars</h3>${monteCarloFan(mc.bands)}
      <p class="note">At each year, the dark shaded band contains the middle 50% of simulated balances and the light band extends to the middle 80%. The navy line is the median. Outcomes outside the shaded bands are possible. The lines join yearly percentiles; they do not represent individual investment paths.</p>
      <div class="metrics">${metric('Lower end balance',money(end.p10),'10th percentile')}${metric('Median end balance',money(end.p50),'50th percentile')}${metric('Upper end balance',money(end.p90),'90th percentile')}</div>
      <h3>When simulated runs first missed a target</h3>${shortfallHistogram(mc,years)}
      <p class="note">Bar labels show the number of runs first missing a target within each five-year period, measured from first retirement. A missed target can be a spending or one-off withdrawal shortfall, or a balance below the target at the end; it does not necessarily mean the investments ran out. Each run is counted once.</p>
      <p class="note">These are modelled outcomes, not forecasts or a measured probability of success. Future dollars are not adjusted for inflation. Re-running the simulation can change the results.</p>
    `);}
  } else add('Reviewing your plan under uncertainty','Discussion with your adviser',`<p class="lead">The main projection uses fixed return assumptions. A simulation of varying annual returns has not been included.</p><p>Before making decisions, consider:</p><ul><li>How lower investment returns could affect your spending.</li><li>Whether withdrawals could be reduced following a market downturn.</li><li>Whether enough money is available before KiwiSaver can be accessed.</li><li>How higher living costs or a longer retirement could affect the plan.</li><li>Whether care-cost and family-support assumptions remain appropriate.</li></ul><p>Your adviser can explore alternative scenarios and explain how they affect the results.</p>`);
  if(p.comparison){const c=p.comparison;const cols=c.columns;
    const rows=[...(c.agesDiffer ? [['Current ages (client / partner)',...cols.map(x=>`${x.summary.clientAge}${x.summary.partnerName ? ` / ${x.summary.partnerAge}` : ''}`)],['Ages at comparison end',...cols.map(x=>`${x.summary.clientAge+c.endYears}${x.summary.partnerName ? ` / ${x.summary.partnerAge+c.endYears}` : ''}`)]] : []),['Client retirement age',...cols.map(x=>x.summary.retirementAge)],['Partner retirement age',...cols.map(x=>x.summary.partnerName?x.summary.partnerRetirementAge:'—')],["Spending / year (today’s dollars)",...cols.map(x=>money(x.summary.annualIncome))],['Balance at first retirement¹',...cols.map(x=>money(x.summary.portfolioAtRetirement))],['Available at first retirement¹',...cols.map(x=>money(x.summary.accessibleAtRetirement))],["First-year withdrawal needed (today’s dollars)",...cols.map(x=>money(x.summary.firstYearDrawdown))],['Spending / withdrawal shortfalls¹',...cols.map(x=>money(x.summary.totalShortfall))],['Balance at common end date¹',...cols.map(x=>money(x.summary.finalBalance))],['Remaining-balance target¹',...cols.map(x=>money(x.summary.legacyTarget))],['Remaining-balance target met?',...cols.map(x=>x.summary.legacyMet?'Yes':'No')]];
    add('Comparing your retirement options','Scenario comparison',`<p>All scenarios end ${c.endYears} years from today, at age ${c.finalAge} for Scenario A’s younger client${cols[0].summary.partnerName?'':' (or the client if single)'}. Earlier retirement generally means fewer contribution years and more withdrawal years.</p>
      ${c.warnings?.length?`<p class="note"><strong>Check the selected scenarios:</strong> ${escapeHTML(c.warnings.join(' '))} All scenarios use the same number of years from today; final ages may differ.</p>`:''}<p class="note">${cols.map((x,i)=>`${['A','B','C'][i]}: ${escapeHTML(x.label)}`).join(' · ')}</p>
      ${table(['Comparison',...cols.map((x,i)=>`Scenario ${['A','B','C'][i]}`)],rows).replace('<table>','<table class="comparison-table">')}
      ${chart(c.chart,cols.map((x,i)=>({key:'scenario'+i,label:`Scenario ${['A','B','C'][i]}`,color:['#293A61','#f97316','#16a34a'][i],dash:['','7 3','2 3'][i]})),'Investment balances compared to a common end date')}
      <p class="note">¹ Future dollars. Shortfalls add spending and one-off withdrawals over the common period. ${c.differences.length?'Other financial inputs differ: '+escapeHTML(c.differences.join(', '))+'.':'Retirement dates are the only financial inputs changed; the comparison end date is aligned.'}</p>
      <p class="note">${c.relativeEvents?'Retirement payments, care costs, spending reductions and first-year stress stay relative to each scenario’s first retirement, so their calendar timing may change. ':''}These are fixed-return illustrations, not predictions or a determination of which option is suitable. Saved scenarios are unchanged.</p>`);
  }
  add('Your advice and next steps','Keeping your plan up to date',`
    <p>This report is a retirement planning illustration using the information and assumptions recorded for you. ${proposal?'The illustrated approach is for discussion; it does not indicate that recommendations have been agreed.':'Use it with your adviser to review whether your existing approach remains appropriate.'}</p>
    <h3>Before making changes</h3><p>Confirm that retirement dates, spending needs, investments and other income are recorded correctly. Your adviser can explain relevant risks, costs and alternatives, and how recommendations relate to your circumstances.</p>
    ${textBlock('Related advice document',details.adviceReference)}${textBlock('Disclosure and complaints information',business.disclosureReference)}
    <h3>Fees and disclosure information</h3><p>Read the relevant advice and disclosure information for your fees, adviser remuneration, relevant conflicts of interest, advice limitations and complaints process. Ask your adviser if you need a copy or an explanation.</p>
    <h3>Keeping the plan current</h3><p>Agree a review schedule with your adviser. Contact us sooner if spending, health, employment, family circumstances or your financial position changes materially.</p>
    <div class="callout"><strong>Please ask about anything that is unclear</strong><p>We want you to understand the assumptions, risks and implications before deciding what to do.</p></div>
  `);
  if(options.appendix) chunks(d,14).forEach((rows,i)=>add('Your annual projection',`Annual figures · ${i+1}`,`${table(['Year','Investment balance','KiwiSaver not yet available','Employment income','NZ Super','Withdrawals needed','Projected withdrawals','Projected shortfall'],rows.map(r=>[r.year,money(r.Total),money(r.lockedKiwiSaver),money(r.employmentIncome),money(r.superIncome),money(r.drawdownRequired),money(r.drawdownActual),money(r.shortfall+r.lumpSumShortfall)]))}<p class="note">All amounts are future dollars. Balances are at year start. Shortfalls include spending and one-off withdrawals, but not a missed remaining-balance target. One-off payments are listed separately. The final row is the closing balance with no further year of spending.</p>`));
  const logo=`<img class="logo" src="${assets['diligent-logo.png']}" alt="Diligent Wealth">`;
  const total=pages.length+1;
  const footer=i=>`<footer><span>${escapeHTML(names)} · Confidential</span><span>WealthGuard · ${i} / ${total}</span></footer>`;
  const fontCSS=['inter','manrope'].flatMap(f=>[400,600,700].map(w=>`@font-face{font-family:${f};font-style:normal;font-weight:${w};src:url('${assets[`fonts/${f}-latin-${w}-normal.woff2`]}') format('woff2');}`)).join('');
  return `<!doctype html><html lang="en-NZ"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(names)} - WealthGuard Report</title><style>${fontCSS}
.user-text{white-space:pre-wrap;overflow-wrap:anywhere}.comparison-table{font-size:7.5pt}.comparison-table td{padding:1.6mm 2mm}.comparison-table th{padding:2mm}*{box-sizing:border-box}body{margin:0;background:#F2F3F5;color:#202630;font:9pt/1.45 Inter,Arial,sans-serif}.controls{max-width:210mm;margin:16px auto;display:flex;gap:16px;align-items:center;padding:0 12px;font-size:10pt}.controls button{background:#293A61;color:white;border:0;border-radius:4px;padding:10px 16px;font:inherit;cursor:pointer}.report-page{width:210mm;height:297mm;padding:16mm;display:flex;flex-direction:column;background:white;margin:18px auto;overflow:hidden;box-shadow:0 2px 10px #0001;break-after:page}.report-page:last-child{break-after:auto}header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #DFE2E7;padding-bottom:7mm;margin-bottom:8mm}.logo{width:48mm;height:auto}header small{font-size:8pt;text-align:right;color:#626A76}h1,h2,h3{font-family:Manrope,Arial,sans-serif;color:#293A61;line-height:1.2;letter-spacing:-.025em}h1{font-size:28pt;margin:8mm 0}h2{font-size:23pt;margin:0 0 4mm}h3{font-size:12pt;margin:5mm 0 2.5mm}.eyebrow{text-transform:uppercase;letter-spacing:.16em;font-size:8pt;color:#626A76;margin-bottom:3mm}p{margin:0 0 4mm}.lead{font-size:11pt;color:#626A76;margin-bottom:6mm}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm;margin:5mm 0}.metric{border-top:2px solid #D5A65A;padding:4mm 0}.metric small,.metric span{display:block;line-height:1.3;font-size:8pt;color:#626A76}.metric strong{display:block;font-family:Manrope,Arial,sans-serif;color:#293A61;font-size:17pt;line-height:1.2;margin:2mm 0;overflow-wrap:anywhere}.callout{background:#FAF9F6;border-left:2px solid #D5A65A;padding:5mm;margin:5mm 0}.callout p{margin:2mm 0 0}.note{font-size:8pt;color:#626A76;margin:4mm 0}table{width:100%;border-collapse:collapse;font-size:8pt;table-layout:fixed}th{text-align:left;background:#293A61;color:white;font-weight:600;padding:3mm 2mm}td{padding:2mm 2mm;border-bottom:1px solid #DFE2E7;vertical-align:top;overflow-wrap:anywhere}tr:nth-child(even) td{background:#FAF9F6}footer{margin-top:auto;padding-top:4mm;border-top:1px solid #DFE2E7;display:flex;justify-content:space-between;gap:6mm;font-size:7pt;color:#626A76}footer span:first-child{max-width:70%;overflow-wrap:anywhere}.horizon-line{display:flex;justify-content:space-between;margin:5mm 0}.horizon-line div{text-align:center;flex:1}.horizon-line span{display:flex;align-items:center;justify-content:center;width:12mm;height:12mm;margin:0 auto 2mm;border:1px solid #D5A65A;border-radius:50%;color:#293A61}.horizon-line strong{display:block;font-size:8pt;line-height:1.3;padding:0 1mm;color:#293A61}.allocation-bar{display:flex;height:4mm;margin-bottom:5mm}.allocation-bar span{display:block}svg{display:block;width:100%;height:auto}svg text{font-family:Inter,Arial,sans-serif;font-size:11px;fill:#626A76}.legend{display:flex;gap:4mm;flex-wrap:wrap;font-size:7pt;color:#626A76;margin:2mm 0 5mm}.legend i{display:inline-block;width:10px;height:3px;margin-right:5px;vertical-align:middle}.cover{padding:0;flex-direction:row;background:#FAF9F6}.cover-art{width:70mm;flex-shrink:0;background:#17243D;display:flex;flex-direction:column}.cover-art img{width:100%;height:auto;display:block}.cover-art p{color:#FAF9F6;padding:12mm 8mm;font-family:Manrope,Arial,sans-serif;font-size:17pt;line-height:1.4}.cover-panel{padding:18mm 12mm;flex:1;min-width:0;display:flex;flex-direction:column}.wordmark{font-family:Georgia,serif;letter-spacing:.12em;color:#293A61;font-size:15pt;margin:20mm 0 5mm;border-top:1px solid #D5A65A;padding-top:5mm}.cover h1{font-size:29pt;line-height:1.2}.client-name{font-size:15pt;color:#293A61;overflow-wrap:anywhere}.cover-summary{margin:12mm 0;padding-top:5mm;border-top:1px solid #DFE2E7}.cover-summary strong{display:block;font-family:Manrope;font-size:20pt;color:#293A61}.cover-summary small{font-size:8pt;color:#626A76}.cover footer{font-size:7pt}.cover-date{color:#626A76;font-size:9pt}ul{padding-left:5mm}li{margin:4mm 0}@media print{@page{size:A4;margin:0}html,body{background:white;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.controls{display:none}.report-page{margin:0;box-shadow:none}}@media screen and (max-width:800px){body{overflow-x:auto}.controls{min-width:700px}}
</style></head><body><div class="controls"><button id="print-report">Save as PDF / Print</button><span>Choose A4 and enable background graphics. This report contains confidential scenario details.</span></div>
<section class="report-page cover"><div class="cover-art"><img src="${assets['report-hero.jpg']}" alt="New Zealand lake and mountains"><p>A more intentional approach to wealth.</p></div><div class="cover-panel">${logo}<div class="wordmark">WEALTHGUARD™</div><div class="eyebrow">${proposal?'Proposed retirement strategy':'Retirement planning illustration'}</div><h1>${proposal?'Your retirement strategy.':'Your retirement review.'}</h1><p class="client-name">${escapeHTML(names)}</p><p class="cover-date">Prepared ${escapeHTML(date)}${business.adviserName?.trim()?`<br>By ${escapeHTML(business.adviserName)}`:''}<br>Diligent Wealth Management Limited</p><div class="cover-summary"><small>Current portfolio</small><strong>${money(p.totalPortfolio)}</strong><small>Annual retirement spending target · today’s dollars</small><strong>${money(s.annualIncome)}</strong></div><p class="note">Prepared for discussion with your adviser. Projected figures are estimates, not guaranteed returns or retirement income. All amounts are New Zealand dollars.</p>${footer(1)}</div></section>
${pages.map((page,i)=>`<section class="report-page"><header>${logo}<small>WEALTHGUARD<br>${escapeHTML(date)}</small></header><div class="eyebrow">${escapeHTML(page.sub)}</div><h2>${escapeHTML(page.title)}</h2><main>${page.body}</main>${footer(i+2)}</section>`).join('')}
<script>
window.reportReady=document.fonts.ready.then(function(){
  var all=Array.from(document.querySelectorAll('.report-page:not(.cover)'));
  function fits(p){return p.scrollHeight<=p.clientHeight+1 && p.querySelector('footer').getBoundingClientRect().bottom<=p.getBoundingClientRect().bottom-40;}
  for(var index=0;index<all.length;index++){
    var page=all[index],main=page.querySelector('main'),moved=[];
    while(!fits(page)&&main.children.length){
      var node=main.lastElementChild;
      if(node.tagName==='TABLE'&&node.tBodies[0].rows.length>1){
        var row=node.tBodies[0].lastElementChild;
        if(moved[0]&&moved[0].tagName==='TABLE'&&moved[0].dataset.source===String(index)) moved[0].tBodies[0].prepend(row);
        else{var next=node.cloneNode(false);next.dataset.source=String(index);next.append(node.tHead.cloneNode(true));next.append(document.createElement('tbody'));next.tBodies[0].append(row);moved.unshift(next);}
      } else {moved.unshift(node);node.remove();}
    }
    if(moved.length){
      // One unusually tall element receives smaller type; keep its full text.
      if(!main.children.length){main.append(moved.shift());main.style.fontSize='8pt';main.style.lineHeight='1.35';main.querySelectorAll('td').forEach(function(c){c.style.fontSize='7pt';c.style.padding='2mm';});}
      if(moved.length){var continuation=page.cloneNode(true);var cm=continuation.querySelector('main');cm.replaceChildren.apply(cm,moved);continuation.querySelector('.eyebrow').textContent+=' · continued';page.after(continuation);all.splice(index+1,0,continuation);}
    }
  }
  var sections=Array.from(document.querySelectorAll('.report-page'));
  sections.forEach(function(p,i){p.querySelector('footer span:last-child').textContent='WealthGuard · '+(i+1)+' / '+sections.length;});
  // A long client name may need a smaller cover treatment.
  var cover=sections[0],name=cover.querySelector('.client-name');
  if(cover.scrollHeight>cover.clientHeight+1){name.style.fontSize='9pt';name.style.lineHeight='1.2';cover.querySelector('.wordmark').style.marginTop='10mm';}
});
document.getElementById('print-report').addEventListener('click',async function(){await window.reportReady;window.print();});
</script></body></html>`;
}
