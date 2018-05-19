var util = require('./util.js');

/*
This function creates the generation transaction that accepts the reward for
successfully mining a new block.
For some (probably outdated and incorrect) documentation about whats kinda going on here,
see: https://en.bitcoin.it/wiki/Protocol_specification#tx
 */

var generateOutputTransactions = function(poolRecipient, recipients, rpcData){

    var reward = rpcData.coinbasevalue;
    var rewardToPool = reward;

    var txOutputBuffers = [];


	/* pay to founder */
    if (rpcData.Foundnode.foundpayee) {
        var payeeReward = rpcData.Foundnode.foundamount;
        reward -= payeeReward;
        rewardToPool -= payeeReward;

		var payeeScript = util.addressToScript(rpcData.Foundnode.foundpayee);
        txOutputBuffers.push(Buffer.concat([
            util.packInt64LE(payeeReward),
            util.varIntBuffer(payeeScript.length),
            payeeScript
        ]));

		console.log("*************************************************************");
		console.log("foundscript: " + JSON.stringify(rpcData.Foundnode.foundscript));
		console.log("*************************************************************");
    }

    /* pay to masternode */
    if (rpcData.masternode.payee) {
        var payeeReward = rpcData.masternode.amount;
        reward -= payeeReward;
        rewardToPool -= payeeReward;

		var payeeScript = util.addressToScript(rpcData.masternode.payee);
        txOutputBuffers.push(Buffer.concat([
            util.packInt64LE(payeeReward),
            util.varIntBuffer(payeeScript.length),
            payeeScript
        ]));
	//	console.log("pay to masternode: " + payeeScript.toString('hex') + " " + payeeReward);
    }

    /* pay for superblock */
    if (rpcData.superblock.length > 0){
        for (var i in rpcData.superblock) {
            var payeeReward = 0 ;
            payeeReward = rpcData.superblock[i].amount;
            reward -= payeeReward;
            rewardToPool -= payeeReward;
			var payeeScript = util.addressToScript(rpcData.superblock[i].payee);
    
	        txOutputBuffers.push(Buffer.concat([
                util.packInt64LE(payeeReward),
                util.varIntBuffer(payeeScript.length),
                payeeScript
            ]));
			console.log("*********************************************************");
			console.log("pay for superblock: " + JSON.stringify(rpcData.superblock));
    		console.log("*********************************************************");
        }

    }


    for (var i = 0; i < recipients.length; i++){
        var recipientReward = Math.floor(recipients[i].percent * reward);
        rewardToPool -= recipientReward;

        txOutputBuffers.push(Buffer.concat([
            util.packInt64LE(recipientReward),
            util.varIntBuffer(recipients[i].script.length),
            recipients[i].script
        ]));
    }

    txOutputBuffers.unshift(Buffer.concat([
        util.packInt64LE(rewardToPool),
        util.varIntBuffer(poolRecipient.length),
        poolRecipient
    ]));

    if (rpcData.default_witness_commitment !== undefined){
        witness_commitment = new Buffer(rpcData.default_witness_commitment, 'hex');
        txOutputBuffers.unshift(Buffer.concat([
            util.packInt64LE(0),
            util.varIntBuffer(witness_commitment.length),
            witness_commitment
        ]));
    }

    return Buffer.concat([
        util.varIntBuffer(txOutputBuffers.length),
        Buffer.concat(txOutputBuffers)
    ]);

};


exports.createGeneration = function(rpcData, publicKey, reward, txMessages, recipients){
    var txInputsCount = 1;
    var txOutputsCount = 1;
    var txVersion = txMessages === true ? 2 : 1;
    var txLockTime = 0;

    var txInPrevOutHash = 0;
    var txInPrevOutIndex = Math.pow(2, 32) - 1;
    var txInSequence = 0;

    //Only required for POS coins
    var txTimestamp = reward === 'POS' ?
        util.packUInt32LE(rpcData.curtime) : new Buffer([]);

    //For coins that support/require transaction comments
    var txComment = txMessages === true ?
        util.serializeString('http://testnet-pool.ulord.one') :
        new Buffer([]);


    var scriptSigPart1 = Buffer.concat([
        util.serializeNumber(rpcData.height),
        new Buffer(rpcData.coinbaseaux.flags, 'hex'),
        util.serializeNumber(Date.now() / 1000 | 0)
    ]);

    var scriptSigPart2 = util.serializeString('/testnet-pool.ulord.one/');

    var p1 = Buffer.concat([
        util.packUInt32LE(txVersion),
        txTimestamp,
        //transaction input
        util.varIntBuffer(txInputsCount),
        util.uint256BufferFromHash(txInPrevOutHash),
        util.packUInt32LE(txInPrevOutIndex),
        util.varIntBuffer(scriptSigPart1.length + scriptSigPart2.length),
        scriptSigPart1
    ]);

    /*
    The generation transaction must be split at the extranonce (which located in the transaction input
    scriptSig). Miners send us unique extranonces that we use to join the two parts in attempt to create
    a valid share and/or block.
     */

    var outputTransactions = generateOutputTransactions(publicKey, recipients, rpcData);

    var p2 = Buffer.concat([
        scriptSigPart2,
        util.packUInt32LE(txInSequence),
        //end transaction input

        //transaction output
        outputTransactions,
        //end transaction ouput

        util.packUInt32LE(txLockTime),
        txComment
    ]);

    return Buffer.concat([p1, p2]);
};

