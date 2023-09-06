#!/bin/bash
echo ""
systemctl restart soketwss
systemctl restart bot_auth
systemctl restart alorx
systemctl restart lastprice
systemctl restart orderbook
echo "Статус soketwss:"
systemctl status soketwss.service | grep "Active"
echo "Статус bot_auth:"
systemctl status bot_auth | grep "Active"
echo "Статус alorx:"
systemctl status alorx | grep "Active"
echo "Статус lastprice:"
systemctl status lastprice | grep "Active"
echo "Статус orderbook:"
systemctl status orderbook | grep "Active"
echo ""
echo "Все скрипты успешно перезапущены!"
