import React from 'react';
import Link from 'next/link';

const Layout = ({ children }) => {
  return (
    <div>
      <nav>
        <ul>
          <li><Link href="/">Home</Link></li>
          <li><Link href="/about">À propos</Link></li>
          <li><Link href="/contact">Contact</Link></li>
          {/* Add other menu items here */}
        </ul>
      </nav>
      <main>{children}</main>
    </div>
  );
};

export default Layout;
