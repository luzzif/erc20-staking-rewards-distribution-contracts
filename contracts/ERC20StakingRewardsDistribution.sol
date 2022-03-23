// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.12;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IERC20StakingRewardsDistributionFactory.sol";
import "./interfaces/IERC20StakingRewardsDistribution.sol";

/**
 * Errors codes:
 *
 * SRD01: invalid starting timestamp
 * SRD02: invalid time duration
 * SRD03: inconsistent reward token/amount
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
 * SRD26: no rewards were added
 * SRD27: maximum number of reward tokens breached
 * SRD28: duplicated reward tokens
 * SRD29: distribution must be canceled
 */
contract ERC20StakingRewardsDistribution is IERC20StakingRewardsDistribution {
    using SafeERC20 for IERC20;

    uint224 constant MULTIPLIER = 2**112;

    struct Reward {
        address token;
        uint256 amount;
        uint256 toBeRewarded;
        uint256 perStakedToken;
        uint256 recoverableAmount;
        uint256 claimed;
    }

    struct StakerRewardInfo {
        uint256 consolidatedPerStakedToken;
        uint256 earned;
        uint256 claimed;
    }

    struct Staker {
        uint256 stake;
        mapping(address => StakerRewardInfo) rewardInfo;
    }

    Reward[] public rewards;
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
    uint256 public totalStakedTokensAmount;
    uint256 public stakingCap;

    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );
    event Initialized(
        address[] rewardsTokenAddresses,
        address stakableTokenAddress,
        uint256[] rewardsAmounts,
        uint64 startingTimestamp,
        uint64 endingTimestamp,
        bool locked,
        uint256 stakingCap
    );
    event Canceled();
    event Staked(address indexed staker, uint256 amount);
    event Withdrawn(address indexed withdrawer, uint256 amount);
    event Claimed(address indexed claimer, uint256[] amounts);
    event Recovered(uint256[] amounts);
    event RecoveredAfterCancel(address token, uint256 amount);
    event UpdatedRewards(uint256[] amounts);

    function initialize(
        address[] calldata _rewardTokenAddresses,
        address _stakableTokenAddress,
        uint256[] calldata _rewardAmounts,
        uint64 _startingTimestamp,
        uint64 _endingTimestamp,
        bool _locked,
        uint256 _stakingCap
    ) external override onlyUninitialized {
        require(_startingTimestamp > block.timestamp, "SRD01");
        require(_endingTimestamp > _startingTimestamp, "SRD02");
        require(_rewardTokenAddresses.length == _rewardAmounts.length, "SRD03");
        require(_rewardTokenAddresses.length <= 5, "SRD27");

        // Initializing reward tokens and amounts
        for (uint8 _i = 0; _i < _rewardTokenAddresses.length; _i++) {
            address _rewardTokenAddress = _rewardTokenAddresses[_i];

            // checking for duplicates
            for (uint8 _j = _i + 1; _j < _rewardTokenAddresses.length; _j++)
                require(
                    _rewardTokenAddress != _rewardTokenAddresses[_j],
                    "SRD28"
                );

            uint256 _rewardAmount = _rewardAmounts[_i];
            require(_rewardTokenAddress != address(0), "SRD04");
            require(_rewardAmount > 0, "SRD05");
            IERC20 _rewardToken = IERC20(_rewardTokenAddress);
            require(
                _rewardToken.balanceOf(address(this)) >= _rewardAmount,
                "SRD06"
            );
            rewards.push(
                Reward({
                    token: _rewardTokenAddress,
                    amount: _rewardAmount,
                    toBeRewarded: _rewardAmount * MULTIPLIER,
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
        endingTimestamp = _endingTimestamp;
        lastConsolidationTimestamp = _startingTimestamp;
        locked = _locked;
        stakingCap = _stakingCap;
        initialized = true;
        canceled = false;

        emit Initialized(
            _rewardTokenAddresses,
            _stakableTokenAddress,
            _rewardAmounts,
            _startingTimestamp,
            _endingTimestamp,
            _locked,
            _stakingCap
        );
    }

    function cancel() external override onlyOwner {
        require(initialized && !canceled, "SRD19");
        require(block.timestamp < startingTimestamp, "SRD08");
        for (uint256 _i; _i < rewards.length; _i++) {
            Reward storage _reward = rewards[_i];
            IERC20(_reward.token).safeTransfer(
                owner,
                IERC20(_reward.token).balanceOf(address(this))
            );
        }
        canceled = true;
        emit Canceled();
    }

    function recoverRewardAfterCancel(address _token)
        external
        override
        onlyOwner
    {
        require(canceled, "SRD29");
        for (uint256 _i; _i < rewards.length; _i++) {
            Reward memory _reward = rewards[_i];
            if (_reward.token == _token) {
                uint256 _recoveredAmount =
                    IERC20(_reward.token).balanceOf(address(this));
                IERC20(_reward.token).safeTransfer(owner, _recoveredAmount);
                emit RecoveredAfterCancel(_token, _recoveredAmount);
                break;
            }
        }
    }

    function recoverUnassignedRewards()
        external
        override
        onlyOwner
        onlyStarted
    {
        consolidateReward();
        uint256[] memory _recoveredUnassignedRewards =
            new uint256[](rewards.length);
        for (uint256 _i; _i < rewards.length; _i++) {
            Reward storage _reward = rewards[_i];
            // recoverable rewards are going to be recovered in this tx (if it does not revert),
            // so we add them to the claimed rewards right now
            _reward.claimed += _reward.recoverableAmount / MULTIPLIER;
            delete _reward.recoverableAmount;
            uint256 _recoverableRewards =
                IERC20(_reward.token).balanceOf(address(this)) -
                    (_reward.amount - _reward.claimed);
            if (_recoverableRewards > 0) {
                _recoveredUnassignedRewards[_i] = _recoverableRewards;
                IERC20(_reward.token).safeTransfer(owner, _recoverableRewards);
            }
        }
        emit Recovered(_recoveredUnassignedRewards);
    }

    function recoverSpecificUnassignedRewards(address _token)
        external
        override
        onlyOwner
        onlyStarted
    {
        consolidateReward();
        uint256[] memory _recoveredUnassignedRewards =
            new uint256[](rewards.length);
        for (uint256 _i; _i < rewards.length; _i++) {
            Reward storage _reward = rewards[_i];
            address _rewardToken = _reward.token;
            if (_token == _rewardToken) {
                // recoverable rewards are going to be recovered in this tx (if it does not revert),
                // so we add them to the claimed rewards right now
                _reward.claimed += _reward.recoverableAmount / MULTIPLIER;
                delete _reward.recoverableAmount;
                uint256 _recoverableRewards =
                    IERC20(_rewardToken).balanceOf(address(this)) -
                        (_reward.amount - _reward.claimed);
                if (_recoverableRewards > 0) {
                    _recoveredUnassignedRewards[_i] = _recoverableRewards;
                    IERC20(_rewardToken).safeTransfer(
                        owner,
                        _recoverableRewards
                    );
                }
                break;
            }
        }
        emit Recovered(_recoveredUnassignedRewards);
    }

    function stake(uint256 _amount) external override onlyRunning {
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
        totalStakedTokensAmount += _amount;
        stakableToken.safeTransferFrom(msg.sender, address(this), _amount);
        emit Staked(msg.sender, _amount);
    }

    function withdraw(uint256 _amount) public override onlyStarted {
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
        override
        onlyStarted
    {
        require(_amounts.length == rewards.length, "SRD14");
        consolidateReward();
        Staker storage _staker = stakers[msg.sender];
        uint256[] memory _claimedRewards = new uint256[](rewards.length);
        for (uint256 _i; _i < rewards.length; _i++) {
            Reward storage _reward = rewards[_i];
            StakerRewardInfo storage _stakerRewardInfo =
                _staker.rewardInfo[_reward.token];
            uint256 _claimableReward =
                _stakerRewardInfo.earned - _stakerRewardInfo.claimed;
            uint256 _wantedAmount = _amounts[_i];
            require(_claimableReward >= _wantedAmount, "SRD15");
            if (_wantedAmount > 0) {
                _stakerRewardInfo.claimed += _wantedAmount;
                _reward.claimed += _wantedAmount;
                IERC20(_reward.token).safeTransfer(_recipient, _wantedAmount);
                _claimedRewards[_i] = _wantedAmount;
            }
        }
        emit Claimed(msg.sender, _claimedRewards);
    }

    function claimAll(address _recipient) public override onlyStarted {
        consolidateReward();
        Staker storage _staker = stakers[msg.sender];
        uint256[] memory _claimedRewards = new uint256[](rewards.length);
        for (uint256 _i; _i < rewards.length; _i++) {
            Reward storage _reward = rewards[_i];
            address _rewardToken = _reward.token;
            StakerRewardInfo storage _stakerRewardInfo =
                _staker.rewardInfo[_rewardToken];
            uint256 _claimableReward =
                _stakerRewardInfo.earned - _stakerRewardInfo.claimed;
            if (_claimableReward > 0) {
                _stakerRewardInfo.claimed += _claimableReward;
                _reward.claimed += _claimableReward;
                IERC20(_rewardToken).safeTransfer(_recipient, _claimableReward);
                _claimedRewards[_i] = _claimableReward;
            }
        }
        emit Claimed(msg.sender, _claimedRewards);
    }

    function claimAllSpecific(address _token, address _recipient)
        external
        override
        onlyStarted
    {
        consolidateReward();
        Staker storage _staker = stakers[msg.sender];
        uint256[] memory _claimedRewards = new uint256[](rewards.length);
        for (uint256 _i; _i < rewards.length; _i++) {
            Reward storage _reward = rewards[_i];
            address _rewardToken = _reward.token;
            if (_token == _rewardToken) {
                StakerRewardInfo storage _stakerRewardInfo =
                    _staker.rewardInfo[_rewardToken];
                uint256 _claimableReward =
                    _stakerRewardInfo.earned - _stakerRewardInfo.claimed;
                if (_claimableReward > 0) {
                    _stakerRewardInfo.claimed += _claimableReward;
                    _reward.claimed += _claimableReward;
                    IERC20(_rewardToken).safeTransfer(
                        _recipient,
                        _claimableReward
                    );
                    _claimedRewards[_i] = _claimableReward;
                }
                break;
            }
        }
        emit Claimed(msg.sender, _claimedRewards);
    }

    function exit(address _recipient) external override {
        claimAll(_recipient);
        withdraw(stakers[msg.sender].stake);
    }

    function addRewards(address _token, uint256 _amount)
        external
        override
        onlyStarted
    {
        consolidateReward();
        uint256[] memory _updatedAmounts = new uint256[](rewards.length);
        bool _atLeastOneUpdate = false;
        for (uint8 _i = 0; _i < rewards.length; _i++) {
            Reward storage _reward = rewards[_i];
            if (_reward.token == _token) {
                _reward.amount += _amount;
                _reward.toBeRewarded += _amount * MULTIPLIER;
                _atLeastOneUpdate = true;
                IERC20(_token).safeTransferFrom(
                    msg.sender,
                    address(this),
                    _amount
                );
            }
            _updatedAmounts[_i] = _reward.amount;
        }
        require(_atLeastOneUpdate, "SRD26");
        emit UpdatedRewards(_updatedAmounts);
    }

    function consolidateReward() private {
        uint64 _consolidationTimestamp =
            uint64(Math.min(block.timestamp, endingTimestamp));
        uint256 _lastPeriodDuration =
            uint256(_consolidationTimestamp - lastConsolidationTimestamp);
        uint256 _durationLeft =
            uint256(endingTimestamp - lastConsolidationTimestamp);
        Staker storage _staker = stakers[msg.sender];
        for (uint256 _i; _i < rewards.length; _i++) {
            Reward storage _reward = rewards[_i];
            StakerRewardInfo storage _stakerRewardInfo =
                _staker.rewardInfo[_reward.token];
            if (_lastPeriodDuration > 0) {
                uint256 _periodReward =
                    (_lastPeriodDuration * _reward.toBeRewarded) /
                        _durationLeft;
                if (totalStakedTokensAmount == 0) {
                    _reward.recoverableAmount += _periodReward;
                    // no need to update the reward per staked token since in this period
                    // there have been no staked tokens, so no reward has been given out to stakers
                } else {
                    _reward.perStakedToken +=
                        _periodReward /
                        totalStakedTokensAmount;
                }
                _reward.toBeRewarded -= _periodReward;
            }
            uint256 _rewardSinceLastConsolidation =
                (_staker.stake *
                    (_reward.perStakedToken -
                        _stakerRewardInfo.consolidatedPerStakedToken)) /
                    MULTIPLIER;
            _stakerRewardInfo.earned += _rewardSinceLastConsolidation;
            _stakerRewardInfo.consolidatedPerStakedToken = _reward
                .perStakedToken;
        }
        lastConsolidationTimestamp = _consolidationTimestamp;
    }

    function claimableRewards(address _account)
        external
        view
        override
        returns (uint256[] memory)
    {
        uint256[] memory _outstandingRewards = new uint256[](rewards.length);
        if (!initialized || block.timestamp < startingTimestamp)
            return _outstandingRewards;
        Staker storage _staker = stakers[_account];
        uint64 _consolidationTimestamp =
            uint64(Math.min(block.timestamp, endingTimestamp));
        uint256 _lastPeriodDuration =
            uint256(_consolidationTimestamp - lastConsolidationTimestamp);
        uint256 _durationLeft =
            uint256(endingTimestamp - lastConsolidationTimestamp);
        for (uint256 _i; _i < rewards.length; _i++) {
            Reward storage _reward = rewards[_i];
            StakerRewardInfo storage _stakerRewardInfo =
                _staker.rewardInfo[_reward.token];
            uint256 _localRewardPerStakedToken = _reward.perStakedToken;
            if (_lastPeriodDuration > 0 && totalStakedTokensAmount > 0) {
                _localRewardPerStakedToken +=
                    (_lastPeriodDuration * _reward.toBeRewarded) /
                    totalStakedTokensAmount /
                    _durationLeft;
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

    function getRewardTokens()
        external
        view
        override
        returns (address[] memory)
    {
        address[] memory _rewardTokens = new address[](rewards.length);
        for (uint256 _i = 0; _i < rewards.length; _i++) {
            _rewardTokens[_i] = rewards[_i].token;
        }
        return _rewardTokens;
    }

    function rewardAmount(address _rewardToken)
        external
        view
        override
        returns (uint256)
    {
        for (uint256 _i = 0; _i < rewards.length; _i++) {
            Reward storage _reward = rewards[_i];
            if (_rewardToken == _reward.token) return _reward.amount;
        }
        return 0;
    }

    function stakedTokensOf(address _staker)
        external
        view
        override
        returns (uint256)
    {
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
        override
        returns (uint256)
    {
        for (uint256 _i = 0; _i < rewards.length; _i++) {
            Reward storage _reward = rewards[_i];
            if (_reward.token == _rewardToken) {
                uint256 _nonRequiredFunds =
                    _reward.claimed + (_reward.recoverableAmount / MULTIPLIER);
                return
                    IERC20(_reward.token).balanceOf(address(this)) -
                    (_reward.amount - _nonRequiredFunds);
            }
        }
        return 0;
    }

    function getClaimedRewards(address _claimer)
        external
        view
        override
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

    function renounceOwnership() external override onlyOwner {
        owner = address(0);
        emit OwnershipTransferred(owner, address(0));
    }

    function transferOwnership(address _newOwner) external override onlyOwner {
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
