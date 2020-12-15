// SPDX-License-Identifier: GPL-3.0
// imported from https://github.com/nicoelzer/dxDAO-Token-Registry/blob/master/contracts/dxTokenRegistry.sol

pragma solidity >=0.6.2;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";


/// @title dxDAO Token Multi-Registry
/// @notice Maintains multiple token lists, curated by the DAO
contract DXTokenRegistry is Ownable {
    event AddList(uint256 listId, string listName);
    event AddToken(uint256 listId, address token);
    event RemoveToken(uint256 listId, address token);

    enum TokenStatus {NULL, ACTIVE}

    struct TCR {
        uint256 listId;
        string listName;
        address[] tokens;
        mapping(address => TokenStatus) status;
        uint256 activeTokenCount;
    }

    mapping(uint256 => TCR) public tcrs;
    uint256 public listCount;

    /// @notice Add new token list.
    /// @param _listName Name of new list.
    /// @return New list ID.
    function addList(string memory _listName)
        public
        onlyOwner
        returns (uint256)
    {
        listCount++;
        tcrs[listCount].listId = listCount;
        tcrs[listCount].listName = _listName;
        tcrs[listCount].activeTokenCount = 0;
        emit AddList(listCount, _listName);
        return listCount;
    }

    /// @notice The owner can add new token(s) to existing list, by address.
    /// @dev Attempting to add token addresses which are already in the list will cause revert.
    /// @param _listId ID of list to add new tokens.
    /// @param _tokens Array of token addresses to add.
    function addTokens(uint256 _listId, address[] memory _tokens)
        public
        onlyOwner
    {
        require(_listId <= listCount, "DXTokenRegistry : INVALID_LIST");
        for (uint32 i = 0; i < _tokens.length; i++) {
            require(
                tcrs[_listId].status[_tokens[i]] != TokenStatus.ACTIVE,
                "DXTokenRegistry : DUPLICATE_TOKEN"
            );
            tcrs[_listId].tokens.push(_tokens[i]);
            tcrs[_listId].status[_tokens[i]] = TokenStatus.ACTIVE;
            tcrs[_listId].activeTokenCount++;
            emit AddToken(_listId, _tokens[i]);
        }
    }

    /// @notice The owner can remove token(s) on existing list, by address.
    /// @dev Attempting to remove token addresses which are not active, or not present in the list, will cause revert.
    /// @param _listId ID of list to remove tokens from.
    /// @param _tokens Array of token addresses to remove.
    function removeTokens(uint256 _listId, address[] memory _tokens)
        public
        onlyOwner
    {
        require(_listId <= listCount, "DXTokenRegistry : INVALID_LIST");
        for (uint32 i = 0; i < _tokens.length; i++) {
            require(
                tcrs[_listId].status[_tokens[i]] == TokenStatus.ACTIVE,
                "DXTokenRegistry : INACTIVE_TOKEN"
            );
            tcrs[_listId].status[_tokens[i]] = TokenStatus.NULL;
            uint256 tokenIndex = getTokenIndex(_listId, _tokens[i]);
            tcrs[_listId].tokens[tokenIndex] = tcrs[_listId]
                .tokens[tcrs[_listId].tokens.length - 1];
            tcrs[_listId].tokens.pop();
            tcrs[_listId].activeTokenCount--;
            emit RemoveToken(_listId, _tokens[i]);
        }
    }

    /// @notice Get all tokens tracked by a token list
    /// @param _listId ID of list to get tokens from.
    /// @return Array of token addresses tracked by list.
    function getTokens(uint256 _listId) public view returns (address[] memory) {
        require(_listId <= listCount, "DXTokenRegistry : INVALID_LIST");
        return tcrs[_listId].tokens;
    }

    /// @notice Get active tokens from a list, within a specified index range.
    /// @param _listId ID of list to get tokens from.
    /// @param _start Start index.
    /// @param _end End index.
    /// @return tokensRange Array of active token addresses in index range.
    function getTokensRange(uint256 _listId, uint256 _start, uint256 _end)
        public
        view
        returns (address[] memory tokensRange)
    {
        require(_listId <= listCount, "DXTokenRegistry : INVALID_LIST");
        require(
            _start <= tcrs[_listId].tokens.length &&
                _end < tcrs[_listId].tokens.length,
            "DXTokenRegistry : INVALID_RANGE"
        );
        require(_start <= _end, "DXTokenRegistry : INVALID_INVERTED_RANGE");
        tokensRange = new address[](_end - _start + 1);
        uint32 activeCount = 0;
        for (uint256 i = _start; i <= _end; i++) {
            if (
                tcrs[_listId].status[tcrs[_listId].tokens[i]] ==
                TokenStatus.ACTIVE
            ) {
                tokensRange[activeCount] = tcrs[_listId].tokens[i];
                activeCount++;
            }
        }
    }

    /// @notice Check if list has a given token address active.
    /// @param _listId ID of list to get tokens from.
    /// @param _token Token address to check.
    /// @return Active status of given token address in list.
    function isTokenActive(uint256 _listId, address _token)
        public
        view
        returns (bool)
    {
        require(_listId <= listCount, "DXTokenRegistry : INVALID_LIST");
        return
            tcrs[_listId].status[_token] == TokenStatus.ACTIVE ? true : false;
    }

    /// @notice Returns the array index of a given token address
    /// @param _listId ID of list to get tokens from.
    /// @param _token Token address to check.
    /// @return index position of given token address in list.
    function getTokenIndex(uint256 _listId, address _token)
        internal
        view
        returns (uint256)
    {
        for (uint256 i = 0; i < tcrs[_listId].tokens.length; i++) {
            if (tcrs[_listId].tokens[i] == _token) {
                return i;
            }
        }
    }

    /// @notice Convenience method to get ERC20 metadata for given tokens.
    /// @param _tokens Array of token addresses.
    /// @return names for each token.
    /// @return symbols for each token.
    /// @return decimals for each token.
    function getTokensData(address[] memory _tokens)
        public
        view
        returns (
            string[] memory names,
            string[] memory symbols,
            uint256[] memory decimals
        )
    {
        names = new string[](_tokens.length);
        symbols = new string[](_tokens.length);
        decimals = new uint256[](_tokens.length);
        for (uint32 i = 0; i < _tokens.length; i++) {
            names[i] = ERC20(_tokens[i]).name();
            symbols[i] = ERC20(_tokens[i]).symbol();
            decimals[i] = ERC20(_tokens[i]).decimals();
        }
    }

    /// @notice Convenience method to get account balances for given tokens.
    /// @param _trader Account to check balances for.
    /// @param _assetAddresses Array of token addresses.
    /// @return Account balances for each token.
    function getExternalBalances(
        address _trader,
        address[] memory _assetAddresses
    ) public view returns (uint256[] memory) {
        uint256[] memory balances = new uint256[](_assetAddresses.length);
        for (uint256 i = 0; i < _assetAddresses.length; i++) {
            balances[i] = ERC20(_assetAddresses[i]).balanceOf(_trader);
        }
        return balances;
    }
}
