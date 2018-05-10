var bignum = require('bignum');
var multiHashing = require('node-multi-hashing');
var cryptoHello = multiHashing['cryptohello'];
var util = require('./util.js');

var diff1 = global.diff1 = 0x00000000ffff0000000000000000000000000000000000000000000000000000;

var algos = module.exports = global.algos = {
    sha256: {
        //Uncomment diff if you want to use hardcoded truncated diff
        //diff: '00000000ffff0000000000000000000000000000000000000000000000000000',
        hash: function(){
            return function(){
 				console.log('sha256');
                return util.sha256d.apply(this, arguments);
            }
        }
    },
    cryptohello: {
        //diff: '0000ffff00000000000000000000000000000000000000000000000000000000',
        multiplier: Math.pow(2, 16),
        hash: function(){
            return function(data){
				return multiHashing.cryptohello(data, false);
            }
        }
    },
    'scrypt': {
        //Uncomment diff if you want to use hardcoded truncated diff
        //diff: '0000ffff00000000000000000000000000000000000000000000000000000000',
        multiplier: Math.pow(2, 16),
        hash: function(coinConfig){
            var nValue = coinConfig.nValue || 1024;
            var rValue = coinConfig.rValue || 1;
            return function(data){
                return multiHashing.scrypt(data,nValue,rValue);
            }
        }
    },
    'scrypt-og': {
        //Aiden settings
        //Uncomment diff if you want to use hardcoded truncated diff
        //diff: '0000ffff00000000000000000000000000000000000000000000000000000000',
        multiplier: Math.pow(2, 16),
        hash: function(coinConfig){
            var nValue = coinConfig.nValue || 64;
            var rValue = coinConfig.rValue || 1;
            return function(data){
                return multiHashing.scrypt(data,nValue,rValue);
            }
        }
    },
    'scrypt-jane': {
        multiplier: Math.pow(2, 16),
        hash: function(coinConfig){
            var nTimestamp = coinConfig.chainStartTime || 1367991200;
            var nMin = coinConfig.nMin || 4;
            var nMax = coinConfig.nMax || 30;
            return function(data, nTime){
                return multiHashing.scryptjane(data, nTime, nTimestamp, nMin, nMax);
            }
        }
    },
    'scrypt-n': {
        multiplier: Math.pow(2, 16),
        hash: function(coinConfig){

            var timeTable = coinConfig.timeTable || {
                "2048": 1389306217, "4096": 1456415081, "8192": 1506746729, "16384": 1557078377, "32768": 1657741673,
                "65536": 1859068265, "131072": 2060394857, "262144": 1722307603, "524288": 1769642992
            };

            var nFactor = (function(){
                var n = Object.keys(timeTable).sort().reverse().filter(function(nKey){
                    return Date.now() / 1000 > timeTable[nKey];
                })[0];

                var nInt = parseInt(n);
                return Math.log(nInt) / Math.log(2);
            })();

            return function(data) {
                return multiHashing.scryptn(data, nFactor);
            }
        }
    },
    sha1: {
        hash: function(){
            return function(){
                return multiHashing.sha1.apply(this, arguments);
            }
        }
    },
    x13: {
        hash: function(){
            return function(){
                return multiHashing.x13.apply(this, arguments);
            }
        }
    },
    x15: {
        hash: function(){
            return function(){
                return multiHashing.x15.apply(this, arguments);
            }
        }
    },
    nist5: {
        hash: function(){
            return function(){
                return multiHashing.nist5.apply(this, arguments);
            }
        }
    },
    quark: {
        hash: function(){
            return function(){
                return multiHashing.quark.apply(this, arguments);
            }
        }
    },
    keccak: {
        multiplier: Math.pow(2, 8),
        hash: function(coinConfig){
            if (coinConfig.normalHashing === true) {
                return function (data, nTimeInt) {
                    return multiHashing.keccak(multiHashing.keccak(Buffer.concat([data, new Buffer(nTimeInt.toString(16), 'hex')])));
                };
            }
            else {
                return function () {
                    return multiHashing.keccak.apply(this, arguments);
                }
            }
        }
    },
    blake: {
        multiplier: Math.pow(2, 8),
        hash: function(){
            return function(){
                return multiHashing.blake.apply(this, arguments);
            }
        }
    },
    skein: {
        hash: function(){
            return function(){
                return multiHashing.skein.apply(this, arguments);
            }
        }
    },
    groestl: {
        multiplier: Math.pow(2, 8),
        hash: function(){
            return function(){
                return multiHashing.groestl.apply(this, arguments);
            }
        }
    },
    fugue: {
        multiplier: Math.pow(2, 8),
        hash: function(){
            return function(){
                return multiHashing.fugue.apply(this, arguments);
            }
        }
    },
    shavite3: {
        hash: function(){
            return function(){
                return multiHashing.shavite3.apply(this, arguments);
            }
        }
    },
    hefty1: {
        hash: function(){
            return function(){
                return multiHashing.hefty1.apply(this, arguments);
            }
        }
    },
    qubit: {
        hash: function(){
            return function(){
                return multiHashing.qubit.apply(this, arguments);
            }
        }
    }
};


for (var algo in algos){
    if (!algos[algo].multiplier)
        algos[algo].multiplier = 1;

    /*if (algos[algo].diff){
        algos[algo].maxDiff = bignum(algos[algo].diff, 16);
    }
    else if (algos[algo].shift){
        algos[algo].nonTruncatedDiff = util.shiftMax256Right(algos[algo].shift);
        algos[algo].bits = util.bufferToCompactBits(algos[algo].nonTruncatedDiff);
        algos[algo].maxDiff = bignum.fromBuffer(util.convertBitsToBuff(algos[algo].bits));
    }
    else if (algos[algo].multiplier){
        algos[algo].maxDiff = diff1.mul(Math.pow(2, 32) / algos[algo].multiplier);
    }
    else{
        algos[algo].maxDiff = diff1;
    }*/
}
