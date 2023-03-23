// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor(address _receiver) ERC20 ("Mock ERC20", "MERC") {
        _mint(_receiver, 1000000e18);
    }
}