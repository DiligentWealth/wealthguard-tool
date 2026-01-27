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
  const [retirementContributionAmount, setRetirementContributionAmount] = useState(0);
  const [retirementContributionFrequency, setRetirementContributionFrequency] = useState('annual');
  const [retirementContributionYearsAway, setRetirementContributionYearsAway] = useState(0);
  
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
    
    // Base rates (current 2026 rates)
    const singleRate = 27994.53;
    const coupleRateEach = 21656.14;
    
    // Apply 2% inflation per year
    const inflationFactor = Math.pow(1.02, year);
    
    if (isJoint) {
      // For couples, both get the couple rate when both eligible
      if (clientEligible && partnerEligible) {
        return coupleRateEach * 2 * inflationFactor;
      } else if (clientEligible || partnerEligible) {
        // One eligible gets couple rate, other gets nothing
        return coupleRateEach * inflationFactor;
      }
    } else {
      // Single person gets single rate
      if (clientEligible) {
        return singleRate * inflationFactor;
      }
    }
    return 0;
  };
  
  const yearsUntilRetirement = Math.max(0, retirementAge - clientAge);
  const currentSuperannuation = getSuperannuationForYear(0);
  const incomeOverSuper = Math.max(0, annualIncome - currentSuperannuation);
  
  const annualContribution = contributionFrequency === 'weekly' ? contributionAmount * 52 
    : contributionFrequency === 'fortnightly' ? contributionAmount * 26
    : contributionFrequency === 'monthly' ? contributionAmount * 12 : contributionAmount;

  const annualRetirementContribution = retirementContributionFrequency === 'oneoff' ? 0 
    : retirementContributionFrequency === 'weekly' ? retirementContributionAmount * 52 
    : retirementContributionFrequency === 'fortnightly' ? retirementContributionAmount * 26
    : retirementContributionFrequency === 'monthly' ? retirementContributionAmount * 12 : retirementContributionAmount;

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
          
          let remaining = drawdown;
          const totalBucket = cashBucket + termDepBucket + incomeBucket + balancedBucket + growthBucket;
          if (totalBucket > 0) {
            const proportions = { cash: cashBucket / totalBucket, termDep: termDepBucket / totalBucket, income: incomeBucket / totalBucket, balanced: balancedBucket / totalBucket, growth: growthBucket / totalBucket };
            cashBucket = Math.max(0, cashBucket - remaining * proportions.cash);
            termDepBucket = Math.max(0, termDepBucket - remaining * proportions.termDep);
            incomeBucket = Math.max(0, incomeBucket - remaining * proportions.income);
            balancedBucket = Math.max(0, balancedBucket - remaining * proportions.balanced);
            growthBucket = Math.max(0, growthBucket - remaining * proportions.growth);
          }
          
          // Add regular retirement contributions after drawdown
          if (annualRetirementContribution > 0) {
            const totalAfterDrawdown = cashBucket + termDepBucket + incomeBucket + balancedBucket + growthBucket;
            if (totalAfterDrawdown > 0) {
              const currentAllocPct = {
                cash: cashBucket / totalAfterDrawdown,
                termDep: termDepBucket / totalAfterDrawdown,
                income: incomeBucket / totalAfterDrawdown,
                balanced: balancedBucket / totalAfterDrawdown,
                growth: growthBucket / totalAfterDrawdown
              };
              cashBucket += annualRetirementContribution * currentAllocPct.cash;
              termDepBucket += annualRetirementContribution * currentAllocPct.termDep;
              incomeBucket += annualRetirementContribution * currentAllocPct.income;
              balancedBucket += annualRetirementContribution * currentAllocPct.balanced;
              growthBucket += annualRetirementContribution * currentAllocPct.growth;
            }
          }
          
          // Add one-off contribution if this is the specified year
          if (retirementContributionFrequency === 'oneoff' && yearsInto === retirementContributionYearsAway && retirementContributionAmount > 0) {
            const totalAfterDrawdown = cashBucket + termDepBucket + incomeBucket + balancedBucket + growthBucket;
            if (totalAfterDrawdown > 0) {
              const currentAllocPct = {
                cash: cashBucket / totalAfterDrawdown,
                termDep: termDepBucket / totalAfterDrawdown,
                income: incomeBucket / totalAfterDrawdown,
                balanced: balancedBucket / totalAfterDrawdown,
                growth: growthBucket / totalAfterDrawdown
              };
              cashBucket += retirementContributionAmount * currentAllocPct.cash;
              termDepBucket += retirementContributionAmount * currentAllocPct.termDep;
              incomeBucket += retirementContributionAmount * currentAllocPct.income;
              balancedBucket += retirementContributionAmount * currentAllocPct.balanced;
              growthBucket += retirementContributionAmount * currentAllocPct.growth;
            }
          }
        }
      }
    }
    return data;
  }, [totalPortfolio, allocations, accumulationAllocations, returns, annualIncome, yearsUntilRetirement, projectionYears, annualContribution, annualRetirementContribution, retirementContributionAmount, retirementContributionFrequency, retirementContributionYearsAway, clientAge, partnerAge, isJoint, retirementAge]);

  const calculateDrawdown = useMemo(() => {
    const data = [];
    let cumulative = 0;
    for (let year = 0; year <= projectionYears; year++) {
      const yearSuper = getSuperannuationForYear(year);
      const inflatedIncome = annualIncome * Math.pow(1.02, year);
      const annual = Math.max(0, inflatedIncome - yearSuper);
      cumulative += annual;
      data.push({ year, 'Annual Drawdown': Math.round(annual), 'Cumulative Drawdown': Math.round(cumulative) });
    }
    return data;
  }, [annualIncome, projectionYears, clientAge, partnerAge, isJoint, retirementAge]);

  const totalAllocation = Object.values(allocations).reduce((sum, val) => sum + val, 0);
  const totalAccumulationAllocation = Object.values(accumulationAllocations).reduce((sum, val) => sum + val, 0);

  const updateAllocation = (key, value) => {
    const numVal = parseFloat(value) || 0;
    setAllocations({ ...allocations, [key]: numVal });
  };

  const updateAccumulationAllocation = (key, value) => {
    const numVal = parseFloat(value) || 0;
    setAccumulationAllocations({ ...accumulationAllocations, [key]: numVal });
  };

  const updateReturn = (key, value) => {
    const numVal = parseFloat(value) || 0;
    setReturns({ ...returns, [key]: numVal });
  };

  const currentAllocations = {
    cashSavings: totalPortfolio * (allocations.cashSavings / 100),
    termDeposit: totalPortfolio * (allocations.termDeposit / 100),
    incomePortfolio: totalPortfolio * (allocations.incomePortfolio / 100),
    balancedPortfolio: totalPortfolio * (allocations.balancedPortfolio / 100),
    growthPortfolio: totalPortfolio * (allocations.growthPortfolio / 100)
  };

  const handlePrint = () => window.print();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <style>{`
        @media print {
          body { margin: 0; padding: 0; }
          .no-print { display: none !important; }
          .page-break { page-break-before: always; }
          .avoid-break { page-break-inside: avoid; }
          .print-show { display: block !important; }
          
          /* Page margins */
          @page {
            margin: 1.5cm;
            size: A4;
          }
          
          /* Remove shadows for print */
          .shadow-lg, .shadow-xl {
            box-shadow: none !important;
          }
          
          /* Container width for print */
          .max-w-7xl {
            max-width: 100% !important;
          }
          
          /* Chart containers - fixed size */
          .chart-container-print {
            width: 100% !important;
            max-width: 700px !important;
            margin: 0 auto !important;
          }
        }
        @media screen {
          .print-show { display: none; }
          .chart-container-print {
            width: 100%;
          }
        }
      `}</style>

      <div className="max-w-7xl mx-auto p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <img src="https://www.diligentwealth.co.nz/s/WealthGuard-Logo.jpg" alt="WealthGuard" className="h-12" />
            </div>
            <div className="text-right">
              <img src="https://www.diligentwealth.co.nz/s/Diligent-Logo-Main.png" alt="Diligent" className="h-10" />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-slate-800 mb-2">Investment Bucketing Strategy</h1>
          <h2 className="text-xl text-slate-600 mb-6">Comprehensive Investment Bucketing Strategy</h2>

          <button onClick={handlePrint} className="mb-6 px-6 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 flex items-center gap-2 no-print">
            <Download size={20} /> Download PDF
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 no-print">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-4">Client Information</h2>
            <div className="space-y-4">
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Client Name</label><input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md" /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Client Age</label><input type="number" value={clientAge} onChange={(e) => setClientAge(parseInt(e.target.value) || 60)} className="w-full px-3 py-2 border border-slate-300 rounded-md" /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Retirement Age</label><input type="number" value={retirementAge} onChange={(e) => setRetirementAge(parseInt(e.target.value) || 65)} className="w-full px-3 py-2 border border-slate-300 rounded-md" /></div>
              <div className="flex items-center gap-2"><input type="checkbox" id="joint" checked={isJoint} onChange={(e) => setIsJoint(e.target.checked)} className="w-4 h-4" /><label htmlFor="joint" className="text-sm font-medium text-slate-700">Joint Account</label></div>
              {isJoint && (<><div><label className="block text-sm font-medium text-slate-700 mb-1">Partner Name</label><input type="text" value={partnerName} onChange={(e) => setPartnerName(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md" /></div><div><label className="block text-sm font-medium text-slate-700 mb-1">Partner Age</label><input type="number" value={partnerAge} onChange={(e) => setPartnerAge(parseInt(e.target.value) || 60)} className="w-full px-3 py-2 border border-slate-300 rounded-md" /></div></>)}
              <div className="bg-blue-50 p-3 rounded-md text-sm"><strong>Current Super:</strong> ${Math.round(currentSuperannuation).toLocaleString()}/yr</div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-4">Current Investments</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium mb-1">Cash</label><input type="number" value={cash} onChange={(e) => setCash(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 border rounded-md" /></div>
                <div><label className="block text-sm font-medium mb-1">Term Deposits</label><input type="number" value={termDeposits} onChange={(e) => setTermDeposits(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 border rounded-md" /></div>
              </div>
              {currentInvestments.map((inv, idx) => (
                <div key={inv.id} className="flex gap-2 items-end">
                  <div className="flex-1"><label className="block text-sm font-medium mb-1">{idx < 2 ? (idx === 0 ? `${clientName || 'Client'} KiwiSaver` : `${partnerName || 'Partner'} KiwiSaver`) : 'Investment'}</label><input type="text" value={inv.label} onChange={(e) => updateInvestment(inv.id, 'label', e.target.value)} placeholder="Label" className="w-full px-3 py-2 border rounded-md text-sm" disabled={idx < 2} /></div>
                  <div className="flex-1"><label className="block text-sm font-medium mb-1">Amount</label><input type="number" value={inv.amount} onChange={(e) => updateInvestment(inv.id, 'amount', e.target.value)} className="w-full px-3 py-2 border rounded-md" /></div>
                  {inv.id > 2 && <button onClick={() => removeInvestment(inv.id)} className="px-3 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200">✕</button>}
                </div>
              ))}
              <button onClick={addInvestment} className="w-full px-4 py-2 bg-slate-200 text-slate-700 rounded-md hover:bg-slate-300">+ Add Investment</button>
              <div className="mt-4 p-3 bg-slate-100 rounded-md font-bold text-lg">Total Portfolio: ${totalPortfolio.toLocaleString()}</div>
            </div>
          </div>
        </div>

        <div className="hidden print:block avoid-break bg-white p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Client Information</h2>
          <table className="w-full text-sm border-collapse mb-6">
            <tbody>
              <tr className="border-b"><td className="py-2 font-medium">Client Name</td><td className="text-right">{clientName}</td></tr>
              <tr className="border-b"><td className="py-2 font-medium">Client Age</td><td className="text-right">{clientAge}</td></tr>
              <tr className="border-b"><td className="py-2 font-medium">Retirement Age</td><td className="text-right">{retirementAge}</td></tr>
              {isJoint && (<><tr className="border-b"><td className="py-2 font-medium">Partner Name</td><td className="text-right">{partnerName}</td></tr><tr className="border-b"><td className="py-2 font-medium">Partner Age</td><td className="text-right">{partnerAge}</td></tr></>)}
              <tr className="border-b"><td className="py-2 font-medium">Current Super</td><td className="text-right">${Math.round(currentSuperannuation).toLocaleString()}/yr</td></tr>
            </tbody>
          </table>

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

        <div className="hidden print:block avoid-break bg-white p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Retirement Planning</h2>
          <table className="w-full text-sm border-collapse mb-4">
            <tbody>
              <tr className="border-b"><td className="py-2 font-medium">Years Until Retirement</td><td className="text-right">{yearsUntilRetirement}</td></tr>
              <tr className="border-b"><td className="py-2 font-medium">Retirement Years</td><td className="text-right">{projectionYears}</td></tr>
              <tr className="border-b"><td className="py-2 font-medium">Contribution</td><td className="text-right">${contributionAmount.toLocaleString()}</td></tr>
              <tr className="border-b"><td className="py-2 font-medium">Frequency</td><td className="text-right">{contributionFrequency}</td></tr>
              <tr className="border-b"><td className="py-2 font-medium">Annual Income</td><td className="text-right">${annualIncome.toLocaleString()}</td></tr>
              <tr className="font-bold border-t-2"><td className="py-2">Income over Super</td><td className="text-right">${incomeOverSuper.toLocaleString()}/yr</td></tr>
              <tr className="border-t pt-2"><td colSpan="2" className="py-2 font-semibold text-slate-700">Retirement Phase Contributions</td></tr>
              <tr className="border-b"><td className="py-2 font-medium">Contribution Amount</td><td className="text-right">${retirementContributionAmount.toLocaleString()}</td></tr>
              <tr className="border-b"><td className="py-2 font-medium">Frequency</td><td className="text-right">{retirementContributionFrequency}</td></tr>
              {retirementContributionFrequency === 'oneoff' ? (
                <tr className="font-bold border-t-2"><td className="py-2">One-off in Year</td><td className="text-right">{retirementContributionYearsAway} ({retirementAge + retirementContributionYearsAway} years old)</td></tr>
              ) : (
                <tr className="font-bold border-t-2"><td className="py-2">Annual Contribution</td><td className="text-right">${annualRetirementContribution.toLocaleString()}/yr</td></tr>
              )}
            </tbody>
          </table>

          <h3 className="text-lg font-bold mb-3">Accumulation Phase Allocation</h3>
          <table className="w-full text-sm border-collapse mb-4">
            <tbody>
              <tr className="border-b"><td className="py-2">Cash Savings</td><td className="text-right">{accumulationAllocations.cashSavings.toFixed(1)}%</td></tr>
              <tr className="border-b"><td className="py-2">Balanced Portfolio</td><td className="text-right">{accumulationAllocations.balancedPortfolio.toFixed(1)}%</td></tr>
              <tr className="border-b"><td className="py-2">Growth Portfolio</td><td className="text-right">{accumulationAllocations.growthPortfolio.toFixed(1)}%</td></tr>
              <tr className="font-bold border-t-2"><td className="py-2">Total</td><td className="text-right">{totalAccumulationAllocation.toFixed(1)}%</td></tr>
            </tbody>
          </table>

          <h3 className="text-lg font-bold mb-3">Retirement Phase Allocation</h3>
          <table className="w-full text-sm border-collapse">
            <tbody>
              <tr className="border-b"><td className="py-2">Cash Savings</td><td className="text-right">{allocations.cashSavings.toFixed(1)}%</td><td className="text-right">${currentAllocations.cashSavings.toLocaleString(undefined, {maximumFractionDigits: 0})}</td></tr>
              <tr className="border-b"><td className="py-2">Term Deposit</td><td className="text-right">{allocations.termDeposit.toFixed(1)}%</td><td className="text-right">${currentAllocations.termDeposit.toLocaleString(undefined, {maximumFractionDigits: 0})}</td></tr>
              <tr className="border-b"><td className="py-2">Income Portfolio</td><td className="text-right">{allocations.incomePortfolio.toFixed(1)}%</td><td className="text-right">${currentAllocations.incomePortfolio.toLocaleString(undefined, {maximumFractionDigits: 0})}</td></tr>
              <tr className="border-b"><td className="py-2">Balanced Portfolio</td><td className="text-right">{allocations.balancedPortfolio.toFixed(1)}%</td><td className="text-right">${currentAllocations.balancedPortfolio.toLocaleString(undefined, {maximumFractionDigits: 0})}</td></tr>
              <tr className="border-b"><td className="py-2">Growth Portfolio</td><td className="text-right">{allocations.growthPortfolio.toFixed(1)}%</td><td className="text-right">${currentAllocations.growthPortfolio.toLocaleString(undefined, {maximumFractionDigits: 0})}</td></tr>
              <tr className="font-bold border-t-2"><td className="py-2">Total</td><td className="text-right">{totalAllocation.toFixed(1)}%</td><td className="text-right">${totalPortfolio.toLocaleString(undefined, {maximumFractionDigits: 0})}</td></tr>
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
              <div className="border-t pt-4 mt-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Retirement Phase Contributions</h3>
                <div className="space-y-3">
                  <div><label className="block text-sm font-medium text-slate-700 mb-1">Contribution Amount</label><input type="number" value={retirementContributionAmount} onChange={(e) => setRetirementContributionAmount(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 border border-slate-300 rounded-md" /></div>
                  <div><label className="block text-sm font-medium text-slate-700 mb-1">Frequency</label><select value={retirementContributionFrequency} onChange={(e) => setRetirementContributionFrequency(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md"><option value="weekly">Weekly</option><option value="fortnightly">Fortnightly</option><option value="monthly">Monthly</option><option value="annual">Annual</option><option value="oneoff">One-off</option></select></div>
                  {retirementContributionFrequency === 'oneoff' && (
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">Years After Retirement</label><input type="number" value={retirementContributionYearsAway} onChange={(e) => setRetirementContributionYearsAway(parseInt(e.target.value) || 0)} className="w-full px-3 py-2 border border-slate-300 rounded-md" min="0" /></div>
                  )}
                  {retirementContributionFrequency !== 'oneoff' && (
                    <div className="bg-green-50 p-3 rounded-md text-sm"><strong>Annual Contribution:</strong> ${annualRetirementContribution.toLocaleString()}/yr</div>
                  )}
                  {retirementContributionFrequency === 'oneoff' && (
                    <div className="bg-green-50 p-3 rounded-md text-sm"><strong>One-off in Year:</strong> {retirementContributionYearsAway} ({retirementAge + retirementContributionYearsAway} years old)</div>
                  )}
                </div>
              </div>
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
          <div className="chart-container-print">
            <ResponsiveContainer width="100%" height={380}>
              <LineChart data={calculateProjections} margin={{left:20,right:10,top:5,bottom:5}}>
                <CartesianGrid strokeDasharray="3 3"/>
                <XAxis dataKey="year"/>
                <YAxis tickFormatter={(v)=>`$${v.toLocaleString()}`} width={80}/>
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
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6 avoid-break">
          <h2 className="text-xl font-bold mb-4">Income Drawdown</h2>
          <div className="chart-container-print">
            <ResponsiveContainer width="100%" height={330}>
              <LineChart data={calculateDrawdown} margin={{left:20,right:10,top:5,bottom:5}}>
                <CartesianGrid strokeDasharray="3 3"/>
                <XAxis dataKey="year"/>
                <YAxis tickFormatter={(v)=>`$${v.toLocaleString()}`} width={80}/>
                <Tooltip formatter={(v)=>`$${v.toLocaleString()}`}/>
                <Legend/>
                <Line type="monotone" dataKey="Annual Drawdown" stroke="#dc2626" strokeWidth={2} dot={false}/>
                <Line type="monotone" dataKey="Cumulative Drawdown" stroke="#7c3aed" strokeWidth={3} dot={false}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs mt-3 no-print">Income drawn increases 2% annually for inflation. Retirement starts year {yearsUntilRetirement}.</p>
        </div>

        <div className="hidden print:block mt-6 text-xs text-slate-600">
          <p><strong>Prepared by Diligent Wealth Management</strong> • {new Date().toLocaleDateString('en-NZ')}</p>
          <p className="mt-2"><strong>Important information – projections</strong></p>
          <p className="mt-1">This document contains forward-looking projections based on assumptions, estimates, and information available at the time it was prepared. Projections are illustrative only and are not guarantees of future performance or outcomes. Actual results may differ materially due to changes in markets, legislation, fees, taxation, and individual circumstances. These projections should be read together with the personalised financial advice and disclosures provided by Diligent Wealth Management Limited and should not be relied on in isolation when making financial decisions.</p>
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
