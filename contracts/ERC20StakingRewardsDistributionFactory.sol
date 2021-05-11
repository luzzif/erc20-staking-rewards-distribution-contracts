// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./interfaces/IERC20StakingRewardsDistribution.sol";

contract ERC20StakingRewardsDistributionFactory is Ownable {
    using SafeERC20 for IERC20;

    address public implementation;
    IERC20StakingRewardsDistribution[] public distributions;

    event DistributionCreated(address owner, address deployedAt);

    constructor(address _implementation) {
        implementation = _implementation;
    }

    function upgradeImplementation(address _implementation) external onlyOwner {
        implementation = _implementation;
    }

    function createDistribution(
        address[] calldata _rewardTokenAddresses,
        address _stakableTokenAddress,
        uint256[] calldata _rewardAmounts,
        uint64 _startingTimestamp,
        uint64 _endingTimestamp,
        bool _locked,
        uint256 _stakingCap
    ) public virtual {
        address _distributionProxy = Clones.clone(implementation);
        for (uint256 _i; _i < _rewardTokenAddresses.length; _i++) {
            IERC20(_rewardTokenAddresses[_i]).safeTransferFrom(
                msg.sender,
                _distributionProxy,
                _rewardAmounts[_i]
            );
        }
        IERC20StakingRewardsDistribution _distribution =
            IERC20StakingRewardsDistribution(_distributionProxy);
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
