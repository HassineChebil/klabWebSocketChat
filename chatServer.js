// http://ejohn.org/blog/ecmascript-5-strict-mode-json-and-more/
"use strict";



// Port where we'll run the websocket server
var webSocketsServerPort = 1337;

// websocket and http servers
var webSocketServer = require('websocket').server;
var http = require('http');

/**
 * Global variables
 */
// history will contain the messages before sending them to redis
var history = [];
// list of currently connected clients (users)
var clients = [];

//list of history messages by channel
var channelHistory = [];

//redis config
var redis = require('redis');
var client = redis.createClient();

client.on('connect', function() {
    console.log('connected');
});
client.get('History', function(err, reply) {
    console.log(JSON.parse(reply));
});
//chat history will expire after 24 hours
client.expireat('History', parseInt((+new Date)/1000) + 86400);


// Array with some colors to distinguish users (just for the view)
var colors = ['red', 'green', 'blue', 'magenta', 'purple', 'plum', 'orange'];
// ... in random order
colors.sort(function (a, b) {
    return Math.random() > 0.5;
});

/**
 * HTTP server
 */
var server = http.createServer(function (request, response) {

});
server.listen(webSocketsServerPort, function () {
    console.log((new Date()) + " Server is listening on port " + webSocketsServerPort);
});

/**
 * WebSocket server
 */
var wsServer = new webSocketServer({

    httpServer: server
});

// This callback function is called every time someone
// tries to connect to the WebSocket server
wsServer.on('request', function (request) {
    console.log((new Date()) + ' Connection from origin ' + request.origin + '.');


    var connection = request.accept(null, request.origin);
    // we need to know client index to remove them on 'close' event
    connection.channel = '';
    //adding new user to our clients list
    var index = clients.push(connection) - 1;
    var userName = false;
    var userColor = false;

    console.log((new Date()) + ' Connection accepted.');




    // user sent some message
    connection.on('message', function (message) {
        if (message.type === 'utf8') { // accept only text


            var recived = JSON.parse(message.utf8Data);
            console.log(recived);
            //now if it's a new user or an old user who changed channel or an old user who changed his username(nickname)
            if (userName === false || connection.channel !== recived.data[0].channel|| userName !== recived.data[0].author) { // first message sent by user is their name
                // remember user name
                userName = recived.data[0].author;
                // get random color and send it back to the user
                userColor = colors.shift();
                connection.channel = recived.data[0].channel;

                //we initiate the chat history of each channel
                channelHistory = [];
                //retrieving all the chat history from redis
                client.get('History', function(err, reply) {
                    console.log(JSON.parse(reply));
                    var history = JSON.parse(reply);
                    if(history !== null){
                    for (var i = 0; i < history.length; i++) {
                        //test if the chat history item velongs to the user's actual channel
                        if (history[i].channel == connection.channel) {

                            console.log(history[i]);
                            channelHistory.push(history[i]);
                        }
                    }
                    }
                    //send the channel history chat to the user
                    connection.sendUTF(JSON.stringify({type: 'history', data: channelHistory}));
                });


                console.log((new Date()) + ' User is known as: ' + userName
                    + ' with ' + userColor + ' color.');

            } else { // log and broadcast the message
                console.log((new Date()) + ' Received Message from '
                    + userName + ': ' + message.utf8Data);

                // we want to keep history of all sent messages
                var obj = {
                    time: (new Date()).getTime(),
                    text: recived.data[0].text,
                    author: userName,
                    color: userColor,
                    channel: recived.data[0].channel
                };
                history.push(obj);
                //setting the history chat on redis
                //since redis only accept string values we used stringify JSON function to push all the history chat to redis
                //when retrieving it we just parse the string back to a JSON object
                client.set('History' ,JSON.stringify(history));

                // broadcast message to all connected clients
                var json = JSON.stringify({type: 'message', data: obj});
                for (var i = 0; i < clients.length; i++) {
                    console.log(clients[i].channel);
                    //make sure the message is only sent to the specific user on the same channel as the sender
                    if (clients[i].channel == connection.channel) {
                        clients[i].sendUTF(json);
                    }
                }
            }
        }
    });

    // user disconnected
    connection.on('close', function (connection) {
        if (userName !== false && userColor !== false) {
            console.log((new Date()) + " Peer "
                + connection.remoteAddress + " disconnected.");
            // remove user from the list of connected clients
            clients.splice(index, 1);
            // push back user's color to be reused by another user
            colors.push(userColor);
        }
    });

});
/**
 * Created by hassine on 5/23/2016.
 */
