import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { AirGradientPlatform } from './platform.js';
import { API } from 'homebridge';

export = (homebridge: API) => {
  homebridge.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, AirGradientPlatform);
};
