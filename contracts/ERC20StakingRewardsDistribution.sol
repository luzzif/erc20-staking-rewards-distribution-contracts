// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

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
 * SRD19: not initialized
 * SRD20: not started
 * SRD21: already ended
 */
contract ERC20StakingRewardsDistribution {
    using SafeERC20 for IERC20;

    uint224 constant MULTIPLIER = 2**112;

    struct Reward {
        address token;
        uint256 amount;
        uint256 perStakedToken;
        uint256 recoverable;
        uint256 claimed;
    }

    address public owner;
    Reward[] public rewards;
    IERC20 public stakableToken;
    mapping(address => uint256) public stakedTokenAmount;
    uint256 public totalStakedTokensAmount;
    uint64 public startingTimestamp;
    uint64 public endingTimestamp;
    uint64 public secondsDuration;
    bool public locked;
    uint256 public stakingCap;
    bool public initialized;
    uint64 public lastConsolidationTimestamp;

    mapping(address => uint256) public stakedTokensOf;
    mapping(address => mapping(address => uint256))
        public consolidatedRewardsPerStakedToken;
    mapping(address => mapping(address => uint256)) public earnedRewards;
    mapping(address => mapping(address => uint256)) public claimedReward;

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

    function recoverableUnassignedReward(address _rewardToken)
        external
        view
        returns (uint256)
    {
        for (uint256 _i = 0; _i < rewards.length; _i++) {
            Reward storage _reward = rewards[_i];
            if (_rewardToken == _reward.token) return _reward.recoverable;
        }
        return 0;
    }

    function getClaimedRewards(address _claimer)
        external
        view
        returns (uint256[] memory)
    {
        uint256[] memory _claimedRewards = new uint256[](rewards.length);
        for (uint256 _i = 0; _i < rewards.length; _i++) {
            Reward storage _reward = rewards[_i];
            _claimedRewards[_i] = claimedReward[_claimer][_reward.token];
        }
        return _claimedRewards;
    }

    function initialize(
        address[] calldata _rewardTokenAddresses,
        address _stakableTokenAddress,
        uint256[] calldata _rewardAmounts,
        uint64 _startingTimestamp,
        uint64 _endingTimestamp,
        bool _locked,
        uint256 _stakingCap
    ) external onlyUninitialized {
        require(_startingTimestamp > block.timestamp, "SRD01");
        require(_endingTimestamp > _startingTimestamp, "SRD02");
        require(_rewardTokenAddresses.length == _rewardAmounts.length, "SRD03");

        secondsDuration = _endingTimestamp - _startingTimestamp;
        // Initializing reward tokens and amounts
        for (uint32 _i = 0; _i < _rewardTokenAddresses.length; _i++) {
            address _rewardTokenAddress = _rewardTokenAddresses[_i];
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
                    perStakedToken: 0,
                    recoverable: 0,
                    claimed: 0
                })
            );
        }

        require(_stakableTokenAddress != address(0), "SRD07");
        stakableToken = IERC20(_stakableTokenAddress);

        owner = msg.sender;
        startingTimestamp = _startingTimestamp;
        endingTimestamp = _endingTimestamp;
        lastConsolidationTimestamp = _startingTimestamp;
        locked = _locked;
        stakingCap = _stakingCap;

        initialized = true;
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

    function cancel() external onlyOwner {
        require(initialized, "SRD19");
        require(block.timestamp < startingTimestamp, "SRD08");
        // resetting reward information (both tokens and amounts)
        for (uint256 _i; _i < rewards.length; _i++) {
            Reward storage _reward = rewards[_i];
            delete _reward.amount;
            IERC20(_reward.token).safeTransfer(
                owner,
                IERC20(_reward.token).balanceOf(address(this))
            );
        }
        delete rewards;
        delete stakableToken;
        startingTimestamp = 0;
        endingTimestamp = 0;
        lastConsolidationTimestamp = 0;
        initialized = false;
        locked = false;
        emit Canceled();
    }

    function recoverUnassignedRewards() external onlyStarted {
        consolidateReward();
        uint256[] memory _recoveredUnassignedRewards =
            new uint256[](rewards.length);
        for (uint256 _i; _i < rewards.length; _i++) {
            Reward storage _reward = rewards[_i];
            // recoverable rewards are going to be recovered in this tx (if it does not revert),
            // so we add them to the claimed rewards right now
            _reward.claimed += _reward.recoverable;
            delete _reward.recoverable;
            uint256 _recoverableRewards =
                IERC20(_reward.token).balanceOf(address(this)) -
                    (_reward.amount - _reward.claimed);
            _recoveredUnassignedRewards[_i] = _recoverableRewards;
            IERC20(_reward.token).safeTransfer(owner, _recoverableRewards);
        }
        emit Recovered(_recoveredUnassignedRewards);
    }

    function stake(uint256 _amount) external onlyRunning {
        require(_amount > 0, "SRD09");
        if (stakingCap > 0) {
            require(totalStakedTokensAmount + _amount <= stakingCap, "SRD10");
        }
        consolidateReward();
        stakedTokensOf[msg.sender] = stakedTokensOf[msg.sender] + _amount;
        totalStakedTokensAmount = totalStakedTokensAmount + _amount;
        stakableToken.safeTransferFrom(msg.sender, address(this), _amount);
        emit Staked(msg.sender, _amount);
    }

    function withdraw(uint256 _amount) public onlyStarted {
        require(_amount > 0, "SRD11");
        if (locked) {
            require(block.timestamp > endingTimestamp, "SRD12");
        }
        consolidateReward();
        require(_amount <= stakedTokensOf[msg.sender], "SRD13");
        stakedTokensOf[msg.sender] -= _amount;
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
        uint256[] memory _claimedRewards = new uint256[](rewards.length);
        for (uint256 _i; _i < rewards.length; _i++) {
            Reward storage _reward = rewards[_i];
            uint256 _claimableReward =
                earnedRewards[msg.sender][_reward.token] -
                    claimedReward[msg.sender][_reward.token];
            uint256 _wantedAmount = _amounts[_i];
            require(_claimableReward >= _wantedAmount, "SRD15");
            consolidateAndTransferClaim(_reward, _wantedAmount, _recipient);
            _claimedRewards[_i] = _wantedAmount;
        }
        emit Claimed(msg.sender, _claimedRewards);
    }

    function claimAll(address _recipient) public onlyStarted {
        consolidateReward();
        uint256[] memory _claimedRewards = new uint256[](rewards.length);
        for (uint256 _i; _i < rewards.length; _i++) {
            Reward storage _reward = rewards[_i];
            uint256 _claimableReward =
                earnedRewards[msg.sender][_reward.token] -
                    claimedReward[msg.sender][_reward.token];
            consolidateAndTransferClaim(_reward, _claimableReward, _recipient);
            _claimedRewards[_i] = _claimableReward;
        }
        emit Claimed(msg.sender, _claimedRewards);
    }

    function exit(address _recipient) external onlyStarted {
        consolidateReward();
        claimAll(_recipient);
        withdraw(stakedTokensOf[msg.sender]);
    }

    function consolidateAndTransferClaim(
        Reward storage _reward,
        uint256 _amount,
        address _recipient
    ) private {
        claimedReward[msg.sender][_reward.token] += _amount;
        _reward.claimed += _amount;
        IERC20(_reward.token).safeTransfer(_recipient, _amount);
    }

    function consolidateReward() public onlyStarted {
        uint64 _consolidationTimestamp =
            uint64(Math.min(block.timestamp, endingTimestamp));
        uint256 _lastPeriodDuration =
            uint256(_consolidationTimestamp - lastConsolidationTimestamp);
        for (uint256 _i; _i < rewards.length; _i++) {
            Reward storage _reward = rewards[_i];
            if (totalStakedTokensAmount == 0) {
                // If the current staked tokens amount is zero, there have been unassigned rewards in the last period.
                // We add these unassigned rewards to the amount that can be claimed back by the contract's owner.
                _reward.recoverable += ((_lastPeriodDuration * _reward.amount) /
                    secondsDuration);
                _reward.perStakedToken = 0;
                consolidatedRewardsPerStakedToken[msg.sender][
                    _reward.token
                ] = 0;
                continue;
            } else {
                _reward.perStakedToken += ((_lastPeriodDuration *
                    _reward.amount *
                    MULTIPLIER) / (totalStakedTokensAmount * secondsDuration));
            }
            uint256 _rewardInCurrentPeriod =
                _reward.perStakedToken > 0
                    ? (stakedTokensOf[msg.sender] *
                        (_reward.perStakedToken -
                            consolidatedRewardsPerStakedToken[msg.sender][
                                _reward.token
                            ])) / MULTIPLIER
                    : 0;
            earnedRewards[msg.sender][_reward.token] += _rewardInCurrentPeriod;
            consolidatedRewardsPerStakedToken[msg.sender][
                _reward.token
            ] = _reward.perStakedToken;
        }
        lastConsolidationTimestamp = _consolidationTimestamp;
    }

    function claimableRewards(address _staker)
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
        uint64 _consolidationTimestamp =
            uint64(Math.min(block.timestamp, endingTimestamp));
        uint256 _lastPeriodDuration =
            uint256(_consolidationTimestamp - lastConsolidationTimestamp);
        for (uint256 _i; _i < rewards.length; _i++) {
            Reward storage _reward = rewards[_i];
            address _relatedRewardTokenAddress = _reward.token;
            uint256 _localRewardPerStakedToken = _reward.perStakedToken;
            _outstandingRewards[_i] =
                earnedRewards[_staker][_reward.token] -
                claimedReward[_staker][_reward.token];
            if (totalStakedTokensAmount == 0) {
                _localRewardPerStakedToken = 0;
                // no rewards in the current period, skip rest of the calculations
                continue;
            } else {
                _localRewardPerStakedToken += ((_lastPeriodDuration *
                    _reward.amount *
                    MULTIPLIER) / (totalStakedTokensAmount * secondsDuration));
            }
            uint256 _rewardsInTheCurrentPeriod =
                _localRewardPerStakedToken > 0
                    ? (stakedTokensOf[_staker] *
                        (_localRewardPerStakedToken -
                            consolidatedRewardsPerStakedToken[_staker][
                                _relatedRewardTokenAddress
                            ])) / MULTIPLIER
                    : 0;
            // the claimable reward basically is the one not yet consolidated in the current period plus any
            // previously consolidated/earned but unclaimed reward
            _outstandingRewards[_i] += _rewardsInTheCurrentPeriod;
        }
        return _outstandingRewards;
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
        require(initialized && block.timestamp >= startingTimestamp, "SRD20");
        _;
    }

    modifier onlyRunning() {
        require(
            initialized &&
                block.timestamp >= startingTimestamp &&
                block.timestamp <= endingTimestamp,
            "SRD21"
        );
        _;
    }
}
