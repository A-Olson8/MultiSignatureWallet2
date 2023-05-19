// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC721/ERC721.sol';

error notOwner();
error EtherBalanceTooLow();
error TokenBalanceTooLow();
error ContractDoesNotOwnToken();
error TransactionExecuted();
error InvalidSig();

contract MultiSigState is ReentrancyGuard {
    event EthDeposited(address indexed sender, uint indexed amount, uint indexed ContractBalance);
    event ERC20Deposited(address indexed sender, address indexed token, uint indexed amount, uint ContractBalance);
    event NFTDeposited(address indexed sender, address indexed nftContract, uint indexed tokenId, uint ContractBalance);
    event EthTransactionExecuted(address indexed to, uint indexed amount);
    event ERC20TransactionExecuted(address indexed tokenAddress, address indexed to, uint indexed amount);
    event NFTTransactionExecuted(address indexed tokenAddress, address indexed to, uint indexed tokenId);

    uint public nonce;
    address[4] public owners; // array of owners
    mapping(bytes32 => bool) public executed;  // used to confirm address is an owner;
    mapping(address => bool) public isOwner;  // used for modifier

    modifier onlyOwners() {  // EthTransactionExecuted/checks that msg.sender is an owner
        checkOwner();
        _;
    }

    function checkOwner() private view {
        if(!isOwner[msg.sender]) {revert notOwner();}
    }
}

contract MultiSigTransferLogic is MultiSigState {
    using ECDSA for bytes32;

    // Used to create two messages that will be inputed into transfer(they need to have differenct nonces to pass require(!executed[txHash], "tx executed");)
    function getEthTransferHash( 
        address _to,
        uint _amount,
        uint _nonce
    ) public view returns (bytes32) {
        return keccak256(abi.encodePacked(address(this), _to, _amount, _nonce));  // includes smart contract address and nonce
    }

    // For ERC20 and NFT tokens..  This function also hashes the _tokenContract.  
    // Without it, the TransferERC20 and TransferNFT _tokenAddress can be manipulated by swapping different token addresses than what the signers intended.
    function getTokenTransferHash( 
        address _tokenContract,
        address _to,
        uint _amountOrTokenId,
        uint _nonce
    ) public view returns (bytes32) {
        return keccak256(abi.encodePacked(address(this), _to, _tokenContract, _amountOrTokenId, _nonce));  // includes smart contract address and nonce
    }

    // pass in the two sigs and the _txHash itself; (the one hash can be signed by the two addresses;
    function _checkSigs(
        bytes[] calldata _sigs, 
        bytes32 _txHash) 
        private view returns (bool) {

        bytes32 ethSignedHash = _txHash.toEthSignedMessageHash(); // this odd syntax is because ECDSA is an openzeppelin library.  (_txHash is a param)

        for (uint i; i < _sigs.length;) { // for all signatures
            address signer = ethSignedHash.recover(_sigs[i]);  // verify that they were signed by the two owners
            bool valid = signer == owners[i];  // the bool is checking that signer of the sigs is the two owners

            if (!valid) {
                return false;  // if the signer is not the two owners, then it is falso;
            }
            unchecked{ ++i; }
        }

        return true; // otherwise, it is true;
    }

    // Used for Transferring Eth
    function transferEth(
        address _to, 
        uint _amount, 
        bytes[] calldata _sigs) 
        external onlyOwners nonReentrant {
        if(address(this).balance < _amount) {revert EtherBalanceTooLow();}

        ++nonce;
        uint _nonce = nonce;
        bytes32 txHash = getEthTransferHash(_to, _amount, _nonce); //recreates hash for the next two checks;
        if(executed[txHash]) {revert TransactionExecuted();}
        if(!_checkSigs(_sigs, txHash)) {revert InvalidSig();}

        executed[txHash] = true;

        (bool sent, ) = _to.call{value: _amount}("");
        require(sent, "Failed to send Ether");

        emit EthTransactionExecuted(_to, _amount);
    }

    // for transferring ERC20
    function transferErc20(
        address _tokenAddress, 
        address _to, 
        uint _amount, 
        bytes[] calldata _sigs) 
        external onlyOwners {
        if(IERC20(_tokenAddress).balanceOf(address(this)) < _amount) {revert TokenBalanceTooLow();}

        ++nonce;
        uint _nonce = nonce;
        bytes32 txHash = getTokenTransferHash(_tokenAddress, _to, _amount, _nonce); //recreates hash for the next two checks;
        if(executed[txHash]) {revert TransactionExecuted();}
        if(!_checkSigs(_sigs, txHash)) {revert InvalidSig();}

        executed[txHash] = true;

        bool success = IERC20(_tokenAddress).transfer(_to, _amount);
        require(success);

        emit ERC20TransactionExecuted(_tokenAddress, _to, _amount);
    }

    // for transferring ERC20
    function transferNFT(
        address _tokenAddress, 
        address _to, 
        uint _tokenId, 
        bytes[] calldata _sigs) 
        external onlyOwners {
        if(IERC721(_tokenAddress).ownerOf(_tokenId) != address(this)) {revert ContractDoesNotOwnToken();}

        ++nonce;
        uint _nonce = nonce;
        bytes32 txHash = getTokenTransferHash(_tokenAddress, _to, _tokenId, _nonce); //recreates hash for the next two checks;
        if(executed[txHash]) {revert TransactionExecuted();}
        if(!_checkSigs(_sigs, txHash)) {revert InvalidSig();}

        executed[txHash] = true;  

        IERC721(_tokenAddress).safeTransferFrom(address(this), _to, _tokenId); 

        emit NFTTransactionExecuted(_tokenAddress, _to, _tokenId);
    }
}

contract MultiSigDepositLogic is MultiSigTransferLogic {  
    // for depositing eth;
    function depositEth() external payable onlyOwners {
        emit EthDeposited(msg.sender, msg.value, address(this).balance);  
    }
     
     // must approve on front end or send ERC20 token directly;
    function depositERC20(address _tokenAddress, uint _amount) external onlyOwners {  
        bool success = IERC20(_tokenAddress).transferFrom(msg.sender, address(this), _amount);
        require(success);

        uint balance = IERC20(_tokenAddress).balanceOf(address(this));

        emit ERC20Deposited(msg.sender, _tokenAddress, _amount, balance);
    }
    
    // allows this contract to receive NFTs when safeTransferFrom is called on nft contract;
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data) external returns (bytes4){  
        return IERC721Receiver.onERC721Received.selector;
    }

    // must approve on front end or send NFT token directly;
    function depositNFT(address _tokenAddress, uint _tokenId) external onlyOwners {  
        IERC721(_tokenAddress).safeTransferFrom(msg.sender, address(this), _tokenId); 

        uint balance = IERC721(_tokenAddress).balanceOf(address(this));

        emit NFTDeposited(msg.sender, _tokenAddress, _tokenId, balance); 
    }

    // Also used for depositing eth
    receive() external payable {
        emit EthDeposited(msg.sender, msg.value, address(this).balance);
    }
}

contract MultiSigCore is MultiSigDepositLogic {
    constructor(address[4] memory _listOfOwners) {
       owners[0] = _listOfOwners[0];
       owners[1] = _listOfOwners[1];
       owners[2] = _listOfOwners[2];
       owners[3] = _listOfOwners[3];

       isOwner[_listOfOwners[0]] = true;
       isOwner[_listOfOwners[1]] = true;
       isOwner[_listOfOwners[2]] = true;
       isOwner[_listOfOwners[3]] = true;
    }

    function getEtherBalance() external view returns(uint) {
        return address(this).balance;
    }

    function getErc20Balance(address _tokenAddress) external view returns(uint) {
        return IERC20(_tokenAddress).balanceOf(address(this));
    }

     function getNFTBalance(address _tokenAddress) external view returns(uint) {
        return IERC721(_tokenAddress).balanceOf(address(this));
    }

    function getOwners() external view returns (address[4] memory) {
        return owners;
    }
}
