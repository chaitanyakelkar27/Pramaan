/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // @wagmi/connectors lazily imports several optional SDKs.
    // Alias each one to `false` so Webpack treats them as empty modules
    // instead of failing the build.
    const optionalDeps = [
      "porto",
      "porto/internal",
      "@base-org/account",
      "@coinbase/wallet-sdk",
      "@metamask/sdk",
      "@safe-global/safe-apps-sdk",
      "@safe-global/safe-apps-provider",
      "@walletconnect/ethereum-provider",
    ];

    for (const dep of optionalDeps) {
      config.resolve.alias[dep] = false;
    }

    return config;
  },
};

module.exports = nextConfig;
