// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IERC20StakingRewardsDistributionFactory.sol";

/**
 * Errors codes:
 *
 * SRD01: invalid starting timestamp
 * SRD02: invalid time duration
 * SRD03: inconsistent reward tokens/amounts, or 0-length reward tokens/amounts
 * SRD04: 0 address as reward token
 * SRD05: no reward
 * SRD06: no funding
 * SRD07: 0 address as stakable token
 * SRD08: distribution already started
 * SRD09: tried to stake nothing
 * SRD10: staking cap hit
 * SRD11: tried to withdraw nothing
 * SRD12: funds locked until the distribution ends
 * SRD13: withdrawn amount greater than current stake
 * SRD14: inconsistent claimed amounts
 * SRD15: insufficient claimable amount
 * SRD16: 0 address owner
 * SRD17: caller not owner
 * SRD18: already initialized
 * SRD19: invalid state for cancel to be called
 * SRD20: not started
 * SRD21: already ended
 * SRD22: no rewards are recoverable
 * SRD23: no rewards are claimable while claiming all
 * SRD24: no rewards are claimable while manually claiming an arbitrary amount of rewards
 * SRD25: staking is currently paused
 */
contract ERC20StakingRewardsDistribution {
    using SafeERC20 for IERC20;

    uint224 constant MULTIPLIER = 2**112;

    struct Reward {
        address token;
        uint256 amount;
        uint256 recoverableAmount;
        uint256 perStakedToken;
        uint256 claimed;
    }

    struct StakerRewardInfo {
        uint256 consolidatedPerStakedToken;
        uint256 earned;
        uint256 claimed;
    }

    struct Staker {
        uint256 stake;
        uint256 lastConsolidationEpoch;
        uint256 lastConsolidationTimestamp;
        mapping(address => StakerRewardInfo) rewardInfo;
    }

    struct Epoch {
        uint256 startingTimestamp;
        uint256 endingTimestamp;
        uint256 secondsDuration;
        uint256[] rewardAmounts;
    }

    Epoch[] epochs;
    Reward[] rewards;
    mapping(address => Staker) public stakers;
    uint64 public startingTimestamp;
    uint64 public endingTimestamp;
    uint64 public lastConsolidationTimestamp;
    IERC20 public stakableToken;
    address public owner;
    address public factory;
    bool public locked;
    bool public canceled;
    bool public initialized;
    uint256 public lastConsolidationEpoch;
    uint256 public totalStakedTokensAmount;
    uint256 public stakingCap;
    uint256 activeEpochIndex;

    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );
    event Initialized(
        address[] rewardTokenAddresses,
        address stakableTokenAddress,
        uint256[] epochStartingTimestamps,
        uint256[] epochEndingTimestamps,
        uint256[][] epochRewardsBreakdown,
        bool _locked,
        uint256 _stakingCap
    );
    event Canceled();
    event Staked(address indexed staker, uint256 amount);
    event Withdrawn(address indexed withdrawer, uint256 amount);
    event Claimed(address indexed claimer, uint256[] amounts);
    event Recovered(uint256[] amounts);

    function initialize(
        uint256[] calldata _epochStartingTimestamps,
        uint256[] calldata _epochEndingTimestamps,
        uint256[][] calldata _epochRewardsBreakdown,
        address[] calldata _rewardTokenAddresses,
        address _stakableTokenAddress,
        bool _locked,
        uint256 _stakingCap
    ) external onlyUninitialized {
        require(_epochStartingTimestamps.length > 0, "TODO");
        require(
            _epochStartingTimestamps.length == _epochEndingTimestamps.length,
            "TODO"
        );
        require(
            _epochRewardsBreakdown.length == _epochStartingTimestamps.length,
            "TODO"
        );
        uint256 _startingTimestamp = _epochStartingTimestamps[0];
        require(_startingTimestamp >= block.timestamp, "SRD01");

        uint256[] memory _totalFunding =
            new uint256[](_rewardTokenAddresses.length);
        // determining ending timestamp and aggregated total funding
        // based on epochs (so that multiple epoch with same reward tokens
        // and potentially different amount are not funded using 2
        // transferFrom calls, considerably saving gas)
        for (uint256 _i = 0; _i < _epochStartingTimestamps.length; _i++) {
            uint256 _epochStartingTimestamp = _epochStartingTimestamps[_i];
            uint256 _epochEndingTimestamp = _epochEndingTimestamps[_i];
            require(_epochEndingTimestamp > _epochStartingTimestamp, "TODO");
            if (_i > 0) {
                // requires that epochs are adjacent
                require(
                    _epochStartingTimestamp == _epochEndingTimestamps[_i - 1],
                    "TODO"
                );
            }
            uint256 _rewardsLength = _rewardTokenAddresses.length;
            uint256[] memory _epochRewardAmounts = _epochRewardsBreakdown[_i];
            require(_epochRewardAmounts.length == _rewardsLength, "TODO");
            for (uint256 _j = 0; _j = _rewardsLength; _j++) {
                _totalFunding[_j] += _epochRewardAmounts[_j];
            }
            epochs.push(
                Epoch({
                    startingTimestamp: _epochStartingTimestamp,
                    endingTimestamp: _epochEndingTimestamp,
                    secondsDuration: _epochEndingTimestamp -
                        _epochStartingTimestamp,
                    rewardAmounts: _epochRewardAmounts
                })
            );
        }

        // funding-related checks and pushing reward token addresses in the state
        for (uint32 _i = 0; _i < _totalFunding.length; _i++) {
            address _rewardTokenAddress = _rewardTokenAddresses[_i];
            uint256 _rewardAmount = _totalFunding[_i];
            require(_rewardTokenAddress != address(0), "SRD04");
            require(_rewardAmount > 0, "SRD05");
            require(
                IERC20(_rewardTokenAddress).balanceOf(address(this)) >=
                    _rewardAmount,
                "SRD06"
            );
            rewards.push(
                Reward({
                    token: _rewardTokenAddress,
                    amount: _rewardAmount,
                    perStakedToken: 0,
                    recoverableAmount: 0,
                    claimed: 0
                })
            );
        }

        require(_stakableTokenAddress != address(0), "SRD07");
        stakableToken = IERC20(_stakableTokenAddress);

        owner = msg.sender;
        factory = msg.sender;
        startingTimestamp = _startingTimestamp;
        endingTimestamp = _epochEndingTimestamps[
            _epochEndingTimestamps.length - 1
        ];
        lastConsolidationTimestamp = _startingTimestamp;
        locked = _locked;
        stakingCap = _stakingCap;
        initialized = true;
        canceled = false;

        emit Initialized(
            _rewardTokenAddresses,
            _stakableTokenAddress,
            _epochStartingTimestamps,
            _epochEndingTimestamps,
            _epochRewardsBreakdown,
            _locked,
            _stakingCap
        );
    }

    function cancel() external onlyOwner {
        require(initialized && !canceled, "SRD19");
        require(block.timestamp < startingTimestamp, "SRD08");
        for (uint256 _i; _i < rewards.length; _i++) {
            Reward storage _reward = rewards[_i];
            address _rewardTokenAddress = _reward.token;
            IERC20(_rewardTokenAddress).safeTransfer(
                owner,
                IERC20(_rewardTokenAddress).balanceOf(address(this))
            );
        }
        canceled = true;
        emit Canceled();
    }

    function recoverUnassignedRewards() external onlyStarted {
        consolidateReward();
        uint256[] memory _recoveredUnassignedRewards =
            new uint256[](rewards.length);
        bool _atLeastOneNonZeroRecovery = false;
        for (uint256 _i; _i < rewards.length; _i++) {
            Reward storage _reward = rewards[_i];
            address _rewardTokenAddress = _reward.token; // gas savings, avoids double read from storage
            // recoverable rewards are going to be recovered in this tx (if it does not revert),
            // so we add them to the claimed rewards right now
            _reward.claimed += _reward.recoverableAmount / MULTIPLIER;
            delete _reward.recoverableAmount;
            uint256 _recoverableRewards =
                IERC20(_rewardTokenAddress).balanceOf(address(this)) -
                    (_reward.amount - _reward.claimed);
            if (!_atLeastOneNonZeroRecovery && _recoverableRewards > 0)
                _atLeastOneNonZeroRecovery = true;
            _recoveredUnassignedRewards[_i] = _recoverableRewards;
            IERC20(_rewardTokenAddress).safeTransfer(
                owner,
                _recoverableRewards
            );
        }
        require(_atLeastOneNonZeroRecovery, "SRD22");
        emit Recovered(_recoveredUnassignedRewards);
    }

    function stake(uint256 _amount) external onlyRunning {
        require(
            !IERC20StakingRewardsDistributionFactory(factory).stakingPaused(),
            "SRD25"
        );
        require(_amount > 0, "SRD09");
        if (stakingCap > 0) {
            require(totalStakedTokensAmount + _amount <= stakingCap, "SRD10");
        }
        consolidateReward();
        Staker storage _staker = stakers[msg.sender];
        _staker.stake += _amount;
        _staker.lastConsolidationEpoch = activeEpochIndex;
        totalStakedTokensAmount += _amount;
        stakableToken.safeTransferFrom(msg.sender, address(this), _amount);
        emit Staked(msg.sender, _amount);
    }

    function withdraw(uint256 _amount) public onlyStarted {
        require(_amount > 0, "SRD11");
        if (locked) {
            require(block.timestamp > endingTimestamp, "SRD12");
        }
        consolidateReward();
        Staker storage _staker = stakers[msg.sender];
        require(_staker.stake >= _amount, "SRD13");
        _staker.stake -= _amount;
        totalStakedTokensAmount -= _amount;
        stakableToken.safeTransfer(msg.sender, _amount);
        emit Withdrawn(msg.sender, _amount);
    }

    function claim(uint256[] memory _amounts, address _recipient)
        external
        onlyStarted
    {
        require(_amounts.length == rewards.length, "SRD14");
        consolidateReward();
        Staker storage _staker = stakers[msg.sender];
        uint256[] memory _claimedRewards = new uint256[](rewards.length);
        bool _atLeastOneNonZeroClaim = false;
        for (uint256 _i; _i < rewards.length; _i++) {
            Reward storage _reward = rewards[_i];
            StakerRewardInfo storage _stakerRewardInfo =
                _staker.rewardInfo[_reward.token];
            uint256 _claimableReward =
                _stakerRewardInfo.earned - _stakerRewardInfo.claimed;
            uint256 _wantedAmount = _amounts[_i];
            require(_claimableReward >= _wantedAmount, "SRD15");
            if (!_atLeastOneNonZeroClaim && _wantedAmount > 0)
                _atLeastOneNonZeroClaim = true;
            _stakerRewardInfo.claimed += _wantedAmount;
            _reward.claimed += _wantedAmount;
            IERC20(_reward.token).safeTransfer(_recipient, _wantedAmount);
            _claimedRewards[_i] = _wantedAmount;
        }
        require(_atLeastOneNonZeroClaim, "SRD24");
        emit Claimed(msg.sender, _claimedRewards);
    }

    function claimAll(address _recipient) public onlyStarted {
        consolidateReward();
        Staker storage _staker = stakers[msg.sender];
        uint256[] memory _claimedRewards = new uint256[](rewards.length);
        bool _atLeastOneNonZeroClaim = false;
        for (uint256 _i; _i < rewards.length; _i++) {
            Reward storage _reward = rewards[_i];
            StakerRewardInfo storage _stakerRewardInfo =
                _staker.rewardInfo[_reward.token];
            uint256 _claimableReward =
                _stakerRewardInfo.earned - _stakerRewardInfo.claimed;
            if (!_atLeastOneNonZeroClaim && _claimableReward > 0)
                _atLeastOneNonZeroClaim = true;
            _stakerRewardInfo.claimed += _claimableReward;
            _reward.claimed += _claimableReward;
            IERC20(_reward.token).safeTransfer(_recipient, _claimableReward);
            _claimedRewards[_i] = _claimableReward;
        }
        require(_atLeastOneNonZeroClaim, "SRD23");
        emit Claimed(msg.sender, _claimedRewards);
    }

    function exit(address _recipient) external onlyStarted {
        claimAll(_recipient);
        withdraw(stakers[msg.sender].stake);
    }

    function currentEpoch() private returns (Epoch storage) {
        Epoch storage _currentEpoch = epochs[activeEpochIndex];
        // check if current epoch is still active, otherwise, if there's another one, switch to the next
        return
            uint64(block.timestamp) > _currentEpoch.endingTimestamp &&
                activeEpochIndex + 1 < epochs.length
                ? epochs[++activeEpochIndex] // active epoch index gets updated
                : _currentEpoch;
    }

    function consolidateReward() private {
        // gas savings
        uint256 _lastConsolidationTimestamp = lastConsolidationTimestamp;
        uint256 _rewardsLength = rewards.length;
        uint256 _activeEpochIndex = activeEpochIndex;

        Epoch storage _currentEpoch = currentEpoch();

        uint64 _consolidationTimestamp =
            uint64(Math.min(block.timestamp, _currentEpoch.endingTimestamp));
        uint256 _lastPeriodDuration =
            uint256(_consolidationTimestamp - _lastConsolidationTimestamp);

        // update global data for each involved epoch. If last period duration is 0, nothing needs to be changed
        if (_lastPeriodDuration > 0) {
            uint256 _involvedEpochs =
                _activeEpochIndex - lastConsolidationEpoch;
            for (uint256 _i = _involvedEpochs; _i >= 0; _i--) {
                Epoch storage _epoch = epochs[_activeEpochIndex - _i];
                uint256 _epochPeriodDuration =
                    Math.min(_epoch.endingTimestamp, _consolidationTimestamp) -
                        Math.max(
                            _epoch.startingTimestamp,
                            _lastConsolidationTimestamp
                        );
                for (uint256 _j; _j < _rewardsLength; _j++) {
                    Reward storage _reward = rewards[_j];
                    uint256 _assignedRewardInEpochPeriod =
                        ((_epochPeriodDuration *
                            _epoch.rewardAmount *
                            MULTIPLIER) /
                            (totalStakedTokensAmount * _epoch.secondsDuration));
                    if (totalStakedTokensAmount == 0) {
                        _reward
                            .recoverableAmount += _assignedRewardInEpochPeriod;
                    } else {
                        _reward.perStakedToken += _assignedRewardInEpochPeriod;
                    }
                }
            }
        }

        Staker storage _staker = stakers[msg.sender];
        for (uint256 _j; _j < _rewardsLength; _j++) {
            Reward storage _reward = rewards[_j];
            StakerRewardInfo storage _stakerRewardInfo =
                _staker.rewardInfo[_reward.token];
            uint256 _rewardSinceLastConsolidation =
                (_staker.stake *
                    (_reward.perStakedToken -
                        _stakerRewardInfo.consolidatedPerStakedToken)) /
                    MULTIPLIER;
            if (_rewardSinceLastConsolidation > 0) {
                _stakerRewardInfo.earned += _rewardSinceLastConsolidation;
            }
            _stakerRewardInfo.consolidatedPerStakedToken = _reward
                .perStakedToken;
        }

        lastConsolidationTimestamp = _consolidationTimestamp;
        lastConsolidationEpoch = _activeEpochIndex;
    }

    function claimableRewards(address _acLength)
        public
        view
        returns (uint256[] memory)
    {
        uint256[] memory _outstandingRewards = new uint256[](rewards.length);
        if (!initialized || block.timestamp < startingTimestamp) {
            for (uint256 _i; _i < rewards.length; _i++) {
                _outstandingRewards[_i] = 0;
            }
            return _outstandingRewards;
        }
        Staker storage _staker = stakers[_acLength];
        uint64 _consolidationTimestamp =
            uint64(Math.min(block.timestamp, endingTimestamp));
        uint256 _lastPeriodDuration =
            uint256(_consolidationTimestamp - lastConsolidationTimestamp);
        for (uint256 _i; _i < rewards.length; _i++) {
            Reward storage _reward = rewards[_i];
            StakerRewardInfo storage _stakerRewardInfo =
                _staker.rewardInfo[_reward.token];
            uint256 _localRewardPerStakedToken = _reward.perStakedToken;
            if (_lastPeriodDuration > 0 && totalStakedTokensAmount > 0) {
                _localRewardPerStakedToken += ((_lastPeriodDuration *
                    _reward.amount *
                    MULTIPLIER) / (totalStakedTokensAmount * secondsDuration));
            }
            uint256 _rewardSinceLastConsolidation =
                (_staker.stake *
                    (_localRewardPerStakedToken -
                        _stakerRewardInfo.consolidatedPerStakedToken)) /
                    MULTIPLIER;
            _outstandingRewards[_i] =
                _rewardSinceLastConsolidation +
                (_stakerRewardInfo.earned - _stakerRewardInfo.claimed);
        }
        return _outstandingRewards;
    }

    function getRewardTokens() external view returns (address[] memory) {
        address[] memory _rewardTokens = new address[](rewards.length);
        for (uint256 _i = 0; _i < rewards.length; _i++) {
            _rewardTokens[_i] = rewards[_i].token;
        }
        return _rewardTokens;
    }

    function rewardAmount(address _rewardToken)
        external
        view
        returns (uint256)
    {
        for (uint256 _i = 0; _i < rewards.length; _i++) {
            Reward storage _reward = rewards[_i];
            if (_rewardToken == _reward.token) return _reward.amount;
        }
        return 0;
    }

    function stakedTokensOf(address _staker) external view returns (uint256) {
        return stakers[_staker].stake;
    }

    function earnedRewardsOf(address _staker)
        external
        view
        returns (uint256[] memory)
    {
        Staker storage _stakerFromStorage = stakers[_staker];
        uint256[] memory _earnedRewards = new uint256[](rewards.length);
        for (uint256 _i; _i < rewards.length; _i++) {
            _earnedRewards[_i] = _stakerFromStorage.rewardInfo[
                rewards[_i].token
            ]
                .earned;
        }
        return _earnedRewards;
    }

    function recoverableUnassignedReward(address _rewardToken)
        external
        view
        returns (uint256)
    {
        for (uint256 _i = 0; _i < rewards.length; _i++) {
            Reward storage _reward = rewards[_i];
            if (_reward.token == _rewardToken) {
                uint256 _nontotalFunds =
                    _reward.claimed + _reward.recoverableAmount / MULTIPLIER;
                return
                    IERC20(_reward.token).balanceOf(address(this)) -
                    (_reward.amount - _nontotalFunds);
            }
        }
        return 0;
    }

    function getClaimedRewards(address _claimer)
        external
        view
        returns (uint256[] memory)
    {
        Staker storage _staker = stakers[_claimer];
        uint256[] memory _claimedRewards = new uint256[](rewards.length);
        for (uint256 _i = 0; _i < rewards.length; _i++) {
            Reward storage _reward = rewards[_i];
            _claimedRewards[_i] = _staker.rewardInfo[_reward.token].claimed;
        }
        return _claimedRewards;
    }

    function renounceOwnership() public onlyOwner {
        owner = address(0);
        emit OwnershipTransferred(owner, address(0));
    }

    function transferOwnership(address _newOwner) public onlyOwner {
        require(_newOwner != address(0), "SRD16");
        emit OwnershipTransferred(owner, _newOwner);
        owner = _newOwner;
    }

    modifier onlyOwner() {
        require(owner == msg.sender, "SRD17");
        _;
    }

    modifier onlyUninitialized() {
        require(!initialized, "SRD18");
        _;
    }

    modifier onlyStarted() {
        require(
            initialized && !canceled && block.timestamp >= startingTimestamp,
            "SRD20"
        );
        _;
    }

    modifier onlyRunning() {
        require(
            initialized &&
                !canceled &&
                block.timestamp >= startingTimestamp &&
                block.timestamp <= endingTimestamp,
            "SRD21"
        );
        _;
    }
}
