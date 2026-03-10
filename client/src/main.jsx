import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { FamilyProvider } from './context/FamilyContext.jsx';
import { PersonProvider } from './context/PersonContext.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <FamilyProvider>
      <PersonProvider>
        <App />
      </PersonProvider>
    </FamilyProvider>
  </React.StrictMode>
);
