// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Route} from "../EmberKeyRouter.sol";

/// Test helpers for EmberKeyRouter: a plain ERC-20, a Tigris router with a fixed rate, and an Ember Pot that only
/// sells keys. Never deployed.
contract MockToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MockTigris {
    /// MUSD out per token in, scaled by 1e18.
    mapping(address => uint256) public rate;
    Route public lastRoute;

    function setRate(address token, uint256 r) external { rate[token] = r; }

    function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, Route[] calldata routes, address to, uint256)
        external
        returns (uint256[] memory amounts)
    {
        lastRoute = routes[0];
        MockToken(routes[0].from).transferFrom(msg.sender, address(this), amountIn);
        uint256 out = amountIn * rate[routes[0].from] / 1e18;
        require(out >= amountOutMin, "INSUFFICIENT_OUTPUT_AMOUNT");
        MockToken(routes[0].to).mint(to, out);
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = out;
    }
}

contract MockPot {
    MockToken public immutable musd;
    uint256 public keyPrice = 1e18;
    mapping(address => uint256) public keyBalance;

    constructor(MockToken musd_) { musd = musd_; }

    function buyKeysFor(address player, uint256 quantity) external {
        musd.transferFrom(msg.sender, address(this), keyPrice * quantity);
        keyBalance[player] += quantity;
    }
}
