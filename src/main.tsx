import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import './index.css';

// تسجيل Service Worker (PWA + Web Push) في بيئة الويب فقط
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
