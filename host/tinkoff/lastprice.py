import pymysql
import json
import os
import time
import sys
import datetime
import asyncio
from decimal import Decimal, DivisionByZero
import redis
from dotenv import load_dotenv
load_dotenv()
from tinkoff.invest import (
    Client,
    MarketDataRequest,
    SubscribeLastPriceRequest,
    LastPriceInstrument,
    SubscriptionAction
)
from dateutil import parser

# Connect to Redis
redis_client = redis.Redis(host='localhost', port=6379, db=1)

conn = pymysql.connect(
    host="localhost",
    port=3306,
    user="junior",
    password="junior@7",
    database="tinkoff_db"
)

conn_result = pymysql.connect(
    host="localhost",
    port=3306,
    user="junior",
    password="junior@7",
    database="tinkoff_result"
)

TOKEN = os.environ.get("TOKEN_TINKOFF")

previous_prices = {}

def get_instrument_info_from_cache(figi):
    instrument_data = redis_client.hgetall(figi)
    if instrument_data:
        name = instrument_data.get(b'name').decode('utf-8')
        ticker = instrument_data.get(b'ticker').decode('utf-8')
        return name, ticker
    else:
        cursor = conn.cursor()
        query = "SELECT Name, ticker FROM moex_impulse WHERE figi = %s"
        cursor.execute(query, (figi,))
        result = cursor.fetchone()
        cursor.close()

        if result:
            name, ticker = result
            # Save data of Redis instrument
            cache_instrument_data(figi, name, ticker)
            return name, ticker
        else:
            return None, None


def cache_instrument_data(figi, name, ticker):
    redis_client.hset(figi, 'name', name)
    redis_client.hset(figi, 'ticker', ticker)


def insert_price_history(figi, price_in_rubles, time_datetime):
    redis_client.hset(figi, 'price', str(float(price_in_rubles)))
    redis_client.hset(figi, 'time', time_datetime.strftime('%Y-%m-%d %H:%M:%S'))

    cursor = conn.cursor()
    query = "INSERT INTO price_history (figi, price, time) VALUES (%s, %s, %s)"
    cursor.execute(query, (figi, price_in_rubles, time_datetime))
    conn.commit()
    cursor.close()

def get_price_history(figi):
    instrument_data = redis_client.hgetall(figi)
    if instrument_data:
        price = float(instrument_data.get(b'price').decode('utf-8'))
        time_str = instrument_data.get(b'time').decode('utf-8')
        time_datetime = datetime.datetime.strptime(time_str, '%Y-%m-%d %H:%M:%S')
        return price, time_datetime
    else: 
        cursor = conn.cursor() 
        query = "SELECT price, time FROM price_history WHERE figi = %s ORDER BY time DESC LIMIT 1"
        cursor.execute(query, (figi,)) 
        result = cursor.fetchone() 
        cursor.close()

        if result:
            price, time_str = result
            time_datetime = datetime.datetime.strptime(time_str, '%Y-%m-%d %H:%M:%S')
            # Save data of prices history in Redis
            insert_price_history(figi, price, time_datetime)
            return price, time_datetime
        else:
            return None, None
# For some future goals ))
# def create_price_history_table():
#     # Clear current data in Redis
#     redis_client.flushdb()

def limit_price_history():
    cursor = conn.cursor()
    query = "SELECT COUNT(*) FROM price_history"
    cursor.execute(query)
    count = cursor.fetchone()[0]
    cursor.close()

    if count > 50000:
        cursor = conn.cursor()
        query = "DELETE FROM price_history ORDER BY time LIMIT %s"
        cursor.execute(query, (count - 50000,))
        conn.commit()
        cursor.close()

async def main():
    # Может пригодится ))
    #create_price_history_table()

    cursor = conn.cursor()
    query = "SELECT figi, price_in_rubles FROM moex_impulse"
    cursor.execute(query)
    instruments = cursor.fetchall()
    cursor.close()

    previous_prices = {figi: Decimal(price) if price is not None else Decimal(0) for figi, price in instruments}

    threshold_percent = Decimal(0.7) # Процент отклонения


    cursor_result = conn_result.cursor()

    def request_iterator():
        num_streams = 1  # Количество параллельных потоков
        chunk_size = len(instruments) // num_streams
        print("Get tickers on LastPrice:", len(instruments))
        stream_instruments = instruments[0 * chunk_size: (0 + 1) * chunk_size]
        yield MarketDataRequest(
               
            subscribe_last_price_request=SubscribeLastPriceRequest(
                subscription_action=SubscriptionAction.SUBSCRIPTION_ACTION_SUBSCRIBE,
                instruments=[
                   
                    LastPriceInstrument(figi=instrument[0]) for instrument in stream_instruments
                ]
            )
        )
        while True:
            time.sleep(0)
            
    with Client(TOKEN) as client:
        result_list = []
        unary_request_count = 0
        start_time = time.time()

        for marketdata in client.market_data_stream.market_data_stream(request_iterator()):
            last_price = marketdata.last_price
            if last_price is not None:
                figi = last_price.figi
                price_in_rubles = Decimal(last_price.price.units) + Decimal(last_price.price.nano) / Decimal(1e9)
                name, ticker = get_instrument_info_from_cache(figi)
                if name and ticker:
                    if figi in previous_prices:
                        previous_price = previous_prices[figi]
                        price_change = price_in_rubles - previous_price

                        try:
                            percent_change = round((price_change / previous_price) * 100, 2)
                        except DivisionByZero:
                            percent_change = 0

                        previous_prices[figi] = price_in_rubles

                        if abs(percent_change) >= threshold_percent:
                            if percent_change > 0:
                                direction = "вверх"
                            elif percent_change < 0:
                                direction = "Вниз"
                            else:
                                direction = "без изменений"

                            if percent_change > 0:
                                deviation_direction = "Выше на:"
                            else:
                               
                                deviation_direction = "Ниже на:"

                            deviation = abs(percent_change) - threshold_percent


                            time_datetime = parser.parse(str(last_price.time)).replace(tzinfo=datetime.timezone.utc).astimezone()
                            #print(f"Ticker: {ticker}")
                            #print(f"figi: {figi}")
                            
                            #print(f"Time: {time_datetime}")
                            #print(f"Price: {price_in_rubles}")
                            #print(f"Price change: {price_change} ({direction})")
                            #print(f"Percent_change: {percent_change:.2f}% ({deviation_direction} {deviation:.2f}% from the threshold value)")
                            #print("---------------------")

                            result_list.insert(0, (ticker, figi, time_datetime, price_in_rubles, price_change, direction, percent_change, deviation_direction, deviation))

                            if len(result_list) > 750:
                                result_list = result_list[:750]

                            values = [(item[0], item[1], item[2], item[3], item[4], item[5], item[6], item[7], item[8]) for item in result_list]

                            delete_query = "DELETE FROM tinkoff_result"
                            cursor_result.execute(delete_query)

                            insert_query = "INSERT INTO tinkoff_result (ticker, figi, time, price, price_change, direction, percent_change, deviation_direction, deviation) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)"
                            cursor_result.executemany(insert_query, values)
                            conn_result.commit()

                            # Insert data in Redis
                            insert_price_history(figi, price_in_rubles, time_datetime)

                            limit_price_history()

            unary_request_count += 1
            elapsed_time = time.time() - start_time
            if elapsed_time >= 60:
               # print("========================================================================")
                print(f"LastPrice, iterations in minute: {unary_request_count / elapsed_time * 60:.2f}")
                #print("========================================================================")

                unary_request_count = 0
                start_time = time.time()

    cursor_result.close()
    conn_result.close()

if __name__ == "__main__":
    try:
        loop = asyncio.get_event_loop()
        loop.run_until_complete(main())

    except KeyboardInterrupt:
        print("User interruption.")
        
        
        sys.exit(0)
