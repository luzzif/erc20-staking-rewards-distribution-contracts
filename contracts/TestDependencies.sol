//SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.6.12;

import "@openzeppelin/contracts/presets/ERC20PresetMinterPauser.sol";


contract HighDecimalsERC20 is ERC20PresetMinterPauser {
    constructor() public ERC20PresetMinterPauser("High decimals", "HDEC") {
        _setupDecimals(200);
    }
}
