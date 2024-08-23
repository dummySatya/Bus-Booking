import Row from "./row";
const Bus=({busNo})=>{
    return (
        <div className=" border-4 border-blue-300 rounded-lg w-fit">
            {[...Array(15)].map((_,ind)=>(
                <Row key={ind} busNo={busNo} rowNo={ind}></Row>
            ))}
        </div>
    )
};

export default Bus;