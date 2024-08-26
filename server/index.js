import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());
const server = createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

let seatStatus = {};
let userStatus = {};

app.get("/", (req, res) => {
    res.send("Server on");
});

io.on("connection", (socket) => {
    console.log("Client Connected");

    socket.emit("seatStatus", seatStatus);

    socket.on("cancelBooking",(data)=>{
        const bno=data.bno;
        const sno=data.sno;
        const username=data.uname;
        for(let j=0;j<userStatus[username].length;j++){
            if(userStatus[username][j]["busNumber"]===bno && userStatus[username][j]["seatNumber"]===sno){
                userStatus[username].splice(j,1);
                break;
            }
        }
        seatStatus[bno][sno]=null;
        console.log("After Cancel Booking ",seatStatus);
        console.log("After Cancel Booking User: ",userStatus[username]);
        socket.emit("seatStatus",seatStatus);
        socket.emit("userStatus",userStatus[username]);
    })

    socket.on("bookSeat", (data) => {
        const userStatusSoc=data.stat;
        const username=data.uname;
        console.log("StatServ: ",userStatusSoc);
        for(let i=0;i<userStatusSoc.length;i++){
            let bno=userStatusSoc[i]["busNumber"];
            let sno=userStatusSoc[i]["seatNumber"];
            for(let j=0;j<userStatus[username].length;j++){
                if(userStatus[username][j]["busNumber"]===bno && userStatus[username][j]["seatNumber"]===sno){
                    userStatus[username][j]["bookingStatus"]="booked";
                    break;
                }
            }
            seatStatus[bno][sno]="booked";
        }
        console.log("After Book: ",userStatus[username]);
        io.emit("seatStatus",seatStatus);
        io.emit("userStatus",userStatus[username])
    });

    socket.on("lockSeat", (username, busNumber, seatNumber) => {
        if (!seatStatus[busNumber]) {
            seatStatus[busNumber] = {};
        }
        seatStatus[busNumber][seatNumber] = "locked";
        const detail = {
            busNumber,
            seatNumber,
            bookingStatus: "locked"
        };
        if (!userStatus[username]) {
            userStatus[username] = []
        }
        userStatus[username].push(detail);
        io.emit("seatStatus", seatStatus);
        io.emit("userStatus", userStatus[username]);
        console.log("SeatStat: ", seatStatus);
        console.log("UserStat: ", userStatus);
    });

    socket.on("reqSeatStat", (username) => {
        console.log("Name ", username);
        socket.emit("seatStatus", seatStatus);
        socket.emit("userStatus", userStatus[username]||[]);
    });

    socket.on("disconnect", () => {
        console.log("User left");
    });
});

const port = 8000;
server.listen(port, () => {
    console.log("Server running on " + port);
});
