const axios = require('axios');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const Redis = require("ioredis");

const redisClient = Redis.createClient({ db: 7 });
//redisClient.flushdb()

const token = "6c0a6eb5-6861-4ef1-99b9-913c60e24e9d";
const url = `https://oauth.alor.ru/refresh?token=${token}`;

const tickers = require('./rufigi.json');

axios.post(url)
  .then(response => {
    const AccessToken = response.data.AccessToken;
    console.log(tickers);
    // Функция для подсчета общей суммы и количества
    function calculateTotalAndQuantity(data, lot) {
      let totalVolume = 0;
      let totalAmount = 0;

      // Проходимся по каждой записи bids или asks
      data.forEach(entry => {
        const { price, volume } = entry;
        totalVolume += volume * lot; 
        totalAmount += price * volume * lot;
      });

      return { totalVolume, totalAmount };
    }

    function printToLog(ticker, name, lot, bidsTotalVolume, bidsTotalAmount, asksTotalVolume, asksTotalAmount) {
      const dataHashKey = `${ticker}`; 
      const data = {
        ticker,
        name,
        lot,
        bidsTotalVolume: Math.round(bidsTotalVolume),
        bidsTotalAmount: Math.round(bidsTotalAmount),
        asksTotalVolume: Math.round(asksTotalVolume),
        asksTotalAmount: Math.round(asksTotalAmount),
      };
      redisClient.hmset(dataHashKey, data, (error, result) => {
      });

      // console.log(`Тикер: ${ticker}`);
      // console.log('----------------------------------------');
    }

    function createWebSocketConnection(subscription) {
      const ws = new WebSocket('wss://api.alor.ru/ws');

      ws.on('open', () => {
        ws.send(JSON.stringify(subscription));
      });

      ws.on('message', (data) => {
        const orderBookData = JSON.parse(data);
        if (orderBookData.data) {
          const { bids, asks, ms_timestamp } = orderBookData.data;
      
          const bidsSummary = calculateTotalAndQuantity(bids, subscription.lot);
          const asksSummary = calculateTotalAndQuantity(asks, subscription.lot);
      
          const roundedBidsVolume = bidsSummary.totalVolume ? Math.round(parseFloat(bidsSummary.totalVolume)) : 0;
          const roundedBidsAmount = bidsSummary.totalAmount ? Math.round(parseFloat(bidsSummary.totalAmount)) : 0;
          const roundedAsksVolume = asksSummary.totalVolume ? Math.round(parseFloat(asksSummary.totalVolume)) : 0;
          const roundedAsksAmount = asksSummary.totalAmount ? Math.round(parseFloat(asksSummary.totalAmount)) : 0;
      
          printToLog(
            subscription.code,
            subscription.Name,
            subscription.lot,
            roundedBidsVolume,
            roundedBidsAmount,
            roundedAsksVolume,
            roundedAsksAmount
          );
        }
      });      

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });

      ws.on('close', () => {
        console.log('WebSocket connection closed');
      });
    }

    const orderBookSubscriptions = tickers.map((tickerData) => ({
      opcode: 'OrderBookGetAndSubscribe',
      code: tickerData.ticker,
      exchange: 'MOEX',
      depth: 50,
      format: 'Simple',
      guid: uuidv4(),
      token: AccessToken,
      lot: tickerData.lot,
      Name: tickerData.Name,
    }));

    orderBookSubscriptions.forEach((subscription) => {
      createWebSocketConnection(subscription);
    });
  })
  .catch(error => {
    console.error('Error while getting AccessToken:', error);
  });
