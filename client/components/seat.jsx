import { useEffect, useState } from "react";
import { io } from "socket.io-client";

const socket = io("http://localhost:8000");

const Seat = ({ seatNo, busNo }) => {
  const [seatStatus, setSeatStatus] = useState({});
  const [username, setUsername] = useState("");

  useEffect(() => {
    const storedUsername = localStorage.getItem("username");
    if (storedUsername) {
      setUsername(storedUsername);
    }
  }, []);

  useEffect(() => {
    socket.on("seatStatus", (seatStatusUp) => {
      setSeatStatus(seatStatusUp);
    });

    socket.emit("reqSeatStat",username);

    return () => {
      socket.off("seatStatus");
    };
  }, []);

  const seatColor = () => {
    if (seatStatus[busNo]) {
      const stat = seatStatus[busNo][seatNo];
      console.log(stat);

      switch (stat) {
        case "booked":
          return "cursor-not-allowed bg-red-500";
        case "locked":
          return "cursor-progress bg-yellow-500";
        default:
          return "bg-slate-200 cursor-pointer";
      }
    }
    return "bg-slate-200 cursor-pointer";
  };

  const handleClick = () => {
    console.log(seatNo + " " + busNo);
    if (!seatStatus[busNo] || !seatStatus[busNo][seatNo]) {
      socket.emit("lockSeat", username, busNo, seatNo);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`text-center text-sm border-1 w-5 h-5 rounded ${seatColor()}`}
    >
      {seatNo}
    </div>
  );
};

export default Seat;
