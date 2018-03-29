const DroneAPI = require('./drone-api');
const geolib = require('geolib');
const getElevations = require('./elevation');

const DRONE_AVG_VELOCITY = 10.0; // m/s
const DRONE_PRICE_RATE = 10 / 1000; // DAV/m
let DRONE_CRUISE_ALT = 200;

const mission = {status: 'idle'};
mission.pickup = {lat: 47.3982004, lon: 8.5448531};
mission.dropoff = {lat: 47.397669, lon: 8.5444809};


async function init_sitl() {
  const droneApi = new DroneAPI();
  const drones = await droneApi.listDrones();
  const sitl = drones.find(drone => drone.description.match(/\bSITL\b/));
  let state = await droneApi.getState(sitl.id);

  console.log(state);


  droneApi.stateUpdates(sitl.id, 1000).subscribe(async (drone) => {
    console.log(drone.location);
  });

  const distToPickup = geolib.getDistance(
    {latitude: state.location.lat, longitude: state.location.lon},
    // { latitude: need.pickup_latitude, longitude: need.pickup_longitude },
    {latitude: mission.pickup.lat, longitude: mission.pickup.lon},
    1, 1
  );


  const distToDropoff = geolib.getDistance(
    // { latitude: need.pickup_latitude, longitude: need.pickup_longitude },
    {latitude: mission.dropoff.lat, longitude: mission.dropoff.lon},
    // { latitude: need.dropoff_latitude, longitude: need.dropoff_longitude },
    {latitude: mission.dropoff.lat, longitude: mission.dropoff.lon},
    1, 1
  );

  const totalDist = distToPickup + distToDropoff;

  const [pickupAlt, dropoffAlt] = await getElevations([mission.pickup, mission.dropoff]);

  droneApi.goto(sitl.id,
    mission.pickup.lat, mission.pickup.lon,
    DRONE_CRUISE_ALT, false)
    .then((pos) => {
      console.log(pos);
      console.log("I dey move");
      mission.status = 'movingToPickup';
    }).catch(err => {
    console.log(err);
  });
}

init_sitl();
