const axios = require('axios');

/*

curl -H "X-Token:6049a4c4ebe54b769b11f6c9f5b57e5e" https://hub.copterexpress.com/api/drones/list

*/

const API_ROOT = 'https://hub.copterexpress.com/api';
const DAV_API_KEY = '6049a4c4ebe54b769b11f6c9f5b57e5e';
const API_HEADERS = {
  'X-Token': DAV_API_KEY
};

module.exports =
  class DroneAPI {
    listDrones() {
      return axios.get(`${API_ROOT}/drones/list`, {
        headers: API_HEADERS
      })
        .then(res => res.data);
    }

    getState(id) {
      return axios.get(`${API_ROOT}/drones/${id}/state`, {
        headers: API_HEADERS
      })
        .then(res => res.data.state);
    }

    goto(id, lat, lng, cruiseAlt, landAlt, release = false) {
      return axios.post(`${API_ROOT}/drones/${id}/command`, {
        headers: API_HEADERS,
        params: {
          'command': 'run_mission',
          'params': {
            'type': 'Delivery',
            'locations': [{
              lat: lat,
              lon: lon,
              altitude_offset: landAlt,
              release_cargo: release
            }],
            'altitude': cruiseAlt
          }
        }
      })
        .then(res => res.data);
    }
  };
