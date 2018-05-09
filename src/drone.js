const {
  addNewVehicle:apiAddNewVehicle,
  updateVehicle:apiUpdateVehicle
}  = require('./missioncontrol/vehicles');
const { DavSDK, API } = require('dav-js');
const Rx = require('rxjs/Rx');
const DroneApi = require('./drone-api');
const geolib = require('geolib');
const getElevations = require('./elevation');
const mnemonic = require('../mnemonic');

const DRONE_AVG_VELOCITY = 10.0; // m/s
const DRONE_PRICE_RATE = 1e-14 / 1000; // DAV/m
const DRONE_CRUISE_ALT = 20;

const DRONE_ID_MAP = require('./drone-id-map');
  
const pt1 = { lat: 47.397669, lon: 8.5444809 };
const pt2 = { lat: 47.3982004, lon: 8.5448531 };

class CoExDrone {
  constructor() {
    // for(let i in DRONE_ID_MAP) {

    // }
    // let droneIds = Object.values(DRONE_ID_MAP).map((drone) => drone.address);
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

  async dispose() {
    this.droneUpdates.unsubscribe();
  }

  async initDroneSdk(drone) {
    drone.sdk = new DavSDK(drone.davId, drone.davId, mnemonic);
    drone.needs = [];
    drone.bids = [];
    let isRegistered = await drone.sdk.isRegistered();
    if(isRegistered) {
      let missionContract = drone.sdk.mission().contract();
      missionContract.subscribe(
        mission => this.onContractCreated(drone, mission),
        err => console.log(err),
        () => console.log('')
      );
    }
    const droneState = await this.droneApi.getState(drone.id);
    const droneDelivery = drone.sdk.needs().forType('drone_delivery', {
      longitude: droneState.location.lon,
      latitude: droneState.location.lat,
      radius: 10e10,
      ttl: 120 // TTL in seconds
    });
  
    this.droneApi.stateUpdates(drone.id, 1000).subscribe(async (droneState) => {
      await droneDelivery.update({
        longitude: droneState.location.lon,
        latitude: droneState.location.lat,
        radius: 10e10,
        ttl: 120 // TTL in seconds
      })
    });

    droneDelivery.subscribe(
      need => this.onNeed(drone, need),
      err => console.log(err),
      () => console.log('')
    );
  }

  async beginMission(vehicleId, missionId) {
    const missionUpdates = Rx.Observable.timer(0, 1000)
      .mergeMap(async () => {
        let mission = await API.missions.getMission(missionId);
        let vehicle = await API.captains.getCaptain(mission.vehicle_id);
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

    await this.updateStatus(mission, 'vehicle_signed', 'contract_received');
    await API.missions.updateMission(mission.mission_id, {
      status: 'in_mission',
      longitude: droneState.location.lon,
      latitude: droneState.location.lat,
      captain_id: vehicle.id
    });

    await this.onInMission(mission, vehicle, droneState);
  }

  async onInMission(mission, vehicle, droneState) {
    vehicle.coords = {
      long: droneState.location.lon,
      lat: droneState.location.lat
    };
    API.captains.updateCaptain(vehicle);
    // let elevations = await getElevations([
    //   { lat: mission.pickup_latitude, long: mission.pickup_longitude },
    //   { lat: mission.dropoff_latitude, long: mission.dropoff_longitude },
    //   { lat: droneState.location.lat, long: droneState.location.lon }
    // ]);
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
        // await this.droneApi.goto(
        //   droneState.id,
        //   parseFloat(mission.pickup_latitude),
        //   parseFloat(mission.pickup_longitude),
        //   DRONE_CRUISE_ALT/*  - takeoffAlt */,
        //   pickupAlt - takeoffAlt,
        //   true
        // );
        setTimeout(async () => {
          await this.updateStatus(mission, 'takeoff_start', 'takeoff_start');
        }, 3000);
        break;
      case 'takeoff_start':
        // if (droneState.status === 'Active') {
        //   await this.updateStatus(
        //     mission,
        //     'travelling_pickup',
        //     'travelling_pickup'
        //   );
        // }
        setTimeout(async () => {
          await this.updateStatus(mission, 'travelling_pickup', 'travelling_pickup');
        }, 3000);
        break;
      case 'travelling_pickup':
        // if (droneState.status === 'Standby') {
        //   await this.updateStatus(mission, 'landing_pickup', 'landing_pickup');
        // }
        setTimeout(async () => {
          await this.updateStatus(mission, 'landing_pickup', 'landing_pickup');
        }, 3000);
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
          await this.updateStatus(mission, 'landing_dropoff', 'landing_dropoff');
        }
        setTimeout(async () => {
          await this.updateStatus( mission, 'landing_dropoff', 'landing_dropoff' );
        }, 3000);
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
        await API.missions.updateMission(mission.mission_id, {
          status: 'completed',
          captain_id: vehicle.id
        });
        break;
      default:
        console.log(`bad vehicle.status ${vehicle}`);
        break;
    }
  }

  async updateStatus(mission, missionStatus, vehicleStatus) {
    await API.missions.updateMission(mission.mission_id, {
      mission_status: missionStatus,
      vehicle_status: vehicleStatus,
      captain_id: mission.vehicle_id
      // mission_status: { [missionStatus + '_at']: Date.now() }
    });
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
    const state = await this.droneApi.getState(drone.id);
    if (!this.dronesByCoexId[drone.id]) {
      this.initDroneSdk(drone);
      this.dronesByCoexId[drone.id] = drone;
      this.dronesByDavID[drone.davId] = drone;
      drone.sdk.initCaptain({
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
      });
    } else {
      let captain = await API.captains.getCaptain(drone.davId);
      if (captain) {
        captain.coords = {
          long: state.location.lon,
          lat: state.location.lat
        };
        API.captains.updateCaptain(captain);
      }
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

  async onNeed(drone, need) {
    if (drone.needs.includes(need.id)) {
      return;
    }
    drone.needs.push(need.id);

    const state = await this.droneApi.getState(drone.id);

    const distToPickup = geolib.getDistance(
      { latitude: state.location.lat, longitude: state.location.lon },
      // { latitude: need.pickup_latitude, longitude: need.pickup_longitude },
      { latitude: pt1.lat, longitude: pt1.lon },
      1, 1
    );

    const distToDropoff = geolib.getDistance(
      // { latitude: need.pickup_latitude, longitude: need.pickup_longitude },
      { latitude: pt1.lat, longitude: pt1.lon },
      // { latitude: need.dropoff_latitude, longitude: need.dropoff_longitude },
      { latitude: pt2.lat, longitude: pt2.lon },
      1, 1
    );

    const totalDist = distToPickup + distToDropoff;

    const bidInfo = {
      price: `${totalDist / DRONE_PRICE_RATE}`,
      price_type: 'flat',
      price_description: 'Flat fee',
      time_to_pickup: (distToPickup / DRONE_AVG_VELOCITY) + 1,
      time_to_dropoff: (distToDropoff / DRONE_AVG_VELOCITY) + 1,
      drone_manufacturer: 'Copter Express',
      drone_model: 'SITL',
      ttl: 120 // TTL in seconds
    };

    console.log(`created bid ${need.id}`);
    const bid = drone.sdk.bid().forNeed(need.id, bidInfo);
    bid.subscribe(
      (bid) => this.onBidAccepted(drone, bid),
      () => console.log('Bid completed'),
      err => console.log(err)
    );
  }

  onBidAccepted(drone, bid) {
    if (drone.bids.includes(bid.id)) {
      return;
    }
    drone.bids.push(bid.id);
    //In case when mission starts when bid accepted
    // this.beginMission(bid.vehicle_id, mission_id);
  }

  onContractCreated(drone, mission) {
    this.beginMission(mission.vehicle_id, mission.mission_id);
  }
}

module.exports = new CoExDrone();  