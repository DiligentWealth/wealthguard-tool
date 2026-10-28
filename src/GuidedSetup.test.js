import React from 'react';import {render,screen,fireEvent,within,waitFor} from '@testing-library/react';import '@testing-library/jest-dom';import App from './App';
jest.mock('recharts',()=>{const React=require('react');return Object.fromEntries(['LineChart','Line','XAxis','YAxis','CartesianGrid','Tooltip','Legend','ResponsiveContainer','PieChart','Pie','Cell','ComposedChart','Area','BarChart','Bar'].map(n=>[n,({children})=>React.createElement('div',null,children)]));});
jest.mock('./supabaseClient',()=>({storageMode:'local',supabase:{from:()=>({select:()=>({order:()=>Promise.resolve({data:[],error:null})})})}}));
beforeAll(()=>{global.IntersectionObserver=class{observe(){}disconnect(){}};Element.prototype.scrollIntoView=jest.fn();});
beforeEach(()=>window.history.replaceState(null,'','/'));
test('switching between guided and full views preserves names and other income without saving',async()=>{
 render(<App/>);await waitFor(()=>expect(screen.getByRole('button',{name:'Scenarios (0)'})).toBeInTheDocument());
 fireEvent.change(screen.getByLabelText('Client Name'),{target:{value:'Example client'}});
 fireEvent.click(screen.getByRole('button',{name:'Add income source'}));fireEvent.change(screen.getByLabelText('Income source 1 amount'),{target:{value:'12000'}});
 fireEvent.click(screen.getByRole('button',{name:'Guided setup'}));
 expect(screen.getByLabelText('Client Name')).toHaveValue('Example client');
 expect(document.getElementById('sec-investments')).not.toBeVisible();expect(document.getElementById('sec-client')).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Full calculator'}));
 expect(screen.getByLabelText('Client Name')).toHaveValue('Example client');expect(screen.getByLabelText('Income source 1 amount')).toHaveValue(12000);
 expect(document.getElementById('sec-investments')).toBeVisible();expect(window.location.search).toBe('?view=full');
});
test('guided steps reveal only their sections and optional income can be expanded',async()=>{
 window.history.replaceState(null,'','/?view=guided');render(<App/>);await waitFor(()=>expect(screen.getByRole('navigation',{name:'Guided setup steps'})).toBeInTheDocument());
 const steps=screen.getByRole('navigation',{name:'Guided setup steps'});
 fireEvent.click(within(steps).getByRole('button',{name:/Spending & income/}));
 expect(document.getElementById('sec-planning')).toBeVisible();expect(document.getElementById('sec-client')).not.toBeVisible();
 expect(screen.queryByRole('button',{name:'Add income source'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:/Other retirement income: rent/}));
 expect(screen.getByRole('button',{name:'Add income source'})).toBeVisible();
 fireEvent.click(within(steps).getByRole('button',{name:/Check & results/}));
 expect(screen.getByRole('region',{name:'Plan review checklist'})).toBeVisible();expect(document.getElementById('sec-charts')).toBeVisible();expect(document.getElementById('sec-planning')).not.toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Full calculator'}));expect(document.getElementById('sec-planning')).toBeVisible();
});
