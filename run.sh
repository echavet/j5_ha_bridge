#!/usr/bin/with-contenv bashio
set +u

bashio::log.info "Starting hassio Johnny-Five bridge"

cd /usr/app

#npm ls --depth=2
 

#curl -sSL http://supervisor/supervisor/ping

npm run start
