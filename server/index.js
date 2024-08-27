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
let buses = 3;
let rows = 5;
let cols = 1;
let busBookings = {};

const loadFactor = (seats) => {
  return seats / (rows * cols);
};

const checkLoad = () => {
  let loader = 0;
  console.log(busBookings);
  for (let busNo in busBookings) {
    // console.log("BusNO: ",busBookings[busNo]);
    if (busBookings[busNo].load > 0.8) {
      loader++;
    }
  }
  console.log("Loader: ", loader);
  if (loader == buses) {
    buses += 2;
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

const mergers = () => {
  let possibleBus = [];
  for (let busNo in busBookings) {
    if (busBookings[busNo].load < 0.2) {
      possibleBus.push({ busNo: busNo, seatStatus: seatStatus[busNo] });
    }
  }
  let possibleMergers = [];
  let bookings = [];
  for (let bus in possibleBus) {
    const busNo = bus.busNo;
    const seatStatus = bus.seatStatus;
    let seats = [];
    for (let seat in seatStatus) {
      if (seatStatus[seat]["stat"] === "booked") {
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
  console.log("Possible Mergers: ",possibleMergers);
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

    if (checkLoad() && buses <= 100) {
      io.emit("busStats", { buses: buses, rows: rows, cols: cols });
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
          busBookings[bno].seats++;
          busBookings[bno].load = loadFactor(busBookings[bno].seats);
          break;
        }
      }
      seatStatus[bno][sno] = { stat: "booked", timer: null };
    }
    console.log("After Booking: ", busBookings);
    io.emit("seatStatus", seatStatus);
    io.emit("userStatus", { uname: username, ustat: userStatus[username] });
    if (checkLoad() && buses <= 100) {
      console.log("Emiting");
      io.emit("busStats", { buses: buses, rows: rows, cols: cols });
    }
    mergers();
  });

  socket.on("lockSeat", (username, busNumber, seatNumber) => {
    if (!seatStatus[busNumber]) {
      seatStatus[busNumber] = {};
    }

    if (
      seatStatus[busNumber][seatNumber] &&
      seatStatus[busNumber][seatNumber].stat === "locked"
    ) {
      return;
    }

    seatStatus[busNumber][seatNumber] = { stat: "locked" };

    if (timers[busNumber] && timers[busNumber][seatNumber]) {
      clearTimeout(timers[busNumber][seatNumber]);
    }

    timers[busNumber] = timers[busNumber] || {};
    timers[busNumber][seatNumber] = setTimeout(() => {
      if (
        seatStatus[busNumber][seatNumber] &&
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
    socket.emit("busStats", { buses: buses, rows: rows, cols: cols });
    socket.emit("seatStatus", seatStatus);
    socket.emit("userStatus", { uname: username, ustat: userStatus[username] });
  });

  socket.on("disconnect", () => {
    console.log("User left");
  });
});

const port = 8000;
server.listen(port, () => {
  console.log("Server running on " + port);
});
