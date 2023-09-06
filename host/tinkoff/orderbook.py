import os
import sys
import time
import redis
import datetime
from decimal import Decimal, DivisionByZero
import json
import asyncio

sys.path.append('invest-python-main')
from dotenv import load_dotenv
load_dotenv()
from tinkoff.invest import (
    Client,
    MarketDataRequest,
    SubscriptionAction,
    SubscribeOrderBookRequest,
    OrderBookInstrument
)

# Установка соединения с Redis
redis_client = redis.Redis(host='localhost', port=6379, db=15)
# redis_client.delete('')
TOKEN = os.environ.get("TOKEN_TINKOFF")
def request_iterator(usfigi_data):
    instruments = []  # Список для хранения всех инструментов

    for item in usfigi_data:
        figi = item['figi']
        instruments.append((figi, item['lot']))

    num_streams = 1  # Количество параллельных потоков
    chunk_size = len(instruments) // num_streams
    print("Запрошено тикеров на OrderBook:", len(instruments))
    for i in range(num_streams):
        stream_instruments = instruments[i * chunk_size: (i + 1) * chunk_size]
        yield MarketDataRequest(
            subscribe_order_book_request=SubscribeOrderBookRequest(
                subscription_action=SubscriptionAction.SUBSCRIPTION_ACTION_SUBSCRIBE,
                instruments=[
                    OrderBookInstrument(figi=instrument[0], depth=50) for instrument in stream_instruments
                ]
            )
        )

    while True:
        time.sleep(0)

async def main():
    # Загрузка данных из файла
    with open('rufigi.json', encoding='utf-8') as file:
        usfigi_data = json.load(file)

    lot_size = {}  # Словарь для хранения информации о лотности по figi

    # Заполнение словаря информацией
    for item in usfigi_data:
        figi = item['figi']
        isin = item['isin']
        Name = item['Name']
        ticker = item['ticker']
        lot_size[figi] = item['lot']
        currency = item['currency']
        country = item['country']

        # Записываем из Json в Redis
        redis_client.hset(figi, 'Name', item['Name'])
        redis_client.hset(figi, 'ticker', ticker)
        redis_client.hset(figi, 'figi', figi)
        redis_client.hset(figi, 'isin', isin)
        redis_client.hset(figi, 'currency', currency)
        redis_client.hset(figi, 'country', country)
        redis_client.hset(figi, 'lot', lot_size[figi])

    unary_request_counter = 0
    start_time = time.time()
    subscribed = False

    with Client(TOKEN) as client:
        for marketdata in client.market_data_stream.market_data_stream(request_iterator(usfigi_data)):
            order_book = marketdata.orderbook
            if order_book is not None:
                figi = order_book.figi

                bids_header = "Bids:"
                asks_header = "Asks:"
                bids_output = []
                asks_output = []

                total_bid_quantity = 0  # Общее количество заявок на покупку
                total_ask_quantity = 0  # Общее количество заявок на продажу
                total_bid = 0  # Сумма bid
                total_ask = 0  # Сумма ask

                for bid, ask in zip(order_book.bids, order_book.asks):
                    bid_price = round(bid.price.units + bid.price.nano * 1e-9, 2)
                    bid_quantity = bid.quantity * lot_size.get(figi, 1)
                    bids_output.append((bid_price, bid_quantity))

                    ask_price = round(ask.price.units + ask.price.nano * 1e-9, 2)
                    ask_quantity = ask.quantity * lot_size.get(figi, 1)
                    asks_output.append((ask_price, ask_quantity))

                    total_bid += bid_price * bid_quantity
                    total_bid_quantity += bid_quantity
                    total_ask += ask_price * ask_quantity
                    total_ask_quantity += ask_quantity

                # Расчет сумм и процентов
                if total_bid + total_ask > 0:
                    bid_percentage = (total_bid / (total_bid + total_ask)) * 100
                    ask_percentage = (total_ask / (total_bid + total_ask)) * 100
                else:
                    bid_percentage = 0
                    ask_percentage = 0

                if total_bid_quantity + total_ask_quantity > 0:
                    bid_q = (total_bid_quantity / (total_bid_quantity + total_ask_quantity)) * 100
                    ask_q = (total_ask_quantity / (total_bid_quantity + total_ask_quantity)) * 100
                else:
                    bid_q = 0
                    ask_q = 0

                # Преобразование в строки
                conv_total_bid = f"{round(total_bid, 2)}"
                conv_total_ask = f"{round(total_ask, 2)}"
                conv_total_bid_p = f"{bid_percentage:.2f}%"
                conv_total_ask_p = f"{ask_percentage:.2f}%"
                conv_total_bid_quantity = f"{total_bid_quantity}"
                conv_total_ask_quantity = f"{total_ask_quantity}"
                conv_total_bid_quantity_p = f"{bid_q:.2f}%"
                conv_total_ask_quantity_p = f"{ask_q:.2f}%"

                

                print(conv_total_bid)
                # Записываем в Redis данные
                redis_client.hset(figi, 'Total Bids', conv_total_bid)
                redis_client.hset(figi, 'Total Asks', conv_total_ask)
                redis_client.hset(figi, 'Bid Percentage', conv_total_bid_p)
                redis_client.hset(figi, 'Ask Percentage', conv_total_ask_p)
                redis_client.hset(figi, 'Total Bid Quantity', conv_total_bid_quantity)
                redis_client.hset(figi, 'Total Ask Quantity', conv_total_ask_quantity)
                redis_client.hset(figi, 'Bid Percentage Quantity', conv_total_bid_quantity_p)
                redis_client.hset(figi, 'Ask Percentage Quantity', conv_total_ask_quantity_p)

                # Проверяем, прошла ли одна минута
                elapsed_time = time.time() - start_time
                if elapsed_time >= 60:
                    # Выводим количество унарных запросов в минуту в лог
                    unary_requests_per_minute = unary_request_counter / (elapsed_time / 60)
                    print("========================================================================")
                    print(f"OrderBook, итераций в минуту: {unary_requests_per_minute}")
                    print("========================================================================")

                    # Сбрасываем счетчик и обновляем время начала отсчета
                    unary_request_counter = 0
                    start_time = time.time()
                # Увеличиваем счетчик унарных запросов
                unary_request_counter += 1

                # Выводим результаты в log
                # print("Figi:", figi)
                # print("Name:", redis_client.hget(figi, 'Name').decode('utf-8'))
                # print("Depth:", order_book.depth)
                # print("--------------------------------")
                # print(bids_header.rjust(10), asks_header.rjust(10))
                # print("--------------------------------")
                # for bid, ask in zip(bids_output, asks_output):
                #     bid_price, bid_quantity = bid
                #     ask_price, ask_quantity = ask
                #     bid_quantity_str = "{:.2f}".format(bid_quantity / lot_size.get(figi, 1)).rstrip('0').rstrip('.')
                #     ask_quantity_str = "{:.2f}".format(ask_quantity / lot_size.get(figi, 1)).rstrip('0').rstrip('.')
                #     print(f"{bid_price:<10.2f}{bid_quantity_str:<10}{ask_price:<10.2f}{ask_quantity_str:<10}")

                # print()
                # print("Time:", order_book.time)
                # print()
                # print("Total Bids:", conv_total_bid)
                # print("Total Asks:", conv_total_ask)
                # print("Total Bid Quantity:", conv_total_bid_quantity)
                # print("Total Ask Quantity:", conv_total_ask_quantity)
                # print("Bid Percentage:", conv_total_bid_p)
                # print("Ask Percentage:", conv_total_ask_p)
                # print("Bid Percentage Quantity:", conv_total_bid_quantity_p)
                # print("Ask Percentage Quantity:", conv_total_ask_quantity_p)
                # print()

if __name__ == "__main__":
    try:
        loop = asyncio.get_event_loop()
        loop.run_until_complete(main())
    except KeyboardInterrupt:
        print("Прерывание пользователем.")
        sys.exit(0)
