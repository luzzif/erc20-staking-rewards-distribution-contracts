// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ERC20StakingRewardsDistribution is Ownable {
    using SafeMath for uint256;
    using SafeMath for uint64;
    using SafeERC20 for ERC20;

    uint224 constant MULTIPLIER = 2**112;

    ERC20[] public rewardTokens;
    ERC20 public stakableToken;
    mapping(address => uint256) public rewardAmount;
    mapping(address => uint256) public stakedTokenAmount;
    uint256 public totalStakedTokensAmount;
    mapping(address => uint256) public rewardPerStakedToken;
    uint64 public startingTimestamp;
    uint64 public endingTimestamp;
    uint64 public secondsDuration;
    bool public locked;
    bool public initialized;
    uint64 public lastConsolidationTimestamp;
    mapping(address => uint256) public recoverableUnassignedReward;
    mapping(address => uint256) public totalClaimedRewards;

    mapping(address => uint256) public stakedTokensOf;
    mapping(address => mapping(address => uint256))
        public consolidatedRewardsPerStakedToken;
    mapping(address => mapping(address => uint256)) public earnedRewards;
    mapping(address => mapping(address => uint256)) public claimedReward;

    event Initialized(
        address[] rewardsTokenAddresses,
        address stakableTokenAddress,
        uint256[] rewardsAmounts,
        uint64 startingTimestamp,
        uint64 endingTimestamp,
        bool locked
    );
    event Canceled();
    event Staked(address indexed staker, uint256 amount);
    event Withdrawn(address indexed withdrawer, uint256 amount);
    event Claimed(address indexed claimer, uint256[] amounts);
    event Recovered(uint256[] amounts);

    function getRewardTokens() external view returns (ERC20[] memory) {
        return rewardTokens;
    }

    function getClaimedRewards(address _claimer)
        external
        view
        returns (uint256[] memory)
    {
        uint256[] memory _claimedRewards = new uint256[](rewardTokens.length);
        for (uint256 _i = 0; _i < rewardTokens.length; _i++) {
            _claimedRewards[_i] = claimedReward[_claimer][
                address(rewardTokens[_i])
            ];
        }
        return _claimedRewards;
    }

    function initialize(
        address[] calldata _rewardTokenAddresses,
        address _stakableTokenAddress,
        uint256[] calldata _rewardAmounts,
        uint64 _startingTimestamp,
        uint64 _endingTimestamp,
        bool _locked
    ) external onlyOwner onlyUninitialized {
        require(
            _startingTimestamp > block.timestamp,
            "ERC20StakingRewardsDistribution: invalid starting timestamp"
        );
        require(
            _endingTimestamp > _startingTimestamp,
            "ERC20StakingRewardsDistribution: invalid time duration"
        );
        require(
            _rewardTokenAddresses.length == _rewardAmounts.length,
            "ERC20StakingRewardsDistribution: inconsistent reward token/amount"
        );

        secondsDuration = _endingTimestamp - _startingTimestamp;
        // Initializing reward tokens and amounts
        for (uint32 _i = 0; _i < _rewardTokenAddresses.length; _i++) {
            address _rewardTokenAddress = _rewardTokenAddresses[_i];
            uint256 _rewardAmount = _rewardAmounts[_i];
            require(
                _rewardTokenAddress != address(0),
                "ERC20StakingRewardsDistribution: 0 address as reward token"
            );
            require(
                _rewardAmount > 0,
                "ERC20StakingRewardsDistribution: no reward"
            );
            ERC20 _rewardToken = ERC20(_rewardTokenAddress);
            require(
                _rewardToken.balanceOf(address(this)) >= _rewardAmount,
                "ERC20StakingRewardsDistribution: no funding"
            );
            rewardTokens.push(_rewardToken);
            rewardAmount[_rewardTokenAddress] = _rewardAmount;
        }

        require(
            _stakableTokenAddress != address(0),
            "ERC20StakingRewardsDistribution: 0 address as stakable token"
        );
        stakableToken = ERC20(_stakableTokenAddress);

        startingTimestamp = _startingTimestamp;
        endingTimestamp = _endingTimestamp;
        lastConsolidationTimestamp = _startingTimestamp;
        locked = _locked;

        initialized = true;
        emit Initialized(
            _rewardTokenAddresses,
            _stakableTokenAddress,
            _rewardAmounts,
            _startingTimestamp,
            _endingTimestamp,
            _locked
        );
    }

    function cancel() external onlyInitialized onlyOwner {
        require(
            block.timestamp < startingTimestamp,
            "ERC20StakingRewardsDistribution: distribution already started"
        );
        // resetting reward information (both tokens and amounts)
        for (uint256 _i; _i < rewardTokens.length; _i++) {
            ERC20 _rewardToken = rewardTokens[_i];
            delete rewardAmount[address(_rewardToken)];
            _rewardToken.safeTransfer(
                owner(),
                _rewardToken.balanceOf(address(this))
            );
        }
        delete rewardTokens;
        delete stakableToken;
        startingTimestamp = 0;
        endingTimestamp = 0;
        lastConsolidationTimestamp = 0;
        initialized = false;
        locked = false;
        emit Canceled();
    }

    function recoverUnassignedRewards() external onlyInitialized onlyStarted {
        consolidateReward();
        uint256 _numberOfRewardsTokens = rewardTokens.length;
        uint256[] memory _recoveredUnassignedRewards =
            new uint256[](_numberOfRewardsTokens);
        for (uint256 _i; _i < _numberOfRewardsTokens; _i++) {
            ERC20 _relatedRewardToken = rewardTokens[_i];
            address _relatedRewardTokenAddress = address(_relatedRewardToken);
            // recoverable rewards are going to be recovered in this tx (if it does not revert),
            // so we add them to the claimed rewards right now
            totalClaimedRewards[
                _relatedRewardTokenAddress
            ] = totalClaimedRewards[_relatedRewardTokenAddress].add(
                recoverableUnassignedReward[_relatedRewardTokenAddress]
            );
            uint256 _requiredFunding =
                rewardAmount[_relatedRewardTokenAddress].sub(
                    totalClaimedRewards[_relatedRewardTokenAddress]
                );
            delete recoverableUnassignedReward[_relatedRewardTokenAddress];
            uint256 _recoverableRewards =
                _relatedRewardToken.balanceOf(address(this)).sub(
                    _requiredFunding
                );
            _recoveredUnassignedRewards[_i] = _recoverableRewards;
            _relatedRewardToken.safeTransfer(owner(), _recoverableRewards);
        }
        emit Recovered(_recoveredUnassignedRewards);
    }

    function stake(uint256 _amount)
        external
        onlyInitialized
        onlyStarted
        onlyRunning
    {
        require(
            _amount > 0,
            "ERC20StakingRewardsDistribution: tried to stake nothing"
        );
        consolidateReward();
        stakedTokensOf[msg.sender] = stakedTokensOf[msg.sender].add(_amount);
        totalStakedTokensAmount = totalStakedTokensAmount.add(_amount);
        stakableToken.safeTransferFrom(msg.sender, address(this), _amount);
        emit Staked(msg.sender, _amount);
    }

    function withdraw(uint256 _amount) external onlyInitialized onlyStarted {
        require(
            _amount > 0,
            "ERC20StakingRewardsDistribution: tried to withdraw nothing"
        );
        if (locked) {
            require(
                block.timestamp > endingTimestamp,
                "ERC20StakingRewardsDistribution: funds locked until the distribution ends"
            );
        }
        consolidateReward();
        require(
            _amount <= stakedTokensOf[msg.sender],
            "ERC20StakingRewardsDistribution: withdrawn amount greater than current stake"
        );
        stakedTokensOf[msg.sender] = stakedTokensOf[msg.sender].sub(_amount);
        totalStakedTokensAmount = totalStakedTokensAmount.sub(_amount);
        stakableToken.safeTransfer(msg.sender, _amount);
        emit Withdrawn(msg.sender, _amount);
    }

    function claim(uint256[] memory _amounts, address _recipient)
        external
        onlyInitialized
        onlyStarted
    {
        require(
            _amounts.length == rewardTokens.length,
            "ERC20StakingRewardsDistribution: inconsistent claimed amounts"
        );
        consolidateReward();
        uint256[] memory _claimedRewards = new uint256[](rewardTokens.length);
        for (uint256 _i; _i < rewardTokens.length; _i++) {
            ERC20 _relatedRewardToken = rewardTokens[_i];
            address _relatedRewardTokenAddress = address(_relatedRewardToken);
            uint256 _claimableReward =
                earnedRewards[msg.sender][_relatedRewardTokenAddress].sub(
                    claimedReward[msg.sender][_relatedRewardTokenAddress]
                );
            uint256 _wantedAmount = _amounts[_i];
            require(
                _claimableReward >= _wantedAmount,
                "ERC20StakingRewardsDistribution: insufficient claimable amount"
            );
            consolidateAndTransferClaim(
                _relatedRewardToken,
                _wantedAmount,
                _recipient
            );
            _claimedRewards[_i] = _wantedAmount;
        }
        emit Claimed(msg.sender, _claimedRewards);
    }

    function claimAll(address _recipient) external onlyInitialized onlyStarted {
        consolidateReward();
        uint256[] memory _claimedRewards = new uint256[](rewardTokens.length);
        for (uint256 _i; _i < rewardTokens.length; _i++) {
            ERC20 _relatedRewardToken = rewardTokens[_i];
            address _relatedRewardTokenAddress = address(_relatedRewardToken);
            uint256 _claimableReward =
                earnedRewards[msg.sender][_relatedRewardTokenAddress].sub(
                    claimedReward[msg.sender][_relatedRewardTokenAddress]
                );
            consolidateAndTransferClaim(
                _relatedRewardToken,
                _claimableReward,
                _recipient
            );
            _claimedRewards[_i] = _claimableReward;
        }
        emit Claimed(msg.sender, _claimedRewards);
    }

    function exit(address _recipient) external onlyInitialized onlyStarted {
        consolidateReward();
        claimAll(_recipient);
        withdraw(stakedTokensOf[msg.sender])
    }

    function consolidateAndTransferClaim(
        ERC20 _rewardToken,
        uint256 _amount,
        address _recipient
    ) private {
        claimedReward[msg.sender][address(_rewardToken)] = claimedReward[
            msg.sender
        ][address(_rewardToken)]
            .add(_amount);
        totalClaimedRewards[address(_rewardToken)] = totalClaimedRewards[
            address(_rewardToken)
        ]
            .add(_amount);
        _rewardToken.safeTransfer(_recipient, _amount);
    }

    function consolidateReward() public onlyInitialized onlyStarted {
        uint64 _consolidationTimestamp =
            uint64(Math.min(block.timestamp, endingTimestamp));
        uint256 _lastPeriodDuration =
            uint256(_consolidationTimestamp.sub(lastConsolidationTimestamp));
        for (uint256 _i; _i < rewardTokens.length; _i++) {
            address _relatedRewardTokenAddress = address(rewardTokens[_i]);
            if (totalStakedTokensAmount == 0) {
                // If the current staked tokens amount is zero, there have been unassigned rewards in the last period.
                // We add these unassigned rewards to the amount that can be claimed back by the contract's owner.
                recoverableUnassignedReward[
                    _relatedRewardTokenAddress
                ] = recoverableUnassignedReward[_relatedRewardTokenAddress].add(
                    _lastPeriodDuration
                        .mul(rewardAmount[_relatedRewardTokenAddress])
                        .div(secondsDuration)
                );
                rewardPerStakedToken[_relatedRewardTokenAddress] = 0;
            } else {
                rewardPerStakedToken[
                    _relatedRewardTokenAddress
                ] = rewardPerStakedToken[_relatedRewardTokenAddress].add(
                    _lastPeriodDuration
                        .mul(rewardAmount[_relatedRewardTokenAddress])
                        .mul(MULTIPLIER)
                        .div(totalStakedTokensAmount.mul(secondsDuration))
                );
            }
            // avoids subtraction underflow. If the rewards per staked tokens are 0,
            // the rewards in current period must be 0 by definition, no need to
            // perform subtraction risking underflow.
            uint256 _rewardInCurrentPeriod =
                rewardPerStakedToken[_relatedRewardTokenAddress] > 0
                    ? stakedTokensOf[msg.sender]
                        .mul(
                        rewardPerStakedToken[_relatedRewardTokenAddress].sub(
                            consolidatedRewardsPerStakedToken[msg.sender][
                                _relatedRewardTokenAddress
                            ]
                        )
                    )
                        .div(MULTIPLIER)
                    : 0;
            earnedRewards[msg.sender][
                _relatedRewardTokenAddress
            ] = earnedRewards[msg.sender][_relatedRewardTokenAddress].add(
                _rewardInCurrentPeriod
            );
            consolidatedRewardsPerStakedToken[msg.sender][
                _relatedRewardTokenAddress
            ] = rewardPerStakedToken[_relatedRewardTokenAddress];
        }
        lastConsolidationTimestamp = _consolidationTimestamp;
    }

    function claimableRewards(address _staker)
        public
        view
        returns (uint256[] memory)
    {
        uint256[] memory _outstandingRewards =
            new uint256[](rewardTokens.length);
        if (!initialized || block.timestamp < startingTimestamp) {
            for (uint256 _i; _i < rewardTokens.length; _i++) {
                _outstandingRewards[_i] = 0;
            }
            return _outstandingRewards;
        }
        uint64 _consolidationTimestamp =
            uint64(Math.min(block.timestamp, endingTimestamp));
        uint256 _lastPeriodDuration =
            uint256(_consolidationTimestamp.sub(lastConsolidationTimestamp));
        for (uint256 _i; _i < rewardTokens.length; _i++) {
            address _relatedRewardTokenAddress = address(rewardTokens[_i]);
            uint256 _localRewardPerStakedToken =
                rewardPerStakedToken[_relatedRewardTokenAddress];
            if (totalStakedTokensAmount == 0) {
                _localRewardPerStakedToken = 0;
            } else {
                _localRewardPerStakedToken = _localRewardPerStakedToken.add(
                    _lastPeriodDuration
                        .mul(rewardAmount[_relatedRewardTokenAddress])
                        .mul(MULTIPLIER)
                        .div(totalStakedTokensAmount.mul(secondsDuration))
                );
            }
            uint256 _rewardsInTheCurrentPeriod =
                _localRewardPerStakedToken > 0
                    ? stakedTokensOf[_staker]
                        .mul(
                        _localRewardPerStakedToken.sub(
                            consolidatedRewardsPerStakedToken[_staker][
                                _relatedRewardTokenAddress
                            ]
                        )
                    )
                        .div(MULTIPLIER)
                    : 0;
            // the claimable reward basically is the one not yet consolidated in the current period plus any
            // previously consolidated/earned but unclaimed reward
            _outstandingRewards[_i] = _rewardsInTheCurrentPeriod
                .add(earnedRewards[_staker][_relatedRewardTokenAddress])
                .sub(claimedReward[_staker][_relatedRewardTokenAddress]);
        }
        return _outstandingRewards;
    }

    modifier onlyUninitialized() {
        require(
            !initialized,
            "ERC20StakingRewardsDistribution: already initialized"
        );
        _;
    }

    modifier onlyInitialized() {
        require(
            initialized,
            "ERC20StakingRewardsDistribution: not initialized"
        );
        _;
    }

    modifier onlyStarted() {
        require(
            initialized && block.timestamp >= startingTimestamp,
            "ERC20StakingRewardsDistribution: not started"
        );
        _;
    }

    modifier onlyRunning() {
        require(
            initialized && block.timestamp <= endingTimestamp,
            "ERC20StakingRewardsDistribution: already ended"
        );
        _;
    }
}
