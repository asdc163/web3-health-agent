const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("ConsentManager", function () {
  let consent;
  let patient, provider1, provider2, stranger;
  const patientId = ethers.keccak256(ethers.toUtf8Bytes("patient-001"));

  beforeEach(async function () {
    [patient, provider1, provider2, stranger] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("ConsentManager");
    consent = await Factory.deploy();
  });

  describe("Patient Registration", function () {
    it("should register a patient", async function () {
      await consent.registerPatient(patientId);
      expect(await consent.getPatientOwner(patientId)).to.equal(patient.address);
    });

    it("should emit PatientRegistered event", async function () {
      await expect(consent.registerPatient(patientId))
        .to.emit(consent, "PatientRegistered")
        .withArgs(patientId, patient.address);
    });

    it("should reject duplicate registration", async function () {
      await consent.registerPatient(patientId);
      await expect(consent.registerPatient(patientId)).to.be.revertedWith("Already registered");
    });
  });

  describe("Granting Consent", function () {
    beforeEach(async function () {
      await consent.registerPatient(patientId);
    });

    it("should grant consent with no expiry", async function () {
      await consent.grantConsent(patientId, provider1.address, 0, 0, "daily monitoring");

      const record = await consent.getConsent(patientId, 0);
      expect(record.provider).to.equal(provider1.address);
      expect(record.scope).to.equal(0); // VITALS
      expect(record.expiresAt).to.equal(0);
      expect(record.revoked).to.be.false;
      expect(record.purpose).to.equal("daily monitoring");
    });

    it("should grant consent with expiry", async function () {
      const duration = 86400; // 24 hours
      await consent.grantConsent(patientId, provider1.address, 5, duration, "emergency");

      const record = await consent.getConsent(patientId, 0);
      expect(record.scope).to.equal(5); // ALL
      expect(record.expiresAt).to.be.gt(0);
    });

    it("should emit ConsentGranted event", async function () {
      await expect(consent.grantConsent(patientId, provider1.address, 0, 0, "test"))
        .to.emit(consent, "ConsentGranted");
    });

    it("should reject non-owner granting", async function () {
      await expect(
        consent.connect(stranger).grantConsent(patientId, provider1.address, 0, 0, "hack")
      ).to.be.revertedWith("Not patient owner");
    });

    it("should grant multiple scopes to same provider", async function () {
      await consent.grantConsent(patientId, provider1.address, 0, 0, "vitals"); // VITALS
      await consent.grantConsent(patientId, provider1.address, 2, 0, "care");   // CARE_PLAN

      expect(await consent.getConsentCount(patientId)).to.equal(2);
    });
  });

  describe("Revoking Consent", function () {
    beforeEach(async function () {
      await consent.registerPatient(patientId);
      await consent.grantConsent(patientId, provider1.address, 0, 0, "monitoring");
    });

    it("should revoke consent", async function () {
      await consent.revokeConsent(patientId, provider1.address, 0);
      expect(await consent.hasValidConsent(patientId, provider1.address, 0)).to.be.false;
    });

    it("should emit ConsentRevoked event", async function () {
      await expect(consent.revokeConsent(patientId, provider1.address, 0))
        .to.emit(consent, "ConsentRevoked");
    });

    it("should reject revoking non-existent consent", async function () {
      await expect(
        consent.revokeConsent(patientId, provider2.address, 0)
      ).to.be.revertedWith("No active consent");
    });

    it("should reject non-owner revoking", async function () {
      await expect(
        consent.connect(stranger).revokeConsent(patientId, provider1.address, 0)
      ).to.be.revertedWith("Not patient owner");
    });
  });

  describe("Consent Verification", function () {
    beforeEach(async function () {
      await consent.registerPatient(patientId);
    });

    it("should verify active consent", async function () {
      await consent.grantConsent(patientId, provider1.address, 0, 0, "monitoring");
      expect(await consent.hasValidConsent(patientId, provider1.address, 0)).to.be.true;
    });

    it("should reject revoked consent", async function () {
      await consent.grantConsent(patientId, provider1.address, 0, 0, "monitoring");
      await consent.revokeConsent(patientId, provider1.address, 0);
      expect(await consent.hasValidConsent(patientId, provider1.address, 0)).to.be.false;
    });

    it("should reject expired consent", async function () {
      await consent.grantConsent(patientId, provider1.address, 0, 60, "short"); // 60 seconds
      // Fast forward 120 seconds
      await time.increase(120);
      expect(await consent.hasValidConsent(patientId, provider1.address, 0)).to.be.false;
    });

    it("ALL scope covers specific scopes", async function () {
      await consent.grantConsent(patientId, provider1.address, 5, 0, "full access"); // ALL
      expect(await consent.hasValidConsent(patientId, provider1.address, 0)).to.be.true; // VITALS
      expect(await consent.hasValidConsent(patientId, provider1.address, 1)).to.be.true; // DRUG_INTERACTION
      expect(await consent.hasValidConsent(patientId, provider1.address, 2)).to.be.true; // CARE_PLAN
    });

    it("patient owner always has consent", async function () {
      expect(await consent.hasValidConsent(patientId, patient.address, 0)).to.be.true;
      expect(await consent.hasValidConsent(patientId, patient.address, 5)).to.be.true;
    });

    it("stranger has no consent", async function () {
      expect(await consent.hasValidConsent(patientId, stranger.address, 0)).to.be.false;
    });
  });

  describe("Active Consents View", function () {
    beforeEach(async function () {
      await consent.registerPatient(patientId);
      await consent.grantConsent(patientId, provider1.address, 0, 0, "vitals");
      await consent.grantConsent(patientId, provider2.address, 2, 0, "care");
      await consent.grantConsent(patientId, provider1.address, 1, 60, "drugs-short"); // expires in 60s
    });

    it("should return all active consents", async function () {
      const active = await consent.getActiveConsents(patientId);
      expect(active.length).to.equal(3);
    });

    it("should exclude revoked consents", async function () {
      await consent.revokeConsent(patientId, provider1.address, 0); // revoke VITALS
      const active = await consent.getActiveConsents(patientId);
      expect(active.length).to.equal(2);
    });

    it("should exclude expired consents", async function () {
      await time.increase(120); // expire the 60s consent
      const active = await consent.getActiveConsents(patientId);
      expect(active.length).to.equal(2);
    });
  });
});
