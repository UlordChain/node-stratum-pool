High performance Stratum poolserver in Node.js. One instance of this software can startup and manage multiple coin
pools, each with their own daemon and stratum port :)

#### Notice
This is a module for Node.js that will do nothing on its own. Unless you're a Node.js developer who would like to
handle stratum authentication and raw share data then this module will not be of use to you. For a full featured portal
that uses this module, see [Ulord (Node Open Mining Portal)](https://github.com/UlordChain/ulord-node-stratum-pool). It
handles payments, website front-end, database layer, mutli-coin/pool support, auto-switching miners between coins/pools,
etc.. The portal also has an [MPOS](https://github.com/MPOS/php-mpos) compatibility mode so that the it can function as
a drop-in-replacement for [python-stratum-mining](https://github.com/Crypto-Expert/stratum-mining).


#### Why
This server was built to be more efficient and easier to setup, maintain and scale than existing stratum poolservers
which are written in python. Compared to the spaghetti state of the latest
[stratum-mining python server](https://github.com/Crypto-Expert/stratum-mining/), this software should also have a
lower barrier to entry for other developers to fork and add features or fix bugs.


Features
----------------------------------
* Daemon RPC interface
* Stratum TCP socket server
* Block template / job manager
* P2P to get block notifications as peer node
* Optimized generation transaction building
* Connecting to multiple daemons for redundancy
* Process share submissions
* Session managing for purging DDoS/flood initiated zombie workers
* Auto ban IPs that are flooding with invalid shares
* __POW__ (proof-of-work) & __POS__ (proof-of-stake) support
* Transaction messages support
* Vardiff (variable difficulty / share limiter)
* When started with a coin deamon that hasn't finished syncing to the network it shows the blockchain download progress and initializes once synced

#### Hashing algorithms supported:
* ✓ __CryptoHello__ (Ulord [UT])
* ✓ __SHA256__ (Bitcoin, Freicoin, Peercoin/PPCoin, Terracoin, etc..)
* ✓ __Scrypt__ (Litecoin, Dogecoin, Feathercoin, etc..)
* ✓ __Scrypt-Jane__ (YaCoin, CopperBars, Pennies, Tickets, etc..)
* ✓ __Scrypt-N__ (Vertcoin [VTC])
* ✓ __Quark__ (Quarkcoin [QRK])
* ✓ __X13__ (MaruCoin, BoostCoin)
* ✓ __NIST5__ (Talkcoin)
* ✓ __Keccak__ (Maxcoin [MAX], HelixCoin, CryptoMeth, Galleon, 365coin, Slothcoin, BitcointalkCoin)
* ✓ __Skein__ (Skeincoin [SKC])
* ✓ __Groestl__ (Groestlcoin [GRS])

May be working (needs additional testing):
* ? *Blake* (Blakecoin [BLC])
* ? *Fugue* (Fuguecoin [FC])
* ? *Qubit* (Qubitcoin [Q2C], Myriadcoin [MYR])
* ? *SHAvite-3* (INKcoin [INK])
* ? *Sha1* (Sha1coin [SHA], Yaycoin [YAY])

Not working currently:
* *Groestl* - for Myriadcoin
* *Keccak* - for eCoin & Copperlark
* *Hefty1* (Heavycoin [HVC])


Requirements
------------
* node v0.10+
* coin daemon (preferably one with a relatively updated API and not some crapcoin :p)


Example Usage
-------------

#### Install as a node module by cloning repository

```bash
git clone https://github.com/UlordChain/node-stratum-pool node_modules/stratum-pool
npm update
```

#### Module usage

Create the configuration for your coin:

Possible options for `algorithm`: *sha256, scrypt, scrypt-jane, scrypt-n, quark, keccak, blake,
skein, groestl, fugue, shavite3, hefty1, qubit, or sha1*.

```javascript
var myCoin = {
    "name": "Ulord",
    "symbol": "ULD",
    "algorithm": "cryptohello",
    "nValue": 1024, //optional - defaults to 1024
    "rValue": 1, //optional - defaults to 1
    "txMessages": false, //optional - defaults to false,

    /* Magic value only required for setting up p2p block notifications. It is found in the daemon
       source code as the pchMessageStart variable.
       For example, litecoin mainnet magic: http://git.io/Bi8YFw
       And for litecoin testnet magic: http://git.io/NXBYJA */
     "peerMagic": "fbc0b6db" //optional
     "peerMagicTestnet": "fcc1b7dc" //optional
};
```

If you are using the `scrypt-jane` algorithm there are additional configurations:

```javascript
var myCoin = {
    "name": "Freecoin",
    "symbol": "FEC",
    "algorithm": "scrypt-jane",
    "chainStartTime": 1375801200, //defaults to 1367991200 (YACoin) if not used
    "nMin": 6, //defaults to 4 if not used
    "nMax": 32 //defaults to 30 if not used
};
```

If you are using the `scrypt-n` algorithm there is an additional configuration:
```javascript
var myCoin = {
    "name": "Execoin",
    "symbol": "EXE",
    "algorithm": "scrypt-n",
    /* This defaults to Vertcoin's timetable if not used. It is required for scrypt-n coins that
       have modified their N-factor timetable to be different than Vertcoin's. */
    "timeTable": {
        "2048": 1390959880,
        "4096": 1438295269,
        "8192": 1485630658,
        "16384": 1532966047,
        "32768": 1580301436,
        "65536": 1627636825,
        "131072": 1674972214,
        "262144": 1722307603
    }
};
```

If you are using the `keccak` algorithm there are additional configurations *(The rare `normalHashing` keccak coins
such as Copperlark and eCoin don't appear to work yet - only the popular ones like Maxcoin are)*:
```javascript
var myCoin = {
    "name": "eCoin",
    "symbol": "ECN",
    "algorithm": "keccak",

    /* This is not required and set to false by default. Some coins such as Copperlark and eCoin
       require it to be set to true. Maxcoin and most others are false. */
    "normalHashing": true
};
```


Create and start new pool with configuration options and authentication function

```javascript
var Stratum = require('stratum-pool');

var pool = Stratum.createPool({

    "coin": myCoin,

    "address": "mi4iBXbBsydtcc5yFmsff2zCFVX4XG7qJc", //Address to where block rewards are given

    /* Block rewards go to the configured pool wallet address to later be paid out to miners,
       except for a percentage that can go to, for examples, pool operator(s) as pool fees or
       or to donations address. Addresses or hashed public keys can be used. Here is an example
       of rewards going to the main pool op, a pool co-owner, and NOMP donation. */
    "rewardRecipients": {
        "n37vuNFkXfk15uFnGoVyHZ6PYQxppD3QqK": 1.5, //1.5% goes to pool op
        "mirj3LtZxbSTharhtXvotqtJXUY7ki5qfx": 0.5, //0.5% goes to a pool co-owner

        /* 0.1% donation to NOMP. This pubkey can accept any type of coin, please leave this in
           your config to help support NOMP development. */
        "22851477d63a085dbc2398c8430af1c09e7343f6": 0.1
    },

    "blockRefreshInterval": 1000, //How often to poll RPC daemons for new blocks, in milliseconds


    /* Some miner apps will consider the pool dead/offline if it doesn't receive anything new jobs
       for around a minute, so every time we broadcast jobs, set a timeout to rebroadcast
       in this many seconds unless we find a new job. Set to zero or remove to disable this. */
    "jobRebroadcastTimeout": 55,

    //instanceId: 37, //Recommend not using this because a crypto-random one will be generated

    /* Some attackers will create thousands of workers that use up all available socket connections,
       usually the workers are zombies and don't submit shares after connecting. This features
       detects those and disconnects them. */
    "connectionTimeout": 600, //Remove workers that haven't been in contact for this many seconds

    /* Sometimes you want the block hashes even for shares that aren't block candidates. */
    "emitInvalidBlockHashes": false,

    /* Enable for client IP addresses to be detected when using a load balancer with TCP proxy
       protocol enabled, such as HAProxy with 'send-proxy' param:
       http://haproxy.1wt.eu/download/1.5/doc/configuration.txt */
    "tcpProxyProtocol": false,

    /* If a worker is submitting a high threshold of invalid shares we can temporarily ban their IP
       to reduce system/network load. Also useful to fight against flooding attacks. If running
       behind something like HAProxy be sure to enable 'tcpProxyProtocol', otherwise you'll end up
       banning your own IP address (and therefore all workers). */
    "banning": {
        "enabled": true,
        "time": 600, //How many seconds to ban worker for
        "invalidPercent": 50, //What percent of invalid shares triggers ban
        "checkThreshold": 500, //Check invalid percent when this many shares have been submitted
        "purgeInterval": 300 //Every this many seconds clear out the list of old bans
    },

    /* Each pool can have as many ports for your miners to connect to as you wish. Each port can
       be configured to use its own pool difficulty and variable difficulty settings. varDiff is
       optional and will only be used for the ports you configure it for. */
    "ports": {
        "3032": { //A port for your miners to connect to
            "diff": 32, //the pool difficulty for this port

            /* Variable difficulty is a feature that will automatically adjust difficulty for
               individual miners based on their hashrate in order to lower networking overhead */
            "varDiff": {
                "minDiff": 8, //Minimum difficulty
                "maxDiff": 512, //Network difficulty will be used if it is lower than this
                "targetTime": 15, //Try to get 1 share per this many seconds
                "retargetTime": 90, //Check to see if we should retarget every this many seconds
                "variancePercent": 30 //Allow time to very this % from target without retargeting
            }
        },
        "3256": { //Another port for your miners to connect to, this port does not use varDiff
            "diff": 256 //The pool difficulty
        }
    },

    /* Recommended to have at least two daemon instances running in case one drops out-of-sync
       or offline. For redundancy, all instances will be polled for block/transaction updates
       and be used for submitting blocks. Creating a backup daemon involves spawning a daemon
       using the "-datadir=/backup" argument which creates a new daemon instance with it's own
       RPC config. For more info on this see:
          - https://en.bitcoin.it/wiki/Data_directory
          - https://en.bitcoin.it/wiki/Running_bitcoind */
    "daemons": [
        {   //Main daemon instance
            "host": "127.0.0.1",
            "port": 19332,
            "user": "litecoinrpc",
            "password": "testnet"
        },
        {   //Backup daemon instance
            "host": "127.0.0.1",
            "port": 19344,
            "user": "litecoinrpc",
            "password": "testnet"
        }
    ],


    /* This allows the pool to connect to the daemon as a node peer to receive block updates.
       It may be the most efficient way to get block updates (faster than polling, less
       intensive than blocknotify script). It requires the additional field "peerMagic" in
       the coin config. */
    "p2p": {
        "enabled": false,

        /* Host for daemon */
        "host": "127.0.0.1",

        /* Port configured for daemon (this is the actual peer port not RPC port) */
        "port": 19333,

        /* If your coin daemon is new enough (i.e. not a shitcoin) then it will support a p2p
           feature that prevents the daemon from spamming our peer node with unnecessary
           transaction data. Assume its supported but if you have problems try disabling it. */
        "disableTransactions": true

    }

}, function(ip, port , workerName, password, callback){ //stratum authorization function
    console.log("Authorize " + workerName + ":" + password + "@" + ip);
    callback({
        error: null,
        authorized: true,
        disconnect: false
    });
});
```


Listen to pool events
```javascript

pool.on('share', function(isValidShare, isValidBlock, data){

    if (isValidBlock)
        console.log('Block found');
    else if (isValidShare)
        console.log('Valid share submitted');
    else if (data.blockHash)
        console.log('We thought a block was found but it was rejected by the daemon');
    else
        console.log('Invalid share submitted')

    console.log('share data: ' + JSON.stringify(data));
});



pool.on('log', function(severity, logKey, logText){
    console.log(severity + ': ' + '[' + logKey + '] ' + logText);
});
```

Start pool
```javascript
pool.start();
```

License
-------
Released under the GNU General Public License v2

http://www.gnu.org/licenses/gpl-2.0.html
