/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Désactiver le prerendering statique — app dynamique avec auth
  experimental: {},
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
    ],
  },
  async headers() {
    const securityHeaders = [
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), interest-cohort=()' },
      {
        key: 'Content-Security-Policy',
        value: [
          "default-src 'self'",
          "base-uri 'self'",
          "object-src 'none'",
          "form-action 'self'",
          "frame-src 'self' https://accounts.google.com",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://apis.google.com",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' data: https://fonts.gstatic.com",
          "img-src 'self' data: blob: https:",
          "media-src 'self' data: blob: https:",
          "connect-src 'self' https: wss:",
          "worker-src 'self' blob:",
          "manifest-src 'self'",
          'upgrade-insecure-requests',
        ].join('; '),
      },
    ];
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, max-age=0, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/service-worker.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, max-age=0, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, max-age=0, must-revalidate' },
          { key: 'Content-Type', value: 'application/manifest+json; charset=utf-8' },
        ],
      },
      {
        source: '/reset-pwa.html',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, max-age=0, must-revalidate' },
          { key: 'Content-Type', value: 'text/html; charset=utf-8' },
        ],
      },
      {
        source: '/icons/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, max-age=0, must-revalidate' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/oracle-messenger.apk',
        destination: '/install?source=apk-removed',
        permanent: false,
      },
    ];
  },
};

module.exports = nextConfig;
