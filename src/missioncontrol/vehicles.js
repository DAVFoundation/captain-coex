const axios = require('axios');

const MISSION_CONTROL_URL = process.env.MISSION_CONTROL_URL || 'http://localhost:8888';

const getVehicle = async (vehicleId) => {
  return axios
    .get(`${MISSION_CONTROL_URL}/vehicles/${vehicleId}`)
    .then(response => response.data)
    .catch(err => console.log(err));
};

const addNewVehicle = async (vehicle) => {
  return axios
    .post(`${MISSION_CONTROL_URL}/vehicles`, vehicle)
    .then(response => response.data)
    .catch(err => console.log(err));
};

const updateVehicle = async (vehicle) => {
  return axios
    .put(`${MISSION_CONTROL_URL}/vehicles/${vehicle.id}`, vehicle)
    .then(response => {
      return response.data
    })
    .catch(err => {
      console.log(err);
    });
};

const updateVehicleStatus = () => {};

module.exports = {
  getVehicle,
  addNewVehicle,
  updateVehicle,
  updateVehicleStatus
};