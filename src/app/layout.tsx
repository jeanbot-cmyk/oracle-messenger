import React, { useEffect } from 'react';
import Link from 'next/link';

const Layout = ({ children }) => {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js').then(registration => {
        console.log('Service Worker registered with scope:', registration.scope);
      }).catch(error => {
        console.error('Service Worker registration failed:', error);
      });
    }
  }, []);

  return (
    <div>
      <nav>
        <ul>
          <li><Link href="/">Home</Link></li>
          <li><Link href="/about">À propos</Link></li>
          {/* Add other menu items here */}
        </ul>
      </nav>
      <main>{children}</main>
    </div>
  );
};

export default Layout;