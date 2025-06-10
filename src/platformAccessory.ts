import axios from 'axios';
import {
  PlatformAccessory,
  Service,
  Logging,
} from 'homebridge';

import type { AirGradientPlatform, SensorConfig } from './platform.js';

// JSON response from the custom JSON endpoint we are receiving data from
// Example response:
// {"pm02":4,"rco2":763,"atmp":23.30,"rhum":37}
interface AirGradientData {
  pm02: number;
  rco2: number;
  atmp: number;
  rhum: number;
}

export class AirGradientSensor {
    private readonly platform: AirGradientPlatform;
    private readonly name: string;
    private readonly metricsEndpoint: string;
    private readonly accessory: PlatformAccessory;
    private readonly log: Logging;
    private readonly pollingInterval: number;
    private data: AirGradientData | null = null;
    private readonly service: Service;
    private readonly serviceTemp: Service;
    private readonly serviceCO2: Service;
    private readonly serviceHumid: Service;

    constructor(platform: AirGradientPlatform, accessory: PlatformAccessory, sensorConfig: SensorConfig) {
        this.platform = platform;
        this.accessory = accessory;
        this.log = platform.log;
        this.name = sensorConfig.name;
        this.metricsEndpoint = sensorConfig.metricsEndpoint;
        this.pollingInterval = sensorConfig.pollingInterval || 60000; // Default to 1 minute


        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'AirGradient')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.UUID);

        this.service = this.accessory.getService(this.platform.Service.AirQualitySensor) ||
        this.accessory.addService(this.platform.Service.AirQualitySensor);
        this.serviceTemp = this.accessory.getService(this.platform.Service.TemperatureSensor) ||
        this.accessory.addService(this.platform.Service.TemperatureSensor);
        this.serviceCO2 = this.accessory.getService(this.platform.Service.CarbonDioxideSensor) ||
        this.accessory.addService(this.platform.Service.CarbonDioxideSensor);
        this.serviceHumid = this.accessory.getService(this.platform.Service.HumiditySensor) ||
        this.accessory.addService(this.platform.Service.HumiditySensor);

        this.setupCharacteristics();
        this.updateData();
    }

    private setupCharacteristics() {
        this.service.getCharacteristic(this.platform.Characteristic.AirQuality)
            .on('get', this.handleAirQualityGet.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.PM2_5Density)
            .on('get', this.handlePM2_5DensityGet.bind(this));

        this.serviceTemp.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
            .on('get', this.handleCurrentTemperatureGet.bind(this));

        this.serviceCO2.getCharacteristic(this.platform.Characteristic.CarbonDioxideDetected)
            .on('get', this.handleCarbonDioxideDetectedGet.bind(this));

        this.serviceCO2.getCharacteristic(this.platform.Characteristic.CarbonDioxideLevel)
            .on('get', this.handleCarbonDioxideLevelGet.bind(this));

        this.serviceHumid.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
            .on('get', this.handleCurrentRelativeHumidityGet.bind(this));
    }

    private async fetchData() {
        try {
            const response = await axios.get(this.metricsEndpoint);
            this.data = response.data;
            this.log.info('Data fetched successfully:', this.data);

            // Log the full response for debugging
            this.log.debug('API response:', this.data);
        } catch (error) {
            this.log.error('Error fetching data from AirGradient API:', error);
            throw error;
        }
    }

    private async updateData() {
        try {
            await this.fetchData();
        if (this.data) {
            this.updateCharacteristics();
        }
        } catch (error) {
            this.log.error('Error updating data:', error);
        } finally {
            // Schedule the next update
            setTimeout(() => this.updateData(), this.pollingInterval);
        }
    }

    private updateCharacteristics() {
        if (!this.data) {
            return;
        }

        const pm2_5 = this.data.pm02;
        const co2 = this.data.rco2;
        const temp = this.data.atmp;
        const rhum = this.data.rhum;

        // Validate data before updating characteristics
        if (typeof pm2_5 === 'number' && isFinite(pm2_5)) {
            this.service.updateCharacteristic(this.platform.Characteristic.PM2_5Density, pm2_5);
        } else {
            this.log.warn('Invalid PM2.5 value:', pm2_5);
        }

        if (typeof temp === 'number' && isFinite(temp)) {
            this.serviceTemp.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, temp);
        } else {
            this.log.warn('Invalid Temperature value:', temp);
        }

        if (typeof co2 === 'number' && isFinite(co2)) {
            this.serviceCO2.updateCharacteristic(this.platform.Characteristic.CarbonDioxideDetected, this.calculateCO2Detected(co2));
            this.serviceCO2.updateCharacteristic(this.platform.Characteristic.CarbonDioxideLevel, co2);
        } else {
            this.log.warn('Invalid CO2 value:', co2);
        }

        if (typeof rhum === 'number' && isFinite(rhum)) {
            this.serviceHumid.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, rhum);
        } else {
            this.log.warn('Invalid Humidity value:', rhum);
        }

        this.service.updateCharacteristic(this.platform.Characteristic.AirQuality, this.calculateAirQuality(pm2_5));

        this.log.info(`Updated characteristics - PM2.5: ${pm2_5}, CO2: ${co2},TEMP: ${temp}, RHUM: ${rhum}`);
    }

    private calculateAirQuality(pm2_5: number): number {
        switch (true) {
            case (pm2_5 <= 12):
                return this.platform.Characteristic.AirQuality.EXCELLENT;
            case (pm2_5 <= 35.4):
                return this.platform.Characteristic.AirQuality.GOOD;
            case (pm2_5 <= 55.4):
                return this.platform.Characteristic.AirQuality.FAIR;
            case (pm2_5 <= 150.4):
                return this.platform.Characteristic.AirQuality.INFERIOR;
            default:
                return this.platform.Characteristic.AirQuality.POOR;
        }
    }

    private calculateCO2Detected(co2: number): number {
        if (co2 <= 1200) {
            return this.platform.Characteristic.CarbonDioxideDetected.CO2_LEVELS_NORMAL;
        }

        return this.platform.Characteristic.CarbonDioxideDetected.CO2_LEVELS_ABNORMAL;
    }

    private handleAirQualityGet(callback: (error: Error | null, value?: number) => void) {
        if (this.data) {
            callback(null, this.calculateAirQuality(this.data.pm02));
            return;
        }

        callback(new Error('No data available'));
    }

    private handlePM2_5DensityGet(callback: (error: Error | null, value?: number) => void) {
        if (this.data) {
            callback(null, this.data.pm02);
            return;
        }

        callback(new Error('No data available'));
    }

    handleCurrentTemperatureGet(callback: (error: Error | null, value?: number) => void) {
        if (this.data) {
            callback(null, this.data.atmp);
            return;
        }

        callback(new Error('No data available'));
    }

    handleCarbonDioxideDetectedGet(callback: (error: Error | null, value?: number) => void) {
        if (this.data) {
            callback(null, this.calculateCO2Detected(this.data.rco2));
            return;
        }

        callback(new Error('No data available'));
    }

    handleCarbonDioxideLevelGet(callback: (error: Error | null, value?: number) => void) {
        if (this.data) {
            callback(null, this.data.rco2);
            return;
        }

        callback(new Error('No data available'));
    }

    handleCurrentRelativeHumidityGet(callback: (error: Error | null, value?: number) => void) {
        if (this.data) {
            callback(null, this.data.rhum);
            return;
        }

        callback(new Error('No data available'));
    }
}
