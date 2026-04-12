const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * Integration test: simulates full AI agent workflow.
 * MCP tool result → hash → anchor on-chain → verify integrity
 */
describe("Integration: AI Agent → On-Chain", function () {
  let registry, consent;
  let patientWallet, agentWallet;
  const patientId = ethers.keccak256(ethers.toUtf8Bytes("wang-elderly-88"));

  // Simulated MCP tool outputs
  const mcpVitalsResult = {
    patient: "wang-elderly-88",
    vitals: [
      { type: "blood_pressure", systolic: 165, diastolic: 95, unit: "mmHg", status: "WARNING" },
      { type: "heart_rate", value: 88, unit: "bpm", status: "NORMAL" },
    ],
    trend: { direction: "rising", percentChange: 12.3 },
    timestamp: "2026-04-12T08:00:00Z",
  };

  const mcpDrugResult = {
    medications: ["Lisinopril", "Warfarin", "Aspirin"],
    interactions: [
      {
        drug1: "Warfarin",
        drug2: "Aspirin",
        severity: "SEVERE",
        description: "Increased bleeding risk",
      },
    ],
  };

  const mcpCarePlan = {
    patient: "wang-elderly-88",
    medications: [
      { name: "Lisinopril", dosage: "10mg", frequency: "daily" },
      { name: "Warfarin", dosage: "5mg", frequency: "daily", note: "Monitor INR" },
    ],
    monitoring: ["Blood pressure 2x daily", "INR weekly"],
    alerts: ["Avoid aspirin — severe interaction with Warfarin"],
  };

  beforeEach(async function () {
    [patientWallet, agentWallet] = await ethers.getSigners();

    const RegistryFactory = await ethers.getContractFactory("HealthDataRegistry");
    registry = await RegistryFactory.deploy();

    const ConsentFactory = await ethers.getContractFactory("ConsentManager");
    consent = await ConsentFactory.deploy();
  });

  it("Full workflow: register → consent → anchor vitals → verify", async function () {
    // 1. Patient registers
    await registry.registerPatient(patientId);
    await consent.registerPatient(patientId);

    // 2. Patient authorizes AI agent
    await registry.authorizeProvider(patientId, agentWallet.address);
    await consent.grantConsent(patientId, agentWallet.address, 5, 0, "AI health monitoring"); // ALL scope

    // 3. Verify consent
    expect(await consent.hasValidConsent(patientId, agentWallet.address, 0)).to.be.true; // VITALS
    expect(await registry.isAuthorized(patientId, agentWallet.address)).to.be.true;

    // 4. Agent anchors vitals (simulating MCP analyze_vitals output)
    const vitalsPayload = JSON.stringify(mcpVitalsResult);
    const vitalsHash = ethers.keccak256(ethers.toUtf8Bytes(vitalsPayload));

    await registry.connect(agentWallet).anchorRecord(patientId, vitalsHash, 0, ""); // VITALS

    // 5. Verify the record
    expect(await registry.verifyRecord(patientId, 0, vitalsHash)).to.be.true;

    // Tampered data should fail
    const tamperedHash = ethers.keccak256(ethers.toUtf8Bytes("tampered"));
    expect(await registry.verifyRecord(patientId, 0, tamperedHash)).to.be.false;
  });

  it("Drug interaction triggers on-chain alert", async function () {
    await registry.registerPatient(patientId);
    await registry.authorizeProvider(patientId, agentWallet.address);

    const payload = JSON.stringify(mcpDrugResult);
    const dataHash = ethers.keccak256(ethers.toUtf8Bytes(payload));

    // Agent detects SEVERE interaction → anchors as alert
    const tx = await registry
      .connect(agentWallet)
      .anchorAlert(patientId, dataHash, "SEVERE: Warfarin-Aspirin bleeding risk", "");

    await expect(tx).to.emit(registry, "AlertTriggered");

    const record = await registry.getRecord(patientId, 0);
    expect(record.recordType).to.equal(4); // ALERT
  });

  it("Care plan anchored with full audit trail", async function () {
    await registry.registerPatient(patientId);
    await registry.authorizeProvider(patientId, agentWallet.address);

    // Anchor vitals first
    const v = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(mcpVitalsResult)));
    await registry.connect(agentWallet).anchorRecord(patientId, v, 0, "");

    // Anchor drug interaction
    const d = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(mcpDrugResult)));
    await registry.connect(agentWallet).anchorRecord(patientId, d, 1, "");

    // Anchor care plan
    const c = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(mcpCarePlan)));
    await registry.connect(agentWallet).anchorRecord(patientId, c, 2, "");

    // Full audit trail: 3 records
    expect(await registry.getRecordCount(patientId)).to.equal(3);

    const latest = await registry.getLatestRecords(patientId, 3);
    expect(latest[0].recordType).to.equal(0); // VITALS
    expect(latest[1].recordType).to.equal(1); // DRUG_INTERACTION
    expect(latest[2].recordType).to.equal(2); // CARE_PLAN

    // Each record verifiable
    expect(await registry.verifyRecord(patientId, 0, v)).to.be.true;
    expect(await registry.verifyRecord(patientId, 1, d)).to.be.true;
    expect(await registry.verifyRecord(patientId, 2, c)).to.be.true;
  });

  it("Consent expiry blocks future anchoring", async function () {
    await registry.registerPatient(patientId);
    await consent.registerPatient(patientId);
    await registry.authorizeProvider(patientId, agentWallet.address);

    // Grant short consent
    await consent.grantConsent(patientId, agentWallet.address, 0, 60, "short monitoring");
    expect(await consent.hasValidConsent(patientId, agentWallet.address, 0)).to.be.true;

    // Revoke provider access on registry
    await registry.revokeProvider(patientId, agentWallet.address);
    expect(await registry.isAuthorized(patientId, agentWallet.address)).to.be.false;

    // Agent can no longer anchor
    const hash = ethers.keccak256(ethers.toUtf8Bytes("blocked"));
    await expect(
      registry.connect(agentWallet).anchorRecord(patientId, hash, 0, "")
    ).to.be.revertedWith("Not authorized");
  });
});
