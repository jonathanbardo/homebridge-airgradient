import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';

import { AirGradientSensor } from './platformAccessory.js';

import {
  API,
  Characteristic,
  DynamicPlatformPlugin,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Logging
} from 'homebridge';

export interface SensorConfig {
  name: string;
  metricsEndpoint: string;
  pollingInterval?: number;
}

export class AirGradientPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly log: Logging;
  public readonly api: API;
  public readonly accessories: PlatformAccessory[] = [];

  constructor(log: Logging, config: PlatformConfig, api: API) {
    this.log = log;
    this.api = api;
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    if (config.sensors) {
      for (const sensorConfig of config.sensors as SensorConfig[]) {
        this.log.info(`Initializing sensor (${sensorConfig.name}) with with metrics endpoint: ${sensorConfig.metricsEndpoint}`);
        this.addAccessory(sensorConfig);
      }
    }

    api.on('didFinishLaunching', () => {
      this.log.info('Did finish launching');
    });
  }

  addAccessory(sensorConfig: SensorConfig) {
    const uuid = this.api.hap.uuid.generate(sensorConfig.metricsEndpoint);
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

    if (existingAccessory) {
      this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
      new AirGradientSensor(this, existingAccessory, sensorConfig);
    } else {
      this.log.info('Adding new accessory for metrics endpoint:', sensorConfig.metricsEndpoint);
      const accessory = new this.api.platformAccessory(`AirGradient Sensor ${sensorConfig.name}`, uuid);
      new AirGradientSensor(this, accessory, sensorConfig);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.accessories.push(accessory);
  }
}
