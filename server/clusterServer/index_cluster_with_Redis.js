import cluster from "cluster";
import os from "os";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";

if (cluster.isMaster) {
  const numCPUs = os.cpus().length;
  console.log(`Master process is running. Forking ${numCPUs} workers...`);

  // Initialize Redis clients for pub/sub
  const pubClient = createClient({ host: "localhost", port: 6379 });
  const subClient = pubClient.duplicate();

  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    const worker = cluster.fork();

    // Send Redis connection details to each worker
    worker.send({ type: "redisDetails", pubClient, subClient });
  }

  cluster.on("exit", (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died. Forking a new one...`);
    const newWorker = cluster.fork();
    newWorker.send({ type: "redisDetails", pubClient, subClient });
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

  process.on("message", (msg) => {
    if (msg.type === "redisDetails") {
      const pubClient = createClient({ host: "localhost", port: 6379 });
      const subClient = pubClient.duplicate();
      pubClient.connect();
      subClient.connect();

      io.adapter(createAdapter(pubClient, subClient));
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
      io.emit("seatStatus", localState.seatStatus);
      return true;
    }
    return false;
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
    io.emit("seatStatus", localState.seatStatus);
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
        localState.busBookings[busNumber] = {};
        localState.busBookings[busNumber].seats = 1;
        localState.busBookings[busNumber].load = loadFactor(1);
      } else {
        localState.busBookings[busNumber].seats++;
        localState.busBookings[busNumber].load = loadFactor(localState.busBookings[busNumber].seats);
      }

      let flag = checkLoad();
      if (!flag) {
        if (!localState.mergerFlag) {
          localState.mergerFlag = true;
          let possibleMergers = mergers();
          for (let busNo in possibleMergers) {
            const len = possibleMergers[busNo].length;
            for (let i = 0; i < len; i++) {
              merge(busNo, possibleMergers[busNo][i]);
            }
          }
          localState.mergerFlag = false;
        }
      }

      io.emit("seatStatus", localState.seatStatus);
      io.emit("userStatus", { uname: username, ustat: localState.userStatus[username] });
    });

    socket.on("startBooking", (data) => {
      const username = data.uname;
      const busNumber = data.bno;
      const seatNumber = data.sno;

      if (!localState.seatStatus[busNumber]) {
        localState.seatStatus[busNumber] = {};
      }
      localState.seatStatus[busNumber][seatNumber] = {
        stat: "currently being booked",
        uname: username,
      };
      io.emit("seatStatus", localState.seatStatus);
      const timer = setTimeout(() => {
        if (localState.seatStatus[busNumber][seatNumber] && localState.seatStatus[busNumber][seatNumber]["stat"] === "currently being booked") {
          delete localState.seatStatus[busNumber][seatNumber];
          io.emit("seatStatus", localState.seatStatus);
        }
      }, 300000);
      localState.timers[`${busNumber}_${seatNumber}`] = timer;
    });

    socket.on("disconnect", () => {
      console.log("Client Disconnected");
    });
  });

  server.listen(8000, () => {
    console.log(`Worker process ${process.pid} is listening on port 8000`);
  });
}
