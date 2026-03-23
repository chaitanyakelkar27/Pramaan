const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const EXPLORER_BY_CHAIN = {
    11155111: "https://sepolia.etherscan.io"
};

async function main() {
    const network = await hre.ethers.provider.getNetwork();
    const chainId = Number(network.chainId);
    const explorerBase = EXPLORER_BY_CHAIN[chainId] || "";

    const ArtisanRegistry = await hre.ethers.getContractFactory("ArtisanRegistry");
    const artisanRegistry = await ArtisanRegistry.deploy();
    await artisanRegistry.waitForDeployment();
    const artisanRegistryAddress = await artisanRegistry.getAddress();
    const artisanDeployTxHash = artisanRegistry.deploymentTransaction()?.hash || "";

    const ProductRegistry = await hre.ethers.getContractFactory("ProductRegistry");
    const productRegistry = await ProductRegistry.deploy(artisanRegistryAddress);
    await productRegistry.waitForDeployment();
    const productRegistryAddress = await productRegistry.getAddress();
    const productDeployTxHash = productRegistry.deploymentTransaction()?.hash || "";

    console.log("ArtisanRegistry deployed at:", artisanRegistryAddress);
    console.log("ProductRegistry deployed at:", productRegistryAddress);
    if (artisanDeployTxHash) {
        console.log("ArtisanRegistry deploy tx:", artisanDeployTxHash);
    }
    if (productDeployTxHash) {
        console.log("ProductRegistry deploy tx:", productDeployTxHash);
    }

    const networkName = hre.network.name;
    const deployedPath = path.join(__dirname, "..", "deployed.json");
    const networkDeployedPath = path.join(__dirname, "..", `deployed.${networkName}.json`);
    const deployed = {
        network: networkName,
        chainId,
        ArtisanRegistry: artisanRegistryAddress,
        ProductRegistry: productRegistryAddress,
        deployTx: {
            ArtisanRegistry: artisanDeployTxHash,
            ProductRegistry: productDeployTxHash
        },
        explorer: {
            baseUrl: explorerBase,
            ArtisanRegistry: explorerBase ? `${explorerBase}/address/${artisanRegistryAddress}` : "",
            ProductRegistry: explorerBase ? `${explorerBase}/address/${productRegistryAddress}` : "",
            ArtisanRegistryTx: explorerBase && artisanDeployTxHash ? `${explorerBase}/tx/${artisanDeployTxHash}` : "",
            ProductRegistryTx: explorerBase && productDeployTxHash ? `${explorerBase}/tx/${productDeployTxHash}` : ""
        },
        deployedAt: new Date().toISOString()
    };

    fs.writeFileSync(deployedPath, JSON.stringify(deployed, null, 2));
    fs.writeFileSync(networkDeployedPath, JSON.stringify(deployed, null, 2));
    console.log("Deployment addresses saved to:", deployedPath);
    console.log("Network artifact saved to:", networkDeployedPath);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});