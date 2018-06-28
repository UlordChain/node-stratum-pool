var bignum = require('bignum');

var merkleTree = require('./merkleTree.js');
var transactions = require('./transactions.js');
var util = require('./util.js');


/**
 * The BlockTemplate class holds a single job.
 * and provides several methods to validate and submit it to the daemon coin
**/
var BlockTemplate = module.exports = function BlockTemplate(jobId, rpcData, poolAddressScript, extraNonce, 
                                            reward, txMessages, recipients){

    /* private members */

    var submits = [];

    function getMerkleHashes(steps){
        return steps.map(function(step){
            return step.toString('hex');
        });
    }

    function getTransactionBuffers(txs){
        var txHashes = txs.map(function(tx){
            if (tx.txid !== undefined) {
                return util.uint256BufferFromHash(tx.txid);
            }
            return util.uint256BufferFromHash(tx.hash);
        });
        return [null].concat(txHashes);
    }
   /*
    function getVoteData(){
        if (!rpcData.masternode_payments) return new Buffer([]);

        return Buffer.concat(
            [util.varIntBuffer(rpcData.votes.length)].concat(
                rpcData.votes.map(function (vt) {
                    return new Buffer(vt, 'hex');
                })
            )
        );
    }
   */
    /* public members */
    this.rpcData = rpcData;
    this.jobId = jobId;
    this.target = rpcData.target ? bignum(rpcData.target, 16) : util.bignumFromBitsHex(rpcData.bits);
    this.difficulty = parseFloat((diff1 / this.target.toNumber()).toFixed(9));

    /* generate coinbase tx */
    
	this.coinbaseTx = transactions.createGeneration(rpcData, poolAddressScript, reward, 
                                           				txMessages, recipients).toString('hex');

    this.coinbaseTxBuffer = new Buffer(this.coinbaseTx, 'hex');
    this.coinbaseTxHash = util.sha256d(this.coinbaseTxBuffer); 
    
    this.transactionData = Buffer.concat(rpcData.transactions.map(function(tx){
        return new Buffer(tx.data, 'hex');
    }));

    /* collect the header's data */
    this.prevHashReversed = util.reverseBuffer(new Buffer(rpcData.previousblockhash, 'hex')).toString('hex');
    
	this.merkleTree = new merkleTree(getTransactionBuffers(rpcData.transactions));
    this.merkleRoot = this.merkleTree.withFirst(this.coinbaseTxHash).toString('hex');
	
	this.claimtrieReversed = util.reverseBuffer(new Buffer(rpcData.claimtrie, 'hex')).toString('hex');
    
	this.serializeCoinbase = function(){
        return this.coinbaseTxBuffer;
    }

    /* https://en.bitcoin.it/wiki/Protocol_specification#Block_Headers */
    this.serializeHeader = function(extraNonce1, extraNonce2){
		
		var nonce = extraNonce2;
		if(extraNonce1){ 
			nonce += extraNonce1;
	    }

		/* 4+32+32+32+4+4 + 32 = 140 */
        var header =  new Buffer(140).fill(0);
		header.write(this.serializeIncompleteHeader().toString('hex'), 0, 108, 'hex');
		header.write(nonce, 108, 32, 'hex');
	 
	    /* console.log("serialize header = " + header.toString('hex')); */
	    return header;
    };

	this.serializeIncompleteHeader = function(){
		if(!this.incompleteHeader){
			var incompleteHeader = new Buffer(108).fill(0);
			var position = 0;
			incompleteHeader.writeInt32LE(rpcData.version, position, 4, 'hex');
    	   	incompleteHeader.write(this.prevHashReversed, position += 4, 32, 'hex');
        	incompleteHeader.write(this.merkleRoot, position += 32, 32, 'hex');
       		incompleteHeader.write(this.claimtrieReversed, position += 32, 32, 'hex');
       		incompleteHeader.writeUInt32LE(rpcData.curtime, position += 32, 4, 'hex');
       		incompleteHeader.writeUInt32LE(parseInt(rpcData.bits, 16), position += 4, 4, 'hex');
			this.incompleteHeader = incompleteHeader;
		}	
	/*	console.log("incompleteHeader: " + this.incompleteHeader.toString('hex')); */
		return this.incompleteHeader;
	};

    // 	var extraNonce1 = extraNonce.next();
    
	this.serializeRawHeader = function(){
		var rawHeader = new Buffer(140).fill(0);
		rawHeader.write(this.serializeIncompleteHeader().toString('hex'), 0, 108, 'hex');
	    /* rawHeader.write(extraNonce.next(), 112, 28, 'hex'); */
		return rawHeader;
    };

    this.serializeBlock = function(header){
		return Buffer.concat([
            header,
            util.varIntBuffer(this.rpcData.transactions.length + 1),
            this.coinbaseTxBuffer,
            this.transactionData,
        /*  getVoteData(), */
            /* POS coins require a zero byte appended to block which the daemon replaces with the signature */
            new Buffer(reward === 'POS' ? [0] : [])
        ]);
    };

    this.registerSubmit = function(extraNonce1, extraNonce2){
        var submission = extraNonce2.toLowerCase() + extraNonce1;
        if (submits.indexOf(submission) === -1){
            submits.push(submission);
            return true;
        }
        return false;
    };

    this.getJobParams = function(){
        if (!this.jobParams){
			this.jobParams = [
				this.jobId,
				this.serializeIncompleteHeader().toString('hex'),
                true,
            ];
        }
		return this.jobParams;
    };

};
