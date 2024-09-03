import io from 'socket.io-client';
import {faker} from "@faker-js/faker";

const SOCKET_URL = 'http://localhost:8000';
const NUM_CLIENTS = 100;
const EVENTS_PER_CLIENT = 20;
const BUS_COUNT = 3;
const SEAT_COUNT = 20;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const simulateUserActions = (username) => {
  const busNumber = faker.number.int({ min: 1, max: BUS_COUNT }).toString();
  const seatNumber = faker.number.int({ min: 1, max: SEAT_COUNT }).toString();
  const actions = ['lockSeat', 'bookSeat', 'cancelBooking'];

  return Array.from({ length: EVENTS_PER_CLIENT }, () => ({
    action: actions[faker.number.int({ min: 0, max: actions.length - 1 })],
    busNumber,
    seatNumber,
    username
  }));
};

const manageClient = (username) => {
  const socket = io(SOCKET_URL, { transports: ['websocket'] });

  socket.on('connect', async () => {
    console.log(`${username} connected`);

    // Request initial seat status
    socket.emit('reqSeatStat', username);

    // Simulate user actions
    const actions = simulateUserActions(username);

    for (const { action, busNumber, seatNumber } of actions) {
      await delay(Math.random() * 500); // Random delay between events

      if (action === 'lockSeat') {
        socket.emit('lockSeat', username, busNumber, seatNumber);
        console.log(`${username} locked seat ${seatNumber} on bus ${busNumber}`);
      } else if (action === 'bookSeat') {
        socket.emit('bookSeat', {
          uname: username,
          stat: [{ busNumber, seatNumber }]
        });
        console.log(`${username} booked seat ${seatNumber} on bus ${busNumber}`);
      } else if (action === 'cancelBooking') {
        socket.emit('cancelBooking', { bno: busNumber, sno: seatNumber, uname: username });
        console.log(`${username} cancelled booking for seat ${seatNumber} on bus ${busNumber}`);
      }
    }

    await delay(2000); 
    socket.disconnect();
    console.log(`${username} disconnected`);
  });

  socket.on('seatStatus', (status) => console.log(`${username} received seat status`));
  socket.on('userStatus', (status) => console.log(`${username} received user status`));
  socket.on('busStats', (stats) => console.log(`${username} received bus stats`));
  socket.on('mergerOn', (data) => console.log(`${username} received merger on`));
  socket.on('mergerOff', () => console.log(`${username} received merger off`));
  socket.on('triggerFree', (data) => console.log(`${username} received trigger free`));
};

// Function to start clients periodically
const startLoadTest = async () => {
  for (let i = 0; i < NUM_CLIENTS; i++) {
    const username = `user${i}`;
    manageClient(username);
    await delay(2000); // Create a new client every 2 seconds
  }
};

startLoadTest().then(() => {
  console.log('Load test started');
}).catch(err => {
  console.error('Error in load test:', err);
});
