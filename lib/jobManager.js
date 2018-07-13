var events = require('events');
var crypto = require('crypto');
var bignum = require('bignum');

var util = require('./util.js');
var blockTemplate = require('./blockTemplate.js');
var connection = require('./moniterConnection.js')


//Unique extranonce per subscriber
var ExtraNonceCounter = function(configInstanceId){

	var maxBignum = bignum('ffffffffffffffffffffffffffffffffffffffffffffffffffffffff', 16);
	var makeExtraNonce = function(){ 
		var extraNonce = bignum.rand(maxBignum).toString(16);
		if(extraNonce.length !== 56){
			return makeExtraNonce();
		};
		return util.reverseBuffer(Buffer.from(extraNonce.toString(), 'hex')).toString('hex');
   };

   this.next = function(){ return makeExtraNonce() };
    this.size = 28; //bytes
};

//Unique job id per new block template
var JobCounter = function(){
    var counter = 0;

    this.next = function(){
        counter++;
        if (counter % 0xffff === 0)
            counter = 1;
        return this.cur();
    };

    this.cur = function () {
        return counter.toString(16);
    };
};

/**
 * Emits:
 * - newBlock(blockTemplate) - When a new block (previously unknown to the JobManager) is added, use this event to broadcast new jobs
 * - share(shareData, blockHex) - When a worker submits a share. It will have blockHex if a block was found
 **/
 var JobManager = module.exports = function JobManager(options){


    //private members

    var _this = this;
    var jobCounter = new JobCounter();

    var shareMultiplier = algos[options.coin.algorithm].multiplier;
    
    //public members

    this.extraNonceCounter = new ExtraNonceCounter(options.instanceId);
    this.moniter = '';

    this.currentJob;
    this.validJobs = {};

    var hashDigest = algos[options.coin.algorithm].hash(options.coin);

    var blockHasher = (function () {
        switch (options.coin.algorithm) {
            case 'scrypt':
            if (options.coin.reward === 'POS') {
                return function (d) {
                    return util.reverseBuffer(hashDigest.apply(this, arguments));
                };
            }
            case 'scrypt-og':
            if (options.coin.reward === 'POS') {
                return function (d) {
                    return util.reverseBuffer(hashDigest.apply(this, arguments));
                };
            }
            case 'scrypt-jane':
            if (options.coin.reward === 'POS') {
                return function (d) {
                    return util.reverseBuffer(hashDigest.apply(this, arguments));
                };
            }
            case 'scrypt-n':
            case 'sha1':
            return function (d) {
                return util.reverseBuffer(util.sha256d(d));
            };
            default:
            return function () {
                return util.reverseBuffer(hashDigest.apply(this, arguments));
            };
        }
    })();
    this.addMoniter = function(address){
        this.moniter=address;
    }
    this.removeMoniter = function(){
        this.moniter='';
        
    }
    this.updateCurrentJob = function(rpcData){

        var tmpBlockTemplate = new blockTemplate(
            jobCounter.next(),
            rpcData,
            options.poolAddressScript,
            _this.extraNonceCounter,
            options.coin.reward,
            options.coin.txMessages,
            options.recipients
            );

        _this.currentJob = tmpBlockTemplate;

        _this.emit('updatedBlock', tmpBlockTemplate, true);

        _this.validJobs[tmpBlockTemplate.jobId] = tmpBlockTemplate;

    };

    //returns true if processed a new block
    this.processTemplate = function(rpcData){

        /* Block is new if A) its the first block we have seen so far or B) the blockhash is different and the
        block height is greater than the one we have */
        var isNewBlock = typeof(_this.currentJob) === 'undefined';
        if  (!isNewBlock && _this.currentJob.rpcData.previousblockhash !== rpcData.previousblockhash){
            isNewBlock = true;

            //If new block is outdated/out-of-sync than return
            if (rpcData.height < _this.currentJob.rpcData.height)
                return false;
        }

        if (!isNewBlock) return false;


        var tmpBlockTemplate = new blockTemplate(
            jobCounter.next(),
            rpcData,
            options.poolAddressScript,
            _this.extraNonceCounter,
            options.coin.reward,
            options.coin.txMessages,
            options.recipients
            );

        this.currentJob = tmpBlockTemplate;

        this.validJobs = {};
        _this.emit('newBlock', tmpBlockTemplate);
        this.validJobs[tmpBlockTemplate.jobId] = tmpBlockTemplate;

        return true;

    };

    this.processSecondShare = function(jobId, previousDifficulty, difficulty, ipAddress, port, workerName, nTime, nonce, extraNonce1, extraNonce2, hash){
        var shareError = function(error){
            _this.emit('share', {
                job: jobId,
                ip: ipAddress,
                worker: workerName,
                difficulty: difficulty,
                error: error[1]
            });
            return {error: error, result: null};
        };

        var submitTime = Date.now() / 1000 | 0;
        var job = this.validJobs[jobId];
        var minerAddress = workerName.split('.')[0];
        if (typeof job === 'undefined' || job.jobId != jobId ) {
            return shareError([21, 'job not found']);
        }
        if(extraNonce2.length!==8) {
            return shareError([20, 'incorrect size of nonce']);
        }
        extraNonce2 = Buffer.from(extraNonce2,'hex').toString('hex');

        if(extraNonce2.length!==8) {
           return shareError([20, 'incorrect size of nonce']);
       }

       if (!job.registerSubmit(extraNonce1,extraNonce2)){
           return shareError([22, 'duplicate share']);
       }

       var headerBuffer = job.serializeHeader(extraNonce1, extraNonce2);

       var headerHash = hashDigest(headerBuffer,null);   

       if (hash && headerHash.toString('hex') !== hash) {
          return shareError([31, 'incorrect hash of ' + hash]); 
      }
      if(_this.moniter.indexOf(minerAddress)!=-1){
        connection.zadd(_this.moniter+"_hash",Date.now(),JSON.stringify({
            workerName:workerName,
            jobId:jobId,
            extraNonce1:extraNonce1,
            extraNonce2:extraNonce2,
            submitHash:hash,
            headerBuffer:headerBuffer.toString('hex'),
            time:Date.now()
        }))
      }
      var headerBigNum = bignum.fromBuffer(headerHash, {endian: 'little', size: 32});

      var blockHashInvalid;
      var blockHash;
      var blockHex;

      var shareDiff = diff1 / headerBigNum.toNumber() * shareMultiplier;

      var blockDiffAdjusted = job.difficulty * shareMultiplier;

        //Check if share is a block candidate (matched network difficulty)
        if (job.target.ge(headerBigNum)){
            blockHex = job.serializeBlock(headerBuffer).toString('hex');
            blockHash = blockHasher(headerBuffer, /*nTime*/null).toString('hex');
        }
        else {
            if (options.emitInvalidBlockHashes)
                blockHashInvalid = util.reverseBuffer(util.sha256d(headerBuffer)).toString('hex');

            //Check if share didn't reached the miner's difficulty)
            if (shareDiff / difficulty < 0.99){

                //Check if share matched a previous difficulty from before a vardiff retarget
                if (previousDifficulty  && shareDiff >= previousDifficulty){
                    difficulty = previousDifficulty;
                }
                else{
                    return shareError([23, 'low difficulty share of ' + shareDiff]);
                }

            }
        }


        _this.emit('share', {
            job: jobId,
            ip: ipAddress,
            port: port,
            worker: workerName,
            height: job.rpcData.height,
            blockReward: job.rpcData.coinbasevalue,
            difficulty: difficulty,
            shareDiff: shareDiff.toFixed(8),
            blockDiff : blockDiffAdjusted,
            blockDiffActual: job.difficulty,
            blockHash: blockHash,
            blockHashInvalid: blockHashInvalid
        }, blockHex);
        return {result: true, error: null, blockHash: blockHash,difficulty:difficulty,height:job.rpcData.height,worker:workerName,ip:ipAddress,shareDiff:shareDiff,blockDiff:blockDiffAdjusted};
    };


};
JobManager.prototype.__proto__ = events.EventEmitter.prototype;
