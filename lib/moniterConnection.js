var redis = require('redis');
var fs = require('fs');
JSON.minify = JSON.minify || require("node-json-minify");
var configs = JSON.parse(JSON.minify(fs.readFileSync("config.json", {encoding: 'utf8'})));
var connection = redis.createClient(configs.redis.port,configs.redis.host)
if(configs.redis.password){
    connection.auth(configs.redis.password)
}

module.exports=connection;