ARG BUILD_FROM
FROM ${BUILD_FROM}
#FROM arm64v8/alpine:3.16

# Synchronize with homeassistant/core.py:async_stop
ENV \
    S6_SERVICES_GRACETIME=220000

SHELL ["/bin/bash", "-o", "pipefail", "-c"]


RUN mkdir /usr/app
WORKDIR /usr/app

ARG QEMU_CPU

RUN apk add --no-cache npm git
RUN apk add --no-cache nodejs
RUN apk add --no-cache  py3-pip make
RUN apk update make
RUN apk add --no-cache gcc g++ linux-headers udev

RUN cd /usr/app && npm install serialport --build-from-source

COPY package.json /usr/app
COPY index.js /usr/app
COPY util.js /usr/app
COPY CustomIO.js /usr/app

RUN cd /usr/app && npm install --unsafe-perm

COPY run.sh /
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]