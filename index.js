
const util = require('./util.js')
const { Board } = require('johnny-five');
const debug = require('debug')('main');
const CustomIO = require('./CustomIO.js');
const MQTTManager = require('./MQTTManager.js');

const ONE_WIRE_PIN = 12;

const mqtt = require('mqtt');

// point d'entrée
main();

function main() {
  try {
    debug("Retreiving MQTT HA config...");
    util.getMQTTConfig((mqttConfig) => {
      debug("MQTT config:");
      console.log(mqttConfig);

      debug("Connexion au broker MQTT...");
      /** @type {mqtt.MqttClient} */
      const mqttClient = mqtt.connect(`mqtt://${mqttConfig.host}`, {
        username: mqttConfig.username,
        password: mqttConfig.password
      });

      mqttClient.on('connect', () => {
        console.log('Connected to MQTT broker');
        onMQTTConnected(new MQTTManager(mqttClient, mqttConfig));

      });

      mqttClient.on('error', (error) => {
        util.handleError(error);
      });

      mqttClient.on('reconnect', () => {
        console.log('Reconnecting to MQTT broker');
      });

      mqttClient.on('close', () => {
        console.log('Disconnected from MQTT broker');
      });
    });

  } catch (error) {
    util.handleError(error);
  }
}


function onMQTTConnected(mqttManager) {
  debug("main", "Retreiving HA user custom config...");
  //call getconf
  util.getAddonConfig((addonConfig) => {

    const board = new Board({
      io: new CustomIO(addonConfig),
    });

    board.on('error', (error) => {
      util.handleError(error);
    });

    board.on("string", (message) => {
      debug('STRING: ', `${message}`);
    });

    board.on('ready', () => {
      debug("La carte Arduino est prête.");
      // lecture des objets dans la config de l'addon et annonce mqtt si nécessaire.
      board.io.setupEntities(mqttManager, addonConfig);
    });

  });
}




