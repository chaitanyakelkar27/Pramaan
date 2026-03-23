// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

interface IArtisanRegistry {
    function isVerifiedArtisan(address wallet) external view returns (bool);
}

contract ProductRegistry {
    using ECDSA for bytes32;

    struct ProductRecord {
        bytes32 productHash;
        string ipfsCid;
        address artisan;
        address provenanceSigner;
        string productName;
        string giTag;
        bytes32 metadataHash;
        bytes deviceSignature;
        uint256 origin_lat;
        uint256 origin_lng;
        uint256 registeredAt;
        uint256 transferCount;
        address[] handlers;
        bool[] handlerVerified;
    }

    IArtisanRegistry public immutable artisanRegistry;

    mapping(bytes32 => ProductRecord) public products;
    mapping(bytes32 => mapping(bytes32 => bool)) public usedScanNonces;
    mapping(bytes32 => bool) public usedAttestationDigests;

    event ProductRegistered(bytes32 indexed productHash, address indexed artisan, string giTag);
    event ProductProvenanceSigned(
        bytes32 indexed productHash,
        bytes32 indexed metadataHash,
        address indexed signer,
        bytes deviceSignature
    );
    event ProductTransferred(
        bytes32 indexed productHash,
        address indexed from,
        address indexed to,
        uint256 transferCount,
        uint256 royaltyBps,
        uint256 royaltyAmount
    );
    event ProductScanCheckpoint(
        bytes32 indexed productHash,
        bytes32 indexed nonce,
        address indexed scanner,
        bool replayed,
        uint256 timestamp
    );

    constructor(address artisanRegistryAddress) {
        require(artisanRegistryAddress != address(0), "Invalid artisan registry");
        artisanRegistry = IArtisanRegistry(artisanRegistryAddress);
    }

    function registerProduct(
        bytes32 hash,
        string calldata cid,
        string calldata name,
        string calldata giTag,
        bytes32 metadataHash,
        address provenanceSigner,
        bytes calldata deviceSignature,
        uint256 lat,
        uint256 lng
    ) external {
        require(artisanRegistry.isVerifiedArtisan(msg.sender), "Only verified artisans");
        require(products[hash].registeredAt == 0, "Product already registered");
        require(metadataHash != bytes32(0), "Invalid metadata hash");
        require(provenanceSigner != address(0), "Invalid signer");
        require(deviceSignature.length > 0, "Missing device signature");

        bytes32 attestationDigest = _attestationDigest(
            hash,
            metadataHash,
            msg.sender,
            provenanceSigner,
            cid,
            name,
            giTag,
            lat,
            lng
        );
        require(!usedAttestationDigests[attestationDigest], "Attestation already used");

        address recoveredSigner = attestationDigest.toEthSignedMessageHash().recover(deviceSignature);
        require(recoveredSigner == provenanceSigner, "Invalid provenance attestation");

        usedAttestationDigests[attestationDigest] = true;

        ProductRecord storage product = products[hash];
        product.productHash = hash;
        product.ipfsCid = cid;
        product.artisan = msg.sender;
        product.provenanceSigner = provenanceSigner;
        product.productName = name;
        product.giTag = giTag;
        product.metadataHash = metadataHash;
        product.deviceSignature = deviceSignature;
        product.origin_lat = lat;
        product.origin_lng = lng;
        product.registeredAt = block.timestamp;
        product.transferCount = 0;

        emit ProductRegistered(hash, msg.sender, giTag);
        emit ProductProvenanceSigned(hash, metadataHash, provenanceSigner, deviceSignature);
    }

    function checkpointScanNonce(bytes32 hash, bytes32 nonce) external returns (bool replayed) {
        ProductRecord storage product = products[hash];
        require(product.registeredAt != 0, "Product not found");
        require(nonce != bytes32(0), "Invalid nonce");

        replayed = usedScanNonces[hash][nonce];
        if (!replayed) {
            usedScanNonces[hash][nonce] = true;
        }

        emit ProductScanCheckpoint(hash, nonce, msg.sender, replayed, block.timestamp);
    }

    function isScanNonceUsed(bytes32 hash, bytes32 nonce) external view returns (bool) {
        return usedScanNonces[hash][nonce];
    }

    function transferProduct(bytes32 hash, address newOwner) external payable {
        ProductRecord storage product = products[hash];
        require(product.registeredAt != 0, "Product not found");
        require(newOwner != address(0), "Invalid new owner");
        require(_currentOwner(product) == msg.sender, "Caller is not current owner");

        product.handlers.push(newOwner);
        bool isHandlerVerified = artisanRegistry.isVerifiedArtisan(newOwner);
        product.handlerVerified.push(isHandlerVerified);
        product.transferCount += 1;

        uint256 royaltyBps = _quadraticRoyaltyBps(product.transferCount);
        uint256 royaltyAmount = (msg.value * royaltyBps) / 10000;

        if (royaltyAmount > 0) {
            (bool paidRoyalty, ) = payable(product.artisan).call{value: royaltyAmount}("");
            require(paidRoyalty, "Royalty payment failed");
        }

        uint256 sellerAmount = msg.value - royaltyAmount;
        if (sellerAmount > 0) {
            (bool paidSeller, ) = payable(msg.sender).call{value: sellerAmount}("");
            require(paidSeller, "Seller payout failed");
        }

        emit ProductTransferred(hash, msg.sender, newOwner, product.transferCount, royaltyBps, royaltyAmount);
    }

    function verifyProduct(bytes32 hash) public view returns (ProductRecord memory, uint8 terroir) {
        ProductRecord memory product = products[hash];
        require(product.registeredAt != 0, "Product not found");

        int256 score = 100;

        for (uint256 i = 0; i < product.handlerVerified.length; i++) {
            if (!product.handlerVerified[i]) {
                score -= 15;
            }
        }

        if (product.transferCount > 10) {
            score -= 10;
        }

        if (block.timestamp < product.registeredAt + 1 days && product.transferCount > 3) {
            score -= 20;
        }

        if (score < 0) {
            score = 0;
        }

        return (product, uint8(uint256(score)));
    }

    function _currentOwner(ProductRecord storage product) internal view returns (address) {
        if (product.handlers.length == 0) {
            return product.artisan;
        }
        return product.handlers[product.handlers.length - 1];
    }

    function _attestationDigest(
        bytes32 hash,
        bytes32 metadataHash,
        address artisan,
        address provenanceSigner,
        string calldata cid,
        string calldata name,
        string calldata giTag,
        uint256 lat,
        uint256 lng
    ) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                block.chainid,
                address(this),
                hash,
                metadataHash,
                artisan,
                provenanceSigner,
                cid,
                name,
                giTag,
                lat,
                lng
            )
        );
    }

    function _quadraticRoyaltyBps(uint256 transferCount) internal pure returns (uint256) {
        uint256 root = _sqrt(transferCount);
        if (root == 0) {
            return 0;
        }
        return 4000 / root;
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