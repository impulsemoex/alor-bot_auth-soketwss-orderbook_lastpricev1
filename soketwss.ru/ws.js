const express = require('express');
const mysql = require('mysql');
const ws = require('ws');
const Redis = require('ioredis');
const fs = require('fs');
const https = require('https');

const app = express();


const port = 3030;

const connection = mysql.createConnection({
  host: 'localhost',
  port: '3306',
  user: 'junior',
  password: 'junior@7',
  database: 'tinkoff_result',
});

// Redis connection
const redis = new Redis({ db: 15 });
const redisAlor = new Redis({ db: 7 });

connection.connect((error) => {
  if (error) {
    console.error('Error connecting to MySQL Result database:', error);
    return;
  }
  console.log('Connected to the MySQL Result database');
});

connection.on('error', (error) => {
  console.error('Database MySQL Result connection error:', error);
});

const connection2 = mysql.createConnection({
  host: 'localhost',
  port: '3306',
  user: 'junior',
  password: 'junior@7',
  database: 'tinkoff_db',
});

connection2.connect((error) => {
  if (error) {
    console.error('Error connecting to MySQL Maindatabase:', error);
    return;
  }
  console.log('Connected to the MySQL Main database');
});

connection2.on('error', (error) => {
  console.error('MYSQL database MySQL Main connection error:', error);
});

// Загрузка сертификатов Let's Encrypt
const privateKey = fs.readFileSync('privkey.pem','utf8'); 
//const certificate = fs.readFileSync('//cert.pem', 'utf8');
const ca = fs.readFileSync('fullchain.pem', 'utf8');

const credentials = {
  key: privateKey,
 // cert: certificate//,
  cert: ca
};

const wss = new ws.Server({
  noServer: true
});




const connectedClients = [];


wss.on('connection', (ws) => {
  console.log('New WebSocket connection');
  // Добавьте нового клиента в массив connectedClients
  connectedClients.push(ws);

  let lastRecords = [];

  function readHashData(key, callback) {
    redis.hgetall(key, (error, data) => {
      if (error) {
        console.error(error);
        callback(null, null);
      } else {
        //console.log('Data from Redis (Tinkoff):', data);
        callback(data.country, data['Total Bids'], data['Total Asks'], data['Bid Percentage'], data['Ask Percentage'], data['Total Bid Quantity'], data['Total Ask Quantity'], data['Bid Percentage Quantity'], data['Ask Percentage Quantity']);
      }
    });
  }

  let alorData = {}

  function readHashAlor(ticker) {
    const dataHashKey = `${ticker}`;

    // Используем метод hgetall для получения всех полей и значений хэша по ключу
    redisAlor.hgetall(dataHashKey, (error, data) => {
      if (error) {
        console.error(error);
        callback(null, null);
      } else {
        alorData[data.ticker] = data
        //console.log("Data from Redis (Alor):", data);
      }
    });
  }

  function sendUpdatedData() {
    const query = `
      SELECT t.figi, t.id, t.ticker, t.price, t.price_change, t.direction, t.percent_change, t.deviation_direction, t.deviation, t.time, o.Name, o.isin
      FROM tinkoff_result AS t
      JOIN tinkoff_db.moex_impulse AS o ON t.ticker = o.ticker
      ORDER BY t.time DESC
      LIMIT 1`;

    connection.query(query, (error, results) => {
      if (error) {
        console.error('Error executing query:', error);
        return;
      }

      //console.log('Data from SQL:', results);

      const latestRecord = results[0];

      if (latestRecord) {
        const figi = latestRecord.figi;
        const ticker = latestRecord.ticker;
        readHashAlor(ticker);
        readHashData(figi, (country, totalBids, totalAsks, BidPercentage, AskPercentage, TotalBidQuantity, TotalAskQuantity, BidPercentageQuantity, AskPercentageQuantity) => {
          latestRecord.country = country;
          latestRecord.totalBids = totalBids;
          latestRecord.totalAsks = totalAsks;
          latestRecord.BidPercentage = BidPercentage;
          latestRecord.AskPercentage = AskPercentage;
          latestRecord.TotalBidQuantity = TotalBidQuantity;
          latestRecord.TotalAskQuantity = TotalAskQuantity;
          latestRecord.BidPercentageQuantity = BidPercentageQuantity;
          latestRecord.AskPercentageQuantity = AskPercentageQuantity;

          if (alorData[ticker]) {
            for (const key in alorData[ticker]) {
              latestRecord[key] = alorData[ticker][key]
            }
          }

          console.log('Data from SQL and Redis:', latestRecord);

          if (lastRecords.length >= 1) {
            lastRecords.shift();
          }

          lastRecords.push(latestRecord);

          ws.send(JSON.stringify(latestRecord));
        });
      }
    });
  }

  setInterval(sendUpdatedData, 1000);

  ws.on('message', (message) => {
    const bufferData = Buffer.from(message);
    const jsonString = bufferData.toString('utf8');
    const jsonMessage = JSON.parse(jsonString);
    console.log('WebSocket message received:', jsonMessage);

    // const response = {
    //   status: 'success',
    //   message: 'Response message',
    // };
    // Отправка ответного сообщения обратно отправителю
    //ws.send(JSON.stringify(response));

    // Отправка клиентам
    connectedClients.forEach(client => {
      if (client !== ws) {
        client.send(JSON.stringify(jsonMessage));
      }
    });
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
  });
});

const server = https.createServer(credentials, app);

// Запуск сервера


server.listen(port, () => {
  console.log('Сервер запущен и слушает порт', port);
});


app.get('/data', (req, res) => {
  const query = 'SELECT ticker FROM tinkoff_result';
  connection.query(query, (error, results) => {
    if (error) {
      console.error('Error executing query:', error);
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    res.json(results);
  });
});
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

server.on('close', () => {
  connection.end();
  connection2.end();
});


