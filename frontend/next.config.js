const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.resolve(__dirname),
  
  // Turbopack config (Next.js 16+ default bundler)
  // Alias optional dependencies that @wagmi/connectors lazily imports
  turbopack: {
    resolveAlias: {
      "porto": false,
      "porto/internal": false,
      "@base-org/account": false,
      "@coinbase/wallet-sdk": false,
      "@metamask/sdk": false,
      "@safe-global/safe-apps-sdk": false,
      "@safe-global/safe-apps-provider": false,
      "@walletconnect/ethereum-provider": false,
      "@react-native-async-storage/async-storage": false
    }
  },
  
  // Keep webpack config for compatibility
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = config.resolve.alias || {};

    // @wagmi/connectors lazily imports several optional SDKs.
    // Alias each one to `false` so Webpack treats them as empty modules
    // instead of failing the build. Also alias react-native-async-storage.
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
