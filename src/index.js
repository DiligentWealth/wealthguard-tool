import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import WealthGuardTool from './App';
import LoginGate from './LoginGate';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <LoginGate>
      <WealthGuardTool />
    </LoginGate>
  </React.StrictMode>
);