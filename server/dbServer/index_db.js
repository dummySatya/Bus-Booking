// NOTE: CHANGE userStatusSoc in frontend as data.ustat.bookings
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { MongoClient } from "mongodb";

// MongoDB Configuration
const uri = "mongodb://localhost:27017";
const client = new MongoClient(uri);

// Global Variables
let seatStatusCollection,
  userStatusCollection,
  busCheckCollection,
  busesCollection,
  busBookingsCollection;

const initializeMongoDB = async () => {
  try {
    await client.connect();
    const db = client.db("busBooker");

    // Initialize Collections
    seatStatusCollection = db.collection("seatStatus");
    userStatusCollection = db.collection("userStatus");
    busCheckCollection = db.collection("busCheck");
    busBookingsCollection = db.collection("busBookings");
    busesCollection = db.collection("buses");

    console.log("Connected to MongoDB and initialized collections.");

    // Initialize Buses
    await initializeBuses();
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    process.exit(1); // Exit the application if DB connection fails
  }
};
const totalBusesInitial = 3;
const rows = 5;
const cols = 1;
let totalBuses = totalBusesInitial;

const initializeBuses = async () => {
  try {
    const busesFound = await busesCollection.find({}).toArray();
    if (busesFound.length > 0) {
      totalBuses = busesFound[0].buses.length;
      return;
    }
    let buses = [];
    for (let i = 1; i <= totalBuses; i++) {
      const busNumber = `${i}`;
      buses.push({
        busNumber,
        rows,
        cols,
      });
      // Insert into busCheckCollection
      await busCheckCollection.insertOne({ busNumber, active: true });
    }
    await busesCollection.insertOne({ _id: 1, buses: buses });
    console.log("Initialized buses and inserted into busCheckCollection.");
  } catch (error) {
    console.error("Error initializing buses:", error);
  }
};
// File-based Logging using Buffered Queue
const __fileName = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__fileName);
const logFilePath = path.join(__dirname, "archive.log");
const loggerQueue = [];

const logIntoFile = () => {
  if (loggerQueue.length === 0) return;
  const logMsg = loggerQueue.join("");
  loggerQueue.length = 0;
  fs.appendFile(logFilePath, logMsg, (err) => {
    if (err) {
      console.error("Failed to write log:", err);
    }
  });
};

setInterval(logIntoFile, 3000);

const log = (message) => {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} - ${message}\n`;
  loggerQueue.push(logMessage);
};
const loadFactor = (seats, rows, cols) => {
  return seats / (rows * cols);
};
const loadThreshold = 0.8;

const checkLoad = async () => {
  try {
    const loader = await busBookingsCollection.countDocuments({
      load: { $gte: loadThreshold },
    });
    if (loader >= totalBuses && totalBuses < 100) {
      const busesToAdd = 2;
      for (let i = 0; i < busesToAdd; i++) {
        totalBuses += 1;
        let k = 1;
        let busNumber = `${totalBuses}`;
        const busesAvailable = await busCheckCollection
          .find({})
          .sort({ busNumber: 1 })
          .collation({locale:"en_US", numericOrdering:true})
          .toArray();
        for (let i = 0; i < busesAvailable.length; i++) {
          const obj = busesAvailable[i].busNumber;
          if (`${k}` == obj) {
            k++;
          } else {
            busNumber = `${k}`;
            break;
          }
        }
        await busesCollection.updateOne(
          { _id: 1 },
          {
            $push: {
              buses: {
                $each: [{ busNumber: busNumber, rows: rows, cols: cols }],
                $position: parseInt(busNumber.toString())-1,
              },
            },
          }
        );
        const temp=await busesCollection.find({}).toArray();
        await busCheckCollection.insertOne({ busNumber, active: true });
      }
      log("Buses added and updated.");
      return true;
    }
    return false;
  } catch (error) {
    console.error("Error in checkLoad:", error);
    return false;
  }
};
const bookingsCheck = (bookArr1, bookArr2) => {
  let i = 0,
    j = 0;
  const n1 = bookArr1.length,
    n2 = bookArr2.length;

  while (i < n1 && j < n2) {
    if (bookArr1[i] < bookArr2[j]) {
      i++;
    } else if (bookArr1[i] > bookArr2[j]) {
      j++;
    } else {
      return false; // Conflict found
    }
  }
  return true; // No conflict
};

const merge = async (bus1, bus2) => {
  try {
    // Fetch seat statuses for both buses
    const bus1Status = await seatStatusCollection.findOne({ busNumber: bus1 });
    const bus2Status = await seatStatusCollection.findOne({ busNumber: bus2 });

    if (!bus1Status || !bus2Status) {
      log(`One of the buses ${bus1} or ${bus2} does not exist.`);
      return false;
    }

    // Merge seat statuses
    for (let seat in bus2Status.seats) {
      const doc = bus2Status.seats[seat];
      seatStatusCollection.updateOne(
        { busNumber: bus1 },
        { $set: { [`seats.${seat}`]: doc } }
      );
      // bus1Status.seats[seat] = bus2Status.seats[seat];

      // Update userStatus accordingly
      const username = bus2Status.seats[seat].uname;
      if (username) {
        await userStatusCollection.updateOne(
          { username },
          { $set: { "bookings.$[elem].busNumber": bus1 } },
          { arrayFilters: [{ "elem.busNumber": bus2 }], multi: true }
        );
      }
    }

    // Update busBookings
    const bus1Booking = await busBookingsCollection.findOne({
      busNumber: bus1,
    });
    const bus2Booking = await busBookingsCollection.findOne({
      busNumber: bus2,
    });

    if (bus1Booking && bus2Booking) {
      const updatedSeats = bus1Booking.seats + bus2Booking.seats;
      const updatedLoad = loadFactor(updatedSeats, rows, cols);
      await busBookingsCollection.updateOne(
        { busNumber: bus1 },
        { $set: { seats: updatedSeats, load: updatedLoad } }
      );

      // Delete bus2 entries
      await seatStatusCollection.deleteOne({ busNumber: bus2 });
      await busBookingsCollection.deleteOne({ busNumber: bus2 });
      await busCheckCollection.deleteOne({ busNumber: bus2 });

      // Remove from buses array
      busesCollection.updateOne(
        { _id: 1 },
        {
          $pull: {
            buses: { busNumber: bus2 },
          },
        }
      );
      totalBuses -= 1;

      log(`Merged ${bus2} into ${bus1}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error("Error merging buses:", error);
    return false;
  }
};

const mergers = async () => {
  try {
    log("Checking for possible mergers.");
    const possibleBuses = await busBookingsCollection
      .find({ load: { $lte: 0.2 } })
      .toArray();
    const possibleBusDetails = [];

    for (let bus of possibleBuses) {
      const busNo = bus.busNumber;
      const seatStatus = await seatStatusCollection.findOne({
        busNumber: busNo,
      });
      const bookedSeats = Object.keys(seatStatus.seats).filter(
        (seat) => seatStatus.seats[seat].stat === "booked"
      );
      bookedSeats.sort();
      possibleBusDetails.push({ busNo, seats: bookedSeats });
    }

    const possibleMergers = {};
    const bookingsCount = possibleBusDetails.length;

    for (let i = 0; i < bookingsCount; i++) {
      for (let j = i + 1; j < bookingsCount; j++) {
        if (
          bookingsCheck(
            possibleBusDetails[i].seats,
            possibleBusDetails[j].seats
          )
        ) {
          if (!possibleMergers[possibleBusDetails[i].busNo]) {
            possibleMergers[possibleBusDetails[i].busNo] = [];
          }
          possibleMergers[possibleBusDetails[i].busNo].push(
            possibleBusDetails[j].busNo
          );
        }
      }
    }

    return possibleMergers;
  } catch (error) {
    console.error("Error in mergers function:", error);
    return {};
  }
};
// Initialize MongoDB and Start Server
initializeMongoDB().then(() => {
  // ********** SERVER SETUP **********

  const app = express();
  app.use(cors());
  const server = createServer(app);

  const io = new Server(server, {
    cors: {
      origin: "*",
    },
  });

  app.get("/", (req, res) => {
    res.send("Server is running.");
  });

  // ********** SOCKET EVENTS **********

  io.on("connection", (socket) => {
    console.log("Client Connected:", socket.id);
    log("Client Connected.");

    // Emit seatStatus on connection
    const emitSeatStatus = async () => {
      try {
        const allSeatStatusesArray = await seatStatusCollection
          .find({})
          .toArray();
        const allSeatStatuses = {};
        allSeatStatusesArray.forEach((bus) => {
          allSeatStatuses[bus.busNumber] = bus.seats;
        });

        io.emit("seatStatus", allSeatStatuses);
        log("Emitted Seat Status on connection.");
      } catch (error) {
        console.error("Error emitting seatStatus:", error);
      }
    };

    emitSeatStatus();

    // Handle cancelBooking
    socket.on("cancelBooking", async (data) => {
      const { bno, sno, uname } = data;
      log(
        `Cancel Booking Started for User: ${uname}, BusNo: ${bno}, SeatNo: ${sno}`
      );

      try {
        // Update userStatus
        await userStatusCollection.updateOne(
          { username: uname },
          {
            $pull: {
              bookings: {
                busNumber: bno,
                seatNumber: sno,
                bookingStatus: "booked",
              },
            },
          }
        );

        // Update busBookings
        const busStats = await busBookingsCollection
          .find({
            busNumber: bno,
          })
          .toArray();
        const seats = busStats.length > 0 ? busStats[0].seats : 0;
        await busBookingsCollection.updateOne(
          { busNumber: bno },
          {
            $inc: { seats: -1 },
            $set: { load: loadFactor(seats - 1, rows, cols) },
          },
          { upsert: true }
        );

        // Update seatStatus
        await seatStatusCollection.updateOne(
          { busNumber: bno },
          { $unset: { [`seats.${sno}`]: "" } }
        );

        log(
          `Cancel Booking Completed for User: ${uname}, BusNo: ${bno}, SeatNo: ${sno}`
        );

        // Emit updated statuses
        emitSeatStatus();
        const updatedUserStatus = await userStatusCollection.findOne({
          username: uname,
        });
        socket.emit("userStatus", { uname, ustat: updatedUserStatus });
        log("Emitted updated User Status after Cancel Booking.");

        // Check and add buses if necessary
        if (await checkLoad()) {
          const updatedBuses = await busCheckCollection
            .find({ active: true })
            .toArray();
          io.emit("busStats", updatedBuses);
          log("Emitted Bus Stats after Bus Addition.");
        }
      } catch (error) {
        console.error("Error in cancelBooking:", error);
      }
    });

    // Handle freeBooking
    socket.on("freeBooking", async (data) => {
      const { bno, sno, uname } = data;
      log(`Free Booking Started for BusNo: ${bno}, SeatNo: ${sno}`);

      try {
        // Update userStatus
        await userStatusCollection.updateOne(
          { username: uname },
          { $pull: { bookings: { busNumber: bno, seatNumber: sno } } }
        );

        // Update seatStatus
        await seatStatusCollection.updateOne(
          { busNumber: bno },
          { $unset: { [`seats.${sno}`]: "" } }
        );

        log(`Free Booking Completed for BusNo: ${bno}, SeatNo: ${sno}`);

        // Emit updated statuses
        emitSeatStatus();
        const updatedUserStatus = await userStatusCollection.findOne({
          username: uname,
        });
        socket.emit("userStatus", { uname, ustat: updatedUserStatus });
        log("Emitted updated User Status after Free Booking.");
      } catch (error) {
        console.error("Error in freeBooking:", error);
      }
    });

    // Handle bookSeat
    socket.on("bookSeat", async (data) => {
      const { stat, uname } = data;
      log(`Book Seat started for User: ${uname}`);
      try {
        for (let booking of stat) {
          const {
            busNumber: bno,
            seatNumber: sno,
            bookingStatus: bookingStatus,
          } = booking;
          if (bookingStatus === "booked") continue;
          log(`Booking Seat for BusNo: ${bno}, SeatNo: ${sno}`);

          // delete
          // Update seatStatus
          await seatStatusCollection.updateOne(
            { busNumber: bno },
            { $set: { [`seats.${sno}`]: { stat: "booked", uname } } }
          );
          // Update userStatus
          await userStatusCollection.updateOne(
            { username: uname },
            {
              $pull: {
                bookings: {
                  busNumber: bno,
                  seatNumber: sno,
                  bookingStatus: "locked",
                },
              },
            }
          );

          await userStatusCollection.updateOne(
            { username: uname },
            {
              $push: {
                bookings: {
                  busNumber: bno,
                  seatNumber: sno,
                  bookingStatus: "booked",
                },
              },
            }
          );
          // Update busBookings
          const busStats = await busBookingsCollection
            .find({
              busNumber: bno,
            })
            .toArray();
          const seats = busStats.length > 0 ? busStats[0].seats : 0;
          await busBookingsCollection.updateOne(
            { busNumber: bno },
            {
              $inc: { seats: 1 },
              $set: { load: loadFactor(seats + 1, rows, cols) },
            },
            { upsert: true }
          );

          log(`Booked Seat for BusNo: ${bno}, SeatNo: ${sno}`);
        }
        // Emit updated statuses
        emitSeatStatus();
        const updatedUserStatus = await userStatusCollection.findOne({
          username: uname,
        });
        socket.emit("userStatus", { uname, ustat: updatedUserStatus });
        log("Emitted updated User Status after Book Seat.");

        // Check and add buses if necessary
        if (await checkLoad()) {
          const updatedBuses = await busCheckCollection
            .find({ active: true })
            .toArray();
          io.emit("busStats", updatedBuses);
          log("Emitted Bus Stats after Bus Addition.");
        }
      } catch (error) {
        console.error("Error in bookSeat:", error);
      }
    });

    // Handle lockSeat
    socket.on("lockSeat", async (username, busNumber, seatNumber) => {
      log(
        `Lock Seat started for User: ${username}, BusNo: ${busNumber}, SeatNo: ${seatNumber}`
      );
      try {
        // Check if bus is active
        const busActive = await busCheckCollection.findOne({
          busNumber,
          active: true,
        });
        if (!busActive) {
          log(`Bus ${busNumber} is not active.`);
          return;
        }

        // Update seatStatus
        await seatStatusCollection.updateOne(
          { busNumber, [`seats.${seatNumber}`]: { $exists: false } },
          {
            $set: {
              [`seats.${seatNumber}`]: { stat: "locked", uname: username },
            },
          },
          { upsert: true }
        );

        // Update userStatus
        await userStatusCollection.updateOne(
          { username },
          {
            $push: {
              bookings: { busNumber, seatNumber, bookingStatus: "locked" },
            },
          },
          { upsert: true }
        );

        log(
          `Locked Seat for User: ${username}, BusNo: ${busNumber}, SeatNo: ${seatNumber}`
        );

        // Emit updated statuses
        emitSeatStatus();
        const updatedUserStatus = await userStatusCollection.findOne({
          username,
        });
        socket.emit("userStatus", {
          uname: username,
          ustat: updatedUserStatus,
        });
        log("Emitted updated User Status after Lock Seat.");

        // Set a timer to automatically free the seat after 10 seconds
        setTimeout(async () => {
          const seat = await seatStatusCollection.findOne({
            busNumber,
            [`seats.${seatNumber}.stat`]: "locked",
          });
          if (seat) {
            // Emit triggerFree event
            socket.emit("triggerFree", {
              bno: busNumber,
              sno: seatNumber,
              uname: username,
            });

            // Free the seat
            await seatStatusCollection.updateOne(
              { busNumber },
              { $unset: { [`seats.${seatNumber}`]: "" } }
            );

            // Update userStatus
            await userStatusCollection.updateOne(
              { username },
              { $pull: { bookings: { busNumber, seatNumber } } }
            );

            // Emit updated statuses
            emitSeatStatus();
            const updatedUserStatusAfterFree =
              await userStatusCollection.findOne({ username });
            socket.emit("userStatus", {
              uname: username,
              ustat: updatedUserStatusAfterFree,
            });
            log(
              `Automatically freed SeatNo: ${seatNumber} on BusNo: ${busNumber} for User: ${username}`
            );
          }
        }, 10000); // 10 seconds
      } catch (error) {
        console.error("Error in lockSeat:", error);
      }
    });

    // Handle reqSeatStat
    socket.on("reqSeatStat", async (username) => {
      log("Seat Status Requested.");
      try {
        const allBusesArray = await busCheckCollection
          .find({ active: true })
          .toArray();
        let allBuses = {};
        allBusesArray.forEach((bus) => {
          allBuses[bus.busNumber] = true;
        });
        const user = await userStatusCollection.findOne({ username });
        const buses = await busesCollection.findOne({});
        socket.emit("busStats", buses.buses);
        log("Emitted Bus Stats.");

        emitSeatStatus();

        socket.emit("busesAvailable", allBuses);
        log("Emitted Buses Available.");

        socket.emit("userStatus", { uname: username, ustat: user });
        log("Emitted User Status.");
      } catch (error) {
        console.error("Error in reqSeatStat:", error);
      }
    });

    // Handle merging related events
    let mergerFlag = false;

    socket.on("initialStatus", () => {
      log(`Initial Status of Merger: ${mergerFlag}`);
      if (mergerFlag) {
        socket.emit("mergerOn");
      } else {
        socket.emit("mergerOff");
      }
    });

    socket.on("mergeStart", async () => {
      mergerFlag = true;
      const possibleBus = await mergers();
      io.emit("mergerOn", possibleBus);
      log("Entering Merger.");
    });

    socket.on("merge", async (data) => {
      const { bus1, bus2 } = data;
      log(`Merger Request for ${bus1} and ${bus2}`);

      const mergerStatus = await merge(bus1, bus2);
      if (mergerStatus) {
        const updatedBuses = await busCheckCollection
          .find({ active: true })
          .toArray();
        io.emit("busesAvailable", updatedBuses);
        const buses = await busesCollection.find({});
        io.emit("busStats", buses.buses);
        const possibleBus = await mergers();
        io.emit("mergerOn", possibleBus);
      }
      log("Merger Request Handled.");
    });

    socket.on("mergeFinished", () => {
      mergerFlag = false;
      io.emit("mergerOff");
      log("Exiting Merger.");
    });

    // Handle disconnect
    socket.on("disconnect", () => {
      log("Client Disconnected.");
      console.log("Client Disconnected:", socket.id);
    });
  });

  // Start the Server
  const port = 8000;
  server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    log(`Server started on port ${port}`);
  });
});
