// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract EmberPot is Ownable, EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 private constant RUN_TYPEHASH =
        keccak256("RunRecord(address player,bytes32 runId,uint256 gold,uint256 roundId,uint256 deadline)");

    IERC20 public immutable usdc;
    address public immutable treasury;
    uint256 public immutable launchTime;
    uint256 public immutable maxGoldPerRun;
    uint256 public immutable roundDuration;

    uint256 public constant SETTLE_GRACE = 7 days;
    uint256 public constant SWEEP_DELAY = 30 days;
    uint256 public constant TREASURY_BPS = 2000;
    uint256 public constant MAX_KEYS_PER_TX      = 100;
    uint256 public constant MAX_DISTRIBUTE_BATCH = 200;

    uint256 public keyPrice;
    bool public paused;

    struct SignerEntry {
        address signer;
        uint256 effectiveRound;
    }

    SignerEntry[] public signerHistory;

    mapping(uint256 => uint256) public roundPot;
    mapping(uint256 => uint256) public totalGold;
    mapping(uint256 => uint256) public totalDistributed;

    mapping(uint256 => mapping(address => uint256)) public goldOf;
    mapping(address => uint256) public keyBalance;
    mapping(uint256 => mapping(address => bool)) public paid;
    mapping(uint256 => mapping(address => uint256)) public claimable;

    mapping(bytes32 => bool) public runRecorded;

    mapping(uint256 => address[]) private _roundPlayers;

    mapping(uint256 => bool) public zeroGoldRolledOver;
    mapping(uint256 => bool) public swept;

    event KeysBought(uint256 indexed roundId, address indexed buyer, uint256 quantity, uint256 paid, uint256 potAmount);
    event RunRecorded(uint256 indexed roundId, address indexed player, bytes32 indexed runId, uint256 gold);
    event KeyUsed(address indexed player, bytes32 indexed runId, uint256 keysLeft);
    event Distributed(uint256 indexed roundId, address indexed player, uint256 amount);
    event DistributionClaimable(uint256 indexed roundId, address indexed player, uint256 amount);
    event Claimed(uint256 indexed roundId, address indexed player, uint256 amount);
    event ZeroGoldRollover(uint256 indexed fromRound, uint256 indexed toRound, uint256 amount);
    event Rollover(uint256 indexed fromRound, uint256 indexed toRound, uint256 amount);
    event Swept(uint256 indexed roundId, uint256 indexed toRound, uint256 amount);
    event KeyPriceUpdated(uint256 oldPrice, uint256 newPrice);
    event SignerQueued(address indexed newSigner, uint256 effectiveRound);
    event Paused();
    event Unpaused();

    constructor(
        address usdc_,
        address treasury_,
        address initialSigner_,
        uint256 keyPrice_,
        uint256 maxGoldPerRun_,
        uint256 roundDuration_
    ) Ownable(msg.sender) EIP712("EmberPot", "1") {
        require(address(usdc_).code.length > 0, "Bad USDC");
        require(treasury_ != address(0), "Bad treasury");
        require(initialSigner_ != address(0), "Bad signer");
        require(keyPrice_ > 0, "Bad keyPrice");
        require(maxGoldPerRun_ > 0, "Bad maxGold");
        require(roundDuration_ >= 5 minutes, "Round too short");

        usdc = IERC20(usdc_);
        treasury = treasury_;
        keyPrice = keyPrice_;
        maxGoldPerRun = maxGoldPerRun_;
        roundDuration = roundDuration_;
        launchTime = block.timestamp;

        signerHistory.push(SignerEntry({signer: initialSigner_, effectiveRound: 0}));
    }

    function currentRound() public view returns (uint256) {
        return (block.timestamp - launchTime) / roundDuration;
    }

    function roundEnd(uint256 roundId) public view returns (uint256) {
        return launchTime + (roundId + 1) * roundDuration;
    }

    function signerOf(uint256 roundId) public view returns (address) {
        for (uint256 i = signerHistory.length; i > 0; i--) {
            if (signerHistory[i - 1].effectiveRound <= roundId) {
                return signerHistory[i - 1].signer;
            }
        }
        return address(0);
    }

    function shareOf(uint256 roundId, address player) public view returns (uint256) {
        uint256 tg = totalGold[roundId];
        if (tg == 0) return 0;
        return (roundPot[roundId] * goldOf[roundId][player]) / tg;
    }

    function buyKeys(uint256 quantity) external nonReentrant {
        require(!paused, "Paused");
        require(quantity >= 1 && quantity <= MAX_KEYS_PER_TX, "Bad quantity");

        uint256 rid = currentRound();
        uint256 total = quantity * keyPrice;
        uint256 tshare = (total * TREASURY_BPS) / 10_000;
        uint256 potAmt = total - tshare;

        usdc.safeTransferFrom(msg.sender, address(this), total);
        usdc.safeTransfer(treasury, tshare);

        roundPot[rid] += potAmt;
        keyBalance[msg.sender] += quantity;

        emit KeysBought(rid, msg.sender, quantity, total, potAmt);
    }

    function recordRun(address player, bytes32 runId, uint256 gold, uint256 deadline, bytes calldata signature)
        external
        nonReentrant
    {
        require(block.timestamp <= deadline, "Expired");
        require(gold > 0 && gold <= maxGoldPerRun, "Bad gold");

        uint256 rid = currentRound();

        bytes32 structHash = keccak256(abi.encode(RUN_TYPEHASH, player, runId, gold, rid, deadline));
        bytes32 digest = _hashTypedDataV4(structHash);
        require(ECDSA.recover(digest, signature) == signerOf(rid), "Bad signature");

        require(!runRecorded[runId], "Run already recorded");
        runRecorded[runId] = true;

        require(keyBalance[player] > 0, "No key");
        keyBalance[player] -= 1;

        if (goldOf[rid][player] == 0) _roundPlayers[rid].push(player);
        goldOf[rid][player] += gold;
        totalGold[rid] += gold;

        emit RunRecorded(rid, player, runId, gold);
        emit KeyUsed(player, runId, keyBalance[player]);
    }

    function distribute(uint256 roundId, address[] calldata players) external nonReentrant {
        require(block.timestamp > roundEnd(roundId), "Round not ended");
        require(!swept[roundId], "Swept");
        require(players.length <= MAX_DISTRIBUTE_BATCH, "Batch too large");

        uint256 tg  = totalGold[roundId];
        uint256 pot = roundPot[roundId];

        if (tg == 0) {
            require(!zeroGoldRolledOver[roundId], "Already rolled over");
            zeroGoldRolledOver[roundId] = true;
            uint256 cur = currentRound();
            roundPot[cur] += pot;
            roundPot[roundId] = 0;
            emit ZeroGoldRollover(roundId, cur, pot);
            return;
        }

        for (uint256 i = 0; i < players.length; ++i) {
            address player = players[i];
            if (paid[roundId][player]) continue;

            uint256 g = goldOf[roundId][player];
            if (g == 0) continue;

            uint256 share = (pot * g) / tg;
            if (share == 0) continue;

            // CEI: write state before external call
            paid[roundId][player]      = true;
            totalDistributed[roundId] += share;

            if (_tryTransfer(player, share)) {
                emit Distributed(roundId, player, share);
            } else {
                claimable[roundId][player] += share;
                emit DistributionClaimable(roundId, player, share);
            }
        }
    }

    function claim(uint256 roundId) external nonReentrant {
        uint256 amount = claimable[roundId][msg.sender];
        require(amount > 0, "Nothing to claim");
        claimable[roundId][msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);
        emit Claimed(roundId, msg.sender, amount);
    }

    function rollover(uint256 roundId) external nonReentrant {
        require(block.timestamp > roundEnd(roundId) + SETTLE_GRACE, "Grace active");
        require(totalGold[roundId] == 0, "Has gold");
        require(!zeroGoldRolledOver[roundId], "Already rolled over");

        zeroGoldRolledOver[roundId] = true;
        uint256 pot = roundPot[roundId];
        uint256 cur = currentRound();

        if (pot > 0) {
            roundPot[cur] += pot;
            roundPot[roundId] = 0;
        }

        emit Rollover(roundId, cur, pot);
    }

    function sweep(uint256 roundId) external nonReentrant {
        require(block.timestamp > roundEnd(roundId) + SWEEP_DELAY, "Too early");
        require(totalGold[roundId] > 0, "No gold round, use rollover");
        require(!swept[roundId], "Already swept");

        swept[roundId] = true;

        uint256 remaining = roundPot[roundId] - totalDistributed[roundId];
        if (remaining > 0) {
            uint256 cur = currentRound();
            roundPot[cur] += remaining;
            emit Swept(roundId, cur, remaining);
        }
    }

    function setKeyPrice(uint256 newPrice) external onlyOwner {
        require(newPrice > 0, "Bad keyPrice");
        emit KeyPriceUpdated(keyPrice, newPrice);
        keyPrice = newPrice;
    }

    function setSigner(address newSigner) external onlyOwner {
        require(newSigner != address(0), "Bad signer");
        uint256 effective = currentRound() + 1;
        signerHistory.push(SignerEntry({signer: newSigner, effectiveRound: effective}));
        emit SignerQueued(newSigner, effective);
    }

    function pause() external onlyOwner {
        require(!paused, "Already paused");
        paused = true;
        emit Paused();
    }

    function unpause() external onlyOwner {
        require(paused, "Not paused");
        paused = false;
        emit Unpaused();
    }

    function playerCount(uint256 roundId) external view returns (uint256) {
        return _roundPlayers[roundId].length;
    }

    function playersOf(uint256 roundId, uint256 start, uint256 count)
        external
        view
        returns (address[] memory)
    {
        address[] storage list = _roundPlayers[roundId];
        uint256 len = list.length;
        if (start >= len) return new address[](0);
        uint256 end = start + count;
        if (end > len) end = len;
        uint256 size = end - start;
        address[] memory out = new address[](size);
        for (uint256 i = 0; i < size; ++i) {
            out[i] = list[start + i];
        }
        return out;
    }

    function _tryTransfer(address to, uint256 amount) internal returns (bool) {
        (bool ok, bytes memory data) = address(usdc).call(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
        if (!ok) return false;
        if (data.length == 0) return true;
        if (data.length >= 32) return abi.decode(data, (bool));
        return false;
    }
}
