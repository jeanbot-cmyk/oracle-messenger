import React from 'react';
import Link from 'next/link';

const Layout = ({ children }) => {
  return (
    <div>
      <nav>
        <ul>
          <li><Link href="/">Home</Link></li>
          <li><Link href="/about">À propos</Link></li>
          <li><Link href="/login">Login</Link></li>
          <li><Link href="/register">Register</Link></li>
          <li><Link href="/chat">Chat</Link></li>
          <li><Link href="/profile">Profile</Link></li>
        </ul>
      </nav>
      <main>{children}</main>
    </div>
  );
};

export default Layout;
