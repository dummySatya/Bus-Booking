"use client";

import Bus from "@/components/bus";
import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import socket from "@/utils/socket";

const Book = () => {
  const [mergerStatus,setMergerStatus]=useState(false);
  const [buses, setBuses] = useState([]);

  const [username, setUsername] = useState("");
  const [userStatus, setUserStatus] = useState([]);
  const [seatStatus, setSeatStatus] = useState({});

  useEffect(() => {
    const storedUsername = localStorage.getItem("username");
    if (storedUsername) {
      setUsername(storedUsername);
    }
  }, []);
  useEffect(()=>{
    socket.emit("initialStatus");
    socket.on("mergerOn",()=>{
      setMergerStatus(true);
    });
    socket.on("mergerOff",()=>{
      setMergerStatus(false);
      socket.emit("reqSeatStat", username);
    });

    return (()=>{
      socket.off("mergerOn");
      socket.off("mergerOff");
    })
  },[mergerStatus])
  useEffect(() => {
    socket.on("busStats", (data) => {
      setBuses(data);
    });
    console.log("Recieved: ",buses);
    return () => {
      socket.off("busStats");
    };
  }, [buses]);
  useEffect(() => {
    if (username) {
      socket.emit("reqSeatStat", username);

      socket.on("userStatus", (data) => {
        console.log("User stats: ",data);
        const uname = data.uname;
        if (uname === username && data && data.ustat) {
          const userStatusSoc = data.ustat.bookings;
          setUserStatus(userStatusSoc);
        }
      });

      socket.on("seatStatus", (seatStatusSoc) => {
        console.log(seatStatusSoc);
        setSeatStatus({ ...seatStatusSoc });
      });

      return () => {
        socket.off("userStatus");
        socket.off("seatStatus");
      };
    }
  }, [username]);
  useEffect(() => {
    socket.on("triggerFree", (data) => {
      socket.emit("freeBooking", data);
    });
    return () => {
      socket.off("triggerFree");
    };
  });
  const handleClick = () => {
    console.log("Book: ",userStatus);
    socket.emit("bookSeat", { stat: userStatus, uname: username });
  };

  const handleCancel = (bno, sno) => {
    socket.emit("cancelBooking", { bno: bno, sno: sno, uname: username });
    socket.emit("reqSeatStat", username);
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
          disabled={mergerStatus}
          onClick={handleClick}
          className={`border ${mergerStatus?"opacity-20":null} text-lg m-2 text-white p-1 w-36 rounded-lg bg-red-400`}
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
                        disabled={mergerStatus}
                          onClick={() =>
                            handleCancel(
                              tickets["busNumber"],
                              tickets["seatNumber"]
                            )
                          }
                          className={`border ${mergerStatus?"opacity-20":null} bg-orange-500 w-16 m-1 text-xs p-1`}
                        >
                          Cancel
                        </button>
                      ) : (
                        <button
                        disabled={mergerStatus}
                          onClick={() =>
                            handleFree(
                              tickets["busNumber"],
                              tickets["seatNumber"]
                            )
                          }
                          className={`border ${mergerStatus?"opacity-20":null} w-16 m-1 bg-blue-500 text-xs p-1`}
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
        {mergerStatus?
          <div className="text-4xl text-red-800">Bus alteration in process</div>:
          null
        }
        {!mergerStatus && buses && buses.map((bus, ind) => (
          <Bus key={ind} busNo={bus.busNumber} rows={bus.rows} cols={bus.cols}></Bus>
        ))}
      </div>
    </>
  );
};

export default Book;
