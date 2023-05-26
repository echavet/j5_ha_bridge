# J5 Hassio Bridge pour Home Assistant

## Introduction

J5 Hassio Bridge est un add-on pour Home Assistant qui facilite l'interfaçage avec des capteurs connectés à une carte Arduino. Utilisant le firmware ConfigurableFirmata, il agit comme un pont entre Home Assistant et votre carte Arduino, permettant à Home Assistant d'interagir directement avec les capteurs de votre choix.

## Pré-requis

- Une installation fonctionnelle de Home Assistant.
- Une carte Arduino flashée avec le firmware ConfigurableFirmata.
- Les capteurs que vous souhaitez utiliser, connectés à votre carte Arduino.

## Installation

1. Ouvrez Home Assistant et accédez à l'onglet "Supervisor".
2. Sélectionnez "Add-on Store" dans la barre latérale.
3. Recherchez "J5 Hassio Bridge" dans la barre de recherche et sélectionnez l'add-on.
4. Cliquez sur "INSTALL".

## Configuration

Pour configurer l'add-on, vous devrez modifier le fichier `config.yaml`. Vous pouvez définir le périphérique auquel votre carte Arduino est connectée, le taux de transfert (baudrate), le sujet de découverte MQTT (discovery_topic), ainsi que les différents capteurs que vous souhaitez utiliser.

Voici un exemple de fichier de configuration :

```yaml
device: "/dev/tty.usbmodem14101"
baudrate: 115200
discovery_topic: "homeassistant"

binary_sensors:
  - name: "Détecteur de débit TEST"
    pin: 11
    device_class: "running"
relays:
  - name: "Test Relay 1"
    pin: 8
    type: "NC"
  - name: "Test Relay 2"
    pin: 7
    type: "NO"
  - name: "Test Relay 3"
    pin: 6
    type: "NC"
    device_class: "switch"
    domain: "light"
  - name: "Test Relay 4"
    pin: 5
    type: "NO"
    device_class: "switch"
  - name: "Thermometers AUTO ON/OFF (TEST)"
    pin: 13
    type: "NC"
    device_class: "switch"
sensors:
  - name: "Pression Filtre à Sable TEST"
    pin: "A0"
    freq: 500
    unit: bar
    device_class: pressure
thermometers:
  - name: "Thermometers AUTO"
    pin: 12
    controler: AUTO-DS18B20

## Utilisation
Une fois l'add-on installé et configuré, il lira automatiquement les données des capteurs connectés à votre carte Arduino et les transmettra à Home Assistant via MQTT. Vous pourrez ensuite utiliser ces données dans vos tableaux de bord, vos automatisations, vos scénarios, etc. TEST"

## Support
Si vous rencontrez des problèmes lors de l'installation ou de l'utilisation de cet add-on, n'hésitez pas à demander de l'aide sur le forum de Home Assistant ou à ouvrir un ticket sur la page GitHub de l'add-on.
