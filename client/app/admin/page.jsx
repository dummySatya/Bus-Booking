"use client";

import { useEffect, useState } from "react";
import { io } from "socket.io-client";

const socket = io("http://localhost:8000");

const Admin = () => {
  const [mergeStatus, setMergeStatus] = useState(true);
  const [possibleMergerBus, setPossibleMergerBus] = useState({});

  const handleClick = () => {
    setMergeStatus((prevStatus) => !prevStatus);
  };

  useEffect(() => {
    console.log("Merge Changed1", mergeStatus);
    if (mergeStatus) {
      socket.emit("mergeStart");
      console.log("Emitted start");
    } else {
      socket.emit("mergeFinished");
      console.log("Emitted finish");
    }
    console.log("Merge Changed2", mergeStatus);
  }, [mergeStatus]);

  useEffect(() => {
    socket.on("mergerOn", (possibleBusSoc) => {
      if (possibleBusSoc) {
        setPossibleMergerBus(possibleBusSoc);
      }
    });

    return () => {
      socket.off("mergerOn");
    };
  }, []);

  const handleMerge=(bus1,bus2)=>{
    console.log("Merge",bus1,bus2);
    socket.emit("merge",{bus1:bus1,bus2:bus2});
    socket.on("mergeOn",(possibleBusSoc)=>{
      if(possibleBusSoc){
        setPossibleMergerBus(possibleBusSoc)
      }
    })
  }

  return (
    <>
      <div className="text-center text-3xl m-2">Bus Bookings</div>
      <div className="text-center text-xl flex flex-col items-center m-3">
        Welcome Admin!
        <button
          onClick={handleClick}
          className="border text-lg m-2 text-white p-1 w-36 rounded-lg bg-red-400"
        >
          {mergeStatus ? <>Finish Merge</> : <>Start Merging</>}
        </button>
        {mergeStatus && Object.keys(possibleMergerBus).length > 0 && (
          <table className="table border">
            <tbody>
                <tr className="border">
                    <th className="p-2">Bus 1</th>
                    <th className="p-2">Bus 2</th>
                    <th className="p-2">Operation</th>
                </tr>
                {Object.keys(possibleMergerBus).map((bus1, i) =>
                possibleMergerBus[bus1].map((bus2, j) => (
                    <tr key={`${bus1}-${bus2}`} className="border hover:bg-green-50">
                        <td className="p-2">{bus1}</td>
                        <td className="p-2">{bus2}</td>
                        <td className="p-2">
                            <button onClick={()=>handleMerge(bus1,bus2)} className="bg-green-600 p-1 rounded text-sm">Merge</button>
                        </td>
                    </tr>
                ))
                )}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
};

export default Admin;
