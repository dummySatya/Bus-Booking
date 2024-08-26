import express from "express";
import {createServer} from "http";
import {Server} from "socket.io"
import cors from "cors";

const app=express();
app.use(cors());
const server=createServer(app);

const io=new Server(server,{
    cors:{
        origin:"\*"
    }
});

let seatStatus={};
let userStatus={};

app.get("/",(req,res)=>{
    res.send("Server on");
});

io.on("connection",(socket)=>{
    console.log("Client Connected");

    socket.emit("seatStatus",seatStatus);
    socket.on("bookSeat",({busNumber,seatNumber})=>{
        let status=seatStatus[busNumber][seatNumber]
        if(status!="booked"||status!="locked"){
            seatStatus[busNumber][seatNumber]="booked";
            io.emit("seatStatus",seatStatus);
        }
    });

    socket.on("lockSeat",(username,busNumber,seatNumber)=>{
        if(!seatStatus[busNumber]){
            seatStatus[busNumber]={};
        }
        seatStatus[busNumber][seatNumber]="locked";
        const detail={
            "busNumber":busNumber,
            "seatNumber":seatNumber,
            "status":"locked"
        }
        if(!userStatus[username]){
            userStatus[username]=[];
        }
        userStatus[username].push(detail);
        io.emit("seatStatus",seatStatus,userStatus);
        console.log(userStatus[username]);
        io.emit("userStatus",userStatus[username]);
        console.log("SeatStat: ",seatStatus);
        console.log("UserStat: ",userStatus);
    });
    socket.on("reqSeatStat", (username) => {
        console.log("Name ", username);
        socket.emit("seatStatus", seatStatus);
        socket.emit("userStatus", userStatus[username] || []);
    });
    socket.on("disconnect",()=>{
        console.log("User left");
    })
});

const port=8000;
server.listen(port,()=>{
    console.log("Server running on "+port);
})