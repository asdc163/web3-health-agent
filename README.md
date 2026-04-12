# Web3 Health Agent

An AI-powered health monitoring agent that anchors patient data integrity proofs on-chain. Built for elderly care — tracks vitals, catches dangerous drug interactions, and generates care plans with tamper-proof blockchain records.

![Dashboard](frontend/screenshot.png)

## Why This Exists

Healthcare data gets altered, lost, or disputed all the time. An elderly patient's blood pressure readings from last Tuesday shouldn't be something anyone can quietly change. This agent:

- Monitors vitals (BP, heart rate, glucose, SpO2) and flags dangerous trends
- Catches drug interactions before they hurt someone (Warfarin + Aspirin = bad day)
- Generates personalized care plans based on patient history
- Anchors keccak256 hashes of every data point on-chain — if someone tampers with records, the hash won't match

The patient stays in control of who sees what, with on-chain consent that auto-expires.

## Architecture

```
Patient Vitals ──> MCP Server ──> AI Health Agent ──> On-Chain Hash ──> IPFS (encrypted)
                   (6 tools)      (analysis +         (integrity       (full payload,
                                   alerts)              proof)          patient-encrypted)
```

**Smart Contracts** (Solidity 0.8.24):
- `HealthDataRegistry.sol` — anchors record hashes, supports 5 record types (VITALS, DRUG_INTERACTION, CARE_PLAN, LAB_RESULT, ALERT)
- `ConsentManager.sol` — scoped permissions with time-based expiry, revocation, and ALL-scope override

**MCP Server Tools**:
- `check_drug_interactions` — detects SEVERE/MODERATE interactions with clinical evidence
- `analyze_vitals` — trend analysis across BP, HR, glucose, SpO2
- `generate_care_plan` — daily care plans with medication schedules
- `search_drugs` — medication database lookup
- `get_vital_ranges` — age-appropriate reference ranges
- `generate_synthetic_patient` — test data generation

**On-Chain Bridge** (`agent/onchain-bridge.js`):
- Connects MCP tool outputs to blockchain
- Auto-escalates severe drug interactions to ALERT records
- Patient registration + consent management
- Record verification

## Quick Start

```bash
# install deps
npm install

# compile contracts
npx hardhat compile

# run all tests (47 passing)
npx hardhat test

# deploy to local node
npx hardhat node &
npx hardhat run scripts/deploy.js --network localhost
```

## Running the Dashboard

Just open `frontend/index.html` in a browser. No build step needed — it's a single-file dashboard showing:
- Real-time patient monitoring with on-chain proofs
- Active consent management
- Health record registry with verification status
- System architecture overview

## Smart Contract API

### HealthDataRegistry

```solidity
// Register a patient (called by patient wallet)
registerPatient(bytes32 patientId)

// Authorize an agent/provider to submit records
authorizeProvider(bytes32 patientId, address provider)

// Anchor a health record hash
anchorRecord(bytes32 patientId, bytes32 dataHash, RecordType recordType, string ipfsCid)

// Anchor an alert (severe drug interaction, critical vitals)
anchorAlert(bytes32 patientId, bytes32 dataHash, string alertMessage, string ipfsCid)

// Verify a record's integrity
verifyRecord(bytes32 patientId, uint256 recordIndex, bytes32 dataHash) returns (bool)
```

### ConsentManager

```solidity
// Grant scoped consent with optional expiry
grantConsent(bytes32 patientId, address provider, DataScope scope, uint64 duration, string purpose)

// Revoke consent
revokeConsent(bytes32 patientId, address provider, DataScope scope)

// Check if provider has valid consent
hasValidConsent(bytes32 patientId, address provider, DataScope scope) returns (bool)
```

## Tests

47 tests covering:
- Patient registration and authorization (8 tests)
- Record anchoring across all 5 types (10 tests)
- Alert system with event emission (4 tests)
- Record verification (3 tests)
- Consent lifecycle: grant, revoke, expiry (12 tests)
- Scoped permissions and ALL-scope override (6 tests)
- Full integration: register -> consent -> anchor -> verify (4 tests)

## Tech Stack

- Solidity 0.8.24 + Hardhat
- ethers.js v6
- MCP (Model Context Protocol) server
- Single-file frontend (vanilla HTML/CSS/JS)

## EVM Compatibility

Deploys on any EVM chain — Ethereum, BNB Chain, Polygon, Arbitrum, HashKey Chain, etc. No chain-specific dependencies.

## License

MIT
