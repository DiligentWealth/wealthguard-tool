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
    { id: 1, label: '', amount: 200000, isKiwiSaver: false },
    { id: 2, label: '', amount: 370000, isKiwiSaver: false },
    { id: 3, label: '', amount: 270763, isKiwiSaver: false }
  ]);
  
  const [cash, setCash] = useState(36000);
  const [termDeposits, setTermDeposits] = useState(120000);
  
  const [yearsUntilRetirement, setYearsUntilRetirement] = useState(0);
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

  const superannuationEligibilityAge = 65;
  
  // Calculate years until each person reaches super eligibility
  const yearsUntilClientSuper = Math.max(0, superannuationEligibilityAge - clientAge);
  const yearsUntilPartnerSuper = isJoint ? Math.max(0, superannuationEligibilityAge - partnerAge) : 0;
  
  // Calculate superannuation income based on years into retirement and ages
  const getSuperannuationForYear = (year) => {
    const clientCurrentAge = clientAge + yearsUntilRetirement + year;
    const partnerCurrentAge = isJoint ? partnerAge + yearsUntilRetirement + year : 0;
    
    const clientEligible = clientCurrentAge >= superannuationEligibilityAge;
    const partnerEligible = isJoint && partnerCurrentAge >= superannuationEligibilityAge;
    
    if (clientEligible && partnerEligible) {
      return 43056; // Both eligible
    } else if (clientEligible || partnerEligible) {
      return 27998; // One eligible
    }
    return 0; // Neither eligible yet
  };
  
  const currentSuperannuation = getSuperannuationForYear(0);
  const incomeOverSuper = Math.max(0, annualIncome - currentSuperannuation);
  
  // Calculate annual contribution based on frequency
  const annualContribution = contributionFrequency === 'weekly' 
    ? contributionAmount * 52 
    : contributionFrequency === 'fortnightly'
    ? contributionAmount * 26
    : contributionFrequency === 'monthly'
    ? contributionAmount * 12
    : contributionAmount; // annual

  const totalInvestments = currentInvestments.reduce((sum, inv) => sum + inv.amount, 0);
  const totalPortfolio = cash + termDeposits + totalInvestments;

  const addInvestment = () => {
    setCurrentInvestments([...currentInvestments, { 
      id: Date.now(), 
      label: '', 
      amount: 0,
      isKiwiSaver: false
    }]);
  };

  const removeInvestment = (id) => {
    // Don't allow removing the first two KiwiSaver entries
    if (id <= 2) return;
    setCurrentInvestments(currentInvestments.filter(inv => inv.id !== id));
  };

  const updateInvestment = (id, field, value) => {
    setCurrentInvestments(currentInvestments.map(inv => 
      inv.id === id ? { ...inv, [field]: field === 'amount' ? (parseFloat(value) || 0) : value } : inv
    ));
  };

  const calculateProjections = useMemo(() => {
    const data = [];
    
    // Start with current portfolio in accumulation allocation during pre-retirement
    let cashBucket = totalPortfolio * (accumulationAllocations.cashSavings / 100);
    let balancedBucket = totalPortfolio * (accumulationAllocations.balancedPortfolio / 100);
    let growthBucket = totalPortfolio * (accumulationAllocations.growthPortfolio / 100);
    
    // Initialize retirement buckets (will be populated at retirement)
    let termDepBucket = 0;
    let incomeBucket = 0;
    
    const inflationRate = 0.02; // 2% annual inflation

    for (let year = 0; year <= yearsUntilRetirement + projectionYears; year++) {
      const isRetired = year >= yearsUntilRetirement;
      const isAccumulating = year < yearsUntilRetirement;
      
      // At retirement, redistribute portfolio into full 5-bucket strategy
      if (year === yearsUntilRetirement && yearsUntilRetirement > 0) {
        const retirementPortfolio = cashBucket + balancedBucket + growthBucket;
        cashBucket = retirementPortfolio * (allocations.cashSavings / 100);
        termDepBucket = retirementPortfolio * (allocations.termDeposit / 100);
        incomeBucket = retirementPortfolio * (allocations.incomePortfolio / 100);
        balancedBucket = retirementPortfolio * (allocations.balancedPortfolio / 100);
        growthBucket = retirementPortfolio * (allocations.growthPortfolio / 100);
      }
      
      // If starting at retirement (yearsUntilRetirement = 0), use current portfolio allocation
      if (yearsUntilRetirement === 0 && year === 0) {
        cashBucket = totalPortfolio * (allocations.cashSavings / 100);
        termDepBucket = totalPortfolio * (allocations.termDeposit / 100);
        incomeBucket = totalPortfolio * (allocations.incomePortfolio / 100);
        balancedBucket = totalPortfolio * (allocations.balancedPortfolio / 100);
        growthBucket = totalPortfolio * (allocations.growthPortfolio / 100);
      }
      
      data.push({
        year,
        'Cash Savings': Math.round(cashBucket),
        'Capital Preservation': Math.round(termDepBucket),
        'Income Generator': Math.round(incomeBucket),
        'Steady Growth': Math.round(balancedBucket),
        'Strategic Growth': Math.round(growthBucket),
        'Total': Math.round(cashBucket + termDepBucket + incomeBucket + balancedBucket + growthBucket)
      });

      if (year < yearsUntilRetirement + projectionYears) {
        // Add regular contributions during accumulation phase to accumulation buckets
        if (isAccumulating && annualContribution > 0) {
          const cashContribution = annualContribution * (accumulationAllocations.cashSavings / 100);
          const balancedContribution = annualContribution * (accumulationAllocations.balancedPortfolio / 100);
          const growthContribution = annualContribution * (accumulationAllocations.growthPortfolio / 100);
          
          cashBucket += cashContribution;
          balancedBucket += balancedContribution;
          growthBucket += growthContribution;
        }

        // Apply returns
        cashBucket = cashBucket * (1 + returns.cashSavings / 100);
        termDepBucket = termDepBucket * (1 + returns.capitalPreservation / 100);
        incomeBucket = incomeBucket * (1 + returns.incomeGenerator / 100);
        balancedBucket = balancedBucket * (1 + returns.steadyGrowth / 100);
        growthBucket = growthBucket * (1 + returns.strategicGrowth / 100);

        // Drawdown only during retirement
        if (isRetired) {
          // Calculate super for this specific year in retirement
          const yearsIntoRetirement = year - yearsUntilRetirement;
          const yearSuper = getSuperannuationForYear(yearsIntoRetirement);
          const inflatedAnnualIncome = annualIncome * Math.pow(1 + inflationRate, yearsIntoRetirement);
          const currentDrawdown = Math.max(0, inflatedAnnualIncome - yearSuper);
          
          const totalDrawable = incomeBucket + balancedBucket + growthBucket;
          const incomeRatio = totalDrawable > 0 ? incomeBucket / totalDrawable : 0.33;
          const balancedRatio = totalDrawable > 0 ? balancedBucket / totalDrawable : 0.33;
          const growthRatio = totalDrawable > 0 ? growthBucket / totalDrawable : 0.34;

          incomeBucket = Math.max(0, incomeBucket - (currentDrawdown * incomeRatio));
          balancedBucket = Math.max(0, balancedBucket - (currentDrawdown * balancedRatio));
          growthBucket = Math.max(0, growthBucket - (currentDrawdown * growthRatio));
        }
      }
    }
    return data;
  }, [totalPortfolio, allocations, accumulationAllocations, returns, annualIncome, yearsUntilRetirement, projectionYears, annualContribution, clientAge, partnerAge, isJoint, getSuperannuationForYear]);

  const calculateDrawdown = useMemo(() => {
    const data = [];
    let cumulativeDrawdown = 0;
    let currentAnnualDrawdown = incomeOverSuper;
    const inflationRate = 0.02; // 2% annual inflation

    for (let year = 0; year <= yearsUntilRetirement + projectionYears; year++) {
      const isRetired = year >= yearsUntilRetirement;
      
      // Calculate actual income over super for this specific year
      const yearSuper = isRetired ? getSuperannuationForYear(year - yearsUntilRetirement) : 0;
      const yearIncomeOverSuper = Math.max(0, annualIncome - yearSuper);
      
      if (isRetired) {
        cumulativeDrawdown += yearIncomeOverSuper;
      }

      data.push({
        year,
        'Annual Drawdown': isRetired ? Math.round(yearIncomeOverSuper) : 0,
        'Cumulative Drawdown': Math.round(cumulativeDrawdown)
      });

      // Apply inflation for next year
      if (isRetired && year > yearsUntilRetirement) {
        const inflationFactor = Math.pow(1 + inflationRate, year - yearsUntilRetirement);
        // Recalculate based on inflated income need
      }
    }
    return data;
  }, [annualIncome, yearsUntilRetirement, projectionYears, clientAge, partnerAge, isJoint, getSuperannuationForYear]);

  const currentAllocations = useMemo(() => {
    return {
      cashSavings: totalPortfolio * (allocations.cashSavings / 100),
      termDeposit: totalPortfolio * (allocations.termDeposit / 100),
      incomePortfolio: totalPortfolio * (allocations.incomePortfolio / 100),
      balancedPortfolio: totalPortfolio * (allocations.balancedPortfolio / 100),
      growthPortfolio: totalPortfolio * (allocations.growthPortfolio / 100)
    };
  }, [totalPortfolio, allocations]);

  const totalAllocation = Object.values(allocations).reduce((a, b) => a + b, 0);
  const totalAccumulationAllocation = Object.values(accumulationAllocations).reduce((a, b) => a + b, 0);

  const updateAllocation = (key, value) => {
    const numValue = parseFloat(value) || 0;
    setAllocations(prev => ({ ...prev, [key]: numValue }));
  };

  const updateAccumulationAllocation = (key, value) => {
    const numValue = parseFloat(value) || 0;
    setAccumulationAllocations(prev => ({ ...prev, [key]: numValue }));
  };

  const updateReturn = (key, value) => {
    const numValue = parseFloat(value) || 0;
    setReturns(prev => ({ ...prev, [key]: numValue }));
  };

  const generatePDF = () => {
    try {
      // Hide interactive elements and show print-only summary
      document.getElementById('interactive-content').style.display = 'none';
      document.getElementById('print-summary').style.display = 'block';
      
      // Trigger print
      window.print();
      
      // Restore interactive view after print dialog closes
      setTimeout(() => {
        document.getElementById('interactive-content').style.display = 'block';
        document.getElementById('print-summary').style.display = 'none';
      }, 1000);
    } catch (error) {
      console.error('Print error:', error);
      alert('Unable to open print dialog. Please use Ctrl+P (Windows) or Cmd+P (Mac) to print.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <style>{`
        @media print {
          body { 
            print-color-adjust: exact; 
            -webkit-print-color-adjust: exact;
            margin: 0;
            padding: 0;
          }
          #interactive-content { display: none !important; }
          #print-summary { display: block !important; }
          @page { 
            margin: 1.5cm;
            size: A4;
          }
          .page-break { page-break-before: always; }
          .avoid-break { page-break-inside: avoid; }
        }
        #print-summary {
          display: none;
        }
      `}</style>
      
      {/* Interactive Content - Shown on screen */}
      <div id="interactive-content">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-8">
              <div className="flex flex-col items-center">
                <img 
                  src="https://www.diligentwealth.co.nz/s/WealthGuard-Logo.jpg" 
                  alt="WealthGuard Logo"
                  className="h-28 w-auto"
                  crossOrigin="anonymous"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextElementSibling.style.display = 'flex';
                  }}
                />
                <div style={{display: 'none'}} className="flex flex-col items-center justify-center h-28 w-64 bg-gradient-to-br from-amber-500 to-blue-800 rounded-lg">
                  <div className="text-white text-2xl font-bold">WEALTHGUARD</div>
                  <div className="text-white text-xs mt-1">Investment Bucketing Strategy</div>
                </div>
              </div>
              
              <div className="h-20 w-px bg-slate-300"></div>
              
              <div className="flex flex-col items-center">
                <img 
                  src="https://www.diligentwealth.co.nz/s/Diligent-Logo-Main.png" 
                  alt="Diligent Wealth Management"
                  className="h-16 w-auto"
                  crossOrigin="anonymous"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextElementSibling.style.display = 'flex';
                  }}
                />
                <div style={{display: 'none'}} className="flex items-center gap-2 h-16">
                  <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-amber-600 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-xl">D</span>
                  </div>
                  <span className="text-3xl font-bold text-slate-800">diligent</span>
                </div>
              </div>
            </div>
            <button 
              onClick={generatePDF}
              className="no-print flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold shadow-lg transition-colors"
            >
              <Download size={20} />
              Export to PDF
            </button>
          </div>
          
          <div className="border-t-4 border-blue-600 pt-4">
            <p className="text-lg text-slate-600">Comprehensive Investment Bucketing Strategy</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Client Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Client Name
              </label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Enter client name"
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Client Age
              </label>
              <input
                type="number"
                value={clientAge}
                onChange={(e) => setClientAge(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Retirement Age
              </label>
              <input
                type="number"
                value={retirementAge}
                onChange={(e) => {
                  const age = parseInt(e.target.value) || 65;
                  setRetirementAge(age);
                  setYearsUntilRetirement(Math.max(0, age - clientAge));
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Partner Name (Optional)
              </label>
              <input
                type="text"
                value={partnerName}
                onChange={(e) => {
                  setPartnerName(e.target.value);
                  setIsJoint(e.target.value.trim() !== '');
                }}
                placeholder="Enter partner name"
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {isJoint && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Partner Age
                </label>
                <input
                  type="number"
                  value={partnerAge}
                  onChange={(e) => setPartnerAge(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Current Superannuation
              </label>
              <div className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded-md text-slate-700 font-medium">
                ${currentSuperannuation.toLocaleString()}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {yearsUntilClientSuper > 0 && `Client eligible in ${yearsUntilClientSuper} years`}
                {yearsUntilClientSuper > 0 && yearsUntilPartnerSuper > 0 && ', '}
                {yearsUntilPartnerSuper > 0 && `Partner in ${yearsUntilPartnerSuper} years`}
                {yearsUntilClientSuper === 0 && yearsUntilPartnerSuper === 0 && 'Both eligible now'}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Current Investment Allocation</h2>
          
          <div className="space-y-4 mb-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Cash
                </label>
                <input
                  type="number"
                  value={cash}
                  onChange={(e) => setCash(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Term Deposits
                </label>
                <input
                  type="number"
                  value={termDeposits}
                  onChange={(e) => setTermDeposits(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {clientName || 'Client'} KiwiSaver
                </label>
                <input
                  type="number"
                  value={currentInvestments.find(inv => inv.id === 1)?.amount || 0}
                  onChange={(e) => updateInvestment(1, 'amount', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              {isJoint && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {partnerName || 'Partner'} KiwiSaver
                  </label>
                  <input
                    type="number"
                    value={currentInvestments.find(inv => inv.id === 2)?.amount || 0}
                    onChange={(e) => updateInvestment(2, 'amount', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>

            {currentInvestments.filter(inv => inv.id > 2).map((investment) => (
              <div key={investment.id} className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Investment Label
                  </label>
                  <input
                    type="text"
                    value={investment.label}
                    onChange={(e) => updateInvestment(investment.id, 'label', e.target.value)}
                    placeholder="e.g., Managed Fund"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Amount
                    </label>
                    <input
                      type="number"
                      value={investment.amount}
                      onChange={(e) => updateInvestment(investment.id, 'amount', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={() => removeInvestment(investment.id)}
                      className="px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={addInvestment}
            className="w-full px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
          >
            + Add Investment
          </button>

          <div className="mt-4 pt-4 border-t border-slate-200">
            <div className="text-right">
              <span className="text-lg font-bold text-slate-800">
                Total Portfolio Value: ${totalPortfolio.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-4">Retirement Planning</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Years Until Retirement
                </label>
                <input
                  type="number"
                  value={yearsUntilRetirement}
                  onChange={(e) => setYearsUntilRetirement(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled
                />
                <p className="text-xs text-slate-500 mt-1">Auto-calculated from age and retirement age</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Retirement Duration (Years)
                </label>
                <input
                  type="number"
                  value={projectionYears}
                  onChange={(e) => setProjectionYears(parseInt(e.target.value) || 30)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Regular Contribution Amount ($)
                </label>
                <input
                  type="number"
                  value={contributionAmount}
                  onChange={(e) => setContributionAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Contribution Frequency
                </label>
                <select
                  value={contributionFrequency}
                  onChange={(e) => setContributionFrequency(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="weekly">Weekly</option>
                  <option value="fortnightly">Fortnightly</option>
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual</option>
                </select>
                {annualContribution > 0 && (
                  <p className="text-xs text-slate-500 mt-1">
                    = ${annualContribution.toLocaleString()}/year during accumulation phase
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Required Annual Income ($)
                </label>
                <input
                  type="number"
                  value={annualIncome}
                  onChange={(e) => setAnnualIncome(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="bg-blue-50 p-3 rounded-md">
                <div className="text-sm text-slate-700">
                  <strong>Income over Superannuation:</strong> ${incomeOverSuper.toLocaleString()}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold text-slate-800 mb-4">
                Accumulation Phase Allocation
                <span className={`ml-2 text-sm ${totalAccumulationAllocation === 100 ? 'text-green-600' : 'text-red-600'}`}>
                  ({totalAccumulationAllocation.toFixed(1)}%)
                </span>
              </h2>
              <p className="text-xs text-slate-600 mb-3">For contributions during years until retirement</p>
              
              <div className="space-y-3">
                <div className="bg-yellow-100 p-3 rounded-md">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Cash Savings (Liquidity Reserve)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      value={accumulationAllocations.cashSavings}
                      onChange={(e) => updateAccumulationAllocation('cashSavings', e.target.value)}
                      className="w-20 px-2 py-1 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm">%</span>
                  </div>
                </div>

                <div className="bg-blue-100 p-3 rounded-md">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Balanced Portfolio (Steady Growth)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      value={accumulationAllocations.balancedPortfolio}
                      onChange={(e) => updateAccumulationAllocation('balancedPortfolio', e.target.value)}
                      className="w-20 px-2 py-1 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm">%</span>
                  </div>
                </div>

                <div className="bg-purple-100 p-3 rounded-md">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Growth Portfolio (Strategic Growth)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      value={accumulationAllocations.growthPortfolio}
                      onChange={(e) => updateAccumulationAllocation('growthPortfolio', e.target.value)}
                      className="w-20 px-2 py-1 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm">%</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold text-slate-800 mb-4">
                Retirement Phase Allocation
                <span className={`ml-2 text-sm ${totalAllocation === 100 ? 'text-green-600' : 'text-red-600'}`}>
                  ({totalAllocation.toFixed(1)}%)
                </span>
              </h2>
              <p className="text-xs text-slate-600 mb-3">Current portfolio allocation for retirement</p>
              
              <div className="space-y-2">
                {[
                  { key: 'cashSavings', label: 'Cash Savings', color: 'bg-yellow-100' },
                  { key: 'termDeposit', label: 'Term Deposit', color: 'bg-orange-100' },
                  { key: 'incomePortfolio', label: 'Income Portfolio', color: 'bg-green-100' },
                  { key: 'balancedPortfolio', label: 'Balanced Portfolio', color: 'bg-blue-100' },
                  { key: 'growthPortfolio', label: 'Growth Portfolio', color: 'bg-purple-100' }
                ].map(({ key, label, color }) => (
                  <div key={key} className={`${color} p-2 rounded-md`}>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {label}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.1"
                        value={allocations[key]}
                        onChange={(e) => updateAllocation(key, e.target.value)}
                        className="w-16 px-2 py-1 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-xs">%</span>
                      <span className="text-xs text-slate-600 ml-auto">
                        ${currentAllocations[key].toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Expected Annual Returns (%)</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { key: 'cashSavings', label: 'Cash Savings' },
              { key: 'capitalPreservation', label: 'Capital Preservation' },
              { key: 'incomeGenerator', label: 'Income Generator' },
              { key: 'steadyGrowth', label: 'Steady Growth' },
              { key: 'strategicGrowth', label: 'Strategic Growth' }
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {label}
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="0.1"
                    value={returns[key]}
                    onChange={(e) => updateReturn(key, e.target.value)}
                    className="w-full px-2 py-1 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm">%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Portfolio Growth Projection</h2>
          <ResponsiveContainer width="100%" height={450}>
            <LineChart data={calculateProjections} margin={{ left: 40, right: 20, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis 
                tickFormatter={(value) => `${value.toLocaleString()}`}
                width={100}
              />
              <Tooltip 
                formatter={(value) => `${value.toLocaleString('en-US')}`}
                labelFormatter={(label) => `Year ${label}`}
              />
              <Legend />
              <Line type="monotone" dataKey="Total" stroke="#1f2937" strokeWidth={3} />
              <Line type="monotone" dataKey="Cash Savings" stroke="#eab308" strokeWidth={2} />
              <Line type="monotone" dataKey="Capital Preservation" stroke="#f97316" strokeWidth={2} />
              <Line type="monotone" dataKey="Income Generator" stroke="#22c55e" strokeWidth={2} />
              <Line type="monotone" dataKey="Steady Growth" stroke="#3b82f6" strokeWidth={2} />
              <Line type="monotone" dataKey="Strategic Growth" stroke="#a855f7" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Income Drawdown Projection</h2>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={calculateDrawdown} margin={{ left: 40, right: 20, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis 
                tickFormatter={(value) => `${value.toLocaleString()}`}
                width={100}
              />
              <Tooltip 
                formatter={(value) => `${value.toLocaleString('en-US')}`}
                labelFormatter={(label) => `Year ${label}`}
              />
              <Legend />
              <Line type="monotone" dataKey="Annual Drawdown" stroke="#dc2626" strokeWidth={2} name="Annual Drawdown" />
              <Line type="monotone" dataKey="Cumulative Drawdown" stroke="#7c3aed" strokeWidth={3} name="Cumulative Total Drawn" />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-4 space-y-2 text-sm text-slate-600">
            <p><strong>Annual Drawdown (Red):</strong> Shows the amount withdrawn each year from investment buckets (Income Generator, Steady Growth, Strategic Growth) to supplement superannuation income. Increases by 2% annually to account for inflation.</p>
            <p><strong>Cumulative Total Drawn (Purple):</strong> Shows the total amount withdrawn from investment buckets over time during retirement.</p>
            <p className="text-xs italic">Note: This represents only the portion above superannuation income (starting at ${incomeOverSuper.toLocaleString()}/year). Retirement begins at year {yearsUntilRetirement}.</p>
          </div>
        </div>

        <div className="mt-8 bg-slate-100 rounded-lg p-6">
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

      {/* Print Summary - Only shown when printing */}
      <div id="print-summary">
        <div className="max-w-4xl mx-auto bg-white p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b-2 border-slate-300 avoid-break">
            <div>
              <img 
                src="https://www.diligentwealth.co.nz/s/WealthGuard-Logo.jpg" 
                alt="WealthGuard"
                className="h-16 mb-2"
              />
            </div>
            <div className="text-right">
              <img 
                src="https://www.diligentwealth.co.nz/s/Diligent-Logo-Main.png" 
                alt="Diligent Wealth Management"
                className="h-10 mb-2"
              />
              <p className="text-xs text-slate-600">CONFIDENTIAL</p>
            </div>
          </div>

          {/* Title */}
          <div className="mb-6 avoid-break">
            <h1 className="text-2xl font-bold text-slate-800 mb-1">WealthGuard Investment Strategy</h1>
            <p className="text-base text-slate-600">Statement of Advice Summary</p>
          </div>

          {/* Client Information */}
          <div className="mb-6 avoid-break">
            <h2 className="text-lg font-bold text-slate-800 mb-3 pb-2 border-b border-slate-300">Client Information</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs font-semibold text-slate-700">Client Name:</p>
                <p className="text-sm text-slate-900">{clientName || 'Not specified'}</p>
              </div>
              {partnerName && (
                <div>
                  <p className="text-xs font-semibold text-slate-700">Partner Name:</p>
                  <p className="text-sm text-slate-900">{partnerName}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-slate-700">Client Age:</p>
                <p className="text-sm text-slate-900">{clientAge}</p>
              </div>
              {isJoint && (
                <div>
                  <p className="text-xs font-semibold text-slate-700">Partner Age:</p>
                  <p className="text-sm text-slate-900">{partnerAge}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-slate-700">Account Type:</p>
                <p className="text-sm text-slate-900">{isJoint ? 'Joint' : 'Single'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-700">Current Superannuation:</p>
                <p className="text-sm text-slate-900">${currentSuperannuation.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Current Portfolio */}
          <div className="mb-6 avoid-break">
            <h2 className="text-lg font-bold text-slate-800 mb-3 pb-2 border-b border-slate-300">Current Portfolio Position</h2>
            <div className="mb-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-300">
                    <th className="text-left py-1 font-semibold text-slate-700">Asset</th>
                    <th className="text-right py-1 font-semibold text-slate-700">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-200">
                    <td className="py-1">Cash</td>
                    <td className="text-right">${cash.toLocaleString()}</td>
                  </tr>
                  <tr className="border-b border-slate-200">
                    <td className="py-1">Term Deposits</td>
                    <td className="text-right">${termDeposits.toLocaleString()}</td>
                  </tr>
                  <tr className="border-b border-slate-200">
                    <td className="py-1">{clientName || 'Client'} KiwiSaver</td>
                    <td className="text-right">${(currentInvestments.find(inv => inv.id === 1)?.amount || 0).toLocaleString()}</td>
                  </tr>
                  {isJoint && (
                    <tr className="border-b border-slate-200">
                      <td className="py-1">{partnerName || 'Partner'} KiwiSaver</td>
                      <td className="text-right">${(currentInvestments.find(inv => inv.id === 2)?.amount || 0).toLocaleString()}</td>
                    </tr>
                  )}
                  {currentInvestments.filter(inv => inv.id > 2).map((inv, idx) => (
                    <tr key={inv.id} className="border-b border-slate-200">
                      <td className="py-1">{inv.label || `Investment ${idx + 1}`}</td>
                      <td className="text-right">${inv.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                  <tr className="font-bold border-t-2 border-slate-300">
                    <td className="py-1">Total Portfolio Value</td>
                    <td className="text-right">${totalPortfolio.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Investment Strategy */}
          <div className="mb-6 avoid-break">
            <h2 className="text-lg font-bold text-slate-800 mb-3 pb-2 border-b border-slate-300">Recommended Investment Strategy</h2>
            
            {yearsUntilRetirement > 0 && (
              <div className="mb-4 avoid-break">
                <h3 className="text-sm font-semibold text-slate-800 mb-2">Accumulation Phase ({yearsUntilRetirement} years)</h3>
                <div className="bg-slate-50 p-3 rounded mb-2">
                  <p className="text-xs mb-2"><strong>Regular Contributions:</strong> ${contributionAmount.toLocaleString()} {contributionFrequency} (${annualContribution.toLocaleString()}/year)</p>
                  <p className="text-xs mb-2"><strong>Portfolio Allocation:</strong></p>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="font-semibold">Cash Savings</p>
                      <p>{accumulationAllocations.cashSavings}%</p>
                    </div>
                    <div>
                      <p className="font-semibold">Balanced Portfolio</p>
                      <p>{accumulationAllocations.balancedPortfolio}%</p>
                    </div>
                    <div>
                      <p className="font-semibold">Growth Portfolio</p>
                      <p>{accumulationAllocations.growthPortfolio}%</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="avoid-break">
              <h3 className="text-sm font-semibold text-slate-800 mb-2">Retirement Phase Allocation</h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-300">
                    <th className="text-left py-1 font-semibold text-slate-700">Bucket</th>
                    <th className="text-center py-1 font-semibold text-slate-700">%</th>
                    <th className="text-right py-1 font-semibold text-slate-700">Amount</th>
                    <th className="text-right py-1 font-semibold text-slate-700">Return</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-200">
                    <td className="py-1">Cash Savings</td>
                    <td className="text-center">{allocations.cashSavings}%</td>
                    <td className="text-right">${currentAllocations.cashSavings.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                    <td className="text-right">{returns.cashSavings}%</td>
                  </tr>
                  <tr className="border-b border-slate-200">
                    <td className="py-1">Term Deposit</td>
                    <td className="text-center">{allocations.termDeposit}%</td>
                    <td className="text-right">${currentAllocations.termDeposit.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                    <td className="text-right">{returns.capitalPreservation}%</td>
                  </tr>
                  <tr className="border-b border-slate-200">
                    <td className="py-1">Income Portfolio</td>
                    <td className="text-center">{allocations.incomePortfolio}%</td>
                    <td className="text-right">${currentAllocations.incomePortfolio.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                    <td className="text-right">{returns.incomeGenerator}%</td>
                  </tr>
                  <tr className="border-b border-slate-200">
                    <td className="py-1">Balanced Portfolio</td>
                    <td className="text-center">{allocations.balancedPortfolio}%</td>
                    <td className="text-right">${currentAllocations.balancedPortfolio.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                    <td className="text-right">{returns.steadyGrowth}%</td>
                  </tr>
                  <tr className="border-b border-slate-200">
                    <td className="py-1">Growth Portfolio</td>
                    <td className="text-center">{allocations.growthPortfolio}%</td>
                    <td className="text-right">${currentAllocations.growthPortfolio.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                    <td className="text-right">{returns.strategicGrowth}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Income Requirements */}
          <div className="mb-6 avoid-break">
            <h2 className="text-lg font-bold text-slate-800 mb-3 pb-2 border-b border-slate-300">Retirement Income Strategy</h2>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="font-semibold text-slate-700">Required Annual Income:</p>
                <p className="text-sm">${annualIncome.toLocaleString()}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-700">Current Superannuation:</p>
                <p className="text-sm">${currentSuperannuation.toLocaleString()}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-700">Income from Portfolio:</p>
                <p className="text-sm">${incomeOverSuper.toLocaleString()}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-700">Inflation Adjustment:</p>
                <p className="text-sm">2% annually</p>
              </div>
            </div>
          </div>

          {/* Page Break */}
          <div className="page-break"></div>

          {/* Portfolio Growth Projection Graph */}
          <div className="mb-6 avoid-break">
            <h2 className="text-lg font-bold text-slate-800 mb-3 pb-2 border-b border-slate-300">Portfolio Growth Projection</h2>
            <div style={{ width: '100%', height: '320px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={calculateProjections} margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                  <YAxis 
                    tickFormatter={(value) => `${value.toLocaleString()}`}
                    tick={{ fontSize: 10 }}
                    width={80}
                  />
                  <Tooltip 
                    formatter={(value) => `${value.toLocaleString('en-US')}`}
                    labelFormatter={(label) => `Year ${label}`}
                  />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Line type="monotone" dataKey="Total" stroke="#1f2937" strokeWidth={2} />
                  <Line type="monotone" dataKey="Cash Savings" stroke="#eab308" strokeWidth={1.5} />
                  <Line type="monotone" dataKey="Capital Preservation" stroke="#f97316" strokeWidth={1.5} />
                  <Line type="monotone" dataKey="Income Generator" stroke="#22c55e" strokeWidth={1.5} />
                  <Line type="monotone" dataKey="Steady Growth" stroke="#3b82f6" strokeWidth={1.5} />
                  <Line type="monotone" dataKey="Strategic Growth" stroke="#a855f7" strokeWidth={1.5} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Income Drawdown Projection Graph */}
          <div className="mb-6 avoid-break">
            <h2 className="text-lg font-bold text-slate-800 mb-3 pb-2 border-b border-slate-300">Income Drawdown Projection</h2>
            <div style={{ width: '100%', height: '280px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={calculateDrawdown} margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                  <YAxis 
                    tickFormatter={(value) => `${value.toLocaleString()}`}
                    tick={{ fontSize: 10 }}
                    width={80}
                  />
                  <Tooltip 
                    formatter={(value) => `${value.toLocaleString('en-US')}`}
                    labelFormatter={(label) => `Year ${label}`}
                  />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Line type="monotone" dataKey="Annual Drawdown" stroke="#dc2626" strokeWidth={1.5} />
                  <Line type="monotone" dataKey="Cumulative Drawdown" stroke="#7c3aed" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 pt-4 border-t border-slate-300 text-xs text-slate-600 avoid-break">
            <p className="mb-2"><strong>Important Information:</strong></p>
            <p className="mb-2">This document contains projections based on assumptions about future returns and should not be considered as financial advice or a guarantee of future performance. Past performance is not indicative of future results.</p>
            <p className="mb-2">The WealthGuard strategy is designed to provide diversification and risk management throughout your financial journey. Regular reviews and adjustments are recommended to ensure alignment with your goals and circumstances.</p>
            <p className="mt-3"><strong>Prepared by Diligent Wealth Management</strong></p>
            <p>Date: {new Date().toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
        </div>
      </div>
    </div>
  );
}