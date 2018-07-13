var net = require('net');
var events = require('events');
var util = require('./util.js');
var connection = require('./moniterConnection.js')
var fs = require('fs')
var SubscriptionCounter = function(){
    var count = 0;
    var padding = 'deadbeefcafebabe';
    return {
        next: function(){
            count++;
            if (Number.MAX_VALUE === count) count = 0;
            return padding + util.packInt64LE(count).toString('hex');
        }
    };
};


/**
 * Defining each client that connects to the stratum server. 
 * Emits:
 *  - subscription(obj, cback(error, extraNonce1, extraNonce2Size))
 *  - submit(data(name, jobID, extraNonce2, ntime, nonce))
**/
var StratumClient = function(options){
    var pendingDifficulty = null;
    //private members
    var _this = this;
    _this.socket = options.socket;
    this.remoteAddress = options.socket.remoteAddress;
    var banning = options.banning;
    var poolConfig = JSON.parse(process.env.pools).ulord;

	this.jsonrpc = '2.0';
   
    this.minDifficulty = parseFloat(1/0xffff);
	
	this.middleDifficulty = 0xffff;

	this.maxDifficulty = 0xffffffffffff;   

    this.lastActivity = Date.now();

    this.shares = {valid: 0, invalid: 0};

    var considerBan = (!banning || !banning.enabled) ? function(){ return false } : function(shareValid){
        if (shareValid === true) _this.shares.valid++;
        else _this.shares.invalid++;
        var totalShares = _this.shares.valid + _this.shares.invalid;
        if (totalShares >= banning.checkThreshold){
            var percentBad = (_this.shares.invalid / totalShares) * 100;
            if (percentBad < banning.invalidPercent) //reset shares
                this.shares = {valid: 0, invalid: 0};
            else {
                _this.emit('triggerBan', _this.shares.invalid + ' out of the last ' + totalShares + ' shares were invalid');
                _this.socket.destroy();
                return true;
            }
        }
        return false;
    };

    this.init = function init(){
        setupSocket();
    };

    function handleMessage(message){
		
        switch(message.method){        
            case 'login':
                handleLogin(message);
                break;

            case 'submit':
                _this.lastActivity = Date.now();
                handleSecondSubmit(message);
                break;
            case 'keepalived':
                _this.lastActivity = Date.now();
                sendJson({
                    id      : message.id,
                    jsonrpc : message.jsonrpc,
                    result  : null,
                    error   : null,
                    status  : message.status
                });
                break;

            default:
                _this.emit('unknownStratumMethod', message);
                break;
        }
    }


    function handleLogin(message){
        if (! _this._authorized ) {
            _this.requestedSubscriptionBeforeAuth = true;
        }
		_this.method = 'login';
        _this.jsonrpc = message.jsonrpc;

        _this.emit('login', {}, function(error, extraNonce){
            if (error) {
                sendJson({
                    id: message.id,
                    jsonrpc: message.jsonrpc,
                    error: error,
                    result: null,
                    status: "OK"
                });
				console.log("login failed, " + error);
                return;
            }
			_this.extraNonce1 = extraNonce;
        });
     
	   handleAuthorize(message, true);
    }

    function handleSecondSubmit(message){
        if (!_this.authorized){
            sendJson({
                id    : message.id,
                result: null,
                error : [24, "unauthorized worker", null]
            });
            considerBan(false);
            return;
        }
        if (!_this.extraNonce1){
            sendJson({
                id    : message.id,
                result: null,
                error : [25, "not login", null]
            });
            considerBan(false);
            return;
        }

      /* for xmrig, params: id, rpcid, jobid, nonce, result */
        _this.emit('secondSubmit',
            {
                clientId : options.subscriptionId,
                name   : _this.fullName,
                jobId  : message.params.job_id,
                nonce  : message.params.nonce,
                hash   : message.params.result
            },
            function(error, result,difficulty,height,ip,worker,shareDiff,blockDiff){
                if (!considerBan(result)){
                    if(result===true){
                        sendJson({
                            id      : message.id,
                            jsonrpc : "2.0",
                            result  : {"status" : "OK"},
                            error   : null
                        });
						if(_this.watching && !poolConfig.security.rejectBlackCalc){
							util.logToFile(JSON.stringify(message)+" Difficulty:"+ difficulty+" height:"+height+" ip:"+ip+" workerName:"+worker+" shareDiff:"+shareDiff+" blockDiff"+blockDiff+'\n',"blackcalc.log");
						}else if(_this.watching && poolConfig.security.rejectBlackCalc){
							console.log("Hold your fire,fool blackcalc!");
							_this.emit('triggerBan', "take it ~ boy");
                            _this.socket.destroy();	
						}
                    }else {
                        sendJson({
                            id      : message.id,
                            jsonrpc : "2.0",
                            error   : {
                                code:-1,
                                message:error[1]
                            }
                        });
                    }
                    
                }
            }
        );
    }

    function handleAuthorize(message, replyToSocket){
        
		if(message.method === 'login'){
			_this.fullName = message.params.login;
      		_this.workerName = message.params.login.split('.')[0];
			/* miningMachine = message.params.login.split('.')[1]; */
			_this.workerPass = message.params.pass;
			_this.workerAgent = message.params.agent;
		}else{
			_this.socket.end();
            _this.socket.destroy();
            return;
        }

		 options.authorizeFn(_this.remoteAddress, _this.socket.localPort, _this.workerName, _this.workerPass, function(result) {
            _this.authorized = (!result.error && result.authorized);
            
            if (replyToSocket) {
                if(message.method === 'login'){
                    if(!_this.authorized){
                        sendJson({
                            id:message.id,
                            jsonrpc:"2.0",
                            error:{
                                code:-1,
                                message:"Unauthenticated"
                            }
                        })
                    }  
                }else {
                    _this.socket.end();
                    _this.socket.destroy();
                    return
                }          
            }

            // If the authorizer wants us to close the socket lets do it.
            if (result.disconnect === true) {
                  _this.socket.end();
                  _this.socket.destroy();
                  return
            }
        });
    }

    function sendJson(){
        var response = '';
        for (var i = 0; i < arguments.length; i++){
            response += JSON.stringify(arguments[i]) + '\n';
        }
        _this.socket.write(response);
    }

    function setupSocket(){
        var dataBuffer = '';
        _this.socket.setEncoding('utf8');

        if (options.tcpProxyProtocol === true) {
            socket.once('data', function (d) {
                if (d.indexOf('PROXY') === 0) {
                    _this.remoteAddress = d.split(' ')[2];
                }
                else{
                    _this.emit('tcpProxyError', d);
                }
                _this.emit('checkBan');
            });
        }
        else{
            _this.emit('checkBan');
        }
        _this.socket.on('data', function(d){
            dataBuffer += d;
            if (Buffer.byteLength(dataBuffer, 'utf8') > 10240){ //10KB
                dataBuffer = '';
                _this.emit('socketFlooded');
				_this.emit('triggerBan', 'BLACKCALC like,bye');
                _this.socket.end();
                _this.socket.destroy();
                return;
            }
            if (dataBuffer.indexOf('\n') !== -1){
                var messages = dataBuffer.split('\n');
                var incomplete = dataBuffer.slice(-1) === '\n' ? '' : messages.pop();
                messages.forEach(function(message){
                    if (message === '') return;
                    var messageJson;
                    try {
                        messageJson = JSON.parse(message);
                    } catch(e) {
                        if (options.tcpProxyProtocol !== true || d.indexOf('PROXY') !== 0){
                            _this.emit('malformedMessage', message);
                            _this.socket.end();
                            _this.socket.destroy();
                        }
                        return;
                    }

                    if (messageJson) {
                        handleMessage(messageJson);
                    }
                });
                dataBuffer = incomplete;
            }
        });
        _this.socket.on('close', function() {
            _this.emit('socketDisconnect');
        });
        _this.socket.on('error', function(err){
            if (err.code !== 'ECONNRESET')
                _this.emit('socketError', err);
        });
    }


    this.getLabel = function(){
        return (_this.workerName || '(unauthorized)') + ' [' + _this.remoteAddress + ']';
    };

    this.enqueueNextDifficulty = function(requestedNewDifficulty) {
        pendingDifficulty = requestedNewDifficulty;
        return true;
    };

    //public members

    /**
     * IF the given difficulty is valid and new it'll send it to the client.
     * returns boolean
     **/
    this.sendDifficulty = function(difficulty){
        	
	//	difficulty = 4294967296;
	//	difficulty = _this.middleDifficulty+1;
		if (difficulty === _this.difficulty)
            return false;
	
		if (difficulty < _this.minDifficulty){
            console.log("difficulty too low!"); 
		    return false;
		}
		if(difficulty > _this.maxDifficulty){
			console.log("difficulty too high!");
			return false;
		}

		_this.previousDifficulty = _this.difficulty;
        _this.difficulty = difficulty;
		
		if(difficulty <= _this.middleDifficulty){
			var buff = new Buffer(4).fill(0);
			buff.writeUInt32LE(parseInt(_this.middleDifficulty/difficulty), 0);
			_this.target = buff.toString('hex');
        }else{
			var buff = new Buffer(8).fill(0);
			buff.writeUIntLE('0x' + parseInt(_this.maxDifficulty/difficulty).toString(16), 0, 8);
			_this.target = buff.toString('hex');
		}    
		

      return true;
    };

	this.sendMiningJob = function(jobParams){

        var lastActivityAgo = Date.now() - _this.lastActivity;
        if (lastActivityAgo > options.connectionTimeout * 1000){
            _this.emit('socketTimeout', 'last submitted a share was ' + (lastActivityAgo / 1000 | 0) + ' seconds ago');
            _this.socket.end();
            _this.socket.destroy();
            return;
        }

        if (pendingDifficulty !== null){
            var result = _this.sendDifficulty(pendingDifficulty);
            pendingDifficulty = null;
            if (result) {
                _this.emit('difficultyChanged', _this.difficulty);
            }
        }
		
		console.log("send job, " +  _this.method);
	    
		if(_this.method === 'stratum'){
            _this.socket.end();
            _this.socket.destroy();
            return;
		}else if(_this.method === 'login'){
			var header = new Buffer(140).fill(0);
       	    header.write(jobParams[1], 0, 108, 'hex');
            header.write(_this.extraNonce1, 112, 28, 'hex');
        
            sendJson({  
               id      : 1,
               jsonrpc : _this.jsonrpc,
               error   : null,
               result  : { id : "2018", job : {job_id: jobParams[0], blob: header.toString('hex'), target: _this.target}, status : "OK" }
            });
		}
    };

    this.manuallyAuthClient = function (username, password) {
        handleAuthorize({id: 1, params: [username, password]}, false /*do not reply to miner*/);
    };

    this.manuallySetValues = function (otherClient) {
        _this.extraNonce1        = otherClient.extraNonce1;
        _this.previousDifficulty = otherClient.previousDifficulty;
        _this.difficulty         = otherClient.difficulty;
    };
};
StratumClient.prototype.__proto__ = events.EventEmitter.prototype;




/**
 * The actual stratum server.
 * It emits the following Events:
 *   - 'client.connected'(StratumClientInstance) - when a new miner connects
 *   - 'client.disconnected'(StratumClientInstance) - when a miner disconnects. Be aware that the socket cannot be used anymore.
 *   - 'started' - when the server is up and running
 **/
var StratumServer = exports.Server = function StratumServer(options, authorizeFn){

    //private members

    //ports, connectionTimeout, jobRebroadcastTimeout, banning, haproxy, authorizeFn

    var bannedMS = options.banning ? options.banning.time * 1000 : null;

    var _this = this;
    var stratumClients = {};
    var subscriptionCounter = SubscriptionCounter();
    var rebroadcastTimeout;
    var bannedIPs = {};
    this.moniter = '';
    this.moniterDataVer;

    function checkBan(client){
        if (options.banning && options.banning.enabled && client.remoteAddress in bannedIPs){
            var bannedTime = bannedIPs[client.remoteAddress];
            var bannedTimeAgo = Date.now() - bannedTime;
            var timeLeft = bannedMS - bannedTimeAgo;
            if (timeLeft > 0){
                client.socket.destroy();
                client.emit('kickedBannedIP', timeLeft / 1000 | 0);
            }
            else {
                delete bannedIPs[client.remoteAddress];
                client.emit('forgaveBannedIP');
            }
        }
    }

    this.handleNewClient = function (socket){

        socket.setKeepAlive(true);
        var subscriptionId = subscriptionCounter.next();
        var client = new StratumClient(
            {
                subscriptionId: subscriptionId,
                authorizeFn: authorizeFn,
                socket: socket,
                banning: options.banning,
                connectionTimeout: options.connectionTimeout,
                tcpProxyProtocol: options.tcpProxyProtocol
            }
        );

        stratumClients[subscriptionId] = client;
        _this.emit('client.connected', client);
        client.on('socketDisconnect', function() {
            _this.removeStratumClientBySubId(subscriptionId);
            _this.emit('client.disconnected', client);
        }).on('checkBan', function(){
            checkBan(client);
        }).on('triggerBan', function(){
            _this.addBannedIP(client.remoteAddress);
        }).init();
        return subscriptionId;
    };
	this.addMoniter = function(address){
        _this.moniter = address;
    }
    this.removeMoniter = function(){
        _this.moniter = "";
    }
    this.getConnections = function(queryAddress){
        var moniterConnection = connection;
        var connections = 0;
        for (var i in stratumClients){
        		if(stratumClients[i].workerName && stratumClients[i].workerName == queryAddress){
            		connections++;
        		}
        }
        fs.writeFileSync('./logs/tcptemp.log',connections+'\n',{flag:'a'})
    }
    this.broadcastMiningJobs = function(jobParams){
        for (var clientId in stratumClients) {
            var client = stratumClients[clientId];
            client.sendMiningJob(jobParams);
        }
        /* Some miners will consider the pool dead if it doesn't receive a job for around a minute.
           So every time we broadcast jobs, set a timeout to rebroadcast in X seconds unless cleared. */
        clearTimeout(rebroadcastTimeout);
        rebroadcastTimeout = setTimeout(function(){
            _this.emit('broadcastTimeout');
        }, options.jobRebroadcastTimeout * 1000);
    };



    (function init(){

        //Interval to look through bannedIPs for old bans and remove them in order to prevent a memory leak
        if (options.banning && options.banning.enabled){
            setInterval(function(){
                for (ip in bannedIPs){
                    var banTime = bannedIPs[ip];
                    if (Date.now() - banTime > options.banning.time)
                        delete bannedIPs[ip];
                }
            }, 1000 * options.banning.purgeInterval);
        }

        var serversStarted = 0;
        Object.keys(options.ports).forEach(function(port){
            net.createServer({allowHalfOpen: false}, function(socket) {
                _this.handleNewClient(socket);
            }).listen(parseInt(port), function() {
                serversStarted++;
                if (serversStarted == Object.keys(options.ports).length)
                    _this.emit('started');
            });
        });
    })();


    //public members

    this.addBannedIP = function(ipAddress){
        bannedIPs[ipAddress] = Date.now();
        /*for (var c in stratumClients){
            var client = stratumClients[c];
            if (client.remoteAddress === ipAddress){
                _this.emit('bootedBannedWorker');
            }
        }*/
    };

    this.getStratumClients = function () {
        return stratumClients;
    };

    this.removeStratumClientBySubId = function (subscriptionId) {
        delete stratumClients[subscriptionId];
    };

    this.manuallyAddStratumClient = function(clientObj) {
        var subId = _this.handleNewClient(clientObj.socket);
        if (subId != null) { // not banned!
            stratumClients[subId].manuallyAuthClient(clientObj.workerName, clientObj.workerPass);
            stratumClients[subId].manuallySetValues(clientObj);
        }
    };

};
StratumServer.prototype.__proto__ = events.EventEmitter.prototype;
