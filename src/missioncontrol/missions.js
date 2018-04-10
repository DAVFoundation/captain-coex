const axios = require('axios');

const MISSION_CONTROL_URL = process.env.MISSION_CONTROL_URL || 'http://localhost:8888';

const getMission = async (missionId) => {
  return axios
    .get(`${MISSION_CONTROL_URL}/missions/${missionId}`, {json: true})
    .catch(err => console.log(err));
};

const updateMission = async (missionId, missionUpdate) => {
  return axios
    .put(`${MISSION_CONTROL_URL}/missions/${missionId}`, missionUpdate)
    .catch(err => console.log(err));
};

const createMissionUpdate = () => {};

module.exports = {
  getMission,
  updateMission,
  createMissionUpdate
};