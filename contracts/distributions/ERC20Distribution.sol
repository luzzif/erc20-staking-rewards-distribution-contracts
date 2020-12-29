// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ERC20Distribution is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for ERC20;

    ERC20[] public rewardTokens;
    ERC20[] public stakableTokens;
    mapping(address => uint256) public rewardTokenMultiplier;
    mapping(address => uint256) public rewardAmount;
    mapping(address => uint256) public rewardPerSecond;
    mapping(address => uint256) public stakedTokenAmount;
    uint256 public totalStakedTokensAmount;
    mapping(address => uint256) public rewardPerStakedToken;
    uint256 public startingTimestamp;
    uint256 public endingTimestamp;
    bool public locked;
    bool public initialized;
    uint256 public lastConsolidationTimestamp;
    mapping(address => uint256) public recoverableUnassignedReward;

    mapping(address => mapping(address => uint256)) public stakedTokensOf;
    mapping(address => uint256) public totalStakedTokensOf;
    mapping(address => mapping(address => uint256))
        public consolidatedRewardsPerStakedToken;
    mapping(address => mapping(address => uint256)) public earnedRewards;
    mapping(address => mapping(address => uint256)) public claimedReward;

    event Initialized(
        address[] rewardsTokenAddresses,
        address[] stakableTokenAddresses,
        uint256[] rewardsAmounts,
        uint256 startingTimestamp,
        uint256 endingTimestamp,
        bool locked
    );
    event Canceled();
    event Staked(address indexed staker, uint256[] amounts);
    event Withdrawn(address indexed withdrawer, uint256[] amounts);
    event Claimed(address indexed claimer, uint256[] amounts);
    event Recovered(uint256[] amounts);

    function getRewardTokens() external view returns (ERC20[] memory) {
        return rewardTokens;
    }

    function getStakableTokens() external view returns (ERC20[] memory) {
        return stakableTokens;
    }

    function initialize(
        address[] calldata _rewardTokenAddresses,
        address[] calldata _stakableTokenAddresses,
        uint256[] calldata _rewardAmounts,
        uint256 _startingTimestamp,
        uint256 _endingTimestamp,
        bool _locked
    ) external onlyOwner onlyUninitialized {
        uint256 _currentTimestamp = block.timestamp;
        require(
            _startingTimestamp > _currentTimestamp,
            "ERC20Distribution: starting timestamp lower or equal than current"
        );
        require(
            _endingTimestamp > _startingTimestamp,
            "ERC20Distribution: invalid time duration"
        );
        require(
            _rewardTokenAddresses.length == _rewardAmounts.length,
            "ERC20Distribution: inconsistent reward token/amount arrays length"
        );

        uint256 _secondsDuration = _endingTimestamp - _startingTimestamp;
        // Initializing reward tokens and amounts
        for (uint32 _i = 0; _i < _rewardTokenAddresses.length; _i++) {
            address _rewardTokenAddress = _rewardTokenAddresses[_i];
            require(
                _rewardTokenAddress != address(0),
                "ERC20Distribution: 0 address as reward token"
            );
            ERC20 _rewardToken = ERC20(_rewardTokenAddress);
            uint256 _rewardAmount = _rewardAmounts[_i];
            require(_rewardAmount > 0, "ERC20Distribution: no reward");
            require(
                _rewardToken.balanceOf(address(this)) >= _rewardAmount,
                "ERC20Distribution: funds required"
            );
            // avoid overflow down the road by constraining the reward
            // token decimals to a maximum of 18
            uint256 _rewardTokenDecimals = _rewardToken.decimals();
            require(
                _rewardTokenDecimals <= 18,
                "ERC20Distribution: more than 18 decimals for reward token"
            );
            rewardTokens.push(_rewardToken);
            rewardTokenMultiplier[_rewardTokenAddress] = uint256(1).mul(
                uint256(10)**uint256(_rewardTokenDecimals)
            );
            rewardPerSecond[_rewardTokenAddress] = _rewardAmount.div(
                _secondsDuration
            );
            rewardAmount[_rewardTokenAddress] = _rewardAmount;
        }

        // Initializing stakable tokens
        for (uint32 _i = 0; _i < _stakableTokenAddresses.length; _i++) {
            address _stakableTokenAddress = _stakableTokenAddresses[_i];
            require(
                _stakableTokenAddress != address(0),
                "ERC20Distribution: 0 address as stakable token"
            );
            stakableTokens.push(ERC20(_stakableTokenAddress));
        }

        startingTimestamp = _startingTimestamp;
        endingTimestamp = _endingTimestamp;
        lastConsolidationTimestamp = _startingTimestamp;
        locked = _locked;

        initialized = true;
        emit Initialized(
            _rewardTokenAddresses,
            _stakableTokenAddresses,
            _rewardAmounts,
            _startingTimestamp,
            _endingTimestamp,
            _locked
        );
    }

    function cancel() external onlyInitialized onlyOwner {
        require(
            block.timestamp < startingTimestamp,
            "ERC20Distribution: distribution already started"
        );
        // resetting reward information (both tokens and amounts)
        for (uint256 _i; _i < rewardTokens.length; _i++) {
            ERC20 rewardToken = rewardTokens[_i];
            address rewardTokenAddress = address(rewardToken);
            uint256 _relatedRewardAmount = rewardAmount[rewardTokenAddress];
            rewardToken.approve(owner(), _relatedRewardAmount);
            rewardToken.safeTransfer(owner(), _relatedRewardAmount);
            delete rewardTokenMultiplier[rewardTokenAddress];
            delete rewardAmount[rewardTokenAddress];
            delete rewardPerSecond[rewardTokenAddress];
        }
        delete rewardTokens;
        delete stakableTokens;
        startingTimestamp = 0;
        endingTimestamp = 0;
        lastConsolidationTimestamp = 0;
        initialized = false;
        emit Canceled();
    }

    function recoverUnassignedRewards() external onlyInitialized onlyStarted {
        consolidateReward();
        uint256 _rewardTokensAmount = rewardTokens.length;
        uint256[] memory _recoveredUnassignedRewards =
            new uint256[](_rewardTokensAmount);
        for (uint256 _i; _i < _rewardTokensAmount; _i++) {
            ERC20 _relatedRewardToken = rewardTokens[_i];

            uint256 _relatedUnassignedReward =
                recoverableUnassignedReward[address(_relatedRewardToken)];
            _relatedRewardToken.safeTransfer(owner(), _relatedUnassignedReward);
            _recoveredUnassignedRewards[_i] = _relatedUnassignedReward;
            delete recoverableUnassignedReward[address(_relatedRewardToken)];
        }
        emit Recovered(_recoveredUnassignedRewards);
    }

    function stake(uint256[] calldata _amounts)
        external
        onlyInitialized
        onlyStarted
        onlyRunning
    {
        require(
            _amounts.length == stakableTokens.length,
            "ERC20Distribution: inconsistent staked amounts length"
        );
        consolidateReward();
        for (uint256 _i; _i < _amounts.length; _i++) {
            uint256 _amount = _amounts[_i];
            if (_amount == 0) {
                continue;
            }
            ERC20 _relatedStakableToken = stakableTokens[_i];
            address _relatedStakableTokenAddress =
                address(_relatedStakableToken);
            _relatedStakableToken.safeTransferFrom(
                msg.sender,
                address(this),
                _amount
            );
            stakedTokensOf[msg.sender][
                _relatedStakableTokenAddress
            ] = stakedTokensOf[msg.sender][_relatedStakableTokenAddress].add(
                _amount
            );
            stakedTokenAmount[_relatedStakableTokenAddress] = stakedTokenAmount[
                _relatedStakableTokenAddress
            ]
                .add(_amount);
            totalStakedTokensOf[msg.sender] = totalStakedTokensOf[msg.sender]
                .add(_amount);
            totalStakedTokensAmount = totalStakedTokensAmount.add(_amount);
        }
        emit Staked(msg.sender, _amounts);
    }

    function withdraw(uint256[] calldata _amounts)
        external
        onlyInitialized
        onlyStarted
    {
        require(
            _amounts.length == stakableTokens.length,
            "ERC20Distribution: inconsistent withdrawn amounts length"
        );
        if (locked) {
            require(
                block.timestamp > endingTimestamp,
                "ERC20Distribution: funds locked until ending timestamp"
            );
        }
        consolidateReward();
        for (uint256 _i; _i < _amounts.length; _i++) {
            uint256 _amount = _amounts[_i];
            if (_amount == 0) {
                continue;
            }
            ERC20 _relatedStakableToken = stakableTokens[_i];
            address _relatedStakableTokenAddress =
                address(_relatedStakableToken);
            require(
                _amount <=
                    stakedTokensOf[msg.sender][_relatedStakableTokenAddress],
                "ERC20Distribution: withdrawn amount greater than current stake"
            );
            _relatedStakableToken.safeTransfer(msg.sender, _amount);
            stakedTokensOf[msg.sender][
                _relatedStakableTokenAddress
            ] = stakedTokensOf[msg.sender][_relatedStakableTokenAddress].sub(
                _amount
            );
            stakedTokenAmount[_relatedStakableTokenAddress] = stakedTokenAmount[
                _relatedStakableTokenAddress
            ]
                .sub(_amount);
            totalStakedTokensOf[msg.sender] = totalStakedTokensOf[msg.sender]
                .sub(_amount);
            totalStakedTokensAmount = totalStakedTokensAmount.sub(_amount);
        }
        emit Withdrawn(msg.sender, _amounts);
    }

    function claim() external onlyInitialized onlyStarted {
        consolidateReward();
        uint256[] memory _pendingRewards = new uint256[](rewardTokens.length);
        for (uint256 _i; _i < rewardTokens.length; _i++) {
            ERC20 _relatedRewardToken = rewardTokens[_i];
            address _relatedRewardTokenAddress = address(_relatedRewardToken);
            uint256 _pendingReward =
                earnedRewards[msg.sender][_relatedRewardTokenAddress].sub(
                    claimedReward[msg.sender][_relatedRewardTokenAddress]
                );
            _relatedRewardToken.safeTransfer(msg.sender, _pendingReward);
            claimedReward[msg.sender][
                _relatedRewardTokenAddress
            ] = claimedReward[msg.sender][_relatedRewardTokenAddress].add(
                _pendingReward
            );
            _pendingRewards[_i] = _pendingReward;
        }
        emit Claimed(msg.sender, _pendingRewards);
    }

    function consolidateReward() public onlyInitialized onlyStarted {
        uint256 _consolidationTimestamp =
            Math.min(block.timestamp, endingTimestamp);
        uint256 _lastPeriodDuration =
            _consolidationTimestamp.sub(lastConsolidationTimestamp);
        for (uint256 _i; _i < rewardTokens.length; _i++) {
            address _relatedRewardTokenAddress = address(rewardTokens[_i]);
            if (totalStakedTokensAmount == 0) {
                // If the current staked tokens amount is zero, there have been unassigned rewards in the last period.
                // We add them to any previous one so that they can be claimed back by the contract's owner.
                recoverableUnassignedReward[
                    _relatedRewardTokenAddress
                ] = recoverableUnassignedReward[_relatedRewardTokenAddress].add(
                    _lastPeriodDuration.mul(
                        rewardPerSecond[_relatedRewardTokenAddress]
                    )
                );
                rewardPerStakedToken[_relatedRewardTokenAddress] = 0;
            } else {
                rewardPerStakedToken[
                    _relatedRewardTokenAddress
                ] = rewardPerStakedToken[_relatedRewardTokenAddress].add(
                    _lastPeriodDuration
                    // FIXME: could this overflow?
                        .mul(rewardPerSecond[_relatedRewardTokenAddress])
                        .mul(rewardTokenMultiplier[_relatedRewardTokenAddress])
                        .div(totalStakedTokensAmount)
                );
            }
            // avoids subtraction overflow. If the rewards per staked tokens are 0,
            // the rewards in current period must be 0 by definition, no need to
            // perform subtraction risking overflow.
            uint256 _rewardInCurrentPeriod =
                rewardPerStakedToken[_relatedRewardTokenAddress] > 0
                    ? totalStakedTokensOf[msg.sender]
                        .mul(
                        rewardPerStakedToken[_relatedRewardTokenAddress].sub(
                            consolidatedRewardsPerStakedToken[msg.sender][
                                _relatedRewardTokenAddress
                            ]
                        )
                    )
                        .div(rewardTokenMultiplier[_relatedRewardTokenAddress])
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

    modifier onlyUninitialized() {
        require(!initialized, "ERC20Distribution: already initialized");
        _;
    }

    modifier onlyInitialized() {
        require(initialized, "ERC20Distribution: not initialized");
        _;
    }

    modifier onlyStarted() {
        require(
            initialized && block.timestamp >= startingTimestamp,
            "ERC20Distribution: not started"
        );
        _;
    }

    modifier onlyRunning() {
        require(
            initialized && block.timestamp <= endingTimestamp,
            "ERC20Distribution: already ended"
        );
        _;
    }
}
