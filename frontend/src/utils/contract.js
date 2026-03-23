import {
    connect,
    createConfig,
    getAccount,
    getWalletClient,
    http,
    readContract,
    switchChain,
    waitForTransactionReceipt,
    writeContract
} from "@wagmi/core";
import { injected } from "@wagmi/connectors";
import { sepolia } from "wagmi/chains";
import { encodeFunctionData, formatEther, parseEther, toHex } from "viem";

import {
    ARTISAN_ABI,
    DYNAMIC_ROYALTY_ABI,
    ESCROW_MARKETPLACE_ABI,
    PRODUCT_ABI,
    PRODUCT_NFT_ABI
} from "./abi";
import {
    ARTISAN_REGISTRY_ADDRESS,
    CHAIN_ID,
    DYNAMIC_ROYALTY_ADDRESS,
    ESCROW_MARKETPLACE_ADDRESS,
    PRODUCT_NFT_ADDRESS,
    PRODUCT_REGISTRY_ADDRESS,
    RPC_URL
} from "./constants";

const SEPOLIA_HEX_CHAIN_ID = "0xaa36a7";
const DEFAULT_TARGET_ROYALTY_ETH = "0.001";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_HASH = "0x" + "00".repeat(32);

const LEGACY_ARTISAN_READ_ABI = [
    {
        inputs: [{ internalType: "address", name: "wallet", type: "address" }],
        name: "getArtisan",
        outputs: [
            {
                components: [
                    { internalType: "address", name: "wallet", type: "address" },
                    { internalType: "string", name: "name", type: "string" },
                    { internalType: "string", name: "craft", type: "string" },
                    { internalType: "string", name: "giRegion", type: "string" },
                    { internalType: "uint8", name: "craftScore", type: "uint8" },
                    { internalType: "uint256", name: "registeredAt", type: "uint256" },
                    { internalType: "bool", name: "aadhaarVerified", type: "bool" },
                    { internalType: "bool", name: "validatorApproved", type: "bool" },
                    { internalType: "bool", name: "verified", type: "bool" }
                ],
                internalType: "struct ArtisanRegistry.ArtisanRecord",
                name: "",
                type: "tuple"
            }
        ],
        stateMutability: "view",
        type: "function"
    }
];

const LEGACY_PRODUCT_REGISTER_ABI = [
    {
        inputs: [
            { internalType: "bytes32", name: "hash", type: "bytes32" },
            { internalType: "string", name: "cid", type: "string" },
            { internalType: "string", name: "name", type: "string" },
            { internalType: "string", name: "giTag", type: "string" },
            { internalType: "uint256", name: "lat", type: "uint256" },
            { internalType: "uint256", name: "lng", type: "uint256" }
        ],
        name: "registerProduct",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function"
    }
];

const injectedConnector = injected({ shimDisconnect: true });

const config = createConfig({
    chains: [sepolia],
    connectors: [injectedConnector],
    transports: {
        [CHAIN_ID]: http(RPC_URL)
    }
});

function ensureBrowserWallet() {
    if (typeof window === "undefined" || !window.ethereum) {
        throw new Error("No browser wallet found. Install MetaMask first.");
    }
}

function assertConfiguredAddress(addressValue, label) {
    if (!addressValue || addressValue === "PASTE_ADDRESS_HERE") {
        throw new Error(
            label +
            " is not configured. Set NEXT_PUBLIC_" +
            label +
            " in frontend/.env.local or update src/utils/constants.js."
        );
    }
}

async function ensureSepolia() {
    ensureBrowserWallet();

    try {
        await switchChain(config, { chainId: CHAIN_ID });
    } catch (_switchError) {
        await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
                {
                    chainId: SEPOLIA_HEX_CHAIN_ID,
                    chainName: "Sepolia",
                    rpcUrls: [RPC_URL],
                    nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
                    blockExplorerUrls: ["https://sepolia.etherscan.io"]
                }
            ]
        });

        await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: SEPOLIA_HEX_CHAIN_ID }]
        });
    }
}

export async function connectWallet() {
    ensureBrowserWallet();

    await window.ethereum.request({ method: "eth_requestAccounts" });

    const account = getAccount(config);
    if (!account.isConnected) {
        await connect(config, { connector: injectedConnector });
    }

    await ensureSepolia();

    const connected = getAccount(config);
    const signer = await getWalletClient(config);

    if (!connected.address || !signer) {
        throw new Error("Failed to obtain wallet signer/address.");
    }

    return { signer, address: connected.address };
}

export async function getConnectedAddress() {
    const account = getAccount(config);
    if (account.isConnected && account.address) {
        return account.address;
    }
    const wallet = await connectWallet();
    return wallet.address;
}

function calculateRoyaltyBps(transferCount) {
    const safeTransferCount = Math.max(1, transferCount);
    const root = Math.max(1, Math.floor(Math.sqrt(safeTransferCount)));
    return Math.floor(4000 / root);
}

let registerProductVariantCache = null;

async function detectRegisterProductVariant() {
    if (registerProductVariantCache) {
        return registerProductVariantCache;
    }

    ensureBrowserWallet();

    const runtimeCode = await window.ethereum.request({
        method: "eth_getCode",
        params: [PRODUCT_REGISTRY_ADDRESS, "latest"]
    });

    const code = String(runtimeCode || "").toLowerCase();
    if (!code || code === "0x") {
        throw new Error("ProductRegistry is not deployed at configured address.");
    }

    const currentSelector = encodeFunctionData({
        abi: PRODUCT_ABI,
        functionName: "registerProduct",
        args: [ZERO_HASH, "", "", "", ZERO_HASH, ZERO_ADDRESS, "0x", 0n, 0n]
    })
        .slice(2, 10)
        .toLowerCase();

    const legacySelector = encodeFunctionData({
        abi: LEGACY_PRODUCT_REGISTER_ABI,
        functionName: "registerProduct",
        args: [ZERO_HASH, "", "", "", 0n, 0n]
    })
        .slice(2, 10)
        .toLowerCase();

    if (code.includes(currentSelector)) {
        registerProductVariantCache = "current";
        return registerProductVariantCache;
    }

    if (code.includes(legacySelector)) {
        registerProductVariantCache = "legacy";
        return registerProductVariantCache;
    }

    registerProductVariantCache = "current";
    return registerProductVariantCache;
}

function extractRevertReason(error) {
    const candidates = [
        error?.shortMessage,
        error?.details,
        error?.message,
        error?.cause?.shortMessage,
        error?.cause?.details,
        error?.cause?.message,
        error?.data?.message,
        error?.error?.message
    ].filter(Boolean);

    for (const value of candidates) {
        const text = String(value);
        if (text.toLowerCase().includes("execution reverted")) {
            const match = text.match(/execution reverted:?\s*([^\n]+)/i);
            if (match && match[1]) {
                return match[1].trim();
            }
        }
        if (text.includes("Only verified artisans")) {
            return "Only verified artisans";
        }
        if (text.includes("Product already registered")) {
            return "Product already registered";
        }
        if (text.includes("Invalid metadata hash")) {
            return "Invalid metadata hash";
        }
        if (text.includes("Invalid signer")) {
            return "Invalid signer";
        }
    }

    return candidates[0] ? String(candidates[0]) : "Unknown error";
}

function isAbiDecodeMismatchError(error) {
    const message = String(error?.shortMessage || error?.message || "").toLowerCase();
    return (
        message.includes("not a valid boolean") ||
        message.includes("cannot decode") ||
        message.includes("bytes value") ||
        message.includes("returned no data")
    );
}

function normalizeLegacyArtisanRecord(record) {
    return {
        wallet: record?.wallet,
        name: record?.name || "",
        craft: record?.craft || "",
        giRegion: record?.giRegion || "",
        registeredAt: BigInt(record?.registeredAt || 0),
        isAadhaarVerified: Boolean(record?.aadhaarVerified),
        isFraudulent: false,
        reputationScore: 0n,
        lockedReputation: 0n,
        royaltyPenaltyBps: 0n
    };
}

function emptyArtisanRecord(address) {
    return {
        wallet: address,
        name: "",
        craft: "",
        giRegion: "",
        registeredAt: 0n,
        isAadhaarVerified: false,
        isFraudulent: false,
        reputationScore: 0n,
        lockedReputation: 0n,
        royaltyPenaltyBps: 0n
    };
}

async function getProductRegistryArtisanRegistryAddress() {
    return readContract(config, {
        address: PRODUCT_REGISTRY_ADDRESS,
        abi: [
            {
                inputs: [],
                name: "artisanRegistry",
                outputs: [{ internalType: "address", name: "", type: "address" }],
                stateMutability: "view",
                type: "function"
            }
        ],
        functionName: "artisanRegistry"
    });
}

async function isVerifiedForProductRegistry(address) {
    const linkedArtisanRegistry = await getProductRegistryArtisanRegistryAddress();
    return readContract(config, {
        address: linkedArtisanRegistry,
        abi: ARTISAN_ABI,
        functionName: "isVerifiedArtisan",
        args: [address]
    });
}

async function isProductHashAlreadyRegistered(hash) {
    try {
        await readContract(config, {
            address: PRODUCT_REGISTRY_ADDRESS,
            abi: PRODUCT_ABI,
            functionName: "verifyProduct",
            args: [hash]
        });
        return true;
    } catch (_error) {
        return false;
    }
}

async function writeWithEstimatedGas({ address, abi, functionName, args = [], value, from }) {
    ensureBrowserWallet();

    const sender = from || (await getConnectedAddress());
    const data = encodeFunctionData({ abi, functionName, args });

    const estimatePayload = {
        from: sender,
        to: address,
        data
    };

    if (typeof value !== "undefined") {
        estimatePayload.value = toHex(value);
    }

    // Preflight execution with the exact same sender/payload to surface revert reason early.
    try {
        await window.ethereum.request({
            method: "eth_call",
            params: [estimatePayload, "latest"]
        });
    } catch (callError) {
        throw new Error(extractRevertReason(callError));
    }

    const estimatedGasHex = await window.ethereum.request({
        method: "eth_estimateGas",
        params: [estimatePayload]
    });

    const estimatedGas = BigInt(estimatedGasHex);
    const gasWithBuffer = (estimatedGas * 12n) / 10n;

    return writeContract(config, {
        account: sender,
        address,
        abi,
        functionName,
        args,
        value,
        gas: gasWithBuffer
    });
}

export async function registerArtisan(name, craft, giRegion, craftScore) {
    assertConfiguredAddress(ARTISAN_REGISTRY_ADDRESS, "ARTISAN_REGISTRY_ADDRESS");

    await connectWallet();

    const txHash = await writeWithEstimatedGas({
        address: ARTISAN_REGISTRY_ADDRESS,
        abi: ARTISAN_ABI,
        functionName: "registerArtisan",
        args: [name, craft, giRegion, Number(craftScore)]
    });

    return waitForTransactionReceipt(config, { hash: txHash });
}

export async function getArtisan(address) {
    assertConfiguredAddress(ARTISAN_REGISTRY_ADDRESS, "ARTISAN_REGISTRY_ADDRESS");

    try {
        return await readContract(config, {
            address: ARTISAN_REGISTRY_ADDRESS,
            abi: ARTISAN_ABI,
            functionName: "getArtisan",
            args: [address]
        });
    } catch (error) {
        if (!isAbiDecodeMismatchError(error)) {
            throw error;
        }

        try {
            const legacyRecord = await readContract(config, {
                address: ARTISAN_REGISTRY_ADDRESS,
                abi: LEGACY_ARTISAN_READ_ABI,
                functionName: "getArtisan",
                args: [address]
            });

            return normalizeLegacyArtisanRecord(legacyRecord);
        } catch (legacyError) {
            if (!isAbiDecodeMismatchError(legacyError)) {
                throw legacyError;
            }

            return emptyArtisanRecord(address);
        }
    }
}

export async function isVerifiedArtisan(address) {
    assertConfiguredAddress(ARTISAN_REGISTRY_ADDRESS, "ARTISAN_REGISTRY_ADDRESS");

    return readContract(config, {
        address: ARTISAN_REGISTRY_ADDRESS,
        abi: ARTISAN_ABI,
        functionName: "isVerifiedArtisan",
        args: [address]
    });
}

export async function getArtisanDashboard(address) {
    const [profile, verified, penaltyBps, available] = await Promise.all([
        getArtisan(address),
        isVerifiedArtisan(address),
        readContract(config, {
            address: ARTISAN_REGISTRY_ADDRESS,
            abi: ARTISAN_ABI,
            functionName: "getRoyaltyPenaltyBps",
            args: [address]
        }),
        readContract(config, {
            address: ARTISAN_REGISTRY_ADDRESS,
            abi: ARTISAN_ABI,
            functionName: "availableReputation",
            args: [address]
        })
    ]);

    return { profile, verified: Boolean(verified), penaltyBps: Number(penaltyBps), availableReputation: Number(available) };
}

export async function markAadhaarVerified(artisanAddress) {
    assertConfiguredAddress(ARTISAN_REGISTRY_ADDRESS, "ARTISAN_REGISTRY_ADDRESS");
    await connectWallet();

    const txHash = await writeWithEstimatedGas({
        address: ARTISAN_REGISTRY_ADDRESS,
        abi: ARTISAN_ABI,
        functionName: "markAadhaarVerified",
        args: [artisanAddress]
    });

    return waitForTransactionReceipt(config, { hash: txHash });
}

export async function vouchFor(candidateAddress, stake) {
    assertConfiguredAddress(ARTISAN_REGISTRY_ADDRESS, "ARTISAN_REGISTRY_ADDRESS");
    await connectWallet();

    const txHash = await writeWithEstimatedGas({
        address: ARTISAN_REGISTRY_ADDRESS,
        abi: ARTISAN_ABI,
        functionName: "vouchFor",
        args: [candidateAddress, BigInt(stake)]
    });

    return waitForTransactionReceipt(config, { hash: txHash });
}

export async function releaseVouches(candidateAddress) {
    assertConfiguredAddress(ARTISAN_REGISTRY_ADDRESS, "ARTISAN_REGISTRY_ADDRESS");
    await connectWallet();

    const txHash = await writeWithEstimatedGas({
        address: ARTISAN_REGISTRY_ADDRESS,
        abi: ARTISAN_ABI,
        functionName: "releaseVouches",
        args: [candidateAddress]
    });

    return waitForTransactionReceipt(config, { hash: txHash });
}

export async function slashFraud(candidateAddress) {
    assertConfiguredAddress(ARTISAN_REGISTRY_ADDRESS, "ARTISAN_REGISTRY_ADDRESS");
    await connectWallet();

    const txHash = await writeWithEstimatedGas({
        address: ARTISAN_REGISTRY_ADDRESS,
        abi: ARTISAN_ABI,
        functionName: "slash",
        args: [candidateAddress]
    });

    return waitForTransactionReceipt(config, { hash: txHash });
}

export async function verifyCraftImage(file) {
    const formData = new FormData();
    formData.append("image", file);

    const response = await fetch("/api/verify-craft", {
        method: "POST",
        body: formData
    });

    const payload = await response.json();
    if (!response.ok) {
        throw new Error(payload?.detail || payload?.error || "Failed to verify craft image.");
    }

    return payload;
}

export async function mintProductTwin(recipient, tokenUri, terroirScore, provenanceCid) {
    assertConfiguredAddress(PRODUCT_NFT_ADDRESS, "PRODUCT_NFT_ADDRESS");
    await connectWallet();

    const txHash = await writeWithEstimatedGas({
        address: PRODUCT_NFT_ADDRESS,
        abi: PRODUCT_NFT_ABI,
        functionName: "mintProduct",
        args: [recipient, tokenUri, Number(terroirScore), provenanceCid]
    });

    return waitForTransactionReceipt(config, { hash: txHash });
}

export async function approveEscrowForToken(tokenId) {
    assertConfiguredAddress(PRODUCT_NFT_ADDRESS, "PRODUCT_NFT_ADDRESS");
    assertConfiguredAddress(ESCROW_MARKETPLACE_ADDRESS, "ESCROW_MARKETPLACE_ADDRESS");
    await connectWallet();

    const txHash = await writeWithEstimatedGas({
        address: PRODUCT_NFT_ADDRESS,
        abi: [
            {
                inputs: [
                    { internalType: "address", name: "to", type: "address" },
                    { internalType: "uint256", name: "tokenId", type: "uint256" }
                ],
                name: "approve",
                outputs: [],
                stateMutability: "nonpayable",
                type: "function"
            }
        ],
        functionName: "approve",
        args: [ESCROW_MARKETPLACE_ADDRESS, BigInt(tokenId)]
    });

    return waitForTransactionReceipt(config, { hash: txHash });
}

export async function createEscrowSale(tokenId, sellerAddress, saleValueEth) {
    assertConfiguredAddress(ESCROW_MARKETPLACE_ADDRESS, "ESCROW_MARKETPLACE_ADDRESS");
    await connectWallet();

    const txHash = await writeWithEstimatedGas({
        address: ESCROW_MARKETPLACE_ADDRESS,
        abi: ESCROW_MARKETPLACE_ABI,
        functionName: "createEscrow",
        args: [BigInt(tokenId), sellerAddress],
        value: parseEther(String(saleValueEth))
    });

    const receipt = await waitForTransactionReceipt(config, { hash: txHash });
    const latestEscrowId = await readContract(config, {
        address: ESCROW_MARKETPLACE_ADDRESS,
        abi: ESCROW_MARKETPLACE_ABI,
        functionName: "escrowCount"
    });

    return {
        receipt,
        escrowId: Number(latestEscrowId)
    };
}

export async function markEscrowShipped(escrowId) {
    assertConfiguredAddress(ESCROW_MARKETPLACE_ADDRESS, "ESCROW_MARKETPLACE_ADDRESS");
    await connectWallet();

    const txHash = await writeWithEstimatedGas({
        address: ESCROW_MARKETPLACE_ADDRESS,
        abi: ESCROW_MARKETPLACE_ABI,
        functionName: "markShipped",
        args: [BigInt(escrowId)]
    });

    return waitForTransactionReceipt(config, { hash: txHash });
}

export async function confirmEscrowReceived(escrowId) {
    assertConfiguredAddress(ESCROW_MARKETPLACE_ADDRESS, "ESCROW_MARKETPLACE_ADDRESS");
    await connectWallet();

    const txHash = await writeWithEstimatedGas({
        address: ESCROW_MARKETPLACE_ADDRESS,
        abi: ESCROW_MARKETPLACE_ABI,
        functionName: "confirmReceived",
        args: [BigInt(escrowId)]
    });

    return waitForTransactionReceipt(config, { hash: txHash });
}

export async function cancelEscrowExpired(escrowId) {
    assertConfiguredAddress(ESCROW_MARKETPLACE_ADDRESS, "ESCROW_MARKETPLACE_ADDRESS");
    await connectWallet();

    const txHash = await writeWithEstimatedGas({
        address: ESCROW_MARKETPLACE_ADDRESS,
        abi: ESCROW_MARKETPLACE_ABI,
        functionName: "cancelExpired",
        args: [BigInt(escrowId)]
    });

    return waitForTransactionReceipt(config, { hash: txHash });
}

export async function raiseEscrowDispute(escrowId, reason) {
    assertConfiguredAddress(ESCROW_MARKETPLACE_ADDRESS, "ESCROW_MARKETPLACE_ADDRESS");
    await connectWallet();

    const txHash = await writeWithEstimatedGas({
        address: ESCROW_MARKETPLACE_ADDRESS,
        abi: ESCROW_MARKETPLACE_ABI,
        functionName: "raiseDispute",
        args: [BigInt(escrowId), reason || "Dispute raised from app"]
    });

    return waitForTransactionReceipt(config, { hash: txHash });
}

export async function getEscrowDetails(escrowId) {
    assertConfiguredAddress(ESCROW_MARKETPLACE_ADDRESS, "ESCROW_MARKETPLACE_ADDRESS");

    const escrow = await readContract(config, {
        address: ESCROW_MARKETPLACE_ADDRESS,
        abi: ESCROW_MARKETPLACE_ABI,
        functionName: "escrows",
        args: [BigInt(escrowId)]
    });

    return {
        id: Number(escrow.id),
        tokenId: Number(escrow.tokenId),
        buyer: escrow.buyer,
        seller: escrow.seller,
        salePriceWei: escrow.salePrice,
        salePriceEth: formatEther(escrow.salePrice),
        createdAt: Number(escrow.createdAt),
        shippedAt: Number(escrow.shippedAt),
        shippingDeadline: Number(escrow.shippingDeadline),
        confirmDeadline: Number(escrow.confirmDeadline),
        status: Number(escrow.status),
        disputeReason: escrow.disputeReason
    };
}

export async function previewRoyaltySettlement(tokenId, saleValueEth) {
    assertConfiguredAddress(DYNAMIC_ROYALTY_ADDRESS, "DYNAMIC_ROYALTY_ADDRESS");

    const saleWei = parseEther(String(saleValueEth || "0"));

    const [transferId, baseRoyaltyBps, penaltyBps, artisanAmountWei, sellerAmountWei] = await readContract(config, {
        address: DYNAMIC_ROYALTY_ADDRESS,
        abi: DYNAMIC_ROYALTY_ABI,
        functionName: "previewSettlement",
        args: [BigInt(tokenId), saleWei]
    });

    return {
        transferId: Number(transferId),
        baseRoyaltyBps: Number(baseRoyaltyBps),
        penaltyBps: Number(penaltyBps),
        artisanAmountWei,
        sellerAmountWei,
        artisanAmountEth: formatEther(artisanAmountWei),
        sellerAmountEth: formatEther(sellerAmountWei)
    };
}

export async function executeSecondarySale(tokenId, sellerAddress, saleValueEth) {
    assertConfiguredAddress(DYNAMIC_ROYALTY_ADDRESS, "DYNAMIC_ROYALTY_ADDRESS");
    await connectWallet();

    const txHash = await writeWithEstimatedGas({
        address: DYNAMIC_ROYALTY_ADDRESS,
        abi: DYNAMIC_ROYALTY_ABI,
        functionName: "processSecondarySale",
        args: [BigInt(tokenId), sellerAddress],
        value: parseEther(String(saleValueEth))
    });

    return waitForTransactionReceipt(config, { hash: txHash });
}

// Legacy product registry helpers retained for backward compatibility.
export async function registerProduct(hash, cid, name, giTag, lat, lng) {
    assertConfiguredAddress(ARTISAN_REGISTRY_ADDRESS, "ARTISAN_REGISTRY_ADDRESS");
    assertConfiguredAddress(PRODUCT_REGISTRY_ADDRESS, "PRODUCT_REGISTRY_ADDRESS");

    const artisanAddress = await getConnectedAddress();
    const verified = Boolean(await isVerifiedForProductRegistry(artisanAddress));
    if (!verified) {
        throw new Error("Only verified artisans can register products on this ProductRegistry deployment.");
    }

    if (!/^0x[0-9a-fA-F]{64}$/.test(String(hash || ""))) {
        throw new Error("Invalid product hash. Expected bytes32 hex string.");
    }

    const latitude = BigInt(lat);
    const longitude = BigInt(lng);
    if (latitude < 0n || longitude < 0n) {
        throw new Error("Latitude and longitude must be positive scaled integers.");
    }

    const alreadyRegistered = await isProductHashAlreadyRegistered(hash);
    if (alreadyRegistered) {
        throw new Error("Product already registered. Use a new image/hash.");
    }

    const metadataHash = hash;
    const provenanceSigner = artisanAddress;
    const deviceSignature = "0x";

    const currentArgs = [
        hash,
        cid,
        name,
        giTag,
        metadataHash,
        provenanceSigner,
        deviceSignature,
        latitude,
        longitude
    ];

    const legacyArgs = [hash, cid, name, giTag, latitude, longitude];

    try {
        const registerProductVariant = await detectRegisterProductVariant();
        const selectedAbi = registerProductVariant === "legacy" ? LEGACY_PRODUCT_REGISTER_ABI : PRODUCT_ABI;
        const selectedArgs = registerProductVariant === "legacy" ? legacyArgs : currentArgs;

        const txHash = await writeWithEstimatedGas({
            address: PRODUCT_REGISTRY_ADDRESS,
            abi: selectedAbi,
            functionName: "registerProduct",
            args: selectedArgs,
            from: artisanAddress
        });

        return waitForTransactionReceipt(config, { hash: txHash });
    } catch (error) {
        const detail = extractRevertReason(error);
        throw new Error(
            "Validation Error: " + detail
        );
    }
}

export async function transferProduct(hash, newOwnerAddress, saleValueEth) {
    assertConfiguredAddress(PRODUCT_REGISTRY_ADDRESS, "PRODUCT_REGISTRY_ADDRESS");

    await connectWallet();

    let totalValueWei;

    if (typeof saleValueEth !== "undefined" && saleValueEth !== null && String(saleValueEth).trim() !== "") {
        totalValueWei = parseEther(String(saleValueEth));
    } else {
        const { record } = await verifyProduct(hash);
        const nextTransferCount = Number(record.transferCount) + 1;
        const royaltyBps = calculateRoyaltyBps(nextTransferCount);

        const targetRoyaltyWei = parseEther(DEFAULT_TARGET_ROYALTY_ETH);
        totalValueWei =
            royaltyBps > 0
                ? (targetRoyaltyWei * 10000n + BigInt(royaltyBps) - 1n) / BigInt(royaltyBps)
                : parseEther("0.01");
    }

    const txHash = await writeWithEstimatedGas({
        address: PRODUCT_REGISTRY_ADDRESS,
        abi: PRODUCT_ABI,
        functionName: "transferProduct",
        args: [hash, newOwnerAddress],
        value: totalValueWei
    });

    return waitForTransactionReceipt(config, { hash: txHash });
}

export async function verifyProduct(hash) {
    assertConfiguredAddress(PRODUCT_REGISTRY_ADDRESS, "PRODUCT_REGISTRY_ADDRESS");

    const [record, terroirRaw] = await readContract(config, {
        address: PRODUCT_REGISTRY_ADDRESS,
        abi: PRODUCT_ABI,
        functionName: "verifyProduct",
        args: [hash]
    });

    const terroir = Math.max(0, Math.min(100, Number(terroirRaw)));
    return { record, terroir };
}

export async function getArtisanTokenId(address) {
    assertConfiguredAddress(ARTISAN_REGISTRY_ADDRESS, "ARTISAN_REGISTRY_ADDRESS");

    const tokenId = await readContract(config, {
        address: ARTISAN_REGISTRY_ADDRESS,
        abi: [
            {
                inputs: [{ internalType: "address", name: "", type: "address" }],
                name: "artisanTokenId",
                outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
                stateMutability: "view",
                type: "function"
            }
        ],
        functionName: "artisanTokenId",
        args: [address]
    });

    return tokenId;
}
