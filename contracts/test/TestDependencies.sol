//SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.6.12;

import "@openzeppelin/contracts/presets/ERC20PresetMinterPauser.sol";

contract FirstRewardERC20 is ERC20PresetMinterPauser {
    constructor() public ERC20PresetMinterPauser("First reward", "RWD1") {}
}

contract SecondRewardERC20 is ERC20PresetMinterPauser {
    constructor() public ERC20PresetMinterPauser("Second reward", "RWD2") {}
}

contract FirstStakableERC20 is ERC20PresetMinterPauser {
    constructor() public ERC20PresetMinterPauser("First stakable", "STK1") {}
}

contract SecondStakableERC20 is ERC20PresetMinterPauser {
    constructor() public ERC20PresetMinterPauser("Second stakable", "STK2") {}
}
