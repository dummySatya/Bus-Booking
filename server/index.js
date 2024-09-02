import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ********** GLOBAL VARIABLES (from a DB maybe) **********

let seatStatus = {}; //={busNumber:{seatNumber:{stat:"locked"/"booked",uname:"username"}}}
let userStatus = {}; //={username:[{busNumber:'bno',seatNumber:sno,bookingStatus:'booked'/'locked'},{},{}...]}
let timers = {}; //={busNumber:{seatNumber:TimerObject}} for storing the setTimeouts
let buses = []; //=[{ busNumber: 'bno', rows: r, cols: c },{},{}...]
let busCheck = {}; //={busNumber:true/false} for checking if the bus is available, if not available, when a new bus is released it automatically takes the next unavailable busNo,
let busBookings = {}; //={busNumber:{ seats: no of seats, load: loadFactor }}
let mergerFlag = false; // to maintain whether merger is being done or not
let totalBuses = 10;
let rows = 15;
let cols = 2;
let visits=0;

// Adding buses
for (let i = 1; i <= totalBuses; i++) {
  buses.push({
    busNumber: `${i}`,
    rows: rows,
    cols: cols,
  });
  busCheck[`${i}`] = true;
}

// ********** HELPER FUNCTIONS **********

// File based Logging using Buffered Queue
const __fileName = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__fileName);

const logFilePath = path.join(__dirname, "archive.log");
const loggerQueue = [];

const logIntoFile = () => {
  if (loggerQueue.length == 0) return;
  const logMsg = loggerQueue.join("");
  loggerQueue.length = 0;
  fs.appendFile(logFilePath, logMsg, (err) => {
    if (err) {
      console.log("Failed to write log:", err);
    }
  });
};

setInterval(logIntoFile, 3000);

const log = (message) => {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} - ${message}\n`;
  loggerQueue.push(logMessage);
};

// Calculating the load factor
const loadFactor = (seats) => {
  return seats / (rows * cols);
};

// To check the load and add buses
const checkLoad = () => {
  let loader = 0;
  for (let busNo in busBookings) {
    if (busBookings[busNo].load >= 0.8) {
      loader++;
    }
  }
  if (loader == totalBuses) {
    totalBuses += 2;
    let limit = 2;
    for (let i = 0; limit > 0 && i < buses.length; i++) {
      if (buses[i].busNumber === `${i + 1}`) {
        continue;
      } else {
        buses.push({
          busNumber: `${i + 1}`,
          rows: rows,
          cols: cols,
        });
        busCheck[`${i + 1}`] = true;
        limit--;
        buses.sort();
      }
    }
    while (limit > 0) {
      buses.push({
        busNumber: `${buses.length + 1}`,
        rows: rows,
        cols: cols,
      });
      busCheck[`${buses.length}`] = true;
      limit--;
    }
    log("Buses added and updated");
    return true;
  }
  return false;
};

// To check whether the seats of bus1 and bus2 are not conflicting
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

// To merge bus2 into bus1
const merge = (bus1, bus2) => {
  const bus2Stats = seatStatus[bus2];
  const userVisited = {};
  for (let seat in bus2Stats) {
    seatStatus[bus1][seat] = bus2Stats[seat];
    const seater = seatStatus[bus1][seat];
    const user = seater.uname;
    if (!userVisited[user]) {
      userVisited[user] = true;
      for (let i = 0; i < userStatus[user].length; i++) {
        if (userStatus[user][i].busNumber == bus2) {
          userStatus[user][i].busNumber = bus1;
        }
      }
    }
  }

  busBookings[bus1].seats += busBookings[bus2].seats;
  busBookings[bus1].load = loadFactor(busBookings[bus1].seats);

  if (
    delete seatStatus[bus2] &&
    delete busBookings[bus2] &&
    delete busCheck[bus2]
  ) {
    for (let i = 0; i < buses.length; i++) {
      if (buses[i].busNumber == bus2) {
        buses.splice(i, 1);
        break;
      }
    }
    totalBuses--;
    log(`Merged ${bus2} into ${bus1}`);
    return true;
  }
  return false;
};

// To check for possible mergers in available buses
const mergers = () => {
  log("Checking for possible mergers");
  let possibleBus = [];
  for (let busNo in busBookings) {
    if (busBookings[busNo].load <= 0.2) {
      possibleBus.push({ busNo: busNo, seatStatus: seatStatus[busNo] });
    }
  }
  let possibleMergers = {};
  let bookings = [];
  for (let i = 0; i < possibleBus.length; i++) {
    const bus = possibleBus[i];
    const busNo = bus.busNo;
    const possibleSeatStatus = bus.seatStatus;
    let seats = []; //contains only the booked seats
    for (let seat in possibleSeatStatus) {
      if (possibleSeatStatus[seat]["stat"] === "booked") {
        seats.push(seat);
      }
    }
    seats.sort(); //to make the bookingCheck process with two pointers
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

// ********** SERVER SETUP **********

// Server using Express.js
const app = express();
app.use(cors());
const server = createServer(app);

// Creating new instance of socket.io server using HTTP server
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

app.get("/", (req, res) => {
  res.send("Server on");
});

// ********** SOCKET EVENTS **********

// Incoming connections and socket handling
io.on("connection", (socket) => {
  console.log("Client Connected", socket.id);
  log("Client Connected");
  socket.emit("seatStatus", seatStatus);
  log("Emitted Seat Status on first load");

  // To cancel the booked seats
  socket.on("cancelBooking", (data) => {
    const bno = data.bno;
    const sno = data.sno;
    const username = data.uname;
    log(
      `Cancel Booking Started for User: ${username} BusNo: ${bno} SeatNo: ${sno}`
    );
    for (
      let j = 0;
      userStatus[username] && j < userStatus[username].length;
      j++
    ) {
      if (
        userStatus[username][j]["busNumber"] === bno &&
        userStatus[username][j]["seatNumber"] === sno &&
        userStatus[username][j]["bookingStatus"] === "booked"
      ) {
        userStatus[username].splice(j, 1);
        busBookings[bno].seats--;
        const load = loadFactor(busBookings[bno].seats);
        busBookings[bno].load = load;
        break;
      }
    }
    if (seatStatus[bno] && seatStatus[bno][sno]) {
      delete seatStatus[bno][sno];
    }
    log(
      `Cancel Booking Completed for User: ${username} BusNo: ${bno} SeatNo: ${sno}`
    );
    io.emit("seatStatus", seatStatus);
    log("Emitted Seat Status after Cancel");
    io.emit("userStatus", { uname: username, ustat: userStatus[username] });
    log("Emitted User Status after Cancel");
    if (checkLoad() && totalBuses <= 100) {
      io.emit("busStats", buses);
      log("Emitted Bus Stats after bus addition");
    }
  });

  // To free up the locked seats
  socket.on("freeBooking", (data) => {
    const bno = data.bno;
    const sno = data.sno;
    const username = data.uname;
    log(`Free Booking started for BusNo: ${bno} SeatNo: ${sno}`);
    for (
      let j = 0;
      userStatus[username] && j < userStatus[username].length;
      j++
    ) {
      if (
        userStatus[username][j]["busNumber"] === bno &&
        userStatus[username][j]["seatNumber"] === sno
      ) {
        userStatus[username].splice(j, 1);
        break;
      }
    }
    if (seatStatus[bno] && seatStatus[bno][sno]) delete seatStatus[bno][sno];
    log(`Free Booking completed for BusNo: ${bno} SeatNo: ${sno}`);
    io.emit("seatStatus", seatStatus);
    log("Emitted Seat Status after Free Seat");
    io.emit("userStatus", { uname: username, ustat: userStatus[username] });
    log("Emitted User Status after Free Seat");
  });

  // To book a seat
  socket.on("bookSeat", (data) => {
    const userStatusSoc = data.stat;
    const username = data.uname;
    for (let i = 0; userStatusSoc && i < userStatusSoc.length; i++) {
      let bno = userStatusSoc[i]["busNumber"];
      let sno = userStatusSoc[i]["seatNumber"];
      log(
        `Book Seat started for User: ${username} BusNo: ${bno} SeatNo: ${sno}`
      );
      for (let j = 0; userStatus[username] && j < userStatus[username].length; j++) {
        if (
          userStatus[username][j]["busNumber"] === bno &&
          userStatus[username][j]["seatNumber"] === sno &&
          userStatus[username][j]["bookingStatus"] === "locked"
        ) {
          userStatus[username][j]["bookingStatus"] = "booked";
          if (!busBookings[bno]) {
            busBookings[bno] = {};
            busBookings[bno].seats = 0;
            busBookings[bno].load = 0;
          }
          delete timers[bno][sno];
          busBookings[bno].seats++;
          busBookings[bno].load = loadFactor(busBookings[bno].seats);
          break;
        }
      }
      if(!seatStatus[bno]) seatStatus[bno]={};
      seatStatus[bno][sno] = { stat: "booked", uname: username, timer: null };
      log(
        `Book Seat completed for User: ${username} BusNo: ${bno} SeatNo: ${sno}`
      );
    }
    io.emit("seatStatus", seatStatus);
    log("Emitting Seat Status after Book Seat");
    io.emit("userStatus", { uname: username, ustat: userStatus[username] });
    log("Emitting User Status after Book Seat");
    if (checkLoad() && totalBuses <= 100) {
      io.emit("busStats", buses);
      log("Emitted Bus Stats after bus addition");
    }
  });

  // To lock a seat
  socket.on("lockSeat", (username, busNumber, seatNumber) => {
    log(
      `Lock Seat started for User: ${username} BusNo: ${busNumber} SeatNo: ${seatNumber}`
    );
    if (!busCheck[busNumber]) return false;
    if (!seatStatus[busNumber]) {
      seatStatus[busNumber] = {};
    }

    if (
      seatStatus[busNumber][seatNumber] &&
      seatStatus[busNumber][seatNumber].stat === "locked"
    ) {
      return;
    }

    seatStatus[busNumber][seatNumber] = { stat: "locked", uname: username };

    if (timers[busNumber] && timers[busNumber][seatNumber]) {
      clearTimeout(timers[busNumber][seatNumber]);
    }

    timers[busNumber] = timers[busNumber] || {};
    timers[busNumber][seatNumber] = setTimeout(() => {
      if (
        busCheck[busNumber] &&
        seatStatus[busNumber][seatNumber] &&
        seatStatus[busNumber][seatNumber].stat === "locked"
      ) {
        // To release the seat
        io.emit("triggerFree", {
          bno: busNumber,
          sno: seatNumber,
          uname: username,
        });
      }
      delete timers[busNumber][seatNumber];
      log(
        `Emitting Release Seat for BusNo: ${busNumber} SeatNo: ${seatNumber}`
      );
    }, 10 * 1000);

    const detail = { busNumber, seatNumber, bookingStatus: "locked" };
    if (!userStatus[username]) {
      userStatus[username] = [];
    }
    userStatus[username].push(detail);
    log(
      `Lock Seat completed for User: ${username} BusNo: ${busNumber} SeatNo: ${seatNumber}`
    );
    io.emit("seatStatus", seatStatus);
    log("Emitting Seat Status after Lock Seat");
    io.emit("userStatus", { uname: username, ustat: userStatus[username] });
    log("Emitting User Status after Lock Seat");
  });

  // When the client request for updated seat stats (on startups)
  socket.on("reqSeatStat", (username) => {
    log("Seat Status Requested");
    socket.emit("busStats", buses);
    log("Emitting Bus Stats after Request Seat Stat");
    socket.emit("seatStatus", seatStatus);
    log("Emitting Seat Stats after Request Seat Stat");
    socket.emit("busesAvailable", busCheck);
    log("Emitting Buses Available after Request Seat Stat");
    socket.emit("userStatus", { uname: username, ustat: userStatus[username] });
    log("Emitting User Stats after Request Seat Stat");
  });

  // To show the initial status of merger, where admin has turned on merger mode or not
  socket.on("initialStatus", () => {
    log("Initial Status of Merger: " + mergerFlag);
    if (mergerFlag) {
      io.emit("mergerOn");
    } else {
      io.emit("mergerOff");
    }
  });

  // To start the merging of, frontend needs to show altercation in process
  socket.on("mergeStart", () => {
    mergerFlag = true;
    const possibleBus = mergers();
    io.emit("mergerOn", possibleBus);
    log("Entering Merger");
  });

  // To merger two buses
  socket.on("merge", (data) => {
    const bus1 = data.bus1;
    const bus2 = data.bus2;
    log(`Merger Request for ${bus1} and ${bus2}`);
    const mergerStatus = merge(bus1, bus2);
    if (mergerStatus) {
      io.emit("busesAvailable", busCheck);
      io.emit("busStats", buses);
      const possibleBus = mergers();
      io.emit("mergerOn", possibleBus);
    }
    log("Merger Request Handled");
  });
  // To end the merging of, frontend needs to show buses
  socket.on("mergeFinished", () => {
    mergerFlag = false;
    io.emit("mergerOff");
    log("Exiting Merger");
  });

  // On disconnect
  socket.on("disconnect", () => {
    visits++;
    console.log("User left");
    log("Client Left");
  });
});

const port = 8000;
server.listen(port, () => {
  console.log("Server running on " + port);
});
