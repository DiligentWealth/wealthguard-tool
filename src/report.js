import { HORIZONS, brandAsset } from './brand';
import { normaliseAllocations } from './engine';

export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => new Intl.NumberFormat('en-NZ',{style:'currency',currency:'NZD',maximumFractionDigits:0}).format(Number(n)||0);
const pct = (n, digits = 1) => `${Number(n || 0).toFixed(digits)}%`;
const chunks = (a,n) => Array.from({length:Math.ceil(a.length/n)},(_,i)=>a.slice(i*n,(i+1)*n));
let assetsPromise;
export function loadReportAssets(){
  if(!assetsPromise) assetsPromise = Promise.all(['diligent-logo.png','wealthguard-logo.png','report-hero.jpg',...['inter','manrope'].flatMap(f=>[400,600,700].map(w=>`fonts/${f}-latin-${w}-normal.woff2`))].map(async name=>{
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
    <p class="lead">${proposal?'This report illustrates how a WealthGuard approach could support your retirement spending.':'This report brings together the financial information and assumptions recorded for you, including your investments, retirement spending target and expected income. It is designed to help you and your adviser review your WealthGuard strategy.'}</p>
    <div class="metrics">${metric('Current investment balance',money(p.totalPortfolio),'Including KiwiSaver')}${metric('Annual spending target',money(s.annualIncome),"Today’s dollars")}${metric('First-year withdrawal needed',money(p.firstYearDrawdown),"Today’s dollars; after wages and NZ Super")}</div>
    <div class="callout"><strong>${p.planFunded?'The targets are met in this projection':'The projection does not meet all your targets'}</strong><p>${p.planFunded?'Based on the assumptions recorded in this report, the projection shows sufficient investment money to meet the planned spending and other withdrawals during the period shown, together with any target entered for money remaining at the end.':`Projected spending and one-off withdrawal shortfalls total ${money(p.totalShortfall)} in future dollars. The final balance is ${money(last.Total)}, compared with a remaining-balance target of ${money(s.legacyTarget)}.`} This is a modelled outcome, not a guarantee. Actual results may differ because of investment returns, inflation, spending, tax, fees, the timing of withdrawals and the length of retirement.</p></div>
    ${s.useGrossSuper?'<div class="callout"><strong>Gross NZ Super selected</strong><p>Pre-tax NZ Super is used to offset spending. This can understate the investment withdrawals needed for after-tax spending. Review the tax basis with your adviser.</p></div>':''}
    <h3>Your retirement dates</h3>${table(['Person','Current age','Retirement age','Years until retirement','Net working income / year'],[[s.clientName||'Client',s.clientAge,s.retirementAge,Math.max(0,s.retirementAge-s.clientAge),money(s.clientWorkingIncome)],...(s.partnerName?.trim()?[[s.partnerName,s.partnerAge,s.partnerRetirementAge,Math.max(0,s.partnerRetirementAge-s.partnerAge),money(s.partnerWorkingIncome)]]:[])])}
    <p class="note">The projection uses the retirement ages and employment income recorded above. Household retirement spending starts from the first retirement entered. Any employment income recorded for another household member is used to help meet that spending until their retirement. Employment income is shown after tax and KiwiSaver deductions, in today’s dollars. A value of $0 means no employment income has been included.</p>
    <h3>Estimated investment balances</h3><div class="metrics">${metric('At first retirement',money(p.portfolioAtRetirement),'Future dollars')}${metric('Available for withdrawal',money(p.accessibleAtRetirement),'At first retirement, before annual payments')}${metric('At the end of the projection',money(last.Total),`After ${s.projectionYears} retirement years`)}</div>
    <p class="note">The projection works in whole years using the retirement ages recorded. ${years===0?'The first retirement is modelled in year 0. Where retirement falls within the current projection year, the model treats it as occurring in year 0; this does not identify an exact retirement date.':`The first retirement is modelled ${years} years from today.`} The projection ends ${last.year} years from today, when ${s.partnerName?.trim()?'the younger client':'the client'} is age ${Math.min(s.clientAge,...(s.partnerName?.trim()?[s.partnerAge]:[]))+last.year}. Future-dollar balances show the dollar amounts projected at that future point in time. They have not been converted back into today’s purchasing power.</p>
  `);
  if(details.goals?.trim()||details.commentary?.trim()) add(proposal?'Your goals and proposed approach':'Your review discussion','Adviser commentary',`${textBlock('Your goals',details.goals)}${textBlock('Adviser commentary',details.commentary)}<p class="note">This commentary accompanies the projection. Read it alongside the assumptions, risks and any related advice documents.</p>`);
  add('Five buckets. One strategy.','How WealthGuard organises your investments',`
    <p class="lead">WealthGuard organises investments according to the period in which the money may be needed, from nearer-term spending through to longer-term retirement needs.</p>
    <div class="horizon-line">${HORIZONS.map((b,i)=>`<div><span>${String(i+1).padStart(2,'0')}</span><strong>${b.label}</strong></div>`).join('')}</div>
    <div class="allocation-bar">${HORIZONS.map(b=>`<span style="width:${weights[b.key]}%;background:${b.color}"></span>`).join('')}</div>
    ${table(['Bucket','Purpose','Allocation','Amount'],HORIZONS.map(b=>[b.label,b.purpose,pct(weights[b.key]),money(p.retirementAllocDollars[b.key])]))}
    <p class="note">The figures illustrate the allocation of investments available for withdrawal at first retirement, in future dollars. They may differ from current holdings. Allocations are scaled to 100% in the model. KiwiSaver assumed to remain unavailable at that point (${money(first.lockedKiwiSaver)}) is excluded.</p>
    <h3>Supporting regular spending</h3><p>Regular withdrawals would generally be met first from the investments allocated for nearer-term spending. Your adviser will review how and when those investments should be replenished, taking account of your spending needs, remaining investments and market conditions.</p>
    <p>The purpose of this approach is to keep money available for nearer-term needs while allowing investments intended for later years more time to remain invested. This may reduce the need to sell longer-term investments during weaker markets, but it does not remove investment or withdrawal risk.</p>
    <p class="note">Bucket names describe the intended role of each allocation. They do not guarantee income, capital protection or investment returns. The actual risks depend on the investments held within each bucket.</p>
  `);
  add('Your retirement projections','Understanding the projections',`
    <h3>Your projected investment balance · future dollars</h3>${chart(d,[{key:'Total',label:'Total investments',color:'#293A61'},{key:'accessibleTotal',label:'Available for withdrawal',color:'#3b82f6',dash:'6 3'},{key:'lockedKiwiSaver',label:'KiwiSaver not yet available',color:'#f97316',dash:'2 3'}],'Projected investment balances')}
    <h3>Your projected retirement cash flow · future dollars</h3>${chart(d.slice(0,-1),[{key:'drawdownRequired',label:'Withdrawals needed',color:'#293A61'},{key:'drawdownActual',label:'Projected withdrawals',color:'#f97316',dash:'6 3'},{key:'employmentIncome',label:'Employment income',color:'#16a34a'},{key:'superIncome',label:'NZ Super',color:'#a855f7'}],'Projected annual retirement cash flow')}
    <p class="note"><strong>Withdrawals needed</strong> means spending to be met from investments after the employment income and NZ Super included. <strong>Projected withdrawals</strong> means what the investments can provide under the assumptions. Any gap is a projected shortfall. One-off payments are separate.</p>
    <p class="note">Balances are shown at year start and payments occur during the year. The final balance point has no further year of spending. Inflation means future amounts generally buy less than the same amount today.</p>
    <div class="callout"><strong>An illustration, not a prediction</strong><p>The projection applies the return assumptions shown in this report to each year of the model. Actual investment returns will vary from year to year and losses can occur. The charts are intended to illustrate how the plan may develop under the assumptions entered; they should not be read as predictions of future investment values or income.</p></div>
  `);
  add('Investment return assumptions','The basis of your projection',`
    ${table(['Bucket','Return during retirement / year','Return before retirement / year'],HORIZONS.map(b=>[b.label,pct(s.returns[b.returnKey],2),['cashSavings','balancedPortfolio','growthPortfolio'].includes(b.key)?pct(s.accumulationReturns[b.key],2):'Not used']))}
    <h3>Returns after fees and tax</h3><p>The annual return assumptions used in this projection have been entered by your adviser and are intended to allow for the investment tax, fund fees, platform fees and advice fees assumed for the modelling.</p><p>These assumed costs are already reflected in the projected balances and are not deducted again in the calculation. Actual tax, fees, investment returns and adviser remuneration may differ from the assumptions used.</p>
    <p>The rates are planning assumptions, not guaranteed returns. Actual returns will vary, and investments can lose value. Your actual fees and adviser remuneration are described in the relevant advice and disclosure information.</p>
    <h3>Before retirement</h3>${table(['Bucket','Illustrated allocation'],HORIZONS.filter(b=>['cashSavings','balancedPortfolio','growthPortfolio'].includes(b.key)).map(b=>[b.label,pct(normaliseAllocations(s.accumulationAllocations)[b.key])]))}
    <p class="note">Before first retirement, available investments use these allocations and return assumptions. KiwiSaver that is not yet available continues to use them until the relevant person’s assumed access date.</p>
    <h3>Matching the approach to you</h3><p>The projection alone does not determine whether an investment strategy is suitable for you. Your adviser will also consider your circumstances, financial position, goals, time horizon, tolerance for investment losses, need for access to money and ability to withstand changes in investment value.</p><p>Discuss the proposed allocation, the investments within it, relevant risks, costs and alternatives with your adviser before making changes.</p>
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
    ['Money remaining at the end',s.legacyTarget>0?`${money(s.legacyTarget)} target in future dollars.`:'$0 minimum target entered in this projection.']
  ];
  add('Other assumptions and limitations','Understanding the calculation',`${table(['Assumption','What is included'],assumptions)}
    ${!(s.legacyTarget>0)?'<p class="note">A $0 target means no separate minimum remaining-balance target has been entered; it does not mean the client is being advised to spend the portfolio down to $0.</p>':''}
    <h3>What to check with your adviser</h3><p>NZ Super eligibility and payments are estimates based on the information entered and the rates used in this report. Actual entitlement, tax treatment and payments will depend on your circumstances and the rules applying at the time. Care costs are planning assumptions only and this projection does not assess eligibility for government-funded care or other assistance.</p>
    <h3>How payments are timed</h3><p>The calculation operates in whole years. Unless stated otherwise, contributions and one-off payments are applied at the beginning of a model year, investment returns are then applied, followed by annual spending withdrawals. Actual cash flows occur throughout the year, so actual outcomes will differ from this simplified timing.</p>
    <p class="note">Employment income above spending needs is not automatically added to investments. Separate gifting or wealth-transfer amounts are not deducted unless specifically entered into the projection. Spending beyond the period shown is not assessed.</p>
    <p class="note">NZ Super rate reference: workandincome.govt.nz/eligibility/seniors/superannuation/how-much-you-can-get.html</p>`);
  const events=[...(s.accumulationLumpSums||[]).filter(e=>e.amount>0).map(e=>[e.label||'Before-retirement payment',e.type==='deposit'?'Money added':'Money withdrawn',`Year ${e.year} from today`,money(e.amount)]),...(s.retirementLumpSums||[]).filter(e=>e.amount>0).map(e=>[e.label||'Retirement payment',e.type==='deposit'?'Money added':'Money withdrawn',`Year ${e.yearFromRetirement} after first retirement`,money(e.amount)])];
  chunks(events,12).forEach((rows,i)=>add('Planned additions and withdrawals',i?'One-off payments · continued':'One-off payments',`${table(['Description','Payment','Timing','Amount'],rows)}<p class="note">Amounts are in dollars at the expected payment date and are not automatically increased for inflation. They enter at the start of the selected year. Actual timing may differ. Expected inheritances, sale proceeds and other future receipts remain assumptions until confirmed and available.</p>`));
  if(p.mcResults){const mc=p.mcResults;add('What if investment returns vary?','Exploring uncertainty',`
    <p class="lead">Poor returns early in retirement can have a lasting effect, particularly when money is being withdrawn at the same time.</p><p>A simulation tests many different sequences of annual returns. This is sometimes called a Monte Carlo simulation. A varying-return simulation has been included in this report.</p>
    <p class="note">First-year market stress is ${s.badFirstYearEnabled?`included at ${pct(s.badFirstYearShockPercent)} for Steady Growth and Strategic Long Term Growth`:"not included"}.</p>
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
  } else add('Reviewing your plan under uncertainty','Discussion with your adviser',`<p class="lead">The main projection uses fixed return assumptions${s.badFirstYearEnabled?", with the first-year market stress recorded in the assumptions table":""}. A simulation of varying annual returns has not been included.</p><p class="note">First-year market stress is ${s.badFirstYearEnabled?`included at ${pct(s.badFirstYearShockPercent)} for Steady Growth and Strategic Long Term Growth`:"not included"}.</p><p>Points to discuss with your adviser include:</p><ul><li>How lower investment returns could affect your spending.</li><li>Whether withdrawals could be reduced following a market downturn.</li><li>Whether enough money is available before KiwiSaver can be accessed.</li><li>How higher living costs or a longer retirement could affect the plan.</li><li>Whether care-cost and family-support assumptions remain appropriate.</li></ul><p>Your adviser can model alternative assumptions or scenarios where these issues are relevant to your circumstances.</p>`);
  if(p.comparison){const c=p.comparison;const cols=c.columns;
    const rows=[...(c.agesDiffer ? [['Current ages (client / partner)',...cols.map(x=>`${x.summary.clientAge}${x.summary.partnerName ? ` / ${x.summary.partnerAge}` : ''}`)],['Ages at comparison end',...cols.map(x=>`${x.summary.clientAge+c.endYears}${x.summary.partnerName ? ` / ${x.summary.partnerAge+c.endYears}` : ''}`)]] : []),['Client retirement age',...cols.map(x=>x.summary.retirementAge)],['Partner retirement age',...cols.map(x=>x.summary.partnerName?x.summary.partnerRetirementAge:'—')],["Spending / year (today’s dollars)",...cols.map(x=>money(x.summary.annualIncome))],['Balance at first retirement¹',...cols.map(x=>money(x.summary.portfolioAtRetirement))],['Available at first retirement¹',...cols.map(x=>money(x.summary.accessibleAtRetirement))],["First-year withdrawal needed (today’s dollars)",...cols.map(x=>money(x.summary.firstYearDrawdown))],['Spending / withdrawal shortfalls¹',...cols.map(x=>money(x.summary.totalShortfall))],['Balance at common end date¹',...cols.map(x=>money(x.summary.finalBalance))],['Remaining-balance target¹',...cols.map(x=>money(x.summary.legacyTarget))],['Remaining-balance target met?',...cols.map(x=>x.summary.legacyMet?'Yes':'No')]];
    const comparisonEvents=cols.flatMap(x=>[
      ...(x.data?.accumulationLumpSums||[]).filter(e=>e.amount>0).map(e=>[x.label,e.label||'Before-retirement payment',e.type==='deposit'?'Money added':'Money withdrawn',`Year ${e.year} from today`,money(e.amount)]),
      ...(x.data?.retirementLumpSums||[]).filter(e=>e.amount>0).map(e=>[x.label,e.label||'Retirement payment',e.type==='deposit'?'Money added':'Money withdrawn',`Year ${x.summary.yearsUntilRetirement+e.yearFromRetirement} from today`,money(e.amount)]),
      ...(x.data?.contributionAmount>0&&x.summary.yearsUntilRetirement>0?[[x.label,'Regular contributions','Money added',`Before first retirement (year ${x.summary.yearsUntilRetirement})`,`${money(x.data.contributionAmount)} / ${x.data.contributionFrequency||'annual'}`]]:[])
    ]);
    add('Comparing your retirement options','Scenario comparison',`<p>All scenarios end ${c.endYears} years from today, at age ${c.finalAge} for Scenario A’s younger client${cols[0].summary.partnerName?'':' (or the client if single)'}. Earlier retirement generally means fewer contribution years and more withdrawal years.</p>
      ${c.warnings?.length?`<p class="note"><strong>Check the selected scenarios:</strong> ${escapeHTML(c.warnings.join(' '))} All scenarios use the same number of years from today; final ages may differ.</p>`:''}<p class="note">${cols.map((x,i)=>`${['A','B','C'][i]}: ${escapeHTML(x.label)}`).join(' · ')}</p>
      ${table(['Comparison',...cols.map((x,i)=>`Scenario ${['A','B','C'][i]}`)],rows).replace('<table>','<table class="comparison-table">')}
      ${chart(c.chart,cols.map((x,i)=>({key:'scenario'+i,label:`Scenario ${['A','B','C'][i]}`,color:['#293A61','#f97316','#16a34a'][i],dash:['','7 3','2 3'][i]})),'Investment balances compared to a common end date')}
      ${comparisonEvents.length?`<h3>Payments included in the comparison</h3>${table(['Scenario','Payment / event','Direction','Timing','Amount'],comparisonEvents)}<p class="note">These recorded payments can create changes in the balance paths. One-off amounts are dollars at the payment date; regular contribution amounts are per the frequency shown. Payments are applied at model-year start.</p>`:''}
      <p class="note">¹ Future-dollar figures show projected amounts at the relevant future dates and have not been converted back to today’s purchasing power. Spending and withdrawal shortfalls represent the amounts the model cannot meet from the investments under the assumptions entered.</p>
      <p class="note">The scenarios may contain different financial assumptions, including spending, investment allocations, spending reductions, one-off payments, retirement timing or other inputs. Review the underlying assumptions when comparing the results. ${cols.some(x=>!(x.summary.legacyTarget>0))?"A $0 remaining-balance target means no separate minimum target has been entered for that scenario; it does not indicate advice to spend the investments down to $0. ":""}${c.differences.length?'Other financial inputs differ: '+escapeHTML(c.differences.join(', '))+'.':'Retirement dates are the only financial inputs changed; the comparison end date is aligned.'}</p>
      <p class="note">${c.relativeEvents?'Retirement payments, care costs, spending reductions and first-year stress stay relative to each scenario’s first retirement, so their calendar timing may change. ':''}These are fixed-assumption illustrations. They do not predict future outcomes or, by themselves, determine which option is suitable for you. Saved scenarios are unchanged.</p>`);
  }
  add('Keeping your retirement plan up to date','Your review and next steps',`
    <p>This report is a retirement-planning illustration based on the information and assumptions recorded for you. It should be read alongside the advice provided by your adviser${proposal?' and any relevant disclosure information':''}.</p>
    <h3>Check the information used</h3><p>Please check that your retirement dates, spending, investments, income and other material assumptions have been recorded correctly. Tell your adviser if anything is incorrect or has changed, as this may affect the projection and the advice provided.</p>
    ${textBlock('Related advice document',details.adviceReference)}
    ${proposal?`${textBlock('Disclosure and complaints information',business.disclosureReference)}<h3>Fees and disclosure information</h3><p>Your relevant advice and disclosure information explains the fees and costs that apply, adviser remuneration, material conflicts of interest, the scope and limitations of the advice, and the complaints process. Ask your adviser if you would like another copy or anything explained.</p>`:''}
    <h3>Update your plan annually</h3><p>Retirement projections should be reviewed over time because investment values, spending and personal circumstances change. We recommend reviewing and updating your retirement plan annually. Contact us sooner if there is a material change to your financial position, spending, health, employment or family circumstances.</p>
    <div class="callout"><strong>Please ask about anything that is unclear</strong><p>Please ask about anything in this report that you do not understand. It is important that you understand the assumptions, key risks and implications of the advice before deciding whether to proceed.</p></div>
  `);
  if(options.appendix) chunks(d,14).forEach((rows,i)=>add('Your annual projection',`Annual figures · ${i+1}`,`${table(['Year','Investment balance','KiwiSaver not yet available','Employment income','NZ Super','Withdrawals needed','Projected withdrawals','Projected shortfall'],rows.map(r=>[r.year,money(r.Total),money(r.lockedKiwiSaver),money(r.employmentIncome),money(r.superIncome),money(r.drawdownRequired),money(r.drawdownActual),money(r.shortfall+r.lumpSumShortfall)]))}<p class="note">All amounts are future dollars. Balances are at year start. Shortfalls include spending and one-off withdrawals, but not a missed remaining-balance target. One-off payments are listed separately. The final row is the closing balance with no further year of spending.</p>`));
  const logo=`<img class="logo" src="${assets['diligent-logo.png']}" alt="Diligent Wealth">`;
  const wealthguardLogo=`<img class="wealthguard-logo" src="${assets['wealthguard-logo.png']}" alt="WealthGuard™">`;
  const total=pages.length+1;
  const footer=i=>`<footer><span>${escapeHTML(names)} · Confidential</span><span>WealthGuard · ${i} / ${total}</span></footer>`;
  const fontCSS=['inter','manrope'].flatMap(f=>[400,600,700].map(w=>`@font-face{font-family:${f};font-style:normal;font-weight:${w};src:url('${assets[`fonts/${f}-latin-${w}-normal.woff2`]}') format('woff2');}`)).join('');
  return `<!doctype html><html lang="en-NZ"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(names)} - WealthGuard Report</title><style>${fontCSS}
.user-text{white-space:pre-wrap;overflow-wrap:anywhere}.comparison-table{font-size:7.5pt}.comparison-table td{padding:1.6mm 2mm}.comparison-table th{padding:2mm}*{box-sizing:border-box}body{margin:0;background:#F2F3F5;color:#202630;font:9pt/1.45 Inter,Arial,sans-serif}.controls{max-width:210mm;margin:16px auto;display:flex;gap:16px;align-items:center;padding:0 12px;font-size:10pt}.controls button:disabled{opacity:.6;cursor:wait}.controls button{background:#293A61;color:white;border:0;border-radius:4px;padding:10px 16px;font:inherit;cursor:pointer}.report-page{width:210mm;height:297mm;padding:16mm;display:flex;flex-direction:column;background:white;margin:18px auto;overflow:hidden;box-shadow:0 2px 10px #0001;break-after:page}.report-page:last-child{break-after:auto}header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #DFE2E7;padding-bottom:7mm;margin-bottom:8mm}.logo{width:48mm;height:auto}.wealthguard-logo{display:block;width:100%;height:auto}.report-brand{display:block;width:45mm}.report-brand span{display:block;margin-top:1mm}header small{font-size:8pt;text-align:right;color:#626A76}h1,h2,h3{font-family:Manrope,Arial,sans-serif;color:#293A61;line-height:1.2;letter-spacing:-.025em}h1{font-size:28pt;margin:8mm 0}h2{font-size:23pt;margin:0 0 4mm}h3{font-size:12pt;margin:5mm 0 2.5mm}.eyebrow{text-transform:uppercase;letter-spacing:.16em;font-size:8pt;color:#626A76;margin-bottom:3mm}p{margin:0 0 4mm}.lead{font-size:11pt;color:#626A76;margin-bottom:6mm}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm;margin:5mm 0}.metric{border-top:2px solid #D5A65A;padding:4mm 0}.metric small,.metric span{display:block;line-height:1.3;font-size:8pt;color:#626A76}.metric strong{display:block;font-family:Manrope,Arial,sans-serif;color:#293A61;font-size:17pt;line-height:1.2;margin:2mm 0;overflow-wrap:anywhere}.callout{background:#FAF9F6;border-left:2px solid #D5A65A;padding:5mm;margin:5mm 0}.callout p{margin:2mm 0 0}.note{font-size:8pt;color:#626A76;margin:4mm 0}table{width:100%;border-collapse:collapse;font-size:8pt;table-layout:fixed}th{text-align:left;background:#293A61;color:white;font-weight:600;padding:3mm 2mm}td{padding:2mm 2mm;border-bottom:1px solid #DFE2E7;vertical-align:top;overflow-wrap:anywhere}tr:nth-child(even) td{background:#FAF9F6}footer{margin-top:auto;padding-top:4mm;border-top:1px solid #DFE2E7;display:flex;justify-content:space-between;gap:6mm;font-size:7pt;color:#626A76}footer span:first-child{max-width:70%;overflow-wrap:anywhere}.horizon-line{display:flex;justify-content:space-between;margin:5mm 0}.horizon-line div{text-align:center;flex:1}.horizon-line span{display:flex;align-items:center;justify-content:center;width:12mm;height:12mm;margin:0 auto 2mm;border:1px solid #D5A65A;border-radius:50%;color:#293A61}.horizon-line strong{display:block;font-size:8pt;line-height:1.3;padding:0 1mm;color:#293A61}.allocation-bar{display:flex;height:4mm;margin-bottom:5mm}.allocation-bar span{display:block}svg{display:block;width:100%;height:auto}svg text{font-family:Inter,Arial,sans-serif;font-size:11px;fill:#626A76}.legend{display:flex;gap:4mm;flex-wrap:wrap;font-size:7pt;color:#626A76;margin:2mm 0 5mm}.legend i{display:inline-block;width:10px;height:3px;margin-right:5px;vertical-align:middle}.cover{padding:0;flex-direction:row;background:#FAF9F6}.cover-art{width:70mm;flex-shrink:0;background:#17243D;display:flex;flex-direction:column}.cover-art img{width:100%;height:auto;display:block}.cover-art p{color:#FAF9F6;padding:12mm 8mm;font-family:Manrope,Arial,sans-serif;font-size:17pt;line-height:1.4}.cover-panel{padding:18mm 12mm;flex:1;min-width:0;display:flex;flex-direction:column}.wordmark{margin:12mm 0 6mm;border-top:1px solid #D5A65A;padding-top:5mm}.cover h1{font-size:29pt;line-height:1.2}.client-name{font-size:15pt;color:#293A61;overflow-wrap:anywhere}.cover-summary{margin:12mm 0;padding-top:5mm;border-top:1px solid #DFE2E7}.cover-summary strong{display:block;font-family:Manrope;font-size:20pt;color:#293A61}.cover-summary small{font-size:8pt;color:#626A76}.cover footer{font-size:7pt}.cover-date{color:#626A76;font-size:9pt}ul{padding-left:5mm}li{margin:4mm 0}@media print{@page{size:A4;margin:0}html,body{background:white;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.controls{display:none}.report-page{margin:0;box-shadow:none;width:210mm;height:296mm;display:block;position:relative;padding:16mm 16mm 22mm;overflow:visible;page-break-inside:avoid;break-inside:avoid;page-break-after:always;break-after:page}.report-page:last-child{page-break-after:auto;break-after:auto}.report-page>footer{position:absolute;left:16mm;right:16mm;bottom:16mm;margin:0}.report-page.cover{display:flex;padding:0;overflow:visible}.cover-panel{position:relative;padding-bottom:28mm}.cover footer{position:absolute;left:12mm;right:12mm;bottom:18mm;margin:0}header,h2,h3,svg,.metrics{break-inside:avoid}h3{break-after:avoid}}@media screen and (max-width:800px){body{overflow-x:auto}.controls{min-width:700px}}
</style></head><body><div class="controls"><button id="print-report" type="button" disabled>Preparing report…</button><span id="report-status" role="status">Please wait for the images, fonts and page layout to finish loading.</span></div>
<section class="report-page cover"><div class="cover-art"><img src="${assets['report-hero.jpg']}" alt="New Zealand lake and mountains"><p>A more intentional approach to wealth.</p></div><div class="cover-panel">${logo}<div class="wordmark">${wealthguardLogo}</div><div class="eyebrow">${proposal?'Proposed retirement strategy':'Retirement planning illustration'}</div><h1>${proposal?'Your retirement strategy.':'Your retirement review.'}</h1><p class="client-name">${escapeHTML(names)}</p><p class="cover-date">Prepared ${escapeHTML(date)}${business.adviserName?.trim()?`<br>By ${escapeHTML(business.adviserName)}`:''}<br>Diligent Wealth Management Limited</p><div class="cover-summary"><small>Current portfolio</small><strong>${money(p.totalPortfolio)}</strong><small>Annual retirement spending target · today’s dollars</small><strong>${money(s.annualIncome)}</strong></div><p class="note">Prepared to support your retirement review with your adviser. Projected figures are estimates based on the assumptions recorded in this report. They are not guaranteed investment returns, retirement income or future account balances. All amounts are New Zealand dollars.</p>${footer(1)}</div></section>
${pages.map((page,i)=>`<section class="report-page"><header>${logo}<small class="report-brand">${wealthguardLogo}<span>${escapeHTML(date)}</span></small></header><div class="eyebrow">${escapeHTML(page.sub)}</div><h2>${escapeHTML(page.title)}</h2><main>${page.body}</main>${footer(i+2)}</section>`).join('')}
<script>
var printButton=document.getElementById('print-report');
var statusText=document.getElementById('report-status');
function imageReady(image){
  return new Promise(function(resolve,reject){
    function loaded(){
      if(!image.naturalWidth){reject(new Error('A report image could not be loaded.'));return;}
      if(image.decode) image.decode().then(resolve,function(){resolve();});else resolve();
    }
    if(image.complete) loaded();
    else {image.addEventListener('load',loaded,{once:true});image.addEventListener('error',function(){reject(new Error('A report image could not be loaded.'));},{once:true});}
  });
}
function paintReady(){return new Promise(function(resolve){requestAnimationFrame(function(){requestAnimationFrame(resolve);});});}
window.reportReady=Promise.all([
  document.fonts ? document.fonts.ready : Promise.resolve(),
  Promise.all(Array.from(document.images).map(imageReady))
]).then(paintReady).then(function(){
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
  if(cover.scrollHeight>cover.clientHeight+1){name.style.fontSize='9pt';name.style.lineHeight='1.2';cover.querySelector('.wordmark').style.marginTop='5mm';}
}).then(paintReady).then(function(){
  printButton.disabled=false;
  printButton.textContent='Save as PDF / Print';
  statusText.textContent='Ready. Choose A4, 100% scale, background graphics on and browser headers/footers off. This report contains confidential scenario details.';
}).catch(function(error){
  printButton.textContent='Report not ready';
  statusText.textContent='The report could not finish loading. Close this tab and export it again. '+error.message;
});
// Printing stays in the original click event. Readiness is handled before
// enabling the button, so no asynchronous work precedes the print dialog.
printButton.addEventListener('click',function(){if(printButton.disabled)return;window.focus();window.print();});
</script></body></html>`;
}
