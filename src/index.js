const { davJS } = require('@davfoundation/dav-js');
const DroneAPI = require('./drone-api');
const geolib = require('geolib');
const getElevations = require('./elevation');

const DRONE_AVG_VELOCITY = 10.0; // m/s
const DRONE_PRICE_RATE = 1e-14 / 1000; // DAV/m
const DRONE_CRUISE_ALT = 1000;

const pt1 = { lat: 47.397669, lon: 8.5444809 };
const pt2 = { lat: 47.3982004, lon: 8.5448531 };

process.env['MISSION_CONTROL_URL'] = 'http://localhost:8888';

async function init_sitl() {
  const droneApi = new DroneAPI();
  const drones = await droneApi.listDrones();
  const sitl = drones.find(drone => drone.description.match(/\bSITL\b/));
  let state = await droneApi.getState(sitl.id);

  // console.log(state);

  const dav = new davJS('0x22d491bde2303f2f43325b2108d26f1eaba1e32b', '0x22d491bde2303f2f43325b2108d26f1eaba1e32b');
  dav.registerSimple().then((res) => {
    console.log('done', res);
  }).catch((err) => {
    console.log('err', err);
  });

  const droneDelivery = dav.needs().forType('drone_delivery', {
    longitude: state.location.lon,
    latitude: state.location.lat,
    radius: 10e10,
    ttl: 120 // TTL in seconds
  });

  droneApi.stateUpdates(sitl.id, 1000).subscribe(async (state) => {
    await droneDelivery.update({
      longitude: state.location.lon,
      latitude: state.location.lat,
      radius: 10e10,
      ttl: 120 // TTL in seconds
    })
  });

  // console.log(JSON.stringify(state));

  droneDelivery.subscribe(
    need => onNeed(need),
    err => console.log(err),
    () => console.log('')
  );

  this.needs = [];
  function onNeed(need) {
    if (this.needs.includes(need.id)) {
      return;
    }
    this.needs.push(need.id);

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
    const bid = dav.bid().forNeed(need.id, bidInfo);
    bid.subscribe(
      (bidid) => onBidAccepted(bidid),
      () => console.log('Bid completed'),
      err => console.log(err)
    );
  }

  this.bids = [];
  function onBidAccepted(bidid) {
    if (this.bids.includes(bidid)) {
      return;
    }
    this.bids.push(bidid);
    beginMission(bidid);
  }

  function beginMission(bidid) {
    const mission = dav.mission().begin(bidid, {
      ttl: 120 // TTL in seconds
    });

    mission.updateState = null;
    updateStream = droneApi.stateUpdates(sitl.id, 1000).subscribe(async (state) => {
      if (mission.updateState) {
        await mission.update({ state: mission.updateState, lat: state.location.lat, lng: state.location.lng });
      }
      if (mission.updateState === 'done') {
        updateStream.unsubscribe();
      }
    });

    mission.subscribe(
      (missionUpdate) => onMissionUpdated(mission, missionUpdate),
      () => console.log('Mission completed'),
      err => console.log(err)
    );
  }

  async function onMissionUpdated(mission, missionUpdate) {
    const [pickupAlt, dropoffAlt] = await getElevations([mission.pickup, mission.dropoff]);
    let updateStream;

    switch (missionUpdate.state) {
      case 'started':
        droneApi.goto(sitl.id,
          mission.pickup.lat, mission.pickup.lng,
          DRONE_CRUISE_ALT - state.location.alt, pickupAlt - state.location.alt
          , false)
          .then((pos) => {
            mission.update({ state: 'atPickup', lat: pos.lat, lng: pos.lng });
          });
        mission.updateState = 'movingToPickup';
        break;
      case 'packageReady':
        droneApi.goto(sitl.id,
          mission.dropoff.lat, mission.dropoff.lng,
          DRONE_CRUISE_ALT - state.location.alt, dropoffAlt - state.location.alt
          , true)
          .then((pos) => {
            mission.update({ state: 'atDropoff', lat: pos.lat, lng: pos.lng });
          });
        mission.updateState = 'movingToDropoff';
        break;
      case 'done':
        mission.updateState = 'done';
        droneApi.standBy();
        break;
    }
  }
}

init_sitl().catch(e => console.log(e));
