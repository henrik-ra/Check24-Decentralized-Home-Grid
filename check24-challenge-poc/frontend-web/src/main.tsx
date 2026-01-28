import React from 'react';

/* 
// Aus node_modules/react/index.js:
export default {
  createElement: function(type, props, ...children) { ... },
  Component: class Component { ... },
  useState: function(initialState) { ... },
  useEffect: function(effect, deps) { ... },
  StrictMode: Symbol('react.strict_mode'),
  // ... und ~50 weitere Funktionen/Komponenten
}
*/ 

import ReactDOM from 'react-dom/client';
import { Theme } from '@radix-ui/themes';

 
// /Setzt CSS-Variablen:
// :root {
  // --accent-1: hsl(206, 100%, 99%);   /* blue-100 */
  // --accent-9: hsl(206, 100%, 50%);   /* blue-500 */
  // --gray-1: hsl(212, 15%, 99%);      /* slate-100 */
  // --gray-12: hsl(212, 15%, 10%);     /* slate-900 */
  // --radius-1: 4px;
  // --radius-2: 8px;
  // --radius-3: 12px;
  // --radius-4: 16px;  /* "large" */
  // --scaling: 1.0;     /* 100% */
// }   

import { App } from './App';
import '@radix-ui/themes/styles.css';
import './nav.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Theme accentColor="blue" grayColor="slate" radius="large" scaling="100%">
      <App />
    </Theme>
  </React.StrictMode>
);


