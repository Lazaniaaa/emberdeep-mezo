// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// ── Tigris Route struct (Velodrome/Solidly style) ─────────────────────────────
struct TigrisRoute {
    address from;
    address to;
    bool    stable;
    address factory;
}

// ── Minimal Tigris Router interface ───────────────────────────────────────────
interface ITigrisRouter {
    function swapExactTokensForTokens(
        uint256             amountIn,
        uint256             amountOutMin,
        TigrisRoute[] calldata routes,
        address             to,
        uint256             deadline
    ) external returns (uint256[] memory amounts);
}

// ── Minimal EmberPotV2 interface ──────────────────────────────────────────────
interface IEmberPotV2 {
    function keyPrice()                                   external view returns (uint256);
    function buyKeysFor(address player, uint256 quantity) external;
}

/**
 * EmberKeyRouter — trustless single-tx BTC→keys flow for EmberPotV2 on Mezo Testnet.
 *
 * Call sequence (all in one tx from the player's wallet):
 *   1. Player approves exactly `maxBtcIn` of BTC ERC-20 to this router.
 *   2. Player calls buyKeysWithBTC(quantity, maxBtcIn, deadline).
 *   3. Router pulls `maxBtcIn` BTC from msg.sender.
 *   4. Router approves `maxBtcIn` BTC to the Tigris router.
 *   5. Router calls swapExactTokensForTokens(maxBtcIn, cost, route, address(this), deadline)
 *      where cost = pot.keyPrice() * quantity. Reverts if swap yields < cost MUSD.
 *   6. Router resets BTC allowance to Tigris router to 0.
 *   7. Router approves exactly `cost` MUSD to the pot.
 *   8. Router calls pot.buyKeysFor(msg.sender, quantity).
 *   9. Router resets MUSD allowance to pot to 0.
 *  10. Router sends all surplus MUSD to msg.sender.
 *  11. Emits KeysBoughtWithBTC(player, quantity, btcIn, musdSpent, musdRefunded).
 *
 * The router holds no persistent balance and has no owner, admin, or withdrawal functions.
 */
contract EmberKeyRouter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Immutables ────────────────────────────────────────────────────────────

    IEmberPotV2   public immutable pot;
    IERC20        public immutable musd;
    IERC20        public immutable btc;
    ITigrisRouter public immutable tigrisRouter;
    address       public immutable tigrisFactory;

    // ── Event ─────────────────────────────────────────────────────────────────

    event KeysBoughtWithBTC(
        address indexed player,
        uint256         quantity,
        uint256         btcIn,
        uint256         musdSpent,
        uint256         musdRefunded
    );

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(
        address pot_,
        address musd_,
        address btc_,
        address tigrisRouter_,
        address tigrisFactory_
    ) {
        require(pot_           != address(0), "Bad pot");
        require(musd_          != address(0), "Bad musd");
        require(btc_           != address(0), "Bad btc");
        require(tigrisRouter_  != address(0), "Bad router");
        require(tigrisFactory_ != address(0), "Bad factory");

        pot           = IEmberPotV2(pot_);
        musd          = IERC20(musd_);
        btc           = IERC20(btc_);
        tigrisRouter  = ITigrisRouter(tigrisRouter_);
        tigrisFactory = tigrisFactory_;
    }

    // ── Main entry point ──────────────────────────────────────────────────────

    /**
     * @param quantity   Number of keys to buy (1–100, enforced by the pot).
     * @param maxBtcIn   Exact BTC amount the player sends (includes their slippage buffer).
     * @param deadline   Unix timestamp; forwarded to the Tigris swap.
     */
    function buyKeysWithBTC(
        uint256 quantity,
        uint256 maxBtcIn,
        uint256 deadline
    ) external nonReentrant {
        require(maxBtcIn > 0, "Bad btcIn");
        address player = msg.sender;

        // ── 1. Compute MUSD cost ──────────────────────────────────────────────
        uint256 cost = pot.keyPrice() * quantity;
        require(cost > 0, "Bad cost");

        // ── 2. Pull BTC from player ───────────────────────────────────────────
        btc.safeTransferFrom(player, address(this), maxBtcIn);

        // ── 3. Approve BTC to Tigris router ──────────────────────────────────
        btc.forceApprove(address(tigrisRouter), maxBtcIn);

        // ── 4. Swap BTC → MUSD via Tigris ─────────────────────────────────────
        TigrisRoute[] memory routes = new TigrisRoute[](1);
        routes[0] = TigrisRoute({
            from:    address(btc),
            to:      address(musd),
            stable:  false,
            factory: tigrisFactory
        });

        // amountOutMin = cost: revert if swap yields less MUSD than the purchase needs
        tigrisRouter.swapExactTokensForTokens(maxBtcIn, cost, routes, address(this), deadline);

        // ── 5. Reset BTC allowance (all consumed by swap, but belt-and-suspenders) ──
        btc.forceApprove(address(tigrisRouter), 0);

        // ── 6. Verify MUSD received ───────────────────────────────────────────
        uint256 musdBalance = musd.balanceOf(address(this));
        require(musdBalance >= cost, "Swap underfilled");

        // ── 7. Approve exactly cost MUSD to the pot ──────────────────────────
        musd.forceApprove(address(pot), cost);

        // ── 8. Buy keys for the player ────────────────────────────────────────
        pot.buyKeysFor(player, quantity);

        // ── 9. Reset MUSD allowance to pot ───────────────────────────────────
        musd.forceApprove(address(pot), 0);

        // ── 10. Return surplus MUSD to player ────────────────────────────────
        uint256 musdLeft = musd.balanceOf(address(this));
        if (musdLeft > 0) {
            musd.safeTransfer(player, musdLeft);
        }

        emit KeysBoughtWithBTC(player, quantity, maxBtcIn, cost, musdLeft);
    }
}
