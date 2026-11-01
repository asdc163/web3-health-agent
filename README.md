# Health-record integrity prototype

Solidity contracts and a JavaScript bridge exploring record hashes, provider permissions and expiring consent.

A matching hash shows that the compared data matches a recorded value; it does not establish that the original data was medically correct.

## What is here

- `contracts/HealthDataRegistry.sol`: record-hash registration and provider authorization.
- `contracts/ConsentManager.sol`: scoped consent, expiry and revocation.
- `agent/onchain-bridge.js`: an ethers-based bridge to deployed contract addresses.
- `frontend/index.html`: a static demonstration dashboard.
- `test/`: contract and integration test sources.

The earlier description proposed connecting an ElderCare MCP service. This repository does not contain that complete service. The dashboard and source do not establish live patient monitoring, clinical safety, an encrypted storage service or a production blockchain deployment.

<details>
<summary>Contract API reference</summary>

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

</details>
