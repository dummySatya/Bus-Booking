"use client";

import Row from "./row";

const Bus = ({ busNo, rows, cols }) => {
  return (
    <div className=" border-4 border-blue-300 rounded-lg w-fit">
      <div className="text-center">BusNo. {busNo}</div>
      {[...Array(rows)].map((_, ind) => (
        <Row key={ind} busNo={busNo} cols={cols} rowNo={ind}></Row>
      ))}
    </div>
  );
};

export default Bus;
