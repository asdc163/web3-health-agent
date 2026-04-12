/**
 * On-chain Bridge: Connects ElderCare MCP Server outputs to blockchain.
 *
 * Flow: MCP tool result → hash → anchor on-chain → return proof
 *
 * This module provides functions that an AI agent calls after receiving
 * health data from the MCP server, anchoring integrity proofs on-chain.
 */

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// Load contract ABIs from Hardhat artifacts
const REGISTRY_ABI = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../artifacts/contracts/HealthDataRegistry.sol/HealthDataRegistry.json"),
    "utf8"
  )
).abi;

const CONSENT_ABI = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../artifacts/contracts/ConsentManager.sol/ConsentManager.json"),
    "utf8"
  )
).abi;

// Record type mapping (matches Solidity enum)
const RecordType = {
  VITALS: 0,
  DRUG_INTERACTION: 1,
  CARE_PLAN: 2,
  LAB_RESULT: 3,
  ALERT: 4,
};

const DataScope = {
  VITALS: 0,
  DRUG_INTERACTION: 1,
  CARE_PLAN: 2,
  LAB_RESULT: 3,
  ALERT: 4,
  ALL: 5,
};

class OnChainBridge {
  constructor({ rpcUrl, privateKey, registryAddress, consentAddress }) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.signer = new ethers.Wallet(privateKey, this.provider);
    this.registry = new ethers.Contract(registryAddress, REGISTRY_ABI, this.signer);
    this.consent = new ethers.Contract(consentAddress, CONSENT_ABI, this.signer);
  }

  // ─── Patient Management ───────────────────────────────────

  async registerPatient(patientName) {
    const patientId = ethers.keccak256(ethers.toUtf8Bytes(patientName));
    const tx = await this.registry.registerPatient(patientId);
    await tx.wait();

    // Also register on consent manager
    const tx2 = await this.consent.registerPatient(patientId);
    await tx2.wait();

    return { patientId, txHash: tx.hash };
  }

  async authorizeAgent(patientId, agentAddress) {
    const tx = await this.registry.authorizeProvider(patientId, agentAddress);
    await tx.wait();
    return { txHash: tx.hash };
  }

  // ─── Consent Management ───────────────────────────────────

  async grantConsent(patientId, providerAddress, scope, durationSeconds, purpose) {
    const tx = await this.consent.grantConsent(
      patientId,
      providerAddress,
      scope,
      durationSeconds,
      purpose
    );
    const receipt = await tx.wait();
    return { txHash: tx.hash };
  }

  async checkConsent(patientId, providerAddress, scope) {
    return this.consent.hasValidConsent(patientId, providerAddress, scope);
  }

  // ─── Data Anchoring (called after MCP tool results) ───────

  /**
   * Anchor vitals analysis result on-chain.
   * Called after MCP analyze_vitals tool returns.
   */
  async anchorVitals(patientId, vitalsData, ipfsCid = "") {
    const payload = JSON.stringify(vitalsData);
    const dataHash = ethers.keccak256(ethers.toUtf8Bytes(payload));

    const tx = await this.registry.anchorRecord(
      patientId,
      dataHash,
      RecordType.VITALS,
      ipfsCid
    );
    const receipt = await tx.wait();

    return {
      dataHash,
      recordIndex: this._getRecordIndex(receipt),
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
    };
  }

  /**
   * Anchor drug interaction check on-chain.
   * Called after MCP check_drug_interactions tool returns.
   */
  async anchorDrugInteraction(patientId, interactionData, ipfsCid = "") {
    const payload = JSON.stringify(interactionData);
    const dataHash = ethers.keccak256(ethers.toUtf8Bytes(payload));

    // If severe interaction detected, anchor as alert
    const hasSevere = interactionData.interactions?.some(
      (i) => i.severity === "SEVERE" || i.severity === "CRITICAL"
    );

    let tx, receipt;
    if (hasSevere) {
      const alertMsg = `SEVERE drug interaction detected: ${interactionData.interactions
        .filter((i) => i.severity === "SEVERE" || i.severity === "CRITICAL")
        .map((i) => `${i.drug1}-${i.drug2}`)
        .join(", ")}`;

      tx = await this.registry.anchorAlert(patientId, dataHash, alertMsg, ipfsCid);
    } else {
      tx = await this.registry.anchorRecord(
        patientId,
        dataHash,
        RecordType.DRUG_INTERACTION,
        ipfsCid
      );
    }
    receipt = await tx.wait();

    return {
      dataHash,
      recordIndex: this._getRecordIndex(receipt),
      txHash: tx.hash,
      isAlert: hasSevere,
    };
  }

  /**
   * Anchor care plan on-chain.
   * Called after MCP generate_care_plan tool returns.
   */
  async anchorCarePlan(patientId, carePlanData, ipfsCid = "") {
    const payload = JSON.stringify(carePlanData);
    const dataHash = ethers.keccak256(ethers.toUtf8Bytes(payload));

    const tx = await this.registry.anchorRecord(
      patientId,
      dataHash,
      RecordType.CARE_PLAN,
      ipfsCid
    );
    const receipt = await tx.wait();

    return {
      dataHash,
      recordIndex: this._getRecordIndex(receipt),
      txHash: tx.hash,
    };
  }

  // ─── Verification ─────────────────────────────────────────

  async verifyRecord(patientId, recordIndex, originalData) {
    const payload = JSON.stringify(originalData);
    const dataHash = ethers.keccak256(ethers.toUtf8Bytes(payload));
    const isValid = await this.registry.verifyRecord(patientId, recordIndex, dataHash);

    return { isValid, dataHash };
  }

  async getPatientRecords(patientId, count = 10) {
    const records = await this.registry.getLatestRecords(patientId, count);
    return records.map((r) => ({
      dataHash: r.dataHash,
      recordType: Object.keys(RecordType).find((k) => RecordType[k] === Number(r.recordType)),
      timestamp: new Date(Number(r.timestamp) * 1000).toISOString(),
      submittedBy: r.submittedBy,
      ipfsCid: r.ipfsCid,
    }));
  }

  // ─── Internal ─────────────────────────────────────────────

  _getRecordIndex(receipt) {
    const event = receipt.logs.find((log) => {
      try {
        const parsed = this.registry.interface.parseLog(log);
        return parsed?.name === "RecordAnchored";
      } catch {
        return false;
      }
    });
    if (event) {
      const parsed = this.registry.interface.parseLog(event);
      return Number(parsed.args.recordIndex);
    }
    return -1;
  }
}

module.exports = { OnChainBridge, RecordType, DataScope };
