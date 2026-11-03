// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC721} from "solady/tokens/ERC721.sol";
import {EIP712} from "solady/utils/EIP712.sol";
import {ECDSA} from "solady/utils/ECDSA.sol";
import {LibString} from "solady/utils/LibString.sol";

/// @title Emberdeep Items
/// @notice Items found in the deep, as NFTs: each one has a kind (which weapon it is), a rarity and a seed that gives
///         it its own look. An item drops in a descent: the game's server replays the descent move by move, and only
///         then signs the drop, so an item cannot be minted for a run that did not find it. Anyone may submit the
///         signed drop (the player, or the server paying the gas); it is minted to the player it was signed for, once.
/// @dev    The contract does not know what a kind or a rarity means; the game does. Besides signed drops, the owner can
///         name minters (for example a case-opening contract), so the same collection serves other ways of finding
///         items. The contract holds no funds and makes no external calls. Solady's ERC721 marks its transfer and
///         approve functions payable; the contract has no way to send out what is sent to them, so never attach value.
contract EmberItems is ERC721, EIP712 {
    using LibString for uint256;

    /// @notice One item as stored on chain. Fits one storage slot.
    struct Item {
        uint16 kind;
        uint8 rarity;
        uint64 seed;
    }

    /// @notice A drop the game's server signed after replaying the descent that found it.
    struct Drop {
        address player;
        /// The descent that found the item. A descent drops at most one item, so a runId mints once.
        bytes32 runId;
        uint16 kind;
        uint8 rarity;
        uint64 seed;
        /// Unix time after which the signature is no longer accepted.
        uint64 deadline;
    }

    bytes32 public constant DROP_TYPEHASH =
        keccak256("Drop(address player,bytes32 runId,uint16 kind,uint8 rarity,uint64 seed,uint64 deadline)");

    address public owner;
    address public pendingOwner;
    /// @notice The game's attestation key. Never zero.
    address public signer;
    bool public paused;
    /// @notice Items minted so far. Token ids run from 1 to this number.
    uint256 public totalMinted;
    string public baseURI;

    mapping(uint256 id => Item) private _items;
    /// @notice Whether a descent's drop has been minted already.
    mapping(bytes32 runId => bool) public dropped;
    /// @notice Contracts or keys the owner allows to mint items directly.
    mapping(address account => bool) public isMinter;

    event ItemMinted(address indexed to, uint256 indexed id, uint16 kind, uint8 rarity, uint64 seed, bytes32 indexed runId);
    event SignerChanged(address indexed previousSigner, address indexed newSigner);
    event MinterSet(address indexed account, bool allowed);
    event BaseURISet(string baseURI);
    event PausedSet(bool paused);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error NotPendingOwner();
    error NotMinter();
    error ZeroAddress();
    error IsPaused();
    error Expired();
    error AlreadyDropped();
    error BadSignature();

    constructor(address initialSigner, string memory baseURI_) {
        if (initialSigner == address(0)) revert ZeroAddress();
        owner = msg.sender;
        signer = initialSigner;
        baseURI = baseURI_;
        emit OwnershipTransferred(address(0), msg.sender);
        emit SignerChanged(address(0), initialSigner);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ── minting ────────────────────────────────────────────────────────────────────────────────────────

    /// @notice Mints a signed drop to `d.player`. The signature covers the player, so a signature seen in the
    ///         mempool can only mint to that same player, once.
    function claimDrop(Drop calldata d, bytes calldata signature) external returns (uint256 id) {
        if (paused) revert IsPaused();
        if (block.timestamp > d.deadline) revert Expired();
        if (dropped[d.runId]) revert AlreadyDropped();
        if (d.player == address(0)) revert ZeroAddress();

        // tryRecover returns zero for a malformed signature; the signer is never zero, so that fails below too.
        address recovered = ECDSA.tryRecoverCalldata(_hashTypedData(_structHash(d)), signature);
        if (recovered == address(0) || recovered != signer) revert BadSignature();

        dropped[d.runId] = true;
        id = _mintItem(d.player, Item(d.kind, d.rarity, d.seed), d.runId);
    }

    /// @notice Mints an item for a minter the owner allowed, such as a case-opening contract.
    function mint(address to, uint16 kind, uint8 rarity, uint64 seed) external returns (uint256 id) {
        if (!isMinter[msg.sender]) revert NotMinter();
        if (paused) revert IsPaused();
        if (to == address(0)) revert ZeroAddress();
        id = _mintItem(to, Item(kind, rarity, seed), bytes32(0));
    }

    function _mintItem(address to, Item memory item, bytes32 runId) private returns (uint256 id) {
        id = ++totalMinted;
        _items[id] = item;
        _mint(to, id);
        emit ItemMinted(to, id, item.kind, item.rarity, item.seed, runId);
    }

    // ── views ──────────────────────────────────────────────────────────────────────────────────────────

    function name() public pure override returns (string memory) {
        return "Emberdeep Items";
    }

    function symbol() public pure override returns (string memory) {
        return "EMBERITEM";
    }

    /// @notice The item's metadata lives at the base URI followed by the token id.
    function tokenURI(uint256 id) public view override returns (string memory) {
        if (!_exists(id)) revert TokenDoesNotExist();
        return string.concat(baseURI, id.toString());
    }

    /// @notice What an item is. Reverts for an id that was never minted.
    function itemOf(uint256 id) external view returns (Item memory) {
        if (!_exists(id)) revert TokenDoesNotExist();
        return _items[id];
    }

    /// @notice The items `account` holds among token ids `fromId` to `fromId + count - 1`, so the game can show a
    ///         player's weapons with plain calls instead of log history. Page through `totalMinted` in steps.
    function itemsOwnedBy(address account, uint256 fromId, uint256 count)
        external
        view
        returns (uint256[] memory ids, Item[] memory found)
    {
        uint256 end = totalMinted + 1;
        if (fromId == 0) fromId = 1;
        if (fromId > end) fromId = end;
        if (count < end - fromId) end = fromId + count;
        uint256 n;
        for (uint256 id = fromId; id < end; ++id) if (_ownerOf(id) == account) ++n;
        ids = new uint256[](n);
        found = new Item[](n);
        n = 0;
        for (uint256 id = fromId; id < end; ++id) {
            if (_ownerOf(id) == account) {
                ids[n] = id;
                found[n++] = _items[id];
            }
        }
    }

    /// @notice The EIP-712 digest the signer signs for a drop, for off-chain checks.
    function digest(Drop calldata d) external view returns (bytes32) {
        return _hashTypedData(_structHash(d));
    }

    function _structHash(Drop calldata d) private pure returns (bytes32) {
        return keccak256(abi.encode(DROP_TYPEHASH, d.player, d.runId, d.kind, d.rarity, d.seed, d.deadline));
    }

    function _domainNameAndVersion() internal pure override returns (string memory, string memory) {
        return ("Emberdeep Items", "1");
    }

    // ── administration ─────────────────────────────────────────────────────────────────────────────────

    /// @notice Replaces the attestation key, for example when the server's key is rotated.
    function setSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert ZeroAddress();
        emit SignerChanged(signer, newSigner);
        signer = newSigner;
    }

    function setMinter(address account, bool allowed) external onlyOwner {
        isMinter[account] = allowed;
        emit MinterSet(account, allowed);
    }

    function setBaseURI(string calldata value) external onlyOwner {
        baseURI = value;
        emit BaseURISet(value);
    }

    /// @notice Stops (or resumes) new mints. Items already minted stay transferable.
    function setPaused(bool value) external onlyOwner {
        paused = value;
        emit PausedSet(value);
    }

    /// @notice Starts handing the collection to `newOwner`, who must accept. Passing zero cancels a pending handover.
    function transferOwnership(address newOwner) external onlyOwner {
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }
}
