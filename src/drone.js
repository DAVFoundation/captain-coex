const {
    updateVehicleStatus,
    getVehicle:apiGetVehicle,
    addNewVehicle:apiAddNewVehicle,
    updateVehicle:apiUpdateVehicle
  }  = require('./missioncontrol/vehicles');
const { 
    getMission, 
    updateMission,
    createMissionUpdate 
  } = require('./missioncontrol/missions');
const Rx = require('rxjs/Rx');
const DroneApi = require('./drone-api');
const geolib = require('geolib');
const { getElevations } = require('./elevation');

const DRONE_AVG_VELOCITY = 10.0; // m/s
const DRONE_PRICE_RATE = 1e-14 / 1000; // DAV/m
const DRONE_CRUISE_ALT = 20;

const DRONE_ID_MAP = { // make sure thet eth addres is in lower case
  9: {
    address: '0x1df62f291b2e969fb0849d99d9ce41e2f137006e'
  }
};
  
class CoExDrone {
  constructor() {
    this.droneApi = new DroneApi();
    this.dronesByCoexId = {};
    this.dronesByDavID = {};
  }

  async init() {
    this.droneUpdates = Rx.Observable.timer(0, 1000).subscribe(async () => {
      try {
        await this.updateVehicles();
      } catch (error) {
        console.error(error);
      }
    });
  }

  getDrones() {
    return Object.values(DRONE_ID_MAP).map((drone) => drone.address);
  }

  async dispose() {
    this.droneUpdates.unsubscribe();
  }

  async addDrone(drone) {
    if (!this.dronesByCoexId[drone.id]) {
      this.dronesByCoexId[drone.id] = drone;
      this.dronesByDavID[drone.davId] = drone;
    }
  }

  async beginMission(vehicleId, missionId) {
    const missionUpdates = Rx.Observable.timer(0, 1000)
      .mergeMap(async () => {
        let mission = await getMission(missionId);
        let vehicle = await apiGetVehicle(mission.vehicle_id);
        const drone = this.dronesByDavID[vehicleId];
        const droneState = await this.droneApi.getState(drone.id);
        droneState.id = drone.id;
        return { mission, vehicle, droneState };
      })
      .distinctUntilChanged(
        (state1, state2) =>
          state1.mission.status === state2.mission.status &&
          state1.vehicle.status === state2.vehicle.status &&
          state1.droneState.status === state2.droneState.status
      )
      .subscribe(
        async state => {
          try {
            switch (state.mission.status) {
              case 'awaiting_signatures':
                break;
              case 'in_progress':
                await this.onInProgress(
                  state.mission,
                  state.vehicle,
                  state.droneState
                );
                break;
              case 'in_mission':
                await this.onInMission(
                  state.mission,
                  state.vehicle,
                  state.droneState
                );
                break;
              case 'completed':
                missionUpdates.unsubscribe();
                break;
              default:
                console.log(`bad mission.status ${state.mission}`);
                break;
            }
          } catch (error) {
            console.error(error);
          }
        },
        error => {
          console.error(error);
        }
      );
  }

  async onInProgress(mission, vehicle, droneState) {
    await updateMission(mission.mission_id, {
      status: 'in_mission',
      vehicle_start_longitude: droneState.location.lon,
      vehicle_start_latitude: droneState.location.lat
    });

    await this.onInMission(mission, vehicle, droneState);
  }

  async onInMission(mission, vehicle, droneState) {
    await updateVehiclePosition(
      vehicle,
      droneState.location.lon,
      droneState.location.lat
    );
    const [
      { elevation: pickupAlt },
      { elevation: dropoffAlt },
      { elevation: takeoffAlt }
    ] = (await getElevations([
      { lat: mission.pickup_latitude, long: mission.pickup_longitude },
      { lat: mission.dropoff_latitude, long: mission.dropoff_longitude },
      { lat: droneState.location.lat, long: droneState.location.lon }
    ])).map(o => {
      o.elevation = parseFloat(o.elevation);
      return o;
    });

    switch (vehicle.status) {
      case 'contract_received':
        await this.droneApi.goto(
          droneState.id,
          parseFloat(mission.pickup_latitude),
          parseFloat(mission.pickup_longitude),
          DRONE_CRUISE_ALT/*  - takeoffAlt */,
          pickupAlt - takeoffAlt,
          true
        );
        await this.updateStatus(mission, 'takeoff_start', 'takeoff_start');
        break;
      case 'takeoff_start':
        if (droneState.status === 'Active') {
          await this.updateStatus(
            mission,
            'travelling_pickup',
            'travelling_pickup'
          );
        }
        break;
      case 'travelling_pickup':
        if (droneState.status === 'Standby') {
          await this.updateStatus(mission, 'landing_pickup', 'landing_pickup');
        }
        // setTimeout(async () => {
        //   await this.updateStatus(mission, 'landing_pickup', 'landing_pickup');
        // }, 3000);
        break;
      case 'landing_pickup':
        setTimeout(async () => {
          await this.updateStatus(mission, 'waiting_pickup', 'waiting_pickup');
        }, 3000);
        break;
      case 'waiting_pickup':
        console.log(`drone waiting for pickup`);
        break;
      case 'takeoff_pickup':
        await this.droneApi.goto(
          droneState.id,
          parseFloat(mission.dropoff_latitude),
          parseFloat(mission.dropoff_longitude),
          DRONE_CRUISE_ALT /* - takeoffAlt */,
          dropoffAlt - takeoffAlt,
          true
        );
        await this.updateStatus(
          mission,
          'takeoff_pickup_wait',
          'takeoff_pickup_wait'
        );
        break;
      case 'takeoff_pickup_wait':
        if (droneState.status === 'Active') {
          await this.updateStatus(
            mission,
            'travelling_dropoff',
            'travelling_dropoff'
          );
        }
        // setTimeout(async () => {
        //   await this.updateStatus( mission, 'travelling_dropoff', 'travelling_dropoff' );
        // }, 3000);
        break;
      case 'travelling_dropoff':
        if (droneState.status === 'Standby') {
          await this.updateStatus(mission, 'landing_pickup', 'landing_pickup');
        }
        // setTimeout(async () => {
        //   await this.updateStatus( mission, 'landing_dropoff', 'landing_dropoff' );
        // }, 3000);
        break;
      case 'landing_dropoff':
        setTimeout(async () => {
          await this.updateStatus(
            mission,
            'waiting_dropoff',
            'waiting_dropoff'
          );
        }, 3000);
        break;
      case 'waiting_dropoff':
        setTimeout(async () => {
          await this.updateStatus(mission, 'completed', 'available');
        }, 3000);
        break;
      case 'available':
        await updateMission(mission.mission_id, {
          status: 'completed'
        });
        break;
      default:
        console.log(`bad vehicle.status ${vehicle}`);
        break;
    }
  }

  async updateStatus(mission, missionStatus, vehicleStatus) {
    await updateMission(mission.mission_id, {
      [missionStatus + '_at']: Date.now()
    });
    await createMissionUpdate(mission.mission_id, missionStatus);
    await updateVehicleStatus(mission.vehicle_id, vehicleStatus);
  }

  async updateVehicles() {
    const drones = (await this.droneApi.listDrones()) || [];

    drones
      .filter(drone => drone.description.match(/\bSITL\b/))
      .forEach(async drone => {
        try {
          await this.updateVehicle(drone);
        } catch (error) {
          console.error(error);
        }
      });
  }

  async updateVehicle(drone) {
    drone.davId = DRONE_ID_MAP[drone.id].address;
    this.addDrone(drone);
    const state = await this.droneApi.getState(drone.id);
    console.log(`${JSON.stringify(state.location)} ${state.status}`);

    let vehicle = await apiGetVehicle(drone.davId);
    if (vehicle) {
      vehicle.coords = {
        long: state.location.lon,
        lat: state.location.lat
      };
      apiUpdateVehicle(vehicle);
    } else {
      let vehicle = {
        id: drone.davId,
        model: 'CopterExpress-d1',
        icon: `https://lorempixel.com/100/100/abstract/?${drone.davId}`,
        coords: {
          long: state.location.lon,
          lat: state.location.lat
        },
        missions_completed: 0,
        missions_completed_7_days: 0,
        status: 'available'
      };
      apiAddNewVehicle(vehicle);
    }
  }

  getBid(davId, origin, pickup, dropoff) {
    dropoff = {
      lat: parseFloat(dropoff.lat),
      long: parseFloat(dropoff.long)
    };
    const distToPickup = geolib.getDistance(
      { latitude: origin.lat, longitude: origin.long },
      { latitude: pickup.lat, longitude: pickup.long },
      1,
      1
    );

    const distToDropoff = geolib.getDistance(
      { latitude: pickup.lat, longitude: pickup.long },
      { latitude: dropoff.lat, longitude: dropoff.long },
      1,
      1
    );

    const totalDist = distToPickup + distToDropoff;

    const bidInfo = {
      price: `${totalDist / DRONE_PRICE_RATE}`,
      price_type: 'flat',
      price_description: 'Flat fee',
      time_to_pickup: distToPickup / DRONE_AVG_VELOCITY + 1,
      time_to_dropoff: distToDropoff / DRONE_AVG_VELOCITY + 1,
      drone_manufacturer: 'Copter Express',
      drone_model: 'SITL',
      expires_at: Date.now() + 3600000,
      ttl: 120 // TTL in seconds
    };

    return bidInfo;
  }
}

module.exports = new CoExDrone();  