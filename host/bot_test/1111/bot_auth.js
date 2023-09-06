process.env["NTBA_FIX_350"] = 1;
const WebSocket = require('ws');
const fs = require('fs');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const { setServers } = require('dns');
const mysql = require('mysql');
//const { Builder, By, until } = require('selenium-webdriver');
//const chrome = require('selenium-webdriver/chrome');


const token = '6518325326:AAHQwh3WjVp-W4jWOPiFUeAprsn4OwcyPRM';
const bot = new TelegramBot(token, { polling: true });

const userConnections = {};

let isCallbackQueryListened = false

function connectWebSocket(chatId) {
  if (userConnections[chatId] && userConnections[chatId].readyState === WebSocket.OPEN) {
    console.log('Соединение уже установлено для пользователя с chatId:', chatId);
    return;
  }

  const socket = new WebSocket('wss://www.soketwss.ru:3030/');
  const receivedIds = [];
  let eventData;

  const onMessageFromUser = (user) => {
    let timeout = false
    return function (event) {
      if (user !== chatId || timeout) {
        return
      }

      timeout = true

      setTimeout(() => timeout = false, 1000)

      const data = JSON.parse(event.data);
      eventData = JSON.parse(event.data);



      if (data.chatId && data.chatId !== chatId) {
        return
      }

      const forbiddenTickers = [];
      if (forbiddenTickers.includes(data.ticker)) {
        return;
      }

      if (receivedIds.includes(data.id)) {
        return;
      }

      receivedIds.push(data.id);

      const time = new Date(data.time).toLocaleTimeString();
      const date = new Date(data.time).toLocaleDateString();

      let updown;
      if (data.percent_change > 0) {
        updown = '🔼';
      } else if (data.percent_change < 0) {
        updown = '🔽';
      }

      let redgeen;
      if (data.percent_change > 0) {
        redgeen = '🟢';
      } else if (data.percent_change < 0) {
        redgeen = '🔴';
      }

      // const isin = data.isin;
      // const imageUrl = 'https://invest-brands.cdn-tinkoff.ru/ISINx160.png';
      // const updatedImageUrl = imageUrl.replace('ISIN', isin);

      const figi = data.figi;
      const imageUrl = 'https://raw.githubusercontent.com/Mixolap/bondana_images/main/stocks/FIGI.png';
      const updatedImageUrl = imageUrl.replace('FIGI', figi);

      const ticker = data.ticker || data.eventId;

      //console.log(data)
      const tickerLink = 'https://www.tinkoff.ru/invest/stocks/TICKER';
      const updatedTickerLink = tickerLink.replace('TICKER', ticker);

      axios.get(updatedImageUrl)
        .then(response => {
          const settings = readSettings();

          const userPercentage = parseFloat(settings[chatId]) || 0

          //console.log('С фото:', userPercentage, Math.abs(parseFloat(data.percent_change)), ticker, chatId)

          if (userPercentage && userPercentage >= Math.abs(parseFloat(data.percent_change))) {
            return
          }
          if (!data.percent_change) {
            return
          }

          if (response.status === 200) {
            const formattedBids = Number(data.totalBids).toLocaleString('ru-RU');
            const formattedAsks = Number(data.totalAsks).toLocaleString('ru-RU');
            const formatlastPrice = Number(data.price - data.price_change).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 7 });

            if (formatlastPrice) {



              const formatMessage = `${redgeen}$${data.ticker}\xa0\n${data.Name}\n\nЦена: ${Number(data.price).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 7 })} руб. \nПред: ${formatlastPrice} руб.\n\n${updown}Изменение: ${data.percent_change}﹪ \n✔${data.deviation_direction} ${Number(data.price_change).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 7 })} руб.\n\nДанные Тинькофф:\nBids: ${data.BidPercentage}\xa0➛\xa0${formattedBids} руб.\nAsks: ${data.AskPercentage}\xa0➛\xa0${formattedAsks} руб.\nBidsQ: ${data.BidPercentageQuantity}\xa0➛\xa0${data.TotalBidQuantity} шт.\nAsksQ: ${data.AskPercentageQuantity}\xa0➛\xa0${data.TotalAskQuantity} шт.\n-----------------------------------\nДанные Алор:\nBids: ${Number(data.bidsTotalAmount).toLocaleString('ru-RU')} руб.\nAsks: ${Number(data.asksTotalAmount).toLocaleString('ru-RU')} руб.\nBidsQ: ${data.bidsTotalVolume} шт.\nAsksQ: ${data.asksTotalVolume} шт.\n\nВремя: ${time}\xa0\xa0\xa0Дата: ${date}`;

              const keyboard = {
                inline_keyboard: [
                  [
                    {
                      text: '🟡',
                      callback_data: `yellow_${ticker}`,
                    },
                    {
                      text: '🔴',
                      callback_data: `red_${ticker}`,
                    },
                    {
                      text: '🟣',
                      callback_data: `purple_${ticker}`,
                    },
                    {
                      text: '🔵',
                      callback_data: `blue_${ticker}`,
                    },
                    {
                      text: '🟢',
                      callback_data: `green_${ticker}`,
                    },
                  ],
                  [
                    {
                      text: `Открыть ${ticker} в Инвестициях`,
                      url: updatedTickerLink,
                    },
                  ],
                ],
              };

              bot.sendPhoto(chatId, updatedImageUrl, { caption: formatMessage, reply_markup: keyboard });
            }
          } else {
            const formattedBids = Number(data.totalBids).toLocaleString('ru-RU');
            const formattedAsks = Number(data.totalAsks).toLocaleString('ru-RU');
            const formatlastPrice = Number(data.price - data.price_change).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 7 });
            console.log(formatlastPrice)
            const formatMessage = `${redgeen}$${data.ticker}\xa0\n${data.Name}\n\nЦена: ${Number(data.price).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 7 })} руб. \nПред: ${formatlastPrice} руб.\n\n${updown}Изменение: ${data.percent_change}﹪ \n✔${data.deviation_direction} ${Number(data.price_change).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 7 })} руб.\n\nДанные Тинькофф:\nBids: ${data.BidPercentage}\xa0➛\xa0${formattedBids} руб.\nAsks: ${data.AskPercentage}\xa0➛\xa0${formattedAsks} руб.\nBidsQ: ${data.BidPercentageQuantity}\xa0➛\xa0${data.TotalBidQuantity} шт.\nAsksQ: ${data.AskPercentageQuantity}\xa0➛\xa0${data.TotalAskQuantity} шт.\n-----------------------------------\nДанные Алор:\nBids: ${Number(data.bidsTotalAmount).toLocaleString('ru-RU')} руб.\nAsks: ${Number(data.asksTotalAmount).toLocaleString('ru-RU')} руб.\nBidsQ: ${data.bidsTotalVolume} шт.\nAsksQ: ${data.asksTotalVolume} шт.\n\nВремя: ${time}\xa0\xa0\xa0Дата: ${date}`;

            const keyboard = {
              inline_keyboard: [
                [
                  {
                    text: '🟡',
                    callback_data: `yellow_${ticker}`,
                  },
                  {
                    text: '🔴',
                    callback_data: `red_${ticker}`,
                  },
                  {
                    text: '🟣',
                    callback_data: `purple_${ticker}`,
                  },
                  {
                    text: '🔵',
                    callback_data: `blue_${ticker}`,
                  },
                  {
                    text: '🟢',
                    callback_data: `green_${ticker}`,
                  },
                ],
                [
                  {
                    text: `Открыть ${ticker} в Инвестициях`,
                    url: updatedTickerLink,
                  },
                ],
              ],
            };

            bot.sendMessage(chatId, formatMessage, { parse_mode: 'HTML', reply_markup: keyboard });
          }
        })
        .catch(error => {
          const settings = readSettings();
          const userPercentage = parseFloat(settings[chatId]) || 0;

          //console.log('Без фото:', userPercentage, Math.abs(parseFloat(data.percent_change || 0)), ticker, chatId);

          if (userPercentage && userPercentage >= Math.abs(parseFloat(data.percent_change))) {
            return;
          }
          //продублировать
          if (!data.percent_change) {
            return
          }

          const formattedBids = Number(data.totalBids).toLocaleString('ru-RU');
          const formattedAsks = Number(data.totalAsks).toLocaleString('ru-RU');
          const formatlastPrice = Number(data.price - data.price_change).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 7 });

          const formatMessage = `${redgeen}$${data.ticker}\xa0\n${data.Name}\n\nЦена: ${Number(data.price).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 7 })} руб. \nПред: ${formatlastPrice} руб.\n\n${updown}Изменение: ${data.percent_change}﹪ \n✔${data.deviation_direction} ${Number(data.price_change).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 7 })} руб.\n\nДанные Тинькофф:\nBids: ${data.BidPercentage}\xa0➛\xa0${formattedBids} руб.\nAsks: ${data.AskPercentage}\xa0➛\xa0${formattedAsks} руб.\nBidsQ: ${data.BidPercentageQuantity}\xa0➛\xa0${data.TotalBidQuantity} шт.\nAsksQ: ${data.AskPercentageQuantity}\xa0➛\xa0${data.TotalAskQuantity} шт.\n-----------------------------------\nДанные Алор:\nBids: ${Number(data.bidsTotalAmount).toLocaleString('ru-RU')} руб.\nAsks: ${Number(data.asksTotalAmount).toLocaleString('ru-RU')} руб.\nBidsQ: ${data.bidsTotalVolume} шт.\nAsksQ: ${data.asksTotalVolume} шт.\n\nВремя: ${time}\xa0\xa0\xa0Дата: ${date}`;

          const keyboard = {
            inline_keyboard: [
              [
                {
                  text: '🟡',
                  callback_data: `yellow_${ticker}`,
                },
                {
                  text: '🔴',
                  callback_data: `red_${ticker}`,
                },
                {
                  text: '🟣',
                  callback_data: `purple_${ticker}`,
                },
                {
                  text: '🔵',
                  callback_data: `blue_${ticker}`,
                },
                {
                  text: '🟢',
                  callback_data: `green_${ticker}`,
                },
              ],
              [
                {
                  text: `Открыть ${ticker} в Инвестициях`,
                  url: updatedTickerLink,
                },
              ],
            ],
          };

          bot.sendMessage(chatId, formatMessage, { parse_mode: 'HTML', reply_markup: keyboard });
        });
    };
  }

  const colorRGBValues = {
    yellow: 'rgb(163, 129, 255)', // 3
    red: 'rgb(77, 161, 151)', // 6
    purple: 'rgb(248, 163, 77)', // 8
    blue: 'rgb(238, 128, 93)', //10 
    green: 'rgb(115, 176, 119)', // 16
  };

  const callbackQueryListener = async function (callbackQuery) {
    const callbackData = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id;

    if (callbackData && (callbackData.startsWith('yellow_') || callbackData.startsWith('red_') || callbackData.startsWith('purple_') || callbackData.startsWith('blue_') || callbackData.startsWith('green_'))) {
      const color = callbackData.split('_')[0].toLowerCase();
      const ticker = callbackData.split('_')[1];
      const eventId = ticker;

      // Получить значение RGB из объекта colorRGBValues
      const rgbValue = colorRGBValues[color];

      bot.answerCallbackQuery(callbackQuery.id, { text: `Тикер ${ticker} открыт в терминале 🎯`, show_alert: false });

      await waitForSocketReady(socket);

      if (socket && socket.readyState === WebSocket.OPEN) {
        console.log('Отправляем WebSocket сообщение на сервер:', eventId, chatId, rgbValue);
        socket.send(JSON.stringify({ eventId, chatId, color: rgbValue }));
      } else {
        console.log('Соединение WebSocket не готово или установлено.');
      }
    }
  };
  async function waitForSocketReady(socket) {
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
  }


  socket.addEventListener('message', onMessageFromUser(chatId));
  if (!isCallbackQueryListened) {
    bot.on('callback_query', callbackQueryListener);

    isCallbackQueryListened = true
  }
 

  socket.onopen = function () {
    userConnections[chatId] = socket;
    console.log('Соединение WebSocket установлено для пользователя с chatId:', chatId);
  };

  socket.onclose = function (event) {
    if (userConnections[chatId] === socket) {
      userConnections[chatId] = null; // Удаляем соединение при закрытии

      bot.off('callback_query', callbackQueryListener);
    }
    console.log('Соединение закрыто для пользователя с chatId:', chatId, event);
  };

  socket.onerror = function (error) {
    console.error('Произошла ошибка для пользователя с chatId:', chatId, error);
  };
}

// bot.onText(/\/stop/, (msg) => {
//   const chatId = msg.chat.id;
//   stopWebSocket(chatId);
// });

// function stopWebSocket(chatId) {
//   if (userConnections[chatId]) {
//     if (userConnections[chatId].readyState === WebSocket.OPEN) {
//       userConnections[chatId].onclose = function () { };
//       userConnections[chatId].close();
//       console.log('Соединение WebSocket закрыто для пользователя с chatId:', chatId);
//     } else {
//       console.log('Соединение WebSocket уже закрыто или не установлено для пользователя с chatId:', chatId);
//     }
//     delete userConnections[chatId];
//   } else {
//     console.log('Соединение WebSocket не установлено для пользователя с chatId:', chatId);
//   }
// }

process.on('SIGINT', function () {
  for (const chatId in userConnections) {
    if (userConnections[chatId] && userConnections[chatId].readyState === WebSocket.OPEN) {
      userConnections[chatId].close();
    }
  }
  process.exit();
});

const connection = mysql.createConnection({
  host: 'localhost', // адрес базы данных
  user: 'junior',
  password: 'junior@7',
  database: 'users_bot'
});

connection.connect((err) => {
  if (err) {
    console.error('Ошибка подключения к базе данных:', err);
  } else {
    console.log('Подключено к базе данных MySQL');
  }
});

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  //stopWebSocket(chatId);

  connection.query('SELECT * FROM users WHERE chatId = ?', [chatId], (error, results) => {
    if (error) {
      console.error('Ошибка при запросе к базе данных:', error);
      return;
    }

    if (results.length === 0) {
      bot.sendMessage(chatId, 'Ваш ChatId не найден в базе данных. Пожалуйста, обратитесь к администратору');
      return;
    }

    const user = results[0];
    const startDate = new Date(user.date);
    const expirationDate = new Date(user.expiration);
    const price = user.price;
    const payment = user.payment;

    const currentDate = new Date();

    if (currentDate < startDate) {
      bot.sendMessage(chatId, 'Ваш доступ ещё не начался. Подождите начала подписки.');
      return;
    }

    if (currentDate > expirationDate) {
      bot.sendMessage(chatId, `Упс...😕 Кажется истек срок подписки... \n\nНапоминаем, стоимость ежемесячной подписки составляет ${price} руб.\n\n Для связи 👉 @Kivvvi_Trading`);
      return;
    }

    if (price > payment) {
      bot.sendMessage(chatId, `Стоимость подписки оплачена не полностью. \n\nНапоминаем, стоимость ежемесячной подписки составляет ${price} руб.\n\n Для связи 👉 @Kivvvi_Trading`);
      return;
    }

    bot.sendMessage(chatId, 'Приветствую, тут резкие отклонения и объемы. Если устраивает - тогда погнали👌\n\n Чуть не забыл, через меню можно установить процент отклонения, учитывается именно %, знаки "+"или "-" не работают. Удачной торговли!');
    if (!userConnections[chatId]) {
      connectWebSocket(chatId);
    }
  });
});

let waitingForPercent = false;
let userPercent = 0;

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const messageText = msg.text;

  if (messageText.startsWith('/percent')) {
    waitingForPercent = true;
    bot.sendMessage(
      chatId,
      'Введите процент отклонения в формате: "1.5"(пример)\nЧерез точку или запятую, если это не целое число'
    );
    return;
  }

  if (waitingForPercent) {
    let percentInput = messageText.replace(',', '.');
    const percent = parseFloat(percentInput);

    if (isNaN(percent)) {
      bot.sendMessage(chatId, 'Некорректный формат процента. Пожалуйста, введите число.');
      return;
    }

    userPercent = percent;
    waitingForPercent = false;
    bot.sendMessage(chatId, `Установлен процент отклонения: ${userPercent}%`);

    const settings = readSettings();
    settings[chatId] = userPercent || 0;

    writeSettings(settings);
  }
});

// УБРАТЬ FS!!!!!!!!!!!!!!!!!!!!!!!!!
function readSettings() {
  try {
    const data = fs.readFileSync('settings.json');
    return JSON.parse(data);
  } catch (err) {
    return {};
  }
}

// УБРАТЬ FS!!!!!!!!!!!!!!!!!!!!!!!!!

function writeSettings(settings) {
  fs.writeFileSync('settings.json', JSON.stringify(settings, null, 2));
}

async function indexMoex() {
  const moexUrl = 'https://iss.moex.com/iss/engines/stock/markets/index/boards/SNDX/securities/imoex2.json'; // Резервный адрес https://iss.moex.com/iss/engines/stock/markets/index/boards/SNDX/securities/IMOEX/IMOEX.json

  try {
    const response = await fetch(moexUrl);
    const jsonData = await response.json();

    // Обработка данных
    const securitiesData = jsonData.securities.data[0];
    const marketData = jsonData.marketdata.data[0];

    const securityName = securitiesData[2];
    const lastValue = marketData[2];
    const currentValue = marketData[4];
    const high = marketData[22];
    const low = marketData[23];

    // Вывод данных
    // console.log('Название индекса:', securityName);
    // console.log('Последнее значение:', lastValue);
    // console.log('Текущее значение:', currentValue);
    // console.log('Наивысшее значение за день:', high);
    // console.log('Наименьшее значение за день:', low);

    return jsonData;
  } catch (error) {
    console.error('Ошибка при получении данных:', error);
    return null;
  }
}

bot.onText(/\/indexmoex/, async (msg) => {
  const chatId = msg.chat.id;
  const imageUrlmoex = 'moex.png';
  try {
    const jsonData = await indexMoex();
    if (jsonData) {
      indexmsg = `${jsonData.securities.data[0][2]}:\n\nПоследнее значение:  ${jsonData.marketdata.data[0][2]}\nТекущее значение:${jsonData.marketdata.data[0][4]}\n\nНаивысшее за день: ${jsonData.marketdata.data[0][22]}\nНаименьшее  за день: ${jsonData.marketdata.data[0][23]}`;

      //bot.sendMessage(chatId, indexmsg);
      bot.sendPhoto(chatId, imageUrlmoex, { caption: indexmsg });
    } else {
      bot.sendMessage(chatId, 'Ошибка при получении данных, что-то на сайте Мосбиржи...😟');
    }
  } catch (error) {
    console.error('Ошибка при получении данных:', error);
    bot.sendMessage(chatId, 'Ошибка при получении данных');
  }
});


bot.onText(/\/chatid/, (msg, match) => {
  const chatId = msg.chat.id;
  const response = `Ваш chat ID: ${chatId}`;
  bot.sendMessage(chatId, response);
});

const Redis = require('ioredis');

function formatNumber(value) {
  if (typeof value === 'number') {
    if (value >= 1000000) {
      return (value / 1000000).toFixed(2) + 'M';
    } else if (value >= 1000) {
      return (value / 1000).toFixed(2) + 'K';
    } else {
      return value.toFixed(2);
    }
  } else if (typeof value === 'string') {
    const numericValue = parseFloat(value.replace(/[^0-9.-]/g, ''));
    if (!isNaN(numericValue)) {
      if (numericValue >= 1000000) {
        return (numericValue / 1000000).toFixed(2) + 'M';
      } else if (numericValue >= 1000) {
        return (numericValue / 1000).toFixed(2) + 'K';
      } else {
        return numericValue.toFixed(2);
      }
    }
  }
  return "Invalid number";
}

function formatDataForDisplay(data) {
  const fieldTranslations = {
    'Name': 'Название',
    'ticker': 'Тикер',
    'Total Bids': 'Сумма покупок:',
    'Total Asks': 'Сумма продаж:',
    'Bid Percentage': 'Процент на покупку',
    'Ask Percentage': 'Процент на продажу',
    'Total Bid Quantity': 'Заявок на покупку',
    'Total Ask Quantity': 'Заявок на продажу',
    'Bid Percentage Quantity': 'Процент количество на покупку',
    'Ask Percentage Quantity': 'Процент количество на продажу'
  };

  let formattedMessage = '';
  for (const key in fieldTranslations) {
    if (data[key] !== undefined) {
      const formattedBids = formatNumber(data['Total Bids']);
      const formattedAsks = formatNumber(data['Total Asks']);

      formattedMessage = `${data.ticker}\n${data.Name}\nПокупают: ${formattedBids} --- ${data['Bid Percentage']}\nПродают:   ${formattedAsks} --- ${data['Ask Percentage']}\nПокупают: ${data['Total Bid Quantity']} --- ${data['Bid Percentage Quantity']}\nПродают:   ${data['Total Ask Quantity']} --- ${data['Ask Percentage Quantity']}\n`;
    }
  }
  return formattedMessage;
}


const puppeteer = require('puppeteer');

function handleVolumeCommand(msg) {
  const chatId = msg.chat.id;
  const redis = new Redis({ db: 15 });

  const requestMessage = "✍️Введите тикер";
  bot.sendMessage(chatId, requestMessage);

  const responseHandler = (responseMsg) => {
    if (responseMsg.chat.id === chatId) {
      const tickerToSearch = responseMsg.text.trim().toUpperCase();

      async function searchAndFormatDataByTicker(ticker) {
        try {
          const keys = await redis.keys('*');
          const foundData = [];

          for (const key of keys) {
            const field = await redis.hget(key, 'ticker');
            if (field === ticker) {
              const allData = await redis.hgetall(key);
              foundData.push(allData);
            }
          }

          return foundData;
        } catch (error) {
          console.error('Произошла ошибка:', error);
        } finally {
          redis.quit();
        }
      }

      async function graphTicker(stockCode) {
        const browser = await puppeteer.launch({args: ['--no-sandbox']});

	      const page = await browser.newPage();
      
        try {
          const url = `https://financemarker.ru/stocks/MOEX/${stockCode}/`;
      
          await page.goto(url);
      
          await new Promise(resolve => setTimeout(resolve, 550));
      
          const chartSelectors = '.col-lg-8';
          await page.waitForSelector(chartSelectors);
      
          const chartElements = await page.$$(chartSelectors);
      
          if (chartElements.length >= 3) {
            const fourthChartElement = chartElements[2];
      
            await page.evaluate(() => {
              const creditsText = document.querySelector('.highcharts-credits');
              if (creditsText) {
                creditsText.style.display = 'none';
              }
            });
      
            const screenshot = await fourthChartElement.screenshot();
            fs.writeFileSync(`chart_screenshot_${chatId}.png`, screenshot);
          } else {
            console.log("Не удалось найти четвертый элемент.");
          }
        } finally {
          await page.close();
        }
      }
      

      searchAndFormatDataByTicker(tickerToSearch)
        .then(async (foundData) => {
          if (foundData.length > 0) {
            let responseMessage = '';
            for (const data of foundData) {
              responseMessage += formatDataForDisplay(data) + '\n\n';
            }

           // await graphTicker(tickerToSearch);
            bot.sendMessage(chatId, responseMessage);
          } else {
            bot.sendMessage(chatId, 'Данные для тикера ' + tickerToSearch + ' не найдены.');
          }
        })
        .catch((error) => {
          bot.sendMessage(chatId, 'Произошла ошибка при поиске данных.');
          console.error('Произошла ошибка:', error);
        });

      bot.removeListener('text', responseHandler);
    }
  };

  bot.on('text', responseHandler);
}

bot.onText(/\/volume/, handleVolumeCommand);

bot.on('polling_error', (error) => {
  console.log(error);
});

console.log('Бот в деле!');
