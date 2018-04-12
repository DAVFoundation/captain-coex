const axios = require('axios');
const ELEVATION_API_KEY = process.env.ELEVATION_API_KEY || 'AIzaSyBzNsELkqXiZBlMzEB68rX_JwY5Q9CtPys'
const ELEVATION_API_URL = 'https://maps.googleapis.com/maps/api/elevation/json';


module.exports = async (locations = []) => {
  /* TODO - query by batches of 512 locations */
  const base_url = 'https://maps.googleapis.com/maps/api/elevation/json';
  let params = {
    locations: locations.map((location) => {
      return location.lat + ',' + location.long;
    }).join('|'),
    key: ELEVATION_API_KEY
  };
  let query = Object.keys(params).map(key => `${key}=${params[key]}`).join('&');

  return axios.get(base_url + '?' + query, {json: true}).then((res) => {
    if (res.status != 200) {
      throw new Error('Error in request to Google Elevation API. Status:' + res.status + '. Message: ' + res.data.error_message);
    }
    return res.data.results.map((elevation_data) => {
      return {
        coord: {lat: elevation_data.location.lat, long: elevation_data.location.lng},
        elevation: elevation_data.elevation
      };
    });
  });
};
