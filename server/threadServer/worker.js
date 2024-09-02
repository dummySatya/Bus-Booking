import { parentPort, workerData } from "worker_threads";

let { clientId, serverStatus } = workerData;
let [
  seatStatus,
  userStatus,
  buses,
  totalBuses,
  rows,
  cols,
  busCheck,
  busBookings,
  mergerFlag,
] = serverStatus;

const logWithTimestamp = (message) => {
    console.log(`[${new Date().toISOString()}] ${message}`);
};
logWithTimestamp("FIRST CALL*****************************")
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
    console.log("Buses After Sort: ", buses);
    console.log("Bus Check: ", busCheck);
    return true;
  }
  return false;
};
const updateData = () => {
  return [
    seatStatus,
    userStatus,
    buses,
    totalBuses,
    rows,
    cols,
    busCheck,
    busBookings,
    mergerFlag,
  ];
};
parentPort.on("message", ({ eventName, data }) => {
    let isUpdating=false; 
    console.log("data: ",data);
    console.log([
        seatStatus,
        userStatus,
        buses,
        totalBuses,
        rows,
        cols,
        busCheck,
        busBookings,
        mergerFlag,
      ]);
    console.log(eventName," SEAT IN THIS EVENT: ",seatStatus);
  if (eventName === "reqSeatStat") {
    const [username] = data;
    parentPort.postMessage({ eventName: "busStats", data: buses });
    parentPort.postMessage({ eventName: "seatStatus", data: seatStatus });
    parentPort.postMessage({ eventName: "busesAvailable", data: busCheck });
    parentPort.postMessage({
      eventName: "userStatus",
      data: { uname: username, ustat: userStatus[username] },
    });
  } else if (eventName === "serverStatus") {
    // console.log("Recieved data: ",data);
    if(isUpdating){
        console.log("Race condn");
    }

    isUpdating=true;
    logWithTimestamp("Before Server status");
    [
      seatStatus,
      userStatus,
      buses,
      totalBuses,
      rows,
      cols,
      busCheck,
      busBookings,
      mergerFlag,
    ] = data;
    console.log("seat stat after server stat: ",seatStatus);
    logWithTimestamp("After server status");
    isUpdating=false;
  }
  else if (eventName === "bookSeat") {
    if(!isUpdating){ 
        isUpdating=true;
        logWithTimestamp("inside book");
        console.log("INSIDE BOOK: ",seatStatus);
        console.log("userstats: ",userStatus);
        const dataObj = data[0];
        console.log("Data: ",dataObj);
        const userStatusSoc = dataObj.stat;
        const username = dataObj.uname;
        console.log("HHH");
        console.log("Userstatussoc: ",userStatusSoc);
        let mutexCount=0;
        for (let i = 0; userStatusSoc && i < userStatusSoc.length; i++) {
          let bno = userStatusSoc[i]["busNumber"];
          let sno = userStatusSoc[i]["seatNumber"];
          for (let j = 0;userStatus[username] && j < userStatus[username].length; j++) {
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
              parentPort.postMessage({eventName:"deleteTimer",data:{bno:bno,sno:sno}});
              busBookings[bno].seats++;
              busBookings[bno].load = loadFactor(busBookings[bno].seats);
              mutexCount++;
              break;
            }
          }
          logWithTimestamp("seat stat inisde bok");
          console.log("Seat stat inside book: ",seatStatus);
        //   seatStatus[bno][sno] = { stat: "booked", uname: username, timer: null }; 
        }
        if(mutexCount==userStatusSoc.length-1){
            console.log("User Stats: ", userStatus);
            parentPort.postMessage({eventName:"seatStatus1", data:seatStatus});
            parentPort.postMessage({eventName:"userStatus1", data:{ uname: username, ustat: userStatus[username] }});
            if (checkLoad() && totalBuses <= 100) {
              console.log("Emiting");
              parentPort.postMessage({eventName:"busStats",data: buses});
            }
        }
        isUpdating=false;
    }
    else{
        console.log("Race inside book seat");
    }
  }
  console.log(eventName," SEAT AFTER THIS EVENT: ",seatStatus);
});
