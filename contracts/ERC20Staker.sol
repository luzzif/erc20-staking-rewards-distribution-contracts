//SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";


contract ERC20Staker is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for ERC20;

    ERC20 public rewardsToken;
    ERC20 public stakableToken;
    uint256 public rewardsTokenMultiplier;
    uint256 public stakedTokensAmount;
    uint256 public rewardsAmount;
    uint256 public rewardsPerBlock;
    uint256 public rewardsPerStakedToken;
    uint256 public startingBlock;
    uint256 public endingBlock;
    bool public initialized;
    uint256 public lastConsolidationBlock;

    mapping(address => uint256) public stakedTokensOf;
    mapping(address => uint256) public consolidatedRewardsPerStakedToken;
    mapping(address => uint256) public earnedRewards;
    mapping(address => uint256) public claimedRewards;

    function initialize(
        address _rewardsTokenAddress,
        address _stakableTokenAddress,
        uint256 _rewardsAmount,
        uint256 _startingBlock,
        uint256 _blocksDuration
    ) external onlyOwner onlyUninitialized {
        require(
            _rewardsTokenAddress != address(0),
            "ERC20Staker: 0 address as rewards token"
        );
        require(
            _stakableTokenAddress != address(0),
            "ERC20Staker: 0 address as stakable token"
        );
        require(_rewardsAmount > 0, "ERC20Staker: 0 rewards amount");
        require(
            _startingBlock > block.number,
            "ERC20Staker: starting block lower or equal than current"
        );
        // duration needs to be more than one block since the distribution
        // lasts from the starting block inclusive to the ending block exclusive.
        // If the duration is 1, the ending block becomes the next one, so no
        // one would be able to stake anything.
        require(_blocksDuration > 1, "ERC20Staker: invalid block duration");
        require(
            ERC20(_rewardsTokenAddress).balanceOf(address(this)) >=
                _rewardsAmount,
            "ERC20Staker: funds required"
        );

        rewardsToken = ERC20(_rewardsTokenAddress);
        stakableToken = ERC20(_stakableTokenAddress);
        uint256 rewardsTokenDecimals = rewardsToken.decimals();
        // avoid overflow by constraining the rewards token decimals to a maximum of 18
        require(
            rewardsTokenDecimals <= 18,
            "ERC20Staker: more than 18 decimals for reward token"
        );
        rewardsTokenMultiplier = uint256(1).mul(
            uint256(10)**uint256(rewardsTokenDecimals)
        );
        rewardsAmount = _rewardsAmount;
        startingBlock = _startingBlock;
        endingBlock = startingBlock + _blocksDuration;
        rewardsPerBlock = _rewardsAmount.div(_blocksDuration);

        initialized = true;
    }

    function cancel() external onlyInitialized onlyOwner {
        require(
            block.number < startingBlock,
            "ERC20Staker: program already started"
        );
        rewardsToken.approve(owner(), rewardsAmount);
        rewardsToken.safeTransfer(owner(), rewardsAmount);
        rewardsToken = ERC20(address(0));
        stakableToken = ERC20(address(0));
        rewardsAmount = 0;
        startingBlock = 0;
        endingBlock = 0;
        rewardsPerBlock = 0;
        initialized = false;
    }

    function stake(uint256 _amount)
        external
        onlyInitialized
        onlyStarted
        onlyRunning
    {
        require(_amount > 0, "ERC20Staker: staked amount is 0");
        consolidateReward();
        stakableToken.safeTransferFrom(msg.sender, address(this), _amount);
        stakedTokensOf[msg.sender] = stakedTokensOf[msg.sender].add(_amount);
        stakedTokensAmount = stakedTokensAmount.add(_amount);
    }

    function withdraw(uint256 _amount) external onlyInitialized onlyStarted {
        require(_amount > 0, "ERC20Staker: withdrawn amount is 0");
        require(stakedTokensOf[msg.sender] > 0, "ERC20Staker: not a staker");
        require(
            _amount < stakedTokensOf[msg.sender],
            "ERC20Staker: withdrawn amount greater than stake"
        );
        consolidateReward();
        stakableToken.safeTransfer(msg.sender, _amount);
        stakedTokensOf[msg.sender] = stakedTokensOf[msg.sender].sub(_amount);
        stakedTokensAmount = stakedTokensAmount.sub(_amount);
    }

    function claim() external onlyInitialized onlyStarted {
        consolidateReward();
        uint256 _pendingRewards = earnedRewards[msg.sender].sub(
            claimedRewards[msg.sender]
        );
        rewardsToken.safeTransfer(msg.sender, _pendingRewards);
        claimedRewards[msg.sender] = claimedRewards[msg.sender].add(
            _pendingRewards
        );
    }

    function consolidateReward() public onlyInitialized onlyStarted {
        // The consolidation period lasts from the staking block inclusive to the current block exclusive.
        uint256 _consolidationBlock = Math.min(block.number, endingBlock) - 1;
        if (stakedTokensAmount == 0) {
            rewardsPerStakedToken = 0;
            lastConsolidationBlock = _consolidationBlock;
        } else {
            rewardsPerStakedToken = rewardsPerStakedToken.add(
                _consolidationBlock
                    .sub(lastConsolidationBlock)
                    .mul(rewardsPerBlock)
                    .mul(rewardsTokenMultiplier)
                    .div(stakedTokensAmount)
            );
        }
        uint256 _rewardInCurrentPeriod = stakedTokensOf[msg.sender]
            .mul(
            rewardsPerStakedToken.sub(
                consolidatedRewardsPerStakedToken[msg.sender]
            )
        )
            .div(rewardsTokenMultiplier);
        earnedRewards[msg.sender] = earnedRewards[msg.sender].add(
            _rewardInCurrentPeriod
        );
        consolidatedRewardsPerStakedToken[msg.sender] = rewardsPerStakedToken;
        lastConsolidationBlock = _consolidationBlock;
    }

    modifier onlyUninitialized() {
        require(!initialized, "ERC20Staker: already initialized");
        _;
    }

    modifier onlyInitialized() {
        require(initialized, "ERC20Staker: not initialized");
        _;
    }

    modifier onlyStarted() {
        require(
            initialized && block.number >= startingBlock,
            "ERC20Staker: not started"
        );
        _;
    }

    modifier onlyRunning() {
        require(
            initialized && block.number < endingBlock,
            "ERC20Staker: already ended"
        );
        _;
    }
}
