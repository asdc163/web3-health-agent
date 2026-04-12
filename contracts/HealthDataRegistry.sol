// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title HealthDataRegistry
 * @notice Tamper-proof on-chain registry for elderly patient health data.
 *         Stores hashes of health readings (vitals, drug interactions, care plans)
 *         so that off-chain AI agents can prove data integrity without exposing PHI.
 *
 * @dev Flow: AI Health Agent collects data via MCP → encrypts off-chain →
 *      anchors keccak256 hash on-chain → anyone can verify integrity later.
 */
contract HealthDataRegistry {
    enum RecordType {
        VITALS,
        DRUG_INTERACTION,
        CARE_PLAN,
        LAB_RESULT,
        ALERT
    }

    struct HealthRecord {
        bytes32 dataHash;        // keccak256 of the off-chain encrypted payload
        RecordType recordType;
        uint64 timestamp;        // block.timestamp at anchoring
        address submittedBy;     // the agent/provider who submitted
        string ipfsCid;          // optional IPFS CID for encrypted payload
    }

    // patientId (bytes32) => array of records
    mapping(bytes32 => HealthRecord[]) private _records;

    // patientId => authorized addresses (agents/providers who can submit)
    mapping(bytes32 => mapping(address => bool)) private _authorized;

    // patientId => owner (patient wallet)
    mapping(bytes32 => address) private _patientOwner;

    // Track all registered patient IDs
    bytes32[] private _patientIds;

    event PatientRegistered(bytes32 indexed patientId, address indexed owner);
    event ProviderAuthorized(bytes32 indexed patientId, address indexed provider);
    event ProviderRevoked(bytes32 indexed patientId, address indexed provider);
    event RecordAnchored(
        bytes32 indexed patientId,
        uint256 indexed recordIndex,
        RecordType recordType,
        bytes32 dataHash
    );
    event AlertTriggered(
        bytes32 indexed patientId,
        bytes32 dataHash,
        string alertMessage
    );

    modifier onlyPatientOwner(bytes32 patientId) {
        require(_patientOwner[patientId] == msg.sender, "Not patient owner");
        _;
    }

    modifier onlyAuthorized(bytes32 patientId) {
        require(
            _authorized[patientId][msg.sender] ||
                _patientOwner[patientId] == msg.sender,
            "Not authorized"
        );
        _;
    }

    // ─── Patient Management ──────────────────────────────────────

    function registerPatient(bytes32 patientId) external {
        require(_patientOwner[patientId] == address(0), "Already registered");
        _patientOwner[patientId] = msg.sender;
        _patientIds.push(patientId);
        emit PatientRegistered(patientId, msg.sender);
    }

    function authorizeProvider(
        bytes32 patientId,
        address provider
    ) external onlyPatientOwner(patientId) {
        _authorized[patientId][provider] = true;
        emit ProviderAuthorized(patientId, provider);
    }

    function revokeProvider(
        bytes32 patientId,
        address provider
    ) external onlyPatientOwner(patientId) {
        _authorized[patientId][provider] = false;
        emit ProviderRevoked(patientId, provider);
    }

    // ─── Data Anchoring ──────────────────────────────────────────

    function anchorRecord(
        bytes32 patientId,
        bytes32 dataHash,
        RecordType recordType,
        string calldata ipfsCid
    ) external onlyAuthorized(patientId) returns (uint256 recordIndex) {
        HealthRecord memory record = HealthRecord({
            dataHash: dataHash,
            recordType: recordType,
            timestamp: uint64(block.timestamp),
            submittedBy: msg.sender,
            ipfsCid: ipfsCid
        });

        _records[patientId].push(record);
        recordIndex = _records[patientId].length - 1;

        emit RecordAnchored(patientId, recordIndex, recordType, dataHash);
    }

    function anchorAlert(
        bytes32 patientId,
        bytes32 dataHash,
        string calldata alertMessage,
        string calldata ipfsCid
    ) external onlyAuthorized(patientId) returns (uint256 recordIndex) {
        HealthRecord memory record = HealthRecord({
            dataHash: dataHash,
            recordType: RecordType.ALERT,
            timestamp: uint64(block.timestamp),
            submittedBy: msg.sender,
            ipfsCid: ipfsCid
        });

        _records[patientId].push(record);
        recordIndex = _records[patientId].length - 1;

        emit RecordAnchored(patientId, recordIndex, RecordType.ALERT, dataHash);
        emit AlertTriggered(patientId, dataHash, alertMessage);
    }

    // ─── Verification ────────────────────────────────────────────

    function verifyRecord(
        bytes32 patientId,
        uint256 recordIndex,
        bytes32 dataHash
    ) external view returns (bool) {
        require(recordIndex < _records[patientId].length, "Invalid index");
        return _records[patientId][recordIndex].dataHash == dataHash;
    }

    // ─── View Functions ──────────────────────────────────────────

    function getRecordCount(bytes32 patientId) external view returns (uint256) {
        return _records[patientId].length;
    }

    function getRecord(
        bytes32 patientId,
        uint256 recordIndex
    ) external view returns (HealthRecord memory) {
        require(recordIndex < _records[patientId].length, "Invalid index");
        return _records[patientId][recordIndex];
    }

    function getLatestRecords(
        bytes32 patientId,
        uint256 count
    ) external view returns (HealthRecord[] memory) {
        uint256 total = _records[patientId].length;
        if (count > total) count = total;

        HealthRecord[] memory result = new HealthRecord[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = _records[patientId][total - count + i];
        }
        return result;
    }

    function isAuthorized(
        bytes32 patientId,
        address provider
    ) external view returns (bool) {
        return
            _authorized[patientId][provider] ||
            _patientOwner[patientId] == provider;
    }

    function getPatientOwner(
        bytes32 patientId
    ) external view returns (address) {
        return _patientOwner[patientId];
    }

    function getPatientCount() external view returns (uint256) {
        return _patientIds.length;
    }
}
