// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";
import {EmberPot} from "../EmberPot.sol";

// ---------------------------------------------------------------------------
// Reject-transfer mock: a standalone ERC-20 where transfer() can be toggled
// to return false, so that EmberPot._tryTransfer falls back to claimable.
// Does NOT inherit MockERC20 (transfer is not virtual there).
// ---------------------------------------------------------------------------
contract MockERC20Reject {
    string  public name     = "Reject USDC";
    string  public symbol   = "rUSDC";
    uint8   public decimals = 6;

    bool public rejectTransfers;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function setRejectTransfers(bool v) external {
        rejectTransfers = v;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        if (rejectTransfers) return false;
        require(balanceOf[msg.sender] >= amount, "ERC20: insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "ERC20: insufficient balance");
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "ERC20: insufficient allowance");
            allowance[from][msg.sender] = allowed - amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }
}

// ---------------------------------------------------------------------------
// Main test contract
// ---------------------------------------------------------------------------
contract EmberPotTest is Test {
    // ── constants ──────────────────────────────────────────────────────────
    uint256 internal constant ROUND_DURATION = 7 days;
    uint256 internal constant SETTLE_GRACE   = 7 days;
    uint256 internal constant SWEEP_DELAY    = 30 days;
    uint256 internal constant KEY_PRICE      = 100_000;   // 0.10 USDC (6 dec)
    uint256 internal constant MAX_GOLD       = 5_000;

    bytes32 internal constant RUN_TYPEHASH =
        keccak256("RunRecord(address player,bytes32 runId,uint256 gold,uint256 roundId,uint256 deadline)");

    // ── actors ─────────────────────────────────────────────────────────────
    address internal owner    = makeAddr("owner");
    address internal treasury = makeAddr("treasury");

    uint256 internal signerAKey = 0xA11CE;
    address internal signerA;

    uint256 internal signerBKey = 0xB0B;
    address internal signerB;

    address internal alice = makeAddr("alice");
    address internal bob   = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal dave  = makeAddr("dave");
    address internal eve   = makeAddr("eve");

    // ── contracts ──────────────────────────────────────────────────────────
    MockERC20    internal usdc;
    EmberPot     internal pot;

    // ── setup ──────────────────────────────────────────────────────────────
    function setUp() public {
        signerA = vm.addr(signerAKey);
        signerB = vm.addr(signerBKey);

        usdc = new MockERC20("Mock USDC", "mUSDC", 6);

        vm.prank(owner);
        pot = new EmberPot(
            address(usdc),
            treasury,
            signerA,
            KEY_PRICE,
            MAX_GOLD,
            7 days
        );

        // Fund players with USDC and approve the pot
        _fund(alice, 10_000_000);
        _fund(bob,   10_000_000);
        _fund(carol, 10_000_000);
        _fund(dave,  10_000_000);
        _fund(eve,   10_000_000);
    }

    // ── internal helpers ──────────────────────────────────────────────────

    /// Mint `amount` USDC to `who` and approve the pot contract.
    function _fund(address who, uint256 amount) internal {
        usdc.mint(who, amount);
        vm.prank(who);
        usdc.approve(address(pot), type(uint256).max);
    }

    /// Build and sign an EIP-712 RunRecord struct.
    function _signRun(
        uint256 privKey,
        address player,
        bytes32 runId,
        uint256 gold,
        uint256 roundId,
        uint256 deadline
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(RUN_TYPEHASH, player, runId, gold, roundId, deadline)
        );
        bytes32 domainSep = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256(bytes("EmberPot")),
                keccak256(bytes("1")),
                block.chainid,
                address(pot)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSep, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privKey, digest);
        return abi.encodePacked(r, s, v);
    }

    /// Buy `qty` keys for `who` in the current round.
    function _buyKeys(address who, uint256 qty) internal {
        vm.prank(who);
        pot.buyKeys(qty);
    }

    /// Record a run for `player` with a fresh runId derived from `salt`.
    function _recordRun(
        address player,
        bytes32 salt,
        uint256 gold,
        uint256 privKey
    ) internal {
        uint256 rid      = pot.currentRound();
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signRun(privKey, player, salt, gold, rid, deadline);
        pot.recordRun(player, salt, gold, deadline, sig);
    }

    /// Advance time to just after the end of `roundId`.
    function _endRound(uint256 roundId) internal {
        vm.warp(pot.roundEnd(roundId) + 1);
    }

    // =========================================================
    //  SECTION 1 — Deployment & Initialisation
    // =========================================================

    function test_Constructor_SetsImmutables() public view {
        assertEq(address(pot.usdc()),       address(usdc));
        assertEq(pot.treasury(),            treasury);
        assertEq(pot.keyPrice(),            KEY_PRICE);
        assertEq(pot.maxGoldPerRun(),       MAX_GOLD);
        assertEq(pot.signerOf(0),           signerA);
        assertEq(pot.currentRound(),        0);
        assertFalse(pot.paused());
    }

    function test_Constructor_RevertsOnBadUsdc() public {
        vm.expectRevert(bytes("Bad USDC"));
        new EmberPot(address(0xdead), treasury, signerA, KEY_PRICE, MAX_GOLD, 7 days);
    }

    function test_Constructor_RevertsOnBadTreasury() public {
        vm.expectRevert(bytes("Bad treasury"));
        new EmberPot(address(usdc), address(0), signerA, KEY_PRICE, MAX_GOLD, 7 days);
    }

    function test_Constructor_RevertsOnBadSigner() public {
        vm.expectRevert(bytes("Bad signer"));
        new EmberPot(address(usdc), treasury, address(0), KEY_PRICE, MAX_GOLD, 7 days);
    }

    function test_Constructor_RevertsOnZeroKeyPrice() public {
        vm.expectRevert(bytes("Bad keyPrice"));
        new EmberPot(address(usdc), treasury, signerA, 0, MAX_GOLD, 7 days);
    }

    function test_Constructor_RevertsOnZeroMaxGold() public {
        vm.expectRevert(bytes("Bad maxGold"));
        new EmberPot(address(usdc), treasury, signerA, KEY_PRICE, 0, 7 days);
    }

    function test_Constructor_RevertsOnRoundTooShort() public {
        vm.expectRevert(bytes("Round too short"));
        new EmberPot(address(usdc), treasury, signerA, KEY_PRICE, MAX_GOLD, 4 minutes);
    }

    // =========================================================
    //  SECTION 2 — buyKeys
    // =========================================================

    function test_BuyKeys_HappyPath() public {
        uint256 qty        = 5;
        uint256 totalCost  = qty * KEY_PRICE;
        uint256 tShare     = (totalCost * 2000) / 10_000;
        uint256 potAmt     = totalCost - tShare;
        uint256 rid        = pot.currentRound();

        uint256 aliceBefore    = usdc.balanceOf(alice);
        uint256 treaBefore     = usdc.balanceOf(treasury);
        uint256 contractBefore = usdc.balanceOf(address(pot));

        vm.expectEmit(true, true, false, true, address(pot));
        emit EmberPot.KeysBought(rid, alice, qty, totalCost, potAmt);

        _buyKeys(alice, qty);

        assertEq(usdc.balanceOf(alice),        aliceBefore    - totalCost);
        assertEq(usdc.balanceOf(treasury),     treaBefore     + tShare);
        assertEq(usdc.balanceOf(address(pot)), contractBefore + potAmt);
        assertEq(pot.roundPot(rid),            potAmt);
        assertEq(pot.keyBalance(alice),        qty);
    }

    function test_BuyKeys_PotShare80PercentTreasury20Percent() public {
        _buyKeys(alice, 10);
        uint256 totalCost = 10 * KEY_PRICE;
        uint256 tShare    = (totalCost * 2000) / 10_000;
        uint256 potAmt    = totalCost - tShare;
        assertEq(pot.roundPot(pot.currentRound()), potAmt);
        assertEq(usdc.balanceOf(treasury), tShare);
    }

    function test_BuyKeys_RevertsWhenPaused() public {
        vm.prank(owner);
        pot.pause();
        vm.prank(alice);
        vm.expectRevert(bytes("Paused"));
        pot.buyKeys(1);
    }

    function test_BuyKeys_RevertsOnZeroQuantity() public {
        vm.prank(alice);
        vm.expectRevert(bytes("Bad quantity"));
        pot.buyKeys(0);
    }

    function test_BuyKeys_RevertsOnQuantityOver100() public {
        vm.prank(alice);
        vm.expectRevert(bytes("Bad quantity"));
        pot.buyKeys(101);
    }

    function test_BuyKeys_AccumulatesAcrossMultipleBuys() public {
        _buyKeys(alice, 3);
        _buyKeys(alice, 7);
        assertEq(pot.keyBalance(alice), 10);
    }

    // =========================================================
    //  SECTION 3 — recordRun
    // =========================================================

    // 3-a. Required test #1: run without a key is rejected
    function test_RecordRun_RevertsWithNoKeys() public {
        // alice has zero keys — must revert "No key"
        uint256 rid      = pot.currentRound();
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 runId    = keccak256("run-1");
        bytes memory sig = _signRun(signerAKey, alice, runId, 100, rid, deadline);

        vm.expectRevert(bytes("No key"));
        pot.recordRun(alice, runId, 100, deadline, sig);
    }

    // 3-b. Required test #1 (part 2): key consumed, second run rejected
    function test_RecordRun_RevertsAfterKeyConsumed() public {
        _buyKeys(alice, 1);
        _recordRun(alice, keccak256("run-1"), 100, signerAKey);

        // Second run — different runId but no key left
        uint256 rid      = pot.currentRound();
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 runId2   = keccak256("run-2");
        bytes memory sig = _signRun(signerAKey, alice, runId2, 100, rid, deadline);

        vm.expectRevert(bytes("No key"));
        pot.recordRun(alice, runId2, 100, deadline, sig);
    }

    // 3-c. Required test #2: one key, one run — verify state
    function test_RecordRun_OneKeyOneRun_StateCorrect() public {
        uint256 gold = 100;
        _buyKeys(alice, 1);
        _recordRun(alice, keccak256("run-A"), gold, signerAKey);

        uint256 rid = pot.currentRound();
        assertEq(pot.goldOf(rid, alice),  gold);
        assertEq(pot.totalGold(rid),      gold);
        assertEq(pot.keyBalance(alice),   0);   // key was consumed
    }

    // 3-d. Required test #3: gold above cap rejected
    function test_RecordRun_RevertsOnGoldAboveCap() public {
        _buyKeys(alice, 1);
        uint256 rid      = pot.currentRound();
        uint256 deadline = block.timestamp + 1 hours;
        uint256 badGold  = MAX_GOLD + 1;
        bytes32 runId    = keccak256("run-over");
        bytes memory sig = _signRun(signerAKey, alice, runId, badGold, rid, deadline);

        vm.expectRevert(bytes("Bad gold"));
        pot.recordRun(alice, runId, badGold, deadline, sig);
    }

    // 3-e. Required test #3: gold = 0 rejected
    function test_RecordRun_RevertsOnZeroGold() public {
        _buyKeys(alice, 1);
        uint256 rid      = pot.currentRound();
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 runId    = keccak256("run-zero");
        bytes memory sig = _signRun(signerAKey, alice, runId, 0, rid, deadline);

        vm.expectRevert(bytes("Bad gold"));
        pot.recordRun(alice, runId, 0, deadline, sig);
    }

    // 3-f. Required test #4: replayed runId rejected
    function test_RecordRun_RevertsOnReplayedRunId() public {
        _buyKeys(alice, 2);
        bytes32 runId = keccak256("run-replay");
        _recordRun(alice, runId, 100, signerAKey);

        // Attempt replay with same runId (new sig + new deadline — still deduped)
        uint256 rid      = pot.currentRound();
        uint256 deadline = block.timestamp + 2 hours;
        bytes memory sig = _signRun(signerAKey, alice, runId, 100, rid, deadline);

        vm.expectRevert(bytes("Run already recorded"));
        pot.recordRun(alice, runId, 100, deadline, sig);
    }

    // 3-g. Required test #5: expired signature rejected
    function test_RecordRun_RevertsOnExpiredDeadline() public {
        _buyKeys(alice, 1);
        uint256 rid      = pot.currentRound();
        uint256 deadline = block.timestamp - 1;     // already expired
        bytes32 runId    = keccak256("run-expired");
        bytes memory sig = _signRun(signerAKey, alice, runId, 100, rid, deadline);

        vm.expectRevert(bytes("Expired"));
        pot.recordRun(alice, runId, 100, deadline, sig);
    }

    // 3-h. Additional: bad private key → "Bad signature"
    function test_RecordRun_RevertsOnWrongSigner() public {
        _buyKeys(alice, 1);
        uint256 rid      = pot.currentRound();
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 runId    = keccak256("run-bad-sig");
        // Sign with signerB's key — not the registered signer
        bytes memory sig = _signRun(signerBKey, alice, runId, 100, rid, deadline);

        vm.expectRevert(bytes("Bad signature"));
        pot.recordRun(alice, runId, 100, deadline, sig);
    }

    // 3-i. EmitEvent on successful recordRun
    function test_RecordRun_EmitsRunRecorded() public {
        _buyKeys(alice, 1);
        uint256 rid      = pot.currentRound();
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 runId    = keccak256("run-emit");
        uint256 gold     = 500;
        bytes memory sig = _signRun(signerAKey, alice, runId, gold, rid, deadline);

        vm.expectEmit(true, true, true, true, address(pot));
        emit EmberPot.RunRecorded(rid, alice, runId, gold);
        pot.recordRun(alice, runId, gold, deadline, sig);
    }

    // =========================================================
    //  SECTION 3b — New key-balance tests (keys never expire)
    // =========================================================

    // Keys bought in round N can be used in round N+3
    function test_KeyBalance_KeysBoughtInRoundNUsableInRoundNPlus3() public {
        // Buy 2 keys in round 0
        _buyKeys(alice, 2);
        assertEq(pot.keyBalance(alice), 2);

        // Advance 3 full rounds
        vm.warp(pot.launchTime() + 3 * ROUND_DURATION + 1);
        assertEq(pot.currentRound(), 3);

        // Keys are still there — keyBalance is not round-scoped
        assertEq(pot.keyBalance(alice), 2);

        // Record a run in round 3 using the keys from round 0
        _recordRun(alice, keccak256("run-r3-a"), 100, signerAKey);
        assertEq(pot.keyBalance(alice), 1);

        _recordRun(alice, keccak256("run-r3-b"), 200, signerAKey);
        assertEq(pot.keyBalance(alice), 0);

        assertEq(pot.goldOf(3, alice), 300);
    }

    // A run with keyBalance == 0 is rejected
    function test_KeyBalance_ZeroBalanceRejected() public {
        assertEq(pot.keyBalance(alice), 0);

        uint256 rid      = pot.currentRound();
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 runId    = keccak256("run-zero-balance");
        bytes memory sig = _signRun(signerAKey, alice, runId, 100, rid, deadline);

        vm.expectRevert(bytes("No key"));
        pot.recordRun(alice, runId, 100, deadline, sig);
    }

    // Each recorded run lowers keyBalance by exactly 1 and emits KeyUsed
    function test_KeyBalance_EachRunDecrementsAndEmitsKeyUsed() public {
        _buyKeys(alice, 3);
        assertEq(pot.keyBalance(alice), 3);

        for (uint256 i = 0; i < 3; i++) {
            bytes32 runId    = keccak256(abi.encode("run-dec", i));
            uint256 rid      = pot.currentRound();
            uint256 deadline = block.timestamp + 1 hours;
            uint256 expected = 3 - i - 1;

            bytes memory sig = _signRun(signerAKey, alice, runId, 100, rid, deadline);

            vm.expectEmit(true, true, false, true, address(pot));
            emit EmberPot.KeyUsed(alice, runId, expected);

            pot.recordRun(alice, runId, 100, deadline, sig);
            assertEq(pot.keyBalance(alice), expected);
        }
    }

    // Buying in round N still adds 80% to roundPot[N] (not roundPot[N+k])
    function test_KeyBalance_BuyInRoundNAdds80PctToRoundNPot() public {
        uint256 rid = pot.currentRound(); // 0
        assertEq(rid, 0);

        uint256 qty       = 5;
        uint256 totalCost = qty * KEY_PRICE;
        uint256 potAmt    = totalCost - (totalCost * 2000) / 10_000;

        _buyKeys(alice, qty);

        // The pot is in round 0, not any future round
        assertEq(pot.roundPot(0), potAmt);
        assertEq(pot.roundPot(1), 0);

        // Advance to round 2 and buy more — those go into round 2
        vm.warp(pot.launchTime() + 2 * ROUND_DURATION + 1);
        _buyKeys(bob, 3);

        uint256 potAmt2 = 3 * KEY_PRICE - (3 * KEY_PRICE * 2000) / 10_000;
        assertEq(pot.roundPot(0), potAmt);   // unchanged
        assertEq(pot.roundPot(2), potAmt2);  // round 2 gets bob's pot
    }

    // The same runId cannot be recorded in a later round even with a new valid signature
    function test_KeyBalance_RunIdGloballyDeduped() public {
        _buyKeys(alice, 1);
        bytes32 runId = keccak256("global-runid");

        // Record in round 0
        _recordRun(alice, runId, 100, signerAKey);

        // Advance to round 1; set a concrete timestamp so deadline math is unambiguous
        uint256 t1 = pot.launchTime() + ROUND_DURATION + 1;
        vm.warp(t1);
        assertEq(pot.currentRound(), 1);

        // Buy another key in round 1
        _buyKeys(alice, 1);

        // Attempt to replay the same runId in round 1 with a fresh, valid signature.
        // deadline is well in the future so "Expired" is never the revert reason.
        uint256 rid1     = pot.currentRound();                // 1
        uint256 deadline = t1 + 1 days;                       // unambiguously in the future
        bytes memory sig = _signRun(signerAKey, alice, runId, 100, rid1, deadline);

        vm.expectRevert(bytes("Run already recorded"));
        pot.recordRun(alice, runId, 100, deadline, sig);
    }

    // =========================================================
    //  SECTION 4 — setSigner (round-boundary key rotation)
    // =========================================================

    // Required test #6: signer set mid-round; signerB cannot sign for round 0
    function test_SetSigner_NewSignerIneffectiveInCurrentRound() public {
        // Round 0 is active; owner queues signerB (effective round 1)
        vm.prank(owner);
        pot.setSigner(signerB);

        _buyKeys(alice, 2);
        uint256 rid      = pot.currentRound(); // still 0
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 runId    = keccak256("run-sigB-round0");

        // signerB sig for round 0 must fail
        bytes memory sigB = _signRun(signerBKey, alice, runId, 100, rid, deadline);
        vm.expectRevert(bytes("Bad signature"));
        pot.recordRun(alice, runId, 100, deadline, sigB);

        // signerA sig for round 0 still works
        bytes memory sigA = _signRun(signerAKey, alice, runId, 100, rid, deadline);
        pot.recordRun(alice, runId, 100, deadline, sigA);
    }

    // signerB is effective in round 1
    function test_SetSigner_NewSignerEffectiveInNextRound() public {
        vm.prank(owner);
        pot.setSigner(signerB);

        // Advance to round 1
        vm.warp(pot.launchTime() + ROUND_DURATION + 1);

        _buyKeys(alice, 1);
        uint256 rid      = pot.currentRound(); // 1
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 runId    = keccak256("run-sigB-round1");

        // signerA must now fail in round 1
        bytes memory sigA = _signRun(signerAKey, alice, runId, 100, rid, deadline);
        vm.expectRevert(bytes("Bad signature"));
        pot.recordRun(alice, runId, 100, deadline, sigA);

        // signerB succeeds
        bytes memory sigB = _signRun(signerBKey, alice, runId, 100, rid, deadline);
        pot.recordRun(alice, runId, 100, deadline, sigB);
    }

    function test_SetSigner_EmitsSignerQueued() public {
        uint256 expectedRound = pot.currentRound() + 1;
        vm.startPrank(owner);
        vm.expectEmit(true, false, false, true, address(pot));
        emit EmberPot.SignerQueued(signerB, expectedRound);
        pot.setSigner(signerB);
        vm.stopPrank();
    }

    function test_SetSigner_RevertsForNonOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        pot.setSigner(signerB);
    }

    function test_SetSigner_RevertsOnZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(bytes("Bad signer"));
        pot.setSigner(address(0));
    }

    // =========================================================
    //  SECTION 5 — distribute
    // =========================================================

    // Required test #7: formula with several players
    function test_Distribute_FormulaCorrect() public {
        // alice: 2 keys, 1000 gold — bob: 3 keys, 2000 gold — carol: 1 key, 500 gold
        _buyKeys(alice, 2);
        _buyKeys(bob,   3);
        _buyKeys(carol, 1);

        _recordRun(alice, keccak256("a1"), 1000, signerAKey);
        _recordRun(bob,   keccak256("b1"), 2000, signerAKey);
        _recordRun(carol, keccak256("c1"),  500, signerAKey);

        uint256 rid     = pot.currentRound();
        uint256 pot_    = pot.roundPot(rid);
        uint256 tg      = pot.totalGold(rid); // 3500

        _endRound(rid);

        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 bobBefore   = usdc.balanceOf(bob);
        uint256 carolBefore = usdc.balanceOf(carol);

        address[] memory players = new address[](3);
        players[0] = alice;
        players[1] = bob;
        players[2] = carol;
        pot.distribute(rid, players);

        uint256 expAlice = (pot_ * 1000) / tg;
        uint256 expBob   = (pot_ * 2000) / tg;
        uint256 expCarol = (pot_ * 500)  / tg;

        assertEq(usdc.balanceOf(alice) - aliceBefore, expAlice);
        assertEq(usdc.balanceOf(bob)   - bobBefore,   expBob);
        assertEq(usdc.balanceOf(carol) - carolBefore, expCarol);

        // Sum of payouts ≤ pot (rounding dust stays)
        assertLe(expAlice + expBob + expCarol, pot_);
    }

    // Required test #8: batched distribute — no player paid twice
    function test_Distribute_NoDuplicatePayments() public {
        // 4 players, each 1 key, 1000 gold
        address[4] memory players4 = [alice, bob, carol, dave];
        for (uint256 i; i < 4; i++) {
            _buyKeys(players4[i], 1);
            _recordRun(players4[i], keccak256(abi.encode("run", i)), 1000, signerAKey);
        }

        uint256 rid = pot.currentRound();
        _endRound(rid);

        uint256[4] memory before;
        for (uint256 i; i < 4; i++) before[i] = usdc.balanceOf(players4[i]);

        // Batch 1: alice, bob
        address[] memory batch1 = new address[](2);
        batch1[0] = alice;
        batch1[1] = bob;
        pot.distribute(rid, batch1);

        // Batch 2: alice (repeat), carol, dave
        address[] memory batch2 = new address[](3);
        batch2[0] = alice; // already paid — must be skipped
        batch2[1] = carol;
        batch2[2] = dave;
        pot.distribute(rid, batch2);

        // Alice received exactly one payment
        uint256 pot_    = pot.roundPot(rid);
        uint256 tg      = pot.totalGold(rid);
        uint256 expEach = (pot_ * 1000) / tg;

        assertEq(usdc.balanceOf(alice) - before[0], expEach);
        assertEq(usdc.balanceOf(carol) - before[2], expEach);
        assertEq(usdc.balanceOf(dave)  - before[3], expEach);
    }

    // Required test #9: zero-gold round rolls pot to current
    function test_Distribute_ZeroGoldRollover() public {
        // Someone buys keys (pot fills) but records no runs
        _buyKeys(alice, 5);

        uint256 rid0 = pot.currentRound(); // 0
        uint256 pot0 = pot.roundPot(rid0);

        _endRound(rid0);

        // Advance to round 1 so currentRound() == 1
        // (already done by _endRound which warps past round end)
        uint256 curRound = pot.currentRound();
        uint256 curBefore = pot.roundPot(curRound);

        vm.expectEmit(true, false, false, true, address(pot));
        emit EmberPot.ZeroGoldRollover(rid0, curRound, pot0);

        address[] memory empty = new address[](0);
        pot.distribute(rid0, empty);

        assertEq(pot.roundPot(rid0),          0);
        assertEq(pot.roundPot(curRound),      curBefore + pot0);
    }

    function test_Distribute_ZeroGoldRollover_CannotRepeat() public {
        _buyKeys(alice, 1);
        uint256 rid0 = pot.currentRound();
        _endRound(rid0);

        address[] memory empty = new address[](0);
        pot.distribute(rid0, empty);

        vm.expectRevert(bytes("Already rolled over"));
        pot.distribute(rid0, empty);
    }

    function test_Distribute_RevertsIfRoundNotEnded() public {
        _buyKeys(alice, 1);
        _recordRun(alice, keccak256("r1"), 100, signerAKey);
        uint256 rid = pot.currentRound();

        address[] memory players = new address[](1);
        players[0] = alice;
        vm.expectRevert(bytes("Round not ended"));
        pot.distribute(rid, players);
    }

    function test_Distribute_RevertsOnBatchTooLarge() public {
        // Build a 201-element array
        _buyKeys(alice, 1);
        _recordRun(alice, keccak256("r1"), 100, signerAKey);
        uint256 rid = pot.currentRound();
        _endRound(rid);

        address[] memory big = new address[](201);
        vm.expectRevert(bytes("Batch too large"));
        pot.distribute(rid, big);
    }

    function test_Distribute_RevertsOnSweptRound() public {
        _buyKeys(alice, 1);
        _recordRun(alice, keccak256("r1"), 100, signerAKey);
        uint256 rid = pot.currentRound();
        _endRound(rid);

        // Warp past sweep delay and sweep
        vm.warp(pot.roundEnd(rid) + SWEEP_DELAY + 1);
        pot.sweep(rid);

        address[] memory players = new address[](1);
        players[0] = alice;
        vm.expectRevert(bytes("Swept"));
        pot.distribute(rid, players);
    }

    function test_Distribute_EmitsDistributed() public {
        _buyKeys(alice, 1);
        _recordRun(alice, keccak256("r1"), 100, signerAKey);
        uint256 rid  = pot.currentRound();
        uint256 pot_ = pot.roundPot(rid);

        _endRound(rid);

        address[] memory players = new address[](1);
        players[0] = alice;

        vm.expectEmit(true, true, false, true, address(pot));
        emit EmberPot.Distributed(rid, alice, pot_); // 100 % gold = full pot
        pot.distribute(rid, players);
    }

    // =========================================================
    //  SECTION 6 — claim (including failed-transfer path)
    // =========================================================

    function test_Claim_AfterSuccessfulDistribute_NothingToClaim() public {
        _buyKeys(alice, 1);
        _recordRun(alice, keccak256("r1"), 100, signerAKey);
        uint256 rid = pot.currentRound();
        _endRound(rid);

        address[] memory players = new address[](1);
        players[0] = alice;
        pot.distribute(rid, players);

        // USDC transferred directly; claimable should be 0
        assertEq(pot.claimable(rid, alice), 0);
    }

    function test_Claim_FailedTransferCreatesClaimable() public {
        // Deploy a reject-mock and a fresh pot against it
        MockERC20Reject rUsdc = new MockERC20Reject();

        vm.prank(owner);
        EmberPot rPot = new EmberPot(
            address(rUsdc),
            treasury,
            signerA,
            KEY_PRICE,
            MAX_GOLD,
            7 days
        );

        rUsdc.mint(alice, 10_000_000);
        vm.prank(alice);
        rUsdc.approve(address(rPot), type(uint256).max);

        // Buy key and record run
        vm.prank(alice);
        rPot.buyKeys(1);

        uint256 rid      = rPot.currentRound();
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 runId    = keccak256("rr1");

        // Build domain with rPot address
        bytes32 structHash = keccak256(
            abi.encode(RUN_TYPEHASH, alice, runId, uint256(100), rid, deadline)
        );
        bytes32 domainSep = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("EmberPot")),
                keccak256(bytes("1")),
                block.chainid,
                address(rPot)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSep, structHash));
        (uint8 v, bytes32 r_, bytes32 s_) = vm.sign(signerAKey, digest);
        bytes memory sig = abi.encodePacked(r_, s_, v);

        rPot.recordRun(alice, runId, 100, deadline, sig);

        vm.warp(rPot.roundEnd(rid) + 1);

        // Enable transfer rejection right before distribute
        rUsdc.setRejectTransfers(true);

        address[] memory players = new address[](1);
        players[0] = alice;
        rPot.distribute(rid, players);

        uint256 pot_     = rPot.roundPot(rid);
        assertGt(pot_, 0);
        assertEq(rPot.claimable(rid, alice), pot_);

        // Now re-enable transfers and claim
        rUsdc.setRejectTransfers(false);
        uint256 aliceBefore = rUsdc.balanceOf(alice);

        vm.prank(alice);
        rPot.claim(rid);

        assertEq(rUsdc.balanceOf(alice), aliceBefore + pot_);
        assertEq(rPot.claimable(rid, alice), 0);
    }

    function test_Claim_RevertsOnNothingToClaim() public {
        uint256 rid = pot.currentRound();
        vm.prank(alice);
        vm.expectRevert(bytes("Nothing to claim"));
        pot.claim(rid);
    }

    function test_Claim_EmitsClaimed() public {
        // Use reject mock to force claimable path
        MockERC20Reject rUsdc = new MockERC20Reject();
        vm.prank(owner);
        EmberPot rPot = new EmberPot(
            address(rUsdc),
            treasury,
            signerA,
            KEY_PRICE,
            MAX_GOLD,
            7 days
        );
        rUsdc.mint(alice, 10_000_000);
        vm.prank(alice);
        rUsdc.approve(address(rPot), type(uint256).max);
        vm.prank(alice);
        rPot.buyKeys(1);

        uint256 rid      = rPot.currentRound();
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 runId    = keccak256("claim-emit");
        bytes32 structHash = keccak256(
            abi.encode(RUN_TYPEHASH, alice, runId, uint256(100), rid, deadline)
        );
        bytes32 domainSep = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("EmberPot")),
                keccak256(bytes("1")),
                block.chainid,
                address(rPot)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSep, structHash));
        (uint8 v, bytes32 r_, bytes32 s_) = vm.sign(signerAKey, digest);
        rPot.recordRun(alice, runId, 100, deadline, abi.encodePacked(r_, s_, v));

        vm.warp(rPot.roundEnd(rid) + 1);
        rUsdc.setRejectTransfers(true);

        address[] memory players = new address[](1);
        players[0] = alice;
        rPot.distribute(rid, players);

        uint256 pot_ = rPot.roundPot(rid);
        rUsdc.setRejectTransfers(false);

        vm.expectEmit(true, true, false, true, address(rPot));
        emit EmberPot.Claimed(rid, alice, pot_);

        vm.prank(alice);
        rPot.claim(rid);
    }

    // =========================================================
    //  SECTION 7 — rollover
    // =========================================================

    function test_Rollover_SucceedsAfterGrace_ZeroGoldRound() public {
        _buyKeys(alice, 3);
        uint256 rid0 = pot.currentRound();
        uint256 pot0 = pot.roundPot(rid0);

        // Warp past round end + SETTLE_GRACE
        vm.warp(pot.roundEnd(rid0) + SETTLE_GRACE + 1);

        uint256 cur      = pot.currentRound();
        uint256 curBefore = pot.roundPot(cur);

        vm.expectEmit(true, false, false, true, address(pot));
        emit EmberPot.Rollover(rid0, cur, pot0);
        pot.rollover(rid0);

        assertEq(pot.roundPot(rid0), 0);
        assertEq(pot.roundPot(cur),  curBefore + pot0);
        assertTrue(pot.zeroGoldRolledOver(rid0));
    }

    function test_Rollover_RevertsBeforeGrace() public {
        _buyKeys(alice, 1);
        uint256 rid0 = pot.currentRound();
        // Warp just past round end but before grace expires
        vm.warp(pot.roundEnd(rid0) + 1);

        vm.expectRevert(bytes("Grace active"));
        pot.rollover(rid0);
    }

    function test_Rollover_RevertsIfRoundHasGold() public {
        _buyKeys(alice, 1);
        _recordRun(alice, keccak256("r1"), 100, signerAKey);
        uint256 rid = pot.currentRound();
        vm.warp(pot.roundEnd(rid) + SETTLE_GRACE + 1);

        vm.expectRevert(bytes("Has gold"));
        pot.rollover(rid);
    }

    function test_Rollover_RevertsIfAlreadyRolledOver() public {
        _buyKeys(alice, 1);
        uint256 rid0 = pot.currentRound();
        vm.warp(pot.roundEnd(rid0) + SETTLE_GRACE + 1);
        pot.rollover(rid0);

        vm.expectRevert(bytes("Already rolled over"));
        pot.rollover(rid0);
    }

    // =========================================================
    //  SECTION 8 — sweep
    // =========================================================

    function test_Sweep_MovesRemainingDustToCurrentRound() public {
        _buyKeys(alice, 2);
        _buyKeys(bob,   1);
        _recordRun(alice, keccak256("a1"), 3000, signerAKey);
        _recordRun(bob,   keccak256("b1"), 2000, signerAKey);

        uint256 rid = pot.currentRound();
        uint256 pot_ = pot.roundPot(rid);
        _endRound(rid);

        // Distribute only to alice (bob's share becomes dust/unclaimed)
        address[] memory players = new address[](1);
        players[0] = alice;
        pot.distribute(rid, players);

        // Warp past sweep delay
        vm.warp(pot.roundEnd(rid) + SWEEP_DELAY + 1);

        uint256 cur      = pot.currentRound();
        uint256 curBefore = pot.roundPot(cur);
        uint256 dist     = pot.totalDistributed(rid);
        uint256 expected = pot_ - dist;

        vm.expectEmit(true, false, false, true, address(pot));
        emit EmberPot.Swept(rid, cur, expected);
        pot.sweep(rid);

        assertEq(pot.roundPot(cur), curBefore + expected);
        assertTrue(pot.swept(rid));
    }

    function test_Sweep_RevertsBeforeSweepDelay() public {
        _buyKeys(alice, 1);
        _recordRun(alice, keccak256("r1"), 100, signerAKey);
        uint256 rid = pot.currentRound();
        _endRound(rid);

        // Warp to just before sweep delay
        vm.warp(pot.roundEnd(rid) + SWEEP_DELAY - 1);
        vm.expectRevert(bytes("Too early"));
        pot.sweep(rid);
    }

    function test_Sweep_RevertsOnZeroGoldRound() public {
        _buyKeys(alice, 1);
        uint256 rid = pot.currentRound();
        vm.warp(pot.roundEnd(rid) + SWEEP_DELAY + 1);

        vm.expectRevert(bytes("No gold round, use rollover"));
        pot.sweep(rid);
    }

    function test_Sweep_RevertsIfAlreadySwept() public {
        _buyKeys(alice, 1);
        _recordRun(alice, keccak256("r1"), 100, signerAKey);
        uint256 rid = pot.currentRound();
        vm.warp(pot.roundEnd(rid) + SWEEP_DELAY + 1);
        pot.sweep(rid);

        vm.expectRevert(bytes("Already swept"));
        pot.sweep(rid);
    }

    // =========================================================
    //  SECTION 9 — Owner-only admin (pause/unpause/setKeyPrice)
    // =========================================================

    function test_Pause_OwnerCanPause() public {
        vm.prank(owner);
        vm.expectEmit(false, false, false, false, address(pot));
        emit EmberPot.Paused();
        pot.pause();
        assertTrue(pot.paused());
    }

    function test_Pause_RevertsForNonOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        pot.pause();
    }

    function test_Pause_RevertsIfAlreadyPaused() public {
        vm.prank(owner);
        pot.pause();
        vm.prank(owner);
        vm.expectRevert(bytes("Already paused"));
        pot.pause();
    }

    function test_Unpause_OwnerCanUnpause() public {
        vm.prank(owner);
        pot.pause();
        vm.prank(owner);
        vm.expectEmit(false, false, false, false, address(pot));
        emit EmberPot.Unpaused();
        pot.unpause();
        assertFalse(pot.paused());
    }

    function test_Unpause_RevertsIfNotPaused() public {
        vm.prank(owner);
        vm.expectRevert(bytes("Not paused"));
        pot.unpause();
    }

    function test_SetKeyPrice_UpdatesPrice() public {
        uint256 newPrice = 200_000;
        vm.prank(owner);
        vm.expectEmit(false, false, false, true, address(pot));
        emit EmberPot.KeyPriceUpdated(KEY_PRICE, newPrice);
        pot.setKeyPrice(newPrice);
        assertEq(pot.keyPrice(), newPrice);
    }

    function test_SetKeyPrice_RevertsForNonOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        pot.setKeyPrice(200_000);
    }

    function test_SetKeyPrice_RevertsOnZeroPrice() public {
        vm.prank(owner);
        vm.expectRevert(bytes("Bad keyPrice"));
        pot.setKeyPrice(0);
    }

    // =========================================================
    //  SECTION 10 — Required test #10: admin ops don't move funds
    // =========================================================

    function test_AdminOps_DoNotChangeUsdcBalanceOrRoundPot() public {
        _buyKeys(alice, 5);
        uint256 rid = pot.currentRound();

        uint256 potBal   = usdc.balanceOf(address(pot));
        uint256 roundPot_= pot.roundPot(rid);

        // setKeyPrice
        vm.prank(owner);
        pot.setKeyPrice(50_000);
        assertEq(usdc.balanceOf(address(pot)), potBal);
        assertEq(pot.roundPot(rid),            roundPot_);

        // setSigner
        vm.prank(owner);
        pot.setSigner(signerB);
        assertEq(usdc.balanceOf(address(pot)), potBal);
        assertEq(pot.roundPot(rid),            roundPot_);

        // pause
        vm.prank(owner);
        pot.pause();
        assertEq(usdc.balanceOf(address(pot)), potBal);
        assertEq(pot.roundPot(rid),            roundPot_);

        // unpause
        vm.prank(owner);
        pot.unpause();
        assertEq(usdc.balanceOf(address(pot)), potBal);
        assertEq(pot.roundPot(rid),            roundPot_);
    }

    // =========================================================
    //  SECTION 11 — shareOf view
    // =========================================================

    function test_ShareOf_ReturnsCorrectShare() public {
        _buyKeys(alice, 1);
        _buyKeys(bob,   1);
        _recordRun(alice, keccak256("a1"), 1000, signerAKey);
        _recordRun(bob,   keccak256("b1"), 4000, signerAKey);

        uint256 rid  = pot.currentRound();
        uint256 pot_ = pot.roundPot(rid);
        uint256 tg   = pot.totalGold(rid); // 5000

        assertEq(pot.shareOf(rid, alice), (pot_ * 1000) / tg);
        assertEq(pot.shareOf(rid, bob),   (pot_ * 4000) / tg);
    }

    function test_ShareOf_ZeroForZeroGoldRound() public view {
        uint256 rid = pot.currentRound();
        assertEq(pot.shareOf(rid, alice), 0);
    }

    // =========================================================
    //  SECTION 12 — currentRound / roundEnd
    // =========================================================

    function test_CurrentRound_AdvancesWithTime() public {
        assertEq(pot.currentRound(), 0);
        vm.warp(pot.launchTime() + ROUND_DURATION);
        assertEq(pot.currentRound(), 1);
        vm.warp(pot.launchTime() + 3 * ROUND_DURATION);
        assertEq(pot.currentRound(), 3);
    }

    function test_RoundEnd_CorrectValues() public view {
        assertEq(pot.roundEnd(0), pot.launchTime() + ROUND_DURATION);
        assertEq(pot.roundEnd(1), pot.launchTime() + 2 * ROUND_DURATION);
    }

    // =========================================================
    //  SECTION 13 — Fuzz tests
    // =========================================================

    function testFuzz_BuyKeys_PotAndTreasuryInvariant(uint256 qty) public {
        qty = bound(qty, 1, 100);
        uint256 totalCost = qty * KEY_PRICE;
        _fund(alice, totalCost); // extra buffer

        uint256 treaBefore = usdc.balanceOf(treasury);

        _buyKeys(alice, qty);

        uint256 tShare = (totalCost * 2000) / 10_000;
        uint256 potAmt = totalCost - tShare;

        assertEq(pot.roundPot(pot.currentRound()), potAmt);
        assertEq(usdc.balanceOf(treasury) - treaBefore, tShare);
    }

    function testFuzz_RecordRun_GoldBounds(uint256 gold) public {
        _buyKeys(alice, 1);
        uint256 rid      = pot.currentRound();
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 runId    = keccak256("fuzz-run");

        if (gold == 0 || gold > MAX_GOLD) {
            bytes memory sig = _signRun(signerAKey, alice, runId, gold, rid, deadline);
            vm.expectRevert(bytes("Bad gold"));
            pot.recordRun(alice, runId, gold, deadline, sig);
        } else {
            bytes memory sig = _signRun(signerAKey, alice, runId, gold, rid, deadline);
            pot.recordRun(alice, runId, gold, deadline, sig);
            assertEq(pot.goldOf(rid, alice), gold);
        }
    }

    function testFuzz_Distribute_ShareSumLeqPot(
        uint256 goldA,
        uint256 goldB,
        uint256 goldC
    ) public {
        goldA = bound(goldA, 1, MAX_GOLD);
        goldB = bound(goldB, 1, MAX_GOLD);
        goldC = bound(goldC, 1, MAX_GOLD);

        _buyKeys(alice, 1);
        _buyKeys(bob,   1);
        _buyKeys(carol, 1);

        _recordRun(alice, keccak256("a"), goldA, signerAKey);
        _recordRun(bob,   keccak256("b"), goldB, signerAKey);
        _recordRun(carol, keccak256("c"), goldC, signerAKey);

        uint256 rid  = pot.currentRound();
        uint256 pot_ = pot.roundPot(rid);
        uint256 tg   = pot.totalGold(rid);

        _endRound(rid);

        address[] memory players = new address[](3);
        players[0] = alice;
        players[1] = bob;
        players[2] = carol;
        pot.distribute(rid, players);

        // Sum of all individual formula shares must not exceed the pot (rounding dust stays)
        uint256 expA = (pot_ * goldA) / tg;
        uint256 expB = (pot_ * goldB) / tg;
        uint256 expC = (pot_ * goldC) / tg;
        assertLe(expA + expB + expC, pot_);

        // totalDistributed must equal the sum of individual shares
        uint256 paid_ = pot.totalDistributed(rid);
        assertEq(paid_, expA + expB + expC);
        assertLe(paid_, pot_);
    }

    // =========================================================
    //  SECTION 14 — 10-minute round duration
    // =========================================================

    function test_TenMinuteRound_BuyAndDistribute() public {
        uint256 tenMin = 10 minutes;

        // Deploy a fresh pot with a 10-minute round
        MockERC20 shortUsdc = new MockERC20("Short USDC", "sUSDC", 6);
        vm.prank(owner);
        EmberPot shortPot = new EmberPot(
            address(shortUsdc),
            treasury,
            signerA,
            KEY_PRICE,
            MAX_GOLD,
            tenMin
        );

        assertEq(shortPot.roundDuration(), tenMin);

        // Fund alice and bob
        shortUsdc.mint(alice, 10_000_000);
        shortUsdc.mint(bob,   10_000_000);
        vm.prank(alice); shortUsdc.approve(address(shortPot), type(uint256).max);
        vm.prank(bob);   shortUsdc.approve(address(shortPot), type(uint256).max);

        // Round 0 is active
        assertEq(shortPot.currentRound(), 0);

        // Buy keys and record runs
        vm.prank(alice); shortPot.buyKeys(2);
        vm.prank(bob);   shortPot.buyKeys(1);

        uint256 rid      = shortPot.currentRound();
        uint256 deadline = block.timestamp + 1 hours;

        // Sign with the shared helper (uses address(pot) for domain — must build manually)
        bytes32 runIdA = keccak256("10m-alice");
        bytes32 runIdB = keccak256("10m-bob");

        bytes32 structA = keccak256(abi.encode(RUN_TYPEHASH, alice, runIdA, uint256(1000), rid, deadline));
        bytes32 structB = keccak256(abi.encode(RUN_TYPEHASH, bob,   runIdB, uint256(2000), rid, deadline));
        bytes32 domainSep = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes("EmberPot")),
            keccak256(bytes("1")),
            block.chainid,
            address(shortPot)
        ));
        {
            bytes32 digestA = keccak256(abi.encodePacked("\x19\x01", domainSep, structA));
            (uint8 v, bytes32 r_, bytes32 s_) = vm.sign(signerAKey, digestA);
            shortPot.recordRun(alice, runIdA, 1000, deadline, abi.encodePacked(r_, s_, v));
        }
        {
            bytes32 digestB = keccak256(abi.encodePacked("\x19\x01", domainSep, structB));
            (uint8 v, bytes32 r_, bytes32 s_) = vm.sign(signerAKey, digestB);
            shortPot.recordRun(bob, runIdB, 2000, deadline, abi.encodePacked(r_, s_, v));
        }

        // Confirm we are still in round 0 and round advances after 10 minutes
        assertEq(shortPot.currentRound(), 0);
        vm.warp(shortPot.roundEnd(0) + 1);
        assertEq(shortPot.currentRound(), 1);

        // Distribute
        uint256 pot_  = shortPot.roundPot(0);
        uint256 tg    = shortPot.totalGold(0);
        uint256 expA  = (pot_ * 1000) / tg;
        uint256 expB  = (pot_ * 2000) / tg;

        uint256 aliceBefore = shortUsdc.balanceOf(alice);
        uint256 bobBefore   = shortUsdc.balanceOf(bob);

        address[] memory players = new address[](2);
        players[0] = alice;
        players[1] = bob;
        shortPot.distribute(0, players);

        assertEq(shortUsdc.balanceOf(alice) - aliceBefore, expA);
        assertEq(shortUsdc.balanceOf(bob)   - bobBefore,   expB);
    }

    // =========================================================
    //  SECTION 15 — _roundPlayers / playerCount / playersOf
    // =========================================================

    // A player recorded twice in a round appears only once
    function test_RoundPlayers_DeduplicatesPlayer() public {
        _buyKeys(alice, 2);
        _recordRun(alice, keccak256("dup-1"), 100, signerAKey);
        _recordRun(alice, keccak256("dup-2"), 200, signerAKey);

        uint256 rid = pot.currentRound();
        // goldOf accumulates but _roundPlayers only pushed alice once
        assertEq(pot.playerCount(rid), 1);
        address[] memory pl = pot.playersOf(rid, 0, 10);
        assertEq(pl.length, 1);
        assertEq(pl[0], alice);
        // gold is the sum of both runs
        assertEq(pot.goldOf(rid, alice), 300);
    }

    // Players of different rounds stay separate
    function test_RoundPlayers_SeparateAcrossRounds() public {
        // Round 0: alice records a run
        _buyKeys(alice, 1);
        _recordRun(alice, keccak256("r0-a"), 100, signerAKey);
        uint256 rid0 = pot.currentRound(); // 0

        // Advance to round 1 — use a concrete future timestamp so deadline arithmetic is safe
        uint256 t1 = pot.launchTime() + ROUND_DURATION + 1;
        vm.warp(t1);
        uint256 rid1 = pot.currentRound(); // 1

        // Round 1: bob records a run — build signature manually with deadline well in future
        _buyKeys(bob, 1);
        uint256 deadline = t1 + 1 days;
        bytes32 runId = keccak256("r1-b");
        bytes32 structHash = keccak256(abi.encode(RUN_TYPEHASH, bob, runId, uint256(200), rid1, deadline));
        bytes32 domainSep = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes("EmberPot")),
            keccak256(bytes("1")),
            block.chainid,
            address(pot)
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSep, structHash));
        (uint8 v, bytes32 r_, bytes32 s_) = vm.sign(signerAKey, digest);
        pot.recordRun(bob, runId, 200, deadline, abi.encodePacked(r_, s_, v));

        assertEq(pot.playerCount(rid0), 1);
        assertEq(pot.playerCount(rid1), 1);

        address[] memory pl0 = pot.playersOf(rid0, 0, 10);
        address[] memory pl1 = pot.playersOf(rid1, 0, 10);

        assertEq(pl0[0], alice);
        assertEq(pl1[0], bob);
    }

    // playersOf pages correctly
    function test_RoundPlayers_PaginatesCorrectly() public {
        // Record 5 players: alice, bob, carol, dave, eve
        address[5] memory players5 = [alice, bob, carol, dave, eve];
        for (uint256 i = 0; i < 5; i++) {
            _buyKeys(players5[i], 1);
            _recordRun(players5[i], keccak256(abi.encode("pg", i)), 100, signerAKey);
        }
        uint256 rid = pot.currentRound();
        assertEq(pot.playerCount(rid), 5);

        // Page 1: start=0, count=3 → [alice, bob, carol]
        address[] memory page1 = pot.playersOf(rid, 0, 3);
        assertEq(page1.length, 3);
        assertEq(page1[0], alice);
        assertEq(page1[1], bob);
        assertEq(page1[2], carol);

        // Page 2: start=3, count=3 → [dave, eve] (clipped)
        address[] memory page2 = pot.playersOf(rid, 3, 3);
        assertEq(page2.length, 2);
        assertEq(page2[0], dave);
        assertEq(page2[1], eve);

        // Empty slice: start=0, count=0
        address[] memory empty = pot.playersOf(rid, 0, 0);
        assertEq(empty.length, 0);

        // Slice past the end: start=10 → empty
        address[] memory pastEnd = pot.playersOf(rid, 10, 5);
        assertEq(pastEnd.length, 0);
    }
}
