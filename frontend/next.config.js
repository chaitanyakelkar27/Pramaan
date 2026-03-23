const path = require("path");

// Stub path for optional dependencies that are not installed
const emptyStub = path.resolve(__dirname, "stubs/empty.js");

// List of optional SDKs that @wagmi/connectors lazily imports but are not installed
const optionalDeps = [
  "porto",
  "porto/internal",
  "@base-org/account",
  "@coinbase/wallet-sdk",
  "@metamask/sdk",
  "@safe-global/safe-apps-sdk",
  "@safe-global/safe-apps-provider",
  "@walletconnect/ethereum-provider",
  "@react-native-async-storage/async-storage"
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.resolve(__dirname),

  // Turbopack config (Next.js 16+ default bundler).
  // Turbopack does NOT support `false` as an alias value — point to a real stub file instead.
  turbopack: {
    resolveAlias: Object.fromEntries(optionalDeps.map((dep) => [dep, emptyStub]))
  },

  // Webpack config for non-Turbopack builds.
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = config.resolve.alias || {};

    for (const dep of optionalDeps) {
      config.resolve.alias[dep] = false;
    }

    // Suppress known warning from @anon-aadhaar dependency chain.
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      {
        module: /web-worker[\\/]cjs[\\/]node\.js$/,
        message: /Critical dependency: the request of a dependency is an expression/
      }
    ];

    return config;
  }
};

module.exports = nextConfig;
