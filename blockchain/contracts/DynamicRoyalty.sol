// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface IArtisanPenaltyRegistry {
    function getRoyaltyPenaltyBps(address artisan) external view returns (uint256);
}

/// @title DynamicRoyalty
/// @notice Tapered royalty engine for secondary sales.
/// @dev Royalty curve follows 40 / sqrt(transfer_number). For gas and readability,
/// first 10 transfers use precomputed percentages and larger transfer IDs use integer sqrt.
contract DynamicRoyalty is Ownable, ReentrancyGuard {
    uint256 private constant BPS_DENOMINATOR = 10_000;

    // Precomputed percentages converted to bps for transfer IDs 1-10.
    // T1=40%, T2=28%, T3=23%, T4=20%, T5=17%, T6=16%, T7=15%, T8=14%, T9=13%, T10=12%
    uint16[10] private TAPER_BPS = [4000, 2800, 2300, 2000, 1700, 1600, 1500, 1400, 1300, 1200];

    address public marketplace;
    address public minterRegistrar;
    IArtisanPenaltyRegistry public artisanRegistry;

    // tokenId => original artisan minter
    mapping(uint256 => address) public originalMinter;

    // tokenId => number of completed secondary transfers
    mapping(uint256 => uint256) public transferCount;

    event MarketplaceUpdated(address indexed newMarketplace);
    event MinterRegistrarUpdated(address indexed newRegistrar);
    event ArtisanRegistryUpdated(address indexed newRegistry);
    event OriginalMinterRegistered(uint256 indexed tokenId, address indexed artisan);
    event RoyaltySettled(
        uint256 indexed tokenId,
        address indexed seller,
        address indexed artisan,
        uint256 transferId,
        uint256 salePrice,
        uint256 artisanAmount,
        uint256 sellerAmount
    );

    modifier onlyMarketplace() {
        require(msg.sender == marketplace, "DynamicRoyalty: caller is not marketplace");
        _;
    }

    modifier onlyMinterRegistrar() {
        require(msg.sender == minterRegistrar, "DynamicRoyalty: caller is not registrar");
        _;
    }

    constructor(address marketplaceAddress, address minterRegistrarAddress, address artisanRegistryAddress) {
        require(marketplaceAddress != address(0), "DynamicRoyalty: invalid marketplace");
        require(minterRegistrarAddress != address(0), "DynamicRoyalty: invalid registrar");
        marketplace = marketplaceAddress;
        minterRegistrar = minterRegistrarAddress;
        artisanRegistry = IArtisanPenaltyRegistry(artisanRegistryAddress);
    }

    function setMarketplace(address marketplaceAddress) external onlyOwner {
        require(marketplaceAddress != address(0), "DynamicRoyalty: invalid marketplace");
        marketplace = marketplaceAddress;
        emit MarketplaceUpdated(marketplaceAddress);
    }

    function setMinterRegistrar(address registrarAddress) external onlyOwner {
        require(registrarAddress != address(0), "DynamicRoyalty: invalid registrar");
        minterRegistrar = registrarAddress;
        emit MinterRegistrarUpdated(registrarAddress);
    }

    function setArtisanRegistry(address artisanRegistryAddress) external onlyOwner {
        artisanRegistry = IArtisanPenaltyRegistry(artisanRegistryAddress);
        emit ArtisanRegistryUpdated(artisanRegistryAddress);
    }

    function registerOriginalMinter(uint256 tokenId, address artisan) external onlyMinterRegistrar {
        require(artisan != address(0), "DynamicRoyalty: invalid artisan");
        require(originalMinter[tokenId] == address(0), "DynamicRoyalty: already registered");
        originalMinter[tokenId] = artisan;
        emit OriginalMinterRegistered(tokenId, artisan);
    }

    /// @notice Returns base royalty amount before any slashing/penalty reduction.
    function calculateRoyalty(uint256 transferId, uint256 salePrice)
        public
        view
        returns (uint256 royaltyAmount, uint256 royaltyBps)
    {
        royaltyBps = _royaltyBpsForTransfer(transferId);
        royaltyAmount = (salePrice * royaltyBps) / BPS_DENOMINATOR;
    }

    /// @notice Settles a secondary sale and routes payouts to artisan and seller.
    /// @dev transferCount is incremented per token each time this function succeeds.
    function processSecondarySale(uint256 tokenId, address payable seller)
        external
        payable
        onlyMarketplace
        nonReentrant
        returns (uint256 artisanAmount, uint256 sellerAmount)
    {
        require(seller != address(0), "DynamicRoyalty: invalid seller");
        address artisan = originalMinter[tokenId];
        require(artisan != address(0), "DynamicRoyalty: unknown token");
        require(msg.value > 0, "DynamicRoyalty: sale price is zero");

        uint256 transferId = transferCount[tokenId] + 1;
        (uint256 baseRoyaltyAmount, ) = calculateRoyalty(transferId, msg.value);

        uint256 penaltyBps = 0;
        if (address(artisanRegistry) != address(0)) {
            penaltyBps = artisanRegistry.getRoyaltyPenaltyBps(artisan);
            if (penaltyBps > BPS_DENOMINATOR) {
                penaltyBps = BPS_DENOMINATOR;
            }
        }

        // Example: 500 bps penalty keeps 95% of base royalty.
        artisanAmount = (baseRoyaltyAmount * (BPS_DENOMINATOR - penaltyBps)) / BPS_DENOMINATOR;
        sellerAmount = msg.value - artisanAmount;

        transferCount[tokenId] = transferId;

        (bool sentArtisan, ) = payable(artisan).call{value: artisanAmount}("");
        require(sentArtisan, "DynamicRoyalty: artisan transfer failed");

        (bool sentSeller, ) = seller.call{value: sellerAmount}("");
        require(sentSeller, "DynamicRoyalty: seller transfer failed");

        emit RoyaltySettled(
            tokenId,
            seller,
            artisan,
            transferId,
            msg.value,
            artisanAmount,
            sellerAmount
        );
    }

    function previewSettlement(uint256 tokenId, uint256 salePrice)
        external
        view
        returns (uint256 transferId, uint256 baseRoyaltyBps, uint256 penaltyBps, uint256 artisanAmount, uint256 sellerAmount)
    {
        address artisan = originalMinter[tokenId];
        require(artisan != address(0), "DynamicRoyalty: unknown token");

        transferId = transferCount[tokenId] + 1;
        (uint256 baseRoyaltyAmount, uint256 bps) = calculateRoyalty(transferId, salePrice);
        baseRoyaltyBps = bps;

        if (address(artisanRegistry) != address(0)) {
            penaltyBps = artisanRegistry.getRoyaltyPenaltyBps(artisan);
            if (penaltyBps > BPS_DENOMINATOR) {
                penaltyBps = BPS_DENOMINATOR;
            }
        }

        artisanAmount = (baseRoyaltyAmount * (BPS_DENOMINATOR - penaltyBps)) / BPS_DENOMINATOR;
        sellerAmount = salePrice - artisanAmount;
    }

    function _royaltyBpsForTransfer(uint256 transferId) internal view returns (uint256) {
        require(transferId > 0, "DynamicRoyalty: transferId must be >= 1");

        if (transferId <= 10) {
            return TAPER_BPS[transferId - 1];
        }

        uint256 root = _sqrt(transferId);
        if (root == 0) {
            return 0;
        }

        uint256 bps = 4000 / root;
        return bps;
    }

    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) {
            return 0;
        }

        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }
}