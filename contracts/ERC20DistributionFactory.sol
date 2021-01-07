// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./ERC20Distribution.sol";

contract ERC20DistributionFactory is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for ERC20;

    ERC20Distribution[] public distributions;

    event Created(
        address indexed creator,
        address[] rewardsTokenAddresses,
        address[] stakableTokenAddresses,
        uint256[] rewardsAmounts,
        uint256 startingTimestamp,
        uint256 endingTimestamp,
        bool locked
    );

    function createDistribution(
        address[] calldata _rewardTokenAddresses,
        address[] calldata _stakableTokenAddresses,
        uint256[] calldata _rewardAmounts,
        uint64 _startingTimestamp,
        uint64 _endingTimestmp,
        bool _locked
    ) public virtual {
        ERC20Distribution _distribution = new ERC20Distribution();
        for (uint256 _i; _i < _rewardTokenAddresses.length; _i++) {
            ERC20 _rewardToken = ERC20(_rewardTokenAddresses[_i]);
            uint256 _relatedAmount = _rewardAmounts[_i];
            _rewardToken.safeTransferFrom(
                msg.sender,
                address(_distribution),
                _relatedAmount
            );
        }
        _distribution.initialize(
            _rewardTokenAddresses,
            _stakableTokenAddresses,
            _rewardAmounts,
            _startingTimestamp,
            _endingTimestmp,
            _locked
        );
        _distribution.transferOwnership(msg.sender);
        distributions.push(_distribution);
        emit Created(
            msg.sender,
            _rewardTokenAddresses,
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
