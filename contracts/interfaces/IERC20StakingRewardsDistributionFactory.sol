// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.0;

import "./IERC20StakingRewardsDistribution.sol";

interface IERC20StakingRewardsDistributionFactory {
    function createDistribution(
        address[] calldata _rewardTokenAddresses,
        address _stakableTokenAddress,
        uint256[] calldata _rewardAmounts,
        uint64 _startingTimestamp,
        uint64 _endingTimestamp,
        bool _locked,
        uint256 _stakingCap
    ) external;

    function getDistributionsAmount() external view returns (uint256);

    function implementation() external view returns (address);

    function upgradeImplementation(address _newImplementation) external;

    function distributions(uint256 _index)
        external
        view
        returns (IERC20StakingRewardsDistribution);

    function stakingPaused() external view returns (bool);

    function pauseStaking() external;

    function resumeStaking() external;
}
