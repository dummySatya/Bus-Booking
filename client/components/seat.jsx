import { useEffect, useState } from "react";
import { io } from "socket.io-client";

const socket = io("http://localhost:8000");

const Seat = ({ seatNo, busNo }) => {
  const [seatStatus, setSeatStatus] = useState({});
  const [username, setUsername] = useState("");
  const [buses,setBuses]=useState({});
  useEffect(() => {
    const storedUsername = localStorage.getItem("username");
    if (storedUsername) {
      setUsername(storedUsername);
    }
  }, []);

  useEffect(() => {
    if (username) {
      socket.emit("reqSeatStat", username);
    }
  }, [username]);

  useEffect(()=>{
    socket.on("busesAvailable",(data)=>{
      setBuses(data);
    })
  })
  
  useEffect(() => {
    const handleSeatStatusUpdate = (seatStatusUp) => {
      setSeatStatus({ ...seatStatusUp });
    };

    socket.on("seatStatus", handleSeatStatusUpdate);

    return () => {
      socket.off("seatStatus", handleSeatStatusUpdate);
    };
  }, []);

  const seatColor = () => {
    if (seatStatus[busNo] && seatStatus[busNo][seatNo]) {
      const stat = seatStatus[busNo][seatNo].stat;
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
    if (buses[busNo]) {
      socket.emit("lockSeat", username, busNo, seatNo);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`text-center text-sm border-1 w-5 h-5 rounded ${seatColor()}`}
      key={`${busNo}-${seatNo}-${seatStatus[busNo]?.[seatNo]?.stat}`}
    >
      {seatNo}
    </div>
  );
};

export default Seat;
