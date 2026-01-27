import React, { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Download } from 'lucide-react';

export default function WealthGuardTool() {
  const [clientName, setClientName] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [isJoint, setIsJoint] = useState(false);
  const [clientAge, setClientAge] = useState(60);
  const [partnerAge, setPartnerAge] = useState(60);
  const [retirementAge, setRetirementAge] = useState(65);
  
  const [currentInvestments, setCurrentInvestments] = useState([
    { id: 1, label: '', amount: 200000 },
    { id: 2, label: '', amount: 370000 },
    { id: 3, label: '', amount: 270763 }
  ]);
  
  const [cash, setCash] = useState(36000);
  const [termDeposits, setTermDeposits] = useState(120000);
  const [projectionYears, setProjectionYears] = useState(30);
  const [annualIncome, setAnnualIncome] = useState(30000);
  const [contributionAmount, setContributionAmount] = useState(0);
  const [contributionFrequency, setContributionFrequency] = useState('annual');
  
  const [allocations, setAllocations] = useState({
    cashSavings: 3.0,
    termDeposit: 12.0,
    incomePortfolio: 30.0,
    balancedPortfolio: 30.0,
    growthPortfolio: 25.0
  });

  const [accumulationAllocations, setAccumulationAllocations] = useState({
    cashSavings: 10.0,
    balancedPortfolio: 45.0,
    growthPortfolio: 45.0
  });

  const [returns, setReturns] = useState({
    cashSavings: 0.25,
    capitalPreservation: 4.0,
    incomeGenerator: 5.0,
    steadyGrowth: 5.5,
    strategicGrowth: 7.5
  });

  const getSuperannuationForYear = (year) => {
    const yearsUntilRetirement = Math.max(0, retirementAge - clientAge);
    const clientCurrentAge = clientAge + yearsUntilRetirement + year;
    const partnerCurrentAge = isJoint ? partnerAge + yearsUntilRetirement + year : 0;
    const clientEligible = clientCurrentAge >= 65;
    const partnerEligible = isJoint && partnerCurrentAge >= 65;
    if (clientEligible && partnerEligible) return 43056;
    else if (clientEligible || partnerEligible) return 27998;
    return 0;
  };
  
  const yearsUntilRetirement = Math.max(0, retirementAge - clientAge);
  const currentSuperannuation = getSuperannuationForYear(0);
  const incomeOverSuper = Math.max(0, annualIncome - currentSuperannuation);
  
  const annualContribution = contributionFrequency === 'weekly' ? contributionAmount * 52 
    : contributionFrequency === 'fortnightly' ? contributionAmount * 26
    : contributionFrequency === 'monthly' ? contributionAmount * 12 : contributionAmount;

  const totalInvestments = currentInvestments.reduce((sum, inv) => sum + inv.amount, 0);
  const totalPortfolio = cash + termDeposits + totalInvestments;

  const addInvestment = () => setCurrentInvestments([...currentInvestments, { id: Date.now(), label: '', amount: 0 }]);
  const removeInvestment = (id) => { if (id > 2) setCurrentInvestments(currentInvestments.filter(inv => inv.id !== id)); };
  const updateInvestment = (id, field, value) => setCurrentInvestments(currentInvestments.map(inv => inv.id === id ? { ...inv, [field]: field === 'amount' ? (parseFloat(value) || 0) : value } : inv));

  const calculateProjections = useMemo(() => {
    const data = [];
    let cashBucket = totalPortfolio * (accumulationAllocations.cashSavings / 100);
    let balancedBucket = totalPortfolio * (accumulationAllocations.balancedPortfolio / 100);
    let growthBucket = totalPortfolio * (accumulationAllocations.growthPortfolio / 100);
    let termDepBucket = 0, incomeBucket = 0;

    for (let year = 0; year <= yearsUntilRetirement + projectionYears; year++) {
      const isRetired = year >= yearsUntilRetirement;
      
      if (year === yearsUntilRetirement && yearsUntilRetirement > 0) {
        const total = cashBucket + balancedBucket + growthBucket;
        cashBucket = total * (allocations.cashSavings / 100);
        termDepBucket = total * (allocations.termDeposit / 100);
        incomeBucket = total * (allocations.incomePortfolio / 100);
        balancedBucket = total * (allocations.balancedPortfolio / 100);
        growthBucket = total * (allocations.growthPortfolio / 100);
      }
      
      if (yearsUntilRetirement === 0 && year === 0) {
        cashBucket = totalPortfolio * (allocations.cashSavings / 100);
        termDepBucket = totalPortfolio * (allocations.termDeposit / 100);
        incomeBucket = totalPortfolio * (allocations.incomePortfolio / 100);
        balancedBucket = totalPortfolio * (allocations.balancedPortfolio / 100);
        growthBucket = totalPortfolio * (allocations.growthPortfolio / 100);
      }
      
      data.push({ year, 'Cash Savings': Math.round(cashBucket), 'Capital Preservation': Math.round(termDepBucket), 'Income Generator': Math.round(incomeBucket), 'Steady Growth': Math.round(balancedBucket), 'Strategic Growth': Math.round(growthBucket), 'Total': Math.round(cashBucket + termDepBucket + incomeBucket + balancedBucket + growthBucket) });

      if (year < yearsUntilRetirement + projectionYears) {
        if (year < yearsUntilRetirement && annualContribution > 0) {
          cashBucket += annualContribution * (accumulationAllocations.cashSavings / 100);
          balancedBucket += annualContribution * (accumulationAllocations.balancedPortfolio / 100);
          growthBucket += annualContribution * (accumulationAllocations.growthPortfolio / 100);
        }
        cashBucket *= (1 + returns.cashSavings / 100);
        termDepBucket *= (1 + returns.capitalPreservation / 100);
        incomeBucket *= (1 + returns.incomeGenerator / 100);
        balancedBucket *= (1 + returns.steadyGrowth / 100);
        growthBucket *= (1 + returns.strategicGrowth / 100);

        if (isRetired) {
          const yearsInto = year - yearsUntilRetirement;
          const yearSuper = getSuperannuationForYear(yearsInto);
          const inflatedIncome = annualIncome * Math.pow(1.02, yearsInto);
          const drawdown = Math.max(0, inflatedIncome - yearSuper);
          const totalDrawable = incomeBucket + balancedBucket + growthBucket;
          if (totalDrawable > 0) {
            incomeBucket = Math.max(0, incomeBucket - drawdown * (incomeBucket / totalDrawable));
            balancedBucket = Math.max(0, balancedBucket - drawdown * (balancedBucket / totalDrawable));
            growthBucket = Math.max(0, growthBucket - drawdown * (growthBucket / totalDrawable));
          }
        }
      }
    }
    return data;
  }, [totalPortfolio, allocations, accumulationAllocations, returns, annualIncome, yearsUntilRetirement, projectionYears, annualContribution, clientAge, partnerAge, isJoint]);

  const calculateDrawdown = useMemo(() => {
    const data = [];
    let cumulative = 0;
    for (let year = 0; year <= yearsUntilRetirement + projectionYears; year++) {
      const isRetired = year >= yearsUntilRetirement;
      const yearsInto = isRetired ? year - yearsUntilRetirement : 0;
      const yearSuper = isRetired ? getSuperannuationForYear(yearsInto) : 0;
      const inflatedIncome = isRetired ? annualIncome * Math.pow(1.02, yearsInto) : 0;
      const drawdown = Math.max(0, inflatedIncome - yearSuper);
      if (isRetired) cumulative += drawdown;
      data.push({ year, 'Annual Drawdown': Math.round(drawdown), 'Cumulative Drawdown': Math.round(cumulative) });
    }
    return data;
  }, [annualIncome, yearsUntilRetirement, projectionYears, clientAge, partnerAge, isJoint]);

  const currentAllocations = useMemo(() => ({
    cashSavings: totalPortfolio * (allocations.cashSavings / 100),
    termDeposit: totalPortfolio * (allocations.termDeposit / 100),
    incomePortfolio: totalPortfolio * (allocations.incomePortfolio / 100),
    balancedPortfolio: totalPortfolio * (allocations.balancedPortfolio / 100),
    growthPortfolio: totalPortfolio * (allocations.growthPortfolio / 100)
  }), [totalPortfolio, allocations]);

  const totalAllocation = Object.values(allocations).reduce((a, b) => a + b, 0);
  const totalAccumulationAllocation = Object.values(accumulationAllocations).reduce((a, b) => a + b, 0);
  const updateAllocation = (key, value) => setAllocations(prev => ({ ...prev, [key]: parseFloat(value) || 0 }));
  const updateAccumulationAllocation = (key, value) => setAccumulationAllocations(prev => ({ ...prev, [key]: parseFloat(value) || 0 }));
  const updateReturn = (key, value) => setReturns(prev => ({ ...prev, [key]: parseFloat(value) || 0 }));

  const generatePDF = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <style>{`
        @media print {
          @page { margin: 1cm; size: A4; }
          body { margin: 0; padding: 0; }
          .no-print { display: none !important; }
          .page-break { page-break-before: always; }
          .avoid-break { page-break-inside: avoid; }
        }
      `}</style>

      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-8">
              <img 
                src="https://www.diligentwealth.co.nz/s/WealthGuard-Logo.jpg" 
                alt="WealthGuard" 
                className="h-28 w-auto" 
                crossOrigin="anonymous"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextElementSibling.style.display = 'flex';
                }}
              />
              <div style={{display: 'none'}} className="flex flex-col items-center justify-center h-28 px-8 bg-gradient-to-r from-amber-500 to-blue-900 rounded-lg">
                <div className="text-white text-2xl font-bold tracking-wider">WEALTHGUARD</div>
                <div className="text-white text-xs mt-1">Investment Bucketing Strategy</div>
              </div>
              <div className="h-20 w-px bg-slate-300"></div>
              <img 
                src="https://www.diligentwealth.co.nz/s/Diligent-Logo-Main.png" 
                alt="Diligent" 
                className="h-16 w-auto"
                crossOrigin="anonymous"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextElementSibling.style.display = 'flex';
                }}
              />
              <div style={{display: 'none'}} className="flex items-center gap-2 h-16">
                <div className="w-14 h-14 bg-gradient-to-br from-amber-500 to-amber-600 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-2xl">D</span>
                </div>
                <span className="text-4xl font-bold text-slate-800" style={{fontFamily: 'system-ui, sans-serif'}}>diligent</span>
              </div>
            </div>
            <button onClick={generatePDF} className="no-print flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold shadow-lg">
              <Download size={20} /> Export to PDF
            </button>
          </div>
          <div className="border-t-4 border-blue-600 pt-4"><p className="text-lg text-slate-600">Comprehensive Investment Bucketing Strategy</p></div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6 mb-6 avoid-break">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Client Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Client Name</label><input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md no-print" /><span className="hidden print:block">{clientName || 'Not specified'}</span></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Client Age</label><input type="number" value={clientAge} onChange={(e) => setClientAge(parseInt(e.target.value) || 0)} className="w-full px-3 py-2 border border-slate-300 rounded-md no-print" /><span className="hidden print:block">{clientAge}</span></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Retirement Age</label><input type="number" value={retirementAge} onChange={(e) => setRetirementAge(parseInt(e.target.value) || 65)} className="w-full px-3 py-2 border border-slate-300 rounded-md no-print" /><span className="hidden print:block">{retirementAge}</span></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Partner Name</label><input type="text" value={partnerName} onChange={(e) => { setPartnerName(e.target.value); setIsJoint(e.target.value.trim() !== ''); }} className="w-full px-3 py-2 border border-slate-300 rounded-md no-print" /><span className="hidden print:block">{partnerName || '-'}</span></div>
            {isJoint && <div><label className="block text-sm font-medium text-slate-700 mb-1">Partner Age</label><input type="number" value={partnerAge} onChange={(e) => setPartnerAge(parseInt(e.target.value) || 0)} className="w-full px-3 py-2 border border-slate-300 rounded-md no-print" /><span className="hidden print:block">{partnerAge}</span></div>}
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Current Super</label><div className="w-full px-3 py-2 bg-slate-100 border rounded-md font-medium">${currentSuperannuation.toLocaleString()}/yr</div></div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6 mb-6 no-print">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Current Investments</h2>
          <div className="space-y-4 mb-4">
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Cash</label><input type="number" value={cash} onChange={(e) => setCash(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 border border-slate-300 rounded-md" /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Term Deposits</label><input type="number" value={termDeposits} onChange={(e) => setTermDeposits(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 border border-slate-300 rounded-md" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-slate-700 mb-1">{clientName || 'Client'} KiwiSaver</label><input type="number" value={currentInvestments.find(inv => inv.id === 1)?.amount || 0} onChange={(e) => updateInvestment(1, 'amount', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md" /></div>
              {isJoint && <div><label className="block text-sm font-medium text-slate-700 mb-1">{partnerName || 'Partner'} KiwiSaver</label><input type="number" value={currentInvestments.find(inv => inv.id === 2)?.amount || 0} onChange={(e) => updateInvestment(2, 'amount', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md" /></div>}
            </div>
            {currentInvestments.filter(inv => inv.id > 2).map((inv) => (
              <div key={inv.id} className="grid grid-cols-2 gap-4">
                <div><input type="text" value={inv.label} onChange={(e) => updateInvestment(inv.id, 'label', e.target.value)} placeholder="Investment name" className="w-full px-3 py-2 border border-slate-300 rounded-md" /></div>
                <div className="flex gap-2"><input type="number" value={inv.amount} onChange={(e) => updateInvestment(inv.id, 'amount', e.target.value)} className="flex-1 px-3 py-2 border border-slate-300 rounded-md" /><button onClick={() => removeInvestment(inv.id)} className="px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600">Remove</button></div>
              </div>
            ))}
          </div>
          <button onClick={addInvestment} className="w-full px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600">+ Add Investment</button>
          <div className="mt-4 pt-4 border-t"><span className="text-lg font-bold">Total: ${totalPortfolio.toLocaleString()}</span></div>
        </div>

        <div className="hidden print:block avoid-break mb-6">
          <h3 className="text-lg font-bold mb-3">Current Portfolio</h3>
          <table className="w-full text-sm border-collapse">
            <tbody>
              <tr className="border-b"><td className="py-1">Cash</td><td className="text-right">${cash.toLocaleString()}</td></tr>
              <tr className="border-b"><td className="py-1">Term Deposits</td><td className="text-right">${termDeposits.toLocaleString()}</td></tr>
              <tr className="border-b"><td className="py-1">{clientName} KiwiSaver</td><td className="text-right">${(currentInvestments[0]?.amount || 0).toLocaleString()}</td></tr>
              {isJoint && <tr className="border-b"><td className="py-1">{partnerName} KiwiSaver</td><td className="text-right">${(currentInvestments[1]?.amount || 0).toLocaleString()}</td></tr>}
              {currentInvestments.filter(inv => inv.id > 2).map(inv => (
                <tr key={inv.id} className="border-b"><td className="py-1">{inv.label || 'Investment'}</td><td className="text-right">${inv.amount.toLocaleString()}</td></tr>
              ))}
              <tr className="font-bold border-t-2"><td className="py-2">Total</td><td className="text-right">${totalPortfolio.toLocaleString()}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 no-print">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-4">Retirement Planning</h2>
            <div className="space-y-4">
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Years Until Retirement</label><input type="number" value={yearsUntilRetirement} disabled className="w-full px-3 py-2 bg-slate-100 border rounded-md" /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Retirement Years</label><input type="number" value={projectionYears} onChange={(e) => setProjectionYears(parseInt(e.target.value) || 30)} className="w-full px-3 py-2 border border-slate-300 rounded-md" /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Contribution</label><input type="number" value={contributionAmount} onChange={(e) => setContributionAmount(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 border border-slate-300 rounded-md" /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Frequency</label><select value={contributionFrequency} onChange={(e) => setContributionFrequency(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md"><option value="weekly">Weekly</option><option value="fortnightly">Fortnightly</option><option value="monthly">Monthly</option><option value="annual">Annual</option></select></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Annual Income</label><input type="number" value={annualIncome} onChange={(e) => setAnnualIncome(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 border border-slate-300 rounded-md" /></div>
              <div className="bg-blue-50 p-3 rounded-md text-sm"><strong>Income over Super:</strong> ${incomeOverSuper.toLocaleString()}/yr</div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-lg font-bold mb-3">Accumulation Phase Allocation ({totalAccumulationAllocation.toFixed(1)}%)</h2>
              <div className="space-y-2">
                {[{k:'cashSavings',l:'Cash',c:'bg-yellow-100'},{k:'balancedPortfolio',l:'Balanced',c:'bg-blue-100'},{k:'growthPortfolio',l:'Growth',c:'bg-purple-100'}].map(({k,l,c})=>(
                  <div key={k} className={`${c} p-2 rounded`}><label className="text-sm font-medium mb-1">{l}</label><div className="flex gap-2"><input type="number" step="0.1" value={accumulationAllocations[k]} onChange={(e)=>updateAccumulationAllocation(k,e.target.value)} className="w-20 px-2 py-1 border rounded"/><span>%</span></div></div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-lg font-bold mb-3">Retirement Phase Allocation ({totalAllocation.toFixed(1)}%)</h2>
              <div className="space-y-2">
                {[{k:'cashSavings',l:'Cash',c:'bg-yellow-100'},{k:'termDeposit',l:'Term Dep',c:'bg-orange-100'},{k:'incomePortfolio',l:'Income',c:'bg-green-100'},{k:'balancedPortfolio',l:'Balanced',c:'bg-blue-100'},{k:'growthPortfolio',l:'Growth',c:'bg-purple-100'}].map(({k,l,c})=>(
                  <div key={k} className={`${c} p-2 rounded text-xs`}><label className="font-medium">{l}</label><div className="flex gap-2 items-center"><input type="number" step="0.1" value={allocations[k]} onChange={(e)=>updateAllocation(k,e.target.value)} className="w-16 px-2 py-1 border rounded"/><span>%</span><span className="ml-auto">${currentAllocations[k].toLocaleString(undefined,{maximumFractionDigits:0})}</span></div></div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6 mb-6 no-print">
          <h2 className="text-xl font-bold mb-4">Returns (%)</h2>
          <div className="grid grid-cols-5 gap-4">
            {[{k:'cashSavings',l:'Cash'},{k:'capitalPreservation',l:'Cap Pres'},{k:'incomeGenerator',l:'Income'},{k:'steadyGrowth',l:'Balanced'},{k:'strategicGrowth',l:'Growth'}].map(({k,l})=>(
              <div key={k}><label className="text-sm font-medium mb-1">{l}</label><div className="flex gap-1"><input type="number" step="0.1" value={returns[k]} onChange={(e)=>updateReturn(k,e.target.value)} className="w-full px-2 py-1 border rounded"/><span className="text-sm">%</span></div></div>
            ))}
          </div>
        </div>

        <div className="hidden print:block page-break"></div>

        <div className="bg-white rounded-lg shadow-lg p-6 mb-6 avoid-break">
          <h2 className="text-xl font-bold mb-4">Portfolio Growth</h2>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={calculateProjections} margin={{left:40,right:20,top:5,bottom:5}}>
              <CartesianGrid strokeDasharray="3 3"/>
              <XAxis dataKey="year"/>
              <YAxis tickFormatter={(v)=>`$${v.toLocaleString()}`} width={100}/>
              <Tooltip formatter={(v)=>`$${v.toLocaleString()}`}/>
              <Legend/>
              <Line type="monotone" dataKey="Total" stroke="#1f2937" strokeWidth={3} dot={false}/>
              <Line type="monotone" dataKey="Cash Savings" stroke="#eab308" strokeWidth={2} dot={false}/>
              <Line type="monotone" dataKey="Capital Preservation" stroke="#f97316" strokeWidth={2} dot={false}/>
              <Line type="monotone" dataKey="Income Generator" stroke="#22c55e" strokeWidth={2} dot={false}/>
              <Line type="monotone" dataKey="Steady Growth" stroke="#3b82f6" strokeWidth={2} dot={false}/>
              <Line type="monotone" dataKey="Strategic Growth" stroke="#a855f7" strokeWidth={2} dot={false}/>
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6 avoid-break">
          <h2 className="text-xl font-bold mb-4">Income Drawdown</h2>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={calculateDrawdown} margin={{left:40,right:20,top:5,bottom:5}}>
              <CartesianGrid strokeDasharray="3 3"/>
              <XAxis dataKey="year"/>
              <YAxis tickFormatter={(v)=>`$${v.toLocaleString()}`} width={100}/>
              <Tooltip formatter={(v)=>`$${v.toLocaleString()}`}/>
              <Legend/>
              <Line type="monotone" dataKey="Annual Drawdown" stroke="#dc2626" strokeWidth={2} dot={false}/>
              <Line type="monotone" dataKey="Cumulative Drawdown" stroke="#7c3aed" strokeWidth={3} dot={false}/>
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs mt-3 no-print">Income drawn increases 2% annually for inflation. Retirement starts year {yearsUntilRetirement}.</p>
        </div>

        <div className="hidden print:block mt-6 text-xs text-slate-600">
          <p><strong>Prepared by Diligent Wealth Management</strong> • {new Date().toLocaleDateString('en-NZ')}</p>
          <p className="mt-2">CONFIDENTIAL - This document contains projections and should not be considered financial advice.</p>
        </div>

        <div className="mt-8 bg-slate-100 rounded-lg p-6 no-print">
          <h3 className="font-semibold text-slate-800 mb-2">About WealthGuard</h3>
          <p className="text-sm text-slate-600 mb-4">
            WealthGuard is a comprehensive investment strategy designed to maximize earning potential while employed 
            and minimize risk during retirement. The strategy uses five distinct buckets ranging from liquid cash reserves 
            to strategic growth investments, each with different timeframes and risk profiles to ensure optimal diversification 
            and protection throughout your financial journey.
          </p>
          <div className="border-t pt-4 mt-4 text-sm text-slate-500">
            <p className="font-semibold text-slate-700 mb-2">Diligent Wealth Management</p>
            <p>CONFIDENTIAL - For Diligent Wealth Management and client use only</p>
            <p className="mt-2">This document contains projections based on assumptions and should not be considered as financial advice. 
            Past performance is not indicative of future results. Please consult with your financial advisor for personalized guidance.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
