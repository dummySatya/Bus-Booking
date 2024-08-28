import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());
const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

let seatStatus = {};
let userStatus = {};
let timers = {};
let buses = [];
let totalBuses = 3;
let rows = 5;
let cols = 1;
let busCheck={};
for (let i = 1; i <= totalBuses; i++) {
  buses.push({
    busNumber: `${i}`,
    rows: rows,
    cols: cols,
  });
  busCheck[`${i}`]=true;
}
let busBookings = {};
let mergerFlag = false;

const loadFactor = (seats) => {
  return seats / (rows * cols);
};

const checkLoad = () => {
  let loader = 0;
  console.log(busBookings);
  for (let busNo in busBookings) {
    // console.log("BusNO: ",busBookings[busNo]);
    if (busBookings[busNo].load >= 0.8) {
      loader++;
    }
  }
  console.log("Loader: ", loader);
  if (loader == totalBuses) {
    totalBuses += 2;
    let limit = 2;
    for (let i = 0; limit > 0 && i < buses.length; i++) {
      if (buses[i].busNumber === `${i + 1}`) {
        continue;
      } else {
        buses.push({
          busNumber: `${i+1}`,
          rows: rows,
          cols: cols,
        });
        busCheck[`${i+1}`]=true;
        limit--;
        buses.sort();
      }
    }
    while(limit>0){
      buses.push({
        busNumber: `${buses.length+1}`,
        rows: rows,
        cols: cols,
      });
      busCheck[`${buses.length}`]=true;
      limit--;
    }
    console.log("Buses After Sort: ",buses);
    console.log("Bus Check: ",busCheck);
    return true;
  }
  return false;
};
app.get("/", (req, res) => {
  res.send("Server on");
});

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
// merges bus2 into bus1
const merge = (bus1, bus2) => {
  console.log("BEFORE MERGER: ", seatStatus, userStatus,busCheck);
  const bus2Stats = seatStatus[bus2];
  const userVisited = {};
  for (let seat in bus2Stats) {
    seatStatus[bus1][seat] = bus2Stats[seat];
    const seater = seatStatus[bus1][seat];
    console.log("Seater: ", seater);
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
  if (delete seatStatus[bus2] && delete busBookings[bus2] && delete busCheck[bus2]) {
    for (let i = 0; i < buses.length; i++) {
      if (buses[i].busNumber == bus2) {
        buses.splice(i, 1);
        break;
      }
    }
    totalBuses--;
    console.log("AFTER MERGER: ", seatStatus, userStatus,busCheck);
    return true;
  }
  return false;
};

const mergers = () => {
  let possibleBus = [];
  console.log("Meger BusBookings: ", busBookings);
  for (let busNo in busBookings) {
    if (busBookings[busNo].load <= 0.2) {
      possibleBus.push({ busNo: busNo, seatStatus: seatStatus[busNo] });
    }
  }
  console.log("Possible Bus:", possibleBus);
  let possibleMergers = {};
  let bookings = [];
  for (let i = 0; i < possibleBus.length; i++) {
    const bus = possibleBus[i];
    // console.log("Bus: ",bus);
    const busNo = bus.busNo;
    const possibleSeatStatus = bus.seatStatus;
    let seats = []; //contains only the booked seats
    console.log("Possible Seat Status: ", possibleSeatStatus);
    for (let seat in possibleSeatStatus) {
      if (possibleSeatStatus[seat]["stat"] === "booked") {
        seats.push(seat);
      }
    }
    seats.sort();
    console.log("Seats: ", seats);
    const bookedSeats = { busNo: busNo, seats: seats };
    bookings.push(bookedSeats);
  }
  console.log("Bookings: ", bookings);
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
  console.log("Possible Mergers: ", possibleMergers);
  return possibleMergers;
};

io.on("connection", (socket) => {
  console.log("Client Connected");
  socket.emit("seatStatus", seatStatus);

  socket.on("cancelBooking", (data) => {
    console.log("Cancel: ", data);
    const bno = data.bno;
    const sno = data.sno;
    const username = data.uname;
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
    console.log(seatStatus);
    console.log("After Cancelling: ", busBookings);
    io.emit("seatStatus", seatStatus);
    io.emit("userStatus", { uname: username, ustat: userStatus[username] });

    if (checkLoad() && totalBuses <= 100) {
      io.emit("busStats", buses);
    }
  });

  socket.on("freeBooking", (data) => {
    const bno = data.bno;
    const sno = data.sno;
    const username = data.uname;
    console.log("Emitting freeBooking");
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
    io.emit("seatStatus", seatStatus);
    io.emit("userStatus", { uname: username, ustat: userStatus[username] });
  });

  socket.on("bookSeat", (data) => {
    const userStatusSoc = data.stat;
    const username = data.uname;
    for (let i = 0; i < userStatusSoc.length; i++) {
      let bno = userStatusSoc[i]["busNumber"];
      let sno = userStatusSoc[i]["seatNumber"];
      for (let j = 0; j < userStatus[username].length; j++) {
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
      seatStatus[bno][sno] = { stat: "booked", uname: username, timer: null };
    }
    console.log("User Stats: ", userStatus);
    io.emit("seatStatus", seatStatus);
    io.emit("userStatus", { uname: username, ustat: userStatus[username] });
    if (checkLoad() && totalBuses <= 100) {
      console.log("Emiting");
      io.emit("busStats", buses);
    }
  });

  socket.on("lockSeat", (username, busNumber, seatNumber) => {
    if(!busCheck[busNumber]) return false;
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
        busCheck[busNumber] && seatStatus[busNumber][seatNumber] &&
        seatStatus[busNumber][seatNumber].stat === "locked"
      ) {
        console.log("Releasing seat");
        io.emit("triggerFree", {
          bno: busNumber,
          sno: seatNumber,
          uname: username,
        });
      }
      delete timers[busNumber][seatNumber];
    }, 10 * 1000);

    const sanitizedSeatStatus = JSON.parse(
      JSON.stringify(seatStatus, (key, value) => {
        if (key === "timer") {
          return undefined;
        }
        return value;
      })
    );

    console.log(JSON.stringify(sanitizedSeatStatus));

    const detail = { busNumber, seatNumber, bookingStatus: "locked" };
    if (!userStatus[username]) {
      userStatus[username] = [];
    }
    userStatus[username].push(detail);

    io.emit("seatStatus", sanitizedSeatStatus);
    io.emit("userStatus", { uname: username, ustat: userStatus[username] });
  });

  socket.on("reqSeatStat", (username) => {
    console.log("Name ", username);
    socket.emit("busStats", buses);
    socket.emit("seatStatus", seatStatus);
    socket.emit("busesAvailable",busCheck);
    socket.emit("userStatus", { uname: username, ustat: userStatus[username] });
  });

  socket.on("merge", (data) => {
    const bus1 = data.bus1;
    const bus2 = data.bus2;
    const mergerStatus = merge(bus1, bus2);
    if (mergerStatus) {
      io.emit("busesAvailable",busCheck);
      io.emit("busStats", buses);
      const possibleBus = mergers();
      io.emit("mergerOn", possibleBus);
    }
  });

  socket.on("mergeStart", () => {
    mergerFlag = true;
    const possibleBus = mergers();
    io.emit("mergerOn", possibleBus);
    console.log("Entered Merger");
  });
  socket.on("mergeFinished", () => {
    mergerFlag = false;
    io.emit("mergerOff");
    console.log("Merger Finished");
  });
  socket.on("initialStatus", () => {
    if (mergerFlag) {
      io.emit("mergerOn");
    } else {
      io.emit("mergerOff");
    }
  });
  socket.on("disconnect", () => {
    console.log("User left");
  });
});

const port = 8000;
server.listen(port, () => {
  console.log("Server running on " + port);
});
