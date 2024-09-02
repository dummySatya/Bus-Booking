import cluster from "cluster";
import os from "os";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

if (cluster.isMaster) {
  const numCPUs = os.cpus().length;
  console.log(`Master process is running. Forking ${numCPUs} workers...`);

  // Global state managed by the master process
  let globalState = {
    seatStatus: {},
    userStatus: {},
    timers: {},
    buses: [],
    busCheck: {},
    busBookings: {},
    totalBuses: 3,
    rows: 5,
    cols: 1,
    mergerFlag: false,
  };

  // Initialize the buses
  for (let i = 1; i <= globalState.totalBuses; i++) {
    globalState.buses.push({
      busNumber: `${i}`,
      rows: globalState.rows,
      cols: globalState.cols,
    });
    globalState.busCheck[`${i}`] = true;
  }

  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    const worker = cluster.fork();

    // Send the initial global state to the worker
    worker.send({ type: "stateUpdate", state: globalState });
  }

  // Listen for messages from workers
  for (const id in cluster.workers) {
    cluster.workers[id].on("message", (msg) => {
      if (msg.type === "updateState") {
        // Update global state
        globalState = { ...globalState, ...msg.state };

        // Broadcast the updated state to all workers
        for (const id in cluster.workers) {
          cluster.workers[id].send({ type: "stateUpdate", state: globalState });
        }
      }
    });
  }

  cluster.on("exit", (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died. Forking a new one...`);
    const newWorker = cluster.fork();
    newWorker.send({ type: "stateUpdate", state: globalState });
  });

} else {
  // Worker processes will run the server code
  const app = express();
  app.use(cors());

  const server = createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "*",
    },
  });

  // Local state in each worker (initially empty)
  let localState = {
    seatStatus: {},
    userStatus: {},
    timers: {},
    buses: [],
    busCheck: {},
    busBookings: {},
    totalBuses: 3,
    rows: 5,
    cols: 1,
    mergerFlag: false,
  };

  // Handle incoming messages from the master process
  process.on("message", (msg) => {
    if (msg.type === "stateUpdate") {
      localState = msg.state;
    }
  });

  const loadFactor = (seats) => {
    return seats / (localState.rows * localState.cols);
  };

  const checkLoad = () => {
    let loader = 0;
    for (let busNo in localState.busBookings) {
      if (localState.busBookings[busNo].load >= 0.8) {
        loader++;
      }
    }
    if (loader == localState.totalBuses) {
      localState.totalBuses += 2;
      let limit = 2;
      for (let i = 0; limit > 0 && i < localState.buses.length; i++) {
        if (localState.buses[i].busNumber === `${i + 1}`) {
          continue;
        } else {
          localState.buses.push({
            busNumber: `${i + 1}`,
            rows: localState.rows,
            cols: localState.cols,
          });
          localState.busCheck[`${i + 1}`] = true;
          limit--;
          localState.buses.sort();
        }
      }
      while (limit > 0) {
        localState.buses.push({
          busNumber: `${localState.buses.length + 1}`,
          rows: localState.rows,
          cols: localState.cols,
        });
        localState.busCheck[`${localState.buses.length}`] = true;
        limit--;
      }
      updateGlobalState();
      return true;
    }
    return false;
  };

  const updateGlobalState = () => {
    process.send({ type: "updateState", state: localState });
  };

  const bookingsCheck = (bookArr1, bookArr2) => {
    let i = 0,
      j = 0,
      n1 = bookArr1.length,
      n2 = bookArr2.length;
    while (i < n1 && j < n2) {
      if (bookArr1[i] < bookArr2[j]) {
        i++;
      } else if (bookArr1[i] > bookArr2[j]) {
        j++;
      } else {
        return false;
      }
    }
    return true;
  };

  const merge = (bus1, bus2) => {
    const bus2Stats = localState.seatStatus[bus2];
    const userVisited = {};
    for (let seat in bus2Stats) {
      localState.seatStatus[bus1][seat] = bus2Stats[seat];
      const seater = localState.seatStatus[bus1][seat];
      const user = seater.uname;
      if (!userVisited[user]) {
        userVisited[user] = true;
        for (let i = 0; i < localState.userStatus[user].length; i++) {
          if (localState.userStatus[user][i].busNumber == bus2) {
            localState.userStatus[user][i].busNumber = bus1;
          }
        }
      }
    }

    localState.busBookings[bus1].seats += localState.busBookings[bus2].seats;
    localState.busBookings[bus1].load = loadFactor(localState.busBookings[bus1].seats);
    delete localState.seatStatus[bus2];
    delete localState.busBookings[bus2];
    delete localState.busCheck[bus2];

    for (let i = 0; i < localState.buses.length; i++) {
      if (localState.buses[i].busNumber == bus2) {
        localState.buses.splice(i, 1);
        break;
      }
    }
    localState.totalBuses--;
    updateGlobalState();
    return true;
  };

  const mergers = () => {
    let possibleBus = [];
    for (let busNo in localState.busBookings) {
      if (localState.busBookings[busNo].load <= 0.2) {
        possibleBus.push({ busNo: busNo, seatStatus: localState.seatStatus[busNo] });
      }
    }

    let possibleMergers = {};
    let bookings = [];
    for (let i = 0; i < possibleBus.length; i++) {
      const bus = possibleBus[i];
      const busNo = bus.busNo;
      const possibleSeatStatus = bus.seatStatus;
      let seats = [];
      for (let seat in possibleSeatStatus) {
        if (possibleSeatStatus[seat]["stat"] === "booked") {
          seats.push(seat);
        }
      }
      seats.sort();
      const bookedSeats = { busNo: busNo, seats: seats };
      bookings.push(bookedSeats);
    }

    const bookingsCount = bookings.length;
    for (let i = 0; i < bookingsCount; i++) {
      for (let j = i + 1; j < bookingsCount; j++) {
        if (bookingsCheck(bookings[i].seats, bookings[j].seats)) {
          if (!possibleMergers[bookings[i].busNo]) {
            possibleMergers[bookings[i].busNo] = [];
          }
          possibleMergers[bookings[i].busNo].push(bookings[j].busNo);
        }
      }
    }
    return possibleMergers;
  };

  io.on("connection", (socket) => {
    console.log("Client Connected");
    socket.emit("seatStatus", localState.seatStatus);

    socket.on("cancelBooking", (data) => {
      const bno = data.bno;
      const sno = data.sno;
      const username = data.uname;

      for (
        let j = 0;
        localState.userStatus[username] && j < localState.userStatus[username].length;
        j++
      ) {
        if (
          localState.userStatus[username][j]["busNumber"] === bno &&
          localState.userStatus[username][j]["seatNumber"] === sno &&
          localState.userStatus[username][j]["bookingStatus"] === "booked"
        ) {
          localState.userStatus[username].splice(j, 1);
          localState.busBookings[bno].seats--;
          const load = loadFactor(localState.busBookings[bno].seats);
          localState.busBookings[bno].load = load;
          break;
        }
      }
      if (localState.seatStatus[bno] && localState.seatStatus[bno][sno]) {
        delete localState.seatStatus[bno][sno];
      }
      updateGlobalState();
      io.emit("seatStatus", localState.seatStatus);
      io.emit("userStatus", { uname: username, ustat: localState.userStatus[username] });
    });

    socket.on("bookSeat", (data) => {
      const username = data.uname;
      const busNumber = data.bno;
      const seatNumber = data.sno;

      if (!localState.seatStatus[busNumber]) {
        localState.seatStatus[busNumber] = {};
      }
      localState.seatStatus[busNumber][seatNumber] = {
        stat: "booked",
        uname: username,
      };

      if (!localState.userStatus[username]) {
        localState.userStatus[username] = [];
      }
      localState.userStatus[username].push({
        busNumber: busNumber,
        seatNumber: seatNumber,
        bookingStatus: "booked",
      });

      if (!localState.busBookings[busNumber]) {
        localState.busBookings[busNumber] = {
          seats: 0,
          load: 0.0,
        };
      }
      localState.busBookings[busNumber].seats++;
      localState.busBookings[busNumber].load = loadFactor(localState.busBookings[busNumber].seats);
      checkLoad();
      updateGlobalState();
      io.emit("seatStatus", localState.seatStatus);
      io.emit("userStatus", { uname: username, ustat: localState.userStatus[username] });

      if (localState.mergerFlag) {
        const mergerBuses = mergers();
        for (let busNo in mergerBuses) {
          if (mergerBuses[busNo].length > 0) {
            for (let i = 0; i < mergerBuses[busNo].length; i++) {
              if (localState.busCheck[busNo] && localState.busCheck[mergerBuses[busNo][i]]) {
                localState.busCheck[busNo] = localState.busCheck[mergerBuses[busNo][i]] = false;
                merge(busNo, mergerBuses[busNo][i]);
                break;
              }
            }
          }
        }
      }
    });

    socket.on("lockSeat", (data) => {
      const busNumber = data.bno;
      const seatNumber = data.sno;
      const username = data.uname;

      if (!localState.seatStatus[busNumber]) {
        localState.seatStatus[busNumber] = {};
      }
      if (!localState.timers[username]) {
        localState.timers[username] = {};
      }
      localState.seatStatus[busNumber][seatNumber] = {
        stat: "locked",
        uname: username,
      };
      localState.timers[username][seatNumber] = setTimeout(() => {
        if (
          localState.seatStatus[busNumber][seatNumber] &&
          localState.seatStatus[busNumber][seatNumber]["stat"] === "locked"
        ) {
          delete localState.seatStatus[busNumber][seatNumber];
          io.emit("seatStatus", localState.seatStatus);
        }
      }, 300000); // lock for 5 minutes
      updateGlobalState();
      io.emit("seatStatus", localState.seatStatus);
    });

    socket.on("disconnect", () => {
      console.log("Client Disconnected");
    });
  });

  const port = 8000;
  server.listen(port, () => {
    console.log(`Worker ${process.pid} running on port ${port}`);
  });
}
