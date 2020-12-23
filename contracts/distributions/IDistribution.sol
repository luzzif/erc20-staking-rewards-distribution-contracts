// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.6.12;

interface IDistribution {
    function initialize(
        address[] calldata _rewardTokenAddresses,
        address[] calldata _stakableTokenAddresses,
        uint256[] calldata _rewardAmounts,
        uint256 _startingTimestamp,
        uint256 _endingTimestamp
    ) external;

    function cancel() external;

    function recoverUnassignedRewards() external;

    function stake(uint256[] calldata _amounts) external;

    function withdraw(uint256[] calldata _amounts) external;

    function claim() external;
}
