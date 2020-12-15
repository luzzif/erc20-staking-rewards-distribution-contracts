// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../DXTokenRegistry.sol";
import "./BasicDistributionFactory.sol";


contract DXDistributionFactory is BasicDistributionFactory {
    DXTokenRegistry dxTokenRegistry;
    uint256 validTokensListId;

    constructor(address _dxTokenRegistryAddress, uint256 _validTokensListId)
        public
        BasicDistributionFactory()
    {
        dxTokenRegistry = DXTokenRegistry(_dxTokenRegistryAddress);
        validTokensListId = _validTokensListId;
    }

    function setValidTokensListId(uint256 _validTokensListId)
        external
        onlyOwner
    {
        validTokensListId = _validTokensListId;
    }

    function createDistribution(
        address[] calldata _rewardsTokenAddresses,
        address[] calldata _stakableTokenAddresses,
        uint256[] calldata _rewardsAmounts,
        uint256 _startingBlock,
        uint256 _blocksDuration
    ) public override {
        for (uint256 _i = 0; _i < _rewardsTokenAddresses.length; _i++) {
            require(
                dxTokenRegistry.isTokenActive(
                    validTokensListId,
                    _rewardsTokenAddresses[_i]
                ),
                "DXDistributionFactory: invalid reward token"
            );
        }
        for (uint256 _i = 0; _i < _stakableTokenAddresses.length; _i++) {
            require(
                dxTokenRegistry.isTokenActive(
                    validTokensListId,
                    _stakableTokenAddresses[_i]
                ),
                "DXDistributionFactory: invalid stakable token"
            );
        }
        BasicDistributionFactory.createDistribution(
            _rewardsTokenAddresses,
            _stakableTokenAddresses,
            _rewardsAmounts,
            _startingBlock,
            _blocksDuration
        );
    }
}
