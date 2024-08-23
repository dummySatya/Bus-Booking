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

    socket.on("lockSeat",(busNumber,seatNumber)=>{
        if(!seatStatus[busNumber]){
            seatStatus[busNumber]={};
        }
        seatStatus[busNumber][seatNumber]="locked";
        io.emit("seatStatus",seatStatus)
        console.log("Stat: ",seatStatus);
    });
    socket.on("reqSeatStat",()=>{
        socket.emit("seatStatus",seatStatus);
    })
    socket.on("disconnect",()=>{
        console.log("User left");
    })
});

const port=8000;
server.listen(port,()=>{
    console.log("Server running on "+port);
})