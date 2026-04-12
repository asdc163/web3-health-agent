const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // Deploy HealthDataRegistry
  const Registry = await ethers.getContractFactory("HealthDataRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  console.log("HealthDataRegistry:", registryAddr);

  // Deploy ConsentManager
  const Consent = await ethers.getContractFactory("ConsentManager");
  const consent = await Consent.deploy();
  await consent.waitForDeployment();
  const consentAddr = await consent.getAddress();
  console.log("ConsentManager:", consentAddr);

  console.log("\nDeployment complete!");
  return { registryAddr, consentAddr };
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
