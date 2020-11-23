//SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";


// TODO: add function to recover untouched rewards
contract ERC20Staker {
    using SafeMath for uint256;
    using SafeERC20 for ERC20;

    address public dxDaoAvatar;
    ERC20 public rewardsToken;
    ERC20 public lpToken;
    uint256 public rewardsTokenMultiplier;
    uint256 public stakedLpTokensAmount;
    uint256 public rewardsAmount;
    uint256 public rewardsPerBlock;
    uint256 public startingBlock;
    uint256 public endingBlock;
    bool public initialized;

    mapping(address => uint256) public lastConsolidationBlock;
    mapping(address => uint256) public lpTokensBalance;
    mapping(address => uint256) public earnedRewards;
    mapping(address => uint256) public claimedRewards;

    constructor(address _dxDaoAvatar) public {
        dxDaoAvatar = _dxDaoAvatar;
    }

    function initialize(
        address _rewardsTokenAddress,
        address _lpTokenAddress,
        uint256 _rewardsAmount,
        uint256 _startingBlock,
        uint256 _blocksDuration
    ) external onlyDxDao onlyUninitialized {
        require(
            _rewardsTokenAddress != address(0),
            "ERC20Staker: 0 address as rewards token"
        );
        require(
            _lpTokenAddress != address(0),
            "ERC20Staker: 0 address as LP token"
        );
        require(_rewardsAmount > 0, "ERC20Staker: 0 rewards amount");
        require(
            _startingBlock >= block.number,
            "ERC20Staker: starting block lower than current"
        );
        require(_blocksDuration > 0, "ERC20Staker: invalid block duration");
        require(
            ERC20(_rewardsTokenAddress).balanceOf(address(this)) >=
                _rewardsAmount,
            "ERC20Staker: funds required"
        );

        rewardsToken = ERC20(_rewardsTokenAddress);
        lpToken = ERC20(_lpTokenAddress);
        // FIXME: can this overflow?
        rewardsTokenMultiplier = uint256(1).mul(
            uint256(10)**uint256(rewardsToken.decimals())
        );
        rewardsAmount = _rewardsAmount;
        startingBlock = _startingBlock;
        endingBlock = startingBlock + _blocksDuration;
        rewardsPerBlock = _rewardsAmount.div(_blocksDuration);

        initialized = true;
    }

    function cancel() external onlyInitialized onlyDxDao {
        require(
            block.number < startingBlock,
            "ERC20Staker: program already started"
        );
        rewardsToken.approve(dxDaoAvatar, rewardsAmount);
        rewardsToken.safeTransfer(dxDaoAvatar, rewardsAmount);
        rewardsToken = ERC20(address(0));
        lpToken = ERC20(address(0));
        rewardsAmount = 0;
        startingBlock = 0;
        endingBlock = 0;
        rewardsPerBlock = 0;
        initialized = false;
    }

    function stake(uint256 _amount) external onlyInitialized onlyStarted {
        require(_amount > 0, "ERC20Staker: staked amount is 0");
        if (lpTokensBalance[msg.sender] == 0) {
            lastConsolidationBlock[msg.sender] = block.number;
        } else {
            consolidateReward();
        }
        lpToken.safeTransferFrom(msg.sender, address(this), _amount);
        lpTokensBalance[msg.sender] = lpTokensBalance[msg.sender].add(_amount);
        stakedLpTokensAmount = stakedLpTokensAmount.add(_amount);
    }

    function withdraw(uint256 _amount)
        external
        onlyInitialized
        onlyStarted
        onlyStaker
    {
        require(_amount > 0, "ERC20Staker: withdrawn amount greater than 0");
        require(
            _amount < lpTokensBalance[msg.sender],
            "ERC20Staker: withdrawn amount greater than current stake"
        );
        consolidateReward();
        lpToken.safeTransferFrom(address(this), msg.sender, _amount);
        lpTokensBalance[msg.sender] = lpTokensBalance[msg.sender].sub(_amount);
        stakedLpTokensAmount = stakedLpTokensAmount.sub(_amount);
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
        uint256 _lastConsolidationBlock = lastConsolidationBlock[msg.sender];
        if (
            _lastConsolidationBlock == block.number || stakedLpTokensAmount == 0
        ) {
            return;
        }
        uint256 _consolidationBlock = Math.min(block.number, endingBlock);
        uint256 _rewardInCurrentPeriod = _consolidationBlock
            .sub(_lastConsolidationBlock)
            .mul(lpTokensBalance[msg.sender])
            .mul(rewardsPerBlock.div(rewardsTokenMultiplier))
            .div(stakedLpTokensAmount)
            .mul(rewardsTokenMultiplier);
        earnedRewards[msg.sender] = earnedRewards[msg.sender].add(
            _rewardInCurrentPeriod
        );
        lastConsolidationBlock[msg.sender] = _consolidationBlock;
    }

    modifier onlyDxDao() {
        require(msg.sender == dxDaoAvatar, "ERC20Staker: not DXdao");
        _;
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
            initialized && block.number > startingBlock,
            "ERC20Staker: not started"
        );
        _;
    }

    modifier onlyStaker() {
        require(lpTokensBalance[msg.sender] > 0, "ERC20Staker: not a staker");
        _;
    }

    modifier updateReward() {
        require(lpTokensBalance[msg.sender] > 0, "ERC20Staker: not a staker");
        _;
    }
}
