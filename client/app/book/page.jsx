"use client";

import Bus from "@/components/bus";
import { useEffect, useState } from "react";
import { io } from "socket.io-client";

const socket = io("http://localhost:8000");

const Book = () => {
  let busNo = 10;
  const [username, setUsername] = useState("");
  const [userStatus, setUserStatus] = useState([]);
  const [seatStatus, setSeatStatus] = useState({});

  useEffect(() => {
    const storedUsername = localStorage.getItem("username");
    if (storedUsername) {
      setUsername(storedUsername);
    }
  }, []);

  useEffect(() => {
    if (username) {
      socket.emit("reqSeatStat", username);

      socket.on("userStatus", (data) => {
        const uname = data.uname;
        if (uname === username) {
          const userStatusSoc = data.ustat;
          console.log("User status: ", userStatusSoc);
          setUserStatus(userStatusSoc);
        }
      });

      socket.on("seatStatus", (seatStatusSoc) => {
        setSeatStatus(seatStatusSoc);
      });

      return () => {
        socket.off("userStatus");
        socket.off("seatStatus");
      };
    }
  }, [username]);

  const handleClick = () => {
    socket.emit("bookSeat", { stat: userStatus, uname: username });
  };

  const handleCancel = (bno, sno) => {
    socket.emit("cancelBooking", { bno: bno, sno: sno, uname: username });
  };

  const handleFree = (bno, sno) => {
    socket.emit("freeBooking", { bno: bno, sno: sno, uname: username });
  };

  return (
    <>
      <div className="text-center text-3xl m-2">Bus Bookings</div>
      <div className="text-center text-xl flex flex-col items-center m-3">
        Welcome {username}!
        <button
          onClick={handleClick}
          className="border text-lg m-2 text-white p-1 w-36 rounded-lg bg-red-400"
        >
          Book Tickets
        </button>
        <details>
          <summary>View My Tickets</summary>
          <table className="table border">
            <tbody>
              <tr className="border">
                <th className="p-2">Bus No.</th>
                <th className="p-2">Seat No.</th>
                <th className="p-2">Status</th>
                <th className="p-2">Action</th>
              </tr>
              {userStatus &&
                userStatus.map((tickets, ind) => (
                  <tr key={ind} className="border hover:bg-green-50">
                    <td>{tickets["busNumber"]}</td>
                    <td>{tickets["seatNumber"]}</td>
                    <td>{tickets["bookingStatus"]}</td>
                    <td>
                      {tickets["bookingStatus"] === "booked" ? (
                        <button
                          onClick={() =>
                            handleCancel(
                              tickets["busNumber"],
                              tickets["seatNumber"]
                            )
                          }
                          className="border bg-orange-500 w-16 m-1 text-xs p-1"
                        >
                          Cancel
                        </button>
                      ) : (
                        <button
                          onClick={() =>
                            handleFree(
                              tickets["busNumber"],
                              tickets["seatNumber"]
                            )
                          }
                          className="border w-16 m-1 bg-blue-500 text-xs p-1"
                        >
                          Free
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </details>
      </div>
      <div className="flex flex-wrap gap-5 m-2 justify-center">
        {[...Array(busNo)].map((_, ind) => (
          <Bus key={ind} busNo={ind + 1} rows={15} cols={5}></Bus>
        ))}
      </div>
    </>
  );
};

export default Book;
