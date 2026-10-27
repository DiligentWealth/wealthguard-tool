import React from 'react';
import {render,screen,fireEvent,within,waitFor} from '@testing-library/react';
import '@testing-library/jest-dom';
import App from './App';
import ProjectionExplorer from './ProjectionExplorer';
jest.mock('recharts',()=>{
 const React=require('react');
 const names=['LineChart','Line','XAxis','YAxis','CartesianGrid','Tooltip','Legend','ResponsiveContainer','PieChart','Pie','Cell','ComposedChart','Area','BarChart','Bar'];
 return Object.fromEntries(names.map(name=>[name,({children})=>React.createElement('div',null,children)]));
});
jest.mock('./supabaseClient',()=>({storageMode:'local',supabase:{from:()=>({select:()=>({order:()=>Promise.resolve({data:[],error:null})})})}}));
beforeAll(()=>{
 global.IntersectionObserver=class{observe(){}disconnect(){}};
 Element.prototype.scrollIntoView=jest.fn();
});
const reference={clientName:'Rob',partnerName:'Liz',clientAge:61,partnerAge:54,retirementAge:65,partnerRetirementAge:60,projectionYears:30,annualIncome:100000,cash:1500000,cashflowMode:'quarterly',allocations:{cashSavings:5,termDeposit:15,incomePortfolio:30,balancedPortfolio:25,growthPortfolio:25},accumulationAllocations:{cashSavings:5,balancedPortfolio:45,growthPortfolio:50},returns:{cashSavings:.25,capitalPreservation:4,incomeGenerator:5,steadyGrowth:5.5,strategicGrowth:7.5},partnerWorkingIncome:100000,incomeReductionEnabled:true,incomeReductionPercent:20,incomeReductionAfterYears:15,agedCareAnnualCost:50000};
test('saved scenarios open before compact calculation mode and basis details toggle',async()=>{
 render(<App/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'Scenarios (0)'})).toBeInTheDocument());
 const basis=document.getElementById('calculation-details');expect(basis).not.toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Show planning basis'}));expect(basis).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Hide planning basis'}));expect(basis).not.toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Scenarios (0)'}));
 const scenarios=document.getElementById('saved-scenarios');const mode=screen.getByLabelText('Calculation mode');
 expect(scenarios.compareDocumentPosition(mode)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 expect(screen.getByRole('navigation',{name:'Section navigation'})).toBeInTheDocument();
 fireEvent.click(within(screen.getByRole('navigation')).getByRole('button',{name:'Charts'}));
 expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
});
test('retirement and income toggles stay in preview until apply and reset discards them',()=>{
 const apply=jest.fn(),close=jest.fn();render(<ProjectionExplorer reference={reference} onApply={apply} onClose={close}/>);
 expect(screen.getByRole('button',{name:'Apply preview to calculator'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Rob retire one year earlier'}));
 expect(screen.getByLabelText('Rob preview retirement age')).toHaveValue(64);
 fireEvent.click(screen.getByRole('checkbox',{name:'Reduced income later in retirement'}));
 expect(apply).not.toHaveBeenCalled();expect(reference.retirementAge).toBe(65);
 fireEvent.click(screen.getByRole('button',{name:'Apply preview to calculator'}));
 expect(apply.mock.calls[0][0]).toMatchObject({retirementAge:64,partnerRetirementAge:60,incomeReductionEnabled:false,projectionYears:31});
 fireEvent.click(screen.getByRole('button',{name:'Reset preview'}));
 expect(screen.getByLabelText('Rob preview retirement age')).toHaveValue(65);
 expect(screen.getByRole('checkbox',{name:'Reduced income later in retirement'})).toBeChecked();
 expect(screen.getByRole('button',{name:'Apply preview to calculator'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Close preview'}));expect(close).toHaveBeenCalledTimes(1);
});
test('same-named clients have distinct labelled controls and a preview error disables applying',()=>{
 render(<ProjectionExplorer reference={{...reference,clientName:'Chris',partnerName:'Chris',partnerRetirementAge:100}} onApply={jest.fn()} onClose={jest.fn()}/>);
 expect(document.getElementById('preview-age-client')).toBeInTheDocument();expect(document.getElementById('preview-age-partner')).toBeInTheDocument();
 fireEvent.change(document.getElementById('preview-age-client'),{target:{value:'120'}});
 expect(screen.getByRole('alert')).toHaveTextContent('common projection end date');
 expect(screen.getByRole('button',{name:'Apply preview to calculator'})).toBeDisabled();
});
