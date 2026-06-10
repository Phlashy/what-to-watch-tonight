import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { ConfirmProvider } from './components/ConfirmDialog.jsx';
import { FamilyProvider } from './context/FamilyContext.jsx';
import { PersonProvider } from './context/PersonContext.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <FamilyProvider>
        <PersonProvider>
          <ConfirmProvider>
            <App />
          </ConfirmProvider>
        </PersonProvider>
      </FamilyProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
