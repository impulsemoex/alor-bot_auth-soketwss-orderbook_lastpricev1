const HttpsServer = require('https').createServer;
const fs = require("fs");

server = HttpsServer({
    cert: fs.readFileSync("/etc/letsencrypt/live/soketwss.ru/fullchain.pem"),
    key: fs.readFileSync("/etc/letsencrypt/live/soketwss.ru/privkey.pem")
})

const WebSocketServer = require('ws');
const WebSocket = require("ws").Server;


wss = new WebSocket({
    server: server
}); 
wss.on("connection", ws => {
    console.log("new client connected");
    // sending message
    ws.on("message", data => {
        console.log(`Client : ${data}`)
        ws.send(`ok I received "${data}"`)
    });
    // handling what to do when clients disconnects from server
    ws.on("close", () => {
        console.log("the client has connected");
    });
    // handling client connection error
    ws.onerror = function () {
        console.log("Some Error occurred")
    }
});

server.listen(3030);

console.log("The WebSocket server is running on port 8080");
