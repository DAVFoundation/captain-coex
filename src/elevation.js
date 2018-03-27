const axios = require('axios');
const ELEVATION_API_KEY = 'AIzaSyBzNsELkqXiZBlMzEB68rX_JwY5Q9CtPys';//process.env.ELEVATION_API_KEY;
const ELEVATION_API_URL = 'https://maps.googleapis.com/maps/api/elevation/json';


module.exports = async (locations = []) => {
  /* TODO - query by batches of 512 locations */
  let params = {
    locations: locations.map((location) => {
      return location.lat + ',' + location.lon;
    }).join('|'),
    key: ELEVATION_API_KEY
  };
  let query = Object.keys(params).map(key => `${key}=${params[key]}`).join('&');

  return axios.get(`${ELEVATION_API_URL}?${query}`, { json: true }).then(res => {
    if (res.statusText != 'OK') {
      throw new Error('Error in request to Google Elevation API. Status:' + res.status + '. Message: ' + res.data.error_message);
    }
    return res.data.results.map((elevation_data) => {
      return {
        lat: elevation_data.location.lat, lon: elevation_data.location.lng, alt: elevation_data.elevation
      };
    });
  }).catch(err => console.log(err));
};
