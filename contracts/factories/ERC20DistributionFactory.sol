// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../distributions/ERC20Distribution.sol";

contract ERC20DistributionFactory is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for ERC20;

    ERC20Distribution[] public distributions;

    event Created(
        address indexed creator,
        address[] indexed rewardsTokenAddresses,
        address[] indexed stakableTokenAddresses,
        uint256[] rewardsAmounts,
        uint256 startingTimestamp,
        uint256 endingTimestamp,
        bool locked
    );

    function createDistribution(
        address[] calldata _rewardsTokenAddresses,
        address[] calldata _stakableTokenAddresses,
        uint256[] calldata _rewardAmounts,
        uint64 _startingTimestamp,
        uint64 _endingTimestmp,
        bool _locked
    ) public virtual {
        ERC20Distribution _distribution = new ERC20Distribution();
        for (uint256 _i; _i < _rewardsTokenAddresses.length; _i++) {
            ERC20 _rewardToken = ERC20(_rewardsTokenAddresses[_i]);
            uint256 _relatedAmount = _rewardAmounts[_i];
            _rewardToken.safeTransferFrom(
                msg.sender,
                address(this),
                _relatedAmount
            );
            _rewardToken.safeIncreaseAllowance(
                address(_distribution),
                _relatedAmount
            );
        }
        _distribution.initialize(
            _rewardsTokenAddresses,
            _stakableTokenAddresses,
            _rewardAmounts,
            _startingTimestamp,
            _endingTimestmp,
            _locked
        );
        distributions.push(_distribution);
        emit Created(
            msg.sender,
            _rewardsTokenAddresses,
            _stakableTokenAddresses,
            _rewardAmounts,
            _startingTimestamp,
            _endingTimestmp,
            _locked
        );
    }

    function getDistributionsAmount() external view returns (uint256) {
        return distributions.length;
    }
}
