# Canto Splits CSR integration

Canto implements a fee split model called Contract Secured Revenue, or CSR. CSR allows you to claim a percentage of all transaction fees paid by users when interacting with your smart contracts. A transferrable NFT represents the right to claim a contract's revenue which is accured in the Turnstile contract.

The splits contracts [here](https://github.com/0xsplits/splits-contracts) were modified in such a way that the user has now the capability to deposit and withdraw any general ERC721 token from a deployed split contract. This unlocks a lot of use cases where NFTs represent share of some revenue stream, eg. other liquid splits and CSR Turnstile NFTs). The source code for this can be found [here](https://github.com/neobase-one/splits-contracts).

In context of CSR, this enables users to fractionalize or 'split' the revenue generated simply by depositing the Turnstile NFT to any splits contract. Any CANTO received from Turnstile contract as revenue is directly received by the split and distributed amongst the recipients automatically.

## Technical Spec

#### SplitWallet

- `onERC721Received` handles the NFTs handled recieved by the contract

```
/** @notice Handle the receipt of an NFT
* @dev The ERC721 smart contract calls this function on the recipient
*  after a `safetransfer`.
*  Note: the contract address is always the message sender.
* @param _operator The operator address
* @param _from The sending address
* @param _tokenId The NFT identifier which is being transfered
* @param _data Additional data with no specified format
* @return `bytes4(keccak256("onERC721Received(address,address,uint256,bytes"))`
*/
function onERC721Received(
  address,
  address,
  uint256,
  bytes calldata data
)
  external pure returns(bytes4)
{
  return 0x150b7a02;
}
```

- `withdrawERC721` lets the user withdraw NFT to the given recipient address. This function can only be called by the user indirectly through the `SplitMain` contract which is stored as an immutable in the constructor.

```
/** @notice Withdraw ERC721 `token` with tokenId in `tokenIds` from the split
 *  @param token Address of the ERC721 token to withdraw
 *  @param tokenId TokenId of ERC721 to withdraw
    @param recipient Address of the recipient
 */
function withdrawERC721(ERC721 token, uint256 tokenId, address recipient) external onlySplitMain() {
  token.safeTransferFrom(address(this), recipient, tokenId);
}
```

#### SplitMain

- `erc721owners` keeps track of the owners of ERC721 tokens deposited into various splits.

```
/// @notice mapping to ERC721 owners
mapping(ERC721 => mapping(uint256 => address)) internal erc721owners;
```

- Events:

```
/** @notice emitted after each successful ERC721 deposit
 *  @param token ERC721 token address
 *  @param tokenId ERC721 tokenId
 *  @param sender Address of sender
 *  @param split Split address where the token was deposited
 */
event DepositERC721(
  ERC721 token,
  uint256 tokenId,
  address sender,
  address split
);

/** @notice emitted after each successful ERC721 withdrawal
 *  @param token ERC721 token address
 *  @param tokenId ERC721 tokenId
 *  @param sender Address of receiver
 *  @param split Split address from where the token was withdrawn
 */
event WithdrawERC721(
  ERC721 token,
  uint256 tokenId,
  address reciever,
  address split
);
```

- `depositERC721` takes a list of ERC721 tokenIds and deposits it into the given split. The SplitMain contract has to be approved to spend the tokens. msg.sender is marked as owner in the `erc721owners` mapping.

```
/** @notice Deposit ERC721 `token` with tokenId in `tokenIds` to split `split`
    @dev SplitMain must be approved to spend msg.sender's token
 *  @param token Address of the ERC721 token to deposit
 *  @param tokenIds List of the ERC721 tokenIds to deposit
    @param split Address of split to deposit into
 */
function depositERC721(ERC721 token, uint256[] calldata tokenIds, address split) external {
  for (uint256 i; i<tokenIds.length; i++ ){
    uint256 tokenId = tokenIds[i];
    if (token.ownerOf(tokenId) != msg.sender) revert Unauthorized(msg.sender);

    token.safeTransferFrom(msg.sender, split, tokenId);
    erc721owners[token][tokenId] = msg.sender;

    emit DepositERC721(token, tokenId, msg.sender, split);
  }
}
```

- `withdrawERC721` takes a list of ERC721 tokenIds and withdraws it from the given split. The corresponding tokens must have been deposited into the split by the same msg.sender.

```
/** @notice Withdraw ERC721 `token` with tokenId in `tokenIds` from  split `split`
 *  @param token Address of the ERC721 token to withdraw
 *  @param tokenIds List of the ERC721 tokenIds to withdraw
    @param split Address of split to withdraw from
 */
function withdrawERC721(ERC721 token, uint256[] calldata tokenIds, address split) external {
  for (uint256 i; i<tokenIds.length; i++ ){
    uint256 tokenId = tokenIds[i];
    if (erc721owners[token][tokenId] != msg.sender) revert Unauthorized(msg.sender);

    delete erc721owners[token][tokenId];
    SplitWallet(split).withdrawERC721(token, tokenId, msg.sender);

    emit WithdrawERC721(token, tokenId, msg.sender, split);
  }
}
```
