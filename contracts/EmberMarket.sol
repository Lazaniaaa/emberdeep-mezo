// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";
import {Route, ITigrisRouter} from "./EmberKeyRouter.sol";

interface IERC721Like {
    function transferFrom(address from, address to, uint256 id) external payable;
}

/// @dev Something that takes the market's fee and puts it to use, such as the Ember Pot adding it to this week's prizes.
interface IFeeSink {
    function fund(uint256 amount) external;
}

/// @title EmberMarket
/// @notice A marketplace for NFTs priced in MUSD. A seller lists an item at a price; the market holds the item until
///         it is sold or the seller takes it back. A buyer pays in MUSD, or in BTC or MEZO, which the market swaps to
///         MUSD on Tigris in the same transaction. A fixed share of each sale goes to the fee sink.
/// @dev    The owner can only choose which collections may be listed; it cannot move listed items, change prices or
///         fees, or take any funds. A collection taken off the list can no longer be listed, but what is already
///         listed can still be bought or taken back. The market holds MUSD only inside a transaction.
contract EmberMarket {
    using SafeTransferLib for address;

    struct Listing {
        address seller;
        /// In MUSD (18 decimals). Zero means not listed.
        uint96 price;
        address collection;
        uint256 tokenId;
    }

    /// @notice The highest fee the market can be built with: 10%.
    uint256 public constant MAX_FEE_BPS = 1000;

    address public immutable musd;
    address public immutable btc;
    address public immutable mezo;
    address public immutable tigrisRouter;
    address public immutable tigrisFactory;
    /// @notice Where the fee goes.
    address public immutable feeSink;
    /// @notice True when the fee sink takes the fee through `fund` (the Ember Pot), false for a plain transfer.
    bool public immutable sinkFunds;
    uint256 public immutable feeBps;

    address public owner;
    address public pendingOwner;
    mapping(address collection => bool) public allowed;

    /// @notice Every open listing, in no particular order, so the market can be read without log history.
    Listing[] private _open;
    /// @notice A listing's place in `_open`, plus one. Zero means not listed.
    mapping(address collection => mapping(uint256 tokenId => uint256)) private _slot;

    uint256 private _locked = 1;

    event Listed(address indexed collection, uint256 indexed tokenId, address indexed seller, uint256 price);
    event PriceChanged(address indexed collection, uint256 indexed tokenId, uint256 price);
    event Cancelled(address indexed collection, uint256 indexed tokenId, address indexed seller);
    event Sold(
        address indexed collection, uint256 indexed tokenId, address indexed buyer, address seller, uint256 price, uint256 fee, address paidWith
    );
    event CollectionSet(address indexed collection, bool allowed);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error NotPendingOwner();
    error ZeroAddress();
    error BadFee();
    error NotAllowed();
    error BadPrice();
    error NotListed();
    error AlreadyListed();
    error NotSeller();
    error PriceAbove();
    error BadToken();
    error Underfilled();
    error Reentrancy();

    constructor(
        address musd_,
        address btc_,
        address mezo_,
        address tigrisRouter_,
        address tigrisFactory_,
        address feeSink_,
        bool sinkFunds_,
        uint256 feeBps_
    ) {
        if (
            musd_ == address(0) || btc_ == address(0) || mezo_ == address(0) || tigrisRouter_ == address(0)
                || tigrisFactory_ == address(0) || feeSink_ == address(0)
        ) revert ZeroAddress();
        if (feeBps_ > MAX_FEE_BPS) revert BadFee();
        (musd, btc, mezo, tigrisRouter, tigrisFactory) = (musd_, btc_, mezo_, tigrisRouter_, tigrisFactory_);
        (feeSink, sinkFunds, feeBps) = (feeSink_, sinkFunds_, feeBps_);
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (_locked != 1) revert Reentrancy();
        _locked = 2;
        _;
        _locked = 1;
    }

    // ── selling ────────────────────────────────────────────────────────────────────────────────────────

    /// @notice Lists an item. The seller must have approved the market for it; the market holds it from now on.
    function list(address collection, uint256 tokenId, uint96 price) external nonReentrant {
        if (!allowed[collection]) revert NotAllowed();
        if (price == 0) revert BadPrice();
        if (_slot[collection][tokenId] != 0) revert AlreadyListed();
        IERC721Like(collection).transferFrom(msg.sender, address(this), tokenId);
        _open.push(Listing(msg.sender, price, collection, tokenId));
        _slot[collection][tokenId] = _open.length;
        emit Listed(collection, tokenId, msg.sender, price);
    }

    function setPrice(address collection, uint256 tokenId, uint96 price) external {
        Listing storage l = _listing(collection, tokenId);
        if (l.seller != msg.sender) revert NotSeller();
        if (price == 0) revert BadPrice();
        l.price = price;
        emit PriceChanged(collection, tokenId, price);
    }

    /// @notice Takes a listed item back. Always possible for its seller, whatever the owner does.
    function cancel(address collection, uint256 tokenId) external nonReentrant {
        Listing memory l = _listing(collection, tokenId);
        if (l.seller != msg.sender) revert NotSeller();
        _remove(collection, tokenId);
        IERC721Like(collection).transferFrom(address(this), msg.sender, tokenId);
        emit Cancelled(collection, tokenId, msg.sender);
    }

    // ── buying ─────────────────────────────────────────────────────────────────────────────────────────

    /// @notice Buys a listed item with MUSD. `maxPrice` guards against the seller raising the price first.
    function buy(address collection, uint256 tokenId, uint256 maxPrice) external nonReentrant {
        Listing memory l = _listing(collection, tokenId);
        if (l.price > maxPrice) revert PriceAbove();
        musd.safeTransferFrom(msg.sender, address(this), l.price);
        _settle(l, musd);
    }

    /// @notice Buys a listed item with BTC or MEZO: swaps exactly `amountIn` to MUSD through the token's Tigris
    ///         volatile pool, pays the price and returns the MUSD left over.
    /// @param amountIn Includes the buyer's slippage buffer.
    /// @param deadline Unix time, forwarded to the swap.
    function buyWith(address tokenIn, address collection, uint256 tokenId, uint256 maxPrice, uint256 amountIn, uint256 deadline)
        external
        nonReentrant
    {
        if (tokenIn != btc && tokenIn != mezo) revert BadToken();
        Listing memory l = _listing(collection, tokenId);
        if (l.price > maxPrice) revert PriceAbove();

        uint256 before = musd.balanceOf(address(this));
        tokenIn.safeTransferFrom(msg.sender, address(this), amountIn);
        tokenIn.safeApprove(tigrisRouter, amountIn);
        Route[] memory routes = new Route[](1);
        routes[0] = Route({from: tokenIn, to: musd, stable: false, factory: tigrisFactory});
        ITigrisRouter(tigrisRouter).swapExactTokensForTokens(amountIn, l.price, routes, address(this), deadline);
        tokenIn.safeApprove(tigrisRouter, 0);
        uint256 received = musd.balanceOf(address(this)) - before;
        if (received < l.price) revert Underfilled();

        _settle(l, tokenIn);
        if (received > l.price) musd.safeTransfer(msg.sender, received - l.price);
    }

    /// @dev The market holds `l.price` MUSD for this sale: pays the fee and the seller, then hands over the item.
    function _settle(Listing memory l, address paidWith) private {
        _remove(l.collection, l.tokenId);
        uint256 fee = (uint256(l.price) * feeBps) / 10_000;
        if (fee > 0) {
            if (sinkFunds) {
                musd.safeApprove(feeSink, fee);
                IFeeSink(feeSink).fund(fee);
                musd.safeApprove(feeSink, 0);
            } else {
                musd.safeTransfer(feeSink, fee);
            }
        }
        musd.safeTransfer(l.seller, l.price - fee);
        IERC721Like(l.collection).transferFrom(address(this), msg.sender, l.tokenId);
        emit Sold(l.collection, l.tokenId, msg.sender, l.seller, l.price, fee, paidWith);
    }

    // ── views ──────────────────────────────────────────────────────────────────────────────────────────

    /// @notice The listing of an item. Reverts if it is not listed.
    function listingOf(address collection, uint256 tokenId) external view returns (Listing memory) {
        return _listing(collection, tokenId);
    }

    function openCount() external view returns (uint256) {
        return _open.length;
    }

    /// @notice Up to `count` open listings from `start`, for the market page.
    function openListings(uint256 start, uint256 count) external view returns (Listing[] memory out) {
        uint256 end = _open.length;
        if (start > end) start = end;
        if (count < end - start) end = start + count;
        out = new Listing[](end - start);
        for (uint256 i = start; i < end; ++i) out[i - start] = _open[i];
    }

    function _listing(address collection, uint256 tokenId) private view returns (Listing storage) {
        uint256 slot = _slot[collection][tokenId];
        if (slot == 0) revert NotListed();
        return _open[slot - 1];
    }

    function _remove(address collection, uint256 tokenId) private {
        uint256 index = _slot[collection][tokenId] - 1;
        uint256 last = _open.length - 1;
        if (index != last) {
            Listing memory moved = _open[last];
            _open[index] = moved;
            _slot[moved.collection][moved.tokenId] = index + 1;
        }
        _open.pop();
        delete _slot[collection][tokenId];
    }

    // ── administration ─────────────────────────────────────────────────────────────────────────────────

    /// @notice Allows (or stops) new listings from a collection.
    function setCollection(address collection, bool value) external onlyOwner {
        if (collection == address(0)) revert ZeroAddress();
        allowed[collection] = value;
        emit CollectionSet(collection, value);
    }

    /// @notice Starts handing the market to `newOwner`, who must accept. Passing zero cancels a pending handover.
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
