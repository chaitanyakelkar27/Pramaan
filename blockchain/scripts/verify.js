const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

function loadDeployment(networkName) {
  const artifactPath = path.join(__dirname, "..", `deployed.${networkName}.json`);
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Missing deployment artifact: ${artifactPath}`);
  }
  return JSON.parse(fs.readFileSync(artifactPath, "utf8"));
}

async function verifyContract(address, constructorArguments) {
  try {
    await hre.run("verify:verify", {
      address,
      constructorArguments
    });
    console.log("[ok] Verified:", address);
  } catch (error) {
    const msg = String(error?.message || error);
    if (msg.toLowerCase().includes("already verified")) {
      console.log("[ok] Already verified:", address);
      return;
    }
    throw error;
  }
}

async function main() {
  if (!process.env.ETHERSCAN_API_KEY) {
    throw new Error("ETHERSCAN_API_KEY is required to verify contracts.");
  }

  const networkName = hre.network.name;
  const deployed = loadDeployment(networkName);

  if (!deployed.ArtisanRegistry || !deployed.ProductRegistry) {
    throw new Error("Deployment artifact missing contract addresses.");
  }

  await verifyContract(deployed.ArtisanRegistry, []);
  await verifyContract(deployed.ProductRegistry, [deployed.ArtisanRegistry]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
