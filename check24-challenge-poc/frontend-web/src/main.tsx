import React from 'react';
import ReactDOM from 'react-dom/client';
import { Theme } from '@radix-ui/themes';

import { App } from './App';
import '@radix-ui/themes/styles.css';
import './styles/theme.css';

// appearance="light" pinnt Light bewusst (check24.de ist Light-only),
// panelBackground="solid" für deckende Cards auf dem Seitenhintergrund.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Theme
      accentColor="blue"
      grayColor="slate"
      radius="large"
      scaling="100%"
      appearance="light"
      panelBackground="solid"
    >
      <App />
    </Theme>
  </React.StrictMode>
);
