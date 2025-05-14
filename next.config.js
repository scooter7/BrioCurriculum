// File: next.config.js

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    dangerouslyAllowSVG: true, // Add this line
    contentDispositionType: 'attachment', // Add this line for SVGs from some hosts
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;", // Add this for SVGs
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      // You can add more hostnames here if needed in the future
    ],
  },
};

module.exports = nextConfig;
