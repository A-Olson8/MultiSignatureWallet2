const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { assert, expect} = require('chai');
const {ethers} = require('hardhat');

describe("MultiSig contract", function () {
    async function deployMultiSig() {
      const MultiSigCore = await ethers.getContractFactory("MultiSigCore");
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const MockNFT = await ethers.getContractFactory("MockNFT");
      const [addr1, addr2, addr3, addr4, addr5] = await ethers.getSigners();
      const owners = [addr1.address, addr2.address, addr3.address, addr4.address];
  
      core = await MultiSigCore.deploy(owners);
      await core.deployed();
  
      token = await MockERC20.deploy(addr2.address);
      await token.deployed();

      nft = await MockNFT.deploy(core.address);
      await nft.deployed();

      // Fixtures can return anything you consider useful for your tests
      return { core, token, nft, addr1, addr2, addr3, addr4, addr5 };
    }

    // test deposits
    it("should receive Eth", async () => {
      const { core, addr1 } = await loadFixture(deployMultiSig);  

      await core.connect(addr1).depositEth({value: '1000000000000000000'});
  
      const amount = await core.connect(addr1).getEtherBalance();
      assert.equal(amount.toString(), '1000000000000000000', "invalid balance");
    });    
    
    it("should receive Erc20", async () => {
      const { core, token, addr2, addr3 } = await loadFixture(deployMultiSig);
      
      await token.connect(addr2).transfer(core.address, '1000000000000000000');

      const amount = await core.connect(addr3).getErc20Balance(token.address);
      assert.equal(amount.toString(), '1000000000000000000', "invalid balance");
    }); 

    it("should receive nft", async () => {
      const { core, nft, addr3 } = await loadFixture(deployMultiSig);

      // await nft.connect(addr3).safeTransferFrom(addr3.address, core.address, 0);
  
      const amount = await core.connect(addr3).getNFTBalance(nft.address);
      assert.equal(amount.toString(), '2', "invalid balance");
    }); 

    // This function should fail due to onluOwners modifier

    it("should revert eth invalid hash", async () => {
      const { core, addr1, addr2, addr3, addr4, addr5} = await loadFixture(deployMultiSig);  

      await core.connect(addr1).depositEth({value: '1000000000000000000'});

      const hash = await core.connect(addr2).getEthTransferHash(addr1.address, '1000000000000000000', 1);

      const add1Hash = await addr1.signMessage(ethers.utils.arrayify(hash));
      const add2Hash = await addr2.signMessage(ethers.utils.arrayify(hash));
      const add3Hash = await addr3.signMessage(ethers.utils.arrayify(hash));
      const add4Hash = await addr4.signMessage(ethers.utils.arrayify(hash));

      const arrayOfSigs = [add1Hash, add2Hash, add3Hash, add4Hash];

      await expect
        (core.connect(addr5).transferEth(addr1.address, '1000000000000000000', arrayOfSigs)).to.be.revertedWith(
        "not owner");   
    });

    // This function tests that the nonce increases everytime there is a successful transfer

    it("should increase nonce", async () => {
      const { core, addr1, addr2, addr3, addr4, addr5} = await loadFixture(deployMultiSig);  

      await core.connect(addr1).depositEth({value: '1000000000000000000'});
      await token.connect(addr2).transfer(core.address, '1000000000000000000');

      const hash = await core.connect(addr2).getEthTransferHash(addr1.address, '1000000000000000000', 1);
      const hash2 = await core.connect(addr2).getTokenTransferHash(token.address, addr5.address, '1000000000000000000', 2);

      const add1Hash = await addr1.signMessage(ethers.utils.arrayify(hash));
      const add2Hash = await addr2.signMessage(ethers.utils.arrayify(hash));
      const add3Hash = await addr3.signMessage(ethers.utils.arrayify(hash));
      const add4Hash = await addr4.signMessage(ethers.utils.arrayify(hash));
      const add1Hash1 = await addr1.signMessage(ethers.utils.arrayify(hash2));
      const add2Hash2 = await addr2.signMessage(ethers.utils.arrayify(hash2));
      const add3Hash3 = await addr3.signMessage(ethers.utils.arrayify(hash2));
      const add4Hash4 = await addr4.signMessage(ethers.utils.arrayify(hash2));

      const arrayOfSigs = [add1Hash, add2Hash, add3Hash, add4Hash];
      const arrayOfSigs2 = [add1Hash1, add2Hash2, add3Hash3, add4Hash4];

      const nonce1 = await core.connect(addr3).nonce();
      assert.equal(nonce1.toString(), '0', "invalid nonce");

      await core.transferEth(addr1.address, '1000000000000000000', arrayOfSigs);

      const nonce2 = await core.connect(addr3).nonce();
      assert.equal(nonce2.toString(), '1', "invalid nonce");

      await core.transferErc20(token.address, addr5.address, '1000000000000000000', arrayOfSigs2);

      const nonce3 = await core.connect(addr3).nonce();
      assert.equal(nonce3.toString(), '2', "invalid nonce");
      
    });

    // The following functions test that the the require statements, which checks that the contract..
    // has enough funds, works as intended lines 78, 101, 123

    it("should revert eth transfer", async () => {
      const { core, addr1, addr2, addr3, addr4} = await loadFixture(deployMultiSig);  

      await core.connect(addr1).depositEth({value: '1000000000000000000'});

      const hash = await core.connect(addr2).getEthTransferHash(addr1.address, '1000000000000000001', 2);

      const add1Hash = await addr1.signMessage(ethers.utils.arrayify(hash));
      const add2Hash = await addr2.signMessage(ethers.utils.arrayify(hash));
      const add3Hash = await addr3.signMessage(ethers.utils.arrayify(hash));
      const add4Hash = await addr4.signMessage(ethers.utils.arrayify(hash));

      const arrayOfSigs = [add1Hash, add2Hash, add3Hash, add4Hash];

      await expect
        (core.connect(addr4).transferEth(addr1.address, '1000000000000000001', arrayOfSigs)).to.be.revertedWith(
        "Ether balance too low");
    });

    it("should revert ERC20 transfer", async () => {
      const { core, token, addr1, addr2, addr3, addr4, addr5 } = await loadFixture(deployMultiSig);
        
      await token.connect(addr2).transfer(core.address, '1000000000000000000');

      const hash = await core.connect(addr2).getTokenTransferHash(token.address, addr5.address, '100000000000000001', 1);

      const add1Hash = await addr1.signMessage(ethers.utils.arrayify(hash));
      const add2Hash = await addr2.signMessage(ethers.utils.arrayify(hash));
      const add3Hash = await addr3.signMessage(ethers.utils.arrayify(hash));
      const add4Hash = await addr4.signMessage(ethers.utils.arrayify(hash));

      const arrayOfSigs = [add1Hash, add2Hash, add3Hash, add4Hash];
  
      await expect
        (core.connect(addr4).transferErc20(token.address, addr1.address, '1000000000000000001', arrayOfSigs)).to.be.revertedWith(
        "Token balance too low");
    });

    it("should revert NFT transfer", async () => {
      const { core, nft, addr1, addr2, addr3, addr4 } = await loadFixture(deployMultiSig);
        
      const hash = await core.connect(addr2).getTokenTransferHash(nft.address, addr2.address, 1, 1);
      const hash2 = await core.connect(addr2).getTokenTransferHash(nft.address, addr2.address, 1, 2);

      const add1Hash = await addr1.signMessage(ethers.utils.arrayify(hash));
      const add2Hash = await addr2.signMessage(ethers.utils.arrayify(hash));
      const add3Hash = await addr3.signMessage(ethers.utils.arrayify(hash));
      const add4Hash = await addr4.signMessage(ethers.utils.arrayify(hash));
      const add1Hash1 = await addr1.signMessage(ethers.utils.arrayify(hash2));
      const add2Hash2 = await addr2.signMessage(ethers.utils.arrayify(hash2));
      const add3Hash3 = await addr3.signMessage(ethers.utils.arrayify(hash2));
      const add4Hash4 = await addr4.signMessage(ethers.utils.arrayify(hash2));

      const arrayOfSigs = [add1Hash, add2Hash, add3Hash, add4Hash];
      const arrayOfSigs2 = [add1Hash1, add2Hash2, add3Hash3, add4Hash4];

      await core.transferNFT(nft.address, addr2.address, 1, arrayOfSigs);
  
      await expect
        (core.connect(addr4).transferNFT(nft.address, addr1.address, 1, arrayOfSigs2)).to.be.revertedWith(
        "Contract does not own token");
    });


    // The following functions test that the transfer functions revert if the signatures are invalid

    it("should revert eth invalid hash", async () => {
      const { core, addr1, addr2, addr3, addr4} = await loadFixture(deployMultiSig);  

      await core.connect(addr1).depositEth({value: '1000000000000000000'});

      const hash = await core.connect(addr2).getEthTransferHash(addr1.address, '1000000000000000000', 1);

      const add1Hash = await addr1.signMessage(ethers.utils.arrayify(hash));
      const add2Hash = await addr2.signMessage(ethers.utils.arrayify(hash));
      const add3Hash = await addr3.signMessage(ethers.utils.arrayify(hash));
      const add4Hash = await addr4.signMessage(ethers.utils.arrayify(hash));

      const arrayOfSigs = [add1Hash, add2Hash, add3Hash, add4Hash];

      await expect
        (core.connect(addr4).transferEth(addr2.address, '1000000000000000000', arrayOfSigs)).to.be.revertedWith(
        "invalid sig");   
    });

    it("should revert ERC20 invalid hash", async () => {
      const { core, token, addr1, addr2, addr3, addr4, addr5 } = await loadFixture(deployMultiSig);
        
      await token.connect(addr2).transfer(core.address, '1000000000000000000');

      const hash = await core.connect(addr2).getTokenTransferHash(token.address, addr5.address, '1000000000000000000', 1);

      const add1Hash = await addr1.signMessage(ethers.utils.arrayify(hash));
      const add2Hash = await addr2.signMessage(ethers.utils.arrayify(hash));
      const add3Hash = await addr3.signMessage(ethers.utils.arrayify(hash));
      const add4Hash = await addr4.signMessage(ethers.utils.arrayify(hash));

      const arrayOfSigs = [add1Hash, add2Hash, add3Hash, add4Hash];
  
      await expect
        (core.connect(addr4).transferErc20(token.address, addr5.address, '100000000000000000', arrayOfSigs)).to.be.revertedWith(
        "invalid sig");
    });

    it("should revert NFT invalid hash", async () => {
      const { core, nft, addr1, addr2, addr3, addr4 } = await loadFixture(deployMultiSig);
        

      const hash = await core.connect(addr2).getTokenTransferHash(nft.address, addr2.address, 1, 1);

      const add1Hash = await addr1.signMessage(ethers.utils.arrayify(hash));
      const add2Hash = await addr2.signMessage(ethers.utils.arrayify(hash));
      const add3Hash = await addr3.signMessage(ethers.utils.arrayify(hash));
      const add4Hash = await addr4.signMessage(ethers.utils.arrayify(hash));

      const arrayOfSigs = [add1Hash, add2Hash, add3Hash, add4Hash];
  
      await expect
        (core.connect(addr4).transferNFT(nft.address, addr2.address, 0, arrayOfSigs)).to.be.revertedWith(
        "invalid sig");
    });

 

  // The below functions test that correct signatures for transferEth function can't be used for transferErc20 or transferNFT functions,
  // That the correct signatures for transferErc20 function can't be used for transferEth or transferNFT functions,
  // and that the correct signatures for transferNFT function can't be used for transferEth or transferErc20 functions

    it("should revert can't use getTokenTransferHash for eth transfer", async () => {
      const { core, token, addr1, addr2, addr3, addr4, addr5} = await loadFixture(deployMultiSig);  

      await core.connect(addr1).depositEth({value: '1000000000000000000'});

      const hash = await core.connect(addr2).getTokenTransferHash(token.address, addr5.address, '1000000000000000000', 1);

      const add1Hash = await addr1.signMessage(ethers.utils.arrayify(hash));
      const add2Hash = await addr2.signMessage(ethers.utils.arrayify(hash));
      const add3Hash = await addr3.signMessage(ethers.utils.arrayify(hash));
      const add4Hash = await addr4.signMessage(ethers.utils.arrayify(hash));

      const arrayOfSigs = [add1Hash, add2Hash, add3Hash, add4Hash];

      await expect
        (core.connect(addr4).transferEth(addr5.address, '1000000000000000000', arrayOfSigs)).to.be.revertedWith(
        "invalid sig");   
    });

    it("should revert getTokenTransferHash for eth transfer part 2", async () => {
      const { core, nft, addr1, addr2, addr3, addr4, addr5} = await loadFixture(deployMultiSig);  

      await core.connect(addr1).depositEth({value: '1000000000000000000'});

      const hash = await core.connect(addr2).getTokenTransferHash(nft.address, addr5.address, 1, 1);

      const add1Hash = await addr1.signMessage(ethers.utils.arrayify(hash));
      const add2Hash = await addr2.signMessage(ethers.utils.arrayify(hash));
      const add3Hash = await addr3.signMessage(ethers.utils.arrayify(hash));
      const add4Hash = await addr4.signMessage(ethers.utils.arrayify(hash));

      const arrayOfSigs = [add1Hash, add2Hash, add3Hash, add4Hash];

      await expect
        (core.connect(addr4).transferEth(addr5.address, 1, arrayOfSigs)).to.be.revertedWith(
        "invalid sig");   
    });

    it("should revert can't use getEthTransferHash for ERC20 transfer", async () => {
      const { core, token, addr1, addr2, addr3, addr4 } = await loadFixture(deployMultiSig);
        
      await token.connect(addr2).transfer(core.address, '1000000000000000000');

      const hash = await core.connect(addr2).getEthTransferHash(addr1.address, '1000000000000000000', 1);

      const add1Hash = await addr1.signMessage(ethers.utils.arrayify(hash));
      const add2Hash = await addr2.signMessage(ethers.utils.arrayify(hash));
      const add3Hash = await addr3.signMessage(ethers.utils.arrayify(hash));
      const add4Hash = await addr4.signMessage(ethers.utils.arrayify(hash));

      const arrayOfSigs = [add1Hash, add2Hash, add3Hash, add4Hash];

      await expect
        (core.connect(addr4).transferErc20(token.address, addr1.address, '1000000000000000000', arrayOfSigs)).to.be.revertedWith(
        "invalid sig");
    });

    it("should revert can't use NFT hash for ERC20 transfer", async () => {
      const { core, token, addr1, addr2, addr3, addr4 } = await loadFixture(deployMultiSig);
        
      await token.connect(addr2).transfer(core.address, '1000000000000000000');

      const hash = await core.connect(addr2).getTokenTransferHash(nft.address, addr4.address, 1, 1);

      const add1Hash = await addr1.signMessage(ethers.utils.arrayify(hash));
      const add2Hash = await addr2.signMessage(ethers.utils.arrayify(hash));
      const add3Hash = await addr3.signMessage(ethers.utils.arrayify(hash));
      const add4Hash = await addr4.signMessage(ethers.utils.arrayify(hash));

      const arrayOfSigs = [add1Hash, add2Hash, add3Hash, add4Hash];

      await expect
        (core.connect(addr4).transferErc20(nft.address, addr4.address, 1, arrayOfSigs)).to.be.reverted;
    });

    it("should revert can't use getEthTransferHash for NFT transfer", async () => {
      const { core, addr1, addr2, addr3, addr4 } = await loadFixture(deployMultiSig);       

      const hash = await core.connect(addr2).getEthTransferHash(addr1.address, 1, 1);

      const add1Hash = await addr1.signMessage(ethers.utils.arrayify(hash));
      const add2Hash = await addr2.signMessage(ethers.utils.arrayify(hash));
      const add3Hash = await addr3.signMessage(ethers.utils.arrayify(hash));
      const add4Hash = await addr4.signMessage(ethers.utils.arrayify(hash));

      const arrayOfSigs = [add1Hash, add2Hash, add3Hash, add4Hash];

      await expect
        (core.connect(addr4).transferNFT(nft.address, addr1.address, 1, arrayOfSigs)).to.be.reverted;
    });

    it("should revert can't use ERC20 hash for NFT transfer", async () => {
      const { core, addr1, addr2, addr3, addr4 } = await loadFixture(deployMultiSig);       

      const hash = await core.connect(addr2).getTokenTransferHash(token.address, addr2.address, 1, 1);

      const add1Hash = await addr1.signMessage(ethers.utils.arrayify(hash));
      const add2Hash = await addr2.signMessage(ethers.utils.arrayify(hash));
      const add3Hash = await addr3.signMessage(ethers.utils.arrayify(hash));
      const add4Hash = await addr4.signMessage(ethers.utils.arrayify(hash));

      const arrayOfSigs = [add1Hash, add2Hash, add3Hash, add4Hash];

      await expect
        (core.connect(addr4).transferNFT(token.address, addr2.address, 1, arrayOfSigs)).to.be.reverted;
    });
 

  // The following functions test that the transfer of tokens works correctly when the proper signatures are given;


    it("should Transfer eth", async () => {
      const { core, addr1, addr2, addr3, addr4} = await loadFixture(deployMultiSig);  

      await core.connect(addr1).depositEth({value: '1000000000000000000'});

      const hash = await core.connect(addr2).getEthTransferHash(addr1.address, '1000000000000000000', 1);

      const add1Hash = await addr1.signMessage(ethers.utils.arrayify(hash));
      const add2Hash = await addr2.signMessage(ethers.utils.arrayify(hash));
      const add3Hash = await addr3.signMessage(ethers.utils.arrayify(hash));
      const add4Hash = await addr4.signMessage(ethers.utils.arrayify(hash));

      const arrayOfSigs = [add1Hash, add2Hash, add3Hash, add4Hash];

      await core.transferEth(addr1.address, '1000000000000000000', arrayOfSigs);

      const amount = await core.connect(addr1).getEtherBalance();
      assert.equal(amount.toString(), '0', "invalid balance");
    });

    it("should Transfer ERC20", async () => {
      const { core, token, addr1, addr2, addr3, addr4, addr5 } = await loadFixture(deployMultiSig);
        
      await token.connect(addr2).transfer(core.address, '1000000000000000000');

      const hash = await core.connect(addr2).getTokenTransferHash(token.address, addr5.address, '1000000000000000000', 1);

      const add1Hash = await addr1.signMessage(ethers.utils.arrayify(hash));
      const add2Hash = await addr2.signMessage(ethers.utils.arrayify(hash));
      const add3Hash = await addr3.signMessage(ethers.utils.arrayify(hash));
      const add4Hash = await addr4.signMessage(ethers.utils.arrayify(hash));

      const arrayOfSigs = [add1Hash, add2Hash, add3Hash, add4Hash];

      await core.transferErc20(token.address, addr5.address, '1000000000000000000', arrayOfSigs);
  
      const amount = await core.connect(addr3).getErc20Balance(token.address);
      const amount2 = await token.balanceOf(addr5.address);
      assert.equal(amount.toString(), '0', "invalid balance"); 
      assert.equal(amount2.toString(), '1000000000000000000', "invalid balance2");
    });

    it("should Transfer NFT", async () => {
      const { core, nft, addr1, addr2, addr3, addr4 } = await loadFixture(deployMultiSig);
        

      const hash = await core.connect(addr2).getTokenTransferHash(nft.address, addr2.address, 0, 1);

      const add1Hash = await addr1.signMessage(ethers.utils.arrayify(hash));
      const add2Hash = await addr2.signMessage(ethers.utils.arrayify(hash));
      const add3Hash = await addr3.signMessage(ethers.utils.arrayify(hash));
      const add4Hash = await addr4.signMessage(ethers.utils.arrayify(hash));

      const arrayOfSigs = [add1Hash, add2Hash, add3Hash, add4Hash];

      await core.transferNFT(nft.address, addr2.address, 0, arrayOfSigs);
  
      const amount = await core.connect(addr3).getNFTBalance(nft.address);
      const amount2 = await nft.balanceOf(addr2.address);
      assert.equal(amount.toString(), '1', "invalid balance"); 
      assert.equal(amount2.toString(), '1', "invalid balance2");
    });
    
})