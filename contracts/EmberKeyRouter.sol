// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";

/// @dev A Tigris (Velodrome/Solidly style) swap route.
struct Route {
    address from;
    address to;
    bool stable;
    address factory;
}

interface ITigrisRouter {
    function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, Route[] calldata routes, address to, uint256 deadline)
        external
        returns (uint256[] memory amounts);
}

interface IEmberPot {
    function keyPrice() external view returns (uint256);
    function buyKeysFor(address player, uint256 quantity) external;
}

/// @title EmberKeyRouter
/// @notice Buys Ember Pot keys on Mezo with BTC or MEZO in one transaction: it swaps the token to MUSD through the
/// token's Tigris volatile pool, buys the keys for the caller and returns any MUSD left over.
/// @dev No owner, no admin functions, no withdrawal. Only the two tokens fixed at deployment are accepted, so the
/// router never calls an arbitrary token. It holds nothing between transactions: every allowance it grants is reset
/// in the same call.
contract EmberKeyRouter {
    using SafeTransferLib for address;

    address public immutable pot;
    address public immutable musd;
    address public immutable btc;
    address public immutable mezo;
    address public immutable tigrisRouter;
    address public immutable tigrisFactory;

    uint256 private _locked = 1;

    event KeysBought(
        address indexed player, address indexed tokenIn, uint256 quantity, uint256 amountIn, uint256 musdSpent, uint256 musdRefunded
    );

    error ZeroAddress();
    error BadToken();
    error BadAmount();
    error Underfilled();
    error Reentrancy();

    constructor(address pot_, address musd_, address btc_, address mezo_, address tigrisRouter_, address tigrisFactory_) {
        if (
            pot_ == address(0) || musd_ == address(0) || btc_ == address(0) || mezo_ == address(0)
                || tigrisRouter_ == address(0) || tigrisFactory_ == address(0)
        ) revert ZeroAddress();
        pot = pot_;
        musd = musd_;
        btc = btc_;
        mezo = mezo_;
        tigrisRouter = tigrisRouter_;
        tigrisFactory = tigrisFactory_;
    }

    modifier nonReentrant() {
        if (_locked != 1) revert Reentrancy();
        _locked = 2;
        _;
        _locked = 1;
    }

    /// @param tokenIn  BTC or MEZO, the two tokens fixed at deployment.
    /// @param quantity Keys to buy (the pot enforces its own limits).
    /// @param amountIn Exactly this much of `tokenIn` is taken and swapped; it includes the caller's slippage buffer.
    /// @param deadline Unix time, forwarded to the swap.
    function buyKeys(address tokenIn, uint256 quantity, uint256 amountIn, uint256 deadline) external nonReentrant {
        if (tokenIn != btc && tokenIn != mezo) revert BadToken();
        if (amountIn == 0 || quantity == 0) revert BadAmount();

        uint256 cost = IEmberPot(pot).keyPrice() * quantity;
        uint256 before = musd.balanceOf(address(this));

        tokenIn.safeTransferFrom(msg.sender, address(this), amountIn);
        tokenIn.safeApprove(tigrisRouter, amountIn);
        Route[] memory routes = new Route[](1);
        routes[0] = Route({from: tokenIn, to: musd, stable: false, factory: tigrisFactory});
        ITigrisRouter(tigrisRouter).swapExactTokensForTokens(amountIn, cost, routes, address(this), deadline);
        tokenIn.safeApprove(tigrisRouter, 0);

        uint256 received = musd.balanceOf(address(this)) - before;
        if (received < cost) revert Underfilled();

        musd.safeApprove(pot, cost);
        IEmberPot(pot).buyKeysFor(msg.sender, quantity);
        musd.safeApprove(pot, 0);

        uint256 refund = received - cost;
        if (refund > 0) musd.safeTransfer(msg.sender, refund);

        emit KeysBought(msg.sender, tokenIn, quantity, amountIn, cost, refund);
    }
}
