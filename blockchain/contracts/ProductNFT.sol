// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

interface IArtisanRegistryForNFT {
    function isVerifiedArtisan(address wallet) external view returns (bool);
}

interface IDynamicRoyaltyRegister {
    function registerOriginalMinter(uint256 tokenId, address artisan) external;
}

/// @title ProductNFT
/// @notice ERC-721 digital twin gated by verified artisan identity and AI terroir score.
contract ProductNFT is ERC721URIStorage {
    using Counters for Counters.Counter;

    uint8 public constant MIN_TERROIR_SCORE = 70;

    struct ProductMeta {
        uint8 terroirScore;
        string provenanceCid;
        uint256 mintedAt;
        address artisan;
    }

    Counters.Counter private _tokenIds;

    IArtisanRegistryForNFT public immutable artisanRegistry;
    IDynamicRoyaltyRegister public immutable royaltyEngine;

    mapping(uint256 => ProductMeta) public productMeta;

    event ProductMinted(
        uint256 indexed tokenId,
        address indexed artisan,
        address indexed recipient,
        uint8 terroirScore,
        string provenanceCid
    );

    constructor(address artisanRegistryAddress, address royaltyEngineAddress)
        ERC721("Pramaan Product Twin", "PRMN")
    {
        require(artisanRegistryAddress != address(0), "ProductNFT: invalid artisan registry");
        require(royaltyEngineAddress != address(0), "ProductNFT: invalid royalty engine");

        artisanRegistry = IArtisanRegistryForNFT(artisanRegistryAddress);
        royaltyEngine = IDynamicRoyaltyRegister(royaltyEngineAddress);
    }

    /// @notice Mints a digital twin NFT after identity and AI terroir gating.
    /// @param recipient Wallet that will receive the NFT.
    /// @param tokenUri Full metadata URI.
    /// @param terroirScore AI score from 0..100.
    /// @param provenanceCid Content-addressed CID for craft proof assets.
    function mintProduct(
        address recipient,
        string calldata tokenUri,
        uint8 terroirScore,
        string calldata provenanceCid
    ) external returns (uint256 tokenId) {
        require(recipient != address(0), "ProductNFT: invalid recipient");
        require(artisanRegistry.isVerifiedArtisan(msg.sender), "ProductNFT: only verified artisan can mint");
        require(terroirScore >= MIN_TERROIR_SCORE, "ProductNFT: terroir score below threshold");

        _tokenIds.increment();
        tokenId = _tokenIds.current();

        _safeMint(recipient, tokenId);
        _setTokenURI(tokenId, tokenUri);

        productMeta[tokenId] = ProductMeta({
            terroirScore: terroirScore,
            provenanceCid: provenanceCid,
            mintedAt: block.timestamp,
            artisan: msg.sender
        });

        // The royalty engine uses this to route secondary market payouts.
        royaltyEngine.registerOriginalMinter(tokenId, msg.sender);

        emit ProductMinted(tokenId, msg.sender, recipient, terroirScore, provenanceCid);
    }
}