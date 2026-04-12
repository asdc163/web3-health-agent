const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HealthDataRegistry", function () {
  let registry;
  let owner, provider1, provider2, stranger;
  const patientId = ethers.keccak256(ethers.toUtf8Bytes("patient-001"));
  const dataHash = ethers.keccak256(ethers.toUtf8Bytes("vitals-data-encrypted"));

  beforeEach(async function () {
    [owner, provider1, provider2, stranger] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("HealthDataRegistry");
    registry = await Factory.deploy();
  });

  describe("Patient Registration", function () {
    it("should register a patient", async function () {
      await registry.registerPatient(patientId);
      expect(await registry.getPatientOwner(patientId)).to.equal(owner.address);
      expect(await registry.getPatientCount()).to.equal(1);
    });

    it("should emit PatientRegistered event", async function () {
      await expect(registry.registerPatient(patientId))
        .to.emit(registry, "PatientRegistered")
        .withArgs(patientId, owner.address);
    });

    it("should reject duplicate registration", async function () {
      await registry.registerPatient(patientId);
      await expect(registry.registerPatient(patientId)).to.be.revertedWith("Already registered");
    });
  });

  describe("Provider Authorization", function () {
    beforeEach(async function () {
      await registry.registerPatient(patientId);
    });

    it("should authorize a provider", async function () {
      await registry.authorizeProvider(patientId, provider1.address);
      expect(await registry.isAuthorized(patientId, provider1.address)).to.be.true;
    });

    it("should emit ProviderAuthorized event", async function () {
      await expect(registry.authorizeProvider(patientId, provider1.address))
        .to.emit(registry, "ProviderAuthorized")
        .withArgs(patientId, provider1.address);
    });

    it("should revoke a provider", async function () {
      await registry.authorizeProvider(patientId, provider1.address);
      await registry.revokeProvider(patientId, provider1.address);
      expect(await registry.isAuthorized(patientId, provider1.address)).to.be.false;
    });

    it("should emit ProviderRevoked event", async function () {
      await registry.authorizeProvider(patientId, provider1.address);
      await expect(registry.revokeProvider(patientId, provider1.address))
        .to.emit(registry, "ProviderRevoked")
        .withArgs(patientId, provider1.address);
    });

    it("should reject non-owner authorization", async function () {
      await expect(
        registry.connect(stranger).authorizeProvider(patientId, provider1.address)
      ).to.be.revertedWith("Not patient owner");
    });

    it("patient owner is always authorized", async function () {
      expect(await registry.isAuthorized(patientId, owner.address)).to.be.true;
    });
  });

  describe("Record Anchoring", function () {
    beforeEach(async function () {
      await registry.registerPatient(patientId);
      await registry.authorizeProvider(patientId, provider1.address);
    });

    it("should anchor a vitals record", async function () {
      const tx = await registry
        .connect(provider1)
        .anchorRecord(patientId, dataHash, 0, "QmTestCid123");

      const receipt = await tx.wait();
      expect(await registry.getRecordCount(patientId)).to.equal(1);

      const record = await registry.getRecord(patientId, 0);
      expect(record.dataHash).to.equal(dataHash);
      expect(record.recordType).to.equal(0); // VITALS
      expect(record.submittedBy).to.equal(provider1.address);
      expect(record.ipfsCid).to.equal("QmTestCid123");
    });

    it("should emit RecordAnchored event", async function () {
      await expect(
        registry.connect(provider1).anchorRecord(patientId, dataHash, 0, "")
      )
        .to.emit(registry, "RecordAnchored")
        .withArgs(patientId, 0, 0, dataHash);
    });

    it("should anchor multiple record types", async function () {
      await registry.connect(provider1).anchorRecord(patientId, dataHash, 0, ""); // VITALS
      const hash2 = ethers.keccak256(ethers.toUtf8Bytes("drug-data"));
      await registry.connect(provider1).anchorRecord(patientId, hash2, 1, "");    // DRUG_INTERACTION
      const hash3 = ethers.keccak256(ethers.toUtf8Bytes("care-plan"));
      await registry.connect(provider1).anchorRecord(patientId, hash3, 2, "");    // CARE_PLAN

      expect(await registry.getRecordCount(patientId)).to.equal(3);
    });

    it("should reject unauthorized anchoring", async function () {
      await expect(
        registry.connect(stranger).anchorRecord(patientId, dataHash, 0, "")
      ).to.be.revertedWith("Not authorized");
    });

    it("patient owner can anchor records", async function () {
      await registry.anchorRecord(patientId, dataHash, 0, "");
      expect(await registry.getRecordCount(patientId)).to.equal(1);
    });
  });

  describe("Alert Anchoring", function () {
    beforeEach(async function () {
      await registry.registerPatient(patientId);
      await registry.authorizeProvider(patientId, provider1.address);
    });

    it("should anchor an alert with message", async function () {
      const alertHash = ethers.keccak256(ethers.toUtf8Bytes("critical-bp"));
      await registry
        .connect(provider1)
        .anchorAlert(patientId, alertHash, "CRITICAL: BP 190/120", "QmAlert");

      const record = await registry.getRecord(patientId, 0);
      expect(record.recordType).to.equal(4); // ALERT
      expect(record.dataHash).to.equal(alertHash);
    });

    it("should emit both RecordAnchored and AlertTriggered", async function () {
      const alertHash = ethers.keccak256(ethers.toUtf8Bytes("critical-bp"));
      const tx = registry
        .connect(provider1)
        .anchorAlert(patientId, alertHash, "CRITICAL: BP 190/120", "");

      await expect(tx)
        .to.emit(registry, "RecordAnchored")
        .withArgs(patientId, 0, 4, alertHash);

      await expect(tx)
        .to.emit(registry, "AlertTriggered")
        .withArgs(patientId, alertHash, "CRITICAL: BP 190/120");
    });
  });

  describe("Record Verification", function () {
    beforeEach(async function () {
      await registry.registerPatient(patientId);
      await registry.anchorRecord(patientId, dataHash, 0, "");
    });

    it("should verify correct hash", async function () {
      expect(await registry.verifyRecord(patientId, 0, dataHash)).to.be.true;
    });

    it("should reject incorrect hash", async function () {
      const wrongHash = ethers.keccak256(ethers.toUtf8Bytes("tampered"));
      expect(await registry.verifyRecord(patientId, 0, wrongHash)).to.be.false;
    });

    it("should reject invalid index", async function () {
      await expect(registry.verifyRecord(patientId, 99, dataHash)).to.be.revertedWith(
        "Invalid index"
      );
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await registry.registerPatient(patientId);
      // Anchor 5 records
      for (let i = 0; i < 5; i++) {
        const hash = ethers.keccak256(ethers.toUtf8Bytes(`record-${i}`));
        await registry.anchorRecord(patientId, hash, 0, "");
      }
    });

    it("should return latest records", async function () {
      const latest = await registry.getLatestRecords(patientId, 3);
      expect(latest.length).to.equal(3);
      // Should be records 2, 3, 4 (last 3)
      const hash4 = ethers.keccak256(ethers.toUtf8Bytes("record-4"));
      expect(latest[2].dataHash).to.equal(hash4);
    });

    it("should cap count to total records", async function () {
      const latest = await registry.getLatestRecords(patientId, 100);
      expect(latest.length).to.equal(5);
    });

    it("should return correct record count", async function () {
      expect(await registry.getRecordCount(patientId)).to.equal(5);
    });
  });
});
