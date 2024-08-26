"use client";

import Bus from "@/components/bus";
import { useEffect, useState } from "react";
import { io } from "socket.io-client";

const socket = io("http://localhost:8000");

const Book = () => {
  let busNo = 10;
  const [username, setUsername] = useState("");
  const [userStatus, setUserStatus] = useState([]);

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

  useEffect(() => {
    socket.on("userStatus", (userStatusSoc) => {
      console.log(userStatusSoc);
      setUserStatus(userStatusSoc);
    });

    return () => {
      socket.off("userStatus");
    };
  }, []);
  const handleClick = () => {};
  return (
    <>
      <div className="text-center text-3xl m-2">Bus Bookings</div>
      <div className="text-center text-xl flex flex-col items-center m-3">
        Welcome {username} !
        <button
          onClick={handleClick}
          className="border text-lg m-2 text-white p-1 w-36 rounded-lg bg-red-400"
        >
          Book Tickets
        </button>
        <div>
          {userStatus &&
            userStatus.map((tickets, ind) => (
              <div key={ind} className="flex gap-2">
                <div>Bus No. : {tickets["busNumber"]}</div>
                <div>Seat No. :{tickets["seatNumber"]}</div>
                <div>Status : {tickets["status"]}</div>
              </div>
            ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-5 m-2 justify-center">
        {[...Array(10)].map((_, ind) => (
          <Bus key={ind} busNo={ind + 1} rows={15} cols={5}></Bus>
        ))}
      </div>
    </>
  );
};

export default Book;
