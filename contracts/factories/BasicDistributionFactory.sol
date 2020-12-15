// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../ERC20Staker.sol";


contract BasicDistributionFactory is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for ERC20;

    ERC20Staker[] public distributions;

    event Created(
        address indexed creator,
        address[] indexed rewardsTokenAddresses,
        address[] indexed stakableTokenAddresses,
        uint256[] rewardsAmounts,
        uint256 startingBlock,
        uint256 blocksDuration
    );

    function createDistribution(
        address[] calldata _rewardsTokenAddresses,
        address[] calldata _stakableTokenAddresses,
        uint256[] calldata _rewardsAmounts,
        uint256 _startingBlock,
        uint256 _blocksDuration
    ) public virtual {
        require(
            _rewardsTokenAddresses.length == _rewardsAmounts.length,
            "DistributionFactory: inconsistent reward token/amount arrays length"
        );
        ERC20Staker _staker = new ERC20Staker();
        for (uint256 _i; _i < _rewardsTokenAddresses.length; _i++) {
            ERC20 _rewardToken = ERC20(_rewardsTokenAddresses[_i]);
            uint256 _relatedAmount = _rewardsAmounts[_i];
            _rewardToken.approve(address(_staker), _relatedAmount);
            _rewardToken.safeTransferFrom(
                msg.sender,
                address(_staker),
                _relatedAmount
            );
        }
        _staker.initialize(
            _rewardsTokenAddresses,
            _stakableTokenAddresses,
            _rewardsAmounts,
            _startingBlock,
            _blocksDuration
        );
        distributions.push(_staker);
        emit Created(
            msg.sender,
            _rewardsTokenAddresses,
            _stakableTokenAddresses,
            _rewardsAmounts,
            _startingBlock,
            _blocksDuration
        );
    }
}
