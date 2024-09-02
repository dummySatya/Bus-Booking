// functions.js

const faker = require('faker');

module.exports = {
  simulateUserActions: () => {
    const busNumber = faker.datatype.number({ min: 1, max: 3 }).toString();
    const seatNumber = faker.datatype.number({ min: 1, max: 10 }).toString();
    const username = faker.internet.userName();
    
    return {
      busNumber: busNumber,
      seatNumber: seatNumber,
      username: username
    };
  }
};
