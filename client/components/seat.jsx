import { useEffect, useState } from "react";
import { io } from "socket.io-client";

const socket = io("http://localhost:8000");

const Seat = ({ seatNo, busNo }) => {
  const [seatStatus, setSeatStatus] = useState({});

  useEffect(() => {
    socket.emit("reqSeatStat");
    socket.on("seatStatus", (seatStatusUp) => {
      setSeatStatus(seatStatusUp);
    });
    return () => {
      socket.off("seatStatus");
    };
  }, []);
  const seatColor = () => {
    if (seatStatus[busNo]) {
      const stat = seatStatus[busNo][seatNo];
      switch (stat) {
        case "booked":
          return "bg-red-500";
        case "locked":
          return "bg-yellow-500";
      }
    }
  };
  const handleClick = () => {
    console.log(seatNo + " " + busNo);
    socket.emit("lockSeat", busNo, seatNo);
  };
  return (
    <div
      onClick={handleClick}
      className={`text-center text-sm border-1 bg-slate-200 w-5 h-5 rounded ${seatColor()}`}
    >
      {seatNo}
    </div>
  );
};

export default Seat;
