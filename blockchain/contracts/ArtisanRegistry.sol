// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/// @title ArtisanRegistry
/// @notice Soulbound identity + Aadhaar attestation + web-of-trust staking/slashing.
contract ArtisanRegistry is ERC721, Ownable {
    using Counters for Counters.Counter;

    uint256 public constant INITIAL_REPUTATION = 1_000;
    uint256 public constant MIN_VOUCH_STAKE = 50;
    uint256 public constant VOUCHER_ROYALTY_PENALTY_BPS = 500;
    uint256 public constant MAX_ROYALTY_PENALTY_BPS = 9_000;

    struct ArtisanProfile {
        address wallet;
        string name;
        string craft;
        string giRegion;
        uint256 registeredAt;
        bool isAadhaarVerified;
        bool isFraudulent;
        uint256 reputationScore;
        uint256 lockedReputation;
        uint256 royaltyPenaltyBps;
    }

    struct VouchEdge {
        address voucher;
        uint256 stake;
        bool active;
    }

    Counters.Counter private _tokenIds;

    mapping(address => ArtisanProfile) public artisans;
    mapping(address => uint256) public artisanTokenId;
    mapping(address => VouchEdge[]) public incomingVouches;

    // candidate => voucher => index+1 in incomingVouches[candidate], 0 means not found
    mapping(address => mapping(address => uint256)) private _vouchIndex;

    mapping(address => bool) public aadhaarVerifier;

    event AadhaarVerifierUpdated(address indexed verifier, bool isAllowed);
    event ArtisanRegistered(address indexed artisan, string craft);
    event AadhaarMarkedVerified(address indexed artisan, address indexed verifier);
    event ReputationAwarded(address indexed artisan, uint256 amount, string reason);
    event Vouched(address indexed voucher, address indexed candidate, uint256 stake);
    event VouchReleased(address indexed voucher, address indexed candidate, uint256 releasedStake);
    event ArtisanSlashed(address indexed fraudulentArtisan, address indexed voucher, uint256 burnedStake, uint256 newRoyaltyPenaltyBps);

    constructor() ERC721("Pramaan Artisan SBT", "PASBT") {
        aadhaarVerifier[msg.sender] = true;
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 firstTokenId,
        uint256 batchSize
    ) internal virtual override {
        super._beforeTokenTransfer(from, to, firstTokenId, batchSize);
        if (from != address(0)) {
            revert("Soulbound: non-transferable token");
        }
    }

    modifier onlyRegistered() {
        require(artisans[msg.sender].registeredAt != 0, "ArtisanRegistry: not registered");
        _;
    }

    modifier onlyVerifiedArtisan() {
        require(isVerifiedArtisan(msg.sender), "ArtisanRegistry: not verified artisan");
        _;
    }

    function registerArtisan(
        string calldata name,
        string calldata craft,
        string calldata giRegion,
        uint8 /* legacyCraftScore */
    ) external {
        require(bytes(name).length > 0, "ArtisanRegistry: empty name");
        require(bytes(craft).length > 0, "ArtisanRegistry: empty craft");
        require(artisans[msg.sender].registeredAt == 0, "ArtisanRegistry: already registered");

        artisans[msg.sender] = ArtisanProfile({
            wallet: msg.sender,
            name: name,
            craft: craft,
            giRegion: giRegion,
            registeredAt: block.timestamp,
            isAadhaarVerified: false,
            isFraudulent: false,
            reputationScore: INITIAL_REPUTATION,
            lockedReputation: 0,
            royaltyPenaltyBps: 0
        });

        _tokenIds.increment();
        uint256 newTokenId = _tokenIds.current();
        artisanTokenId[msg.sender] = newTokenId;
        _safeMint(msg.sender, newTokenId);

        emit ArtisanRegistered(msg.sender, craft);
    }

    /// @notice Mock hook for off-chain Anon Aadhaar verification result.
    /// @dev In production, this is called by an attestation service after SDK proof validation.
    function markAadhaarVerified(address artisan) external {
        require(aadhaarVerifier[msg.sender] || msg.sender == owner(), "ArtisanRegistry: unauthorized verifier");
        ArtisanProfile storage profile = artisans[artisan];
        require(profile.registeredAt != 0, "ArtisanRegistry: artisan not found");
        require(!profile.isFraudulent, "ArtisanRegistry: artisan flagged");

        profile.isAadhaarVerified = true;
        emit AadhaarMarkedVerified(artisan, msg.sender);
    }

    function setAadhaarVerifier(address verifier, bool isAllowed) external onlyOwner {
        require(verifier != address(0), "ArtisanRegistry: invalid verifier");
        aadhaarVerifier[verifier] = isAllowed;
        emit AadhaarVerifierUpdated(verifier, isAllowed);
    }

    /// @notice Optional helper to grow a trusted artisan's reputation over time.
    function awardReputation(address artisan, uint256 amount, string calldata reason) external onlyOwner {
        require(amount > 0, "ArtisanRegistry: amount must be > 0");
        ArtisanProfile storage profile = artisans[artisan];
        require(profile.registeredAt != 0, "ArtisanRegistry: artisan not found");

        profile.reputationScore += amount;
        emit ReputationAwarded(artisan, amount, reason);
    }

    /// @notice Stake reputation to vouch for a newcomer.
    /// @dev Staked reputation is locked and can later be released or burned on fraud.
    function vouchFor(address candidate, uint256 reputationStake) external onlyVerifiedArtisan {
        require(candidate != address(0) && candidate != msg.sender, "ArtisanRegistry: invalid candidate");
        ArtisanProfile storage voucher = artisans[msg.sender];
        ArtisanProfile storage candidateProfile = artisans[candidate];

        require(candidateProfile.registeredAt != 0, "ArtisanRegistry: candidate not registered");
        require(candidateProfile.isAadhaarVerified, "ArtisanRegistry: candidate not Aadhaar verified");
        require(!candidateProfile.isFraudulent, "ArtisanRegistry: candidate flagged");
        require(reputationStake >= MIN_VOUCH_STAKE, "ArtisanRegistry: stake below minimum");
        require(_availableReputation(msg.sender) >= reputationStake, "ArtisanRegistry: insufficient reputation");

        uint256 indexPlusOne = _vouchIndex[candidate][msg.sender];
        if (indexPlusOne == 0) {
            incomingVouches[candidate].push(
                VouchEdge({voucher: msg.sender, stake: reputationStake, active: true})
            );
            _vouchIndex[candidate][msg.sender] = incomingVouches[candidate].length;
        } else {
            VouchEdge storage edge = incomingVouches[candidate][indexPlusOne - 1];
            require(edge.active, "ArtisanRegistry: vouch inactive");
            edge.stake += reputationStake;
        }

        voucher.lockedReputation += reputationStake;
        emit Vouched(msg.sender, candidate, reputationStake);
    }

    /// @notice Releases locked reputation back to vouchers once candidate clears review.
    function releaseVouches(address candidate) external onlyOwner {
        ArtisanProfile storage candidateProfile = artisans[candidate];
        require(candidateProfile.registeredAt != 0, "ArtisanRegistry: candidate not found");
        require(!candidateProfile.isFraudulent, "ArtisanRegistry: candidate is fraudulent");

        VouchEdge[] storage edges = incomingVouches[candidate];
        for (uint256 i = 0; i < edges.length; i++) {
            if (!edges[i].active) {
                continue;
            }

            ArtisanProfile storage voucher = artisans[edges[i].voucher];
            uint256 amount = edges[i].stake;
            if (voucher.lockedReputation >= amount) {
                voucher.lockedReputation -= amount;
            } else {
                voucher.lockedReputation = 0;
            }
            edges[i].active = false;
            emit VouchReleased(edges[i].voucher, candidate, amount);
        }
    }

    /// @notice Slashes voucher stakes and increases voucher royalty penalties if candidate is fraudulent.
    function slash(address fraudulentArtisan) external onlyOwner {
        ArtisanProfile storage fraudProfile = artisans[fraudulentArtisan];
        require(fraudProfile.registeredAt != 0, "ArtisanRegistry: artisan not found");
        require(!fraudProfile.isFraudulent, "ArtisanRegistry: already slashed");

        fraudProfile.isFraudulent = true;

        VouchEdge[] storage edges = incomingVouches[fraudulentArtisan];
        for (uint256 i = 0; i < edges.length; i++) {
            VouchEdge storage edge = edges[i];
            if (!edge.active) {
                continue;
            }

            ArtisanProfile storage voucher = artisans[edge.voucher];
            uint256 burnedStake = edge.stake;

            if (voucher.lockedReputation >= burnedStake) {
                voucher.lockedReputation -= burnedStake;
            } else {
                voucher.lockedReputation = 0;
            }

            if (voucher.reputationScore >= burnedStake) {
                voucher.reputationScore -= burnedStake;
            } else {
                voucher.reputationScore = 0;
            }

            uint256 newPenalty = voucher.royaltyPenaltyBps + VOUCHER_ROYALTY_PENALTY_BPS;
            if (newPenalty > MAX_ROYALTY_PENALTY_BPS) {
                newPenalty = MAX_ROYALTY_PENALTY_BPS;
            }
            voucher.royaltyPenaltyBps = newPenalty;

            edge.active = false;
            emit ArtisanSlashed(fraudulentArtisan, edge.voucher, burnedStake, newPenalty);
        }
    }

    function isVerifiedArtisan(address wallet) public view returns (bool) {
        ArtisanProfile memory profile = artisans[wallet];
        return (
            profile.registeredAt != 0 &&
            profile.isAadhaarVerified &&
            !profile.isFraudulent &&
            balanceOf(wallet) > 0
        );
    }

    function getArtisan(address wallet) public view returns (ArtisanProfile memory) {
        return artisans[wallet];
    }

    function getRoyaltyPenaltyBps(address artisan) external view returns (uint256) {
        return artisans[artisan].royaltyPenaltyBps;
    }

    function availableReputation(address artisan) external view returns (uint256) {
        return _availableReputation(artisan);
    }

    function _availableReputation(address artisan) internal view returns (uint256) {
        ArtisanProfile memory profile = artisans[artisan];
        if (profile.reputationScore <= profile.lockedReputation) {
            return 0;
        }
        return profile.reputationScore - profile.lockedReputation;
    }
}