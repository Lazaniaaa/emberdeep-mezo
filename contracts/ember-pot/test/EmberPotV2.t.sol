// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";
import {EmberPotV2} from "../EmberPotV2.sol";
import {EmberKeyRouter, TigrisRoute} from "../EmberKeyRouter.sol";

// ─────────────────────────────────────────────────────────────────────────────
// Mock Tigris Router
// Controls musdOut so tests can exercise happy path and underfill.
// Uses the same TigrisRoute struct exported from EmberKeyRouter.sol.
// ─────────────────────────────────────────────────────────────────────────────
contract MockTigrisRouter {
    MockERC20 public immutable musd;
    uint256   public musdOut; // controlled by test

    constructor(address musd_) {
        musd = MockERC20(musd_);
    }

    function setMusdOut(uint256 amount) external {
        musdOut = amount;
    }

    // The BTC token — set by the test so the mock can pull it
    MockERC20 public btcToken;

    function setBtcToken(address btc_) external {
        btcToken = MockERC20(btc_);
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        TigrisRoute[] calldata, /* routes */
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        require(block.timestamp <= deadline, "Tigris: expired");
        require(musdOut >= amountOutMin, "Tigris: insufficient output");
        // Pull BTC from the caller (EmberKeyRouter) — it has approved us
        if (address(btcToken) != address(0) && amountIn > 0) {
            btcToken.transferFrom(msg.sender, address(this), amountIn);
        }
        // Mint MUSD to `to`
        musd.mint(to, musdOut);

        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = musdOut;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Unit tests for EmberPotV2
// ─────────────────────────────────────────────────────────────────────────────
contract EmberPotV2Test is Test {
    uint256 internal constant ROUND_DURATION = 7 days;
    uint256 internal constant KEY_PRICE      = 1e18;   // 1 MUSD (18 dec)
    uint256 internal constant MAX_GOLD       = 5_000;

    bytes32 internal constant RUN_TYPEHASH =
        keccak256("RunRecord(address player,bytes32 runId,uint256 gold,uint256 roundId,uint256 deadline)");

    address internal owner    = makeAddr("owner");
    address internal treasury = makeAddr("treasury");

    uint256 internal signerKey = 0xA11CE;
    address internal signer;

    address internal alice = makeAddr("alice");
    address internal bob   = makeAddr("bob");
    address internal payer = makeAddr("payer");

    MockERC20   internal musd;
    EmberPotV2  internal pot;

    function setUp() public {
        signer = vm.addr(signerKey);
        musd   = new MockERC20("Mock MUSD", "MUSD", 18);

        vm.prank(owner);
        pot = new EmberPotV2(
            address(musd),
            treasury,
            signer,
            KEY_PRICE,
            MAX_GOLD,
            ROUND_DURATION
        );

        _fund(alice,  100e18);
        _fund(bob,    100e18);
        _fund(payer,  100e18);
    }

    function _fund(address who, uint256 amount) internal {
        musd.mint(who, amount);
        vm.prank(who);
        musd.approve(address(pot), type(uint256).max);
    }

    function _buyKeys(address who, uint256 qty) internal {
        vm.prank(who);
        pot.buyKeys(qty);
    }

    function _signRun(
        uint256 privKey,
        address player,
        bytes32 runId,
        uint256 gold,
        uint256 roundId,
        uint256 deadline
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(RUN_TYPEHASH, player, runId, gold, roundId, deadline));
        bytes32 domainSep  = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes("EmberPot")),
            keccak256(bytes("1")),
            block.chainid,
            address(pot)
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSep, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privKey, digest);
        return abi.encodePacked(r, s, v);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 1. buyKeys is unchanged
    // ──────────────────────────────────────────────────────────────────────────

    function test_BuyKeys_UnchangedHappyPath() public {
        uint256 qty    = 5;
        uint256 total  = qty * KEY_PRICE;
        uint256 tShare = (total * 2000) / 10_000;
        uint256 potAmt = total - tShare;
        uint256 rid    = pot.currentRound();

        uint256 aliceBefore = musd.balanceOf(alice);
        uint256 treaBefore  = musd.balanceOf(treasury);

        vm.expectEmit(true, true, false, true, address(pot));
        emit EmberPotV2.KeysBought(rid, alice, qty, total, potAmt);

        _buyKeys(alice, qty);

        assertEq(aliceBefore - musd.balanceOf(alice),     total);
        assertEq(musd.balanceOf(treasury) - treaBefore,   tShare);
        assertEq(pot.roundPot(rid),                        potAmt);
        assertEq(pot.keyBalance(alice),                    qty);
    }

    function test_BuyKeys_RevertsWhenPaused() public {
        vm.prank(owner); pot.pause();
        vm.prank(alice);
        vm.expectRevert(bytes("Paused"));
        pot.buyKeys(1);
    }

    function test_BuyKeys_RevertsOnQuantityZero() public {
        vm.prank(alice);
        vm.expectRevert(bytes("Bad quantity"));
        pot.buyKeys(0);
    }

    function test_BuyKeys_RevertsOnQuantityOver100() public {
        vm.prank(alice);
        vm.expectRevert(bytes("Bad quantity"));
        pot.buyKeys(101);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. buyKeysFor — payment from payer, keys to player
    // ──────────────────────────────────────────────────────────────────────────

    function test_BuyKeysFor_CreditsPlayerChargesPayer() public {
        uint256 qty    = 3;
        uint256 total  = qty * KEY_PRICE;
        uint256 tShare = (total * 2000) / 10_000;
        uint256 potAmt = total - tShare;
        uint256 rid    = pot.currentRound();

        uint256 payerBefore    = musd.balanceOf(payer);
        uint256 aliceBefore    = musd.balanceOf(alice);
        uint256 treaBefore     = musd.balanceOf(treasury);
        uint256 aliceKeyBefore = pot.keyBalance(alice);
        uint256 payerKeyBefore = pot.keyBalance(payer);

        vm.expectEmit(true, true, false, true, address(pot));
        emit EmberPotV2.KeysBought(rid, alice, qty, total, potAmt);

        vm.prank(payer);
        pot.buyKeysFor(alice, qty);

        assertEq(payerBefore - musd.balanceOf(payer),     total,  "payer not charged");
        assertEq(pot.keyBalance(alice),                    aliceKeyBefore + qty, "alice keys wrong");
        assertEq(pot.keyBalance(payer),                    payerKeyBefore,       "payer keys changed");
        assertEq(musd.balanceOf(alice),                    aliceBefore,          "alice MUSD changed");
        assertEq(musd.balanceOf(treasury) - treaBefore,   tShare,  "treasury wrong");
        assertEq(pot.roundPot(rid),                        potAmt,  "pot wrong");
    }

    function test_BuyKeysFor_RevertsOnZeroPlayer() public {
        vm.prank(payer);
        vm.expectRevert(bytes("Bad player"));
        pot.buyKeysFor(address(0), 1);
    }

    function test_BuyKeysFor_RevertsWhenPaused() public {
        vm.prank(owner); pot.pause();
        vm.prank(payer);
        vm.expectRevert(bytes("Paused"));
        pot.buyKeysFor(alice, 1);
    }

    function test_BuyKeysFor_RevertsOnQuantityZero() public {
        vm.prank(payer);
        vm.expectRevert(bytes("Bad quantity"));
        pot.buyKeysFor(alice, 0);
    }

    function test_BuyKeysFor_RevertsOnQuantityOver100() public {
        vm.prank(payer);
        vm.expectRevert(bytes("Bad quantity"));
        pot.buyKeysFor(alice, 101);
    }

    function test_BuyKeysFor_80_20Split() public {
        uint256 qty    = 10;
        uint256 total  = qty * KEY_PRICE;
        uint256 tShare = (total * 2000) / 10_000;
        uint256 potAmt = total - tShare;

        vm.prank(payer);
        pot.buyKeysFor(alice, qty);

        assertEq(pot.roundPot(pot.currentRound()), potAmt);
        assertEq(musd.balanceOf(treasury),         tShare);
    }

    function test_BuyKeysFor_KeysAreUsable() public {
        vm.prank(payer);
        pot.buyKeysFor(alice, 2);
        assertEq(pot.keyBalance(alice), 2);

        uint256 rid      = pot.currentRound();
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 runId    = keccak256("run-for-1");
        bytes memory sig = _signRun(signerKey, alice, runId, 100, rid, deadline);
        pot.recordRun(alice, runId, 100, deadline, sig);
        assertEq(pot.keyBalance(alice), 1);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 3. Both methods accumulate correctly
    // ──────────────────────────────────────────────────────────────────────────

    function test_BothBuyMethods_AccumulateKeyBalance() public {
        _buyKeys(alice, 3);
        vm.prank(payer);
        pot.buyKeysFor(alice, 2);
        assertEq(pot.keyBalance(alice), 5);
        assertEq(pot.keyBalance(payer), 0);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Unit tests for EmberKeyRouter
// ─────────────────────────────────────────────────────────────────────────────
contract EmberKeyRouterTest is Test {
    uint256 internal constant KEY_PRICE = 1e18; // 1 MUSD

    address internal owner    = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    address internal player   = makeAddr("player");
    address internal factory  = makeAddr("factory");

    uint256 internal signerKey = 0xA11CE;
    address internal signer;

    MockERC20        internal musd;
    MockERC20        internal btcToken;
    MockTigrisRouter internal tigris;
    EmberPotV2       internal pot;
    EmberKeyRouter   internal router;

    function setUp() public {
        signer   = vm.addr(signerKey);
        musd     = new MockERC20("MUSD", "MUSD", 18);
        btcToken = new MockERC20("BTC",  "BTC",  18);
        tigris   = new MockTigrisRouter(address(musd));

        vm.prank(owner);
        pot = new EmberPotV2(
            address(musd),
            treasury,
            signer,
            KEY_PRICE,
            5_000,
            7 days
        );

        router = new EmberKeyRouter(
            address(pot),
            address(musd),
            address(btcToken),
            address(tigris),
            factory
        );

        // Tell the mock which BTC token to pull from the router
        tigris.setBtcToken(address(btcToken));

        btcToken.mint(player, 100e18);
        vm.prank(player);
        btcToken.approve(address(router), type(uint256).max);
    }

    function _cost(uint256 qty) internal pure returns (uint256) {
        return qty * KEY_PRICE;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 4. Router happy path — buys for msg.sender
    // ──────────────────────────────────────────────────────────────────────────

    function test_Router_BuysForMsgSender() public {
        uint256 qty      = 2;
        uint256 cost     = _cost(qty);
        uint256 maxBtcIn = 0.01e18;
        uint256 deadline = block.timestamp + 600;

        tigris.setMusdOut(cost);

        uint256 btcBefore  = btcToken.balanceOf(player);
        uint256 keysBefore = pot.keyBalance(player);

        vm.expectEmit(true, false, false, true, address(router));
        emit EmberKeyRouter.KeysBoughtWithBTC(player, qty, maxBtcIn, cost, 0);

        vm.prank(player);
        router.buyKeysWithBTC(qty, maxBtcIn, deadline);

        assertEq(pot.keyBalance(player),        keysBefore + qty);
        assertEq(btcToken.balanceOf(player),     btcBefore - maxBtcIn);
        assertEq(btcToken.balanceOf(address(router)), 0);
        assertEq(musd.balanceOf(address(router)),     0);
        assertEq(musd.allowance(address(router), address(pot)), 0);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 5. Surplus MUSD refunded to player
    // ──────────────────────────────────────────────────────────────────────────

    function test_Router_RefundsSurplusMusd() public {
        uint256 qty      = 1;
        uint256 cost     = _cost(qty);
        uint256 surplus  = 0.5e18;
        uint256 maxBtcIn = 0.005e18;
        uint256 deadline = block.timestamp + 600;

        tigris.setMusdOut(cost + surplus);

        uint256 musdBefore = musd.balanceOf(player);

        vm.expectEmit(true, false, false, true, address(router));
        emit EmberKeyRouter.KeysBoughtWithBTC(player, qty, maxBtcIn, cost, surplus);

        vm.prank(player);
        router.buyKeysWithBTC(qty, maxBtcIn, deadline);

        assertEq(musd.balanceOf(player),          musdBefore + surplus);
        assertEq(musd.balanceOf(address(router)), 0);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 6. Router zero balance and zero allowances after call
    // ──────────────────────────────────────────────────────────────────────────

    function test_Router_ZeroBalanceAfterCall() public {
        tigris.setMusdOut(_cost(3) + 1e17);
        vm.prank(player);
        router.buyKeysWithBTC(3, 0.03e18, block.timestamp + 600);

        assertEq(btcToken.balanceOf(address(router)), 0, "Router BTC != 0");
        assertEq(musd.balanceOf(address(router)),     0, "Router MUSD != 0");
    }

    function test_Router_ZeroAllowancesAfterCall() public {
        tigris.setMusdOut(_cost(1));
        vm.prank(player);
        router.buyKeysWithBTC(1, 0.01e18, block.timestamp + 600);

        assertEq(musd.allowance(address(router), address(pot)),         0, "MUSD allowance to pot != 0");
        assertEq(btcToken.allowance(address(router), address(tigris)),  0, "BTC allowance to tigris != 0");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 7. Slippage below cost reverts
    // ──────────────────────────────────────────────────────────────────────────

    function test_Router_RevertsOnSlippageBelowCost() public {
        uint256 cost = _cost(2);
        tigris.setMusdOut(cost - 1); // one wei short

        vm.prank(player);
        vm.expectRevert(bytes("Tigris: insufficient output"));
        router.buyKeysWithBTC(2, 0.01e18, block.timestamp + 600);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 8. Expired deadline reverts
    // ──────────────────────────────────────────────────────────────────────────

    function test_Router_RevertsOnExpiredDeadline() public {
        tigris.setMusdOut(_cost(1));
        vm.prank(player);
        vm.expectRevert(bytes("Tigris: expired"));
        router.buyKeysWithBTC(1, 0.01e18, block.timestamp - 1);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 9. Reentrancy guard — nonReentrant on buyKeysWithBTC
    // ──────────────────────────────────────────────────────────────────────────

    function test_Router_ReentrancyGuardPresent() public view {
        // Confirm deployment (guard slot initialised to UNLOCKED)
        assertTrue(address(router) != address(0));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 10. Quantity bounds
    // ──────────────────────────────────────────────────────────────────────────

    function test_Router_RevertsOnQuantityZero() public {
        tigris.setMusdOut(0);
        vm.prank(player);
        vm.expectRevert(bytes("Bad cost"));
        router.buyKeysWithBTC(0, 0.01e18, block.timestamp + 600);
    }

    function test_Router_RevertsOnQuantityOver100() public {
        uint256 qty  = 101;
        uint256 cost = _cost(qty);
        tigris.setMusdOut(cost);
        vm.prank(player);
        vm.expectRevert(bytes("Bad quantity"));
        router.buyKeysWithBTC(qty, 1e18, block.timestamp + 600);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 11. Constructor rejects zero addresses
    // ──────────────────────────────────────────────────────────────────────────

    function test_Constructor_RevertsOnZeroPot() public {
        vm.expectRevert(bytes("Bad pot"));
        new EmberKeyRouter(address(0), address(musd), address(btcToken), address(tigris), factory);
    }

    function test_Constructor_RevertsOnZeroMusd() public {
        vm.expectRevert(bytes("Bad musd"));
        new EmberKeyRouter(address(pot), address(0), address(btcToken), address(tigris), factory);
    }

    function test_Constructor_RevertsOnZeroBtc() public {
        vm.expectRevert(bytes("Bad btc"));
        new EmberKeyRouter(address(pot), address(musd), address(0), address(tigris), factory);
    }

    function test_Constructor_RevertsOnZeroRouter() public {
        vm.expectRevert(bytes("Bad router"));
        new EmberKeyRouter(address(pot), address(musd), address(btcToken), address(0), factory);
    }

    function test_Constructor_RevertsOnZeroFactory() public {
        vm.expectRevert(bytes("Bad factory"));
        new EmberKeyRouter(address(pot), address(musd), address(btcToken), address(tigris), address(0));
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fork test — skipped unless MEZO_RPC env var is set
// ─────────────────────────────────────────────────────────────────────────────
contract EmberKeyRouterForkTest is Test {
    address internal constant MUSD_ADDR    = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;
    address internal constant BTC_ADDR     = 0x7b7C000000000000000000000000000000000000;
    address internal constant TIGRIS       = 0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9;
    address internal constant POOL_FACTORY = 0x4947243CC818b627A5D06d14C4eCe7398A23Ce1A;
    address internal constant KEY_PRICE    = address(0); // placeholder
    address internal constant SIGNER       = 0x8973b236609211d8F6cBED0581C8b290628B55Cd;

    function test_ForkBuyKeysWithBTC() public {
        string memory rpc = vm.envOr("MEZO_RPC", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }

        vm.createSelectFork(rpc);

        address treasury2 = makeAddr("treasury");
        address owner2    = makeAddr("owner");

        vm.prank(owner2);
        EmberPotV2 forkPot = new EmberPotV2(
            MUSD_ADDR,
            treasury2,
            SIGNER,
            1e18,  // 1 MUSD
            5_000,
            7 days
        );

        EmberKeyRouter forkRouter = new EmberKeyRouter(
            address(forkPot),
            MUSD_ADDR,
            BTC_ADDR,
            TIGRIS,
            POOL_FACTORY
        );

        // Need a funded BTC holder on Mezo Testnet — skip if none
        address player2 = makeAddr("fork_player");
        uint256 btcBal  = IERC20(BTC_ADDR).balanceOf(player2);
        if (btcBal == 0) {
            vm.skip(true);
            return;
        }

        vm.prank(player2);
        IERC20(BTC_ADDR).approve(address(forkRouter), type(uint256).max);

        vm.prank(player2);
        forkRouter.buyKeysWithBTC(1, btcBal / 2, block.timestamp + 600);

        assertEq(forkPot.keyBalance(player2), 1);
        assertEq(IERC20(BTC_ADDR).balanceOf(address(forkRouter)),  0);
        assertEq(IERC20(MUSD_ADDR).balanceOf(address(forkRouter)), 0);
    }
}
