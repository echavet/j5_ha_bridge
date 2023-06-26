# J5 Hassio Bridge pour Home Assistant

## Introduction

J5 Hassio Bridge est un add-on pour Home Assistant qui facilite l'interfaçage avec des capteurs connectés à une carte Arduino. Utilisant le firmware ConfigurableFirmata, il agit comme un pont entre Home Assistant et votre carte Arduino, permettant à Home Assistant d'interagir directement avec les capteurs de votre choix.

## Pré-requis

- Une installation fonctionnelle de Home Assistant.
- Une carte Arduino flashée avec le firmware ConfigurableFirmata.
- Les capteurs que vous souhaitez utiliser, connectés à votre carte Arduino.

## Installation

1. Ouvrez Home Assistant et accédez au menu "Paramètres".
2. Sélectionnez "Modules complémentaires".
3. Appuyez sur le bouton Boutique des Modules Complémentaires.
4. Cliquer sur le bouton "..." en haut à droite.
5. Ajouter le dépot https://github.com/echavet/j5_ha_bridge 
6. De retour dans la liste des addons, vous devriez trouver j5_ha_bridge dans la section "Johnny-Five Home Assistant addon repository"

## Configuration

Pour configurer l'add-on, vous devrez modifier la configuration `yaml` de l'addon. Vous pouvez définir le périphérique auquel votre carte Arduino est connectée, le taux de transfert (baudrate), le sujet de découverte MQTT (discovery_topic), ainsi que les différents capteurs que vous souhaitez utiliser.

Voici un exemple de fichier de configuration :

```yaml
baudrate: 115200
discovery_topic: "homeassistant"
device: /dev/serial/by-id/usb-Arduino__www.arduino.cc__0043_24236323730351306161-if00

## Ces 2 points de calibration définissent un 'set' sand_filter et un set 'ph_probe'
## Ces sets sont référencés par les capteur filtre à sable et ph un peu plus bas.

calibration_sets:
  - set: sand_filter
    x_point: 103
    y_point: 0.2
  - set: sand_filter
    x_point: 151
    y_point: 0.8
  - set: ph_probe
    x_point: 103
    y_point: 4.1
  - set: ph_probe
    x_point: 258
    y_point: 7.0
  - set: ph_probe
    x_point: 389
    y_point: 9.4

binary_sensors:
  - name: Détecteur de débit
    pin: "11"
    device_class: running
    invert: true
    type: NC
relays:
  - name: Relay 4
    pin: "5"
    type: "NO"
  - name: Relay 3
    pin: "6"
    type: "NO"
  - name: Relay 2
    pin: "7"
    type: "NO"
  - name: Relay 1
    pin: "8"
    type: "NO"
    device_class: switch
  
sensors:
  - name: Pression Filtre à Sable
    pin: A0
    unit: bar
    freq: 500
    device_class: pressure
    calibration_set: sand_filter
    calibration_type: linear
    #calibration_precision: 4
    #calibration_order: 1

  - name: Sonde PH
    pin: A4
    unit: ph
    freq: 1000
    device_class: voltage
    calibration_set: ph_probe
    calibration_type: polynomial
    calibration_precision: 16
    calibration_order: 4

  - name: Sonde redox
    pin: A5
    unit: mv
    freq: 1000
    device_class: voltage
thermometers:
  - name: Air Thermometers
    ## Ici on recherche le ou les capteur connectés sur la pin 12 de l'arduino
    pin: "12"
    ## Le controler AUTO-DS18B20 va rechercher sur le bus 1-wire l'ensemble des capteurs DS18B20 et les 
    ## enregistrer auprès de HomeAssistant    
    controler: AUTO-DS18B20
    freq: 30000

    ## Ici on recherche le ou les capteur connectés sur la pin 3 de l'arduino
  - name: Water Thermometer
    pin: "3"
    freq: 15000
    controler: AUTO-DS18B20


## Utilisation
Une fois l'add-on installé et configuré, il lira automatiquement les données des capteurs connectés à votre carte Arduino et les transmettra à Home Assistant via MQTT. Vous pourrez ensuite utiliser ces données dans vos tableaux de bord, vos automatisations, vos scénarios, etc. TEST"

## Support
Si vous rencontrez des problèmes lors de l'installation ou de l'utilisation de cet add-on, n'hésitez pas à demander de l'aide sur le forum ou à ouvrir un ticket sur la page GitHub de l'add-on.
