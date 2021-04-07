// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface IERC20StakingRewardsDistribution {
    function getRewardTokens() external view returns (ERC20[] memory);

    function getClaimedRewards(address _claimer)
        external
        view
        returns (uint256[] memory);

    function initialize(
        address[] calldata _rewardTokenAddresses,
        address _stakableTokenAddress,
        uint256[] calldata _rewardAmounts,
        uint64 _startingTimestamp,
        uint64 _endingTimestamp,
        bool _locked,
        uint256 _stakingCap
    ) external;

    function cancel() external;

    function recoverUnassignedRewards() external;

    function stake(uint256 _amount) external;

    function withdraw(uint256 _amount) external;

    function claim(uint256[] memory _amounts, address _recipient) external;

    function claimAll(address _recipient) external;

    function exit(address _recipient) external;

    function consolidateReward() external;

    function claimableRewards(address _staker)
        external
        view
        returns (uint256[] memory);

    function renounceOwnership() external;

    function transferOwnership(address _newOwner) external;
}
