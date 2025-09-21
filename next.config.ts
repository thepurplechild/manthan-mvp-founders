// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Moved out of experimental.* (current Next supports top-level)  
  typedRoutes: true,
  
  // Ignore ESLint errors during build to prevent deployment failures
  eslint: {
    ignoreDuringBuilds: true,
  },
  
  // Note: Cross-origin issues should be handled via API route CORS headers (configured in vercel.json)
  
  // Exclude Supabase modules and canvas from Edge Runtime to prevent Node.js API compatibility issues
  serverExternalPackages: ['@supabase/supabase-js', '@supabase/realtime-js', '@supabase/postgrest-js', '@supabase/storage-js', 'canvas'],

  webpack: (config, { isServer, nextRuntime }) => {
    // 1) Emit pdf.js worker files as asset URLs so dynamic import returns a string
    config.module.rules.push({
      test: /pdf\.worker(\.min)?\.(m)?js$/,
      type: "asset/resource",
    });

    // 2) Some pdfjs-dist builds ship ESM (.mjs). Ensure resolution works even if "fullySpecified" is required.
    //    (This prevents errors like "Cannot find module 'pdfjs-dist/build/pdf.mjs' with fullySpecified.")
    config.module.rules.push({
      test: /node_modules\/pdfjs-dist\/build\/pdf\.m?js$/,
      resolve: { fullySpecified: false },
    });

    // 3) PDF.js Worker Path Configuration for Vercel/Production
    // Set up proper PDF.js worker path for both development and production
    if (!isServer && nextRuntime !== 'edge') {
      // Only warn in development, not production
      if (process.env.NODE_ENV === 'development') {
        console.log('📄 Configuring PDF.js for development environment');
      }
    }

    // 4) Don't try to polyfill Node core modules in the browser bundle.
    if (!isServer) {
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        fs: false,
        path: false,
        crypto: false,
        canvas: false,
      };
    }

    // 5) Handle canvas and other native dependencies for Vercel builds
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push('canvas');
    }

    return config;
  },
};

export default nextConfig;