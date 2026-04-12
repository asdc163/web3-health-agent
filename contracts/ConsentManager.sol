// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ConsentManager
 * @notice On-chain consent management for elderly patient health data.
 *         Each consent grant is a non-transferable record linking a patient
 *         to authorized providers with specific data-type permissions and expiry.
 *
 * @dev Designed to work alongside HealthDataRegistry — providers must hold
 *      valid consent here before they can anchor records there.
 */
contract ConsentManager {
    enum DataScope {
        VITALS,
        DRUG_INTERACTION,
        CARE_PLAN,
        LAB_RESULT,
        ALERT,
        ALL
    }

    struct Consent {
        address provider;
        DataScope scope;
        uint64 grantedAt;
        uint64 expiresAt;       // 0 = no expiry
        bool revoked;
        string purpose;         // e.g. "daily monitoring", "emergency care"
    }

    // patientId => consent array
    mapping(bytes32 => Consent[]) private _consents;

    // patientId => owner wallet
    mapping(bytes32 => address) private _patientOwner;

    // Quick lookup: patientId => provider => scope => consent index + 1 (0 = none)
    mapping(bytes32 => mapping(address => mapping(DataScope => uint256))) private _activeConsent;

    event ConsentGranted(
        bytes32 indexed patientId,
        address indexed provider,
        DataScope scope,
        uint256 consentIndex,
        uint64 expiresAt
    );

    event ConsentRevoked(
        bytes32 indexed patientId,
        address indexed provider,
        DataScope scope,
        uint256 consentIndex
    );

    event PatientRegistered(bytes32 indexed patientId, address indexed owner);

    modifier onlyPatientOwner(bytes32 patientId) {
        require(_patientOwner[patientId] == msg.sender, "Not patient owner");
        _;
    }

    // ─── Patient Registration ───────────────────────────────────

    function registerPatient(bytes32 patientId) external {
        require(_patientOwner[patientId] == address(0), "Already registered");
        _patientOwner[patientId] = msg.sender;
        emit PatientRegistered(patientId, msg.sender);
    }

    // ─── Consent Management ─────────────────────────────────────

    function grantConsent(
        bytes32 patientId,
        address provider,
        DataScope scope,
        uint64 durationSeconds,
        string calldata purpose
    ) external onlyPatientOwner(patientId) returns (uint256 consentIndex) {
        uint64 expiresAt = durationSeconds > 0
            ? uint64(block.timestamp) + durationSeconds
            : 0;

        Consent memory consent = Consent({
            provider: provider,
            scope: scope,
            grantedAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            revoked: false,
            purpose: purpose
        });

        _consents[patientId].push(consent);
        consentIndex = _consents[patientId].length - 1;

        // Store active consent lookup (index + 1 to distinguish from default 0)
        _activeConsent[patientId][provider][scope] = consentIndex + 1;

        emit ConsentGranted(patientId, provider, scope, consentIndex, expiresAt);
    }

    function revokeConsent(
        bytes32 patientId,
        address provider,
        DataScope scope
    ) external onlyPatientOwner(patientId) {
        uint256 stored = _activeConsent[patientId][provider][scope];
        require(stored > 0, "No active consent");

        uint256 idx = stored - 1;
        _consents[patientId][idx].revoked = true;
        _activeConsent[patientId][provider][scope] = 0;

        emit ConsentRevoked(patientId, provider, scope, idx);
    }

    // ─── Consent Verification ───────────────────────────────────

    function hasValidConsent(
        bytes32 patientId,
        address provider,
        DataScope scope
    ) external view returns (bool) {
        // Check specific scope
        if (_checkConsent(patientId, provider, scope)) return true;
        // Check ALL scope (covers everything)
        if (scope != DataScope.ALL && _checkConsent(patientId, provider, DataScope.ALL)) return true;
        // Patient owner always has consent
        if (_patientOwner[patientId] == provider) return true;
        return false;
    }

    function _checkConsent(
        bytes32 patientId,
        address provider,
        DataScope scope
    ) internal view returns (bool) {
        uint256 stored = _activeConsent[patientId][provider][scope];
        if (stored == 0) return false;

        Consent storage consent = _consents[patientId][stored - 1];
        if (consent.revoked) return false;
        if (consent.expiresAt > 0 && consent.expiresAt < block.timestamp) return false;
        return true;
    }

    // ─── View Functions ─────────────────────────────────────────

    function getConsent(
        bytes32 patientId,
        uint256 consentIndex
    ) external view returns (Consent memory) {
        require(consentIndex < _consents[patientId].length, "Invalid index");
        return _consents[patientId][consentIndex];
    }

    function getConsentCount(bytes32 patientId) external view returns (uint256) {
        return _consents[patientId].length;
    }

    function getPatientOwner(bytes32 patientId) external view returns (address) {
        return _patientOwner[patientId];
    }

    function getActiveConsents(
        bytes32 patientId
    ) external view returns (Consent[] memory) {
        Consent[] storage all = _consents[patientId];
        uint256 activeCount = 0;

        // Count active
        for (uint256 i = 0; i < all.length; i++) {
            if (!all[i].revoked && (all[i].expiresAt == 0 || all[i].expiresAt >= block.timestamp)) {
                activeCount++;
            }
        }

        // Build result
        Consent[] memory result = new Consent[](activeCount);
        uint256 j = 0;
        for (uint256 i = 0; i < all.length; i++) {
            if (!all[i].revoked && (all[i].expiresAt == 0 || all[i].expiresAt >= block.timestamp)) {
                result[j] = all[i];
                j++;
            }
        }
        return result;
    }
}
