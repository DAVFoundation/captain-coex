const davJS = require('@davfoundation/dav-js');
const DroneAPI = require('./drone-api');
const geolib = require('geolib');
const getElevations = require('./elevation');

const DRONE_AVG_VELOCITY = 10.0; // m/s
const DRONE_PRICE_RATE = 10 / 1000; // DAV/m
const DRONE_CRUISE_ALT = 1000;

const pt1 = { lat: 47.397669, lon: 8.5444809 };
const pt2 = { lat: 47.3982004, lon: 8.5448531 };

process.env['MISSION_CONTROL_URL'] = 'http://localhost:8888';
process.env['NOTIFICATION_URL'] = 'https://9991eaca.ngrok.io'; // I used ngrok to point this to localhost:7000, I was having issues making requests to localhost from docker

async function init_sitl() {
  const droneApi = new DroneAPI();
  const drones = await droneApi.listDrones();
  const sitl = drones.find(drone => drone.description.match(/\bSITL\b/));
  let state = await droneApi.getState(sitl.id);

  // console.log(state);

  const dav = new davJS('12345');

  const droneDelivery = dav.needs().forType('drone_delivery', {
    longitude: state.location.lon,
    latitude: state.location.lat,
    radius: 10e10,
    ttl: 120 // TTL in seconds
  });

  /*   setInterval(() => {
      state = await droneApi.getState(sitl.id);
      droneDelivery.update({
        longitude: state.location.lon,
        latitude: state.location.lat,
        radius: 10000,
        ttl: 120 // TTL in seconds
      })
    }, 10000); */

  // console.log(JSON.stringify(state));

  droneDelivery.subscribe(
    need => onNeed(need),
    err => console.log(err),
    () => console.log('')
  );

  function onNeed(need) {
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
      ttl: 120 // TTL in seconds
    };

    console.log(`created bid ${need.id}`);
    const bid = dav.bid().forNeed(need.id, bidInfo);
    bid.subscribe(
      () => onBidAccepted(bid),
      () => console.log('Bid completed'),
      err => console.log(err)
    );
  }

  function onBidAccepted(bid) {
    // console.log(bid);
    const contract = dav.contract().forBid(bid.id, {
      id: '0x98782738712387623876', // Ethereum Smart Contract
      ttl: 120 // TTL in seconds
    });
    contract.subscribe(
      (contractUpdate) => onContractUpdated(contract, contractUpdate),
      () => console.log('Contract completed'),
      err => console.log(err)
    );
  }

  function onContractUpdated(contract, contractUpdate) {
    // console.log(contract);
    switch (contractUpdate.state) {
      case 'signed':
        beginMission(contract);
        break;
      case 'fullfilled':
        console.log('We got some money! Hurray!');
        break;
    }
  }

  function beginMission(contract) {
    const mission = dav.mission().begin(contract.id, {
      id: '0x98782738712387623876', // Etherum Smart Contract
      ttl: 120 // TTL in seconds
    });
    mission.subscribe(
      (missionUpdate) => onMissionUpdated(mission, missionUpdate),
      () => console.log('Mission completed'),
      err => console.log(err)
    );
  }

  async function onMissionUpdated(mission, missionUpdate) {
    const [pickupAlt, dropoffAlt] = await getElevations([mission.pickup, mission.dropoff]);
    switch (missionUpdate.state) {
      case 'started':
        droneApi.goto(sitl.id,
          mission.pickup.lat, mission.pickup.lng,
          DRONE_CRUISE_ALT - state.location.alt, pickupAlt - state.location.alt
          , false)
          .then((pos) => {
            mission.update({ state: 'atPickup', lat: pos.lat, lng: pos.lng });
          });
        droneApi.updatesPosition.then(pos => {
          mission.update({ state: 'movingToPickup', lat: pos.lat, lng: pos.lng });
        });
        break;
      case 'packageReady':
        droneApi.goto(sitl.id,
          mission.dropoff.lat, mission.dropoff.lng,
          DRONE_CRUISE_ALT - state.location.alt, dropoffAlt - state.location.alt
          , true)
          .then((pos) => {
            mission.update({ state: 'atDropoff', lat: pos.lat, lng: pos.lng });
          });
        droneApi.updatesPosition.then(pos => {
          mission.update({ state: 'movingToDropoff', lat: pos.lat, lng: pos.lng });
        });
        break;
      case 'done':
        droneApi.standBy();
        break;
    }
  }
}

init_sitl();
