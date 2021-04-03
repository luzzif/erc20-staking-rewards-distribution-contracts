// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import "./ERC20StakingRewardsDistribution.sol";

contract ERC20StakingRewardsDistributionFactory is UpgradeableBeacon {
    using SafeMath for uint256;
    using SafeERC20 for ERC20;

    ERC20StakingRewardsDistribution[] public distributions;

    event DistributionCreated(address owner, address deployedAt);

    constructor(address _implementation) UpgradeableBeacon(_implementation) {}

    function createDistribution(
        address[] calldata _rewardTokenAddresses,
        address _stakableTokenAddress,
        uint256[] calldata _rewardAmounts,
        uint64 _startingTimestamp,
        uint64 _endingTimestamp,
        bool _locked,
        uint256 _stakingCap
    ) public virtual {
        BeaconProxy _distributionProxy =
            new BeaconProxy(address(this), bytes(""));
        for (uint256 _i; _i < _rewardTokenAddresses.length; _i++) {
            uint256 _relatedAmount = _rewardAmounts[_i];
            ERC20(_rewardTokenAddresses[_i]).safeTransferFrom(
                msg.sender,
                address(_distributionProxy),
                _relatedAmount
            );
        }
        ERC20StakingRewardsDistribution _distribution =
            ERC20StakingRewardsDistribution(address(_distributionProxy));
        _distribution.initialize(
            _rewardTokenAddresses,
            _stakableTokenAddress,
            _rewardAmounts,
            _startingTimestamp,
            _endingTimestamp,
            _locked,
            _stakingCap
        );
        _distribution.transferOwnership(msg.sender);
        distributions.push(_distribution);
        emit DistributionCreated(msg.sender, address(_distribution));
    }

    function getDistributionsAmount() external view returns (uint256) {
        return distributions.length;
    }
}
