"use client";

import { io } from "socket.io-client";
import Row from "./row";
import { useEffect, useState } from "react";

const socket=io("http://localhost:8000");

const Bus=({busNo,rows,cols})=>{
    return (
        <div className=" border-4 border-blue-300 rounded-lg w-fit">
            {[...Array(rows)].map((_,ind)=>(
                <Row key={ind} busNo={busNo} cols={cols} rowNo={ind}></Row>
            ))}
        </div>
    )
};

export default Bus;