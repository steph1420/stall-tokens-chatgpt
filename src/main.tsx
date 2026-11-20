// Entry point: creates the store (which owns the data layer) and renders the app.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StoreProvider, createDefaultStore } from './store';
import { App } from './ui/App';
import './ui/global.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root missing in index.html');
createRoot(root).render(
  <StrictMode>
    <StoreProvider store={createDefaultStore()}><App /></StoreProvider>
  </StrictMode>,
);
